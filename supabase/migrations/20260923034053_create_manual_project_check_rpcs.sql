grant usage on schema private to service_role;

create or replace function public.begin_manual_project_check(
  p_project_id text
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  started boolean := false;
begin
  if not exists (
    select 1
    from public.projects
    where id = p_project_id
  ) then
    raise exception 'Project not found.';
  end if;

  insert into private.project_monitoring_state as current_state (
    project_id,
    last_result,
    last_error,
    updated_at
  )
  values (
    p_project_id,
    'checking',
    null,
    now()
  )
  on conflict (project_id) do update
  set last_result = 'checking',
      last_error = null,
      updated_at = now()
  where not (
    current_state.last_result = 'checking'
    and current_state.updated_at >= now() - interval '10 minutes'
  )
  returning true into started;

  return coalesce(started, false);
end;
$$;

comment on function public.begin_manual_project_check(text) is
  'Service-only lock that prevents concurrent manual source checks for one project.';

revoke all on function public.begin_manual_project_check(text) from public, anon, authenticated;
grant execute on function public.begin_manual_project_check(text) to service_role;

create or replace function public.record_project_monitor_result(
  p_project_id text,
  p_last_result text,
  p_source_url text default null,
  p_error text default null
)
returns void
language sql
security invoker
set search_path = ''
as $$
  insert into private.project_monitoring_state as current_state (
    project_id,
    last_checked_at,
    last_result,
    last_source_url,
    last_error,
    updated_at
  )
  values (
    p_project_id,
    now(),
    nullif(trim(p_last_result), ''),
    nullif(trim(p_source_url), ''),
    nullif(trim(p_error), ''),
    now()
  )
  on conflict (project_id) do update
  set last_checked_at = excluded.last_checked_at,
      last_result = excluded.last_result,
      last_source_url = coalesce(excluded.last_source_url, current_state.last_source_url),
      last_error = excluded.last_error,
      updated_at = excluded.updated_at;
$$;

comment on function public.record_project_monitor_result(text, text, text, text) is
  'Service-only recorder for completed manual project source checks.';

revoke all on function public.record_project_monitor_result(text, text, text, text) from public, anon, authenticated;
grant execute on function public.record_project_monitor_result(text, text, text, text) to service_role;

notify pgrst, 'reload schema';
