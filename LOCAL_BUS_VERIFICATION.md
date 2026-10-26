# Local bus feature verification — October 26, 2026

## Automated checks

Run with the existing Node runtime from the tracker root:

```
node work/test-local-bus.cjs
node work/test-local-bus-api.cjs
node work/test-local-bus-ui.cjs
```

**26 new checks passed**: 13 import/geometry/mode/timeline checks, 6 API transport/auth/concurrency checks, and 7 coordination interaction checks. The import test uses the supplied ZIP and `work/validated-network.json`; if testing on another computer, update the ZIP path in that test. No package installation is required.

**116 existing checks passed** across parcels, public infrastructure, ARC deduplication, location overviews, coordination API, screening, sharing/briefing map geometry, construction timelines, coordination UI, schedule coverage and hotspots. Total: **142 automated checks**.

| Requested scenario | Evidence |
|---|---|
| Repeat import creates no duplicates | Same canonical fingerprint on two parses; live authenticated Supabase reimport returns the existing version; one stored version and unchanged 86/212/7,011/9,979 counts |
| Original names, colors, patterns and directions | Exact equality with validated source conversion and mode audit; all original per-feature fields retained |
| Local bus excludes rail/streetcar | Independent GTFS mapping: 80 local, 4 rail, 1 streetcar, 1 Rapid A; browser local-route selector has 80 entries |
| One nearby project creates a finding | Isolated synthetic route/project test produces a reviewable finding with no simultaneous window |
| Different route sections overlap in time | March–August + June–October produces June 1–August 31, with separate physical-location wording |
| Nonoverlapping windows | Adjacent/nonoverlapping periods produce no simultaneous window |
| Unknown dates | Missing endpoints remain visible and cannot generate a duration or overlap |
| Broad project schedules | Mixed project-start/construction-finish dates stay context only; construction overlap is not fabricated |
| Footprint vs point | Explicit work footprint outranks fallback point; point confidence and warnings remain distinguishable |
| Map/timeline filters and selection | Shared result-model tests and real browser date filtering; list and timeline selected infrastructure IDs match |
| Refresh preserves reviews | UI tests retain notes after changed dates; live database transaction retains notes after sync, rejects stale evidence, accepts renewed evidence |
| Existing tracker features | 116 regression checks; normal project map, layers and public detail actions load in the browser |

## Live database verification

Two additive migrations were applied to Supabase `jhscjyxufwvoslzxrwwq` and saved in `supabase/migrations`:

- `20261026215958_local_bus_service_network_and_construction_impacts.sql`
- `20261026220449_bounded_authenticated_local_bus_network_import.sql`

The supplied network was imported through the authenticated chunk/finish functions using an existing owner session context. Server-side repeat-import, finding sync, review insertion, note preservation, stale-checkpoint rejection and renewed-review tests passed inside rolled-back verification transactions. No test review rows or unfinished uploads remain.

Anonymous network INSERT/UPDATE, private finding SELECT, private review SELECT and import RPC execution privileges are all false. A signed-in non-admin cannot begin an upload or read private coordination records. Public network reading succeeds. All new tables have RLS policies. New RPCs use SECURITY INVOKER and an empty search path. No development project or high-capacity route was edited by this feature.

The security advisor reports no new local-bus findings. Existing public-submission SECURITY DEFINER notices, the intentionally inaccessible private submission-rate-limit table notice, and the pre-existing leaked-password-protection setting remain outside this change. Reference: [Supabase security advisor guidance](https://supabase.com/docs/guides/database/database-linter). Performance notices are unused-index information only, expected for new history indexes.

## Actual browser verification

- The actual browser ZIP converter reproduces the canonical fingerprint, all counts, the 80/4/1/1 mode split, null effective date and unverified status.
- The public map layer loads original route colors. Route 14's live source screening produces individual construction findings, related stops, unknown-date records and route-wide windows.
- Date filtering changes the shared project list/timeline results. Clicking a timeline row selects the corresponding list item and detail evidence.
- Staff-only review forms remain absent in the signed-out browser. Staff save behavior is covered by the interaction harness and live database checks; a signed-in staff browser session was not substituted or fabricated.
- Desktop and 390-pixel phone layout inspected. Advanced filters and long window lists are collapsible; timeline labels remain beside bars with horizontal chart scrolling.
- New-page browser console has no errors. JavaScript files and the main inline application script parse successfully.

Current limitations are operational/source-data limitations documented in `LOCAL_BUS_COORDINATION.md`, not unfinished UI placeholders. The network remains unverified, with no invented effective date, construction dates, service calendar or hours.
