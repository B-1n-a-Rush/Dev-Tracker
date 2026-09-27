create table if not exists public.project_information_reports (
  id bigint generated always as identity primary key,
  project_id text not null references public.projects(id) on delete cascade,
  category text not null check (category in ('status', 'residential_units', 'location', 'project_details', 'source', 'other')),
  details text not null check (char_length(btrim(details)) between 10 and 2000),
  source_url text check (source_url is null or source_url ~* '^https?://'),
  status text not null default 'pending' check (status in ('pending', 'resolved', 'dismissed')),
  submitted_by uuid references auth.users(id) on delete set null,
  dedupe_fingerprint text not null unique,
  created_at timestamptz not null default now(),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  resolution_note text
);

create index if not exists project_information_reports_status_created_idx
  on public.project_information_reports (status, created_at desc);

create index if not exists project_information_reports_project_created_idx
  on public.project_information_reports (project_id, created_at desc);

alter table public.project_information_reports enable row level security;

revoke all on table public.project_information_reports from public, anon, authenticated;
revoke all on sequence public.project_information_reports_id_seq from public, anon, authenticated;

grant insert (project_id, category, details, source_url, submitted_by, dedupe_fingerprint)
  on public.project_information_reports to anon, authenticated;
grant usage, select on sequence public.project_information_reports_id_seq to anon, authenticated;
grant select, update on public.project_information_reports to authenticated;
grant all on public.project_information_reports to service_role;
grant all on sequence public.project_information_reports_id_seq to service_role;

drop policy if exists "public_can_submit_project_reports" on public.project_information_reports;
create policy "public_can_submit_project_reports"
on public.project_information_reports
for insert
to anon, authenticated
with check (
  status = 'pending'
  and reviewed_by is null
  and reviewed_at is null
  and resolution_note is null
  and submitted_by is not distinct from (select auth.uid())
  and dedupe_fingerprint = md5(
    project_id || '|' ||
    lower(category) || '|' ||
    lower(btrim(details)) || '|' ||
    coalesce(lower(btrim(source_url)), '')
  )
  and exists (
    select 1
    from public.projects
    where projects.id = project_information_reports.project_id
      and projects.is_published
  )
);

drop policy if exists "admins_can_read_project_reports" on public.project_information_reports;
create policy "admins_can_read_project_reports"
on public.project_information_reports
for select
to authenticated
using ((select private.is_tracker_admin()));

drop policy if exists "admins_can_update_project_reports" on public.project_information_reports;
create policy "admins_can_update_project_reports"
on public.project_information_reports
for update
to authenticated
using ((select private.is_tracker_admin()))
with check ((select private.is_tracker_admin()));

create or replace function public.submit_project_information_report(
  p_project_id text,
  p_category text,
  p_details text,
  p_source_url text default null
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_project_id text := btrim(coalesce(p_project_id, ''));
  v_category text := lower(btrim(coalesce(p_category, '')));
  v_details text := btrim(coalesce(p_details, ''));
  v_source_url text := nullif(btrim(coalesce(p_source_url, '')), '');
  v_fingerprint text;
begin
  if v_project_id = '' then
    raise exception 'A project is required.';
  end if;

  if v_category not in ('status', 'residential_units', 'location', 'project_details', 'source', 'other') then
    raise exception 'Choose a valid report category.';
  end if;

  if char_length(v_details) < 10 or char_length(v_details) > 2000 then
    raise exception 'Report details must be between 10 and 2000 characters.';
  end if;

  if v_source_url is not null and v_source_url !~* '^https?://' then
    raise exception 'Supporting source must be a valid HTTP or HTTPS URL.';
  end if;

  v_fingerprint := md5(
    v_project_id || '|' ||
    v_category || '|' ||
    lower(v_details) || '|' ||
    coalesce(lower(v_source_url), '')
  );

  insert into public.project_information_reports (
    project_id,
    category,
    details,
    source_url,
    submitted_by,
    dedupe_fingerprint
  )
  values (
    v_project_id,
    v_category,
    v_details,
    v_source_url,
    (select auth.uid()),
    v_fingerprint
  )
  on conflict (dedupe_fingerprint) do nothing;

  return true;
end;
$$;

revoke all on function public.submit_project_information_report(text, text, text, text) from public;
grant execute on function public.submit_project_information_report(text, text, text, text) to anon, authenticated, service_role;

comment on table public.project_information_reports is
  'Publicly submitted project corrections awaiting administrator review; never applied automatically.';
comment on function public.submit_project_information_report(text, text, text, text) is
  'Accepts a validated public project correction report without modifying the project record.';
