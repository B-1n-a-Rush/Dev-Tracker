"""Convert a MARTA Reach shapefile to the tracker’s static WGS84 layer.

Requires pyshp, pyproj and shapely >= 2.1. Run with the import date in Atlanta:
  python scripts/import-reach-zones.py /path/to/ZonesExport.shp outputs/trackside-reach-data.js --import-date YYYY-MM-DD
"""

import argparse
from datetime import date
from hashlib import sha256
import json
from pathlib import Path

from pyproj import CRS, Transformer
import shapefile
from shapely import transform
from shapely.geometry import mapping, shape
from shapely.geometry.polygon import orient
from shapely.geometry import MultiPolygon


def encode(value):
    return json.dumps(value, ensure_ascii=True, sort_keys=True, separators=(",", ":"))


def rounded(value):
    if isinstance(value, (tuple, list)):
        return [rounded(item) for item in value]
    return round(value, 7)


def read_zones(filename):
    projection = CRS.from_wkt(filename.with_suffix(".prj").read_text(encoding="utf-8-sig"))
    convert = Transformer.from_crs(projection, 4326, always_xy=True)
    encoding = filename.with_suffix(".cpg").read_text(encoding="utf-8-sig").strip()
    features = []
    seen = set()
    with shapefile.Reader(str(filename), encoding=encoding) as source:
        for item in source.iterShapeRecords():
            attrs = item.record.as_dict()
            zone_id = str(attrs["Num"])
            name = str(attrs["NameSugges"]).strip()
            if not name or zone_id in seen:
                raise ValueError(f"Missing zone name or duplicate zone ID: {zone_id}")
            seen.add(zone_id)
            original = shape(item.shape.__geo_interface__)
            if original.is_empty or not original.is_valid or original.geom_type not in {"Polygon", "MultiPolygon"}:
                raise ValueError(f"Zone {zone_id} has invalid polygon geometry")
            projected = transform(original, convert.transform, interleaved=False)
            projected = orient(projected) if projected.geom_type == "Polygon" else MultiPolygon(
                [orient(part) for part in projected.geoms]
            )
            geometry = {"type": projected.geom_type, "coordinates": rounded(mapping(projected)["coordinates"])}
            result = shape(geometry)
            west, south, east, north = result.bounds
            if not result.is_valid or not (-85 < west < east < -83.5 and 33 < south < north < 35):
                raise ValueError(f"Zone {zone_id} has invalid WGS84 geometry or is outside metro Atlanta")
            features.append({
                "type": "Feature",
                "id": zone_id,
                "properties": {
                    "name": name,
                    "boundary_revision": sha256(result.normalize().wkb).hexdigest()[:16],
                },
                "geometry": geometry,
            })
    if seen != {str(number) for number in range(301, 313)}:
        raise ValueError(f"Expected Reach zones 301–312, received {sorted(seen)}")
    return projection.name, sorted(features, key=lambda feature: feature["id"])


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--import-date", required=True, type=date.fromisoformat)
    args = parser.parse_args()
    crs, features = read_zones(args.source)
    dataset = {
        "type": "FeatureCollection",
        "source": {
            "filename": args.source.name,
            "kind": "User-supplied GIS export",
            "crs": crs,
            "imported_on": args.import_date.isoformat(),
            "effective_on": None,
        },
        "features": features,
    }
    args.output.write_text("window.TRACKSIDE_REACH_DATA = " + encode(dataset) + ";\n", encoding="utf-8")
    print(f"Imported {len(features)} zones from {crs}.")


if __name__ == "__main__":
    main()
