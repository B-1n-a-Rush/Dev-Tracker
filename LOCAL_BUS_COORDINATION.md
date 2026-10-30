# Local bus routes and construction coordination

Implemented October 26, 2026 in the existing Trackside ATL map, infrastructure feeds, construction timeline and Supabase admin workflow. No paid service or new package is required.

## Open the feature

Open **Map layers → Local Bus Routes** to display the network. Search the layer by route number or name. **Local bus stops** displays related stops in the viewport at zoom 14 and above. The full network and every related stop are always used for screening.

Choose **Routes & construction impacts**, or click a bus alignment, to open the route workspace. Select the route, direction and pattern. Open **Screening, date, agency and staff filters** for the distance, date range, agency, jurisdiction, network version and private review filters. The map, project list and construction timeline use the same results. Selecting a project in any of these views selects it in the others.

Expand **route-wide combined construction windows** to inspect intervals involving at least two distinct projects. These can be on separate sections of a route. The window also states whether some published project geometries physically overlap. This does not prove that work occupies the same elevation, roadway or operating space.

The map keeps the original route color. White-edged dashed portions identify source alignment segments near work; orange stop outlines identify related stops near work. Purple project points indicate lower-confidence representative locations. Highlighted source segments are screening candidates, not measured work limits or approved detour geometry.

## Import or refresh a network

1. Sign in with an existing tracker administrator account.
2. In **Admin control center**, choose **Manage local bus network & impacts**.
3. Expand **Administrator: import & manage network versions**. Choose a ZIP or drag it onto the drop zone.
4. Review its validated counts and mode audit, then choose **Import as unverified network**. The upload shows progress and activates only after complete server validation.
5. Enter an effective date only if supplied by an authoritative source. Confirm intended operational use only with an explanatory verification note. The provided “Test local routes” version remains **unverified**, with no effective date.

The supplied ZIP has already been imported into Supabase project `jhscjyxufwvoslzxrwwq`:

| Contents | Preserved count |
|---|---:|
| Parent services | 86 |
| Direction/pattern alignment features | 212 |
| Stop features | 7,011 |
| Direction-to-stop records | 9,979 |
| Repeated direction/stop visits retained | 10 |

Version fingerprint: `60998474ca36ca1942087460496be41444b4b7ecdb4d08f2dcf9f0f42a87ef35`.

Identical parsed contents reuse the same immutable version, even if the ZIP filename changes. Changed contents create a new version. Original attributes, colors, geometries, direction and pattern IDs, stop IDs, relationship distances, DBF field definitions and projection declarations remain in the version's JSONB data. Import date, source filename, archive SHA-256, source map and data fingerprint provide provenance. Repeated visits are identified by original relationship-record ordinal instead of being silently deduplicated.

The importer checks ZIP CRC/size limits, required companions, SHP/SHX offsets/counts, DBF fields, WGS84 declarations and coordinates, unique IDs, consistent parent attributes and relationship endpoints. The server revalidates identities, geometry structures, coordinate ranges and relationships before activation. Bounded authenticated chunks avoid a single oversized upload; incomplete uploads cannot activate a network, and failed uploads are canceled. Abandoned uploads expire when their owner next starts an import after one day.

## Service-mode verification

The saved [MARTA GTFS feed](https://www.itsmarta.com/google_transit_feed/google_transit.zip), checked October 26, 2026, supplies an independent route-code/name and `route_type` reference. It identifies **80 local bus services, 1 Rapid A service, 4 rail lines and 1 streetcar service** in this export. All 86 are preserved; only the 80 local bus services appear in the local-bus layer. Unmatched services are excluded as unresolved. Administrators can record an explicit evidence-backed mode mapping in the version editor.

Mode is never inferred from route color or vehicle length. This reference does not validate the test alignment, effective date, service calendar or hours of operation. The original full route name remains intact.

## Screening and construction dates

The default distance is **250 feet / 76.2 meters**, matching the existing coordination tool; alternatives range from 100 feet to one mile. Full-resolution geometry is projected to WGS84 / UTM zone 16N (EPSG:32616) for this Atlanta regional analysis. A spatial grid only selects candidates; it does not simplify geometry or reduce final distance accuracy. A background worker runs on HTTP; `file://` uses the same engine in yielding batches.

The priority is an explicit work footprint/work-limit geometry, then published project geometry/corridor, then a representative point. Point locations are low confidence; planning areas are labeled accordingly. Bridges, crossings and nearby unrelated work always require review. Related stops are matched through direction and stop IDs, not the free-text `lines` field.

Construction phases are used when supplied. Otherwise, explicit published construction windows are used with their original precision and certainty. Broader project schedules remain visible as context and cannot establish construction overlap. Missing or partial dates remain visible as **Timing unknown**; no endpoints, durations or service hours are fabricated. Date filters retain unknown-timing records so they are not silently overlooked.

Screening excludes completed, long-range, possible-duplicate and imported high-capacity alignment records using the existing infrastructure rules. The source/method panel reports source failures, capped feeds and unmapped projects. A missing or failed source is never treated as proof of no impact.

## Staff review and preservation

Staff can confirm or dismiss a potential finding, assign a MARTA owner and agency contact, record possible detour/stop-relocation/delay/passenger-access concerns, and save notes, next action, due date and resolution. Existing workflow statuses are reused: **Not reviewed, Needs contact, In discussion, Coordinated, No action needed**. Confirmation, dismissal and resolved statuses require an explicit reason and evidence checkpoint.

Review notes remain separate from calculated findings. The stable key is source network/map + route ID + infrastructure ID. Recalculation updates the evidence without overwriting notes. Meaningful changes to dates, geometry, stops, directions/patterns, agency, jurisdiction or screening distance request renewed review. Unchanged applicable matches preserve the decision. Exact server-version checks reject competing edits, and a database checkpoint rejects a review of superseded evidence. Findings disappearing from a complete refresh become inactive; their saved notes remain available. Partial source outages do not automatically clear old findings.

Recalculation runs when a route workspace opens, its screening distance or network changes, the infrastructure loader refreshes, or the user chooses **Refresh network & project sources**. Returning to an open workspace also checks the shared network and refreshes an older screening. Staff draft notes prevent automatic refresh. This is client-driven screening, not an unattended server scheduler.

All shared network writes and private review access require an existing, valid administrator session through Supabase RLS. Public users can read route data and calculate public-source findings; private notes, contacts, owners and decisions are not exposed. Existing session expiration and sign-out cleanup apply.

## Limits and deployment

- Findings mean **Potential impact—review needed**. They do not establish a closure, approve a detour, promise operational changes or complete coordination.
- The test network still needs operational confirmation. Service days/hours, vehicle trips, stop accessibility and elevation conflicts were not supplied.
- Source coverage and published geometry/date quality limit screening. Unmapped construction cannot be screened until location information is available.
- Refreshes should retain source `map_id`, `line_id` and infrastructure IDs. If those identities change, old notes remain with the old version; a deliberate crosswalk is needed before associating them with different IDs.
- The changed local files and database migrations are installed. GitHub Pages publication is a separate action; this task does not publish a new website version.

See `LOCAL_BUS_VERIFICATION.md` for the completed checks and test commands.
