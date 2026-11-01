# SR2T field visits

November 1, 2026. Uses existing tracker administrator accounts. Public viewing needs no account.

Open **Coordinate → Safe Routes to Transit → select a site → Field visits** while signed in as an administrator. Choose **Record field visit**. Select the visit date and either the whole site or one of its linked stop numbers. Record sidewalk, crossing, curb-ramp and boarding/access conditions. All four start as **Not checked**. **Needs attention** requires an explanatory note. Add visit notes and a next action when useful.

Attach up to six JPEG, PNG or WebP photos, up to 15 MB each and below 40 megapixels. The browser prepares JPEG copies with a maximum dimension of 2,400 pixels, removes embedded camera/GPS metadata by drawing to a fresh canvas, and limits the result to 5 MB. Original files are not uploaded. Supply a caption and label each photo **Before**, **After** or **Condition**. The manually entered visit date describes the observation; camera dates are not inferred. Unsupported images remain unselected and the error explains what to change.

**Save field visit** stores a separate staff record. It does not modify the SR2T site, stop links, construction dates, improvement-delivery states or project status. It is an observation, not an ADA compliance certification. Photos and notes remain staff-only and are excluded from public site JSON, shared map links and general GIS exports. No public account or new signup flow was added.

Open a saved visit to view its observations and request a photo. Photo links expire after five minutes and are never persisted in records. Previously issued links remain usable until they expire. **Edit visit** uses a baseline revision; another staff member's change blocks a stale save and retains the draft. An interrupted save can be retried with the same visit ID without adding a duplicate. Successful uploads are retained for retries. Revision history records who changed a visit, when and the before/after record. The UI shows the latest 20 revisions and loads visits in pages of 50. Stop numbers retain leading zeros. If stop links change, an old visit stays in history; editing requires selecting a current stop or the whole site.

Removed sites retain read-only visit history. Restore the site before adding or editing visits. There is no permanent-delete control. Cancelling after upload can leave a private, unreferenced object; automatic storage cleanup was deliberately not added because revisions may still reference an older photo.

## Implementation and verification

`trackside-field-core.js` handles validation, `trackside-field-visits.js/.css` provide the on-demand staff UI, and existing `supabase-data.js` provides authenticated requests. `sr2t_field_visits`, `sr2t_field_history` and the private `sr2t-field-photos` bucket use the existing live-session administrator check. Server validation requires a real site, a linked stop when supplied, valid dates, bounded observations and matching stored photo metadata. Authors, timestamps and revisions are server-controlled. Public and nonadmin users cannot read or write these records or photos. Objects have immutable upload paths, without client overwrite/delete grants. No new package or paid service was introduced.

Applied migration: `20261101171432_sr2t_private_field_visits.sql`. The Supabase MCP generated the recorded migration version; the matching local SQL is retained for releases.

Nine core/API tests cover date validation, unknown observations, concern notes, stop IDs, bounded/cross-site/cross-visit/duplicate photo references, JPEG headers, authenticated paging, immutable uploads, five-minute same-origin signing and baseline saves. Transaction-only database tests cover creation, retries, revision history, conflicts, invalid payloads, storage ownership/metadata and anonymous/nonadmin/revoked-session access. All synthetic identities, sites, records and object metadata were rolled back. Security advisor results were unchanged from the pre-change baseline.

An isolated browser fixture exercises the actual editor and photo preparation with simulated API transport: save, reopen, photo viewing, a failed save followed by a retry with one upload, stale-edit retention, and session-loss cleanup. The form fits a phone-sized viewport without horizontal overflow. A real signed-in upload of a user's site photo has not been performed by the agent; no user photos or credentials were used for testing. The database/storage access checks and client request tests cover those boundaries separately.
