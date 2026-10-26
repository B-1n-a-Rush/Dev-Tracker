# Parcel profiles and infrastructure coordination

Implemented locally October 23–24, 2026. Phase 2 connects Fulton and Clayton programs; the ARC expansion adds MTP/TIP planning records only for Atlanta, Fulton, DeKalb and Clayton. GitHub Pages is unchanged until this build is published.

## Parcel profiles

Open **Map layers → Tax parcels**, zoom to level 16 or closer, and click a parcel. The right-hand overview shows available owner, address, acreage, valuation, zoning, existing units and property links. **All published fields** retains jurisdiction-specific details.

County tax polygons supply Fulton, DeKalb and Clayton coverage. Atlanta's official zoning, overlay, historic-district and future-land-use layers enrich the clicked point; a parcel can cross multiple districts. Atlanta's tax layer is a fallback. The old ACD_Parcels planning/design-area layer is not used as tax parcels. Identical condominium footprints have a tax-record selector.

Parcel data is read-only. Existing administrator parcel selection still attaches IDs and geometry through the existing project-editing workflow. Tax-record units and values are separate from proposed development counts. Source tax years and update dates are not invented; retrieval time is separate.

## Infrastructure controls

Open **Map layers → Infrastructure → Browse & coordinate**.

Select a MARTA rail, BRT, ART or LRT alignment and screening distance (100 feet to one-half mile). Filter by jurisdiction, municipality, project type and source/program. Enter a construction-phase or study window; reference dates stay in this browser session and are not official MARTA schedules.

Mapped projects show published phases, possible overlap, dates outside your window, or unknown/invalid schedules. Click for costs/budgets, contractors, limits, programs, update dates, warnings, raw source fields and direct source links.

**Unmapped / area-wide records** are separate. They are not plotted or counted in route proximity/overlap totals. Jurisdiction, municipality, category, completion and source filters apply; route and overlap filters do not. Such work may still require agency coordination.

**Export comparison CSV** exports mapped matches. **Export unmapped CSV** exports the separate inventory. **Export duplicate candidates** exports uncertain ARC matches separately. Exports include official ARC/GDOT IDs, ARC status and fact-sheet links where available, source URLs, geometry basis, update/retrieval dates, comparison parameters and screening limitations. Formula-leading values are neutralized.

## Connected coverage

| Jurisdiction | Programs | Limits |
| --- | --- | --- |
| Atlanta | Capital-delivery projects | Anticipated construction dates; not all infrastructure or utility programs |
| DeKalb | SPLOST transportation; watershed water/sewer points and lines | SPLOST dates are project schedules, not necessarily construction; utility finishes are often missing |
| Fulton | Municipal TSPLOST outside Atlanta | Official details joined to representative points, not full alignments |
| Clayton | SPLOST road centerlines; county-published GDOT project lines; 2026 milling/resurfacing | Old phases/estimates need confirmation; start dates generally missing; activity dates are not construction windows |
| ARC MTP/TIP | Projects whose county/city fields include Atlanta, Fulton, DeKalb or Clayton | Cross-county extents retained; polygons are planning areas; Programmed is not construction; no construction dates supplied |

This is a connected-program inventory, **not every planned/programmed project**. Dedicated Fulton and Clayton utility capital-project feeds, additional municipal programs and agency-verified MARTA phase schedules remain future work.

### Fulton

- Explorer records: https://data.fultoncountyga.gov/resource/wab3-52sv.json
- Location points: https://data.fultoncountyga.gov/resource/bcjt-asar.json
- Explorer: https://tsplost.fultoncountyga.gov/projects
- Project details and location datasets have different update vintages.
- Joins use normalized official project IDs, never guessed names.
- Missing/ambiguous IDs, invalid coordinates, unmatched IDs and citywide/program-wide pins remain unmapped.
- Repeated points are grouped. Multiple distinct official locations remain representative points, not inferred linework.
- Point screening can miss a long project whose alignment passes nearby. Warnings appear in the panel, details and exports.
- Fulton location-data attribution and CC BY 4.0 license appear under Sources & coverage.
- A location-feed outage preserves the project inventory as unmapped with a visible warning.

### Clayton

- SPLOST centerlines: https://gis.claytoncountyga.gov/server/rest/services/Transportation/Transportation_Improvement_Projects/MapServer/18
- County GDOT lines: https://gis.claytoncountyga.gov/server/rest/services/Transportation/Transportation_Improvement_Projects/MapServer/24
- 2026 resurfacing: https://services5.arcgis.com/m528W8U8YDYeMPrQ/arcgis/rest/services/2026_SPLOST_Milling_and_Resurfacing/FeatureServer/0
- CAD components and marker copies are not counted as separate projects.
- Design remains design even when broad Status says In Progress.
- Actual completion is distinguished from estimated completion; starts are not fabricated.
- Resurfacing program years and activity dates are not converted into full construction intervals.
- The county-linked “2026 Resurfacing Status Map” currently references 2025 web-map layers. Trackside connects the separately verified official 2026 service and links directly to its item.

### ARC MTP/TIP expansion

- Live layer: https://services1.arcgis.com/Ug5xGQbHsD8zuZzM/arcgis/rest/services/ARC_MTP/FeatureServer/2
- User-referenced map: https://experience.arcgis.com/experience/0e308ec9423e4a52bd527f7b83acdf85/
- Both a server query and exact client-side county/city membership validation restrict coverage. Unrelated regional records, including the map-selected Spalding project SP-067A, are excluded.
- Cross-county projects touching an eligible jurisdiction retain their full published extent. Their polygons are not clipped or presented as precise construction footprints.
- ART/BRT/LRT alignments (including streetcar/light rail) from infrastructure feeds are excluded before deduplication, rendering, totals and exports. Trackside route shapefiles remain the map authority for these modes. Incidental route mentions in roadwork descriptions/limits do not remove a road project; separate facilities and station upgrades remain infrastructure. The rule also applies when optional completed, long-range and duplicate filters are enabled. Sources & coverage reports excluded counts.
- Programmed projects are shown by default. **Include ARC long-range projects** and **Include completed / closeout projects** are separate optional controls. Unknown schedules remain unknown when comparing dates.
- Cards and details distinguish ARC programming status from the local construction phase. Details include sponsor, limits, ARC/GDOT identifiers, raw fields, record links, and published fact-sheet links.
- An unambiguous explicit ARC ID or unique GDOT PI can link an ARC record to one local project. Conflicting explicit phases, distant geometries, shared PI scopes and multiple local matches are held for comparison. Generic inventory IDs are never treated as ARC/GDOT IDs.
- Linked records retain local phase, dates and geometry, count once, and remain discoverable through the ARC source filter. When the local record has no usable location, its ARC planning polygon is explicitly labeled as the geometry basis.
- Similar names and nearby geometry create **possible duplicate** candidates rather than automatic merges. These stay out of map totals and comparison CSV by default. Open **Possible duplicate ARC projects** to compare sources or export candidates; explicit inclusion warns that totals may overlap.
- October 24 live result after the shapefile-authority filter: 220 in-scope ARC records retrieved; 25 rapid-transit alignments excluded, including Southlake AR-455 and CL-354. The 195 retained records include 111 Programmed, 40 Long Range and 44 Completed. Three linked by official identifiers; 17 held as possible duplicates; 175 additional ARC records across all statuses. Default ARC-filtered mapped results: 101, including eligible linked local records. Counts can change on refresh.
- This connects ARC records live for display and screening; it does not create development projects or persist duplicate-review decisions.

## Data quality and safety

Local planar proximity includes segment-crossing checks. It is coordination screening, not survey work, design clearance, construction footprints, walking access or confirmation of a conflict. “No matching projects” does not prove no work is planned.

Year/month precision is preserved. Ambiguous or invalid dates remain unknown. Durations do not fabricate finishes. Passed finish dates for noncompleted work, and project/location updates over a year old, are flagged. Retrieval is not agency verification. Refresh reloads data; no background schedule is introduced.

No Supabase schema, public projects, route records, permissions or public news are modified. Source strings render as text, not executable markup. No private credentials or new service keys are required.

## Verification and deployment

Run from the build folder:

    node work/test-land.cjs
    node work/test-land-arc.cjs
    node work/check-land-live.cjs
    node work/check-land-phase2.cjs
    node --check outputs/trackside-land-core.js
    node --check outputs/trackside-land.js

All 27 offline regression tests pass: 12 existing parcel/infrastructure tests plus 15 ARC tests. Coverage includes strict jurisdiction scope, phase/date separation, official-ID joins, ambiguous phases/scopes, possible-duplicate inclusion, source filters, ARC detail links, outages, formula-safe CSV exports, rapid-transit exclusions across optional filters, retained station/facility projects and preserved uploaded route choices.

The original nine live public-service checks pass. The expanded Phase 2 check exercises all ten actual infrastructure adapters against full live feeds, renders results in an offline DOM fixture, tests jurisdiction/status/duplicate filters and verifies cross-origin permission for https://b-1n-a-rush.github.io (24 GET requests on October 24). On October 23, new feeds returned 716 Fulton records (426 with usable representative points), 16 Clayton SPLOST road projects, 2 county-published GDOT projects and 40 resurfacing segments. Counts include completed records and can change.

These are not real-browser visual checks. A standard HTTP preview was unreachable from this session. Direct local-file browser automation was previously blocked by URL policy. Visual verification remains required on the user's computer.

Publish index.html plus trackside-land-core.js, trackside-land.js and trackside-land.css together. Preserve existing supabase-config.js, supabase-data.js and route-file-parser.js. Assets use relative paths and matching 20261024-infra-routes version suffixes for GitHub Pages cache refresh. No upload has been performed in this phase.
