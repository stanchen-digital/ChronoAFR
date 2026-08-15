# ⏳ ChronoAFR (Chronological Analysis, Forecast & Review Engine)

**ChronoAFR** 是一個全方位的投資分析與預測復盤平台，透過時間軸維度結合官方數據擷取、財報 PDF/HTML 解析、Google NotebookLM 整備管道、Gemini API 大上下文問答，以及**前瞻性財務預測 (Forecasting)** 與 **預測復盤診斷 (Reviewing Engine)**。

---

## 🌟 核心功能特色 (v4.1.0 最新升級)

1. **負成長率、景氣循環預設與 AI 下行風險掃描 (v4.1.0 New)**:
   - 全方位支援輸入負成長率（如 `-15.0%`、`-8.0%`），UI 以紅色標記衰退逆風。
   - **景氣循環情境一鍵套用**：📈 穩健擴張模式、📉 產業去庫存/下行循環、✂️ 降本增效/費用收縮模式。
   - **`🤖 AI 掃描下行風險與負成長`**：自動交叉研讀 10-K 存貨週轉天數 (DSI)、MD&A 風險提示與 FRED 總經利率。
2. **每股虧損 (負 EPS) 國際標準評價與轉機股診斷 (v4.1.0 New)**:
   - 當預估 EPS $\le$ 0 時，前瞻 P/E 自動顯示為 **`N/A (虧損中)`**（絕不顯示具誤導性的負數倍數）。
   - **轉機股 (Turnaround) 獲利拐點折現評價**：若 Y2 或 Y3 轉虧為盈，系統自動以轉盈年度 EPS 折現推算目標股價與隱含上漲空間。
   - 輔以 **前瞻 P/S (市銷率)** 與 **DCF 企業價值底層防禦力**。
3. **完整 3 年 Pro-Forma 損益表與每股盈餘 (Full Income Statement & EPS Engine)**:
   - 完整呈現 2026年 ~ 2028年 營收、成本、毛利 (毛利率 %)、費用、營業利潤 (利潤率 %)、稅額與**稅後淨利 (Net Income)**。
4. **損益表三大動態細拆工作台 (Revenue, COGS, OpEx Breakdown)**:
   - 支援列層級 `➕` 插入與 `🗑️` 刪除，以及 AI 自然語言微調。

---

## 🚀 快速開始指南

### 1. 啟動 Web Dashboard (一鍵啟動)
```bash
/Users/stanchen/Projects/personal/investment_analyzer/run.sh
```
瀏覽器開啟：`http://localhost:8000` ➔ 切換至 **`🔮 3. 前瞻財務預測`** 體驗升級版景氣循環模式切換、AI 負成長風險掃描與轉機股虧損評價！
