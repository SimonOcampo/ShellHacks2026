"""Download immutable public snapshots; never run during server startup."""

import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import os

import httpx

ROOT = Path(__file__).resolve().parents[2]


def download(source, url, params, dataset, geography, period, suffix="json"):
    response = httpx.get(url, params=params, timeout=90, follow_redirects=True)
    if response.is_error:
        raise ValueError(
            f"{source} download failed with HTTP {response.status_code}; credentials are omitted from diagnostics"
        )
    if "json" in response.headers.get("content-type", ""):
        parsed = response.json()
        if source == "afdc" and len(parsed.get("fuel_stations", [])) != parsed.get(
            "total_results"
        ):
            raise ValueError("Incomplete AFDC response; no snapshot published")
    elif source in ("acs", "afdc"):
        raise ValueError(
            f"{source} returned non-JSON; check API access/key. No snapshot published."
        )
    payload = response.content
    sha = hashlib.sha256(payload).hexdigest()
    raw = ROOT / "data/raw" / f"{source}-{sha}.{suffix}"
    raw.parent.mkdir(parents=True, exist_ok=True)
    if raw.exists():
        if raw.read_bytes() != payload:
            raise ValueError("Snapshot hash collision")
    else:
        with raw.open("xb") as file:
            file.write(payload)
    manifest = dict(
        source=source,
        source_url=url,
        parameters={k: v for k, v in params.items() if k not in ("key", "api_key")},
        dataset_id=dataset,
        period=period,
        geography=geography,
        retrieved_at=datetime.now(timezone.utc).isoformat(),
        sha256=sha,
        path=str(raw.relative_to(ROOT)).replace("\\", "/"),
        license="See official dataset terms; public source does not imply endorsement.",
    )
    out = ROOT / "data/manifests" / f"{source}-{sha}.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    if not out.exists():
        out.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(out)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("source", choices=["acs", "afdc", "noaa"])
    parser.add_argument("--station", help="NOAA station ID for annual/seasonal normals")
    args = parser.parse_args()
    if args.source == "acs":
        key = os.getenv("CENSUS_API_KEY")
        if not key:
            parser.error(
                "Set CENSUS_API_KEY locally. Current Census API requires a key."
            )
        variables = [
            "NAME",
            "B01003_001E",
            "B01003_001M",
            "B08201_001E",
            "B08201_001M",
            "B08201_002E",
            "B08201_002M",
            "B08301_001E",
            "B08301_001M",
            "B08301_010E",
            "B08301_010M",
        ]
        variables += [
            f"B08303_{i:03d}{suffix}" for i in range(1, 14) for suffix in ("E", "M")
        ]
        download(
            "acs",
            "https://api.census.gov/data/2024/acs/acs5",
            {
                "get": ",".join(variables),
                "for": "metropolitan statistical area/micropolitan statistical area:*",
                "key": key,
            },
            "ACS 2024 five-year",
            "CBSA",
            "2020–2024",
        )
    elif args.source == "afdc":
        download(
            "afdc",
            "https://developer.nlr.gov/api/alt-fuel-stations/v1.json",
            {
                "api_key": os.getenv("AFDC_API_KEY", "DEMO_KEY"),
                "fuel_type": "ELEC",
                "access": "public",
                "status": "E",
                "limit": "all",
            },
            "AFDC operational public electric stations",
            "station points",
            "current snapshot",
        )
    else:
        import re

        if not args.station or not re.fullmatch(r"US[A-Z0-9]{9}", args.station):
            parser.error("Provide --station with an 11-character U.S. NOAA station ID")
        download(
            "noaa",
            f"https://www.ncei.noaa.gov/data/normals-annualseasonal/1991-2020/access/{args.station}.csv",
            {},
            "NOAA annual/seasonal climate normals",
            f"station:{args.station}",
            "1991–2020",
            suffix="csv",
        )


if __name__ == "__main__":
    main()
