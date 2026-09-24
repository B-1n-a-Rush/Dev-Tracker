begin;

select set_config(
  'trackside.change_reason',
  'Consolidated homes into residential units',
  true
);

update public.projects
set residential_units = case
      when residential_units > 0 and homes > 0 and residential_units <> homes
        then residential_units + homes
      when residential_units > 0
        then residential_units
      else homes
    end,
    updated_at = now()
where homes > 0
  and residential_units is distinct from case
    when residential_units > 0 and homes > 0 and residential_units <> homes
      then residential_units + homes
    when residential_units > 0
      then residential_units
    else homes
  end;

with rewritten as (
  select
    id,
    (proposed_patch - 'homes') || case
      when proposed_patch ? 'homes'
        and not proposed_patch ? 'residential_units'
        then jsonb_build_object('residential_units', proposed_patch -> 'homes')
      else '{}'::jsonb
    end as proposed_patch,
    case
      when 'homes' = any(changed_fields)
        and not ('residential_units' = any(changed_fields))
        then array_append(array_remove(changed_fields, 'homes'), 'residential_units')
      else array_remove(changed_fields, 'homes')
    end as changed_fields
  from public.project_change_proposals
  where proposed_patch ? 'homes'
    or 'homes' = any(changed_fields)
)
update public.project_change_proposals proposal
set proposed_patch = rewritten.proposed_patch,
    changed_fields = rewritten.changed_fields,
    dedupe_fingerprint = md5(
      proposal.project_id || proposal.source_url || rewritten.proposed_patch::text
    )
from rewritten
where proposal.id = rewritten.id;

alter table public.project_change_proposals
  drop constraint project_change_proposals_patch_fields_are_safe,
  drop constraint project_change_proposals_changed_fields_are_safe;

alter table public.project_change_proposals
  add constraint project_change_proposals_patch_fields_are_safe
    check (
      proposed_patch - array[
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
      ] = '{}'::jsonb
    ),
  add constraint project_change_proposals_changed_fields_are_safe
    check (
      cardinality(changed_fields) > 0
      and changed_fields <@ array[
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
      ]
    );

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
  proposal public.project_change_proposals%rowtype;
  updated_project public.projects%rowtype;
  decision text := lower(trim(p_decision));
begin
  if not private.is_tracker_admin() then
    raise exception 'Approved tracker administrator access is required.';
  end if;

  if decision not in ('approve', 'reject') then
    raise exception 'Decision must be approve or reject.';
  end if;

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

  if decision = 'reject' then
    update public.project_change_proposals
    set status = 'rejected',
        reviewed_by = (select auth.uid()),
        reviewed_at = now(),
        review_note = nullif(trim(p_note), '')
    where id = proposal.id;

    return jsonb_build_object(
      'proposal_id', proposal.id,
      'status', 'rejected'
    );
  end if;

  if not exists (
    select 1
    from public.projects
    where id = proposal.project_id
      and updated_at = proposal.baseline_updated_at
  ) then
    raise exception 'This project changed after the suggestion was created. Refresh the source review before approving it.';
  end if;

  update public.projects
  set status = case
        when proposal.proposed_patch ? 'status' then proposal.proposed_patch ->> 'status'
        else status
      end,
      project_type = case
        when proposal.proposed_patch ? 'project_type' then proposal.proposed_patch ->> 'project_type'
        else project_type
      end,
      subtypes = case
        when proposal.proposed_patch ? 'subtypes' then
          array(select jsonb_array_elements_text(proposal.proposed_patch -> 'subtypes'))
        else subtypes
      end,
      dri = case
        when proposal.proposed_patch ? 'dri' then nullif(trim(proposal.proposed_patch ->> 'dri'), '')
        else dri
      end,
      residential_units = case
        when proposal.proposed_patch ? 'residential_units' then (proposal.proposed_patch ->> 'residential_units')::integer
        else residential_units
      end,
      transit = case
        when proposal.proposed_patch ? 'transit' then nullif(trim(proposal.proposed_patch ->> 'transit'), '')
        else transit
      end,
      investment = case
        when proposal.proposed_patch ? 'investment' then nullif(trim(proposal.proposed_patch ->> 'investment'), '')
        else investment
      end,
      description = case
        when proposal.proposed_patch ? 'description' then nullif(trim(proposal.proposed_patch ->> 'description'), '')
        else description
      end,
      source_url = case
        when proposal.proposed_patch ? 'source_url' then nullif(trim(proposal.proposed_patch ->> 'source_url'), '')
        else source_url
      end,
      source_status = case
        when proposal.proposed_patch ? 'source_status' then nullif(trim(proposal.proposed_patch ->> 'source_status'), '')
        else source_status
      end,
      events = case
        when proposal.proposed_patch ? 'events' then proposal.proposed_patch -> 'events'
        else events
      end,
      metadata = case
        when proposal.proposed_patch ? 'metadata' then metadata || (proposal.proposed_patch -> 'metadata')
        else metadata
      end,
      updated_at = now()
  where id = proposal.project_id
  returning * into updated_project;

  update public.project_change_proposals
  set status = 'approved',
      reviewed_by = (select auth.uid()),
      reviewed_at = now(),
      review_note = nullif(trim(p_note), '')
  where id = proposal.id;

  return jsonb_build_object(
    'proposal_id', proposal.id,
    'status', 'approved',
    'project', to_jsonb(updated_project)
  );
end;
$$;

create or replace function public.reverse_project_change(
  p_history_id bigint
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  history_entry public.project_change_history%rowtype;
  current_project public.projects%rowtype;
  restored_project public.projects%rowtype;
begin
  if (select auth.uid()) is null or not private.is_tracker_admin() then
    raise exception 'Approved tracker administrator access is required.';
  end if;

  select *
    into history_entry
  from public.project_change_history
  where id = p_history_id;

  if not found then
    raise exception 'Administrative change was not found.';
  end if;

  if history_entry.change_reason = 'Consolidated homes into residential units' then
    raise exception 'This system consolidation cannot be reversed.';
  end if;

  if history_entry.action = 'updated' then
    perform set_config(
      'trackside.change_reason',
      format('Reversed history entry #%s', history_entry.id),
      true
    );

    select *
      into current_project
    from public.projects
    where id = history_entry.project_id
    for update;

    if not found then
      raise exception 'This project no longer exists, so the update cannot be reversed.';
    end if;

    if not (
      (to_jsonb(current_project) - 'updated_at')
      @> (coalesce(history_entry.after_data, '{}'::jsonb) - array['updated_at', 'homes'])
    ) then
      raise exception 'This project changed after the selected history entry. Reverse newer changes first.';
    end if;

    select *
      into restored_project
    from jsonb_populate_record(
      null::public.projects,
      history_entry.before_data - 'homes'
    );

    update public.projects
    set name = restored_project.name,
        area = restored_project.area,
        location = restored_project.location,
        status = restored_project.status,
        project_type = restored_project.project_type,
        subtypes = restored_project.subtypes,
        dri = restored_project.dri,
        residential_units = restored_project.residential_units,
        transit = restored_project.transit,
        investment = restored_project.investment,
        latitude = restored_project.latitude,
        longitude = restored_project.longitude,
        parcels = restored_project.parcels,
        events = restored_project.events,
        description = restored_project.description,
        source_url = restored_project.source_url,
        source_status = restored_project.source_status,
        color = restored_project.color,
        metadata = restored_project.metadata,
        is_published = restored_project.is_published,
        sort_order = coalesce(restored_project.sort_order, current_project.sort_order),
        updated_at = now()
    where id = history_entry.project_id
    returning * into current_project;

  elsif history_entry.action = 'created' then
    perform set_config(
      'trackside.change_reason',
      format('Reversed history entry #%s', history_entry.id),
      true
    );

    select *
      into current_project
    from public.projects
    where id = history_entry.project_id
    for update;

    if not found then
      raise exception 'This project has already been removed.';
    end if;

    if not (
      (to_jsonb(current_project) - 'updated_at')
      @> (coalesce(history_entry.after_data, '{}'::jsonb) - array['updated_at', 'homes'])
    ) then
      raise exception 'This project changed after it was created. Reverse newer changes first.';
    end if;

    delete from public.projects
    where id = history_entry.project_id;

  elsif history_entry.action = 'deleted' then
    perform set_config(
      'trackside.change_reason',
      format('Reversed history entry #%s', history_entry.id),
      true
    );

    if exists (
      select 1
      from public.projects
      where id = history_entry.project_id
    ) then
      raise exception 'A project with this ID already exists, so the deletion cannot be reversed.';
    end if;

    select *
      into restored_project
    from jsonb_populate_record(
      null::public.projects,
      history_entry.before_data - 'homes'
    );

    insert into public.projects (
      id,
      name,
      area,
      location,
      status,
      project_type,
      subtypes,
      dri,
      residential_units,
      transit,
      investment,
      latitude,
      longitude,
      parcels,
      events,
      description,
      source_url,
      source_status,
      color,
      metadata,
      is_published,
      created_at,
      updated_at,
      sort_order
    )
    values (
      restored_project.id,
      restored_project.name,
      restored_project.area,
      restored_project.location,
      restored_project.status,
      restored_project.project_type,
      restored_project.subtypes,
      restored_project.dri,
      restored_project.residential_units,
      restored_project.transit,
      restored_project.investment,
      restored_project.latitude,
      restored_project.longitude,
      restored_project.parcels,
      restored_project.events,
      restored_project.description,
      restored_project.source_url,
      restored_project.source_status,
      restored_project.color,
      restored_project.metadata,
      restored_project.is_published,
      restored_project.created_at,
      now(),
      coalesce(restored_project.sort_order, 0)
    )
    returning * into current_project;

  else
    raise exception 'This administrative action cannot be reversed.';
  end if;

  return jsonb_build_object(
    'history_id', history_entry.id,
    'project_id', history_entry.project_id,
    'reversed_action', history_entry.action,
    'project', case
      when history_entry.action = 'created' then null
      else to_jsonb(current_project)
    end
  );
end;
$$;

alter table public.projects
  drop column homes;

notify pgrst, 'reload schema';

commit;
