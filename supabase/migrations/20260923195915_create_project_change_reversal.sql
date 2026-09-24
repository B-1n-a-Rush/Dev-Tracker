alter table public.project_change_history
  add column if not exists change_reason text;

create or replace function private.capture_project_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  audit_fields text[] := '{}'::text[];
  audit_reason text := nullif(current_setting('trackside.change_reason', true), '');
begin
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
    (select auth.uid()),
    audit_fields,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end,
    audit_reason
  );

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke all on function private.capture_project_change()
  from public, anon, authenticated, service_role;

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
      @> (coalesce(history_entry.after_data, '{}'::jsonb) - 'updated_at')
    ) then
      raise exception 'This project changed after the selected history entry. Reverse newer changes first.';
    end if;

    select *
      into restored_project
    from jsonb_populate_record(
      null::public.projects,
      history_entry.before_data
    );

    update public.projects
    set name = restored_project.name,
        area = restored_project.area,
        location = restored_project.location,
        status = restored_project.status,
        project_type = restored_project.project_type,
        subtypes = restored_project.subtypes,
        dri = restored_project.dri,
        homes = restored_project.homes,
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
      @> (coalesce(history_entry.after_data, '{}'::jsonb) - 'updated_at')
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
      history_entry.before_data
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
      homes,
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
      restored_project.homes,
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

comment on function public.reverse_project_change(bigint) is
  'Safely reverses one audited project change for an approved Trackside ATL administrator. Stale changes are rejected.';

revoke all on function public.reverse_project_change(bigint)
  from public, anon;
grant execute on function public.reverse_project_change(bigint)
  to authenticated;

notify pgrst, 'reload schema';
