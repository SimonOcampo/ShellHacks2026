"""Validate a prepared standard release, freeze normalization, then publish atomically."""

import argparse
import hashlib
import json
from pathlib import Path

from contracts.models import DataRelease, RankingRequest
from odd_ranking.engine import rank, transform


def freeze(payload):
    specs = payload["features"]
    complete = [
        city
        for city in payload["cities"]
        if all(
            city["features"].get(f["key"], {}).get("value") is not None for f in specs
        )
    ]
    if not complete:
        raise ValueError("No complete normalization cohort")
    payload["normalization_cohort"] = sorted(c["city_id"] for c in complete)
    payload["bounds"] = {}
    for feature in specs:
        values = [
            transform(c["features"][feature["key"]]["value"], feature["transform"])
            for c in complete
        ]
        payload["bounds"][feature["key"]] = dict(lower=min(values), upper=max(values))
        if min(values) == max(values):
            payload.setdefault("exclusions", []).append(
                f"Constant feature disabled globally: {feature['key']}"
            )
    return DataRelease.model_validate(payload)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("prepared", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--manifest-dir", type=Path, default=Path("data/manifests"))
    args = parser.parse_args()
    release = freeze(json.loads(args.prepared.read_text(encoding="utf-8")))
    if release.versions.data_mode != "verified":
        raise ValueError(
            "Publisher accepts verified releases only; use adapters.mock for fixtures"
        )
    hashes = set()
    for path in args.manifest_dir.glob("*.json"):
        manifest = json.loads(path.read_text())
        raw = Path(manifest["path"])
        if (
            raw.exists()
            and hashlib.sha256(raw.read_bytes()).hexdigest() == manifest["sha256"]
        ):
            hashes.add(manifest["sha256"])
    for city in release.cities:
        for provenance in city.provenance:
            if provenance.raw_sha256 not in hashes:
                raise ValueError(f"Raw evidence missing or changed: {provenance.id}")
    if len(rank(release, RankingRequest()).ranked) < 8:
        raise ValueError("At least eight complete verified candidate metros required")
    serialized = release.model_dump_json(indent=2) + "\n"
    if args.output.exists():
        if args.output.read_text(encoding="utf-8") == serialized:
            print("Unchanged release; retry is idempotent")
            return
        raise ValueError(
            "Release already exists with different content; publish a new version"
        )
    args.output.parent.mkdir(parents=True, exist_ok=True)
    temp = args.output.with_suffix(".tmp")
    temp.write_text(serialized, encoding="utf-8")
    temp.replace(args.output)
    print(args.output)


if __name__ == "__main__":
    main()
