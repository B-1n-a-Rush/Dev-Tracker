# Local bus performance pass — October 27, 2026

The local tracker now reuses immutable network geometry by fingerprint, checks the small network metadata catalog on return to the tab (at most once per minute), and rebuilds its screening index only when the network or mode mapping changes. Manual refresh still refreshes construction sources. A failed network check remains an explicit error instead of being relabeled as a successful fresh screening.

Bus route layers are retained across searches and layer toggles. Construction selection updates the previous and new highlights, the selected work geometry, and existing timeline rows. Original affected segments are grouped into MultiLineString display paths without changing coordinates. Route-to-stop relationships are indexed once per dataset. Stop redraws are coalesced for paired zoom/move events, and searches wait 160 ms after input. The in-memory network cache holds at most two versions; the display stop-set cache holds at most 64 scopes. No private reviews are added to these caches.

## Verification

71 relevant automated checks passed: 13 import/geometry/timeline checks, 6 API boundary checks, 7 staff interaction checks, 14 performance/refresh regression checks, and 31 existing coordination UI checks.

Run from the tracker root:

    node work/test-local-bus.cjs
    node work/test-local-bus-api.cjs
    node work/test-local-bus-ui.cjs
    node work/test-local-bus-performance.cjs
    node work/test-coordination-ui.cjs

Controlled comparison using the same two-project UI fixture:

| Operation | Before | After |
| --- | ---: | ---: |
| Full network downloads after initial load + 10 tab returns | 11 | 1 |
| Spatial index builds for those returns | 11 | 1 |
| Small metadata checks | 11 | 11 |
| Geometry objects created by 20 alternating finding selections | 120 | 20 |
| Repeated overlap calculations for those selections | 20 | 0 |

These are operation counts, not measured application-wide speed percentages. The comparison script's --baseline option requires the original files in the separate performance preview.

Real browser verification at http://127.0.0.1:4190/ read the existing Supabase network and official infrastructure feeds: 80 local bus route choices; Route 14 retained 32 construction findings, 92 related stops, 43 simultaneous windows, and 6 incomplete schedules. Selecting a construction finding updated its timeline row and detail panel. City of Atlanta + outbound filtering produced four findings and four timeline rows. No browser console errors were observed.

Network-version changes and mode changes invalidate the index. Metadata-only changes refresh labels without downloading geometry. An explicit archived-version choice wins over a concurrent background check. Automatic refresh cannot overwrite an unsaved staff draft, and clicking an already-selected finding preserves its draft. Existing optimistic review-save checks and sign-out cleanup continue to pass.

## Limits and deployment

This pass changes client loading and rendering, not project records, route source geometry, screening distances, or analytical calculations. No Supabase schema or public records were changed. The initial network load and remote source requests still take time. The file:// version continues to use the existing chunked main-thread screening fallback; HTTP/HTTPS versions use the existing background worker.

Published runtime files live at the repository root for GitHub Pages. The same Supabase project supplies shared route data and administrative reviews.
