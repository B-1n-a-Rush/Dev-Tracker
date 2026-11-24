"""Capture Census municipal boundaries for the tracker. Requires Shapely and pyproj."""

import argparse
from datetime import date
import json
from pathlib import Path
import re
from urllib.parse import urlencode
from urllib.request import urlopen

from pyproj import Transformer
from shapely import make_valid, set_precision, transform, union_all
from shapely.geometry import mapping, shape


TIGERWEB = "https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/"
COUNTIES = TIGERWEB + "State_County/MapServer/19"
CITIES = TIGERWEB + "Places_CouSub_ConCity_SubMCD/MapServer/4"
COUNTY_CODES = {"063", "089", "121"}
PRECISION = 0.000001
to_meters = Transformer.from_crs(4326, 26916, always_xy=True).transform
to_lonlat = Transformer.from_crs(26916, 4326, always_xy=True).transform


def response(url, **params):
    with urlopen(url + "?" + urlencode(params), timeout=75) as reply:
        result = json.load(reply)
    if "error" in result or result.get("exceededTransferLimit") or result.get("properties", {}).get("exceededTransferLimit"):
        raise RuntimeError("Census did not return a complete response: " + str(result.get("error", url)))
    return result


def features(layer, fields, **filters):
    count = response(layer + "/query", **filters, returnCountOnly="true", f="json")["count"]
    rows = response(layer + "/query", **filters, outFields=fields, outSR=4326, returnGeometry="true", f="geojson")["features"]
    if len(rows) != count or not rows:
        raise RuntimeError(f"Census count mismatch at {layer}: got {len(rows)}, expected {count}")
    return rows


def polygons(geometry):
    if geometry.geom_type in ("Polygon", "MultiPolygon"):
        return geometry
    if geometry.geom_type == "GeometryCollection":
        return union_all([polygons(part) for part in geometry.geoms])
    return union_all([])


def encoded_geometry(geometry):
    result = mapping(geometry)

    def rounded(values):
        if isinstance(values, (list, tuple)):
            return [rounded(item) for item in values]
        return round(values, 6)

    return {"type": result["type"], "coordinates": rounded(result["coordinates"])}


def compact(feature_id, name, geometry):
    return {
        "id": feature_id, "name": name,
        "bounds": [round(value, 6) for value in geometry.bounds],
        "geometry": encoded_geometry(geometry),
    }


def collect(checked_on):
    metadata = response(CITIES, f="json")
    vintage = re.search(r"\b([A-Z][a-z]+ \d{1,2}, \d{4}) vintage", metadata.get("description", ""))
    if metadata.get("name") != "Incorporated Places" or not vintage:
        raise RuntimeError("Expected the Census Incorporated Places layer with a published vintage.")

    county_features = features(COUNTIES, "BASENAME,COUNTY", where="STATE='13' AND COUNTY IN ('063','089','121')")
    if len(county_features) != 3 or {row["properties"]["COUNTY"] for row in county_features} != COUNTY_CODES:
        raise RuntimeError("Expected Clayton, DeKalb and Fulton county boundaries.")
    county_shapes = [(row["properties"], polygons(make_valid(shape(row["geometry"])))) for row in county_features]
    coverage = union_all([geometry for _, geometry in county_shapes])
    if coverage.is_empty or not coverage.is_valid:
        raise RuntimeError("Coverage geometry is not valid.")
    cities = features(
        CITIES, "BASENAME,GEOID", where="STATE='13'",
        geometry=",".join(map(str, coverage.bounds)), geometryType="esriGeometryEnvelope",
        spatialRel="esriSpatialRelIntersects", inSR=4326,
    )
    city_rows, display = [], []
    ids = set()
    for row in sorted(cities, key=lambda feature: feature["properties"]["BASENAME"]):
        props = row["properties"]
        city = polygons(make_valid(shape(row["geometry"])).intersection(coverage))
        if city.is_empty:
            continue
        city_id, name = props["GEOID"], props["BASENAME"]
        if city_id in ids or not name:
            raise RuntimeError("An incorporated place lacks a unique identifier or name.")
        ids.add(city_id)
        city = set_precision(city, PRECISION)
        if city.is_empty:
            raise RuntimeError(f"{name} disappeared at display precision.")
        city_rows.append(compact(city_id, name, city))
        simplified = transform(city, to_meters, interleaved=False).simplify(20, preserve_topology=True)
        simplified = transform(simplified, to_lonlat, interleaved=False)
        simplified = set_precision(simplified, PRECISION)
        largest = max(city.geoms, key=lambda part: part.area) if city.geom_type == "MultiPolygon" else city
        label = largest.representative_point()
        display.append({
            "type": "Feature",
            "properties": {"name": name, "labelPoint": [round(label.x, 6), round(label.y, 6)]},
            "geometry": encoded_geometry(simplified),
        })
    names = {row["name"] for row in city_rows}
    if not {"Atlanta", "Decatur", "Jonesboro", "South Fulton"}.issubset(names):
        raise RuntimeError("Expected municipalities from all three counties.")
    return {
        "version": 1, "vintage": vintage.group(1), "checkedOn": checked_on.isoformat(),
        "sourceUrl": CITIES, "countySourceUrl": COUNTIES,
        "counties": [compact(props["COUNTY"], props["BASENAME"] + " County", set_precision(geometry, PRECISION)) for props, geometry in county_shapes],
        "cities": city_rows, "display": {"type": "FeatureCollection", "features": display},
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path)
    parser.add_argument("--checked-on", type=date.fromisoformat, required=True)
    args = parser.parse_args()
    catalog = collect(args.checked_on)
    args.output.write_text(
        "window.TracksideCityLimitsData=" + json.dumps(catalog, ensure_ascii=True, separators=(",", ":")) + ";\n",
        encoding="utf-8",
    )
    print(json.dumps({"vintage": catalog["vintage"], "cities": [row["name"] for row in catalog["cities"]], "bytes": args.output.stat().st_size}))


if __name__ == "__main__":
    main()
