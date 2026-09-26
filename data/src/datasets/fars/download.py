"""Download the NHTSA FARS national CSV archive for a specified year."""
from src.common.http import fetch
from src.config.settings import RAW

def download(year: int = 2023) -> tuple[str, str]:
    """Save the original annual national archive and return its path and SHA-256."""
    url = f"https://static.nhtsa.gov/ftp/FARS/{year}/National/FARS{year}NationalCSV.zip"
    path, digest = fetch(url, RAW / "fars" / f"FARS{year}NationalCSV.zip")
    return str(path), digest
