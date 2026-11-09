# Infrastructure source review

The pilot covers the Atlanta DOT capital delivery layer. The map uses a bundled reviewed snapshot for Atlanta. Other infrastructure sources retain their existing refresh behavior. Automated checks read the official feed and write a local report outside the map assets.

## Review a check

1. Open the local tracker at `http://127.0.0.1:4208/`, sign in, and select **Infrastructure Review** in the Admin control center.
2. The tab loads the latest scheduled report automatically. Use the summary cards, search, and finding filter to narrow the list. **Open a report file** can also load `work/infrastructure-refresh/latest.json` from the tracker folder, including when the tracker is open as a local file or on GitHub Pages.
3. Open each finding to compare published phase, start and finish dates, project details and geometry changes. A missing project, or a project group with fewer source segments, remains on the map and requires separate verification.
4. To prepare a local update, select eligible changes and download the review selections.

Run `node scripts/check-infrastructure-source.cjs` from the tracker folder for a manual check. Run `node scripts/check-infrastructure-source.cjs --apply-reviewed <review-file>` only after reviewing the selected changes. This command replaces the local Atlanta snapshot. Reload Trackside to see the result. A review must match the current report and map snapshot. After applying it, run a new check before reviewing more changes.

Start the local tracker with `node scripts/serve-local-tracker.cjs` from this folder. The loopback server reads the latest report on demand and returns only the review summary. The report stays outside the published app assets.

The check requires network access to the official Atlanta DOT ArcGIS service. It validates the complete ID list against downloaded batches and repeats the ID and edit-date checks before accepting a capture. Empty, partial or changing responses leave the last successful report and reviewed snapshot intact. Repeated unchanged checks do not generate new findings. Publishing any approved snapshot to GitHub Pages is separate.

Source records sharing a project number are reviewed together, consistent with Trackside's Atlanta map grouping. ArcGIS object IDs and edit metadata alone do not count as material changes. An alignment-change finding identifies that geometry changed. Use the official GIS layer and reviewed map to inspect the difference. Published dates remain estimates where the agency describes them that way.
