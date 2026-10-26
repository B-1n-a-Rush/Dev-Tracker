-- Additive local service network and impact coordination. No development / rapid-route edits.
create table public.local_bus_network_versions (
 fingerprint text primary key check(fingerprint ~ '^[0-9a-f]{64}$'),
 network_key text not null check(network_key ~ '^remix:[A-Za-z0-9_-]+$'),
 map_name text not null check(length(map_name) between 1 and 255),
 source_filename text not null check(length(source_filename) between 1 and 500),
 archive_sha256 text not null check(archive_sha256 ~ '^[0-9a-f]{64}$'),
 imported_at timestamptz not null default clock_timestamp(),
 imported_by uuid default auth.uid() references auth.users(id) on delete set null,
 effective_date date,
 verification_status text not null default 'unverified' check(verification_status in ('unverified','confirmed')),
 verification_note text not null default '' check(length(verification_note)<=4000),
 mode_overrides jsonb not null default '{}' check(jsonb_typeof(mode_overrides)='object' and pg_column_size(mode_overrides)<200000),
 counts jsonb not null,
 data jsonb not null check(jsonb_typeof(data)='object' and pg_column_size(data)<25000000),
 is_active boolean not null default false,
 updated_at timestamptz not null default clock_timestamp(),
 check(verification_status='unverified' or length(trim(verification_note))>0)
);
create unique index local_bus_one_active_network on public.local_bus_network_versions(is_active) where is_active;
create index local_bus_network_history on public.local_bus_network_versions(network_key,imported_at desc);
create index local_bus_network_importer on public.local_bus_network_versions(imported_by);
alter table public.local_bus_network_versions enable row level security;
revoke all on public.local_bus_network_versions from public,anon,authenticated;
grant select on public.local_bus_network_versions to anon,authenticated;
grant insert on public.local_bus_network_versions to authenticated;
grant update(is_active,effective_date,verification_status,verification_note,mode_overrides,updated_at) on public.local_bus_network_versions to authenticated;
grant all on public.local_bus_network_versions to service_role;
create policy read_service_network_versions on public.local_bus_network_versions for select to anon,authenticated using(true);
create policy admins_import_service_network on public.local_bus_network_versions for insert to authenticated with check((select private.is_tracker_admin()));
create policy admins_update_service_network on public.local_bus_network_versions for update to authenticated using((select private.is_tracker_admin())) with check((select private.is_tracker_admin()));

create function public.import_local_bus_network(p_fingerprint text,p_archive_sha256 text,p_source_filename text,p_data jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare prior public.local_bus_network_versions; counts jsonb; r integer; d integer; s integer; k integer; item jsonb; part jsonb; point jsonb;
begin
 if not (select private.is_tracker_admin()) then raise insufficient_privilege using message='Tracker administrator access required';end if;
 if p_data is null or p_fingerprint is null or p_archive_sha256 is null or p_fingerprint !~ '^[0-9a-f]{64}$' or p_archive_sha256 !~ '^[0-9a-f]{64}$' or pg_column_size(p_data)>25000000 or p_data->>'schema' is distinct from '1' then raise exception 'Invalid network payload';end if;
 if jsonb_typeof(p_data->'routes') is distinct from 'array' or jsonb_typeof(p_data->'directions') is distinct from 'array' or jsonb_typeof(p_data->'stops') is distinct from 'array' or jsonb_typeof(p_data->'relationships') is distinct from 'array' then raise exception 'Network arrays are required';end if;
 r=jsonb_array_length(p_data->'routes');d=jsonb_array_length(p_data->'directions');s=jsonb_array_length(p_data->'stops');k=jsonb_array_length(p_data->'relationships');
 if r<1 or r>1000 or d<1 or d>5000 or s<1 or s>50000 or k>200000 then raise exception 'Network counts exceed supported limits';end if;
 if (select count(distinct x->>'line_id') from jsonb_array_elements(p_data->'routes') x)<>r or (select count(distinct x->>'dir_id') from jsonb_array_elements(p_data->'directions') x)<>d or (select count(distinct x->>'stop_id') from jsonb_array_elements(p_data->'stops') x)<>s or (select count(distinct x->>'record_id') from jsonb_array_elements(p_data->'relationships') x)<>k then raise exception 'Duplicate or missing network identifiers';end if;
 if exists(select 1 from jsonb_array_elements(p_data->'routes') x where coalesce(x->>'line_id','') !~ '^[A-Za-z0-9_-]+$' or coalesce(x->>'line_name','')='' or coalesce(x->>'line_color','') !~ '^#[0-9a-fA-F]{6}$') then raise exception 'Invalid route identifier, full name or color';end if;
 for item in select value from jsonb_array_elements(p_data->'directions') loop
  if item#>>'{geometry,type}' is distinct from 'MultiLineString' or jsonb_typeof(item#>'{geometry,coordinates}') is distinct from 'array' or coalesce(item->>'dir_id','')='' or coalesce(jsonb_typeof(item->'properties'),'')<>'object' then raise exception 'Invalid direction geometry or attributes';end if;
  if jsonb_array_length(item#>'{geometry,coordinates}')=0 then raise exception 'Empty direction geometry';end if;
  for part in select value from jsonb_array_elements(item#>'{geometry,coordinates}') loop
   if jsonb_typeof(part)<>'array' then raise exception 'Invalid line part';end if;
   if jsonb_array_length(part)<2 then raise exception 'Line part needs at least two points';end if;
   for point in select value from jsonb_array_elements(part) loop
    if jsonb_typeof(point)<>'array' or jsonb_typeof(point->0) is distinct from 'number' or jsonb_typeof(point->1) is distinct from 'number' then raise exception 'Invalid coordinate';end if;
    if jsonb_array_length(point)<>2 or (point->>0)::numeric not between -180 and 180 or (point->>1)::numeric not between -90 and 90 then raise exception 'Coordinates must be WGS84 longitude/latitude';end if;
   end loop;
  end loop;
 end loop;
 for item in select value from jsonb_array_elements(p_data->'stops') loop
  point=item#>'{geometry,coordinates}';
  if item#>>'{geometry,type}' is distinct from 'Point' or jsonb_typeof(point) is distinct from 'array' or jsonb_typeof(point->0) is distinct from 'number' or jsonb_typeof(point->1) is distinct from 'number' then raise exception 'Invalid stop geometry';end if;
  if jsonb_array_length(point)<>2 or (point->>0)::numeric not between -180 and 180 or (point->>1)::numeric not between -90 and 90 then raise exception 'Stop coordinates must be WGS84 longitude/latitude';end if;
 end loop;
 if exists(select 1 from jsonb_array_elements(p_data->'relationships') x where jsonb_typeof(x->'distfeet') is distinct from 'number' or coalesce(x->>'record_id','')='') then raise exception 'Invalid relationship attributes';end if;
 if exists(select 1 from jsonb_array_elements(p_data->'relationships') x where (x->>'distfeet')::numeric<0) then raise exception 'Invalid relationship distance';end if;
 if exists(select 1 from jsonb_array_elements(p_data->'directions') x where not exists(select 1 from jsonb_array_elements(p_data->'routes') y where y->>'line_id'=x->>'line_id') or x#>>'{geometry,type}'<>'MultiLineString') then raise exception 'Direction has invalid geometry or no parent route';end if;
 if exists(with dirs as (select x->>'dir_id' id from jsonb_array_elements(p_data->'directions') x),stops as (select x->>'stop_id' id from jsonb_array_elements(p_data->'stops') x),rels as (select x->>'dir_id' dir_id,x->>'stop_id' stop_id from jsonb_array_elements(p_data->'relationships') x) select 1 from rels r left join dirs d on d.id=r.dir_id left join stops s on s.id=r.stop_id where d.id is null or s.id is null) then raise exception 'Relationship endpoint is missing';end if;
 counts=jsonb_build_object('routes',r,'directions',d,'stops',s,'relationships',k,'repeatVisits',k-(select count(distinct (x->>'dir_id',x->>'stop_id')) from jsonb_array_elements(p_data->'relationships') x));
 perform pg_advisory_xact_lock(91534027);
 select * into prior from public.local_bus_network_versions where fingerprint=p_fingerprint;
 if found then
  if prior.data<>p_data then raise exception 'Fingerprint collision / payload changed';end if;
  update public.local_bus_network_versions set is_active=false,updated_at=clock_timestamp() where is_active and fingerprint<>p_fingerprint;
  update public.local_bus_network_versions set is_active=true,updated_at=clock_timestamp() where fingerprint=p_fingerprint and not is_active;
  update public.local_bus_impact_findings set applicable=false where network_key=p_data->>'network_key' and network_fingerprint<>p_fingerprint and applicable;
  return jsonb_build_object('fingerprint',p_fingerprint,'reused',true,'counts',counts);
 end if;
 update public.local_bus_network_versions set is_active=false,updated_at=clock_timestamp() where is_active;
 insert into public.local_bus_network_versions(fingerprint,network_key,map_name,source_filename,archive_sha256,counts,data,is_active)
 values(p_fingerprint,p_data->>'network_key',p_data->>'map_name',p_source_filename,p_archive_sha256,counts,p_data,true);
 update public.local_bus_impact_findings set applicable=false where network_key=p_data->>'network_key' and network_fingerprint<>p_fingerprint and applicable;
 return jsonb_build_object('fingerprint',p_fingerprint,'reused',false,'counts',counts);
end;$$;
revoke all on function public.import_local_bus_network(text,text,text,jsonb) from public,anon;
grant execute on function public.import_local_bus_network(text,text,text,jsonb) to authenticated,service_role;

create table public.local_bus_impact_findings (
 network_key text not null,
 line_id text not null,
 infrastructure_id text not null,
 network_fingerprint text not null references public.local_bus_network_versions(fingerprint),
 match_fingerprint text not null check(match_fingerprint ~ '^[0-9a-f]{16,64}$'),
 snapshot jsonb not null check(jsonb_typeof(snapshot)='object' and pg_column_size(snapshot)<2000000),
 applicable boolean not null default true,
 first_seen_at timestamptz not null default clock_timestamp(),
 last_checked_at timestamptz not null default clock_timestamp(),
 primary key(network_key,line_id,infrastructure_id)
);
create index local_bus_findings_version on public.local_bus_impact_findings(network_fingerprint);
alter table public.local_bus_impact_findings enable row level security;
revoke all on public.local_bus_impact_findings from public,anon,authenticated;
grant select,insert,update on public.local_bus_impact_findings to authenticated;
grant all on public.local_bus_impact_findings to service_role;
create policy admins_read_bus_findings on public.local_bus_impact_findings for select to authenticated using((select private.is_tracker_admin()));
create policy admins_insert_bus_findings on public.local_bus_impact_findings for insert to authenticated with check((select private.is_tracker_admin()));
create policy admins_update_bus_findings on public.local_bus_impact_findings for update to authenticated using((select private.is_tracker_admin())) with check((select private.is_tracker_admin()));

create function public.sync_local_bus_findings(p_network_fingerprint text,p_line_id text,p_findings jsonb,p_complete boolean default false) returns integer language plpgsql security invoker set search_path='' as $$
declare net public.local_bus_network_versions; n integer;
begin
 if not (select private.is_tracker_admin()) then raise insufficient_privilege using message='Tracker administrator access required';end if;
 select * into net from public.local_bus_network_versions where fingerprint=p_network_fingerprint and is_active for share;
 if not found then raise exception 'Network changed. Reload before saving screening results.' using errcode='40001';end if;
 if not exists(select 1 from jsonb_array_elements(net.data->'routes') r where r->>'line_id'=p_line_id) then raise exception 'Unknown route';end if;
 if jsonb_typeof(p_findings)<>'array' or jsonb_array_length(p_findings)>10000 or pg_column_size(p_findings)>25000000 then raise exception 'Invalid screening payload';end if;
 if exists(select 1 from jsonb_array_elements(p_findings) f where f->>'line_id' is distinct from p_line_id or f->>'network_key' is distinct from net.network_key or nullif(f->>'project_id','') is null or f->>'match_fingerprint' !~ '^[0-9a-f]{16,64}$') then raise exception 'Invalid finding identity';end if;
 if p_complete then update public.local_bus_impact_findings set applicable=false,last_checked_at=clock_timestamp() where network_key=net.network_key and line_id=p_line_id and applicable;end if;
 insert into public.local_bus_impact_findings(network_key,line_id,infrastructure_id,network_fingerprint,match_fingerprint,snapshot)
 select net.network_key,p_line_id,f->>'project_id',p_network_fingerprint,f->>'match_fingerprint',f from jsonb_array_elements(p_findings) f
 on conflict(network_key,line_id,infrastructure_id) do update set network_fingerprint=excluded.network_fingerprint,match_fingerprint=excluded.match_fingerprint,snapshot=excluded.snapshot,applicable=true,last_checked_at=clock_timestamp();
 get diagnostics n=row_count;return n;
end;$$;
revoke all on function public.sync_local_bus_findings(text,text,jsonb,boolean) from public,anon;
grant execute on function public.sync_local_bus_findings(text,text,jsonb,boolean) to authenticated,service_role;

alter table public.infrastructure_coordination_reviews drop constraint coordination_route_key_matches;
alter table public.infrastructure_coordination_reviews add constraint coordination_route_key_matches check(
 (route_id is not null and route_key='rapid:'||route_id::text) or
 (route_id is null and (route_key in ('rail:red','rail:gold','rail:red-gold','rail:blue','rail:green','rail:blue-green') or route_key ~ '^bus:remix:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+$'))
);
alter table public.infrastructure_coordination_reviews add column bus_decision text not null default 'potential' check(bus_decision in ('potential','confirmed','dismissed'));
alter table public.infrastructure_coordination_reviews add column bus_concerns text[] not null default '{}' check(bus_concerns <@ array['detour','stop-relocation','delays','passenger-access','other']);
alter table public.infrastructure_coordination_reviews add column bus_resolution text not null default '' check(length(bus_resolution)<=5000);
alter table public.infrastructure_coordination_reviews add column reviewed_match_fingerprint text check(reviewed_match_fingerprint ~ '^[0-9a-f]{16,64}$');
alter table public.infrastructure_coordination_reviews add column reviewed_network_fingerprint text references public.local_bus_network_versions(fingerprint);
alter table public.infrastructure_coordination_reviews add column bus_match_snapshot jsonb check(bus_match_snapshot is null or (jsonb_typeof(bus_match_snapshot)='object' and pg_column_size(bus_match_snapshot)<2000000));
create index bus_review_network_checkpoint on public.infrastructure_coordination_reviews(reviewed_network_fingerprint);
alter table public.infrastructure_coordination_reviews add constraint bus_decisions_require_reason check(route_key !~ '^bus:' or (bus_decision='potential' or length(trim(bus_resolution))>0));
alter table public.infrastructure_coordination_reviews add constraint bus_resolution_requires_reason check(route_key !~ '^bus:' or status not in ('coordinated','no-action') or length(trim(bus_resolution))>0);

create function private.validate_bus_review_checkpoint() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.route_key ~ '^bus:' then
  if not exists(select 1 from public.local_bus_impact_findings f join public.local_bus_network_versions v on v.fingerprint=f.network_fingerprint where v.is_active and f.applicable and new.route_key='bus:'||f.network_key||':'||f.line_id and f.infrastructure_id=new.infrastructure_id and f.match_fingerprint=new.reviewed_match_fingerprint and f.network_fingerprint=new.reviewed_network_fingerprint) then raise exception 'Finding changed or is no longer current. Refresh and review it before saving.' using errcode='40001';end if;
 end if;return new;
end;$$;
revoke all on function private.validate_bus_review_checkpoint() from public,anon,authenticated;
create trigger validate_bus_review_checkpoint before insert or update on public.infrastructure_coordination_reviews for each row execute function private.validate_bus_review_checkpoint();
