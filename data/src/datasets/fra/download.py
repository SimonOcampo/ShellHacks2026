"""Download the FRA grade-crossing export URL explicitly selected from its data portal."""
from src.common.http import fetch
from src.config.settings import RAW

def download(source_url: str, vintage: str="current"):
    """Persist official source bytes without guessing a mutable portal export URL."""
    return fetch(source_url,RAW/"fra"/f"grade_crossings_{vintage}.csv",timeout=180)
