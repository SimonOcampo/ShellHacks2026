"""Environment-backed paths and vintages."""
import os
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]
try:
    from dotenv import load_dotenv
    load_dotenv(ROOT / ".env")
except ImportError:
    pass
DATA = ROOT / "data"
RAW = DATA / "raw"
PROCESSED = DATA / "processed"
CACHE = DATA / "cache"
ACS_YEAR = int(os.getenv("ODD_SCOUT_ACS_YEAR", "2024"))
GEOGRAPHY_YEAR = int(os.getenv("ODD_SCOUT_GEOGRAPHY_YEAR", "2024"))
NOAA_PERIOD = os.getenv("ODD_SCOUT_NOAA_PERIOD", "1991-2020")
MODEL_VERSION = "city-feature-v1"
