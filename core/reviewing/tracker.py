import json
from datetime import datetime
from pathlib import Path
from typing import Dict, Any, List, Optional
from config import REVIEW_DIR

class ForecastTracker:
    """Tracker to record forecast history and versions for post-mortem reviewing."""

    HISTORY_FILE = REVIEW_DIR / "forecast_history.json"

    def __init__(self):
        self.history: List[Dict[str, Any]] = self._load_history()

    def _load_history(self) -> List[Dict[str, Any]]:
        if self.HISTORY_FILE.exists():
            try:
                with open(self.HISTORY_FILE, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception as e:
                print(f"[Tracker] Warning loading history: {e}")
        return []

    def save_forecast(self, ticker: str, forecast_data: Dict[str, Any], notes: str = "") -> str:
        """Save a forecast entry with a timestamped version ID."""
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        version_id = f"{ticker.upper()}_{timestamp}"

        entry = {
            "VersionID": version_id,
            "Ticker": ticker.upper(),
            "Timestamp": datetime.now().isoformat(),
            "Notes": notes,
            "ForecastData": forecast_data
        }

        self.history.append(entry)
        with open(self.HISTORY_FILE, "w", encoding="utf-8") as f:
            json.dump(self.history, f, ensure_ascii=False, indent=2)

        return version_id

    def get_latest_forecast(self, ticker: str) -> Optional[Dict[str, Any]]:
        """Get latest recorded forecast for a ticker."""
        ticker_clean = ticker.upper()
        for entry in reversed(self.history):
            if entry["Ticker"] == ticker_clean:
                return entry
        return None
