"""Publish the bounded commute/provenance correction to immutable verified.v1.

Unchanged source checks are inherited from the committed, hash-matched v1 audit.
Only the two new Census tables are needed locally; this is not a full raw replay.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

from contracts.models import DataRelease, RankingRequest
from odd_ranking.engine import rank
from odd_ranking.normalization import freeze_bounds

from src.common.http import fetch
from src.datasets.acs.commute import (
    DATA_SUFFIX,
    METHOD,
    TABLES,
    commute_sources,
    read_commutes,
)
from src.datasets.acs.summary_file import BASE
from src.pipeline.export_release import ROOT, validate_rankable, write_immutable

PARENT = ROOT / "data/releases/verified.v1.json"
PARENT_AUDIT = ROOT / "data/audits/verified-source-checks.json"
OUTPUT = ROOT / "data/releases/verified.v2.json"
AUDIT = ROOT / "data/audits/verified.v2-source-checks.json"
RAW = ROOT / "data/data/raw/acs/summary_file"
PARENT_SHA256 = "e5099e4612908ced11403498afd6ab62953a44c0b1777c2ef0a19b51dfe737c6"


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def correct_release(parent: DataRelease, paths: dict[str, Path]):
    """Change only commute inputs, the AFDC hostname, versions, and frozen bounds."""
    codes = {city.city_id.removeprefix("cbsa:") for city in parent.cities}
    observations = read_commutes(paths, codes)
    sources = [source.model_dump(mode="json") for source in commute_sources(paths)]
    payload = parent.model_dump(mode="json")
    payload["versions"]["data_version"] += DATA_SUFFIX
    for city in payload["cities"]:
        city["versions"] = dict(payload["versions"])
        code = city["city_id"].removeprefix("cbsa:")
        city["features"]["mean_commute_minutes"] = {
            "value": observations[code]["mean_commute_minutes"],
            "unit": "minutes",
            "quality": "derived",
            "missing_reason": None,
            "provenance_ids": [source["id"] for source in sources],
        }
        # Preserve the original raw hash and retrieval date: this corrects a URL,
        # not a charging snapshot or its measurements.
        for source in city["provenance"]:
            if source["source_url"].startswith("https://developer.nrel.gov/"):
                source["source_url"] = source["source_url"].replace(
                    "https://developer.nrel.gov/", "https://developer.nlr.gov/", 1
                )
        city["provenance"].extend(sources)
    release = DataRelease.model_validate(payload)
    payload["bounds"] = {
        key: bound.model_dump(mode="json")
        for key, bound in freeze_bounds(
            {city.city_id: city for city in release.cities},
            release.features,
            release.normalization_cohort,
        ).items()
    }
    corrected = DataRelease.model_validate(payload)
    validate_rankable(corrected)
    return corrected, observations


def prepare(paths: dict[str, Path]):
    """Require the exact audited parent before carrying forward unchanged evidence."""
    previous = json.loads(PARENT_AUDIT.read_text(encoding="utf-8"))
    if previous["release_sha256"] != sha(PARENT) or sha(PARENT) != PARENT_SHA256:
        raise ValueError("Parent release does not match its recorded source audit")
    parent = DataRelease.model_validate_json(PARENT.read_bytes())
    before = rank(parent, RankingRequest())
    if previous["default_ranking_id"] != before.ranking_id:
        raise ValueError("Parent ranking does not match its recorded source audit")
    corrected, observations = correct_release(parent, paths)
    if AUDIT.exists():
        recorded = json.loads(AUDIT.read_text(encoding="utf-8"))
        if not OUTPUT.exists() or recorded["release_sha256"] != sha(OUTPUT):
            raise ValueError("Published correction does not match its recorded audit")
        issued = DataRelease.model_validate_json(OUTPUT.read_bytes())
        dates = {
            (source.id, source.raw_sha256): source.retrieved_at
            for city in issued.cities
            for source in city.provenance
        }
        # Reacquiring identical bytes must not rewrite the original citation date.
        for city in corrected.cities:
            for source in city.provenance:
                if source.id in city.features["mean_commute_minutes"].provenance_ids:
                    source.retrieved_at = dates[(source.id, source.raw_sha256)]
    after = rank(corrected, RankingRequest())
    manifest = ROOT / "data/data/processed/manifests/data_manifest.json"
    known_hashes = {
        item["sha256"] for item in json.loads(manifest.read_text())["datasets"]
    }
    known_hashes.update(sha(path) for path in paths.values())
    if any(
        source.raw_sha256 not in known_hashes
        for city in corrected.cities
        for source in city.provenance
    ):
        raise ValueError(
            "Corrected release provenance does not resolve to recorded source hashes"
        )
    report = {
        "verification_scope": "Incremental correction; unchanged source checks inherit the hash-matched committed parent audit, not a fresh raw replay.",
        "parent_release": PARENT.relative_to(ROOT).as_posix(),
        "parent_sha256": sha(PARENT),
        "parent_audit": PARENT_AUDIT.relative_to(ROOT).as_posix(),
        "parent_audit_sha256": sha(PARENT_AUDIT),
        "parent_manifest_sha256": sha(manifest),
        "inherited_checks": [
            "demographic ACS estimates and MOEs",
            "NOAA values, flags, and station selection",
            "AFDC counts and geographic joins",
            "dated reference status",
            "historical raw hashes and provenance resolution",
        ],
        "fresh_checks": [
            "35 matching-universe commute ratios and both input MOEs",
            "AFDC provenance hostname correction",
            "canonical contracts",
            "frozen bounds",
            "ranking eligibility",
        ],
        "commute_method": METHOD,
        "commute_observations": observations,
        "new_sources": [
            {
                "raw_path": path.relative_to(ROOT).as_posix(),
                "sha256": sha(path),
                "bytes": path.stat().st_size,
                "source_url": BASE.format(year=2024, table=table),
            }
            for table, path in sorted(paths.items())
        ],
        "afdc_url_correction": "developer.nrel.gov to developer.nlr.gov; preserved raw hashes, dates, and all charging measurements",
        "ranked_candidates": len(after.ranked),
        "unranked_candidates": len(after.unranked),
        "enabled_references": sum(ref.enabled for ref in corrected.references),
        "default_ranking_id": after.ranking_id,
        "publication_limitations": [],
        "remaining_limitations": [
            "Inherited source checks require the original off-repository raw bundle for a full independent replay.",
            "NOAA station proxies include representative, provisional, and estimated normals, as recorded in the parent audit.",
            "Input ACS MOEs are not confidence intervals for the derived mean or market score.",
        ],
    }
    return corrected, report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--download", action="store_true")
    args = parser.parse_args()
    paths = {table: RAW / f"acsdt5y2024-{table}.dat" for table in TABLES}
    if args.download:
        for table, path in paths.items():
            fetch(BASE.format(year=2024, table=table), path, timeout=120)
    release, report = prepare(paths)
    write_immutable(release, OUTPUT)
    report["release_path"] = OUTPUT.relative_to(ROOT).as_posix()
    report["release_sha256"] = sha(OUTPUT)
    content = json.dumps(report, indent=2, sort_keys=True) + "\n"
    if AUDIT.exists() and AUDIT.read_text(encoding="utf-8") != content:
        raise FileExistsError(f"Refusing to overwrite correction audit: {AUDIT}")
    if not AUDIT.exists():
        with AUDIT.open("x", encoding="utf-8", newline="\n") as stream:
            stream.write(content)
    print(
        f"Validated {OUTPUT.name}: {report['ranked_candidates']} candidates, sha256={report['release_sha256']}"
    )


if __name__ == "__main__":
    main()
