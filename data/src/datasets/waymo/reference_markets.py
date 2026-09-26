"""Build Waymo market metadata from the official public rides page snapshot."""
from datetime import datetime, timezone
from pathlib import Path
import re
from src.common.http import fetch
from src.config.datasets import WAYMO_URL
from src.config.settings import RAW, PROCESSED
from src.config.cities import REFERENCES
from src.contracts.models import ReferenceMarket
from src.common.provenance import provenance
from src.datasets.census_geography.process import resolve_markets

def build(cbsa: dict[str, dict]) -> tuple[list[ReferenceMarket], object]:
    """Download Waymo's page, assign each requested reference status from its sections."""
    path, _ = fetch(WAYMO_URL, RAW / "waymo" / "rides.html")
    html = path.read_text(encoding="utf-8", errors="replace")
    # Source headings and city/state labels are rendered into the public page body.
    text = re.sub(r"<[^>]+>", " ", html)
    text = re.sub(r"\s+", " ", text)
    marker = "Serving Riders In"
    upcoming_marker = "Up Next"
    if marker not in text or upcoming_marker not in text:
        raise RuntimeError(f"Waymo page no longer exposes expected market sections; inspect {path}")
    serving = text.split(marker, 1)[1].split(upcoming_marker, 1)[0]
    upcoming = text.split(upcoming_marker, 1)[1].split("Sign up for updates", 1)[0]
    src = provenance(source_name="Waymo Ride Service Locations", source_url=WAYMO_URL, dataset_id="waymo_rides_markets", period=datetime.now(timezone.utc).date().isoformat(), raw_path=path, source_geography="market list", target_geography="Census CBSA reference market", transformation="Market status assigned only when the exact requested city name and state abbreviation appear in the official Serving Riders In or Up Next section.", assumptions=["A metro label is matched to the official page's city/state label.", "Current page contents represent status at retrieval time."])
    out = []
    for key, display in REFERENCES:
        city, state = [p.strip() for p in display.rsplit(",", 1)]
        short = {"Arizona":"AZ","California":"CA","Texas":"TX","Georgia":"GA","Colorado":"CO","Florida":"FL","Tennessee":"TN","Nevada":"NV"}[state]
        label = f"{city}, {short}"
        in_serving = label.lower() in serving.lower()
        in_upcoming = label.lower() in upcoming.lower()
        if in_serving == in_upcoming:
            raise ValueError(f"Waymo status is ambiguous or absent for {label!r}; no status will be inferred.")
        cat = "commercial" if in_serving else "announced"
        out.append(ReferenceMarket(id=f"waymo-{key}", city_id=cbsa[key]["cbsa_code"], operator="Waymo", category=cat,
                                   status_as_of=src.retrieved_at, enabled=in_serving, provenance_ids=[src.id]))
    dest = PROCESSED / "reference_markets"; dest.mkdir(parents=True, exist_ok=True)
    (dest / "reference_markets.json").write_text(__import__("json").dumps([x.model_dump(mode="json") for x in out], indent=2), encoding="utf-8")
    (dest / "reference_markets_provenance.json").write_text(__import__("json").dumps(src.model_dump(mode="json"), indent=2), encoding="utf-8")
    return out, src
