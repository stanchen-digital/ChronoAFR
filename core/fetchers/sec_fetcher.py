import json
import requests
import pandas as pd
from pathlib import Path
from typing import Dict, Any, Optional, List
from config import SEC_USER_AGENT, RAW_SEC_DIR, PROCESSED_DIR

class SECFetcher:
    """Fetcher for US SEC EDGAR financial filings and XBRL data."""
    
    BASE_URL = "https://data.sec.gov/api/xbrl/companyfacts"
    SUBMISSIONS_URL = "https://data.sec.gov/submissions"
    TICKERS_URL = "https://www.sec.gov/files/company_tickers.json"

    def __init__(self, user_agent: Optional[str] = None):
        self.headers = {
            "User-Agent": user_agent or SEC_USER_AGENT
        }
        self.ticker_map: Dict[str, str] = {}

    def _load_tickers(self) -> Dict[str, str]:
        """Fetch and cache ticker to CIK mapping."""
        if self.ticker_map:
            return self.ticker_map
        
        try:
            res = requests.get(self.TICKERS_URL, headers=self.headers, timeout=10)
            res.raise_for_status()
            data = res.json()
            # Map ticker -> zero-padded CIK string
            for item in data.values():
                ticker = str(item['ticker']).upper()
                cik = str(item['cik_str']).zfill(10)
                self.ticker_map[ticker] = cik
        except Exception as e:
            print(f"[SEC] Warning: Failed to load ticker map: {e}")
        return self.ticker_map

    def get_cik(self, ticker: str) -> Optional[str]:
        """Get CIK for a given stock ticker."""
        tickers = self._load_tickers()
        return tickers.get(ticker.upper())

    def fetch_company_facts(self, ticker: str) -> Dict[str, Any]:
        """Fetch all financial facts (XBRL data) for a company by ticker."""
        ticker_clean = ticker.upper()
        cik = self.get_cik(ticker_clean)
        if not cik:
            raise ValueError(f"Ticker '{ticker_clean}' not found in SEC database.")

        url = f"{self.BASE_URL}/CIK{cik}.json"
        res = requests.get(url, headers=self.headers, timeout=15)
        res.raise_for_status()
        data = res.json()

        # Save raw JSON
        raw_path = RAW_SEC_DIR / f"{ticker_clean}_facts.json"
        with open(raw_path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

        return data

    def extract_key_metrics(self, ticker: str) -> pd.DataFrame:
        """Extract historical Revenues, Gross Profit, Operating Income, Net Income & EPS."""
        facts = self.fetch_company_facts(ticker)
        us_gaap = facts.get("facts", {}).get("us-gaap", {})

        records = []

        metrics_interest = {
            "Revenues": ["Revenues", "RevenueFromContractWithCustomerExcludingAssessedTax", "SalesRevenueNet"],
            "GrossProfit": ["GrossProfit"],
            "OperatingIncome": ["OperatingIncomeLoss"],
            "NetIncome": ["NetIncomeLoss"],
            "EPS": ["EarningsPerShareDiluted", "EarningsPerShareBasic"]
        }

        for metric_label, concept_list in metrics_interest.items():
            concept_data = None
            for concept in concept_list:
                if concept in us_gaap:
                    concept_data = us_gaap[concept]
                    break
            
            if not concept_data:
                continue

            units = concept_data.get("units", {})
            for unit_key, values in units.items():
                for v in values:
                    form = v.get("form")
                    if form in ["10-K", "10-Q"]:
                        val = v.get("val")
                        fy = v.get("fy")
                        fp = v.get("fp")
                        end = v.get("end")
                        frame = v.get("frame", f"FY{fy}-{fp}")
                        
                        records.append({
                            "Ticker": ticker.upper(),
                            "Metric": metric_label,
                            "Value": val,
                            "Unit": unit_key,
                            "Form": form,
                            "FiscalYear": fy,
                            "Period": fp,
                            "EndDate": end,
                            "Frame": frame
                        })

        df = pd.DataFrame(records)
        if not df.empty:
            df.drop_duplicates(subset=["Metric", "Form", "FiscalYear", "Period"], keep="last", inplace=True)
            df.sort_values(by=["FiscalYear", "Period", "Metric"], ascending=[False, False, True], inplace=True)

        return df

    def export_markdown_report(self, ticker: str) -> Path:
        """Export extracted SEC financial data as structured Markdown."""
        df = self.extract_key_metrics(ticker)
        ticker_clean = ticker.upper()

        md_content = f"# {ticker_clean} SEC Financial Analysis & Key Metrics\n\n"
        md_content += f"- **Ticker**: `{ticker_clean}`\n"
        md_content += f"- **CIK**: `{self.get_cik(ticker_clean)}`\n"
        md_content += f"- **Data Source**: US SEC EDGAR XBRL\n\n"
        md_content += "## Financial Metrics Summary Table\n\n"

        if df.empty:
            md_content += "*No financial metrics found.*\n"
        else:
            # Pivot table for clean view
            pivot_df = df.pivot(index=["FiscalYear", "Period", "Form", "EndDate"], columns="Metric", values="Value").reset_index()
            pivot_df.sort_values(by=["FiscalYear", "EndDate"], ascending=False, inplace=True)
            
            # Format numbers to Billions / Millions
            formatted_df = pivot_df.copy()
            for col in ["Revenues", "GrossProfit", "OperatingIncome", "NetIncome"]:
                if col in formatted_df.columns:
                    formatted_df[col] = formatted_df[col].apply(lambda x: f"${x/1e9:.2f}B" if pd.notnull(x) and abs(x)>=1e9 else (f"${x/1e6:.2f}M" if pd.notnull(x) else "-"))
            
            md_content += formatted_df.to_markdown(index=False) + "\n\n"

        output_path = PROCESSED_DIR / f"{ticker_clean}_SEC_Report.md"
        with open(output_path, "w", encoding="utf-8") as f:
            f.write(md_content)

        return output_path
