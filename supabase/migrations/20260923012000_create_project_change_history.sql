create table public.project_change_history (
  id bigint generated always as identity primary key,
  project_id text not null,
  action text not null check (action in ('created', 'updated', 'deleted')),
  changed_by uuid references auth.users(id) on delete set null,
  changed_at timestamptz not null default now(),
  changed_fields text[] not null default '{}'::text[],
  before_data jsonb,
  after_data jsonb,
  constraint project_change_history_before_object
    check (before_data is null or jsonb_typeof(before_data) = 'object'),
  constraint project_change_history_after_object
    check (after_data is null or jsonb_typeof(after_data) = 'object')
);

comment on table public.project_change_history is
  'Immutable administrative audit history for project creation, edits, and deletion.';

create index project_change_history_changed_at_idx
  on public.project_change_history(changed_at desc);

create index project_change_history_project_changed_at_idx
  on public.project_change_history(project_id, changed_at desc);

alter table public.project_change_history enable row level security;

revoke all on table public.project_change_history from anon, authenticated;
grant select on table public.project_change_history to authenticated;

create policy "admins_can_read_project_change_history"
on public.project_change_history
for select
to authenticated
using ((select private.is_tracker_admin()));

create or replace function private.capture_project_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  audit_fields text[] := '{}'::text[];
begin
  if tg_op = 'UPDATE' then
    select coalesce(array_agg(field_name order by field_name), '{}'::text[])
    into audit_fields
    from (
      select key as field_name
      from jsonb_object_keys(to_jsonb(new)) as key
      where key <> 'updated_at'
        and to_jsonb(new) -> key is distinct from to_jsonb(old) -> key
    ) changed;
  elsif tg_op = 'INSERT' then
    audit_fields := array['project'];
  else
    audit_fields := array['project'];
  end if;

  insert into public.project_change_history (
    project_id,
    action,
    changed_by,
    changed_fields,
    before_data,
    after_data
  )
  values (
    case when tg_op = 'DELETE' then old.id else new.id end,
    case
      when tg_op = 'INSERT' then 'created'
      when tg_op = 'UPDATE' then 'updated'
      else 'deleted'
    end,
    (select auth.uid()),
    audit_fields,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end
  );

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke all on function private.capture_project_change()
  from public, anon, authenticated, service_role;

create trigger capture_project_change_history
after insert or update or delete on public.projects
for each row
execute function private.capture_project_change();
