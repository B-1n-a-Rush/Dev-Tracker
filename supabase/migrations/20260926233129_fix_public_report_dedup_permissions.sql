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
  on conflict do nothing;

  return true;
end;
$$;

revoke all on function public.submit_project_information_report(text, text, text, text) from public;
grant execute on function public.submit_project_information_report(text, text, text, text) to anon, authenticated, service_role;
