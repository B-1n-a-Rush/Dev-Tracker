# Parcel-backed address search

Use the map’s existing **Address or place** box. Enter a street number and street name, then Find or Enter. A numbered address first queries the official site-address fields in Fulton, DeKalb and Clayton, covering the tracker’s Atlanta/four-jurisdiction scope. Parcel layers do not have to be switched on, and the current map extent does not limit the lookup.

Each result identifies the county and parcel ID and preserves the published full address. Selecting it fetches that exact parcel’s full-resolution WGS84 footprint, highlights it, fits the map, and places a marker inside the polygon. The marker is a representative parcel point, not a surveyed entrance or rooftop geocode. **View parcel overview** opens the existing property profile; **What’s happening here?** uses the selected location with the existing nearby-analysis tool. Removing the search pin also removes the search footprint outline. A separately opened parcel overview keeps its own selection highlight.

If a numbered address has no parcel match, or the query is a place name, the existing Photon/OpenStreetMap service remains a supplement. Its results must fall inside the actual Fulton/DeKalb/Clayton county polygons, rather than merely inside a broad regional rectangle. If those boundaries cannot be loaded, unverified supplemental locations are withheld with an explanation. No alternative nationwide geocoder or paid service was added.

## Reliability and performance

- Only an explicit Find/Enter sends a query; there is no per-keystroke county search.
- At most 20 attribute-only rows are requested per county, with the best 10 results shown. More matches trigger a refinement message. Geometry and full property attributes are fetched only for a selected parcel.
- Address matching tolerates case, common street/direction abbreviations and zero-padded street numbers. Unit text is not treated as a distinct building entrance. Identical source records are deduplicated; different parcels sharing an address remain distinguishable by parcel ID.
- This uses **site addresses**, never owner or mailing-address fields as address matches. SQL fields/endpoints are allowlisted, string tokens are constrained/escaped, and selected object IDs must be integers.
- A county error is reported as incomplete coverage, not a definitive no-match. Failed/partial searches are not cached; successful results use a bounded, in-memory, 15-minute cache. Queries and address histories are not written to local storage or Supabase. Cancellation prevents stale results or selections replacing the latest request.
- No whole-county parcel download, geometry simplification for search accuracy, new account, schema migration, public record edit or monitoring run is involved.
- Successful selected-footprint fetches update the existing browser-local parcel source-status timestamp with a count of one requested feature; the search text and coordinates are not stored there.

## Sources and limits

Field definitions were checked against the live services on November 3, 2026:

- Fulton: `Address`, `ParcelID`, `OBJECTID` — [official service](https://gismaps.fultoncountyga.gov/arcgispub2/rest/services/PropertyMapViewer/ParcelHighlighter/MapServer/1).
- DeKalb: `SITEADDRESS`, `PARCELID`, `OBJECTID` — [official service](https://dcgis.dekalbcountyga.gov/mapping/rest/services/TaxParcels/FeatureServer/0).
- Clayton: `SITEADDRES`, `PARCELID`, `OBJECTID` — [official service](https://gis.claytoncountyga.gov/server/rest/services/TaxAssessor/Parcels/MapServer/0).

Not every parcel has a usable or current site address. Apartment/unit records, vacant land, aliases and spelling differences can still need the official viewer. Matching primarily uses the number and street; a city suffix is not independent city validation where the source does not publish that information. Check the county, parcel ID and highlighted footprint when addresses repeat. Street-only and named-place searches use the supplemental provider. County boundaries define the tracker’s jurisdictional scope; they do not establish transit service hours, walking access or route proximity.

## Verification

26 automated checks cover existing search behavior, safe and bounded queries, parsing, exact house numbers, duplicate handling, partial failures and retries, cancellation/timeout, geometry resolution, holes/concave/MultiPolygon interior points, and jurisdiction filtering. Live queries and selected-footprint resolution passed for Fulton (2757 East Point Street), DeKalb (556 North McDonough Street) and Clayton (112 Smith Street), with markers checked inside the actual returned polygons. Browser checks cover parcel selection, the existing property profile, named-place fallback, latest-query cancellation, keyboard selection, mobile layout and clean runtime logs.
