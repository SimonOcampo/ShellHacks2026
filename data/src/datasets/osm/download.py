"""Download Geofabrik state extracts required by the resolved market footprints."""
from src.common.http import fetch
from src.config.settings import RAW

STATE_NAMES = {"AL":"alabama","AR":"arkansas","AZ":"arizona","CA":"california","CO":"colorado","CT":"connecticut","FL":"florida","GA":"georgia","IN":"indiana","KS":"kansas","KY":"kentucky","MA":"massachusetts","MO":"missouri","MS":"mississippi","NC":"north-carolina","NM":"new-mexico","NV":"nevada","OH":"ohio","OK":"oklahoma","RI":"rhode-island","TN":"tennessee","TX":"texas","UT":"utah","VA":"virginia","WI":"wisconsin"}

def download(states: set[str]) -> dict[str, tuple[str, str]]:
    """Preserve complete state OSM PBFs; this is a large optional download."""
    result = {}
    for code in sorted(states):
        if code not in STATE_NAMES:
            raise ValueError(f"No Geofabrik slug configured for state {code}")
        url = f"https://download.geofabrik.de/north-america/us/{STATE_NAMES[code]}-latest.osm.pbf"
        path, digest = fetch(url, RAW / "osm" / f"{code.lower()}-latest.osm.pbf", timeout=300)
        result[code] = (str(path), digest)
    return result
