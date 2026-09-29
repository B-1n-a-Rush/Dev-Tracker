alter table public.project_information_reports
  alter column project_id drop not null,
  add column if not exists submission_type text not null default 'correction',
  add column if not exists project_name text,
  add column if not exists corrected_value text,
  add column if not exists tracking_code uuid not null default gen_random_uuid(),
  add column if not exists status_updated_at timestamptz not null default now();

update public.project_information_reports reports
set project_name = projects.name
from public.projects projects
where reports.project_id = projects.id
  and reports.project_name is null;

alter table public.project_information_reports
  drop constraint if exists project_information_reports_category_check,
  add constraint project_information_reports_category_check
    check (category in ('status', 'residential_units', 'location', 'project_details', 'source', 'other', 'new_project')),
  drop constraint if exists project_information_reports_status_check,
  add constraint project_information_reports_status_check
    check (status in ('pending', 'in_review', 'resolved', 'dismissed')),
  add constraint project_information_reports_submission_type_check
    check (submission_type in ('correction', 'new_project')),
  add constraint project_information_reports_submission_shape_check
    check (
      (submission_type = 'correction' and project_id is not null)
      or
      (submission_type = 'new_project' and project_id is null and char_length(btrim(project_name)) between 2 and 200)
    ),
  add constraint project_information_reports_project_name_check
    check (project_name is null or char_length(btrim(project_name)) between 2 and 200),
  add constraint project_information_reports_corrected_value_check
    check (corrected_value is null or char_length(btrim(corrected_value)) between 1 and 1000),
  add constraint project_information_reports_resolution_note_check
    check (resolution_note is null or char_length(btrim(resolution_note)) <= 2000);

create unique index if not exists project_information_reports_tracking_code_idx
  on public.project_information_reports (tracking_code);

create index if not exists project_information_reports_type_status_created_idx
  on public.project_information_reports (submission_type, status, created_at desc);

create table if not exists private.project_submission_rate_limits (
  id bigint generated always as identity primary key,
  request_fingerprint text not null,
  subject_fingerprint text not null,
  submission_type text not null check (submission_type in ('correction', 'new_project')),
  created_at timestamptz not null default now()
);

create index if not exists project_submission_rate_limits_request_created_idx
  on private.project_submission_rate_limits (request_fingerprint, created_at desc);

create index if not exists project_submission_rate_limits_subject_created_idx
  on private.project_submission_rate_limits (request_fingerprint, subject_fingerprint, created_at desc);

alter table private.project_submission_rate_limits enable row level security;
revoke all on table private.project_submission_rate_limits from public, anon, authenticated;
revoke all on sequence private.project_submission_rate_limits_id_seq from public, anon, authenticated;

drop policy if exists "public_can_submit_project_reports" on public.project_information_reports;
drop policy if exists "admins_can_read_project_reports" on public.project_information_reports;
drop policy if exists "admins_can_update_project_reports" on public.project_information_reports;

revoke all on table public.project_information_reports from public, anon, authenticated;
revoke all on sequence public.project_information_reports_id_seq from public, anon, authenticated;
grant select on table public.project_information_reports to authenticated;
grant update (status, status_updated_at, reviewed_by, reviewed_at, resolution_note)
  on public.project_information_reports to authenticated;
grant all on table public.project_information_reports to service_role;
grant all on sequence public.project_information_reports_id_seq to service_role;

create policy "admins_can_read_project_reports"
on public.project_information_reports
for select
to authenticated
using ((select private.is_tracker_admin()));

create policy "admins_can_update_project_reports"
on public.project_information_reports
for update
to authenticated
using ((select private.is_tracker_admin()))
with check ((select private.is_tracker_admin()));

create or replace function public.submit_public_project_submission(
  p_submission_type text,
  p_project_id text,
  p_project_name text,
  p_category text,
  p_corrected_value text,
  p_details text,
  p_source_url text,
  p_website text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_submission_type text := lower(btrim(coalesce(p_submission_type, '')));
  v_project_id text := nullif(btrim(coalesce(p_project_id, '')), '');
  v_project_name text := nullif(btrim(coalesce(p_project_name, '')), '');
  v_category text := lower(btrim(coalesce(p_category, '')));
  v_corrected_value text := nullif(btrim(coalesce(p_corrected_value, '')), '');
  v_details text := btrim(coalesce(p_details, ''));
  v_source_url text := nullif(btrim(coalesce(p_source_url, '')), '');
  v_headers jsonb := coalesce(nullif(current_setting('request.headers', true), '')::jsonb, '{}'::jsonb);
  v_client_address text;
  v_user_agent text;
  v_request_fingerprint text;
  v_subject_fingerprint text;
  v_dedupe_fingerprint text;
  v_tracking_code uuid;
  v_status text;
  v_created_at timestamptz;
begin
  if nullif(btrim(coalesce(p_website, '')), '') is not null then
    return jsonb_build_object(
      'submitted', true,
      'tracking_code', gen_random_uuid(),
      'status', 'pending',
      'created_at', now()
    );
  end if;

  if v_submission_type not in ('correction', 'new_project') then
    raise exception 'Choose a valid submission type.';
  end if;

  if v_submission_type = 'correction' then
    if v_project_id is null or not exists (
      select 1 from public.projects where id = v_project_id and is_published
    ) then
      raise exception 'Choose a valid published project.';
    end if;
    select name into v_project_name from public.projects where id = v_project_id;
    if v_category not in ('status', 'residential_units', 'location', 'project_details', 'source', 'other') then
      raise exception 'Choose a valid correction category.';
    end if;
    if v_corrected_value is null or char_length(v_corrected_value) > 1000 then
      raise exception 'Provide the corrected value in 1,000 characters or fewer.';
    end if;
  else
    v_project_id := null;
    v_category := 'new_project';
    if v_project_name is null or char_length(v_project_name) < 2 or char_length(v_project_name) > 200 then
      raise exception 'Provide a project name between 2 and 200 characters.';
    end if;
    if v_corrected_value is null or char_length(v_corrected_value) > 1000 then
      raise exception 'Provide the proposed project location in 1,000 characters or fewer.';
    end if;
  end if;

  if char_length(v_details) < 20 or char_length(v_details) > 2000 then
    raise exception 'Explanation must be between 20 and 2,000 characters.';
  end if;

  if v_source_url is null or v_source_url !~* '^https?://[^[:space:]]+$' then
    raise exception 'A valid supporting HTTP or HTTPS source link is required.';
  end if;

  v_client_address := split_part(coalesce(v_headers ->> 'x-forwarded-for', v_headers ->> 'cf-connecting-ip', 'unknown'), ',', 1);
  v_user_agent := coalesce(v_headers ->> 'user-agent', 'unknown');
  v_request_fingerprint := md5(v_client_address || '|' || v_user_agent || '|trackside-public-submissions-v1');
  v_subject_fingerprint := md5(coalesce(v_project_id, lower(v_project_name)) || '|' || v_submission_type);

  perform pg_advisory_xact_lock(hashtextextended(v_request_fingerprint, 0));
  delete from private.project_submission_rate_limits where created_at < now() - interval '7 days';

  if (
    select count(*) from private.project_submission_rate_limits
    where request_fingerprint = v_request_fingerprint
      and created_at >= now() - interval '1 hour'
  ) >= 3 then
    raise exception 'Too many submissions. Please wait an hour before trying again.';
  end if;

  if (
    select count(*) from private.project_submission_rate_limits
    where request_fingerprint = v_request_fingerprint
      and created_at >= now() - interval '24 hours'
  ) >= 10 then
    raise exception 'Daily submission limit reached. Please try again tomorrow.';
  end if;

  if (
    select count(*) from private.project_submission_rate_limits
    where request_fingerprint = v_request_fingerprint
      and subject_fingerprint = v_subject_fingerprint
      and created_at >= now() - interval '1 hour'
  ) >= 2 then
    raise exception 'This project was submitted recently. Please wait before trying again.';
  end if;

  insert into private.project_submission_rate_limits (
    request_fingerprint,
    subject_fingerprint,
    submission_type
  ) values (
    v_request_fingerprint,
    v_subject_fingerprint,
    v_submission_type
  );

  v_dedupe_fingerprint := md5(
    v_submission_type || '|' ||
    coalesce(v_project_id, '') || '|' ||
    lower(coalesce(v_project_name, '')) || '|' ||
    v_category || '|' ||
    lower(v_corrected_value) || '|' ||
    lower(v_details) || '|' ||
    lower(v_source_url)
  );

  insert into public.project_information_reports (
    project_id,
    submission_type,
    project_name,
    category,
    corrected_value,
    details,
    source_url,
    submitted_by,
    dedupe_fingerprint
  ) values (
    v_project_id,
    v_submission_type,
    v_project_name,
    v_category,
    v_corrected_value,
    v_details,
    v_source_url,
    auth.uid(),
    v_dedupe_fingerprint
  )
  on conflict (dedupe_fingerprint) do nothing
  returning tracking_code, status, created_at
  into v_tracking_code, v_status, v_created_at;

  if v_tracking_code is null then
    select tracking_code, status, created_at
    into v_tracking_code, v_status, v_created_at
    from public.project_information_reports
    where dedupe_fingerprint = v_dedupe_fingerprint;
  end if;

  return jsonb_build_object(
    'submitted', true,
    'tracking_code', v_tracking_code,
    'status', v_status,
    'created_at', v_created_at
  );
end;
$$;

create or replace function public.get_project_submission_status(p_tracking_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
stable
as $$
declare
  v_tracking_code uuid;
  v_result jsonb;
begin
  if coalesce(p_tracking_code, '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    return jsonb_build_object('found', false);
  end if;

  v_tracking_code := p_tracking_code::uuid;
  select jsonb_build_object(
    'found', true,
    'tracking_code', report.tracking_code,
    'submission_type', report.submission_type,
    'project_name', coalesce(project.name, report.project_name),
    'status', report.status,
    'submitted_at', report.created_at,
    'status_updated_at', report.status_updated_at,
    'reviewed_at', report.reviewed_at,
    'resolution_note', report.resolution_note
  )
  into v_result
  from public.project_information_reports report
  left join public.projects project on project.id = report.project_id
  where report.tracking_code = v_tracking_code;

  return coalesce(v_result, jsonb_build_object('found', false));
end;
$$;

create or replace function public.admin_list_project_submissions(p_status text default 'pending')
returns jsonb
language plpgsql
security invoker
set search_path = ''
stable
as $$
declare
  v_status text := lower(btrim(coalesce(p_status, 'pending')));
  v_result jsonb;
begin
  if not private.is_tracker_admin() then
    raise exception 'Administrator access is required.';
  end if;
  if v_status not in ('all', 'pending', 'in_review', 'resolved', 'dismissed') then
    raise exception 'Choose a valid submission status.';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', report.id,
    'tracking_code', report.tracking_code,
    'submission_type', report.submission_type,
    'project_id', report.project_id,
    'project_name', coalesce(project.name, report.project_name),
    'category', report.category,
    'corrected_value', report.corrected_value,
    'details', report.details,
    'source_url', report.source_url,
    'status', report.status,
    'created_at', report.created_at,
    'status_updated_at', report.status_updated_at,
    'reviewed_at', report.reviewed_at,
    'resolution_note', report.resolution_note,
    'current_project', case when project.id is null then null else jsonb_build_object(
      'name', project.name,
      'status', project.status,
      'project_type', project.project_type,
      'residential_units', project.residential_units,
      'location', project.location,
      'transit', project.transit,
      'source_url', project.source_url
    ) end
  ) order by
    case report.status when 'pending' then 1 when 'in_review' then 2 else 3 end,
    report.created_at desc), '[]'::jsonb)
  into v_result
  from public.project_information_reports report
  left join public.projects project on project.id = report.project_id
  where v_status = 'all' or report.status = v_status;

  return v_result;
end;
$$;

create or replace function public.admin_review_project_submission(
  p_report_id bigint,
  p_status text,
  p_resolution_note text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_status text := lower(btrim(coalesce(p_status, '')));
  v_note text := nullif(btrim(coalesce(p_resolution_note, '')), '');
  v_result jsonb;
begin
  if not private.is_tracker_admin() then
    raise exception 'Administrator access is required.';
  end if;
  if v_status not in ('in_review', 'resolved', 'dismissed') then
    raise exception 'Choose a valid review status.';
  end if;
  if char_length(coalesce(v_note, '')) > 2000 then
    raise exception 'Review note must be 2,000 characters or fewer.';
  end if;
  if v_status in ('resolved', 'dismissed') and v_note is null then
    raise exception 'Add a short resolution note before closing this submission.';
  end if;

  update public.project_information_reports
  set status = v_status,
      status_updated_at = now(),
      reviewed_by = auth.uid(),
      reviewed_at = case when v_status in ('resolved', 'dismissed') then now() else null end,
      resolution_note = v_note
  where id = p_report_id
    and status in ('pending', 'in_review')
  returning jsonb_build_object(
    'id', id,
    'tracking_code', tracking_code,
    'status', status,
    'status_updated_at', status_updated_at,
    'reviewed_at', reviewed_at,
    'resolution_note', resolution_note
  ) into v_result;

  if v_result is null then
    raise exception 'Submission was not found or has already been closed.';
  end if;
  return v_result;
end;
$$;

create or replace function public.submit_project_information_report(
  p_project_id text,
  p_category text,
  p_details text,
  p_source_url text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.submit_public_project_submission(
    'correction',
    p_project_id,
    null,
    p_category,
    p_details,
    p_details,
    p_source_url,
    null
  );
  return true;
end;
$$;

revoke all on function public.submit_public_project_submission(text, text, text, text, text, text, text, text) from public, anon, authenticated, service_role;
revoke all on function public.get_project_submission_status(text) from public, anon, authenticated, service_role;
revoke all on function public.admin_list_project_submissions(text) from public, anon, authenticated, service_role;
revoke all on function public.admin_review_project_submission(bigint, text, text) from public, anon, authenticated, service_role;
revoke all on function public.submit_project_information_report(text, text, text, text) from public, anon, authenticated, service_role;

grant execute on function public.submit_public_project_submission(text, text, text, text, text, text, text, text) to anon, authenticated;
grant execute on function public.get_project_submission_status(text) to anon, authenticated;
grant execute on function public.admin_list_project_submissions(text) to authenticated;
grant execute on function public.admin_review_project_submission(bigint, text, text) to authenticated;
grant execute on function public.submit_project_information_report(text, text, text, text) to anon, authenticated;

comment on table public.project_information_reports is
  'Public corrections and new-project suggestions awaiting administrator review; never applied automatically.';
comment on function public.submit_public_project_submission(text, text, text, text, text, text, text, text) is
  'Validates and rate-limits a public correction or new-project suggestion and returns a private tracking code.';
comment on function public.get_project_submission_status(text) is
  'Returns public-safe status information for a submission when its private tracking code is supplied.';
comment on function public.admin_list_project_submissions(text) is
  'Lists public submissions for approved tracker administrators.';
comment on function public.admin_review_project_submission(bigint, text, text) is
  'Moves a public submission through the administrator review workflow without editing public project data.';
