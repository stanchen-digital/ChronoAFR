import argparse
import sys
from pathlib import Path

# Add project root to sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from core.fetchers.sec_fetcher import SECFetcher
from core.fetchers.mops_fetcher import MOPSFetcher
from core.fetchers.fred_fetcher import FREDFetcher
from core.notebooklm.exporter import NotebookLMExporter

def main():
    parser = argparse.ArgumentParser(description="投資數據抓取與 NotebookLM 同步 CLI 工具")
    parser.add_argument("--source", type=str, choices=["sec", "mops", "fred", "gdrive", "all"], default="all", help="數據來源 (sec: 美股, mops: 台股, fred: 總經, gdrive: 雲端硬碟)")
    parser.add_argument("--ticker", type=str, default="NVDA", help="股票代號 (美股如 NVDA, 台股如 2330)")
    parser.add_argument("--sync-notebooklm", action="store_true", help="自動同步匯出至 NotebookLM 資料夾")

    args = parser.parse_args()

    print("==================================================")
    print("🚀 投資數據擷取與解析系統 CLI (Data Acquisition Engine)")
    print("==================================================")

    if args.source in ["sec", "all"]:
        print(f"\n[1/3] 抓取美股 SEC EDGAR 財報數據 (Ticker: {args.ticker})...")
        try:
            sec = SECFetcher()
            path = sec.export_markdown_report(args.ticker)
            print(f"  └─ ✅ 成功匯出美股 Markdown 報告: {path}")
        except Exception as e:
            print(f"  └─ ❌ SEC 抓取失敗: {e}")

    if args.source in ["mops", "all"]:
        tw_ticker = "2330" if args.ticker == "NVDA" else args.ticker
        print(f"\n[2/3] 抓取台股 MOPS 月營收數據 (StockID: {tw_ticker})...")
        try:
            mops = MOPSFetcher()
            path = mops.export_markdown_report(tw_ticker)
            print(f"  └─ ✅ 成功匯出台股 Markdown 報告: {path}")
        except Exception as e:
            print(f"  └─ ❌ MOPS 抓取失敗: {e}")

    if args.source in ["fred", "all"]:
        print(f"\n[3/3] 抓取 FRED 總體經濟與聯準會利率數據...")
        try:
            fred = FREDFetcher()
            path = fred.export_markdown_report()
            print(f"  └─ ✅ 成功匯出總經 Markdown 報告: {path}")
        except Exception as e:
            print(f"  └─ ❌ FRED 抓取失敗: {e}")

    if args.sync_notebooklm:
        print("\n[NotebookLM] 同步檔案至 NotebookLM 資料夾...")
        exporter = NotebookLMExporter()
        synced = exporter.sync_all_processed_reports()
        print(f"  └─ ✅ 已同步 {len(synced)} 個檔案至 notebooklm_sync/ 目錄")

    print("\n完成！您可以檢視 data/processed/ 目錄下的 Markdown 檔案。")

if __name__ == "__main__":
    main()
