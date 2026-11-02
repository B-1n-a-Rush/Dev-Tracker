# React migration — first component

The **Export map data (.shp)** window is the first React interface. Open it from **Layers → GIS export** or the existing SR2T shapefile shortcut. The map and remaining workspaces continue using their established modules. This change preserves the green/cream interface, all 20 export choices, published-data scope, explicit administrator draft selection, full-precision geometry, ZIP generation, worker cancellation and file fallback.

React, React DOM, Vite, TypeScript and type definitions have exact versions in `package.json` and `pnpm-lock.yaml`. Dependencies were installed from the package registry with installation scripts disabled. No runtime CDN, new hosting service, account, database change or paid service was introduced. The production React bundle is requested only when the export window opens, once per page. Its size is approximately 224 KB uncompressed / 70 KB gzip; transfer compression depends on hosting. The small service bridge and state model load with the existing tracker.

## Boundaries

- `src/react/shape-export/ExportDialog.tsx`, `LayerChoices.tsx` and `entry.tsx` own the window contents, controlled checkboxes, status, error boundary and focus-on-open behavior.
- `types.ts` defines the view/service contract. `useSyncExternalStore` reads an immutable snapshot with stable subscription and snapshot functions.
- `trackside-shape-state.js` owns export selection, availability, progress and explicit staff-draft intent. Refresh and reopen preserve an intentionally empty selection. Loss of administrator access clears draft intent.
- `trackside-shape-export.js` remains the service bridge. It owns the native dialog, authentication/session guard, collection, worker build, ZIP download and lifecycle cancellation. The complete collection and worker/fallback section was copied unchanged and verified by checksum.
- The original `trackside-shapefile.js`, `trackside-shape-data.js`, Supabase client, geometry workers and authentication implementation are unchanged. React does not read or modify map-owned DOM.

The native dialog contains one React-owned container. Other code uses the existing `TracksideShapeExport.open()` API and does not mutate React's children. The Help button calls the existing guide API. Closing cancels work and returns focus. Initial loading has a close control; a failed bundle load has a retry. The bundle uses a regular self-contained script rather than browser ESM imports, retaining compatibility with the established static deployment structure. HTTP preview and GitHub Pages relative-path behavior were checked; file:// navigation cannot be exercised through the agent's browser policy.

## Build and test

With Node.js 22.12+ and the pinned pnpm version:

```text
pnpm install --frozen-lockfile --ignore-scripts
pnpm run check:react
pnpm run test:react
pnpm run build:react
pnpm run prepare:release
```

The build supports the local `outputs/` layout and the repository's flat GitHub Pages layout. It writes `react-ui/trackside-shape-react.js` inside the runtime folder, includes React/React DOM/Scheduler license notices, and updates the bridge's bundle checksum for cache invalidation. Generated `react-ui/` files should be rebuilt from source. `package.json` deliberately retains CommonJS defaults so the existing UMD/core Node tests continue to work.

`prepare:release` only creates `work/static-release-manifest.json`; it never publishes. It includes generated React assets, source, build configuration, tests, lockfile and licenses, and excludes dependencies, previews, temporary work and environment files. Use this manifest for future uploads so the new `react-ui/` directory and source are included. A root `node_modules/` folder is needed for development builds, not for viewing the tracker. Dependencies are not copied from the isolated staging installation into the main tracker.

## Verification

- TypeScript checking and production build passed. Repeated builds produced the same bundle checksum for unchanged source.
- Nine state tests cover immutable snapshots, initial defaults, SR2T shortcut, empty-selection retention, unavailable layers, refresh, busy locking, role restrictions and subscription cleanup.
- Seven bridge tests cover worker download, closing during a source request/build, session-loss cancellation, explicit staff/public SR2T scope, empty selection, and worker-unavailable fallback.
- Browser checks used the real React renderer: default/select-all/clear/refresh behavior, original SR2T shortcut, contextual Help, no initial React request, one renderer after reopening, and keyboard focus restoration.
- An actual anonymous SR2T export contained 250 records. Independent Python/PyShp checks verified ZIP, SHP, SHX, DBF, PRJ and CPG. Its geometry and shapefile attributes exactly matched the earlier non-React export.
- Isolated transport fixtures verified admin draft selection, recoverable source failure, session loss removing draft controls and suppressing download, and initial renderer failure followed by successful retry. These fixtures make no database writes.
- The window fits a 390 × 650 content viewport without horizontal overflow. Its scrollable layer list leaves the header and download control accessible.

The SR2T editor, field-visit editor, Following and project panels have not yet been migrated. Those remain subsequent stages of the plan; this release establishes the reusable build and component/service boundary.
