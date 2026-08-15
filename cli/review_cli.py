import argparse
import sys
from pathlib import Path

# Add project root to sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from core.reviewing.attribution import AttributionEngine
from core.notebooklm.exporter import NotebookLMExporter

def main():
    parser = argparse.ArgumentParser(description="預測 vs 實際 復盤檢討與偏差歸因 CLI 工具")
    parser.add_argument("--ticker", type=str, default="NVDA", help="股票代號")
    parser.add_argument("--actual-rev", type=float, default=78000.0, help="新公佈實際營收 ($ Millions)")
    parser.add_argument("--actual-op", type=float, default=44500.0, help="新公佈實際營業利潤 ($ Millions)")
    parser.add_argument("--actual-gm", type=float, default=0.755, help="新公佈實際毛利率 (如 0.755 代表 75.5%)")
    parser.add_argument("--sync-notebooklm", action="store_true", help="自動同步至 NotebookLM 資料夾")

    args = parser.parse_args()

    print("==================================================")
    print(f"⚖️ 投資預測復盤與 AI 偏差診斷 CLI ({args.ticker})")
    print("==================================================")

    engine = AttributionEngine()
    report_path = engine.export_markdown_review_report(
        args.ticker, args.actual_rev, args.actual_op, args.actual_gm
    )

    print(f"\n✅ 復盤與偏差診斷報告已產出: {report_path}")

    if args.sync_notebooklm:
        exporter = NotebookLMExporter()
        dest = exporter.prepare_file_for_notebooklm(report_path)
        print(f"✅ 已將復盤檢討報告同步至 NotebookLM 目錄: {dest}")

if __name__ == "__main__":
    main()
