"""Retrieve NOAA station metadata and 1991-2020 station climate normals."""
import json, math
from pathlib import Path
from urllib.parse import urlencode
from src.config.settings import RAW, NOAA_PERIOD
from src.common.http import fetch

STATIONS_URL="https://services2.arcgis.com/C8EMgrsFcRFL6LrL/ArcGIS/rest/services/stations_ncei/FeatureServer/20/query"
NORMALS_URL="https://www.ncei.noaa.gov/access/services/data/v1"
HOT_DAY_DATATYPE = "ANN-TMAX-AVGNDS-GRTH090"

def download_station_inventory() -> tuple[list[tuple[dict, Path]], list[Path]]:
    """Page through NOAA's official 1991-2020 station layer and preserve raw JSON pages."""
    result=[]; raw_pages=[]; offset=0; page_size=2000
    while True:
        path,_=fetch(STATIONS_URL,RAW/"noaa"/f"station_inventory_{NOAA_PERIOD}_{offset:06d}.json",
                     params={"where":"1=1","outFields":"STATION_ID,STATION_NAME,STATE,LATITUDE,LONGITUDE","returnGeometry":"true","outSR":"4326","resultOffset":offset,"resultRecordCount":page_size,"f":"json"},timeout=90)
        payload=json.loads(path.read_text(encoding="utf-8")); features=payload.get("features",[])
        result.extend((f["attributes"],path) for f in features); raw_pages.append(path)
        if not features or len(features)<page_size or not payload.get("exceededTransferLimit",False): break
        offset+=len(features)
    if not result: raise RuntimeError("NOAA station inventory returned no features")
    return result,raw_pages

def _distance_km(lat1,lon1,lat2,lon2):
    radius=6371.0088; p1,p2=math.radians(lat1),math.radians(lat2)
    dp=math.radians(lat2-lat1); dl=math.radians(lon2-lon1)
    a=math.sin(dp/2)**2+math.cos(p1)*math.cos(p2)*math.sin(dl/2)**2
    return radius*2*math.asin(math.sqrt(a))

def download_market_normals(boundaries) -> dict[str, dict]:
    """Select precipitation stations and qualifying 90 F normal stations for each CBSA."""
    stations,raw_pages=download_station_inventory(); station_rows=[]
    for row,inventory_path in stations:
        try:
            lat=float(row["LATITUDE"]); lon=float(row["LONGITUDE"]); sid=str(row["STATION_ID"])
        except (TypeError,ValueError,KeyError): continue
        # Standard COOP and airport station normals carry precipitation/snowfall;
        # US1 volunteer gauges commonly expose precipitation only.
        if sid.startswith(("USC", "USW")) and -90<=lat<=90 and -180<=lon<=180:
            station_rows.append((sid,str(row.get("STATION_NAME","")),lat,lon,inventory_path))
    if not station_rows: raise RuntimeError("NOAA inventory has no station coordinates")
    selected={}
    for _,market in boundaries.iterrows():
        code=str(market.GEOID); lat=float(market.latitude); lon=float(market.longitude)
        sid,name,slat,slon,inventory_path=min(station_rows,key=lambda s:_distance_km(lat,lon,s[2],s[3]))
        params={"dataset":f"normals-annualseasonal-{NOAA_PERIOD}","stations":sid,"dataTypes":"ANN-PRCP-NORMAL,ANN-SNOW-NORMAL","format":"json"}
        path,digest=fetch(NORMALS_URL,RAW/"noaa"/"normals"/f"{sid}_{NOAA_PERIOD}.json",params=params,timeout=90)
        payload=json.loads(path.read_text(encoding="utf-8"))
        if not payload or not isinstance(payload,list): raise RuntimeError(f"NOAA normals unavailable for station {sid}")
        selected[code]={"station_id":sid,"station_name":name,"station_latitude":slat,"station_longitude":slon,"distance_km":_distance_km(lat,lon,slat,slon),"raw_path":str(path),"sha256":digest,"response":payload[0],"source_url":f"{NORMALS_URL}?{urlencode(params)}","inventory_path":str(inventory_path),"inventory_url":STATIONS_URL}
        selected[code]["hot_day_stations"] = _download_hot_day_stations(
            code, lat, lon, station_rows, inventory_path
        )
    return selected

def _download_hot_day_stations(cbsa: str, lat: float, lon: float, station_rows: list, inventory_path: Path) -> list[dict]:
    """Fetch up to three nearest 1991-2020 NOAA annual counts for Tmax >= 90 F."""
    datatype = HOT_DAY_DATATYPE
    candidates = sorted(
        ((_distance_km(lat, lon, row[2], row[3]), row) for row in station_rows),
        key=lambda item: item[0],
    )
    selected = []
    for distance, (sid, name, slat, slon, station_inventory_path) in candidates:
        if distance > 100:
            break
        params = {
            "dataset": f"normals-annualseasonal-{NOAA_PERIOD}",
            "stations": sid,
            "dataTypes": datatype,
            "format": "json",
        }
        path, digest = fetch(
            NORMALS_URL,
            RAW / "noaa" / "hot_days" / f"{sid}_{NOAA_PERIOD}_ge90f.json",
            params=params,
            timeout=90,
        )
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
            raw = payload[0].get(datatype) if isinstance(payload, list) and payload else None
            value = float(raw)
            if not math.isfinite(value) or value < 0:
                continue
        except (OSError, ValueError, TypeError, json.JSONDecodeError, AttributeError, RuntimeError):
            continue
        selected.append({
            "station_id": sid,
            "station_name": name,
            "distance_km": distance,
            "latitude": slat,
            "longitude": slon,
            "value": value,
            "raw_path": str(path),
            "sha256": digest,
            "source_url": f"{NORMALS_URL}?{urlencode(params)}",
            "inventory_path": str(station_inventory_path or inventory_path),
            "inventory_url": STATIONS_URL,
        })
        if len(selected) == 3:
            break
    return selected
