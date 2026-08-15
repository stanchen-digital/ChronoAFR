import os
from pathlib import Path
from dotenv import load_dotenv

# Base directory
BASE_DIR = Path(__file__).resolve().parent

# Load .env if present
load_dotenv(BASE_DIR / ".env")

# API Keys & User Agents
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
FRED_API_KEY = os.getenv("FRED_API_KEY", "")
SEC_USER_AGENT = os.getenv("SEC_USER_AGENT", "InvestmentResearchAgent research@example.com")

# Directory Paths
DATA_DIR = BASE_DIR / "data"
RAW_DIR = DATA_DIR / "raw"
RAW_SEC_DIR = RAW_DIR / "sec"
RAW_MOPS_DIR = RAW_DIR / "mops"
RAW_FRED_DIR = RAW_DIR / "fred"

PROCESSED_DIR = DATA_DIR / "processed"
FORECAST_DIR = DATA_DIR / "forecasts"
REVIEW_DIR = DATA_DIR / "reviews"

# Auto-detect Google Drive Desktop path on Mac
def detect_google_drive_path() -> Path:
    cloud_storage = Path.home() / "Library" / "CloudStorage"
    if cloud_storage.exists():
        gdrive_dirs = list(cloud_storage.glob("GoogleDrive-*"))
        if gdrive_dirs:
            # Look for My Drive or 我的雲端硬碟
            my_drive = gdrive_dirs[0] / "My Drive"
            if not my_drive.exists():
                my_drive = gdrive_dirs[0] / "我的雲端硬碟"
            if not my_drive.exists():
                my_drive = gdrive_dirs[0]
            
            chrono_drive = my_drive / "ChronoAFR_Sync"
            chrono_drive.mkdir(parents=True, exist_ok=True)
            return chrono_drive
    
    # Fallback to local notebooklm_sync if Google Drive is not logged in yet
    local_sync = DATA_DIR / "notebooklm_sync"
    local_sync.mkdir(parents=True, exist_ok=True)
    return local_sync

NOTEBOOKLM_DIR = detect_google_drive_path()

# Ensure all directories exist
for directory in [
    DATA_DIR, RAW_DIR, RAW_SEC_DIR, RAW_MOPS_DIR, RAW_FRED_DIR,
    PROCESSED_DIR, NOTEBOOKLM_DIR, FORECAST_DIR, REVIEW_DIR
]:
    directory.mkdir(parents=True, exist_ok=True)

