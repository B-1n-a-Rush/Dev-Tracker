create function private.infrastructure_date_range(p_value text)
returns daterange
language plpgsql immutable strict set search_path = ''
as $$
declare
  v_year integer;
  v_month integer;
  v_day integer;
  v_start date;
begin
  if p_value !~ '^[0-9]{4}(-[0-9]{2}(-[0-9]{2})?)?$' then
    return null;
  end if;
  v_year := split_part(p_value, '-', 1)::integer;
  if v_year not between 1900 and 2200 then
    return null;
  end if;
  v_month := coalesce(nullif(split_part(p_value, '-', 2), '')::integer, 1);
  v_day := coalesce(nullif(split_part(p_value, '-', 3), '')::integer, 1);
  v_start := make_date(v_year, v_month, v_day);
  return daterange(v_start, case length(p_value)
    when 4 then make_date(v_year + 1, 1, 1)
    when 7 then (v_start + interval '1 month')::date
    else v_start + 1
  end, '[)');
exception when datetime_field_overflow then
  return null;
end;
$$;

revoke all on function private.infrastructure_date_range(text) from public, anon;
grant execute on function private.infrastructure_date_range(text) to authenticated, service_role;

create table public.infrastructure_construction_dates (
  infrastructure_id text primary key check (char_length(infrastructure_id) between 3 and 250),
  project_name text not null check (char_length(btrim(project_name)) between 1 and 500),
  construction_start text,
  start_certainty text,
  construction_finish text,
  finish_certainty text,
  source_url text not null check (char_length(source_url) <= 2000 and source_url ~* '^https?://[^[:space:]]+$'),
  agency_start text,
  agency_finish text,
  updated_at timestamptz not null default clock_timestamp(),
  check (construction_start is not null or construction_finish is not null),
  check ((construction_start is null and start_certainty is null) or
    (private.infrastructure_date_range(construction_start) is not null and start_certainty is not null and start_certainty in ('estimated', 'confirmed'))),
  check ((construction_finish is null and finish_certainty is null) or
    (private.infrastructure_date_range(construction_finish) is not null and finish_certainty is not null and finish_certainty in ('estimated', 'confirmed'))),
  check (construction_start is null or construction_finish is null or
    lower(private.infrastructure_date_range(construction_start)) < upper(private.infrastructure_date_range(construction_finish))),
  check (char_length(agency_start) <= 500 and char_length(agency_finish) <= 500)
);

alter table public.infrastructure_construction_dates enable row level security;
revoke all on public.infrastructure_construction_dates from public, anon, authenticated;
grant select on public.infrastructure_construction_dates to anon, authenticated;
grant insert, update, delete on public.infrastructure_construction_dates to authenticated;
grant all on public.infrastructure_construction_dates to service_role;

create policy read_infrastructure_construction_dates on public.infrastructure_construction_dates
  for select to anon, authenticated using (true);
create policy admins_insert_infrastructure_construction_dates on public.infrastructure_construction_dates
  for insert to authenticated with check ((select private.is_tracker_admin()));
create policy admins_update_infrastructure_construction_dates on public.infrastructure_construction_dates
  for update to authenticated using ((select private.is_tracker_admin())) with check ((select private.is_tracker_admin()));
create policy admins_delete_infrastructure_construction_dates on public.infrastructure_construction_dates
  for delete to authenticated using ((select private.is_tracker_admin()));

create function private.stamp_infrastructure_construction_dates()
returns trigger language plpgsql set search_path = ''
as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end;
$$;

revoke all on function private.stamp_infrastructure_construction_dates() from public, anon, authenticated;
create trigger stamp_infrastructure_construction_dates before insert or update
  on public.infrastructure_construction_dates for each row
  execute function private.stamp_infrastructure_construction_dates();

comment on table public.infrastructure_construction_dates is
  'Sourced construction dates published by Tracker administrators, separate from agency project feeds.';
