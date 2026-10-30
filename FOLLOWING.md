# Following

Implemented October 29, 2026. Replaces the primary Saved navigation with Following and removes the digest launcher from Coordinate.

## Use

- Updates: select a watch, check published sources, review individual changes or explicitly mark available updates reviewed. Opening and checking do not clear unread changes.
- Saved projects: open bookmarked projects, see following/pending state, retry pending first baselines, or Unsave.
- Manage watches: add, adjust, rename, stop following, export, and import custom watches. Adjusting coverage preserves the previous baseline and requires an explicit decision before comparing a different selection.

Save & follow uses the original bookmark persistence and authentication behavior. Successful bookmarking adds the project to one automatic group. Existing bookmarks migrate without changing custom watch IDs, reviewed values, creation times, or unread changes. Failed authenticated bookmark writes do not create a follow. Failed published-data reads keep bookmarks pending; retries do not review older changes.

Watches, review baselines, and read state remain browser-local at the exact tracker address. They do not automatically sync across devices or between localhost and GitHub Pages. Existing bookmark account behavior is unchanged. See CHANGE-DIGEST.md for source boundaries, snapshot limitations, storage limits, and backup behavior.

## Verification

11 Following checks cover migration, unread preservation, membership changes, outages, late responses, twelve existing custom watches, v1 compatibility, actual bookmark-helper failures, and concurrent clicks. The existing digest core, worker, and public/admin read-boundary suites also run against this version. Browser checks cover all three tabs, primary navigation, Save & follow, pending/retry, Unsave, adjustment without acknowledgement, and responsive layout. Synthetic fixtures use isolated memory and make no database writes.

No database schema, authentication policy, automation, or public map data changes are included. No GitHub publication is included.
