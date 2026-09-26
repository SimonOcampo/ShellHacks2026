"""Official CBSA lookup and area/state/county derivations."""
from pathlib import Path
import geopandas as gpd
from src.common.geography import assign_points
from src.config.cities import CANDIDATES, REFERENCES
from src.config.settings import PROCESSED, GEOGRAPHY_YEAR
from .load import load_layer

STATE_ABBR = {"Alabama":"AL","Arizona":"AZ","California":"CA","Colorado":"CO","Connecticut":"CT","Florida":"FL","Georgia":"GA","Indiana":"IN","Kentucky":"KY","Missouri":"MO","New Mexico":"NM","Nevada":"NV","North Carolina":"NC","Ohio":"OH","Oklahoma":"OK","Rhode Island":"RI","Tennessee":"TN","Texas":"TX","Utah":"UT","Virginia":"VA","Wisconsin":"WI","Kansas":"KS"}
FIPS_STATE_ABBR = {"01":"AL","02":"AK","04":"AZ","05":"AR","06":"CA","08":"CO","09":"CT","10":"DE","11":"DC","12":"FL","13":"GA","15":"HI","16":"ID","17":"IL","18":"IN","19":"IA","20":"KS","21":"KY","22":"LA","23":"ME","24":"MD","25":"MA","26":"MI","27":"MN","28":"MS","29":"MO","30":"MT","31":"NE","32":"NV","33":"NH","34":"NJ","35":"NM","36":"NY","37":"NC","38":"ND","39":"OH","40":"OK","41":"OR","42":"PA","44":"RI","45":"SC","46":"SD","47":"TN","48":"TX","49":"UT","50":"VT","51":"VA","53":"WA","54":"WV","55":"WI","56":"WY"}

def _norm(s: str) -> str:
    return "".join(ch.lower() for ch in s if ch.isalnum())

def resolve_markets(cbsa: gpd.GeoDataFrame) -> dict[str, dict]:
    """Resolve all requested labels against official TIGER CBSA names."""
    records = {}
    for key, display in CANDIDATES + REFERENCES:
        city, state_name = [part.strip() for part in display.rsplit(",", 1)]
        state = STATE_ABBR[state_name]
        matches = cbsa[cbsa["NAME"].map(lambda n: _norm(city) in _norm(n))]
        matches = matches[matches["NAME"].str.contains(state, case=False, regex=False)]
        if len(matches) != 1 and key == "san_francisco_bay_area":
            matches = cbsa[cbsa["NAME"].str.contains("San Francisco", case=False, regex=False) & cbsa["NAME"].str.contains("CA", case=False, regex=False)]
        if len(matches) != 1:
            raise ValueError(f"Cannot uniquely resolve {display!r} to TIGER CBSA: {matches[['NAME','GEOID']].to_dict('records')}")
        row = matches.iloc[0]
        records[key] = {"cbsa_code": str(row.GEOID), "official_name": str(row.NAME), "display_name": display, "geometry": row.geometry}
    return records

def build_catalog(cbsa_zip: Path, county_zip: Path) -> tuple[gpd.GeoDataFrame, gpd.GeoDataFrame]:
    """Return market CBSA polygons and their full member-county assignment."""
    cbsa = load_layer(cbsa_zip)
    counties = load_layer(county_zip)
    markets = resolve_markets(cbsa)
    codes = {m["cbsa_code"] for m in markets.values()}
    selected = cbsa[cbsa.GEOID.astype(str).isin(codes)].copy()
    # TIGER statistical areas are county-based; assign every county by a point-on-surface.
    county_pts = counties.copy()
    county_pts["geometry"] = county_pts.geometry.representative_point()
    county_pts["cbsa_code"] = assign_points(county_pts, selected, "GEOID")
    joined = county_pts[county_pts.cbsa_code.notna()].copy().rename(columns={"GEOID":"county_geoid"})
    joined["GEOID_left"] = joined.county_geoid
    joined["GEOID_right"] = joined.cbsa_code
    states, areas, coords = {}, {}, {}
    for _, row in selected.iterrows():
        code = str(row.GEOID)
        member_codes = joined.loc[joined.GEOID_right == code, "GEOID_left"].astype(str)
        states[code] = sorted({FIPS_STATE_ABBR.get(fips[:2], fips[:2]) for fips in member_codes})
        # County TIGER ALAND excludes water; sum whole member counties to preserve Census CBSA composition.
        area_by_county = counties.set_index(counties.GEOID.astype(str)).ALAND
        areas[code] = float(area_by_county.reindex(member_codes).sum() / 1_000_000)
        projected = gpd.GeoSeries([row.geometry], crs=cbsa.crs).to_crs("EPSG:5070").representative_point().to_crs("EPSG:4326").iloc[0]
        coords[code] = (float(projected.y), float(projected.x))
    selected = selected.to_crs("EPSG:4326")
    selected["land_area_km2"] = selected.GEOID.map(areas)
    selected["state_codes"] = selected.GEOID.map(states)
    selected["state_fips"] = selected.GEOID.map(lambda code: sorted({str(fips)[:2] for fips in joined.loc[joined.GEOID_right == str(code), "GEOID_left"].astype(str)}))
    selected["latitude"] = selected.GEOID.map(lambda x: coords[str(x)][0])
    selected["longitude"] = selected.GEOID.map(lambda x: coords[str(x)][1])
    selected["candidate_market"] = selected.GEOID.isin([markets[k]["cbsa_code"] for k,_ in CANDIDATES])
    selected["reference_market"] = selected.GEOID.isin([markets[k]["cbsa_code"] for k,_ in REFERENCES])
    # Geographic catalog contract fields and aliases are retained in companion JSON.
    county_map = joined[["GEOID_left", "GEOID_right"]].rename(columns={"GEOID_left":"county_geoid", "GEOID_right":"cbsa_code"})
    county_map["state_fips"] = county_map.county_geoid.str[:2]
    out = PROCESSED / "intermediate"
    out.mkdir(parents=True, exist_ok=True)
    selected.to_parquet(out / "cbsa_boundaries.parquet", index=False)
    county_map.to_parquet(out / "cbsa_counties.parquet", index=False)
    selected.to_parquet(out / "cbsa_catalog.parquet", index=False)
    return selected, county_map
