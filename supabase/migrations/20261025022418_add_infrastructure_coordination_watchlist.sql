-- Additive coordination records; no edits to projects, routes, geometry or existing policies.
create table public.route_construction_schedules (
 route_id bigint primary key references public.transit_routes(id) on delete cascade,
 construction_start text check (construction_start is null or construction_start ~ '^[12][0-9]{3}(-[0-9]{2})?(-[0-9]{2})?$'),
 start_label text not null default 'Not currently published' check(length(start_label)<=240),
 construction_finish text check (construction_finish is null or construction_finish ~ '^[12][0-9]{3}(-[0-9]{2})?(-[0-9]{2})?$'),
 finish_label text not null default 'Not currently published' check(length(finish_label)<=240),
 phase text not null default 'Not published' check(length(phase)<=240),
 source_url text not null check(source_url ~ '^https?://' and length(source_url)<=2400),
 source_title text not null check(length(source_title) between 1 and 400),
 source_published_at date,
 checked_at date not null default current_date,
 evidence text not null default '' check(length(evidence)<=5000),
 notes text not null default '' check(length(notes)<=5000),
 additional_sources jsonb not null default '[]' check(jsonb_typeof(additional_sources)='array' and pg_column_size(additional_sources)<=20000),
 updated_at timestamptz not null default clock_timestamp(),
 updated_by uuid references auth.users(id) on delete set null
);
create index route_construction_schedules_editor_idx on public.route_construction_schedules(updated_by);
alter table public.route_construction_schedules enable row level security;
revoke all on public.route_construction_schedules from public, anon, authenticated;
grant select on public.route_construction_schedules to anon, authenticated;
grant insert, update on public.route_construction_schedules to authenticated;
grant all on public.route_construction_schedules to service_role;
create policy published_route_schedules_anon on public.route_construction_schedules for select to anon
 using(exists(select 1 from public.transit_routes r where r.id=route_id and r.is_published));
create policy route_schedules_authenticated on public.route_construction_schedules for select to authenticated
 using((select private.is_tracker_admin()) or exists(select 1 from public.transit_routes r where r.id=route_id and r.is_published));
create policy admins_insert_route_schedules on public.route_construction_schedules for insert to authenticated
 with check((select private.is_tracker_admin()));
create policy admins_update_route_schedules on public.route_construction_schedules for update to authenticated
 using((select private.is_tracker_admin())) with check((select private.is_tracker_admin()));

create table public.infrastructure_coordination_reviews (
 route_key text not null check(length(route_key) between 1 and 160),
 route_id bigint references public.transit_routes(id) on delete cascade,
 infrastructure_id text not null check(length(infrastructure_id) between 1 and 240),
 project_name text not null check(length(project_name) between 1 and 1000),
 source_url text not null default '' check(source_url='' or (source_url ~ '^https?://' and length(source_url)<=2400)),
 status text not null default 'unreviewed' check(status in ('unreviewed','needs-contact','in-discussion','coordinated','no-action')),
 assigned_to text not null default '' check(length(assigned_to)<=240),
 contact text not null default '' check(length(contact)<=1000),
 next_action text not null default '' check(length(next_action)<=2000),
 due_date date,
 notes text not null default '' check(length(notes)<=10000),
 updated_at timestamptz not null default clock_timestamp(),
 updated_by uuid references auth.users(id) on delete set null,
 primary key(route_key,infrastructure_id),
 constraint coordination_route_key_matches check((route_id is not null and route_key='rapid:'||route_id::text) or (route_id is null and route_key in ('rail:red','rail:gold','rail:blue','rail:green')))
);
create index infrastructure_coordination_reviews_route_idx on public.infrastructure_coordination_reviews(route_id);
create index infrastructure_coordination_reviews_editor_idx on public.infrastructure_coordination_reviews(updated_by);
alter table public.infrastructure_coordination_reviews enable row level security;
revoke all on public.infrastructure_coordination_reviews from public, anon, authenticated;
grant select,insert,update on public.infrastructure_coordination_reviews to authenticated;
grant all on public.infrastructure_coordination_reviews to service_role;
create policy tracker_admins_read_coordination on public.infrastructure_coordination_reviews for select to authenticated using((select private.is_tracker_admin()));
create policy tracker_admins_insert_coordination on public.infrastructure_coordination_reviews for insert to authenticated with check((select private.is_tracker_admin()));
create policy tracker_admins_update_coordination on public.infrastructure_coordination_reviews for update to authenticated using((select private.is_tracker_admin())) with check((select private.is_tracker_admin()));

create function private.stamp_coordination_edit() returns trigger language plpgsql security invoker set search_path='' as $$
begin new.updated_at=clock_timestamp();new.updated_by=(select auth.uid());return new;end;
$$;
revoke all on function private.stamp_coordination_edit() from public,anon,authenticated;
create trigger stamp_route_schedule_edit before insert or update on public.route_construction_schedules for each row execute function private.stamp_coordination_edit();
create trigger stamp_coordination_review_edit before insert or update on public.infrastructure_coordination_reviews for each row execute function private.stamp_coordination_edit();

