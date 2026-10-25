begin;

select set_config(
  'trackside.change_reason',
  'Migrated station labels to automatic high-capacity route access',
  true
);

create or replace function private.migration_route_distance_meters(
  project_lat double precision,
  project_lng double precision,
  route_geometry jsonb
) returns double precision
language plpgsql
immutable
strict
set search_path = ''
as $$
declare
  lines jsonb;
  line jsonb;
  segment_index integer;
  x1 double precision;
  y1 double precision;
  x2 double precision;
  y2 double precision;
  dx double precision;
  dy double precision;
  length_squared double precision;
  progress double precision;
  distance_meters double precision;
  nearest double precision := 'Infinity'::double precision;
begin
  lines := case route_geometry->>'type'
    when 'LineString' then jsonb_build_array(route_geometry->'coordinates')
    when 'MultiLineString' then route_geometry->'coordinates'
    else '[]'::jsonb
  end;

  for line in select value from jsonb_array_elements(lines)
  loop
    if jsonb_array_length(line) >= 2 then
      for segment_index in 0..jsonb_array_length(line)-2
      loop
        x1 := ((line->segment_index->>0)::double precision - project_lng)
          * 111320 * cos(radians(project_lat));
        y1 := ((line->segment_index->>1)::double precision - project_lat) * 110574;
        x2 := ((line->(segment_index + 1)->>0)::double precision - project_lng)
          * 111320 * cos(radians(project_lat));
        y2 := ((line->(segment_index + 1)->>1)::double precision - project_lat) * 110574;
        dx := x2 - x1;
        dy := y2 - y1;
        length_squared := dx * dx + dy * dy;
        progress := case
          when length_squared = 0 then 0
          else greatest(0, least(1, -((x1 * dx) + (y1 * dy)) / length_squared))
        end;
        distance_meters := sqrt(
          power(x1 + progress * dx, 2) + power(y1 + progress * dy, 2)
        );
        nearest := least(nearest, distance_meters);
      end loop;
    end if;
  end loop;

  return nearest;
end;
$$;

with calculated as (
  select
    project.id,
    coalesce(
      (
        select string_agg(nearest.name, ' · ' order by nearest.distance_meters)
        from (
          select
            route.name,
            private.migration_route_distance_meters(
              project.latitude,
              project.longitude,
              route.geometry
            ) as distance_meters
          from public.transit_routes as route
          where route.is_published is true
            and private.migration_route_distance_meters(
              project.latitude,
              project.longitude,
              route.geometry
            ) <= 804.672
          order by distance_meters, route.name
          limit 2
        ) as nearest
      ),
      'No high-capacity route within ½ mile'
    ) as route_access
  from public.projects as project
)
update public.projects as project
set transit = calculated.route_access
from calculated
where project.id = calculated.id
  and project.transit_route_overrides is null
  and project.transit is distinct from calculated.route_access;

drop function private.migration_route_distance_meters(
  double precision,
  double precision,
  jsonb
);

commit;
