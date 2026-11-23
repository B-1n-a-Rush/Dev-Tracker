-- Owner-only publication controls for uploaded routes and bundled fallbacks.
create table public.bundled_transit_route_visibility (
  route_name text primary key,
  is_published boolean not null default true,
  updated_at timestamptz not null default now()
);

insert into public.bundled_transit_route_visibility (route_name)
values
  ('MARTA Rapid Campbellton'), ('MARTA Rapid B-Line (Southlake)'),
  ('Buford ART'), ('North Ave BRT'), ('Metropolitan ART'), ('GA-400 BRT'),
  ('Cleveland Ave ART'), ('I-285 BRT'), ('SR54 BRT'), ('Peachtree ART'),
  ('Summerhill BRT'), ('Roosevelt Hwy ART'), ('South Fulton Parkway BRT'),
  ('Northside Drive BRT');

alter table public.bundled_transit_route_visibility enable row level security;
revoke all on public.bundled_transit_route_visibility from public, anon, authenticated;
grant select on public.bundled_transit_route_visibility to anon, authenticated;
create policy public_reads_bundled_transit_route_visibility
  on public.bundled_transit_route_visibility for select to anon, authenticated
  using (true);

create table public.owner_route_change_history (
  id bigint generated always as identity primary key,
  route_id bigint,
  bundled_name text,
  route_name text not null,
  changed_at timestamptz not null default clock_timestamp(),
  changed_by uuid not null,
  before_state jsonb not null,
  after_state jsonb not null,
  geometry_changed boolean not null,
  restores_change_id bigint,
  check (num_nonnulls(route_id, bundled_name) = 1)
);

alter table public.owner_route_change_history enable row level security;
revoke all on public.owner_route_change_history from public, anon, authenticated;
grant select on public.owner_route_change_history to authenticated;
create policy owners_read_route_change_history
  on public.owner_route_change_history for select to authenticated
  using ((select private.is_tracker_owner()));

create or replace function private.change_tracker_route(
  p_route_id bigint,
  p_bundled_name text,
  p_expected_updated_at timestamptz,
  p_is_published boolean,
  p_geometry jsonb,
  p_miles numeric,
  p_source_filename text,
  p_undo_id bigint
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $function$
declare
  target_id bigint := p_route_id;
  target_name text := p_bundled_name;
  label text;
  existing_route public.transit_routes%rowtype;
  bundled_route public.bundled_transit_route_visibility%rowtype;
  previous_change public.owner_route_change_history%rowtype;
  before_values jsonb;
  after_values jsonb;
  visible boolean := p_is_published;
  new_geometry jsonb := p_geometry;
  new_miles numeric := p_miles;
  new_filename text := p_source_filename;
  lines jsonb;
  part jsonb;
  coordinate_count bigint := 0;
  change_id bigint;
begin
  if not private.is_tracker_owner() then
    raise exception 'A live owner session is required.' using errcode = '42501';
  end if;

  if p_undo_id is not null then
    if num_nonnulls(p_route_id, p_bundled_name, p_expected_updated_at,
        p_is_published, p_geometry, p_miles, p_source_filename) <> 0 then
      raise exception 'Send only the change ID to restore.';
    end if;
    select * into previous_change from public.owner_route_change_history where id = p_undo_id;
    if not found then raise exception 'That route change is no longer available.'; end if;
    target_id := previous_change.route_id;
    target_name := previous_change.bundled_name;
  elsif num_nonnulls(target_id, target_name) <> 1
      or p_expected_updated_at is null or visible is null then
    raise exception 'Select one route and reload its current version.';
  end if;

  if target_id is null then
    select * into bundled_route from public.bundled_transit_route_visibility
      where route_name = target_name for update;
    if not found then raise exception 'That bundled alignment is unavailable.'; end if;
    before_values := to_jsonb(bundled_route);
    label := bundled_route.route_name;
  else
    select * into existing_route from public.transit_routes
      where id = target_id for update;
    if not found then raise exception 'That uploaded route is unavailable.'; end if;
    before_values := to_jsonb(existing_route) - array['created_by', 'created_at'];
    label := existing_route.name;
  end if;

  if p_undo_id is not null then
    if before_values is distinct from previous_change.after_state then
      raise exception 'The route changed since this action. Reload before making another change.';
    end if;
    visible := (previous_change.before_state ->> 'is_published')::boolean;
    new_geometry := previous_change.before_state -> 'geometry';
    new_miles := (previous_change.before_state ->> 'miles')::numeric;
    new_filename := previous_change.before_state ->> 'source_filename';
  else
    if (before_values ->> 'updated_at')::timestamptz is distinct from p_expected_updated_at then
      raise exception 'The route changed while you were reviewing it. Reload and try again.';
    end if;
    if new_geometry is not null then
      if target_id is null or new_miles is null or new_miles <= 0 or new_miles >= 1000
          or new_filename is null or length(btrim(new_filename)) not between 1 and 255 then
        raise exception 'Select an uploaded route and a valid replacement file.';
      end if;
      lines := case new_geometry ->> 'type'
        when 'LineString' then jsonb_build_array(new_geometry -> 'coordinates')
        when 'MultiLineString' then new_geometry -> 'coordinates' end;
      if jsonb_typeof(lines) is distinct from 'array' then
        raise exception 'Use a LineString or MultiLineString alignment.';
      end if;
      if jsonb_array_length(lines) = 0 then raise exception 'The alignment is empty.'; end if;
      for part in select value from jsonb_array_elements(lines) loop
        if jsonb_typeof(part) is distinct from 'array' then
          raise exception 'Every alignment part must contain coordinates.';
        end if;
        coordinate_count := coordinate_count + jsonb_array_length(part);
        if coordinate_count > 100000 or jsonb_array_length(part) < 2
            or exists (
              select from jsonb_array_elements(part) as c(point)
              where case
                when jsonb_typeof(c.point) <> 'array' then true
                when jsonb_array_length(c.point) <> 2 then true
                when jsonb_typeof(c.point -> 0) <> 'number' or jsonb_typeof(c.point -> 1) <> 'number' then true
                else (c.point ->> 0)::numeric not between -180 and 180
                  or (c.point ->> 1)::numeric not between -90 and 90
              end
            ) then
          raise exception 'Use WGS84 line coordinates and at most 100,000 vertices.';
        end if;
      end loop;
    elsif num_nonnulls(new_miles, new_filename) <> 0 then
      raise exception 'Replacement mileage and filename require an alignment.';
    end if;
  end if;

  if visible = (before_values ->> 'is_published')::boolean
      and (new_geometry is null or (new_geometry = before_values -> 'geometry'
        and new_miles = (before_values ->> 'miles')::numeric
        and new_filename is not distinct from (before_values ->> 'source_filename'))) then
    raise exception 'The route already has these settings.';
  end if;

  if target_id is null then
    update public.bundled_transit_route_visibility as v
    set is_published = visible, updated_at = greatest(clock_timestamp(), v.updated_at + interval '1 microsecond')
    where v.route_name = target_name returning to_jsonb(v) into after_values;
  else
    update public.transit_routes as r
    set is_published = visible,
        geometry = coalesce(new_geometry, r.geometry),
        miles = coalesce(new_miles, r.miles),
        source_filename = case when new_geometry is null then r.source_filename else new_filename end,
        updated_at = greatest(clock_timestamp(), r.updated_at + interval '1 microsecond')
    where r.id = target_id returning to_jsonb(r) - array['created_by', 'created_at'] into after_values;
  end if;

  insert into public.owner_route_change_history
    (route_id, bundled_name, route_name, changed_by, before_state, after_state, geometry_changed, restores_change_id)
  values (target_id, target_name, label, auth.uid(), before_values, after_values,
    (before_values -> 'geometry') is distinct from (after_values -> 'geometry'), p_undo_id)
  returning id into change_id;
  return change_id;
end;
$function$;

revoke all on function private.change_tracker_route(bigint, text, timestamptz, boolean, jsonb, numeric, text, bigint)
  from public, anon, authenticated;
grant execute on function private.change_tracker_route(bigint, text, timestamptz, boolean, jsonb, numeric, text, bigint)
  to authenticated;

create or replace function public.change_tracker_route(
  p_route_id bigint default null,
  p_bundled_name text default null,
  p_expected_updated_at timestamptz default null,
  p_is_published boolean default null,
  p_geometry jsonb default null,
  p_miles numeric default null,
  p_source_filename text default null,
  p_undo_id bigint default null
)
returns bigint
language sql
security invoker
set search_path = ''
as $function$
  select private.change_tracker_route(
    p_route_id, p_bundled_name, p_expected_updated_at, p_is_published,
    p_geometry, p_miles, p_source_filename, p_undo_id
  );
$function$;

revoke all on function public.change_tracker_route(bigint, text, timestamptz, boolean, jsonb, numeric, text, bigint)
  from public, anon, authenticated;
grant execute on function public.change_tracker_route(bigint, text, timestamptz, boolean, jsonb, numeric, text, bigint)
  to authenticated;

notify pgrst, 'reload schema';
