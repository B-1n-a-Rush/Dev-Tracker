create table private.tracker_route_alignment_revisions (
  id bigint generated always as identity primary key,
  route_id bigint not null references public.transit_routes(id) on delete cascade,
  changed_at timestamptz not null default clock_timestamp(),
  before_geometry jsonb not null
);
create index tracker_route_alignment_revisions_route_time
  on private.tracker_route_alignment_revisions (route_id, changed_at, id);
alter table private.tracker_route_alignment_revisions enable row level security;
revoke all on private.tracker_route_alignment_revisions from public, anon, authenticated;

insert into private.tracker_route_alignment_revisions (route_id, changed_at, before_geometry)
select h.route_id, h.changed_at, h.before_state -> 'geometry'
from public.owner_route_change_history h
join public.transit_routes r on r.id=h.route_id
where h.geometry_changed and h.before_state -> 'geometry' is not null;

create function private.record_tracker_route_alignment()
returns trigger language plpgsql security definer set search_path='' as $function$
begin
  insert into private.tracker_route_alignment_revisions (route_id,before_geometry)
  values (old.id,old.geometry);
  return new;
end;
$function$;
revoke all on function private.record_tracker_route_alignment() from public, anon, authenticated;
create trigger record_tracker_route_alignment
  after update of geometry on public.transit_routes
  for each row when (old.geometry is distinct from new.geometry)
  execute function private.record_tracker_route_alignment();

alter table public.infrastructure_coordination_reviews
  add column reviewed_route_match_at timestamptz,
  add column reviewed_route_distance_m numeric
    check (reviewed_route_distance_m between 0 and 1609.344);

create function private.preserve_coordination_route_checkpoint()
returns trigger language plpgsql set search_path='' as $function$
begin
  if old.route_id is not null and new.reviewed_route_match_at is null then
    new.reviewed_route_match_at := coalesce(old.reviewed_route_match_at,old.updated_at);
  end if;
  return new;
end;
$function$;
revoke all on function private.preserve_coordination_route_checkpoint() from public, anon, authenticated;
create trigger preserve_coordination_route_checkpoint
  before update on public.infrastructure_coordination_reviews
  for each row execute function private.preserve_coordination_route_checkpoint();

create function private.coordination_alignment_changes(p_route_id bigint)
returns jsonb language plpgsql stable security definer set search_path='' as $function$
declare
  active_geometry jsonb;
  latest_at timestamptz;
  matches jsonb;
begin
  if not private.is_tracker_admin() then
    raise insufficient_privilege using message='Tracker administrator access required';
  end if;
  select geometry into active_geometry from public.transit_routes where id=p_route_id and is_published;
  if not found then return jsonb_build_object('published',false,'comparisons','[]'::jsonb); end if;
  select max(rev.changed_at) into latest_at from private.tracker_route_alignment_revisions rev
  where rev.route_id=p_route_id;
  with comparisons as (
    select review.infrastructure_id, coalesce(review.reviewed_route_distance_m,76.2) as distance_m,
      first_change.id as revision
    from public.infrastructure_coordination_reviews review
    cross join lateral (
      select id from private.tracker_route_alignment_revisions
      where route_id=p_route_id and changed_at>coalesce(review.reviewed_route_match_at,review.updated_at)
      order by changed_at,id limit 1
    ) first_change
    where review.route_id=p_route_id and review.route_key='rapid:'||p_route_id::text
  ),
  grouped as (
    select revision,jsonb_agg(jsonb_build_object(
      'infrastructure_id',infrastructure_id,'distance_m',distance_m
    ) order by infrastructure_id) as items from comparisons group by revision
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'geometry', rev.before_geometry, 'changed_at', rev.changed_at, 'items', grouped.items
    ) order by rev.id),'[]'::jsonb) into matches
  from grouped join private.tracker_route_alignment_revisions rev on rev.id=grouped.revision;
  return jsonb_build_object('published',true,'latest_at',latest_at,
    'geometry',case when jsonb_array_length(matches)>0 then active_geometry end,'comparisons',matches);
end;
$function$;
revoke all on function private.coordination_alignment_changes(bigint) from public, anon, authenticated;
grant execute on function private.coordination_alignment_changes(bigint) to authenticated;

create function public.coordination_alignment_changes(p_route_id bigint)
returns jsonb language sql stable security invoker set search_path='' as $function$
  select private.coordination_alignment_changes(p_route_id);
$function$;
revoke all on function public.coordination_alignment_changes(bigint) from public, anon, authenticated;
grant execute on function public.coordination_alignment_changes(bigint) to authenticated;
notify pgrst, 'reload schema';
