# Infrastructure source review

The pilot covers the Atlanta DOT capital delivery layer. The map uses a bundled reviewed snapshot for Atlanta. Other infrastructure sources retain their existing refresh behavior. Automated checks read the official feed and write a local report outside the map assets.

## Review a check

1. Open the local tracker at `http://127.0.0.1:4208/`, sign in, and select **Infrastructure Review** in the Admin control center.
2. The tab loads the latest scheduled report automatically. Use the summary cards, search, and finding filter to narrow the list. **Open a report file** can also load `work/infrastructure-refresh/latest.json` from the tracker folder, including when the tracker is open as a local file or on GitHub Pages.
3. Open each finding to compare published phase, start and finish dates, project details and geometry changes. A missing project, or a project group with fewer source segments, remains on the map and requires separate verification.
4. Select up to 50 eligible projects from the latest report and choose **Preview selected changes**. Inspect the dates, fields, and before-and-after geometry. Choose **Apply to local map** to update the local snapshot, then reload the tracker.

Run `node scripts/check-infrastructure-source.cjs` from the tracker folder for a manual check. The scheduled check uses the same command. The tab shows the last attempt and last successful check separately. If a check fails, the last successful report stays available for inspection. The in-app apply step becomes available again after a successful check.

For a file-based workflow, download review selections and run `node scripts/check-infrastructure-source.cjs --apply-reviewed <review-file>` after reviewing them. Each review must match the current report and map snapshot. The remaining findings are recomputed against the updated snapshot when you load the latest report. If the program is forcibly stopped while it holds `work/infrastructure-refresh/review.lock`, check that the PID in the file has exited before removing the abandoned lock.

Start the local tracker with `node scripts/serve-local-tracker.cjs` from this folder. The loopback server reads the latest report on demand and checks the existing Supabase admin membership before preview or apply. Reports stay outside the published app assets.

The check requires network access to the official Atlanta DOT ArcGIS service. It validates the complete ID list against downloaded batches and repeats the ID and edit-date checks before accepting a capture. Empty, partial or changing responses leave the last successful report and reviewed snapshot intact. Repeated unchanged checks do not generate new findings. Publishing any approved snapshot to GitHub Pages is separate.

Source records sharing a project number are reviewed together, consistent with Trackside's Atlanta map grouping. ArcGIS object IDs and edit metadata alone do not count as material changes. An alignment-change finding identifies that geometry changed. Use the official GIS layer and reviewed map to inspect the difference. Published dates remain estimates where the agency describes them that way.
