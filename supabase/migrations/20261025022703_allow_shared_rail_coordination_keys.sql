alter table public.infrastructure_coordination_reviews drop constraint coordination_route_key_matches;
alter table public.infrastructure_coordination_reviews add constraint coordination_route_key_matches check((route_id is not null and route_key='rapid:'||route_id::text) or (route_id is null and route_key in ('rail:red','rail:gold','rail:red-gold','rail:blue','rail:green','rail:blue-green')));
