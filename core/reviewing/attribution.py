import json
import pandas as pd
from pathlib import Path
from typing import Dict, Any, Optional
from core.reviewing.tracker import ForecastTracker
from core.rag.gemini_engine import GeminiRAGEngine
from config import PROCESSED_DIR, REVIEW_DIR

class AttributionEngine:
    """Post-Mortem Reviewing & Forecast Deviation Attribution Engine."""

    def __init__(self):
        self.tracker = ForecastTracker()
        self.rag_engine = GeminiRAGEngine()

    def review_forecast_vs_actual(
        self,
        ticker: str,
        actual_revenue: float,
        actual_op_income: float,
        actual_gross_margin: float,
        period_label: str = "Latest Period"
    ) -> Dict[str, Any]:
        """Compare actual financial results against recorded forecast and analyze variance."""
        ticker_clean = ticker.upper()
        forecast_entry = self.tracker.get_latest_forecast(ticker_clean)

        if not forecast_entry:
            # Create a sample baseline forecast if none exists
            forecast_rev = actual_revenue * 0.95
            forecast_op = actual_op_income * 0.90
            forecast_gm = actual_gross_margin - 0.02
            version_id = "N/A (Sample Baseline)"
        else:
            version_id = forecast_entry["VersionID"]
            projs = forecast_entry["ForecastData"]["Projections"]
            target_proj = projs[0]  # First year projection
            forecast_rev = target_proj["Revenue"]
            forecast_op = target_proj["OperatingIncome"]
            forecast_gm = forecast_entry["ForecastData"]["Assumptions"]["gross_margin"]

        # Calculate Variances
        rev_variance_pct = ((actual_revenue - forecast_rev) / forecast_rev) * 100 if forecast_rev else 0
        op_variance_pct = ((actual_op_income - forecast_op) / forecast_op) * 100 if forecast_op else 0
        gm_variance_pct = (actual_gross_margin - forecast_gm) * 100  # Percentage point diff

        review_data = {
            "Ticker": ticker_clean,
            "Period": period_label,
            "VersionID": version_id,
            "Comparison": {
                "Revenue": {"Forecast": forecast_rev, "Actual": actual_revenue, "VariancePct": round(rev_variance_pct, 2)},
                "OperatingIncome": {"Forecast": forecast_op, "Actual": actual_op_income, "VariancePct": round(op_variance_pct, 2)},
                "GrossMargin": {"Forecast": forecast_gm, "Actual": actual_gross_margin, "VarianceDiffPts": round(gm_variance_pct, 2)}
            }
        }

        # AI Attribution Diagnosis
        prompt = (
            f"請對股票 `{ticker_clean}` 的最近一次預測與實際公佈財報進行「復盤偏差診斷 (Post-Mortem Review)」：\n"
            f"- 預測版本: {version_id}\n"
            f"- 營收 (Forecast vs Actual): ${forecast_rev:,.2f}M vs ${actual_revenue:,.2f}M (偏差: {rev_variance_pct:+.2f}%)\n"
            f"- 營業利潤 (Forecast vs Actual): ${forecast_op:,.2f}M vs ${actual_op_income:,.2f}M (偏差: {op_variance_pct:+.2f}%)\n"
            f"- 毛利率 (Forecast vs Actual): {forecast_gm*100:.2f}% vs {actual_gross_margin*100:.2f}% (差異: {gm_variance_pct:+.2f} 百分點)\n\n"
            "請從以下三個維度進行具體分析並給出改進建議：\n"
            "1. **總體經濟與大環境影響** (如利率、匯率、產業需求變化)\n"
            "2. **公司個體營運狀況差異** (如產能、新產品出貨速度、成本控制)\n"
            "3. **模型假設偏誤與未來的校準建議** (針對下次下單或做預測時該調整何種參數)\n"
        )

        attribution_diagnosis = self.rag_engine.query(prompt, filter_keyword=ticker_clean)
        review_data["AttributionDiagnosis"] = attribution_diagnosis

        # Save review output
        out_path = REVIEW_DIR / f"{ticker_clean}_Review_Result.json"
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(review_data, f, ensure_ascii=False, indent=2)

        return review_data

    def export_markdown_review_report(
        self,
        ticker: str,
        actual_revenue: float,
        actual_op_income: float,
        actual_gross_margin: float
    ) -> Path:
        review_res = self.review_forecast_vs_actual(
            ticker, actual_revenue, actual_op_income, actual_gross_margin
        )

        ticker_clean = ticker.upper()
        md_content = f"# {ticker_clean} 投資預測復盤與偏差診斷報告 (Post-Mortem Review)\n\n"
        md_content += f"- **股票代號**: `{ticker_clean}`\n"
        md_content += f"- **比對預測版本**: `{review_res['VersionID']}`\n\n"

        md_content += "## 1. 預測 vs 實際數值對比矩陣 (Variance Matrix)\n\n"

        comp = review_res["Comparison"]
        records = [
            {
                "指標 Metric": "營收 (Revenue)",
                "預測數值 (Forecast)": f"${comp['Revenue']['Forecast']:,.2f}M",
                "實際公佈 (Actual)": f"${comp['Revenue']['Actual']:,.2f}M",
                "偏差幅動 (Variance)": f"{comp['Revenue']['VariancePct']:+.2f}%"
            },
            {
                "指標 Metric": "營業利潤 (Op Income)",
                "預測數值 (Forecast)": f"${comp['OperatingIncome']['Forecast']:,.2f}M",
                "實際公佈 (Actual)": f"${comp['OperatingIncome']['Actual']:,.2f}M",
                "偏差幅動 (Variance)": f"{comp['OperatingIncome']['VariancePct']:+.2f}%"
            },
            {
                "指標 Metric": "毛利率 (Gross Margin)",
                "預測數值 (Forecast)": f"{comp['GrossMargin']['Forecast']*100:.2f}%",
                "實際公佈 (Actual)": f"{comp['GrossMargin']['Actual']*100:.2f}%",
                "偏差幅動 (Variance)": f"{comp['GrossMargin']['VarianceDiffPts']:+.2f} % pts"
            }
        ]

        df_comp = pd.DataFrame(records)
        md_content += df_comp.to_markdown(index=False) + "\n\n"

        md_content += "## 2. 偏差歸因診斷與模型校準建議 (AI Attribution Diagnosis)\n\n"
        md_content += review_res["AttributionDiagnosis"] + "\n\n"

        output_path = PROCESSED_DIR / f"{ticker_clean}_Review_Report.md"
        with open(output_path, "w", encoding="utf-8") as f:
            f.write(md_content)

        return output_path
