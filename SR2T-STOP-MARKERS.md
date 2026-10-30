# SR2T walking markers at linked stops

Implemented October 29, 2026.

Each current mapped stop receives its own walking marker at its imported coordinates. A multi-stop site's midpoint marker and secondary circles are replaced in both the main map and site profile map. Markers retain project-status border colors. Regional markers are smaller and have no permanent labels or group-count badges; hover text is suppressed at regional zoom too.

Hovering or focusing one marker enlarges and outlines all stops in that site. Clicking/tapping keeps the group highlighted and opens a small popup instead of immediately covering the map with the full workspace. Open site profile opens the shared site. Show all stops fits the group. Selecting another site, closing its popup, clicking empty map space or pressing Escape clears/changes selection. Panning keeps the clicked group selected. Keyboard Enter and Space activate markers; reduced-motion preferences disable animation.

Map markers are cached by site/stop and moved/recolored as records change. Panning does not rebuild marker elements. Zoom updates compact styling. Stale, unconfirmed, invalid and duplicate stop links are omitted; no centroid, walking connection, work footprint or crossing is invented. Existing site counts and stop identities are unchanged. Removed sites remain excluded through the existing inventory filters.

Verified: 5 new source-coordinate/deduplication/immutability checks plus 8 existing SR2T core checks; changed scripts compile and unrelated HTML/API/auth code is unchanged. Browser fixture checked paired hover, unrelated-site isolation, click selection, panning, regional icons without labels, keyboard activation, shared profile map, and phone-width selection. Fixture uses synthetic sites without database writes.

No schema, authentication, database record, automation or API changes. Installed locally with backups. GitHub publication remains separate.
