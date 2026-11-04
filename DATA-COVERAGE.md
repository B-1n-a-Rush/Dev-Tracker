# Data coverage and workflow clarity

Open **Layers → About this data**, or the discreet **Sources & coverage** footer action. Layer categories and relevant tools also link to source-specific details. The panel follows the existing green/cream design, native dialog behavior, and existing public data services.

## Dates and coverage

- **Last successful source fetch** records an actual successful request in this browser at this tracker address. It is not a site-wide monitoring date or verification of every returned record.
- **Latest attempt** is separate and never advances the successful-fetch date after a failure.
- **Publisher’s dataset update / newest saved record update** is taken from supplied metadata. It is not a construction date or proof that every record is current.
- **Import and effective dates** remain distinct for the local network; a missing effective date stays missing. Network operational verification remains explicit. Cached geometry can be reused by immutable fingerprint; a metadata check does not imply every alignment was downloaded again.
- **Saved walking snapshots** report capture dates from the bundled catalog. Checking that file today does not claim the pedestrian network was resurveyed today. Coverage is limited to saved areas; the optional DeKalb sidewalk reference is not a regionwide routing graph.
- **Parcel counts** describe the most recent requested area, not a whole county. Parcel date metadata is left unknown when not supplied by a request.
- **Record counts** are returned records, not completeness percentages. ARC scope, source caps, unlocated records, planning areas and missing utility feeds remain explicit.

Projects now label an explicit `metadata.last_verified_at` as **Last verified**. A saved-record timestamp instead appears as **Record last updated** in the React profile and printed project profile. Nearby summaries use the same distinction. The recorded-date filter still supports its existing saved-update fallback; that fallback is not source verification.

## Refresh behavior and privacy

Existing public API reads are observed without changing their requests, access rules or write methods. Staff SR2T draft reads and administrative history are not tracked. The general admin project read does not contribute private counts or record dates. On-demand Check source actions retrieve metadata for this panel; displayed map inventories retain their existing refresh controls. Infrastructure’s refresh action refreshes its feeds and map results together.

Each infrastructure feed now retains its last successful payload **in memory for this session**. If a later request fails, previous records remain visible with a cached/unsuccessful label and their original date. Failed feeds remain failed for digest comparison coverage; retained data is never passed off as a new successful source check. A first-run complete outage shows unavailable coverage and leaves exports disabled. No prior payload is fabricated. Source-specific dates supplement the aggregate latest-successful-feed timestamp.

The small browser-local status history stores only allowlisted source IDs, successful fetch dates, supplied version/date metadata and counts. It stores no project records, coordinates, search terms, credentials, staff names, review notes or technical errors. Restored history is labeled unconfirmed in the current session. Storage failure does not stop the app. The panel does not run monitoring automations, approve articles, edit public project facts, change construction dates or alter authentication.

## Workflow changes

Following exposes Add a watch directly in Updates, gives empty Saved projects useful next-step actions, and hides Retry pending follows when nothing is pending. Checks are labeled Check for updates. Newly available source groups show **Start your comparison baseline** instead of a misleading up-to-date message. Existing saved watches and review baselines remain intact. Help explains where to prepare a coordination briefing and how to read the different dates.

## Verification and limits

Automated checks cover successful/failed fetch dates, historical state, stale responses, metadata privacy, denied/corrupt storage, per-source cached payloads, complete later outages, unchanged write methods, private draft exclusion, project date labels, JavaScript parsing and existing land, nearby-summary, Following, digest and React profile behavior. React is type-checked and rebuilt with the existing pinned dependencies.

Browser checks cover address → nearby summary, route-impact loading, a ready briefing with a basemap, first-use Following actions, source checks, keyboard dismissal, nested dialog return and 390px reflow. These are focused engineering/usability checks, not coworker research or a full WCAG conformance audit. Actual coworker feedback remains valuable.
