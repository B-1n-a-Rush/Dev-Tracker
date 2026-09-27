# Trackside ATL backup and recovery plan

Last reviewed: September 26, 2026

This plan covers the Trackside ATL Supabase project and the downloadable administrator exports in the web app. The exports are useful portable snapshots, but they are not a complete database backup.

## What is protected

Trackside ATL uses three complementary recovery layers:

1. **Administrative change history** for reversing an individual project edit or deletion from the admin control center.
2. **CSV and GeoJSON exports** for portable copies of projects, transit routes, linked parcels, monitoring proposals, and administrative change history.
3. **Full Supabase database backups** for recovery from broader data loss, corruption, or a failed migration.

The web app never places a database password, service-role key, user password, or access token in an export. Only approved administrators can export proposals and change history.

## Recommended schedule

| When | Action | Store it |
| --- | --- | --- |
| Before a large edit or import | Download Projects CSV, Projects GeoJSON, Project Parcels GeoJSON, Proposals CSV, and Change History CSV | A private, access-controlled folder outside the public GitHub repository |
| Weekly while on the Supabase Free plan | Create a full logical database backup | Encrypted off-site storage with at least two recent copies |
| Before every database migration | Create and verify a full logical database backup | Encrypted off-site storage |
| Monthly | Test that a backup can be restored into a temporary Supabase project | Temporary private recovery project |
| After moving to Pro or higher | Confirm daily backups in Supabase Dashboard; retain independent exports and pre-migration dumps | Supabase plus separate off-site storage |

Supabase currently recommends that Free-plan projects regularly use `supabase db dump` and keep off-site backups. Pro, Team, and Enterprise projects receive daily backups with plan-specific retention. Point-in-Time Recovery is an optional paid add-on when the tracker needs a much smaller recovery window.

## Administrator exports

Open **Admin login**, sign in, and use **Backups & exports**:

- **Projects CSV** — spreadsheet-friendly project data.
- **Projects GeoJSON** — project points and project attributes for GIS tools.
- **Transit routes GeoJSON** — MARTA rail and planned BRT/ART alignments.
- **Project parcels GeoJSON** — parcel boundaries already attached to projects.
- **Monitoring proposals CSV** — all proposal states, evidence, confidence, and review results.
- **Change history CSV** — the complete administrative audit history available to the signed-in admin.

CSV cells that begin with spreadsheet formula characters are escaped before download. Every filename includes an ISO-style timestamp.

## Full logical database backup

Use the current Supabase CLI and discover its installed command options with `supabase db dump --help` before running a production backup. Keep the database connection string in a password manager or secret environment variable, never in source control.

Create separate role, schema, and data files:

```bash
supabase db dump --db-url "$SUPABASE_DB_URL" -f roles.sql --role-only
supabase db dump --db-url "$SUPABASE_DB_URL" -f schema.sql
supabase db dump --db-url "$SUPABASE_DB_URL" -f data.sql --data-only --use-copy
```

Store the three files together in an encrypted, dated archive. Record the Supabase project reference, backup time, and the Git commit deployed at that time. Never commit database dumps to the public Dev-Tracker repository.

If Supabase Storage is added later, back up stored files separately. Database backups contain Storage metadata, not the file objects themselves.

## Recovery procedure

### One project or one bad edit

1. Pause further admin edits.
2. Open **Recent administrative changes**.
3. Confirm the affected project and fields.
4. Use **Reverse change**, then verify the public detail panel and Supabase row.
5. Export fresh Projects and Change History snapshots.

### A group of project records

1. Pause admin edits and export the current state before changing anything else.
2. Compare the latest known-good CSV/GeoJSON export with current Supabase data.
3. Restore only the affected records through a reviewed import or SQL transaction.
4. Validate project count, coordinates, residential-unit totals, linked parcels, and source links.
5. Confirm that RLS still blocks public writes and that an approved admin can create, edit, and delete a test record.

### Full database recovery

1. Freeze all tracker writes and record the incident time.
2. Choose the newest known-good restore point before the incident.
3. On a paid plan, restore from **Database > Backups** or Point-in-Time Recovery in the Supabase Dashboard. Plan for downtime during an in-place restore.
4. On the Free plan, or when preserving the current project for investigation, restore the role, schema, and data dumps into a new private Supabase project by following Supabase's current backup/restore documentation.
5. Apply any newer repository migrations that are not already present in the restored database.
6. Validate row counts for projects, proposals, history, monitoring requests, saved projects, and admin users.
7. Run Supabase security and performance advisors. Verify RLS policies and administrator authorization before directing the production app to the recovered project.
8. Perform a browser smoke test: public read access, admin sign-in, one reversible test edit, exports, and logout.
9. Document the recovery and create a fresh full backup.

Do not delete or overwrite the damaged project until the restored copy is verified. Changing `supabase-config.js` to a recovered project also requires that project's URL and publishable client key; secret or service-role credentials must never be placed in the browser app.

## Recovery objectives

- **Current Free-plan target:** recovery point is the most recent off-site logical dump, plus any later information recoverable from admin exports and change history.
- **Current practical recovery time:** allow several hours for a careful full restore, validation, and configuration update.
- **Future production target:** consider daily platform backups at minimum. Enable Point-in-Time Recovery only when losing changes since the last daily backup is no longer acceptable.

## Official references

- [Supabase database backups](https://supabase.com/docs/guides/platform/backups)
- [Supabase backup and restore](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore)
- [Supabase automated backup guidance](https://supabase.com/docs/guides/deployment/ci/backups)

