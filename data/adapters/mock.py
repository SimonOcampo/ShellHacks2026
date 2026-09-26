"""Deterministic synthetic release builder. Never presents estimates as public data."""

import hashlib
import json
from pathlib import Path

from contracts.models import DataRelease
from odd_ranking.engine import transform

ROOT = Path(__file__).resolve().parents[2]
# Display markers are approximate. All feature values below are synthetic.
CITIES = [
    ("33100", "Miami", "FL", 25.76, -80.19),
    ("36740", "Orlando", "FL", 28.54, -81.38),
    ("45300", "Tampa", "FL", 27.95, -82.46),
    ("27260", "Jacksonville", "FL", 30.33, -81.66),
    ("26420", "Houston", "TX", 29.76, -95.37),
    ("19100", "Dallas–Fort Worth", "TX", 32.78, -96.80),
    ("41700", "San Antonio", "TX", 29.42, -98.49),
    ("29820", "Las Vegas", "NV", 36.17, -115.14),
    ("19740", "Denver", "CO", 39.74, -104.99),
    ("42660", "Seattle", "WA", 47.61, -122.33),
    ("38900", "Portland", "OR", 45.52, -122.68),
    ("16980", "Chicago", "IL", 41.88, -87.63),
    ("14460", "Boston", "MA", 42.36, -71.06),
    ("47900", "Washington", "DC", 38.91, -77.04),
    ("37980", "Philadelphia", "PA", 39.95, -75.17),
    ("35620", "New York", "NY", 40.71, -74.01),
    ("16740", "Charlotte", "NC", 35.23, -80.84),
    ("39580", "Raleigh", "NC", 35.78, -78.64),
    ("34980", "Nashville", "TN", 36.16, -86.78),
    ("33460", "Minneapolis–St. Paul", "MN", 44.98, -93.27),
    ("38060", "Phoenix", "AZ", 33.45, -112.07),
    ("41860", "San Francisco", "CA", 37.77, -122.42),
    ("31080", "Los Angeles", "CA", 34.05, -118.24),
    ("12420", "Austin", "TX", 30.27, -97.74),
    ("12060", "Atlanta", "GA", 33.75, -84.39),
]


def build():
    registry = json.loads((ROOT / "config/ranking.v1.json").read_text())["features"]
    versions = dict(
        schema_version="1",
        data_version="mock.v1",
        model_version="ranking.v1",
        data_mode="mock",
    )
    cities = []
    source_hash = hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
    for index, (code, name, state, lat, lon) in enumerate(CITIES):
        values = [
            350 + (index * 137) % 1400,
            (index * 83) % 900,
            (index * 11) % 130,
            20 + (index * 7) % 18,
            8 + (index * 13) % 85,
            0.55 + (index % 10) * 0.045,
            900000 + (index * 713123) % 14000000,
            80 + (index * 113) % 1400,
            0.025 + (index * 0.017) % 0.21,
            0.012 + (index * 0.013) % 0.22,
        ]
        provenance_id = f"synthetic:{code}"
        cities.append(
            dict(
                versions=versions,
                city_id=f"cbsa:{code}",
                display_name=name,
                official_name=f"{name} metro (mock label; official name pending ingestion)",
                geography_type="cbsa",
                geography_vintage="synthetic-mock",
                state_codes=[state],
                latitude=lat,
                longitude=lon,
                features={
                    f["key"]: dict(
                        value=v,
                        unit=f["unit"],
                        quality="derived",
                        missing_reason=None,
                        provenance_ids=[provenance_id],
                    )
                    for f, v in zip(registry, values)
                },
                legal_evidence=[
                    dict(
                        jurisdiction=state,
                        category="unresolved",
                        summary="Regulatory review unresolved; no approval inferred.",
                        checked_at="2026-09-26",
                        provenance_ids=[],
                    )
                ],
                provenance=[
                    dict(
                        id=provenance_id,
                        source_name="Synthetic fixture generator",
                        source_url="synthetic://odd-scout/mock.v1",
                        dataset_id="synthetic-mock.v1",
                        period="Not observed",
                        retrieved_at="2026-09-26",
                        source_geography="synthetic",
                        target_geography=f"cbsa:{code}",
                        transformation="Deterministic illustrative values; no public observations.",
                        assumptions=[
                            "All ranking measurements are synthetic. Display markers approximate principal city locations."
                        ],
                        raw_sha256=source_hash,
                    )
                ],
            )
        )
    refs = [
        dict(
            id=f"mock-reference:{c[0]}",
            city_id=f"cbsa:{c[0]}",
            operator="Illustrative reference (not verified status)",
            category="commercial",
            status_as_of="2026-09-26",
            enabled=True,
            provenance_ids=[f"synthetic:{c[0]}"],
        )
        for c in CITIES[20:]
    ]
    bounds = {}
    for feature in registry:
        values = [
            transform(c["features"][feature["key"]]["value"], feature["transform"])
            for c in cities
        ]
        bounds[feature["key"]] = dict(lower=min(values), upper=max(values))
    release = DataRelease(
        versions=versions,
        candidate_ids=[c["city_id"] for c in cities[:20]],
        cities=cities,
        references=refs,
        features=registry,
        bounds=bounds,
        normalization_cohort=[c["city_id"] for c in cities],
        exclusions=[
            "No verified public-data release has been published. All displayed ranking measurements are synthetic."
        ],
    )
    path = ROOT / "data/releases/mock.v1.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(release.model_dump_json(indent=2) + "\n", encoding="utf-8")
    (ROOT / "config/references.v1.json").write_text(
        json.dumps(refs, indent=2) + "\n", encoding="utf-8"
    )
    print(path)


if __name__ == "__main__":
    build()
