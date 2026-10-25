alter table public.project_change_history
  add column if not exists changed_by_email text;

update public.project_change_history as history
set changed_by_email = lower(auth_user.email)
from auth.users as auth_user
where history.changed_by = auth_user.id
  and history.changed_by_email is null;

create or replace function private.capture_project_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  audit_fields text[] := '{}'::text[];
  audit_reason text := nullif(current_setting('trackside.change_reason', true), '');
  audit_actor uuid := (select auth.uid());
  audit_actor_email text;
begin
  if audit_actor is not null then
    select lower(auth_user.email)
    into audit_actor_email
    from auth.users as auth_user
    where auth_user.id = audit_actor;
  end if;

  if tg_op = 'UPDATE' then
    select coalesce(array_agg(field_name order by field_name), '{}'::text[])
    into audit_fields
    from (
      select key as field_name
      from jsonb_object_keys(to_jsonb(new)) as key
      where key <> 'updated_at'
        and to_jsonb(new) -> key is distinct from to_jsonb(old) -> key
    ) changed;
  else
    audit_fields := array['project'];
  end if;

  insert into public.project_change_history (
    project_id,
    action,
    changed_by,
    changed_by_email,
    changed_fields,
    before_data,
    after_data,
    change_reason
  )
  values (
    case when tg_op = 'DELETE' then old.id else new.id end,
    case
      when tg_op = 'INSERT' then 'created'
      when tg_op = 'UPDATE' then 'updated'
      else 'deleted'
    end,
    audit_actor,
    audit_actor_email,
    audit_fields,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end,
    audit_reason
  );

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

comment on column public.project_change_history.changed_by_email is
  'Administrator email captured at change time for the admin-only project history view.';

notify pgrst, 'reload schema';
