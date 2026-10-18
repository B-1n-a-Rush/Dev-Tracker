begin;

alter table public.transit_routes
  drop constraint if exists transit_routes_mode_check;

alter table public.transit_routes
  add constraint transit_routes_mode_check
  check (mode in ('BRT', 'ART', 'LRT'));

commit;

