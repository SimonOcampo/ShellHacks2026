"""Comparable ACS commute means from matching published worker universes."""

from __future__ import annotations

import csv
import math
from pathlib import Path

from src.common.provenance import provenance
from src.config.settings import ACS_YEAR

TABLES = ("b08013", "b08303")
DATA_SUFFIX = "__commute-B08013-B08303-r2"
METHOD = (
    "Divide B08013_E001 aggregate travel minutes by B08303_E001 workers. "
    "Both ACS universes are workers age 16+ who did not work from home."
)


def read_commutes(paths: dict[str, Path], codes: set[str]) -> dict[str, dict]:
    """Require an estimate and reported MOE from each table for every CBSA."""
    tables = {}
    for table in TABLES:
        values = {}
        with paths[table].open(encoding="utf-8-sig", newline="") as stream:
            for row in csv.DictReader(stream, delimiter="|"):
                geo = row["GEO_ID"].strip()
                code = geo[-5:]
                if not geo.startswith("310M") or code not in codes:
                    continue
                if code in values:
                    raise ValueError(f"Duplicate ACS {table} CBSA {code}")
                parsed = {}
                for suffix in ("E001", "M001"):
                    column = f"{table.upper()}_{suffix}"
                    try:
                        value = float(row[column])
                    except (KeyError, TypeError, ValueError) as exc:
                        raise ValueError(f"Missing ACS {column} for {code}") from exc
                    if not math.isfinite(value) or value < 0:
                        raise ValueError(f"Invalid ACS {column} for {code}: {value}")
                    parsed[column] = value
                values[code] = parsed
        missing = codes - values.keys()
        if missing:
            raise ValueError(f"Missing ACS {table} CBSAs: {sorted(missing)}")
        tables[table] = values
    result = {}
    for code in sorted(codes):
        inputs = {**tables["b08013"][code], **tables["b08303"][code]}
        if inputs["B08303_E001"] <= 0:
            raise ValueError(f"ACS commute denominator must be positive: {code}")
        result[code] = {
            **inputs,
            "mean_commute_minutes": inputs["B08013_E001"] / inputs["B08303_E001"],
        }
    return result


def commute_sources(paths: dict[str, Path], year: int = ACS_YEAR):
    """Keep numerator, denominator, raw hashes, and uncertainty traceable."""
    return [
        provenance(
            source_name="U.S. Census ACS 5-Year Summary File",
            source_url=(
                f"https://www2.census.gov/programs-surveys/acs/summary_file/{year}/"
                f"table-based-SF/data/5YRData/acsdt5y{year}-{table}.dat"
            ),
            dataset_id=f"acs_summary_{year}_{table}",
            period=str(year),
            raw_path=paths[table],
            source_geography="Published Census CBSA estimates and margins of error",
            target_geography="Official Census CBSA",
            transformation=METHOD,
            assumptions=[
                "Use the same two tables for every candidate and reference; no profile fallback or imputation.",
                "Input MOEs are retained and checked. They are not a derived confidence interval for the ratio.",
                "The unrounded ratio of published estimates can differ from the rounded DP03 profile mean.",
            ],
        )
        for table in TABLES
    ]
