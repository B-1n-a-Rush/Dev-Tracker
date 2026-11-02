# SR2T workspace migration

The SR2T filters, summary cards, site list and selected-site profile now render through typed React components in `src/react/sr2t/Workspace.tsx`. Overview, Improvements, Plans & photos, and Staff & history use React. Field visits and Leaflet previews use explicit adapter containers with cleanup. The existing native dialog, import/editor panels, exports, authenticated services and map layers remain in their existing modules.

The service controller owns filters, selected site, selected section, inventory and permissions. React receives those values and invokes typed callbacks. Other modules do not mutate React input values. `trackside-sr2t-state.js` supplies the same visibility rules to the list, map and inventory exports. The shapefile shortcut intentionally continues to export all active published SR2T sites regardless of workspace filters, as its label explains.

Search, status, jurisdiction and selected site survive editing, refreshing and closing/reopening the workspace. A saved site stays selected even if its new values no longer match the filters; an explicit notice explains this and offers to clear filters. Selection is removed if the record disappears, becomes unavailable to the current role, or moves between the active and removed inventories. Role loss clears private sections and drafts immediately. Private requests ignore results after the component unmounts or the staff session changes.

Filtering no longer destroys and recreates the selected site's Leaflet map. The map is recreated when the site or network changes, or when leaving and returning to Overview. Filters are controlled inputs. The existing site editor remains deliberately uncontrolled, preserving native validation and its established save contract. Save/removal finalizers now also refresh React's busy state; database, stop-matching, upload and optimistic-version behavior are unchanged.

Refresh failures retain the last loaded inventory with an error and Retry action. Exports are disabled until a successful refresh. First-load and empty-filter states have separate messages. County labels retain their actual saved values. No dates, matches or accessibility certifications are invented.

## Use and build

Open **Layers → Safe Routes to Transit → Open SR2T workspace**, or use its Coordinate/Admin entry. Existing editor, plan and field-visit controls remain available according to permissions. There is no new sign-in or database migration.

Use the existing pinned toolchain:

```text
pnpm run check:react
pnpm run test:react
pnpm run build:react
pnpm run prepare:release
```

The compiled shared bundle is approximately 239 KB / 74 KB gzip (previously 227 KB / 71 KB gzip). It loads only when one of the React tools is opened. No dependencies, runtime CDN or paid service were added. Static release preparation includes the new model, compiled bundle, source, tests and documentation and excludes QA fixtures.

## Verification

- Ten visibility/selection checks cover composed filters, leading-zero stop search, draft/removed isolation, role loss, selection after saved changes, missing selections, jurisdiction retention and immutable inputs.
- Browser tests with the real React renderer and a synthetic API transport covered saving with all three filters active, the saved overview outside those filters, retained selection, refresh failure/recovery, staff history, field-visit save/refresh, session loss, removal/restoration, and map filtering after Show on main map.
- The profile map retained the same instance through search, status and jurisdiction changes. The filtered map showed only the matching site; reopening retained the search.
- Both the 390 × 650 phone frame and desktop fit without horizontal overflow. Browser logs showed no warnings or errors.
- Existing SR2T, file/matching/removal, field, map-link and shapefile checks are run after installation. Build and strict TypeScript checks pass.

Tests edited synthetic sites only. No real SR2T records, photos, plans, auth rules or database schema changed. This is a local update; publication to GitHub remains a separate action.
