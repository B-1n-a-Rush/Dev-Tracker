begin;

alter table public.projects
  add column if not exists transit_route_overrides text[];

alter table public.projects
  drop constraint if exists projects_transit_route_overrides_max_two;

alter table public.projects
  add constraint projects_transit_route_overrides_max_two
  check (
    transit_route_overrides is null
    or cardinality(transit_route_overrides) <= 2
  );

comment on column public.projects.transit_route_overrides is
  'Null uses automatic BRT/ART/LRT proximity matching. A non-null array is an administrator-selected override containing at most two published route names.';

comment on column public.projects.transit is
  'Compatibility display value for nearby high-capacity route names. Station proximity is stored separately in area and location.';

commit;
