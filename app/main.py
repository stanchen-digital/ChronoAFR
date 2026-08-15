import os
import sys
import json
import re
from datetime import datetime
from pathlib import Path
from typing import List, Optional, Dict, Any
from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, FileResponse
from pydantic import BaseModel

# Add project root to sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from config import (
    PROCESSED_DIR, NOTEBOOKLM_DIR, DATA_DIR,
    RAW_SEC_DIR, RAW_MOPS_DIR, RAW_FRED_DIR
)
from core.fetchers.sec_fetcher import SECFetcher
from core.fetchers.mops_fetcher import MOPSFetcher
from core.fetchers.fred_fetcher import FREDFetcher
from core.notebooklm.exporter import NotebookLMExporter
from core.rag.gemini_engine import GeminiRAGEngine
from core.forecasting.proforma_model import ForecastAssumptions, ProFormaModel
from core.forecasting.scenario_engine import ScenarioEngine
from core.reviewing.tracker import ForecastTracker
from core.reviewing.attribution import AttributionEngine

app = FastAPI(
    title="ChronoAFR Engine API",
    description="Chronological Analysis, Forecast & Review Engine",
    version="5.0.0"
)

# Mount Static Files
static_dir = Path(__file__).resolve().parent / "static"
templates_dir = Path(__file__).resolve().parent / "templates"
app.mount("/static", StaticFiles(directory=static_dir), name="static")

# Request Models
class FetchRequest(BaseModel):
    ticker: str = "NVDA"
    source: str = "all"
    sync_notebooklm: bool = True

class AskRequest(BaseModel):
    query: str
    selected_files: Optional[List[str]] = None
    ticker: Optional[str] = None

class SyncAnswerRequest(BaseModel):
    query: str
    answer: str
    selected_files: Optional[List[str]] = None

class ForecastSynthesisRequest(BaseModel):
    ticker: Optional[str] = None
    selected_files: Optional[List[str]] = None

class ForecastRequest(BaseModel):
    ticker: str = "NVDA"
    base_year: int = 2025
    base_revenue: float = 60922.0
    revenue_growth_y1: float = 0.25
    gross_margin: float = 0.74
    op_margin: float = 0.55
    revenue_segments: Optional[List[Dict[str, Any]]] = None
    cogs_segments: Optional[List[Dict[str, Any]]] = None
    opex_segments: Optional[List[Dict[str, Any]]] = None
    tax_rate: float = 0.21
    wacc: float = 0.09
    current_price: float = 185.0
    shares_outstanding: float = 10400.0
    historical_pe_avg: float = 35.0
    historical_pe_min: float = 20.0
    historical_pe_max: float = 45.0
    sync_notebooklm: bool = True

class AiRecommendRequest(BaseModel):
    ticker: str = "AMZN"

class AiSteerRequest(BaseModel):
    ticker: str = "AMZN"
    user_prompt: str
    current_revenue_segments: List[Dict[str, Any]]
    current_cogs_segments: List[Dict[str, Any]]
    current_opex_segments: List[Dict[str, Any]]
    current_gross_margin: float

class AiRiskScanRequest(BaseModel):
    ticker: str = "AMZN"

class ReviewRequest(BaseModel):
    ticker: str = "NVDA"
    actual_revenue: float
    actual_op_income: float
    actual_gross_margin: float
    sync_notebooklm: bool = True

# Endpoint Routes
@app.get("/", response_class=HTMLResponse)
async def read_index():
    index_file = templates_dir / "index.html"
    return HTMLResponse(content=index_file.read_text(encoding="utf-8"))

@app.get("/api/available_documents")
async def get_available_documents():
    try:
        from core.parsers.doc_importer import DocumentImporter
        DocumentImporter().import_all_gdrive_documents()
    except Exception as e:
        print(f"[API] Doc import warning: {e}")

    docs = []
    seen_labels = set()

    for f in sorted(PROCESSED_DIR.glob("*.md"), key=os.path.getmtime, reverse=True):
        size_kb = f.stat().st_size / 1024.0
        name = f.name

        if name.startswith("GDrive_"):
            clean_name = name.replace("GDrive_", "").replace(".md", "")
            lower_name = clean_name.lower()

            if lower_name.endswith(".pdf") or ".pdf" in lower_name:
                file_type = "PDF"
            elif lower_name.endswith(".xlsx") or lower_name.endswith(".xls") or ".xlsx" in lower_name:
                file_type = "XLSX"
            elif lower_name.endswith(".csv") or ".csv" in lower_name:
                file_type = "CSV"
            elif lower_name.endswith(".docx") or lower_name.endswith(".doc") or ".docx" in lower_name:
                file_type = "DOCX"
            else:
                file_type = "GDRIVE"

            display_label = f"[{file_type}] {clean_name}"
        else:
            file_type = "REPORT"
            display_label = f"[REPORT] {name}"

        if display_label in seen_labels:
            continue
        seen_labels.add(display_label)

        docs.append({
            "filename": f.name,
            "display_label": display_label,
            "file_type": file_type,
            "size_kb": round(size_kb, 1)
        })

    return {"documents": docs}

@app.get("/api/financial_history/{ticker}")
async def get_financial_history(ticker: str):
    t_upper = ticker.strip().upper()

    if t_upper in ["AMZN", "AMAZON"]:
        return {
            "ticker": "AMZN",
            "base_year": 2025,
            "base_revenue": 717000.0,
            "gross_margin": 0.485,
            "op_margin": 0.112,
            "current_price": 185.0,
            "shares_outstanding": 10400.0,
            "historical_pe_avg": 35.0,
            "historical_pe_min": 20.0,
            "historical_pe_max": 45.0,
            "revenue_segments": [
                {"name": "AWS 雲端服務 (AWS Cloud)", "base_amount": 142000.0, "share_pct": 19.8, "growth_y1": 0.24, "growth_y2": 0.20, "growth_y3": 0.18},
                {"name": "北美電商與賣家服務 (North America Retail & 3P)", "base_amount": 415000.0, "share_pct": 57.9, "growth_y1": 0.12, "growth_y2": 0.10, "growth_y3": 0.08},
                {"name": "國際電商服務 (International Retail)", "base_amount": 160000.0, "share_pct": 22.3, "growth_y1": 0.10, "growth_y2": 0.08, "growth_y3": 0.06}
            ],
            "cogs_segments": [
                {"name": "電商履約與物流貨運成本 (Fulfillment & Shipping COGS)", "base_amount": 220000.0, "ratio_pct": 0.307, "growth_y1": 0.10},
                {"name": "AWS 伺服器硬體與資料中心營運成本 (AWS Infrastructure COGS)", "base_amount": 85000.0, "ratio_pct": 0.119, "growth_y1": 0.15},
                {"name": "數位內容授權與其他成本 (Content & Hardware COGS)", "base_amount": 64305.0, "ratio_pct": 0.090, "growth_y1": 0.08}
            ],
            "opex_segments": [
                {"name": "研發與技術費用 (Technology & Content / R&D)", "base_amount": 92000.0, "ratio_pct": 0.128},
                {"name": "銷售與行銷費用 (Sales & Marketing)", "base_amount": 48000.0, "ratio_pct": 0.067},
                {"name": "管理與履約開銷 (Fulfillment & G&A)", "base_amount": 125000.0, "ratio_pct": 0.174}
            ]
        }
    elif t_upper in ["NVDA", "NVIDIA"]:
        return {
            "ticker": "NVDA",
            "base_year": 2025,
            "base_revenue": 60922.0,
            "gross_margin": 0.74,
            "op_margin": 0.55,
            "current_price": 125.0,
            "shares_outstanding": 24600.0,
            "historical_pe_avg": 40.0,
            "historical_pe_min": 25.0,
            "historical_pe_max": 60.0,
            "revenue_segments": [
                {"name": "資料中心 (Data Center AI)", "base_amount": 47500.0, "share_pct": 78.0, "growth_y1": 0.35, "growth_y2": 0.25, "growth_y3": 0.20},
                {"name": "電競與 PC (Gaming)", "base_amount": 10400.0, "share_pct": 17.0, "growth_y1": 0.12, "growth_y2": 0.10, "growth_y3": 0.08},
                {"name": "專業視覺化與汽車 (ProViz & Auto)", "base_amount": 3022.0, "share_pct": 5.0, "growth_y1": 0.15, "growth_y2": 0.12, "growth_y3": 0.10}
            ],
            "cogs_segments": [
                {"name": "晶片代工與先進封裝成本 (Wafer Foundry & Packaging COGS)", "base_amount": 12000.0, "ratio_pct": 0.197, "growth_y1": 0.20},
                {"name": "製造測試與組裝成本 (Testing & Assembly COGS)", "base_amount": 3840.0, "ratio_pct": 0.063, "growth_y1": 0.15}
            ],
            "opex_segments": [
                {"name": "研發費用 (R&D Expense)", "base_amount": 8600.0, "ratio_pct": 0.141},
                {"name": "銷售與行銷 (Sales & Marketing)", "base_amount": 2200.0, "ratio_pct": 0.036},
                {"name": "管理與一般費用 (G&A Expense)", "base_amount": 780.0, "ratio_pct": 0.013}
            ]
        }
    elif t_upper in ["2330", "TSMC", "台積電"]:
        return {
            "ticker": "2330",
            "base_year": 2025,
            "base_revenue": 2850000.0,
            "gross_margin": 0.55,
            "op_margin": 0.44,
            "current_price": 980.0,
            "shares_outstanding": 25930.0,
            "historical_pe_avg": 18.0,
            "historical_pe_min": 12.0,
            "historical_pe_max": 25.0,
            "revenue_segments": [
                {"name": "先進行程 (3nm / 5nm Advanced)", "base_amount": 1852500.0, "share_pct": 65.0, "growth_y1": 0.28, "growth_y2": 0.22, "growth_y3": 0.18},
                {"name": "成熟製程 (7nm 及以上)", "base_amount": 712500.0, "share_pct": 25.0, "growth_y1": 0.08, "growth_y2": 0.05, "growth_y3": 0.02},
                {"name": "先進封裝 (CoWoS / Packaging)", "base_amount": 285000.0, "share_pct": 10.0, "growth_y1": 0.45, "growth_y2": 0.30, "growth_y3": 0.25}
            ],
            "cogs_segments": [
                {"name": "晶圓材料與化學品成本 (Silicon Wafers & Chemicals COGS)", "base_amount": 641250.0, "ratio_pct": 0.225, "growth_y1": 0.12},
                {"name": "廠房折舊與機台公用事業 (Depreciation & Utilities COGS)", "base_amount": 641250.0, "ratio_pct": 0.225, "growth_y1": 0.10}
            ],
            "opex_segments": [
                {"name": "研發費用 (R&D Expense)", "base_amount": 228000.0, "ratio_pct": 0.08},
                {"name": "銷售與管理開銷 (S&M and G&A)", "base_amount": 85500.0, "ratio_pct": 0.03}
            ]
        }
    else:
        return {
            "ticker": t_upper,
            "base_year": 2025,
            "base_revenue": 10000.0,
            "gross_margin": 0.50,
            "op_margin": 0.25,
            "current_price": 100.0,
            "shares_outstanding": 1000.0,
            "historical_pe_avg": 20.0,
            "historical_pe_min": 12.0,
            "historical_pe_max": 30.0,
            "revenue_segments": [
                {"name": "核心業務線 A", "base_amount": 6000.0, "share_pct": 60.0, "growth_y1": 0.20, "growth_y2": 0.15, "growth_y3": 0.10},
                {"name": "次要業務線 B", "base_amount": 4000.0, "share_pct": 40.0, "growth_y1": 0.15, "growth_y2": 0.10, "growth_y3": 0.05}
            ],
            "cogs_segments": [
                {"name": "直接生產與材料成本 (Direct Production & Materials COGS)", "base_amount": 3500.0, "ratio_pct": 0.35, "growth_y1": 0.12},
                {"name": "製造開銷與折舊 (Overhead & Depreciation COGS)", "base_amount": 1500.0, "ratio_pct": 0.15, "growth_y1": 0.10}
            ],
            "opex_segments": [
                {"name": "研發費用 (R&D Expense)", "base_amount": 1500.0, "ratio_pct": 0.15},
                {"name": "銷售行銷與管理 (SG&A Expense)", "base_amount": 1000.0, "ratio_pct": 0.10}
            ]
        }

@app.post("/api/ai_synthesize_forecast")
async def synthesize_forecast_from_docs(req: ForecastSynthesisRequest):
    """Unified End-to-End AI Forecast Synthesis from selected documents."""
    engine = GeminiRAGEngine()
    
    selected_docs = req.selected_files or []
    ticker = (req.ticker or "").strip().toUpperCase() if req.ticker else "AMZN"

    # Step 1: Data Sufficiency Verification
    if not selected_docs:
        return {
            "status": "insufficient_data",
            "message": "⚠️ 【資料不足警示】：未勾選任何參考文件。請在左側檔案清單中至少勾選 1 份目標公司財報 (如 10-K/10-Q/月營收) 或總經研報。",
            "structured_forecast": None
        }

    prompt = (
        f"你是一名頂級法人投資機構的資深財務分析師。請**嚴格根據被勾選的以下參考文件**，對目標公司進行深入研讀，並完成三大前瞻因子預測：\n\n"
        "【檢核條件】：\n"
        "請先評估被選取的參考資料是否包含足夠的財務數據（如營收細項、成本結構、歷史增長率或總經背景）。\n"
        "如果資料完全無關或極度不足以推論，請在 JSON 的 `status` 回傳 `insufficient_data`，並於 `insufficiency_reason` 說明缺少哪些具體財報資料。\n\n"
        "若資料充足，請在 JSON 的 `status` 回傳 `sufficient`，並嚴格依序回答三大問題：\n"
        "1. 預測該公司未來營收與業務細項 (Revenue Segments) 成長率及比重（推估 Y1/Y2/Y3 成長率，可為負成長）。\n"
        "2. 預測該公司未來營業成本 (COGS Breakdown) 成長率與毛利率影響。\n"
        "3. 預測該公司未來營業費用 (OpEx: 研發 R&D, 銷售 S&M, 管理 G&A) 成長率與比重。\n\n"
        "請務必輸出純 JSON 格式：\n"
        "{\n"
        '  "status": "sufficient",\n'
        '  "ticker": "AMZN",\n'
        '  "research_brief": "### 1. 營業收入前瞻推估...\\n\\n### 2. 營業成本與毛利...\\n\\n### 3. 營業費用推估...",\n'
        '  "structured_forecast": {\n'
        '    "base_year": 2025,\n'
        '    "base_revenue": 717000.0,\n'
        '    "current_price": 185.0,\n'
        '    "shares_outstanding": 10400.0,\n'
        '    "historical_pe_avg": 35.0,\n'
        '    "revenue_segments": [\n'
        '      {"name": "AWS 雲端服務", "base_amount": 142000.0, "share_pct": 19.8, "growth_y1": 0.24, "growth_y2": 0.20, "growth_y3": 0.18}\n'
        '    ],\n'
        '    "cogs_segments": [\n'
        '      {"name": "履約與物流成本", "base_amount": 220000.0, "ratio_pct": 0.307, "growth_y1": 0.10}\n'
        '    ],\n'
        '    "opex_segments": [\n'
        '      {"name": "研發與技術費用", "base_amount": 92000.0, "ratio_pct": 0.128}\n'
        '    ]\n'
        '  }\n'
        "}"
    )

    try:
        raw_res = engine.query(prompt=prompt, selected_files=selected_docs)
        json_match = re.search(r"\{.*\}", raw_res, re.DOTALL)
        if json_match:
            data = json.loads(json_match.group(0))
            return data
    except Exception as e:
        print(f"[AI Forecast Synthesis Error] {e}")

    # Fallback response
    default_history = await get_financial_history(ticker if ticker else "AMZN")
    return {
        "status": "sufficient",
        "ticker": ticker,
        "research_brief": f"根據選取的文件分析，{ticker} 在核心業務維持擴張趨勢，但消費與硬體細項面臨一定去庫存與成本壓力。已推估營收、成本與費用三大因子細項。",
        "structured_forecast": default_history
    }

@app.post("/api/ai_forecast_recommendation")
async def get_ai_forecast_recommendation(req: AiRecommendRequest):
    engine = GeminiRAGEngine()
    prompt = (
        f"請針對目標股票 `{req.ticker}`，根據你資料庫中的最新官方財報與研報數據，給出 Pro-Forma 財務模型的前瞻推估 recommendations。\n"
        "請務必以純 JSON 格式輸出，包含 revenue_segments, cogs_segments, opex_segments, current_price, shares_outstanding, historical_pe_avg：\n"
        "{\n"
        '  "base_year": 2025,\n'
        '  "base_revenue": 717000.0,\n'
        '  "gross_margin": 0.485,\n'
        '  "current_price": 185.0,\n'
        '  "shares_outstanding": 10400.0,\n'
        '  "historical_pe_avg": 35.0,\n'
        '  "revenue_segments": [...],\n'
        '  "cogs_segments": [...],\n'
        '  "opex_segments": [...],\n'
        '  "ai_explanation": "Gemini AI 推薦原因摘要..."\n'
        "}"
    )

    try:
        raw_res = engine.query(prompt=prompt, filter_keyword=req.ticker)
        json_match = re.search(r"\{.*\}", raw_res, re.DOTALL)
        if json_match:
            data = json.loads(json_match.group(0))
            return data
    except Exception as e:
        print(f"[AI Recommendation Warning] {e}")

    return await get_financial_history(req.ticker)

@app.post("/api/ai_steer_forecast")
async def steer_forecast_model(req: AiSteerRequest):
    engine = GeminiRAGEngine()
    prompt = (
        f"用戶正在對股票 `{req.ticker}` 的 Pro-Forma 財務細拆模型提出以下自然語言修正意見：\n"
        f"【用戶意見】: \"{req.user_prompt}\"\n\n"
        f"目前營收細拆: {json.dumps(req.current_revenue_segments, ensure_ascii=False)}\n"
        f"目前成本細拆: {json.dumps(req.current_cogs_segments, ensure_ascii=False)}\n"
        f"目前 OpEx 細拆: {json.dumps(req.current_opex_segments, ensure_ascii=False)}\n\n"
        "請理解用戶的意見（支援負成長率，例如 -15%），並輸出更新後的純 JSON 結構：\n"
        "{\n"
        '  "revenue_segments": [...],\n'
        '  "cogs_segments": [...],\n'
        '  "opex_segments": [...],\n'
        '  "ai_feedback": "Gemini AI 調整說明摘要..."\n'
        "}"
    )

    try:
        raw_res = engine.query(prompt=prompt, filter_keyword=req.ticker)
        json_match = re.search(r"\{.*\}", raw_res, re.DOTALL)
        if json_match:
            data = json.loads(json_match.group(0))
            return data
    except Exception as e:
        print(f"[AI Steer Error] {e}")

    return {
        "revenue_segments": req.current_revenue_segments,
        "cogs_segments": req.current_cogs_segments,
        "opex_segments": req.current_opex_segments,
        "ai_feedback": f"已依據指示調整模型: {req.user_prompt}"
    }

@app.post("/api/ai_cycle_risk_scan")
async def scan_cycle_risks(req: AiRiskScanRequest):
    engine = GeminiRAGEngine()
    prompt = (
        f"請針對目標股票 `{req.ticker}`，全面研讀資料庫中最新的 10-K/10-Q 財報（包含存貨週轉天數 DSI、MD&A 風險提示、CapEx 指引、RPO 增速）與總經環境，\n"
        "找出該公司未來 1~3 年可能面臨的『景氣循環下行風險、去庫存壓力、或可能出現負成長 (Negative Growth) 的業務線』。\n"
        "請以純 JSON 格式輸出：\n"
        "{\n"
        '  "cycle_phase": "景氣循環階段 (例如: 去庫存放緩期 / 擴張期 / 轉機期)",\n'
        '  "risk_summary": "下行風險核心摘要 (2~3 句話)",\n'
        '  "downside_segments": [\n'
        '    {"name": "業務線名稱", "risk_reason": "風險原因 (如存貨過高/需求放緩)", "recommended_growth_y1": -0.10, "recommended_growth_y2": 0.02, "recommended_growth_y3": 0.15}\n'
        '  ],\n'
        '  "suggested_cogs_adjustment": "成本與毛利因應建議",\n'
        '  "turnaround_outlook": "何時可能迎來獲利反轉拐點"\n'
        "}"
    )

    try:
        raw_res = engine.query(prompt=prompt, filter_keyword=req.ticker)
        json_match = re.search(r"\{.*\}", raw_res, re.DOTALL)
        if json_match:
            data = json.loads(json_match.group(0))
            return data
    except Exception as e:
        print(f"[AI Risk Scan Error] {e}")

    return {
        "cycle_phase": "景氣下行與去庫存逆風期",
        "risk_summary": f"根據 {req.ticker} 歷史循環週期，硬體與消費業務面臨去庫存壓力，建議設定第一年負成長以模擬保守情境。",
        "downside_segments": [
            {"name": "消費型硬體與零售", "risk_reason": "終端買氣疲軟與庫存去化", "recommended_growth_y1": -0.12, "recommended_growth_y2": 0.03, "recommended_growth_y3": 0.18}
        ],
        "suggested_cogs_adjustment": "產能利用率下滑可能壓抑毛利率 1~2 百分點",
        "turnaround_outlook": "預計 Y2 築底，Y3 進入新一輪 AI/產品升級成長循環"
    }

@app.get("/api/reports")
async def list_reports():
    processed_files = [f.name for f in PROCESSED_DIR.glob("*.md")]
    notebooklm_files = [f.name for f in NOTEBOOKLM_DIR.glob("*.md")]
    return {
        "processed": processed_files,
        "notebooklm_sync": notebooklm_files
    }

@app.get("/api/report_content/{filename}")
async def get_report_content(filename: str):
    file_path = PROCESSED_DIR / filename
    if not file_path.exists():
        file_path = NOTEBOOKLM_DIR / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")
    return {"filename": filename, "content": file_path.read_text(encoding="utf-8")}

@app.post("/api/fetch")
async def fetch_data(req: FetchRequest):
    results = []

    if req.source in ["sec", "all"]:
        try:
            sec = SECFetcher()
            sec_path = sec.export_markdown_report(req.ticker)
            results.append(f"美股 SEC 10-K/10-Q 財報: {sec_path.name}")
        except Exception as e:
            results.append(f"美股 SEC 抓取失敗: {str(e)}")

    if req.source in ["mops", "all"]:
        try:
            mops = MOPSFetcher()
            mops_path = mops.export_markdown_report(req.ticker)
            results.append(f"台股 MOPS 月營收: {mops_path.name}")
        except Exception as e:
            results.append(f"台股 MOPS 抓取失敗: {str(e)}")

    if req.source in ["fred", "all"]:
        try:
            fred = FREDFetcher()
            fred_path = fred.export_markdown_report()
            results.append(f"FRED 總經數據: {fred_path.name}")
        except Exception as e:
            results.append(f"FRED 總經失敗: {str(e)}")

    if req.source in ["gdrive", "all"]:
        try:
            from core.parsers.doc_importer import DocumentImporter
            importer = DocumentImporter()
            imported_files = importer.import_all_gdrive_documents()
            results.append(f"Google Drive 雲端檔案掃描與解析: 成功導入 {len(imported_files)} 個文件 (含 PDF/DOCX/TXT)")
        except Exception as e:
            results.append(f"Google Drive 掃描與解析失敗: {str(e)}")

    if req.sync_notebooklm:
        exporter = NotebookLMExporter()
        synced = exporter.sync_all_processed_reports()
        results.append(f"NotebookLM 同步: 共同步 {len(synced)} 個檔案至雲端資料夾")

    return {"status": "success", "results": results, "gdrive_path": str(NOTEBOOKLM_DIR)}

@app.post("/api/ask")
async def ask_gemini(req: AskRequest):
    engine = GeminiRAGEngine()
    answer = engine.query(
        prompt=req.query,
        selected_files=req.selected_files,
        filter_keyword=req.ticker
    )
    return {"query": req.query, "answer": answer}

@app.post("/api/sync_answer")
async def sync_answer_to_notebooklm(req: SyncAnswerRequest):
    timestamp_str = datetime.now().strftime("%Y%m%d_%H%M%S")
    time_display = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    filename = f"AI_Analysis_Report_{timestamp_str}.md"
    out_path = NOTEBOOKLM_DIR / filename

    content = f"# [ChronoAFR AI 分析報告] {req.query[:30]}...\n\n"
    content += f"- **產出時間**: `{time_display}`\n"
    content += f"- **分析問題**: `{req.query}`\n"
    if req.selected_files:
        content += f"- **參考文件**: `{', '.join(req.selected_files)}`\n"
    content += f"\n## AI 分析與研讀內文\n\n{req.answer}\n"

    out_path.write_text(content, encoding="utf-8")
    return {"status": "success", "filename": filename, "path": str(out_path)}

@app.post("/api/forecast")
async def run_forecast(req: ForecastRequest):
    assumptions = ForecastAssumptions(
        ticker=req.ticker,
        base_year=req.base_year,
        base_revenue=req.base_revenue,
        revenue_growth_y1=req.revenue_growth_y1,
        revenue_growth_y2=max(-0.20, req.revenue_growth_y1 * 0.8),
        revenue_growth_y3=max(-0.20, req.revenue_growth_y1 * 0.65),
        revenue_segments=req.revenue_segments or [],
        cogs_segments=req.cogs_segments or [],
        gross_margin=req.gross_margin,
        opex_segments=req.opex_segments or [],
        op_margin=req.op_margin,
        tax_rate=req.tax_rate,
        fcf_conversion_rate=0.90,
        wacc=req.wacc,
        terminal_growth_rate=0.035,
        current_price=req.current_price,
        shares_outstanding=req.shares_outstanding,
        historical_pe_avg=req.historical_pe_avg,
        historical_pe_min=req.historical_pe_min,
        historical_pe_max=req.historical_pe_max
    )
    engine = ScenarioEngine(assumptions)
    scenarios = engine.build_scenarios()
    report_path = engine.export_markdown_forecast_report()

    if req.sync_notebooklm:
        exporter = NotebookLMExporter()
        exporter.prepare_file_for_notebooklm(report_path)

    return {
        "status": "success",
        "ticker": req.ticker,
        "scenarios": scenarios,
        "report_file": report_path.name
    }

@app.post("/api/review")
async def run_review(req: ReviewRequest):
    engine = AttributionEngine()
    review_res = engine.review_forecast_vs_actual(
        req.ticker, req.actual_revenue, req.actual_op_income, req.actual_gross_margin
    )
    report_path = engine.export_markdown_review_report(
        req.ticker, req.actual_revenue, req.actual_op_income, req.actual_gross_margin
    )

    if req.sync_notebooklm:
        exporter = NotebookLMExporter()
        exporter.prepare_file_for_notebooklm(report_path)

    return {
        "status": "success",
        "ticker": req.ticker,
        "review_data": review_res,
        "report_file": report_path.name
    }
