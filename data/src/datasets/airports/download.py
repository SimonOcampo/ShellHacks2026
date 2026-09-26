"""Download a BTS T-100 extract from an operator-supplied official export URL."""
from src.common.http import fetch
from src.config.settings import RAW

def download(source_url: str, vintage: str) -> tuple[str, str]:
    """Persist the user-selected BTS T-100 export; the TranStats query is parameterized upstream."""
    path, digest=fetch(source_url,RAW/"airports"/f"t100_{vintage}.csv",timeout=180)
    return str(path),digest
