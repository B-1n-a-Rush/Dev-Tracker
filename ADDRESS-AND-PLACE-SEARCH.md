# Address and place search

Project search is at the top of the Explore panel and retains the existing project filter. A separate address and place search at the top of the map searches the Atlanta region on an explicit Find or Enter action. Choose a result to zoom to a temporary green map pin. Its popup can open What's happening here? or remove the pin. Existing filters remain as set. Selecting a location never creates a development project, changes a construction match, snaps a station, or changes route geometry.

## Provider and scope

Photon's public OpenStreetMap geocoder is used without a key, account, paid API, new package or database change. Primary API documentation: https://github.com/komoot/photon/blob/master/docs/api-v1.md . Public service terms: https://github.com/komoot/photon#demo-server . The provider permits reasonable use, may throttle heavier traffic and does not guarantee availability. Before a large rollout, select a managed or private endpoint. Set window.TracksidePlaceSearchConfig.endpoint before the search script to a compatible HTTPS Photon endpoint.

The rectangular Atlanta-region search bounds are longitude -85.05 to -83.65 and latitude 33.2 to 34.4. These are lookup bounds, not jurisdiction or MARTA-service-area boundaries. Up to six candidates are displayed with addresses/towns for selection. Results are approximate mapped locations, not verified parcel positions, surveyed entrances or walking access. A complete street address plus city helps distinguish similar names. Nothing is automatically added to the tracker.

No provider request runs on startup, or while typing. Only the submitted place query and fixed regional bounds are sent to Photon. Cookies are omitted. Searches/results stay in a bounded, 30-minute in-memory cache for this page; no history or query is saved to localStorage, the database or shared-map URLs. Calls are paced to at most one start per 1.2 seconds in this page. Abort, timeout and stale-response guards prevent superseded results from replacing current input. Errors can be retried explicitly.

OpenStreetMap and Photon attribution is visible in the result panel. Public-use limits apply: this is suitable for occasional searches, not bulk geocoding.

## Code and validation

- outputs/trackside-place-search-core.js: validation, regional filtering, result normalization, HTTPS requests, bounded session cache, pacing, timeout and cancellation.
- outputs/trackside-place-search.js: separate Explore/map search controls, accessible native controls, results, map pin and existing analysis handoff.
- outputs/trackside-place-search.css: desktop and small-screen layout, pin and popup.
- tests/test-place-search.cjs: input and request encoding, invalid/out-of-region data, deduplication, cache expiry/limits, pacing, cancellation, malformed responses, throttling and timeout.

Run node tests/test-place-search.cjs, then node scripts/prepare-static-release.cjs before packaging. The feature uses normal relative assets and no server-side endpoint, supporting GitHub Pages. New files are included automatically by the existing release manifest. No deployment is performed by preparing a manifest.

## Verified November 2, 2026

12 focused lookup checks, 9 existing geometry/cache/worker checks and 2 existing network-cache API checks passed. Real browser tests found Piedmont Park by name and East Point City Hall at 2757 East Point Street, retained an active High Street project filter, showed one removable location pin and opened the existing area overview at that pin. Closing, Escape, short-query validation and 390px-wide layout were checked. A /Dev-Tracker/ subpath preview loaded the assets, retained project-profile behavior and produced no browser console errors. No public records or route/station geometry were edited.
