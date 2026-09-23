# Trackside ATL Supabase setup

Supabase project: `Dev-Tracker` (`jhscjyxufwvoslzxrwwq`)

## Current state

- The `projects`, `admin_users`, `saved_projects`, `project_change_history`, and `project_change_proposals` tables are live.
- Row Level Security is enabled on every public table.
- Published projects are publicly readable.
- Project creation, editing, and deletion require an authenticated user listed in `admin_users`.
- Saved projects are private to the signed-in user.
- The browser configuration uses only the public publishable key. No secret or `service_role` key is stored in this repository.
- The 138 browser-local projects have been migrated, including local edits, DRI numbers, parcel geometry, timelines, and separate home/residential-unit totals.
- `outputs/supabase-config.js` has `syncEnabled: true`; Supabase is now the canonical project source with a browser-local fallback if the API is temporarily unavailable.
- The owner's Supabase Auth account is created and allow-listed in `public.admin_users`.
- Admin RLS was verified with an authenticated write test that was rolled back after the check.
- Project creates, edits, and deletions are captured automatically by a database trigger with before/after snapshots; only approved administrators can read the history.
- Scheduled news monitoring writes evidence-backed suggestions to an admin-only proposal queue. It cannot directly edit a public project.
- Approval is transactional: an accepted suggestion updates the project and automatically enters the permanent change history; rejection leaves the public record untouched.
- Proposals are rejected as stale if the project changed after the source review was prepared.
- The admin monitoring dashboard summarizes coverage, recent checks, pending suggestions, stale checks, and errors. Its database endpoint is restricted to allow-listed administrators.
- Each project in the monitoring dashboard has an admin-only **Request priority check** action. It adds the project to `public.project_monitoring_requests`; the daily Codex automation checks queued projects first, so the button does not require OpenAI API billing.
- Priority checks never update `public.projects` directly. The daily automation uses the existing proposal review and audit-history workflow. The retired immediate-check Edge Function returns HTTP 410 and makes no OpenAI API requests.

## Next phase

1. Review the first source-monitoring results under Suggested project changes.
2. Let the daily monitor build coverage across the remaining projects and watch failures in the monitoring dashboard.
3. Add production hosting and domain URLs to the Supabase Auth redirect allow-list before launch.
4. Add optional rollback tooling after the audit log has accumulated real changes.

The SQL files in `migrations/` mirror the migrations already applied to the hosted Supabase project.
