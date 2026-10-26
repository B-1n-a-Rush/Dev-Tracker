# “What’s happening here?” location overview

Installed in the local tracker on October 24, 2026.

## Use

Refresh the tracker and choose **What’s here?** in the map toolbar. The same action is available in project, parcel and infrastructure details.

Choose a point or use the current project/map center, then select 0.1, ¼, ½ or 1 mile. Development, infrastructure and transit proximity update with the radius. Parcel records refer to the selected point, not every parcel inside the circle.

The overview shows residential units, hotel rooms, retail/commercial/medical square footage, status and type summaries, nearby development, public infrastructure, transit alignments, rail stations, and county parcel records. Cards link to the existing detailed profiles and official sources.

## Interpretation

- Development totals use all located published projects in the radius, independently of the active map filters. Filters remain unchanged.
- Totals sum recorded structured values. Missing quantities are not evidence of zero development. Tax-record units are separate from development units.
- Completed and long-range infrastructure have separate optional controls.
- Possible infrastructure duplicates and imported ART/BRT/LRT alignments remain excluded. Published tracker route geometry supplies rapid-transit alignments.
- Infrastructure windows retain their source labels; incomplete schedules and ARC planning areas are identified explicitly.
- Unavailable feeds, unmapped records and incomplete parcel coverage are reported. No matches do not establish that no work is planned.
- Distances are screening distances, not walking routes, surveyed construction footprints or confirmation of a conflict.
- Connected coverage remains incomplete; dedicated Fulton/Clayton utility capital feeds are not connected.
- Closing/navigating away dismisses the overview. Late GIS responses cannot reopen it. Escape cancels point selection.
- Supabase project records, authentication, permissions and review queues are unchanged.

## Files

Updated index.html and trackside-land.js; added trackside-here-core.js, trackside-here.js and trackside-here.css. Relative asset references use version 20261024-here. Deploy these five files together when publishing is requested.

A pre-install backup of index.html, trackside-land.js and the existing test harness is in work/before-whats-here-1792870210787.

## Verification

39 automated regression tests passed in the actual tracker folder:

    node work/test-land.cjs
    node work/test-land-arc.cjs
    node work/test-here.cjs

JavaScript syntax, the existing inline app script, and local asset references also pass. Tests include radius updates, totals, source exclusions, parcel grouping, safe text rendering, late responses, outages, point selection, navigation, and drawing-mode conflicts.

Real-browser visual review remains pending: the prior HTTP readiness check was blocked by local socket permissions. No browser-policy workaround was used. GitHub has not been updated for this feature.
