# Safe Routes to Transit workspace

Implemented locally October 29, 2026. Database: existing Trackside Supabase project `jhscjyxufwvoslzxrwwq`. No original project, route, construction-impact or walking-access records were modified.

## Open and use

- Coordinate → **Safe Routes to Transit** opens an independent window.
- Layers → **Pedestrian access improvements** → **Safe Routes to Transit · SR2T** toggles its independent map overlay. This does not require the local bus route/stop layers. Low zoom groups sites; closer zoom shows the linked stops for multi-stop sites. Border colors retain Planning purple, Construction orange, Complete blue, with gray for Unknown.
- Sign in through the existing admin login → **SR2T sites** → **Manage SR2T sites**. Add/edit sites, keep drafts private, or publish once every stop link has been reviewed. Unpublish by clearing the publish checkbox; the record and history remain.
- Each site has an ID, name, jurisdiction, status, detailed phase, street/location, construction dates and date certainty, source verification date, improvements and delivery states, public plan/photo links, and optional public context. A site may serve multiple stops. Counts distinguish sites from distinct linked stops.
- Staff owner, next action and internal notes live in a separate admin-only table. Staff & history shows those notes and the latest 30 record changes. Site links and CSV/JSON exports contain public-profile information only, including draft public-profile fields when exporting as an administrator.

## Import an inventory

Admin → SR2T sites → Manage → **Import / match inventory**. Choose/drop a CSV or JSON file (up to 500 source rows, 3 MB). Download the blank CSV template there.

CSV requires `site_id,name`. Optional columns: `stop_numbers,status,phase,jurisdiction,location,improvements,source_url,source_title,start_date,finish_date,date_certainty,verified_date,public_notes`. Separate stop numbers and improvement types with semicolons. Keep stop numbers as text to preserve leading zeros. Status values: Unknown, Planning, Construction, Complete. Dates: YYYY, YYYY-MM or YYYY-MM-DD; leave unknown dates blank. Construction dates are optional.

Repeated rows with the same site ID combine their stop numbers. Conflicting values block that entire site and display an error; other valid sites remain staged. Existing IDs update the same record after review, with version checks. Blank CSV fields preserve existing values; use the editor to intentionally clear them. CSV export is a spreadsheet-safe summary; **full inventory JSON** retains improvement states/details, document links and stop references. JSON accepts an array or `{ "sites": [...] }` of site records.

Importing only stages records. Choose **Review site**, inspect each stop's name, coordinates, route associations and candidate map, record a public plan/reference, then confirm the link. Save a draft or explicitly publish. Private staff notes are fetched separately before editing an existing site and preserved during inventory refreshes. Imports do not bulk-publish or automatically approve stop links.

The current stop reference is the **unverified Test local routes** export. Its `stop_id` is not proven to equal MARTA's public stop number. Exact IDs/codes produce candidates, never automatically confirmed matches. A staff reviewer can search and select a different imported stop. A changed network fingerprint flags saved matches for renewed review; obsolete geometry is excluded from the overlay until rechecked. Server validation uses the actual active network geometry rather than client-supplied coordinates.

## Verification

- `node work/test-sr2t-core.cjs`: eight grouped checks cover CSV grouping/leading zeros/quotes, conflicting rows, partial refresh preservation, full JSON round-trip, dates/status/link validation, cautious matching, stale network links/distinct-stop counts, and spreadsheet-safe export.
- `work/test-sr2t-database.sql`: transaction-only test passed against Supabase. It created and rolled back a synthetic staff identity/session and test sites. Verified create/update/audit/version behavior, stale-write rejection, publication checks, server-owned stop geometry, notes preservation, date checks, stale-network rejection, anonymous/non-admin privacy/write restrictions and revoked-session rejection. No test site or identity persisted.
- Browser: real app connected to the empty live SR2T inventory; independent Coordinate launcher and modal; no browser errors. An isolated localhost fixture (not installed or published) verified real CSV file selection, two rows grouped to one two-stop site, candidate map preview, publication guard, explicit confirmations, profile and counts, draft save, stale edit retaining unsaved notes, and clearing staff content after session loss.
- Actual app checked in a 390 × 844 CSS iframe viewport: modal stays within the viewport without horizontal overflow. The existing browser viewport override did not resize the in-app browser, so the embedded content viewport was used for this check.
- Pre-install comparison verified that existing HTML, workspace, auth and data logic were unchanged except the SR2T module loading, four API methods and two workspace launch/tab hooks. Existing features were smoke-checked in the live preview.

## Still pending

The real SR2T plans/inventory have not arrived, so there are no fabricated public SR2T sites. This release provides inventory entry, reviewed matching and profiles. Batch PDF extraction/OCR and matching the approximately 160 plan files will be a later import step. Plans/photos currently use public-approved http(s) links; this release does not upload the original PDFs or create a public document-storage bucket. It does not certify ADA compliance or guess construction dates. The stop reference itself remains unverified until a verified stop-number crosswalk/network is supplied.

This feature has not been published to GitHub as part of this change. Its new runtime files, updated three integration files and migration must travel together in a future release.
