# ⏳ ChronoAFR (Chronological Analysis, Forecast & Review Engine)

**ChronoAFR** 是一個全方位的投資分析與預測復盤平台，透過時間軸維度結合官方數據擷取、財報 PDF/HTML 解析、Google NotebookLM 整備管道、Gemini API 大上下文問答，以及**前瞻性財務預測 (Forecasting)** 與 **預測復盤診斷 (Reviewing Engine)**。

---

## 🌟 核心功能特色 (v4.0.0 最新升級)

1. **完整 3 年 Pro-Forma 損益表與每股盈餘 (Full Income Statement & EPS Engine)**:
   - 完整呈現 2026年 ~ 2028年 營收、成本、毛利 (毛利率 %)、費用、營業利潤 (利潤率 %)、稅額與**稅後淨利 (Net Income)**。
   - 自動推算 **2026E, 2027E, 2028E 預估每股盈餘 (Projected EPS)**！
2. **本益比相對估值與投資切入時機診斷卡 (Forward P/E & Timing Signal)**:
   - **前瞻本益比 (Forward P/E)**：計算未來 3 年前瞻 P/E 軌跡。
   - **推算目標股價 (Target Price)**：以預估 EPS $\times$ 歷史平均 P/E 推算目標股價與隱含上漲空間 %。
   - **🚦 投資時機診斷信號**：對比歷史 P/E 區間，自動判斷 🟢 **具安全邊際 / 最佳切入時機** 或 🔴 **高估 / 靜待拉回**。
3. **雙重估值驗證 (DCF 企業價值 + P/E 相對估值)**:
   - 結合 DCF 自由現金流折現與 P/E 本益比河流相對估值法。
4. **損益表三大動態細拆工作台 (Revenue, COGS, OpEx Breakdown)**:
   - 支援列層級 `➕` 插入與 `🗑️` 刪除，以及 AI 自然語言微調。

---

## 🚀 快速開始指南

### 1. 啟動 Web Dashboard (一鍵啟動)
```bash
/Users/stanchen/Projects/personal/investment_analyzer/run.sh
```
瀏覽器開啟：`http://localhost:8000` ➔ 切換至 **`🔮 3. 前瞻財務預測`** 體驗升級版完整 3 年損益表、預估 EPS、前瞻 P/E 與切入時機診斷信號！
