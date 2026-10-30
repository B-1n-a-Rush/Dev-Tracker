# SR2T plan files and stop picker

Implemented October 29, 2026.

## Use

Open Coordinate → Safe Routes to Transit, or Admin → SR2T sites → Manage SR2T sites. Add a site or edit one. The stop search is at the start of the editor: type an imported ID, source stop number/code, or words from the stop name, then select Add stop. More than one stop can belong to a site. Existing confirmed links are retained. Preview the candidate location and record the plan/reference checked before confirming each match. Selecting a stop does not automatically publish it. The test network remains labeled unverified.

Choose site plan PDFs or drag files into Site plan PDFs. Each file can have an editable title. Save site uploads the files and stores their references with the site. PDF only, maximum 20 MiB each, 30 documents/photos per site. The original optional source-record URL remains available for citations. Existing URL attachments are retained and editable/removable. Photos are supported through existing links; new local uploads in this release are PDF plans. No bulk PDF text extraction or automatic stop identification is included.

File access defaults to staff only. A plan is publicly downloadable only when its Show plan on published site option is selected AND the site is published. Draft sites do not expose plan files. Public site JSON still contains document metadata; file access settings protect the file contents. Avoid private information in document titles/filenames on a public site.

The private sr2t-site-plans bucket uses tracker-admin insert/read policies and conditional public read policy. Downloads use five-minute signed URLs, generated on demand and never saved in site JSON. Uploads are immutable unique paths; no overwrite/delete permissions are granted. Replacing/removing a plan changes the current site references after Save, preserving old stored objects for history. Previously issued links expire within five minutes. An administrator must review historical/unreferenced objects before any future cleanup; cancelling an already-uploaded draft can leave an unused private object.

Failed site saves retain the draft and successful upload paths for retry, avoiding duplicate uploads. Unsaved file selections are memory-only and are discarded if the user leaves the draft. Keep the original site ID after a successful upload, or remove and reselect files for a different site ID.

## Verification

- 9 new Node checks: ID/code/name search, leading zeros, review state, PDF header/type/size validation, legacy/upload round trip, path/site validation, raw authenticated upload and immutable paths, anonymous upload rejection, five-minute signed URLs, and external URL rejection.
- 8 existing SR2T core checks passed.
- 10 live database permission/validation checks passed, including staff/private access, approved public read, nonadmin/foreign-prefix upload denial, cross-site/forged metadata denial, and unpublication revoking future download authorization. All synthetic objects/sites/users were transactionally rolled back. Original SR2T database regression checks also passed with zero test sites retained.
- Live Storage endpoint accepted the app public-key request and denied a nonexistent object. Security advisor returned no new findings for these changes; unrelated existing findings remain unchanged.
- Isolated browser fixture verified partial ID and street-name search, two-stop grouping, evidence confirmation, PDF selection, failure/retry with exactly one upload, saved-plan editing, explicit public display and role changes. Fixture uploads are simulated; no user plans were uploaded for testing.
- Phone-width search/upload controls fit without horizontal overflow. Existing auth and unrelated data/page code compared unchanged.

Applied remote migration 20261030002217_sr2t_plan_uploads.sql. Runtime files must be included in a future GitHub publication; local installation does not publish the frontend.
