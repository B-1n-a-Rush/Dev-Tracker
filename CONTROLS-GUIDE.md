# Clearer controls and contextual Help

Implemented locally October 31, 2026. The existing green-and-cream design, status/route colors, map calculations, record values, authentication and publication permissions are retained.

## Use

- **Help** in the main header opens a guide for the current workspace. Seven topics cover finding projects, filters/distances, layers/exports, analysis, coordination, Following, evidence confidence.
- Tool-specific Help links are available inside the SR2T, walking, coordination, schedule, hotspot, local-bus, Following and export workspaces. A second Help dialog preserves the underlying workspace and returns focus when closed. Escape closes Help first.
- Analyze and Coordinate launchers have short descriptions. **Show short tool descriptions** in Help can hide or restore these captions. This display preference is saved only in the current browser at this address.
- Filter labels now identify project status, rail station, development type, corridor proximity, station radius, residential-unit range and recorded verification. Inline notes explain radius, housing counts, county context and the saved-update fallback used when a verification date is absent.
- **Updated in past 30 days** makes the existing recent-update window explicit. **Clear filters** clarifies that the list control resets filters rather than deleting records.
- The guide distinguishes straight-line buffers from walking networks; an inventory stop link from field verification; unverified source networks; estimated/confirmed/unknown dates; monitoring attempts from approved project changes; and published records from staff drafts.

## Scope

The new `trackside-controls-guide.js` and CSS add presentation/help behavior only. They make no database requests and do not change authentication, saved project records, route geometry, data-confidence values or review decisions. The only existing event changes prevent filter-dismiss handlers from consuming Help interactions or Escape intended for Help. The existing workspace and field IDs, handlers, option values, map and export modules remain in use.

The main HTML and workspace script load the new guide after the existing features. The development tracker and the existing 4195 preview are installed together, with prior checksums verified and backups kept in the task folder. GitHub publication is a separate step.

## Verification

`node work/check-controls-guide.cjs` checks runtime and existing inline JavaScript syntax, one-time script order, and the Help module's read-only boundary.

Browser checks cover all ten launcher descriptions; filter-help mouse and keyboard activation; retained search/station values and advanced-filter visibility; Escape and focus return; optional-description preference persistence; preserved study/scenario controls and scenario counter; walking workspace open/close; the existing 19-option shapefile export; the SR2T workspace; nested Help preserving both native SR2T and embedded walking workspaces; and a 390 × 650 CSS viewport without horizontal overflow. Existing records were not edited or submitted during these checks.

## Deferred follow-ups

- Group Atlanta Streetcar with existing transit services, keeping its geometry and route overview.
- Consider the separately proposed React pilot in an isolated preview.
- Publish the approved local release, including shapefile exports and this guide, to GitHub when requested.

Update October 31: removed the Admin tasks topic and the contextual admin Help link at the user's request. Admin controls and permissions are unchanged.
