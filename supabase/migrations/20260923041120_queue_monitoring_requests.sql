create table public.project_monitoring_requests (
  project_id text primary key references public.projects(id) on delete cascade,
  requested_by uuid not null references auth.users(id) on delete cascade,
  requested_at timestamptz not null default now(),
  status text not null default 'queued'
    check (status in ('queued', 'processing'))
);

create index project_monitoring_requests_requested_at_idx
  on public.project_monitoring_requests (requested_at);

alter table public.project_monitoring_requests enable row level security;

revoke all on table public.project_monitoring_requests from public, anon, authenticated;
grant select, insert, update on table public.project_monitoring_requests to authenticated;
grant select, insert, update, delete on table public.project_monitoring_requests to service_role;

create policy admins_can_read_project_monitoring_requests
  on public.project_monitoring_requests
  for select
  to authenticated
  using ((select private.is_tracker_admin()));

create policy admins_can_insert_project_monitoring_requests
  on public.project_monitoring_requests
  for insert
  to authenticated
  with check (
    (select auth.uid()) is not null
    and requested_by = (select auth.uid())
    and status = 'queued'
    and (select private.is_tracker_admin())
  );

create policy admins_can_update_project_monitoring_requests
  on public.project_monitoring_requests
  for update
  to authenticated
  using ((select private.is_tracker_admin()))
  with check (
    requested_by = (select auth.uid())
    and status = 'queued'
    and (select private.is_tracker_admin())
  );

create or replace function public.get_project_monitoring_dashboard()
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  dashboard jsonb;
begin
  if (select auth.uid()) is null or not private.is_tracker_admin() then
    raise exception 'Approved tracker administrator access is required.';
  end if;

  with proposal_counts as (
    select
      project_id,
      count(*) filter (where status = 'pending')::integer as pending_count,
      count(*) filter (where status = 'approved')::integer as approved_count,
      count(*) filter (where status = 'rejected')::integer as rejected_count,
      max(detected_at) as last_proposal_at
    from public.project_change_proposals
    group by project_id
  ),
  project_rows as (
    select
      p.id as project_id,
      p.name as project_name,
      p.status as project_status,
      ms.last_checked_at,
      ms.last_result,
      coalesce(ms.last_source_url, p.source_url) as last_source_url,
      ms.last_error,
      request.requested_at as check_requested_at,
      request.status as check_request_status,
      coalesce(pc.pending_count, 0) as pending_count,
      coalesce(pc.approved_count, 0) as approved_count,
      coalesce(pc.rejected_count, 0) as rejected_count,
      pc.last_proposal_at,
      case
        when request.project_id is not null then 'requested'
        when ms.last_error is not null then 'error'
        when coalesce(pc.pending_count, 0) > 0 then 'needs_review'
        when ms.last_checked_at is null then 'never_checked'
        when ms.last_checked_at < now() - interval '14 days' then 'stale'
        else 'checked'
      end as monitoring_status,
      case
        when request.project_id is not null then 0
        when ms.last_error is not null then 1
        when coalesce(pc.pending_count, 0) > 0 then 2
        when ms.last_checked_at is null then 3
        when ms.last_checked_at < now() - interval '14 days' then 4
        else 5
      end as status_priority
    from public.projects p
    left join private.project_monitoring_state ms on ms.project_id = p.id
    left join public.project_monitoring_requests request on request.project_id = p.id
    left join proposal_counts pc on pc.project_id = p.id
    where p.is_published
  ),
  proposal_totals as (
    select
      count(*) filter (where status = 'pending')::integer as pending,
      count(*) filter (where status = 'approved')::integer as approved,
      count(*) filter (where status = 'rejected')::integer as rejected
    from public.project_change_proposals
  )
  select jsonb_build_object(
    'generated_at', now(),
    'summary', jsonb_build_object(
      'total_projects', (select count(*)::integer from project_rows),
      'checked_projects', (select count(*)::integer from project_rows where last_checked_at is not null),
      'checked_last_24h', (select count(*)::integer from project_rows where last_checked_at >= now() - interval '24 hours'),
      'queued_requests', (select count(*)::integer from project_rows where check_requested_at is not null),
      'never_checked', (select count(*)::integer from project_rows where last_checked_at is null),
      'stale', (select count(*)::integer from project_rows where monitoring_status = 'stale'),
      'errors', (select count(*)::integer from project_rows where monitoring_status = 'error'),
      'pending_suggestions', (select pending from proposal_totals),
      'approved_suggestions', (select approved from proposal_totals),
      'rejected_suggestions', (select rejected from proposal_totals)
    ),
    'projects', coalesce(
      (
        select jsonb_agg(
          to_jsonb(project_rows) - 'status_priority'
          order by status_priority, check_requested_at, project_name
        )
        from project_rows
      ),
      '[]'::jsonb
    )
  )
  into dashboard;

  return dashboard;
end;
$$;

comment on table public.project_monitoring_requests is
  'Admin-created priority queue consumed by the daily Codex project news review.';

notify pgrst, 'reload schema';
