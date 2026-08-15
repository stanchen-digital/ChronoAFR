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

### 4. 完整 3 年損益表、EPS 與本益比相對估值診斷工作台 (`core/forecasting/`)
* **完整損益表 (Full Income Statement Engine) (`proforma_model.py`)**：
  - **1. 營業收入業務線細拆**：單項金額 ($M)、佔總營收比重 (%) 與 Y1 預估成長率。
  - **2. 營業成本 (COGS) 細拆表格**：履約物流、AWS 機房、直接原物料、人力折舊細拆，推算隱含營業毛利與毛利率 %。
  - **3. 營業費用 (OpEx) 三項細拆**：研發費用 (R&D)、銷售行銷 (S&M)、管理開銷 (G&A)。
  - **4. 稅後淨利 (Net Income) 與 EPS 每股盈餘推算**：根據 Diluted Shares 股數，精準算出 2026E, 2027E, 2028E 預估 EPS！
* **本益比評價與投資切入時機診斷卡 (P/E Band & Timing Diagnostic Card)**：
  - **前瞻本益比 (Forward P/E)**：計算 2026E, 2027E, 2028E Forward P/E Ratio。
  - **推算目標股價 (Target Price)**：以 2026E EPS $\times$ 歷史平均 P/E，推算目標股價與隱含上漲空間 %。
  - **切入時機診斷信號 (Timing Signal)**：對比歷史 P/E 區間，自動標示 🟢 **切入良機 / 具安全邊際** 或 🔴 **高估 / 靜待拉回**。
* **雙重估值驗證 (DCF 企業價值 + P/E 相對估值)**：給出雙重估值對照。

### 5. 預測復盤診斷與經驗校準 (`core/reviewing/`)
* **開獎比對矩陣與 AI 偏差歸因診斷**：比對「預測 vs 實際」，由 Gemini AI 診斷預測偏差原因並提出校準建議。

---

## 📌 5. 系統持續迭代與優化紀錄 (Changelog)

* **2026-08-15 (v4.0.0 完整損益表、EPS 與 P/E 估值診斷引擎重大升級)**:
  1. 損益表新增 **所得稅費 (Tax 21%)**、**稅後淨利 (Net Income)** 與 **發行在外總股數 (Diluted Shares)** 項目，輸出完整 3 年損益表對照表。
  2. 新增 **預估每股盈餘 (Projected EPS)** 運算引擎，推算 2026E, 2027E, 2028E EPS。
  3. 新增 **前瞻本益比 (Forward P/E)** 與 **目標股價 (Target Price)** 推算，計算隱含上漲空間 %。
  4. 新增 **🚦 投資切入時機診斷卡 (Timing Diagnostics Card)**，自動比對歷史平均 P/E 區間，給出具安全邊際切入與佈局建議。
  5. 全面升級至 `v4.0.0` 版本標記。
