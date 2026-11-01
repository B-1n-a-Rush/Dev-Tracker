# Standard shapefile exports

Open **Layers → Export map data (.shp)**, select the layers, and choose **Download shapefiles (.zip)**. The SR2T workspace also has **Export all SR2T (.shp)**, which selects that inventory for you.

Unzip the download and keep each layer's `.shp`, `.shx`, `.dbf`, `.prj`, and `.cpg` files together. Open the `.shp` in ArcGIS Pro, QGIS, or another shapefile reader. All geometry uses WGS84 longitude/latitude (EPSG:4326), in 2D. Mixed point, multipoint, line, and polygon data becomes separate shapefiles.

## Available data

- All published development projects and their stored parcel memberships, independent of map filters. Project pins are representative locations, not construction footprints.
- Published BRT / ART / LRT alignments with names, modes, colors, source identifiers, and recorded construction schedule fields. Missing dates remain blank; no service calendars or dates are fabricated.
- Built-in schematic rail references, station reference points, and mapped ART/BRT planning-stop references. These have the same reference limitations as the tracker; rail line references are not surveyed track geometry and station points are not verified entrances.
- The active imported **local-bus** network: complete directional/pattern alignments, related stops, parent-route CSV, and direction-to-stop relationship CSV. Mode classification excludes rail and streetcar. Network verification, version, effective date when supplied, and original attributes are retained. Colors are attributes; a shapefile does not carry the website's symbology automatically.
- Active published SR2T sites: one point per current, confirmed linked stop. A shared `site_id` groups a site's multiple stops. Stop numbers remain text, including leading zeros. Staff may explicitly include draft sites; removed sites remain excluded. Private notes, contact/ownership workflow fields, plan files, storage paths, and signed links are excluded.
- Reconciled public infrastructure currently loaded from the existing feeds. The exporter can load those feeds if needed. Source coverage, failures, truncation, and retrieval time are recorded in `manifest.json`. Existing transit-duplicate exclusions remain applied. This is not an exhaustive jurisdiction inventory.
- Tax parcels from the **last loaded parcel map area**, which may differ from the current viewport if parcels were disabled while panning. This does not download entire counties. Turn on parcels and zoom into the desired area before exporting. Project-linked parcels are a separate layer.
- Loaded service-area boundaries; the current completed study polygon/buffer and station buffer; current hypothetical route concepts, concept stops, and development assumptions; current walking-access paths with time bands and OSM attribution; and the last computed potential bus-construction findings. Create or calculate an analysis first, then reopen the export window or select **Refresh available layers**.

## Attribute and accuracy limits

Each shapefile has a full attribute `.csv` and a `.fields.csv` dictionary mapping original field names to the DBF's unique ten-character names. Standard DBF limits apply: text can be shortened at 254 UTF-8 bytes, numeric attributes use up to six decimal places, and excessively wide tables keep additional fields in CSV. The manifest reports shortened/CSV-only fields. Formula-like text is prefixed in CSV for spreadsheet safety; numbers are retained as numbers. SHP coordinate doubles retain their original precision. Source geometry is not simplified for export.

Records without valid geometry remain **Null Shape records**, with attributes and `geometry_state`, instead of being placed at zero coordinates. Unconfirmed/stale SR2T links remain unmapped until reviewed. Circular analysis buffers use 128-segment geodesic polygon approximations. Walking paths are network estimates, not an accessibility or current-condition certification. Bus findings are potential screening matches; they do not establish a closure, approved detour, or service interruption. Human coordination notes are excluded.

The ZIP includes a coverage README and manifest. Basemap tiles, imagery, PDF site plans, authentication data, and private review records are not vector layers and are not included. The export is read-only. There is no new database schema, paid API, or production dependency.

## Verification

Run `node work/test-sr2t-shapefile.cjs` for export adapter, format, privacy, and published-scope checks. The existing SR2T core/files/easy/removal/markers checks remain applicable. The independent reader `work/verify-sr2t-shapefile.py` requires PyShp (`pyshp==2.3.1`) in the test environment. Run it without arguments for synthetic fixtures or pass an actual downloaded ZIP path to verify counts, geometry types, SHX offsets, DBF records, CRCs, and projection/encoding files. PyShp is a test dependency only.
