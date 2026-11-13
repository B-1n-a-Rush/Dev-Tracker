alter table public.project_information_reports
  add column suggested_project jsonb,
  add column review_draft jsonb,
  add column published_project_id text references public.projects(id) on delete set null,
  add constraint project_information_reports_suggested_project_check check (
    suggested_project is null or (submission_type = 'new_project' and jsonb_typeof(suggested_project) = 'object' and octet_length(suggested_project::text) <= 12000)
  ),
  add constraint project_information_reports_review_draft_check check (
    review_draft is null or (submission_type = 'new_project' and jsonb_typeof(review_draft) = 'object' and octet_length(review_draft::text) <= 500000)
  );

create index project_information_reports_published_project_idx
  on public.project_information_reports (published_project_id)
  where published_project_id is not null;

grant update (review_draft, published_project_id)
  on public.project_information_reports to authenticated;

CREATE OR REPLACE FUNCTION public.admin_list_project_submissions(p_status text DEFAULT 'pending'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
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
    'project_id', coalesce(report.project_id, report.published_project_id),
    'suggested_project', report.suggested_project,
    'review_draft', report.review_draft,
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
  left join public.projects project on project.id = coalesce(report.project_id, report.published_project_id)
  where v_status = 'all' or report.status = v_status;

  return v_result;
end;
$function$
;

create function public.admin_save_project_submission_draft(
  p_report_id bigint, p_baseline timestamptz, p_draft jsonb
) returns timestamptz
language plpgsql security invoker set search_path = ''
as $$
declare
  v_saved_at timestamptz;
begin
  if not private.is_tracker_admin() then
    raise exception 'Administrator access is required.';
  end if;
  if p_draft is null or jsonb_typeof(p_draft) <> 'object' then
    raise exception 'A project draft is required.';
  end if;
  update public.project_information_reports
  set review_draft = p_draft, status = 'in_review', status_updated_at = clock_timestamp(),
      reviewed_by = auth.uid()
  where id = p_report_id and submission_type = 'new_project'
    and status in ('pending', 'in_review') and status_updated_at = p_baseline
  returning status_updated_at into v_saved_at;
  if not found then
    raise exception 'This suggestion changed. Reopen it from the review queue.';
  end if;
  return v_saved_at;
end;
$$;

create function public.admin_publish_project_submission(
  p_report_id bigint, p_baseline timestamptz, p_project jsonb
) returns jsonb
language plpgsql security invoker set search_path = ''
as $$
declare
  v_report public.project_information_reports;
  v_project public.projects;
begin
  if not private.is_tracker_admin() then
    raise exception 'Administrator access is required.';
  end if;

  select * into v_report from public.project_information_reports
  where id = p_report_id and submission_type = 'new_project' for update;
  if not found then
    raise exception 'Project suggestion was not found.';
  end if;
  if v_report.status = 'resolved' and v_report.published_project_id is not null then
    select * into v_project from public.projects where id = v_report.published_project_id;
    return to_jsonb(v_project);
  end if;
  if v_report.status not in ('pending', 'in_review') or v_report.status_updated_at is distinct from p_baseline then
    raise exception 'This suggestion changed. Reopen it from the review queue.';
  end if;

  v_project := jsonb_populate_record(null::public.projects, p_project);
  if coalesce(char_length(btrim(v_project.name)), 0) not between 2 and 200
    or v_project.latitude is null or v_project.longitude is null
    or v_project.source_url is not null and v_project.source_url !~* '^https?://[^[:space:]]+$' then
    raise exception 'Enter a valid project name, map pin, and source link if supplied.';
  end if;

  insert into public.projects (
    id, name, area, location, status, project_type, subtypes, dri, residential_units,
    transit, transit_route_overrides, investment, latitude, longitude, parcels, events,
    description, source_url, source_status, color, metadata, sort_order, is_published
  ) values (
    'submission-' || p_report_id, btrim(v_project.name), v_project.area, v_project.location,
    v_project.status, v_project.project_type, v_project.subtypes, v_project.dri, v_project.residential_units,
    v_project.transit, v_project.transit_route_overrides, v_project.investment, v_project.latitude,
    v_project.longitude, v_project.parcels, v_project.events, v_project.description, v_project.source_url,
    v_project.source_status, v_project.color, v_project.metadata, v_project.sort_order, true
  ) returning * into v_project;

  update public.project_information_reports
  set status = 'resolved', published_project_id = v_project.id, review_draft = null,
      resolution_note = 'Published after administrator review.',
      status_updated_at = clock_timestamp(), reviewed_at = now(), reviewed_by = auth.uid()
  where id = p_report_id;
  return to_jsonb(v_project);
end;
$$;

revoke execute on function public.admin_save_project_submission_draft(bigint, timestamptz, jsonb) from public, anon;
revoke execute on function public.admin_publish_project_submission(bigint, timestamptz, jsonb) from public, anon;
grant execute on function public.admin_save_project_submission_draft(bigint, timestamptz, jsonb) to authenticated;
grant execute on function public.admin_publish_project_submission(bigint, timestamptz, jsonb) to authenticated;
