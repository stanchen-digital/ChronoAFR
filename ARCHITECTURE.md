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

## 🏗️ 2. 五大核心模組與全自動投資飛輪 (Core Architecture)

```
                       ┌─────────────────────────────────────────┐
                       │        ChronoAFR 端到端投資飛輪         │
                       └────────────────────┬────────────────────┘
                                            │
       ┌───────────────────┬────────────────┴───┬───────────────────┐
       ▼                   ▼                    ▼                   ▼
┌──────────────┐    ┌──────────────┐     ┌──────────────┐    ┌──────────────┐
│ 1. 數據擷取  │ ──►│ 2. AI 研讀   │ ──► │ 3. 前瞻預測  │ ──►│ 4. 復盤診斷  │
│ (Fetchers)   │    │ (RAG Engine) │     │(Forecasting) │    │ (Reviewing)  │
└──────┬───────┘    └──────┬───────┘     └──────────────┘    └──────────────┘
       │                   │ [一鍵套用]         ▲
       │                   └────────────────────┘
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

### 3. 法人級三大前瞻因子研讀與一鍵跨模組飛輪 (`app/main.py` & `app/static/js/app.js`)
* **三大前瞻固定核心問題**：
  1. **(1) 預測該公司未來營收與業務細項 (Revenue Segments) 年增率及比重**
  2. **(2) 預測該公司未來營業成本 (COGS Breakdown) 成長率與毛利率影響**
  3. **(3) 預測該公司未來營業費用 (OpEx: 研發 R&D, 銷售 S&M, 管理 G&A) 支出率**
* **資料充分性檢核機制 (Data Sufficiency Check)**：
  - 若所選取的資料不足以推論，AI 明確回傳 `⚠️ 【資料不足警示】` 並指明缺少之財報項目。
* **一鍵跨模組連動飛輪 (One-Click Pipeline Bridge)**：
  - 用戶審閱 AI 研讀推論後，點擊 **`🚀 採納此推論並一鍵套用至前瞻預測`** ➔ 自動注入 Tab 3 ➔ 自動運行 Pro-Forma 財務模型生成 3 年損益表與每股盈餘 (EPS)。

### 4. 完整 3 年損益表、負成長循環與虧損期 P/E 診斷引擎 (`core/forecasting/`)
* **全方位支援負成長率與景氣循環預設 (Business Cycle Presets)**：
  - 📈 **穩健擴張模式**：常態正成長。
  - 📉 **產業去庫存 / 下行週期**：細拆業務填入負百分比 (`-8% ~ -15%`)，模擬毛利率收縮與獲利下修。
  - ✂️ **降本增效 / 組織重組模式**：OpEx 費用負成長 (`-6% ~ -10%`)，模擬利潤率與現金流逆勢反彈。
* **每股虧損 (負 EPS) 國際標準評價處理機制**：
  - **P/E 欄位標準化**：當 EPS $\le$ 0 時，P/E 欄位自動顯示 **`N/A (虧損中)`**。
  - **轉機股 (Turnaround) 獲利拐點診斷**：若 Y1 虧損但 Y2/Y3 轉虧為盈，系統自動以轉盈年度 EPS 折現推算目標股價，標註 🟡 **【轉機型機會 / 觀察獲利拐點】**。
  - **替代估值乘數**：提供 **前瞻 P/S (市銷率)** 與 **DCF 企業價值底層防禦力**。

### 5. 預測復盤診斷與經驗校準 (`core/reviewing/`)
* **開獎比對矩陣與 AI 偏差歸因診斷**：比對「預測 vs 實際」，由 Gemini AI 診斷預測偏差原因並提出校準建議。

---

## 📌 5. 系統持續迭代與優化紀錄 (Changelog)

* **2026-08-15 (v5.0.0 數據擷取 ➔ AI 三大因子研讀 ➔ 前瞻 Pro-Forma 全流程無縫飛輪貫通)**:
  1. 在 Tab 2 導入「⚡ 法人級三大前瞻因子自動研讀 (1.營收 2.成本 3.費用)」按鈕與端點 (`POST /api/ai_synthesize_forecast`)。
  2. 內建嚴謹「資料充分性檢核」，未選取足夠財報時即時發出警示。
  3. 新增「🚀 採納此推論並一鍵套用至前瞻預測」按鈕，秒級自動填入 Tab 3 細拆表格並直接觸發 Pro-Forma 計算！
