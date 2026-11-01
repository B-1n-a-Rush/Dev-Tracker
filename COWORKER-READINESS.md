# Coworker readiness check — November 1, 2026

The existing green/cream layout, status colors and route colors are retained. Public viewers still need no account. The small Share view link and bottom-left Admin login remain in place.

## Fixes found during this check

- SR2T jurisdiction filtering now includes exact values from the loaded inventory, including **Fulton County**, **DeKalb County** and **Clayton County**. Previously the fixed short-name options made some imported values difficult to select. The editor already retained unlisted county values; this change extends that behavior to filtering.
- Every transit route checkbox now has a unique, stable DOM ID based on its remote route ID or built-in route name. Fifteen controls previously shared `layerRoute14`. Route identity, visibility preferences, alignments and colors are unchanged.
- Added SR2T field visits without loading private records or photos for public map browsing. Visits load only when an administrator opens the tab; photos load only on request. Photos are resized before upload, and visit lists are paginated.

## Browser and data checks

Project search found High Street and opened its profile. A generated map-view link restored that project and its filter in a fresh tab. Buford ART opened a route overview with separate total and active-filter counts. The local bus layer loaded its existing 80-route unverified network and retained its route search control. Public SR2T loaded 170 active published sites with 250 linked stops; selecting Fulton County returned 33 sites. No Field visits control was exposed to public users.

An actual downloaded ZIP was independently read using Python/PyShp, validating SHP/SHX records, DBF fields, WGS84 PRJ, UTF-8 CPG and checksums: 126 development points, 17 high-capacity route lines and 250 SR2T stop points. No private field data is part of those exports. Counts describe this check's live data and can change later.

Phone-sized field editing and bottom navigation remain accessible. Browser console errors are checked during the workflows. Existing geometry, source coordinates, construction-screening logic, route calendars and project records are not changed by this release. Existing network caching and full-geometry screening regression checks are included in the final validation report; this pass does not claim a universal speed improvement or a benchmark for every coworker's machine/network.

Field-visit database and UI testing details are in `SR2T-FIELD-VISITS.md`. New authenticated user-photo transport was checked through client request tests and rolled-back storage-policy tests; the UI fixture uses simulated transport rather than a live user's credentials.
