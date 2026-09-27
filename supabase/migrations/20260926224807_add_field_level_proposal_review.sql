alter table public.project_change_proposals
  add column approved_fields text[] not null default '{}'::text[],
  add column rejected_fields text[] not null default '{}'::text[];

alter table public.project_change_proposals
  add constraint project_change_proposals_approved_fields_are_safe
    check (
      approved_fields <@ array[
        'status',
        'project_type',
        'subtypes',
        'dri',
        'residential_units',
        'transit',
        'investment',
        'description',
        'source_url',
        'source_status',
        'events',
        'metadata'
      ]::text[]
    ),
  add constraint project_change_proposals_rejected_fields_are_safe
    check (
      rejected_fields <@ array[
        'status',
        'project_type',
        'subtypes',
        'dri',
        'residential_units',
        'transit',
        'investment',
        'description',
        'source_url',
        'source_status',
        'events',
        'metadata'
      ]::text[]
    ),
  add constraint project_change_proposals_review_fields_do_not_overlap
    check (not (approved_fields && rejected_fields));

create or replace function public.review_project_change_proposal_fields(
  p_proposal_id bigint,
  p_approved_fields text[],
  p_rejected_fields text[],
  p_note text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  proposal public.project_change_proposals%rowtype;
  updated_project public.projects%rowtype;
  approved text[];
  rejected text[];
  approved_patch jsonb;
  final_status text;
begin
  if (select auth.uid()) is null or not private.is_tracker_admin() then
    raise exception 'Approved tracker administrator access is required.';
  end if;

  select coalesce(array_agg(distinct field order by field), '{}'::text[])
    into approved
  from unnest(coalesce(p_approved_fields, '{}'::text[])) as field;

  select coalesce(array_agg(distinct field order by field), '{}'::text[])
    into rejected
  from unnest(coalesce(p_rejected_fields, '{}'::text[])) as field;

  select *
    into proposal
  from public.project_change_proposals
  where id = p_proposal_id
  for update;

  if not found then
    raise exception 'Suggested change was not found.';
  end if;

  if proposal.status <> 'pending' then
    raise exception 'Suggested change has already been reviewed.';
  end if;

  if approved && rejected then
    raise exception 'A field cannot be both accepted and rejected.';
  end if;

  if not (
    approved <@ proposal.changed_fields
    and rejected <@ proposal.changed_fields
    and proposal.changed_fields <@ (approved || rejected)
  ) then
    raise exception 'Every changed field must be accepted or rejected exactly once.';
  end if;

  if cardinality(approved) = 0 then
    update public.project_change_proposals
    set status = 'rejected',
        approved_fields = approved,
        rejected_fields = rejected,
        reviewed_by = (select auth.uid()),
        reviewed_at = now(),
        review_note = nullif(trim(p_note), '')
    where id = proposal.id;

    return jsonb_build_object(
      'proposal_id', proposal.id,
      'status', 'rejected',
      'approved_fields', approved,
      'rejected_fields', rejected,
      'project', null
    );
  end if;

  if not exists (
    select 1
    from public.projects
    where id = proposal.project_id
      and updated_at = proposal.baseline_updated_at
  ) then
    raise exception 'This project changed after the suggestion was created. Request a fresh source check before approving it.';
  end if;

  select coalesce(jsonb_object_agg(entry.key, entry.value), '{}'::jsonb)
    into approved_patch
  from jsonb_each(proposal.proposed_patch) as entry
  where entry.key = any(approved);

  perform set_config(
    'trackside.change_reason',
    format(
      'Approved proposal #%s fields: %s%s',
      proposal.id,
      array_to_string(approved, ', '),
      case
        when cardinality(rejected) > 0
          then format('; rejected fields: %s', array_to_string(rejected, ', '))
        else ''
      end
    ),
    true
  );

  update public.projects
  set status = case
        when approved_patch ? 'status' then approved_patch ->> 'status'
        else status
      end,
      project_type = case
        when approved_patch ? 'project_type' then approved_patch ->> 'project_type'
        else project_type
      end,
      subtypes = case
        when approved_patch ? 'subtypes' then
          array(select jsonb_array_elements_text(approved_patch -> 'subtypes'))
        else subtypes
      end,
      dri = case
        when approved_patch ? 'dri' then nullif(trim(approved_patch ->> 'dri'), '')
        else dri
      end,
      residential_units = case
        when approved_patch ? 'residential_units' then (approved_patch ->> 'residential_units')::integer
        else residential_units
      end,
      transit = case
        when approved_patch ? 'transit' then nullif(trim(approved_patch ->> 'transit'), '')
        else transit
      end,
      investment = case
        when approved_patch ? 'investment' then nullif(trim(approved_patch ->> 'investment'), '')
        else investment
      end,
      description = case
        when approved_patch ? 'description' then nullif(trim(approved_patch ->> 'description'), '')
        else description
      end,
      source_url = case
        when approved_patch ? 'source_url' then nullif(trim(approved_patch ->> 'source_url'), '')
        else source_url
      end,
      source_status = case
        when approved_patch ? 'source_status' then nullif(trim(approved_patch ->> 'source_status'), '')
        else source_status
      end,
      events = case
        when approved_patch ? 'events' then approved_patch -> 'events'
        else events
      end,
      metadata = case
        when approved_patch ? 'metadata' then coalesce(metadata, '{}'::jsonb) || (approved_patch -> 'metadata')
        else metadata
      end,
      updated_at = now()
  where id = proposal.project_id
  returning * into updated_project;

  final_status := 'approved';

  update public.project_change_proposals
  set status = final_status,
      approved_fields = approved,
      rejected_fields = rejected,
      reviewed_by = (select auth.uid()),
      reviewed_at = now(),
      review_note = nullif(trim(p_note), '')
  where id = proposal.id;

  return jsonb_build_object(
    'proposal_id', proposal.id,
    'status', final_status,
    'approved_fields', approved,
    'rejected_fields', rejected,
    'project', to_jsonb(updated_project)
  );
end;
$$;

create or replace function public.review_project_change_proposal(
  p_proposal_id bigint,
  p_decision text,
  p_note text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  fields text[];
  decision text := lower(trim(p_decision));
begin
  if decision not in ('approve', 'reject') then
    raise exception 'Decision must be approve or reject.';
  end if;

  select changed_fields
    into fields
  from public.project_change_proposals
  where id = p_proposal_id;

  if not found then
    raise exception 'Suggested change was not found.';
  end if;

  if decision = 'approve' then
    return public.review_project_change_proposal_fields(
      p_proposal_id,
      fields,
      '{}'::text[],
      p_note
    );
  end if;

  return public.review_project_change_proposal_fields(
    p_proposal_id,
    '{}'::text[],
    fields,
    p_note
  );
end;
$$;

create or replace function public.review_project_change_proposals_bulk(
  p_proposal_ids bigint[],
  p_note text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  proposal_ids bigint[];
  proposal_record public.project_change_proposals%rowtype;
  reviewed jsonb := '[]'::jsonb;
  project_ids text[] := '{}'::text[];
  proposal_id bigint;
begin
  if (select auth.uid()) is null or not private.is_tracker_admin() then
    raise exception 'Approved tracker administrator access is required.';
  end if;

  select coalesce(array_agg(distinct id order by id), '{}'::bigint[])
    into proposal_ids
  from unnest(coalesce(p_proposal_ids, '{}'::bigint[])) as id;

  if cardinality(proposal_ids) = 0 then
    raise exception 'Select at least one suggestion to approve.';
  end if;

  if cardinality(proposal_ids) > 20 then
    raise exception 'Approve no more than 20 suggestions at once.';
  end if;

  if cardinality(proposal_ids) <> cardinality(coalesce(p_proposal_ids, '{}'::bigint[])) then
    raise exception 'The bulk selection contains a duplicate suggestion.';
  end if;

  for proposal_record in
    select *
    from public.project_change_proposals
    where id = any(proposal_ids)
    order by id
    for update
  loop
    if proposal_record.status <> 'pending' then
      raise exception 'Suggestion #% has already been reviewed.', proposal_record.id;
    end if;

    if proposal_record.confidence < 0.90 then
      raise exception 'Suggestion #% is below the 90%% confidence threshold for bulk approval.', proposal_record.id;
    end if;

    if proposal_record.project_id = any(project_ids) then
      raise exception 'Bulk approval supports only one suggestion per project.';
    end if;

    if not exists (
      select 1
      from public.projects
      where id = proposal_record.project_id
        and updated_at = proposal_record.baseline_updated_at
    ) then
      raise exception 'Suggestion #% is outdated because its project changed. Request a fresh source check first.', proposal_record.id;
    end if;

    project_ids := array_append(project_ids, proposal_record.project_id);
  end loop;

  if cardinality(project_ids) <> cardinality(proposal_ids) then
    raise exception 'One or more selected suggestions could not be found.';
  end if;

  foreach proposal_id in array proposal_ids
  loop
    select changed_fields
      into proposal_record.changed_fields
    from public.project_change_proposals
    where id = proposal_id;

    reviewed := reviewed || jsonb_build_array(
      public.review_project_change_proposal_fields(
        proposal_id,
        proposal_record.changed_fields,
        '{}'::text[],
        p_note
      )
    );
  end loop;

  return jsonb_build_object(
    'status', 'approved',
    'count', cardinality(proposal_ids),
    'results', reviewed
  );
end;
$$;

revoke all on function public.review_project_change_proposal_fields(bigint, text[], text[], text)
  from public, anon;
grant execute on function public.review_project_change_proposal_fields(bigint, text[], text[], text)
  to authenticated;

revoke all on function public.review_project_change_proposals_bulk(bigint[], text)
  from public, anon;
grant execute on function public.review_project_change_proposals_bulk(bigint[], text)
  to authenticated;

revoke all on function public.review_project_change_proposal(bigint, text, text)
  from public, anon;
grant execute on function public.review_project_change_proposal(bigint, text, text)
  to authenticated;

notify pgrst, 'reload schema';
