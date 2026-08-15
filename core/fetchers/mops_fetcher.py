import json
import requests
import pandas as pd
from pathlib import Path
from typing import Dict, Any, Optional
from config import RAW_MOPS_DIR, PROCESSED_DIR

class MOPSFetcher:
    """Fetcher for Taiwan Stock Market (TWSE / MOPS) Monthly Revenue & Financial Data."""

    TWSE_MONTHLY_REV_URL = "https://openapi.twse.com.tw/v1/opendata/t187ap05_L"

    def __init__(self):
        self.headers = {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"
        }

    def fetch_monthly_revenues(self) -> pd.DataFrame:
        """Fetch latest monthly revenue data for all TWSE listed companies."""
        res = requests.get(self.TWSE_MONTHLY_REV_URL, headers=self.headers, timeout=15)
        res.raise_for_status()
        data = res.json()

        # Save raw JSON
        raw_path = RAW_MOPS_DIR / "twse_monthly_revenue_latest.json"
        with open(raw_path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

        df = pd.DataFrame(data)
        col_rename = {
            "公司代號": "StockID",
            "公司名稱": "CompanyName",
            "資料年月": "YearMonth",
            "營業收入-當月營收": "CurrentMonthRev",
            "營業收入-上月營收": "LastMonthRev",
            "營業收入-去年當月營收": "LastYearSameMonthRev",
            "營業收入-上月比較增減(%)": "MoM_Percent",
            "營業收入-去年同月增減(%)": "YoY_Percent",
            "累計營業收入-當月累計營收": "CumulativeRev",
            "累計營業收入-去年累計營收": "LastYearCumulativeRev",
            "累計營業收入-前期比較增減(%)": "CumulativeYoY_Percent"
        }
        df.rename(columns=col_rename, inplace=True)
        return df

    def fetch_company_revenue(self, stock_id: str) -> Optional[Dict[str, Any]]:
        """Get revenue data for a specific Taiwan stock code (e.g. '2330')."""
        df = self.fetch_monthly_revenues()
        stock_clean = str(stock_id).strip()
        matched = df[df["StockID"] == stock_clean]

        if matched.empty:
            return None
        
        row = matched.iloc[0].to_dict()
        return row

    def export_markdown_report(self, stock_id: str) -> Path:
        """Export Taiwan stock revenue summary to Markdown format."""
        info = self.fetch_company_revenue(stock_id)
        stock_clean = str(stock_id).strip()

        md_content = f"# 台股 `{stock_clean}` 營收與營運分析報告\n\n"
        
        if not info:
            md_content += f"*未能在公開資訊觀測站最新資料中找到代號 `{stock_clean}` 的營收紀錄。*\n"
        else:
            company_name = info.get("CompanyName", stock_clean)
            md_content += f"- **股票代號/名稱**: `{stock_clean}` - {company_name}\n"
            md_content += f"- **資料來源**: 台灣證券交易所 / 公開資訊觀測站 (MOPS)\n"
            md_content += f"- **營收年月**: `{info.get('YearMonth', 'N/A')}`\n\n"
            md_content += "## 最新月營收數據概覽\n\n"

            records = [
                {"項目": "當月營收 (千元)", "數值": f"{int(info.get('CurrentMonthRev', 0)):,}" if str(info.get('CurrentMonthRev', '')).isdigit() else info.get('CurrentMonthRev', '-')},
                {"項目": "上月營收 (千元)", "數值": f"{int(info.get('LastMonthRev', 0)):,}" if str(info.get('LastMonthRev', '')).isdigit() else info.get('LastMonthRev', '-')},
                {"項目": "去年同月營收 (千元)", "數值": f"{int(info.get('LastYearSameMonthRev', 0)):,}" if str(info.get('LastYearSameMonthRev', '')).isdigit() else info.get('LastYearSameMonthRev', '-')},
                {"項目": "月增率 (MoM %)", "數值": f"{info.get('MoM_Percent', '-')}%"},
                {"項目": "年增率 (YoY %)", "數值": f"{info.get('YoY_Percent', '-')}%"},
                {"項目": "累計營收年增率", "數值": f"{info.get('CumulativeYoY_Percent', '-')}%"}
            ]

            rev_df = pd.DataFrame(records)
            md_content += rev_df.to_markdown(index=False) + "\n\n"

        output_path = PROCESSED_DIR / f"{stock_clean}_MOPS_Report.md"
        with open(output_path, "w", encoding="utf-8") as f:
            f.write(md_content)

        return output_path
