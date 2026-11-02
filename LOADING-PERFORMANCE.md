# Bus impacts and hotspot loading

The local-service network now uses one shared cache in the existing Supabase client. Callers still retrieve the live network catalog first. Only the immutable `data` payload is stored in IndexedDB, keyed by project URL and the exact import fingerprint; operational metadata is merged from the live catalog. This shares geometry across SR2T, local routes and GIS exports. Cached payloads expire after 30 days, with at most two versions retained. Credentials, review notes, signed URLs, PDFs and photos are not added to this cache. Storage failures/timeouts fall back to the live service and memory reuse. No service worker or new dependency is required.

Bus-impact screening reuses up to eight full-precision results while the source inventory object, network/mode signature, route and screening distance remain the same. A changed inventory, geometry version or mode override invalidates the match. Explicit Refresh rereads infrastructure sources and recalculates. Date/agency/direction/pattern filters continue to operate on the screened result. Review notes are fetched again; successful synchronization of an unchanged finding batch is not repeated on every reopening. Failed synchronization is retried. Combined construction windows are reused only with the same findings, date inputs and dismissal decisions.

Hotspot spatial screening and marker-anchor calculation run in `trackside-hotspot-worker.js`. Results return compact IDs and computed values; the UI reconnects the original routes, schedules and project records. The worker imports the existing geometry/date algorithms without simplification. Unchanged reopening reuses results and anchors; a new inventory, route geometry, schedule or screening distance causes screening again. Current staff checkpoints and live schedules are still fetched. A cooperative fallback supports browsers that cannot run workers. Opening a cached infrastructure inventory no longer triggers an unrelated rebuild of the infrastructure layer.

## Verification

- Nine cache/worker tests: cross-page reuse, in-flight sharing, fingerprint/project isolation, corrupt/expired entries, blocked storage/quota failure, stalled reads, failed live downloads, bounded public-only persistence, and worker/full-precision algorithm parity.
- Two API integration checks verify fresh operational metadata over reused geometry and exclusion of staff/auth state from disk.
- Reopening the bus view five times after its initial open required one screening total, compared with six before. Explicit Refresh performed another screening. Staff reopening skipped duplicate synchronization; Refresh synchronized again.
- Fourteen existing bus performance/refresh regressions, 31 coordination UI checks, and 12 infrastructure checks passed during staging. Targeted API, screening, role-loss and SR2T regressions are run after installation.
- In a local HTTP browser test with sources already loaded, bus reopening completed in approximately 150 ms and hotspot reopening in approximately 430 ms. These are individual local observations, not a general speed guarantee.
- The real hotspot view showed 136 unique projects: 17 with potential overlaps and 119 with unknown timing. The bus view showed 32 nearby projects for its selected route. Browser console had no errors in the normal preview.
- A fresh page on the same origin reported one IndexedDB hit, zero full-network requests and zero storage failures. No live project, staff-review or schedule record was edited during browser testing.

## Use and limitations

Use the existing **Local bus construction impacts** and **Coordination hotspot map** controls. Existing Refresh actions remain available. There is no database migration, sign-in change or GitHub publication.

Use the HTTP local tracker or GitHub Pages for background workers. Browsers restrict workers and persistent storage on `file://`; the compatibility fallback can be slower. The first open still waits for agency feeds, source normalization and the initial full-precision calculation. Network outages remain explicit, and cached geometry never turns unavailable construction sources into a zero-impact conclusion. Clearing browser site data also removes this disposable geometry cache without changing server records.

Run `npm run test:loading` for the portable cache/API tests. The existing static release manifest includes the new scripts, worker and tests and excludes local QA fixtures.
