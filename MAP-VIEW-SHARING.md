# Share this map view

Choose the small **Share view** link beside **Hide panel** at the top of the tools panel, then **Copy link**. A coworker can open the public view without creating an account. A received view waits for the current project and route library, then restores display settings and any required optional layers.

The link includes the map center and zoom; development status, search, type, station/corridor, station radius, residential-unit range, verification-date range, county, recent-update and DRI filters; pin clustering; rail, route, project, infrastructure, boundary, parcel, local-bus/stop and SR2T visibility; local-bus map search; SR2T map filters; a completed custom study buffer/polygon; and a selected public project, station, route, infrastructure item or SR2T site when applicable. Route references use stable uploaded IDs, with names for built-in rail references. Camera positions may differ by a fraction of a screen pixel when Leaflet fits a different screen size.

Only explicit public settings and IDs are encoded. The generated URL clears old query strings and fragments, including authentication redirects, project-only links and scenario payloads. Project selections are checked against the existing published-only project endpoint. SR2T selections are restricted to published, active sites. No sign-in details, saved watches, staff notes, PDF storage paths, forms or source project records are copied. Applying a view does not save database edits or replace browser-saved layer preferences. Later explicit user layer changes use the existing preference behavior.

Views show current data rather than frozen counts or geometry. Missing references and partial/offline source coverage are reported. Network-version changes are disclosed when local-bus data differs. A route ID that has been removed is not replaced by a similarly named route. Unknown options do not silently produce a claimed exact match. View payloads are versioned, bounded and validated before application; unknown fields are discarded. Portable study polygons support 3–120 vertices. No new service, account system, paid API, database schema or production dependency is introduced.

Walking calculations and drawn scenario alternatives keep their existing dedicated tools. A sender with local scenario concepts is told to use Scenario studio’s own share link for those concepts. The recipient’s personal scenario overlays are temporarily kept out of a received public map; choosing Scenario studio restores them, without deleting saved concepts.

The existing project-only, SR2T and coordination briefing links remain available. A view link uses a clean `view` parameter and does not interfere with the project URL loader. Back/forward view requests are serialized, and an open editor/tool is not discarded to apply a different shared view. Escape closes map sharing without closing the selected project behind it.

## Local preview and publication

Local previews generate the canonical GitHub Pages URL for coworkers and provide a **Preview locally** link for testing. The modal explains that this local version must be published before the public link can restore its settings. This work installs the feature locally; GitHub publication is separate.

## Verification

Automated checks cover complete/Unicode round trips; public-setting allowlists; clearing auth/query/fragment state; validation of versions, coordinates, controls and payload size; stable rail/Streetcar references; study geometry precision; and bus display restoration without review writes. Existing bus performance and interaction, SR2T marker, coordination, Streetcar and shapefile checks were run against the combined code.

Browser verification uses real published data and official feeds. A fresh tab restored only Buford ART despite different saved preferences, three project filters, public infrastructure and local-bus search. High Street reopened with its detail profile and search; Dunwoody reopened with a quarter-mile radius. A custom quarter-mile study buffer reopened with its analysis. A missing route and malformed payload showed explicit messages. The phone view was checked at 390×650 CSS pixels with no horizontal overflow. Copy and the local preview link work, and Escape preserves the underlying project profile. These checks do not create or modify production records.
