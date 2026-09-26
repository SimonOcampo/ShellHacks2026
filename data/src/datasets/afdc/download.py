"""AFDC station snapshot downloader (requires the user's own NREL/AFDC API key)."""
import os
from src.common.http import fetch
from src.config.settings import RAW

URL = "https://developer.nlr.gov/api/alt-fuel-stations/v1.json"

def download():
    """Retrieve active U.S. public electric stations; errors are not replaced with fixtures."""
    key = os.getenv("NREL_API_KEY")
    if not key:
        raise RuntimeError("Set NREL_API_KEY to retrieve AFDC data; the pipeline will not substitute sample stations.")
    return fetch(URL, RAW / "afdc" / "active_us_public_electric_stations.json",
                 params={"api_key": key, "fuel_type": "ELEC", "status": "E", "access": "public", "limit": "all"})
