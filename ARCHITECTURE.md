# ⏳ ChronoAFR 系統設計架構與實作開發手冊

> **ChronoAFR (Chronological Analysis, Forecast & Review Engine)**  
> 專為基本面與量化投資研究打造的全方位投資飛輪系統。

---

## 🎨 1. 品牌與視覺設計規範 (Design System)

* **系統命名**：ChronoAFR（結合 Chronological 時間軸維度 + Analysis 分析 + Forecast 預測 + Review 復盤）
* **視覺主調性**：簡約、大方、高雅微光質感 (Minimalist & Glassmorphism)
* **配色系統 (Color Palette)**：
  * **主色 (Primary Pink)**：`#FFB7C5` (櫻花粉 / Cherry Blossom Pink)
  * **輔色 (Secondary Sand)**：`#CBB193` (暖沙金 / Warm Sand Gold)
  * **背景色 (Background)**：`#FAF8F5` (柔和米白) / `#FDFBF9` (卡片背景)
  * **文字與邊框**：`#4A4036` (深暖褐主字) / `#E8DFD8` (柔和卡片邊框)

---

## 🏗️ 2. 五大核心模組與系統架構 (Core Architecture)

```
                       ┌─────────────────────────────────────────┐
                       │           ChronoAFR 投資飛輪             │
                       └────────────────────┬────────────────────┘
                                            │
       ┌───────────────────┬────────────────┴───┬───────────────────┐
       ▼                   ▼                    ▼                   ▼
┌──────────────┐    ┌──────────────┐     ┌──────────────┐    ┌──────────────┐
│ 1. 數據擷取  │ ──►│ 2. AI 研讀   │ ──► │ 3. 前瞻預測  │ ──►│ 4. 復盤診斷  │
│ (Fetchers)   │    │ (RAG Engine) │     │(Forecasting) │    │ (Reviewing)  │
└──────┬───────┘    └──────────────┘     └──────────────┘    └──────────────┘
       │                                                               ▲
       └──────────────────► 5. NotebookLM 同步管道 ────────────────────┘
```

### 1. 官方數據擷取器 (`core/fetchers/`)
* **美股 SEC EDGAR** (`sec_fetcher.py`)：自動擷取 10-K 年報與 10-Q 季報財報數據與 HTML 表格。
* **台股 MOPS 公開資訊觀測站** (`mops_fetcher.py`)：自動擷取上市櫃公司每月營收走勢。
* **FRED 聯準會總經庫** (`fred_fetcher.py`)：擷取聯準會利率 (FEDFUNDS)、10年期美債殖利率 (DGS10)、CPI 通膨與失業率 (UNRATE)。

### 2. 全格式文件解析與增量快取引擎 (`core/parsers/doc_importer.py`)
* **全格式支援**：支持 `.pdf`, `.xlsx`/`.xls`, `.docx`/`.doc`, `.csv` 與 `.md`/`.txt`。
* **雙 Google Drive 路徑自動偵測**：
  1. `/Users/stanchen/Documents/Google Drive`（包含 Amazon 2025 年報 PDF 1.6MB）
  2. `/Users/stanchen/Library/CloudStorage/.../我的雲端硬碟/ChronoAFR_Sync`
* **原始副檔名保留**：轉譯產出的 Markdown 檔保留原始格式全名。

### 3. 指定檔案 RAG 研讀與導出工具包 (`core/rag/gemini_engine.py`)
* **精準檔案選擇器 (Targeted RAG)**：支援在 Web UI 中勾選指定的 1~N 份檔案。
* **🔍 即時打字搜尋框 & 🏷️ 格式快篩標籤**：0 毫秒過濾檔名關鍵字。
* **📥 AI 分析回答一鍵導出工具包**：支援一鍵下載 `.md` 報告檔、一鍵複製與一鍵同步 NotebookLM (`POST /api/sync_answer`)。

### 4. 完整 3 年損益表、負成長循環與虧損期 P/E 診斷引擎 (`core/forecasting/`)
* **全方位支援負成長率與景氣循環預設 (Business Cycle Presets)**：
  - 📈 **穩健擴張模式**：常態正成長。
  - 📉 **產業去庫存 / 下行週期**：細拆業務填入負百分比 (`-8% ~ -15%`)，模擬毛利率收縮與獲利下修。
  - ✂️ **降本增效 / 組織重組模式**：OpEx 費用負成長 (`-6% ~ -10%`)，模擬利潤率與現金流逆勢反彈。
  - 🤖 **AI 掃描下行風險與負成長** (`POST /api/ai_cycle_risk_scan`)：交叉比對存貨週轉天數 (DSI)、MD&A 風險與總經利率。
* **每股虧損 (負 EPS) 國際標準評價處理機制**：
  - **P/E 欄位標準化**：當 EPS $\le$ 0 時，P/E 欄位自動顯示 **`N/A (虧損中)`**（絕不顯示具誤導性的負數倍數）。
  - **轉機股 (Turnaround) 獲利拐點診斷**：若 Y1 虧損但 Y2/Y3 轉虧為盈，系統自動以轉盈年度 EPS 折現推算目標股價，標註 🟡 **【轉機型機會 / 觀察獲利拐點】**。
  - **替代估值乘數**：提供 **前瞻 P/S (市銷率)** 與 **DCF 企業價值底層防禦力**。

### 5. 預測復盤診斷與經驗校準 (`core/reviewing/`)
* **開獎比對矩陣與 AI 偏差歸因診斷**：比對「預測 vs 實際」，由 Gemini AI 診斷預測偏差原因並提出校準建議。

---

## 📌 5. 系統持續迭代與優化紀錄 (Changelog)

* **2026-08-15 (v4.1.0 負成長率、景氣循環預設與虧損期 P/E N/A 轉機股診斷升級)**:
  1. 表格全方位支援輸入負成長率（如 `-15.0%`），UI 採用鮮明紅色衰退警示標籤。
  2. 新增 **景氣循環情境模式切換列 (Cycle Presets)**：一鍵切換「📈 穩健擴張」、「📉 去庫存/下行循環」與「✂️ 降本增效」模式。
  3. 新增 **`🤖 AI 掃描下行風險與負成長`** (`POST /api/ai_cycle_risk_scan`) 端點，自動研讀存貨積壓與總經利率風險。
  4. 實作國際金融權威標準之 **每股虧損 (EPS $\le$ 0) 處理機制**：P/E 自動顯示為 `N/A (虧損中)`，啟用轉機股 (Turnaround) 獲利拐點折現評價與前瞻 P/S 市銷率。
