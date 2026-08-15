import argparse
import sys
from pathlib import Path

# Add project root to sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from core.forecasting.proforma_model import ForecastAssumptions
from core.forecasting.scenario_engine import ScenarioEngine
from core.notebooklm.exporter import NotebookLMExporter

def main():
    parser = argparse.ArgumentParser(description="前瞻財務預測與多情境估值 CLI 工具")
    parser.add_argument("--ticker", type=str, default="NVDA", help="股票代號")
    parser.add_argument("--base-rev", type=float, default=60922.0, help="基準年營收 ($ Millions)")
    parser.add_argument("--growth-y1", type=float, default=0.25, help="第一年預估營收成長率 (例如 0.25 代表 25%)")
    parser.add_argument("--gross-margin", type=float, default=0.74, help="預估毛利率 (例如 0.74 代表 74%)")
    parser.add_argument("--op-margin", type=float, default=0.55, help="預估營業利潤率 (例如 0.55 代表 55%)")
    parser.add_argument("--sync-notebooklm", action="store_true", help="自動同步至 NotebookLM 資料夾")

    args = parser.parse_args()

    print("==================================================")
    print(f"🔮 前瞻財務預測與 Bull/Base/Bear 估值引擎 CLI ({args.ticker})")
    print("==================================================")

    assumptions = ForecastAssumptions(
        ticker=args.ticker,
        base_year=2025,
        base_revenue=args.base_rev,
        revenue_growth_y1=args.growth_y1,
        revenue_growth_y2=max(0.05, args.growth_y1 * 0.8),
        revenue_growth_y3=max(0.05, args.growth_y1 * 0.65),
        gross_margin=args.gross_margin,
        op_margin=args.op_margin,
        tax_rate=0.21,
        fcf_conversion_rate=0.90,
        wacc=0.09,
        terminal_growth_rate=0.035
    )

    engine = ScenarioEngine(assumptions)
    report_path = engine.export_markdown_forecast_report()

    print(f"\n✅ 前瞻預測與情境模擬分析報告已產出: {report_path}")

    if args.sync_notebooklm:
        exporter = NotebookLMExporter()
        dest = exporter.prepare_file_for_notebooklm(report_path)
        print(f"✅ 已將預測報告同步至 NotebookLM 目錄: {dest}")

if __name__ == "__main__":
    main()
