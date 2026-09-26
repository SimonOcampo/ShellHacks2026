"""Keyless official Census ACS table-based Summary File ingestion."""
from __future__ import annotations
from pathlib import Path
import pandas as pd
from .commute import read_commutes
from src.common.http import fetch
from src.config.settings import ACS_YEAR, RAW, PROCESSED

BASE="https://www2.census.gov/programs-surveys/acs/summary_file/{year}/table-based-SF/data/5YRData/acsdt5y{year}-{table}.dat"
TABLES={"b01003":["GEO_ID","B01003_E001"],"b08201":["GEO_ID","B08201_E001","B08201_E002"],"b08301":["GEO_ID","B08301_E001","B08301_E010"],"b08013":["GEO_ID","B08013_E001"],"b08303":["GEO_ID","B08303_E001"]}
TABLE_LABELS={"b01003":"ACS detailed table B01003 population","b08201":"ACS detailed table B08201 households by vehicles available","b08301":"ACS detailed table B08301 commute mode","b08013":"ACS detailed table B08013 aggregate travel time excluding home workers","b08303":"ACS detailed table B08303 travel time excluding home workers"}
MOE_COLUMNS={
    "b01003": ("B01003_E001", "B01003_M001"),
    "b08201": ("B08201_E001", "B08201_M001", "B08201_E002", "B08201_M002"),
    "b08301": ("B08301_E001", "B08301_M001", "B08301_E010", "B08301_M010"),
    "b08136": ("B08136_E001", "B08136_M001"),
    "b08013": ("B08013_E001", "B08013_M001"),
    "b08303": ("B08303_E001", "B08303_M001"),
}
CONTROLLED_TOTAL_MOE = -555555555

def download(year: int=ACS_YEAR) -> dict[str,Path]:
    """Download only the required official tables, not the full Summary File archive."""
    out={}
    for table in TABLES:
        url=BASE.format(year=year,table=table)
        path,_=fetch(url,RAW/"acs"/"summary_file"/f"acsdt5y{year}-{table}.dat",timeout=300)
        out[table]=path
    return out

def _read(path: Path, table: str) -> pd.DataFrame:
    frame=pd.read_csv(path,sep="|",usecols=TABLES[table],dtype={"GEO_ID":"string"},low_memory=False)
    frame["GEO_ID"]=frame.GEO_ID.str.strip()
    return frame

def _num(value):
    try:
        result=float(value)
        return result if result>=0 else None
    except (TypeError,ValueError):
        return None


def inspect_margins(paths: dict[str, Path], cbsa_codes: set[str]) -> dict[str, dict]:
    """Check the published ACS estimates and MOEs used by configured CBSAs."""
    report = {code: {} for code in cbsa_codes}
    for table, columns in MOE_COLUMNS.items():
        if table not in paths:
            continue
        frame = pd.read_csv(paths[table], sep="|", usecols=["GEO_ID", *columns],
                            dtype={"GEO_ID": "string"}, low_memory=False)
        rows = _cbsa_rows(frame)
        rows = rows.loc[rows.cbsa_code.isin(cbsa_codes)]
        if rows.cbsa_code.duplicated().any():
            raise ValueError(f"Duplicate ACS CBSA rows in {table}")
        for row in rows.itertuples(index=False):
            values = {}
            for column in columns:
                value = getattr(row, column)
                if pd.isna(value):
                    raise ValueError(f"Missing ACS {column} for {row.cbsa_code}")
                parsed = int(value)
                if column.endswith("M001") and table == "b01003" and parsed == CONTROLLED_TOTAL_MOE:
                    values[column] = {"status": "controlled_total", "value": None}
                elif parsed < 0:
                    raise ValueError(f"Invalid ACS {column} for {row.cbsa_code}: {parsed}")
                else:
                    values[column] = {"status": "reported", "value": parsed}
            report[row.cbsa_code][table] = values
    for code, tables in report.items():
        if any(table not in tables for table in ("b01003", "b08201", "b08301")):
            raise ValueError(f"ACS demographic MOEs incomplete for CBSA {code}")
    return report

def _cbsa_rows(frame: pd.DataFrame) -> pd.DataFrame:
    # Table-based SF uses summary level 310 with a year-specific geography
    # component (for 2024 it is 700, not the API's 500 component).
    mask=frame.GEO_ID.str.match(r"^310M\d{3}US\d{5}$",na=False)
    result=frame.loc[mask].copy()
    result["cbsa_code"]=result.GEO_ID.str.extract(r"US(\d{5})$",expand=False)
    return result

def process(paths: dict[str,Path], county_map) -> dict[str,dict]:
    """Use published CBSA estimates, county population values, and aggregate commute minutes."""
    tables={key:_read(paths[key],key) for key in TABLES}
    cbsa_codes=set(_cbsa_rows(tables["b01003"]).cbsa_code)
    county_to_cbsa={str(r.county_geoid):str(r.cbsa_code) for r in county_map.itertuples(index=False)}
    county_pop={code:{} for code in set(county_to_cbsa.values())}
    population_table=tables["b01003"]
    for row in population_table.loc[population_table.GEO_ID.str.startswith("0500000US")].itertuples(index=False):
        county=str(row.GEO_ID).removeprefix("0500000US")
        if county in county_to_cbsa:
            value=_num(row.B01003_E001)
            if value is not None: county_pop[county_to_cbsa[county]][county]=int(value)
    maps={}
    for key,frame in tables.items():
        if key=="b01003":
            cols={"population":"B01003_E001"}
        elif key=="b08201":
            cols={"households":"B08201_E001","zero_vehicle_households":"B08201_E002"}
        elif key=="b08301":
            cols={"workers":"B08301_E001","transit_workers":"B08301_E010"}
        else:
            continue
        market=_cbsa_rows(frame)
        maps[key]={row.cbsa_code:{name:_num(getattr(row,col)) for name,col in cols.items()} for row in market.itertuples(index=False)}
    commutes = read_commutes(paths, set(county_to_cbsa.values()))
    result={}
    for code in cbsa_codes:
        try:
            pop=maps["b01003"][code]["population"]
            hh=maps["b08201"][code]["households"]
            zero=maps["b08201"][code]["zero_vehicle_households"]
            workers=maps["b08301"][code]["workers"]
            transit=maps["b08301"][code]["transit_workers"]
        except KeyError:
            continue
        if None in (pop,hh,zero,workers,transit): continue
        result[code]={"population":int(pop),"households":int(hh),"zero_vehicle_households":int(zero),"workers":int(workers),"transit_workers":int(transit),"mean_commute_minutes":commutes.get(code,{}).get("mean_commute_minutes"),"zero_vehicle_household_share":zero/hh if hh else None,"transit_commute_share":transit/workers if workers else None,"county_populations":county_pop.get(code,{}),"year":ACS_YEAR,"source_mode":"summary_file"}
    return result

def build_tract_features(paths: dict[str,Path], county_map) -> Path:
    """Join table-based ACS estimates by tract GEO_ID and retain full target-CBSA tracts."""
    target_counties={str(r.county_geoid):str(r.cbsa_code) for r in county_map.itertuples(index=False)}
    merged=None
    for table in TABLES:
        frame=_read(paths[table],table)
        tract=frame[frame.GEO_ID.str.startswith("1400000US")].copy()
        tract["tract_geoid"]=tract.GEO_ID.str.removeprefix("1400000US")
        tract["county_geoid"]=tract.tract_geoid.str[:5]
        tract=tract[tract.county_geoid.isin(target_counties)]
        merged=tract if merged is None else merged.merge(tract,on=["GEO_ID","tract_geoid","county_geoid"],how="outer",suffixes=("",f"_{table}"))
    if merged is None or merged.empty: raise ValueError("ACS Summary File contained no tracts in the target CBSAs")
    merged["cbsa_code"]=merged.county_geoid.map(target_counties)
    target=PROCESSED/"intermediate"/"tract_features.parquet"; target.parent.mkdir(parents=True,exist_ok=True)
    merged.to_parquet(target,index=False)
    return target
