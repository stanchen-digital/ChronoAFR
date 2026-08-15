import pandas as pd
from pathlib import Path
from typing import Dict, Any
from core.forecasting.proforma_model import ForecastAssumptions, ProFormaModel
from config import PROCESSED_DIR

class ScenarioEngine:
    """Engine to generate Bull / Base / Bear forecast scenarios with Full Breakdown & P/E support."""

    def __init__(self, base_assumptions: ForecastAssumptions):
        self.base_assumptions = base_assumptions

    def build_scenarios(self) -> Dict[str, Dict[str, Any]]:
        b = self.base_assumptions

        # Scale segments for Bull & Bear
        bull_revenue_segments = []
        for s in b.revenue_segments:
            bull_revenue_segments.append({
                "name": s.get("name"),
                "base_amount": s.get("base_amount", 0.0),
                "share_pct": s.get("share_pct", 0.0),
                "growth_y1": min(1.5, float(s.get("growth_y1", 0.15)) * 1.3),
                "growth_y2": min(1.5, float(s.get("growth_y2", 0.12)) * 1.3),
                "growth_y3": min(1.5, float(s.get("growth_y3", 0.10)) * 1.3)
            })

        bear_revenue_segments = []
        for s in b.revenue_segments:
            bear_revenue_segments.append({
                "name": s.get("name"),
                "base_amount": s.get("base_amount", 0.0),
                "share_pct": s.get("share_pct", 0.0),
                "growth_y1": max(-0.20, float(s.get("growth_y1", 0.15)) * 0.7),
                "growth_y2": max(-0.20, float(s.get("growth_y2", 0.12)) * 0.7),
                "growth_y3": max(-0.20, float(s.get("growth_y3", 0.10)) * 0.7)
            })

        # Bull Case: +30% higher growth, +3% higher margins, higher P/E
        bull_assumptions = ForecastAssumptions(
            ticker=b.ticker,
            base_year=b.base_year,
            base_revenue=b.base_revenue,
            revenue_segments=bull_revenue_segments if bull_revenue_segments else b.revenue_segments,
            cogs_segments=b.cogs_segments,
            opex_segments=b.opex_segments,
            revenue_growth_y1=min(1.0, b.revenue_growth_y1 * 1.3),
            revenue_growth_y2=min(1.0, b.revenue_growth_y2 * 1.3),
            revenue_growth_y3=min(1.0, b.revenue_growth_y3 * 1.3),
            gross_margin=min(0.95, b.gross_margin + 0.03),
            op_margin=min(0.90, b.op_margin + 0.03),
            tax_rate=b.tax_rate,
            fcf_conversion_rate=b.fcf_conversion_rate,
            wacc=max(0.06, b.wacc - 0.005),
            terminal_growth_rate=b.terminal_growth_rate + 0.005,
            current_price=b.current_price,
            shares_outstanding=b.shares_outstanding,
            historical_pe_avg=b.historical_pe_avg,
            historical_pe_min=b.historical_pe_min,
            historical_pe_max=b.historical_pe_max
        )

        # Bear Case: -30% lower growth, -3% lower margins
        bear_assumptions = ForecastAssumptions(
            ticker=b.ticker,
            base_year=b.base_year,
            base_revenue=b.base_revenue,
            revenue_segments=bear_revenue_segments if bear_revenue_segments else b.revenue_segments,
            cogs_segments=b.cogs_segments,
            opex_segments=b.opex_segments,
            revenue_growth_y1=max(0.0, b.revenue_growth_y1 * 0.7),
            revenue_growth_y2=max(0.0, b.revenue_growth_y2 * 0.7),
            revenue_growth_y3=max(0.0, b.revenue_growth_y3 * 0.7),
            gross_margin=max(0.10, b.gross_margin - 0.03),
            op_margin=max(0.05, b.op_margin - 0.03),
            tax_rate=b.tax_rate,
            fcf_conversion_rate=b.fcf_conversion_rate,
            wacc=b.wacc + 0.005,
            terminal_growth_rate=max(0.01, b.terminal_growth_rate - 0.005),
            current_price=b.current_price,
            shares_outstanding=b.shares_outstanding,
            historical_pe_avg=b.historical_pe_avg,
            historical_pe_min=b.historical_pe_min,
            historical_pe_max=b.historical_pe_max
        )

        base_res = ProFormaModel(b).generate_projections()
        bull_res = ProFormaModel(bull_assumptions).generate_projections()
        bear_res = ProFormaModel(bear_assumptions).generate_projections()

        return {
            "Base": base_res,
            "Bull": bull_res,
            "Bear": bear_res
        }

    def export_markdown_forecast_report(self) -> Path:
        scenarios = self.build_scenarios()
        ticker = self.base_assumptions.ticker.upper()

        md_content = f"# {ticker} 前瞻財務預測與情境模擬分析報告 (Forecasting Report)\n\n"
        md_content += f"- **目標股票**: `{ticker}`\n"
        md_content += f"- **基準年份**: {self.base_assumptions.base_year}\n"
        md_content += f"- **基準年營收**: ${self.base_assumptions.base_revenue:,.2f} Million\n\n"

        md_content += "## 多情境估值與三表預測對比 (Bull / Base / Bear Scenarios)\n\n"

        summary_rows = []
        for case_name in ["Bull", "Base", "Bear"]:
            case_data = scenarios[case_name]
            projs = case_data["Projections"]
            dcf = case_data["DCF_Valuation"]
            
            y3_fcf = projs[-1]["FreeCashFlow"]
            implied_ev = dcf["ImpliedEnterpriseValue"]

            summary_rows.append({
                "情境 Scenario": case_name,
                "Year 1 營收成長率": f"{projs[0]['RevenueGrowth']*100:.1f}%",
                "Year 3 營收 (M)": f"${projs[-1]['Revenue']:,.2f}",
                "Year 3 營業利潤 (M)": f"${projs[-1]['OperatingIncome']:,.2f}",
                "Year 3 自由現金流 (M)": f"${y3_fcf:,.2f}",
                "Implied EV 估值 (M)": f"${implied_ev:,.2f}"
            })

        df_summary = pd.DataFrame(summary_rows)
        md_content += df_summary.to_markdown(index=False) + "\n\n"

        output_path = PROCESSED_DIR / f"{ticker}_Forecast_Report.md"
        with open(output_path, "w", encoding="utf-8") as f:
            f.write(md_content)

        return output_path
