# Trackside ATL workspace

The main tracker now uses the approved green-and-cream workspace layout.

- **Explore:** search projects, open their profiles, and switch Map / List. **Filters** opens over the map with an active-filter count, matching-project count, and Clear all. Expanded controls scroll within the popover. Close, Escape, or an outside click dismisses it.
- **Layers:** manage the existing development, parcel, rail, BRT/ART, LRT, and local bus layers.
- **Analyze:** use study areas, route scenarios, What's here, and the walking-access workspace. Walking results use mapped pedestrian paths and retain the original data-coverage caveats.
- **Coordinate:** open infrastructure tools, the standalone construction watchlist, schedule coverage, hotspots, and local bus construction impacts. Existing review and save safeguards remain in use.
- **Admin:** sign in with an approved account. Categories group the existing tools, including Route files with its file selector. Team access remains owner-only.
- **Map space:** Hide panel expands the map; Show tools restores it. The desktop panel can be resized. Phone navigation is along the bottom, with News and Saved under More.

The application continues to use the same live Supabase project. Saving an authorized edit changes live data. This layout is not a separate database or test environment.

Deploy the complete runtime directory, including workspace.js, workspace.css, workspace-assets/, the walking-access modules, and walk-data/. Walking data loads on demand. The icon attribution is in workspace-assets/ATTRIBUTION.txt.

Public navigation, filters, walking calculations, native coordination dialogs, responsive layouts, and underlying calculation modules were verified. Authenticated saves, uploads, and review decisions require a signed-in acceptance check; no production record was edited during release verification.
