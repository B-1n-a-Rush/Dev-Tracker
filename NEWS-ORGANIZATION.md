# Approved coverage in Explore and Following

The standalone News navigation/feed is retired. Approved articles remain attached to their project and are available in Following for saved projects and spatial watches. No database schema or review status changes are required.

## Use

- Explore → Filters → Recent news: choose the past 30 or 90 days. This filters both development markers and project results by **article publication date**, with the other project filters. Undated and future-dated articles do not qualify. Clear the chip or clear all filters to restore the full set. Shared map links retain this filter.
- Open a project → Project news: three articles initially; expand **View all N articles** for its full approved history. Each article separates the headline, publisher and publication date. Missing dates are labeled explicitly.
- Following → Updates: new approved article IDs appear as **Approved coverage**, separate from actual changes to published project fields. The collapsed **Approved coverage** section groups all matched articles by project, with a direct project action and nested article history. Only five project groups show initially; Show all covered projects reveals the rest.
- Existing watches initially show coverage as a new source group requiring a first baseline. Review available updates / start missing baselines establishes that starting point. Existing historical articles are not all declared new during migration. Opening or checking Following does not mark updates reviewed.
- Check live sources refreshes approved coverage. Otherwise a shared, in-memory five-minute cache avoids duplicate requests. No extra coverage request is made at initial page load unless a shared link uses the news filter.

## Data boundaries and limits

Reads are paginated in 100-row pages, ordered by article ID, with an explicit 10,000-row safety limit. A later-page failure rejects the entire fetch; a partial result never becomes a baseline. Public presentation reads only article IDs, project IDs, titles, direct URLs, publishers, publication dates and approval timestamps. Evidence excerpts, internal review notes and reviewer identities are excluded. Spatial watches join articles to currently published project locations; an unlocated project can still be followed directly.

Approval time differs from publication time: an older article newly made available can appear in Following, but cannot qualify for the 30-day Explore filter. Coverage does not automatically change project facts. Existing browser-local storage limits and watch review behavior remain in force. These changes do not automatically approve articles, edit projects or run monitoring automations.

## Verification

New tests cover date boundaries, missing/future dates, unsafe URLs, project-specific deduplication, project/spatial watch matching, baseline migration, newly available older articles, failed-source retention, bookmark review preservation, safe read-only projections and pagination failure. Existing digest, Following, project-profile, map-view and worker tests are rerun. Browser checks cover real approved coverage, synchronized map/list filtering, cached 30/90-day switching, grouped Following coverage, expanding/collapsing a five-article profile and a 390px mobile layout. React is type-checked and rebuilt using the existing pinned dependencies.
