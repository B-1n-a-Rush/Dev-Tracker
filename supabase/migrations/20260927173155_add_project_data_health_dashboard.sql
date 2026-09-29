create or replace function public.get_project_data_health(
  p_stale_after_days integer default 30
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  dashboard jsonb;
  stale_days integer := greatest(1, least(coalesce(p_stale_after_days, 30), 365));
begin
  if (select auth.uid()) is null or not private.is_tracker_admin() then
    raise exception 'Approved tracker administrator access is required.';
  end if;

  with
  base as (
    select
      p.*,
      regexp_replace(lower(p.name), '[^a-z0-9]+', '', 'g') as normalized_name,
      (
        lower(coalesce(p.project_type, '')) in ('residential', 'mixed-use', 'mixed use')
        or exists (
          select 1
          from unnest(coalesce(p.subtypes, '{}'::text[])) subtype
          where lower(subtype) = 'residential'
        )
        or coalesce(p.description, '') ~* '\m(apartment|residential|housing|townhome|homes?|units?)\M'
      ) as likely_residential
    from public.projects p
    where p.is_published
  ),
  proposal_conflicts as (
    select
      proposal.project_id,
      array_agg(distinct proposal.id order by proposal.id) as proposal_ids,
      array_agg(distinct field order by field) as changed_fields
    from public.project_change_proposals proposal
    cross join lateral unnest(proposal.changed_fields) field
    where proposal.status = 'pending'
    group by proposal.project_id
  ),
  duplicate_name_groups as (
    select
      'name:' || normalized_name as group_key,
      array_agg(id order by name, id) as project_ids,
      array_agg(name order by name, id) as project_names
    from base
    where normalized_name <> ''
    group by normalized_name
    having count(*) > 1
  ),
  duplicate_coordinate_groups as (
    select
      'coordinates:' || round(latitude::numeric, 4)::text || ':' || round(longitude::numeric, 4)::text as group_key,
      array_agg(id order by name, id) as project_ids,
      array_agg(name order by name, id) as project_names
    from base
    where latitude is not null and longitude is not null
    group by round(latitude::numeric, 4), round(longitude::numeric, 4)
    having count(*) > 1
  ),
  missing_field_rows as (
    select
      b.*,
      array_remove(array[
        case when b.likely_residential and coalesce(b.residential_units, 0) <= 0 then 'residential_units' end,
        case when nullif(btrim(b.description), '') is null then 'description' end,
        case when b.latitude is null or b.longitude is null
          or b.latitude not between -90 and 90
          or b.longitude not between -180 and 180
          or (b.latitude = 0 and b.longitude = 0) then 'coordinates' end,
        case when nullif(btrim(b.transit), '') is null
          or lower(btrim(b.transit)) in ('not specified', 'not provided', 'n/a', 'none') then 'transit' end
      ], null)::text[] as missing_fields
    from base b
  ),
  issues as (
    select
      'missing_source:' || b.id as issue_id,
      'missing_source'::text as category,
      'high'::text as severity,
      b.id as project_id,
      b.name as project_name,
      b.status as project_status,
      'Source link missing'::text as title,
      'No direct source URL is saved for this project.'::text as detail,
      array['source_url']::text[] as fields,
      null::text as source_url,
      s.last_checked_at,
      s.last_error,
      '{}'::text[] as related_project_ids,
      '{}'::text[] as related_project_names,
      '{}'::bigint[] as proposal_ids
    from base b
    left join private.project_monitoring_state s on s.project_id = b.id
    where nullif(btrim(b.source_url), '') is null

    union all

    select
      'stale_check:' || b.id,
      'stale_check',
      case when s.last_checked_at is null then 'high' else 'medium' end,
      b.id,
      b.name,
      b.status,
      case when s.last_checked_at is null then 'Project has never been checked' else 'Project check is overdue' end,
      case when s.last_checked_at is null
        then 'No automated source review has been recorded.'
        else format('The last automated source review is older than %s days.', stale_days)
      end,
      array['last_checked_at']::text[],
      coalesce(s.last_source_url, b.source_url),
      s.last_checked_at,
      s.last_error,
      '{}'::text[],
      '{}'::text[],
      '{}'::bigint[]
    from base b
    left join private.project_monitoring_state s on s.project_id = b.id
    where s.last_checked_at is null
       or s.last_checked_at < now() - make_interval(days => stale_days)

    union all

    select
      'broken_source:' || b.id,
      'broken_source',
      'high',
      b.id,
      b.name,
      b.status,
      case
        when nullif(btrim(b.source_url), '') is not null and b.source_url !~* '^https?://'
          then 'Source URL is invalid'
        when lower(coalesce(s.last_result, '')) = 'source_mismatch'
          then 'Source appears to reference another project'
        else 'Source check failed'
      end,
      coalesce(
        nullif(s.last_error, ''),
        case
          when b.source_url !~* '^https?://' then 'The saved source is not a valid HTTP or HTTPS URL.'
          else 'The monitoring process flagged this source for review.'
        end
      ),
      array['source_url']::text[],
      coalesce(s.last_source_url, b.source_url),
      s.last_checked_at,
      s.last_error,
      '{}'::text[],
      '{}'::text[],
      '{}'::bigint[]
    from base b
    join private.project_monitoring_state s on s.project_id = b.id
    where (
      nullif(btrim(b.source_url), '') is not null
      and b.source_url !~* '^https?://'
    )
    or s.last_error is not null
    or lower(coalesce(s.last_result, '')) in ('error', 'failed', 'source_mismatch')

    union all

    select
      'missing_fields:' || m.id,
      'missing_field',
      case when 'coordinates' = any(m.missing_fields) then 'high' else 'medium' end,
      m.id,
      m.name,
      m.status,
      'Required project details are incomplete',
      'Missing: ' || array_to_string(array(
        select replace(field_name, '_', ' ')
        from unnest(m.missing_fields) field_name
      ), ', '),
      m.missing_fields,
      m.source_url,
      s.last_checked_at,
      s.last_error,
      '{}'::text[],
      '{}'::text[],
      '{}'::bigint[]
    from missing_field_rows m
    left join private.project_monitoring_state s on s.project_id = m.id
    where cardinality(m.missing_fields) > 0

    union all

    select
      'duplicate:' || d.group_key,
      'duplicate',
      'medium',
      d.project_ids[1],
      d.project_names[1],
      b.status,
      'Possible duplicate project names',
      'These records normalize to the same name: ' || array_to_string(d.project_names, ', '),
      array['name']::text[],
      b.source_url,
      s.last_checked_at,
      s.last_error,
      d.project_ids[2:cardinality(d.project_ids)],
      d.project_names[2:cardinality(d.project_names)],
      '{}'::bigint[]
    from duplicate_name_groups d
    join base b on b.id = d.project_ids[1]
    left join private.project_monitoring_state s on s.project_id = b.id

    union all

    select
      'duplicate:' || d.group_key,
      'duplicate',
      'medium',
      d.project_ids[1],
      d.project_names[1],
      b.status,
      'Multiple projects share nearly identical coordinates',
      'Projects within the same rounded map location: ' || array_to_string(d.project_names, ', '),
      array['coordinates']::text[],
      b.source_url,
      s.last_checked_at,
      s.last_error,
      d.project_ids[2:cardinality(d.project_ids)],
      d.project_names[2:cardinality(d.project_names)],
      '{}'::bigint[]
    from duplicate_coordinate_groups d
    join base b on b.id = d.project_ids[1]
    left join private.project_monitoring_state s on s.project_id = b.id

    union all

    select
      'conflict:' || b.id,
      'conflict',
      'medium',
      b.id,
      b.name,
      b.status,
      'Source-backed values conflict with the current record',
      'Pending proposals differ on: ' || array_to_string(pc.changed_fields, ', '),
      pc.changed_fields,
      b.source_url,
      s.last_checked_at,
      s.last_error,
      '{}'::text[],
      '{}'::text[],
      pc.proposal_ids
    from proposal_conflicts pc
    join base b on b.id = pc.project_id
    left join private.project_monitoring_state s on s.project_id = b.id
  ),
  issue_project_ids as (
    select project_id from issues where project_id is not null
    union
    select unnest(related_project_ids) from issues
  )
  select jsonb_build_object(
    'generated_at', now(),
    'stale_after_days', stale_days,
    'summary', jsonb_build_object(
      'total_projects', (select count(*)::integer from base),
      'projects_with_issues', (select count(distinct project_id)::integer from issue_project_ids),
      'total_issues', (select count(*)::integer from issues),
      'missing_sources', (select count(*)::integer from issues where category = 'missing_source'),
      'stale_checks', (select count(*)::integer from issues where category = 'stale_check'),
      'broken_sources', (select count(*)::integer from issues where category = 'broken_source'),
      'missing_fields', (select count(*)::integer from issues where category = 'missing_field'),
      'missing_units', (select count(*)::integer from issues where category = 'missing_field' and 'residential_units' = any(fields)),
      'missing_descriptions', (select count(*)::integer from issues where category = 'missing_field' and 'description' = any(fields)),
      'missing_coordinates', (select count(*)::integer from issues where category = 'missing_field' and 'coordinates' = any(fields)),
      'missing_transit', (select count(*)::integer from issues where category = 'missing_field' and 'transit' = any(fields)),
      'possible_duplicates', (select count(*)::integer from issues where category = 'duplicate'),
      'conflicting_values', (select count(*)::integer from issues where category = 'conflict')
    ),
    'issues', coalesce(
      (
        select jsonb_agg(
          to_jsonb(issue)
          order by
            case issue.severity when 'high' then 0 when 'medium' then 1 else 2 end,
            issue.project_name,
            issue.category
        )
        from issues issue
      ),
      '[]'::jsonb
    )
  )
  into dashboard;

  return dashboard;
end;
$$;

comment on function public.get_project_data_health(integer) is
  'Returns admin-only project completeness, source health, stale monitoring, duplicate, and proposal-conflict findings.';

revoke all on function public.get_project_data_health(integer) from public, anon;
grant execute on function public.get_project_data_health(integer) to authenticated;

notify pgrst, 'reload schema';
