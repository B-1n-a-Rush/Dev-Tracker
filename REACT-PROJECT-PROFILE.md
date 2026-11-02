# React project profile

Implemented locally November 1, 2026. This document does not indicate a GitHub deployment.

The development-project detail content is rendered by `src/react/projects/ProjectProfile.tsx`. Its external store (`outputs/trackside-project-state.js`) owns selection, normalized displayed facts, public approved-news loading, and staff history loading. `outputs/trackside-project-details.js` adapts existing tracker services. The shared React bundle is still lazy loaded through `TracksideEditorReact` and includes the previously migrated export, SR2T editors, and SR2T workspace.

The map, station/corridor profiles, project editor and save service, authentication, database permissions, printable report renderer, bookmarks/Following, and parcel services retain their established controllers. The actual native action buttons are moved into the retained footer with their original event handlers. React owns the profile content rather than maintaining a hidden legacy copy.

Selection changes discard stale asynchronous news/history responses. Unchanged selections avoid duplicate news loads and retain scroll; same-project edits update displayed facts and refresh active history while retaining its tab. History is loaded only for staff on request; losing staff access clears it immediately. Public news failures offer an explicit Retry button. Date-only article dates are formatted at local noon to avoid the prior-day UTC conversion.

## Verification

- Strict React TypeScript check and production Vite build passed with the existing pinned dependencies; no dependencies or schema changes added.
- Twelve project-state checks cover stable snapshots, subscription cleanup, approved news/check timestamps, unchanged-selection caching, stale A-to-B and A-to-clear-to-A responses, retry, staff authorization, lazy history/refresh, role loss, saved edits, selection reset, and clearing.
- Browser checks use a synthetic transport in temporary QA pages, never production record writes: changing residential units from 120 to 345 updates the profile and history; failed saving retains the draft and retries successfully; switching to public removes history/edit controls; copy, native print with updated 345-unit data, news failure/retry, Following add/remove, same-selection scroll retention, and project changes without stale DRI/facts all passed.
- A 390-pixel-wide frame showed a 375-pixel profile with no page horizontal overflow. The actual public Overlook at Garson profile was also checked using published data.
- Boundary assertions confirm native save, print, parcel, bookmark, and role-action implementations are preserved. Date-only formatting was checked in New York, Los Angeles, and UTC.

The migration does not change staff privileges, guarantee a performance improvement, or migrate all tracker screens. Staff browser tests use synthetic authentication; real database permissions and mutations are intentionally unchanged. Temporary QA files remain in the isolated development stage and are excluded from installation/releases.
