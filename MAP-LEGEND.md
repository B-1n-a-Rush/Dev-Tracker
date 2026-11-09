# Adaptive map keys

Open Map key at the bottom-left of the main map. It starts collapsed. Expand route/type groups as needed. It describes enabled layers; some features appear only when zoomed in, and enabled layers can have no loaded/filtered features. Existing colors and geometry are retained.

Walking access, local bus construction impacts and coordination hotspots have their own compact map keys. Walking bands are estimated time along connected mapped paths. County sidewalks are a reference overlay. SR2T borders show recorded status; linked figures belong to the same site group. No dates are inferred.

Unverified test bus networks stay labelled. Proximity findings do not establish a closure, delay, detour, safe crossing or service interruption. Unknown timing is separate from potential schedule overlap. Published planning areas and representative points are not construction footprints.

Coordination briefings include a static key for exactly the route and filtered infrastructure in that report. Native printing expands keys and restores their prior open/closed states afterward. Printer monochrome settings can still affect colors. Existing project-profile and scenario-report print layouts are retained.

Small read-only display snapshots and coalesced animation-frame updates drive the keys. No polling, new fetch, full geometry traversal, screening, database write, authentication change or dependency is introduced. Main implementation: trackside-legend-core.js, trackside-map-legend.js and scoped CSS. Verify with node tests/test-map-legend.cjs and the existing regression suite.
