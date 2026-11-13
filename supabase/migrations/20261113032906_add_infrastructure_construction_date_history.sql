create table public.infrastructure_construction_date_history (
  id bigint generated always as identity primary key,
  infrastructure_id text not null,
  recorded_at timestamptz not null default clock_timestamp(),
  action text not null check (action in ('baseline', 'added', 'changed', 'removed')),
  before_record jsonb,
  after_record jsonb,
  check (before_record is not null or after_record is not null)
);

create index infrastructure_construction_date_history_project_idx
  on public.infrastructure_construction_date_history (infrastructure_id, recorded_at desc, id desc);

alter table public.infrastructure_construction_date_history enable row level security;
revoke all on public.infrastructure_construction_date_history from public, anon, authenticated;
revoke all on sequence public.infrastructure_construction_date_history_id_seq from public, anon, authenticated;
grant select on public.infrastructure_construction_date_history to authenticated, service_role;
create policy admins_read_infrastructure_construction_date_history
  on public.infrastructure_construction_date_history for select to authenticated
  using ((select private.is_tracker_admin()));

create function private.audit_infrastructure_construction_date()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_id text;
  v_before jsonb;
  v_after jsonb;
  v_action text;
begin
  if tg_table_schema <> 'public' or tg_table_name <> 'infrastructure_construction_dates' then
    raise exception 'Invalid construction date audit context';
  end if;
  if (select auth.uid()) is not null and not (select private.is_tracker_admin()) then
    raise insufficient_privilege using message = 'Tracker administrator access required';
  end if;
  if tg_op <> 'INSERT' then
    v_before := to_jsonb(old) - 'updated_at';
    v_id := old.infrastructure_id;
  end if;
  if tg_op <> 'DELETE' then
    v_after := to_jsonb(new) - 'updated_at';
    v_id := new.infrastructure_id;
  end if;
  if v_before is not distinct from v_after then
    return null;
  end if;
  v_action := case tg_op when 'INSERT' then 'added' when 'UPDATE' then 'changed' else 'removed' end;
  insert into public.infrastructure_construction_date_history
    (infrastructure_id, action, before_record, after_record)
  values (v_id, v_action, v_before, v_after);
  return null;
end;
$$;

revoke all on function private.audit_infrastructure_construction_date() from public, anon, authenticated;
create trigger audit_infrastructure_construction_date
  after insert or update or delete on public.infrastructure_construction_dates
  for each row execute function private.audit_infrastructure_construction_date();

insert into public.infrastructure_construction_date_history
  (infrastructure_id, recorded_at, action, after_record)
select infrastructure_id, updated_at, 'baseline', to_jsonb(dates) - 'updated_at'
from public.infrastructure_construction_dates dates;
