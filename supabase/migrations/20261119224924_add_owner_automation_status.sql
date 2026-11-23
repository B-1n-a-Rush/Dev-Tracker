create table private.tracker_automation_runs (
  automation_id text not null check (automation_id in (
    'daily-project-news-review',
    'weekly-transit-area-project-discovery',
    'biweekly-atlanta-infrastructure-source-review'
  )),
  run_at timestamptz not null,
  finished_at timestamptz not null check (finished_at >= run_at),
  outcome text not null check (outcome in ('succeeded', 'partial', 'failed')),
  new_items integer check (new_items >= 0),
  note text check (length(note) <= 500),
  primary key (automation_id, run_at)
);

alter table private.tracker_automation_runs enable row level security;
revoke all on private.tracker_automation_runs from public, anon, authenticated;
grant select, insert, update on private.tracker_automation_runs to service_role;

create or replace function private.tracker_automation_status()
returns table (
  automation_id text, name text, overdue_days integer, last_success_at timestamptz,
  last_finished_at timestamptz, outcome text, pending bigint, pending_news bigint,
  new_items integer, note text
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if not private.is_tracker_owner() then
    raise exception 'A live owner session is required.' using errcode = '42501';
  end if;
  return query
  with jobs (position, id, label, cutoff_days) as (
    values
      (1, 'daily-project-news-review', 'Daily project news review', 2),
      (2, 'weekly-transit-area-project-discovery', 'Weekly project discovery', 9),
      (3, 'biweekly-atlanta-infrastructure-source-review', 'Biweekly Atlanta infrastructure review', 16)
  )
  select job.id, job.label, job.cutoff_days, success.finished_at, latest.finished_at, latest.outcome,
    case job.position
      when 1 then (select count(*) from public.project_change_proposals p where p.status = 'pending')
      when 2 then (select count(*) from public.project_information_reports p
        where p.submission_type = 'new_project' and p.status in ('pending', 'in_review')
          and p.details like 'Weekly automated discovery — administrator review required%')
    end,
    case when job.position = 1 then
      (select count(*) from public.project_news_articles n where n.review_status = 'pending')
    end,
    latest.new_items, latest.note
  from jobs job
  left join lateral (
    select r.finished_at, r.outcome, r.new_items, r.note
    from private.tracker_automation_runs r
    where r.automation_id = job.id
    order by r.run_at desc limit 1
  ) latest on true
  left join lateral (
    select r.finished_at
    from private.tracker_automation_runs r
    where r.automation_id = job.id and r.outcome = 'succeeded'
    order by r.run_at desc limit 1
  ) success on true
  order by job.position;
end;
$function$;

revoke all on function private.tracker_automation_status() from public, anon, authenticated;
grant execute on function private.tracker_automation_status() to authenticated;

create or replace function public.tracker_automation_status()
returns table (
  automation_id text, name text, overdue_days integer, last_success_at timestamptz,
  last_finished_at timestamptz, outcome text, pending bigint, pending_news bigint,
  new_items integer, note text
)
language sql
stable
security invoker
set search_path = ''
as $function$
  select * from private.tracker_automation_status();
$function$;

revoke all on function public.tracker_automation_status() from public, anon, authenticated;
grant execute on function public.tracker_automation_status() to authenticated;
notify pgrst, 'reload schema';
