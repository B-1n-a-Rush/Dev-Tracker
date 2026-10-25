drop policy if exists public_can_read_approved_project_news
  on public.project_news_articles;
drop policy if exists admins_can_read_all_project_news
  on public.project_news_articles;

create policy anonymous_can_read_approved_project_news
  on public.project_news_articles
  for select
  to anon
  using (review_status = 'approved');

create policy authenticated_project_news_access
  on public.project_news_articles
  for select
  to authenticated
  using (
    review_status = 'approved'
    or (select private.is_tracker_admin())
  );

create index project_news_articles_reviewed_by_idx
  on public.project_news_articles (reviewed_by)
  where reviewed_by is not null;

drop function if exists public.get_project_news_status(text);

create table public.project_news_monitoring_status (
  project_id text primary key references public.projects(id) on delete cascade,
  last_checked_at timestamptz not null,
  updated_at timestamptz not null default now()
);

insert into public.project_news_monitoring_status (project_id, last_checked_at, updated_at)
select state.project_id, state.last_checked_at, coalesce(state.updated_at, now())
from private.project_monitoring_state state
join public.projects project on project.id = state.project_id
where state.last_checked_at is not null
  and project.is_published = true
on conflict (project_id) do update
set last_checked_at = excluded.last_checked_at,
    updated_at = excluded.updated_at;

alter table public.project_news_monitoring_status enable row level security;

revoke all on table public.project_news_monitoring_status
  from public, anon, authenticated;
grant select on table public.project_news_monitoring_status
  to anon, authenticated;
grant select, insert, update, delete on table public.project_news_monitoring_status
  to service_role;

create policy public_can_read_project_news_monitoring_status
  on public.project_news_monitoring_status
  for select
  to anon, authenticated
  using (true);

notify pgrst, 'reload schema';
