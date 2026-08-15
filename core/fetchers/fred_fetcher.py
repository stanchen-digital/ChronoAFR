import requests
import pandas as pd
from pathlib import Path
from typing import Dict, Any, Optional
from config import FRED_API_KEY, RAW_FRED_DIR, PROCESSED_DIR

class FREDFetcher:
    """Fetcher for FRED (Federal Reserve Economic Data) macro indicators."""

    FRED_CSV_URL = "https://fred.stlouisfed.org/graph/fredgraph.csv"

    SERIES_MAP = {
        "FEDFUNDS": "聯準會聯邦基金有效利率 (Federal Funds Rate)",
        "DGS10": "美國10年期公債殖利率 (10-Year Treasury Yield)",
        "CPIAUCSL": "消費者物價指數 (CPI)",
        "UNRATE": "美國失業率 (Unemployment Rate)"
    }

    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or FRED_API_KEY
        self.headers = {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko)"
        }

    def fetch_series_csv(self, series_id: str) -> pd.DataFrame:
        """Fetch historical observation data directly from FRED open CSV API."""
        series_clean = series_id.upper()
        url = f"{self.FRED_CSV_URL}?id={series_clean}"

        res = requests.get(url, headers=self.headers, timeout=15)
        res.raise_for_status()

        # Save raw CSV
        raw_path = RAW_FRED_DIR / f"{series_clean}.csv"
        with open(raw_path, "w", encoding="utf-8") as f:
            f.write(res.text)

        # Parse CSV
        df = pd.read_csv(raw_path)
        
        # Standardize date column
        date_col = [c for c in df.columns if c.upper() == "DATE"]
        if not date_col:
            date_col_name = df.columns[0]
        else:
            date_col_name = date_col[0]

        value_col_name = [c for c in df.columns if c != date_col_name][0]

        df[date_col_name] = pd.to_datetime(df[date_col_name], errors="coerce")
        df[series_clean] = pd.to_numeric(df[value_col_name], errors="coerce")
        df.dropna(subset=[date_col_name, series_clean], inplace=True)
        df.sort_values(by=date_col_name, ascending=False, inplace=True)
        
        df.rename(columns={date_col_name: "DATE"}, inplace=True)
        return df

    def fetch_macro_summary(self) -> Dict[str, Any]:
        """Fetch latest values for key macro indicators."""
        summary = {}

        for series_id, label in self.SERIES_MAP.items():
            try:
                df = self.fetch_series_csv(series_id)
                if not df.empty:
                    latest_row = df.iloc[0]
                    summary[series_id] = {
                        "Label": label,
                        "LatestDate": latest_row["DATE"].strftime("%Y-%m-%d"),
                        "Value": float(latest_row[series_id])
                    }
            except Exception as e:
                print(f"[FRED] Warning: Failed to fetch {series_id}: {e}")

        return summary

    def export_markdown_report(self) -> Path:
        """Export Macro Economic Analysis Report to Markdown."""
        summary = self.fetch_macro_summary()

        md_content = "# 總體經濟與利率政策分析報告 (Macro Economic Indicators)\n\n"
        md_content += f"- **資料來源**: 聖路易斯聯邦準備銀行 (FRED)\n"
        md_content += f"- **更新類別**: 聯準會利率、國債殖利率、通膨 CPI 與失業率\n\n"
        md_content += "## 關鍵總經指標最新一覽\n\n"

        records = []
        for series_id, info in summary.items():
            records.append({
                "指標代號": series_id,
                "指標名稱": info["Label"],
                "最新數據": f"{info['Value']:.2f}%" if any(k in series_id for k in ["RATE", "FED", "DGS", "UNRATE"]) else f"{info['Value']:.2f}",
                "數據日期": info["LatestDate"]
            })

        if records:
            df = pd.DataFrame(records)
            md_content += df.to_markdown(index=False) + "\n\n"
        else:
            md_content += "*暫無總經資料，請檢查網路連線。*\n\n"

        output_path = PROCESSED_DIR / "Macro_Economic_Report.md"
        with open(output_path, "w", encoding="utf-8") as f:
            f.write(md_content)

        return output_path
