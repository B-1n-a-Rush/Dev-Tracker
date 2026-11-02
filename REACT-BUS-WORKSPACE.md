# React local-bus construction workspace

Implemented locally November 1, 2026. GitHub publication is separate.

## Scope and use

Open Coordinate → Local bus construction impacts. Select a route, direction and pattern, then optionally expand the screening/date/agency/review filters. Active filter chips can be removed individually. Results show construction windows, unknown timing, geometry confidence, scoped stops and review state together; staff also see workflow status and owner. Map markers, results and timeline rows select the same finding.

Results are displayed 20 projects at a time. The timeline follows that page, while its date axis, the map, totals, simultaneous windows and CSV cover the full filtered result set. Selecting a finding on the map brings its results page into view. Combined windows distinguish route-wide concurrent work from evidence of shared physical work areas. Unknown or incomplete construction dates stay visible without invented overlap windows. The existing unverified-network banner and source provenance are retained.

## Implementation

- `src/react/bus/Workspace.tsx` owns filters, active chips, route summary, original attributes, stats, combined windows and paged finding cards. `Timeline.tsx` owns timeline rows and axis.
- `outputs/trackside-bus-view-state.js` provides stable external snapshots and small field handles for the existing controller's filter contract. No duplicate hidden control tree is maintained. Normalized view data stays separate from full route/project geometry.
- The existing `trackside-local-bus.js` controller retains worker screening, source/network caching, Leaflet maps, native staff-review form and save contract, network import/management, and full-precision calculations. New view adapters replace the imperative control/list/timeline rendering. Selection-only updates retain screening results and the timeline model. Timeline inputs and finding cards are memoized; long result lists are bounded rather than all mounted.
- Loading phases are explicit. Inputs lock during screening. Invalid date ranges clear stale displayed matches. Empty route searches clear results and disable CSV. CSV stop IDs now follow selected direction/pattern relationships, consistent with the cards/map.
- Reviews retain their source-map/route/project identity and optimistic version baseline. Unsaved text survives canceled navigation and failed saves. Meaningful changed matches flag renewed review. Sign-out removes private form text and view summaries and ignores late private-review responses.

No new dependencies, database migrations, geometry simplification, paid services, service calendars, artificial route construction dates, or automatic operational approvals were introduced. The shared production React bundle grows by about 10 KB uncompressed (about 2.6 KB gzip). React organizes interface state; geometry worker/caching reuse provides the calculation savings, and no universal speedup is claimed.

## Verification

Strict TypeScript and the production build passed. Nine view-state tests and twenty controller integration tests cover single findings, route-wide windows on different sections, nonoverlap, unknown dates, footprint vs point confidence, synchronized filters/selections, invalid ranges, retained drafts, repeated saves/conflicts, date changes/review notes, role loss/late responses, cache reuse, source failure, mode exclusion, paging, review validation, orphaned saved follow-ups, scoped CSV stops and empty searches. The controller tests use a small offline DOM/transport harness; the real React components are verified separately in the browser.

Browser verification used an isolated synthetic transport: review-save failure/retry; retained note and renewed review after dates changed; public sign-out; filter chips; direction scope; date validation; paging; timeline selection; full totals; and one geometry download across filtering. A 390-pixel-wide frame fit with no horizontal content overflow. A public read-only run using the actual 80-local-route network produced 32 findings for Route 14, retaining the source color and full geometry. No production records were edited during verification.

Existing import/geometry/timeline/review, API, cache/worker, and shared React tests also passed. Run `pnpm run test:react` or `pnpm run test:bus-ui` for the published interface checks. QA pages are not installed or included in a release.

The map, review editor and network-management forms remain native controllers; this is an incremental migration. Exact work limits, service calendars and missing dates still depend on source data and staff review.
