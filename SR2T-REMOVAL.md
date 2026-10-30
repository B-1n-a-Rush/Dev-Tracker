# Remove an SR2T designation without deleting the stop

Implemented October 29, 2026.

As a tracker administrator, select a site and choose Remove SR2T site. The inline confirmation identifies the site and linked stop numbers. Confirm Remove site — keep local stops, or cancel with Keep site. Removal affects the whole SR2T site and its designation; it never edits the imported stop/route network. Sites sharing a stop retain their own independent records.

The site is unpublished, gains a removed_at timestamp, and leaves the active list, layer and statistics. Admins can open Removed sites and Restore as draft. Restore retains all site fields, stop IDs, improvements, plan references, notes and history. It does not automatically republish the site. Existing signed file links may remain usable until their five-minute expiry; removal stops new public authorization through the unpublished site. Stored files are retained.

Removal/restoration use a dedicated SECURITY INVOKER RPC with the existing active-session tracker-admin check and row-level security, optimistic version checking, row lock, idempotent repeated actions, and existing version/history triggers. No delete permission or local_bus_network_versions mutation is introduced. Removed records cannot be published until restored, and normalization/import cannot reactivate them. Anonymous/default inventory reads exclude removed records; the removed inventory is admin-only.

Verification: 28 Node checks (22 existing core/upload/editor checks and 6 new removal/API/import/statistics checks); live transactional remove/restore tests for publication, preserved content/notes/history, stale requests, idempotency, anonymous/nonadmin denial and unchanged full network-data hashes; all synthetic data rolled back. Browser fixtures verified cancellation, removal, active/removed lists, restored draft and role loss. Security advisor reported no findings for these changes; unrelated pre-existing findings remain. Existing auth/data code outside the SR2T endpoints and unrelated HTML compared unchanged.

Applied migration 20261030014820_sr2t_reversible_removal.sql. Local frontend installed with backups; GitHub publication is separate.
