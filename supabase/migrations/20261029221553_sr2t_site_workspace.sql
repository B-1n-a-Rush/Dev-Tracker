create table public.sr2t_sites (
 site_id text primary key check(site_id ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$'),
 profile jsonb not null check(jsonb_typeof(profile)='object' and octet_length(profile::text)<=262144 and coalesce(length(btrim(profile->>'name')),0) between 1 and 250),
 is_published boolean not null default false,
 version integer not null default 1 check(version>0),
 updated_at timestamptz not null default now()
);
create table public.sr2t_site_notes (
 site_id text primary key references public.sr2t_sites(site_id),
 notes jsonb not null default '{}'::jsonb check(jsonb_typeof(notes)='object' and octet_length(notes::text)<=40000)
);
create table public.sr2t_site_history (
 id bigint generated always as identity primary key,
 site_id text not null references public.sr2t_sites(site_id),
 changed_at timestamptz not null default now(),
 changed_by uuid,
 before_record jsonb,
 after_record jsonb not null
);
create index sr2t_history_site_time on public.sr2t_site_history(site_id,changed_at desc);
create index sr2t_history_actor on public.sr2t_site_history(changed_by);
alter table public.sr2t_sites enable row level security;
alter table public.sr2t_site_notes enable row level security;
alter table public.sr2t_site_history enable row level security;
revoke all on public.sr2t_sites,public.sr2t_site_notes,public.sr2t_site_history from public,anon,authenticated;
grant select on public.sr2t_sites to anon,authenticated;
grant insert,update on public.sr2t_sites,public.sr2t_site_notes to authenticated;
grant select on public.sr2t_site_notes,public.sr2t_site_history to authenticated;
grant all on public.sr2t_sites,public.sr2t_site_notes,public.sr2t_site_history to service_role;
create policy sr2t_public_sites on public.sr2t_sites for select to anon,authenticated using(is_published);
create policy sr2t_admin_sites_read on public.sr2t_sites for select to authenticated using((select private.is_tracker_admin()));
create policy sr2t_admin_sites_insert on public.sr2t_sites for insert to authenticated with check((select private.is_tracker_admin()));
create policy sr2t_admin_sites_update on public.sr2t_sites for update to authenticated using((select private.is_tracker_admin())) with check((select private.is_tracker_admin()));
create policy sr2t_admin_notes_read on public.sr2t_site_notes for select to authenticated using((select private.is_tracker_admin()));
create policy sr2t_admin_notes_insert on public.sr2t_site_notes for insert to authenticated with check((select private.is_tracker_admin()));
create policy sr2t_admin_notes_update on public.sr2t_site_notes for update to authenticated using((select private.is_tracker_admin())) with check((select private.is_tracker_admin()));
create policy sr2t_admin_history_read on public.sr2t_site_history for select to authenticated using((select private.is_tracker_admin()));

create function private.audit_sr2t_site() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if not (select private.is_tracker_admin()) then raise insufficient_privilege using message='Tracker administrator access required'; end if;
 insert into public.sr2t_site_history(site_id,changed_by,before_record,after_record) values(new.site_id,(select auth.uid()),case when tg_op='UPDATE' then to_jsonb(old) else null end,to_jsonb(new));
 return new;
end;$$;
-- Audit after the site exists, and set version/timestamp before the update.
create function private.version_sr2t_site() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if tg_op='UPDATE' then new.version=old.version+1;else new.version=1;end if;
 new.updated_at=clock_timestamp();return new;
end;$$;
create trigger sr2t_version before insert or update on public.sr2t_sites for each row execute function private.version_sr2t_site();
create trigger sr2t_audit after insert or update on public.sr2t_sites for each row execute function private.audit_sr2t_site();
revoke all on function private.audit_sr2t_site(),private.version_sr2t_site() from public,anon,authenticated;

create function public.save_sr2t_site(p_site_id text,p_profile jsonb,p_is_published boolean,p_baseline_version integer,p_notes jsonb default null)
returns public.sr2t_sites language plpgsql security invoker set search_path='' as $$
declare prior public.sr2t_sites; saved public.sr2t_sites; s jsonb; n public.local_bus_network_versions; source_stop jsonb; clean_stops jsonb='[]'::jsonb; item jsonb; v text;
begin
 if not (select private.is_tracker_admin()) then raise insufficient_privilege using message='Tracker administrator access required';end if;
 if p_site_id is null or p_site_id !~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$' or jsonb_typeof(p_profile) is distinct from 'object' or octet_length(p_profile::text)>262144 then raise exception 'Invalid SR2T site';end if;
 if coalesce(length(btrim(p_profile->>'name')),0) not between 1 and 250 or coalesce(p_profile->>'status','') not in ('Unknown','Planning','Construction','Complete') then raise exception 'Name and a valid status are required';end if;
 if jsonb_typeof(p_profile->'stops') is distinct from 'array' or jsonb_array_length(p_profile->'stops')>50 then raise exception 'Up to 50 stop links are supported per site';end if;
 if (select count(distinct x->>'number') from jsonb_array_elements(p_profile->'stops') x)<>jsonb_array_length(p_profile->'stops') then raise exception 'Duplicate stop numbers in site';end if;
 for s in select value from jsonb_array_elements(p_profile->'stops') loop
  if coalesce(s->>'number','') !~ '^[A-Za-z0-9_-]{1,40}$' or coalesce(s->>'match_status','') not in ('unmatched','needs_review','matched') then raise exception 'Invalid stop number or match status';end if;
  if s->>'match_status'='matched' then
   if coalesce(length(btrim(s->>'review_note')),0)<8 then raise exception 'Confirmed matches require a review note identifying the plan/reference checked';end if;
   select * into n from public.local_bus_network_versions where fingerprint=s->>'network_fingerprint' and is_active;
   if not found then raise exception 'Matched stop network changed. Reload stops and review the match.';end if;
   select value into source_stop from jsonb_array_elements(n.data->'stops') where value->>'stop_id'=s->>'stop_id';
   if source_stop is null then raise exception 'Matched stop is missing from the network';end if;
   s=s||jsonb_build_object('stop_name',source_stop->>'stop_name','coordinates',source_stop#>'{geometry,coordinates}','network_key',n.network_key);
  else s=s-'coordinates';end if;
  clean_stops=clean_stops||jsonb_build_array(s);
 end loop;
 if p_is_published and (jsonb_array_length(clean_stops)=0 or exists(select 1 from jsonb_array_elements(clean_stops) x where x->>'match_status'<>'matched')) then raise exception 'Confirm every stop link before publishing. Unresolved links can be saved in a draft.';end if;
 if jsonb_typeof(p_profile->'improvements') is distinct from 'array' or jsonb_array_length(p_profile->'improvements')>40 then raise exception 'Invalid improvements';end if;
 for item in select value from jsonb_array_elements(p_profile->'improvements') loop
  if coalesce(length(item->>'type'),0) not between 1 and 100 or coalesce(item->>'state','') not in ('Planned','In progress','Delivered','Field verified') then raise exception 'Invalid improvement type or state';end if;
 end loop;
 for v in select p_profile->>k from unnest(array['start_date','finish_date','verified_date']) k loop
  if coalesce(v,'')<>'' then
   if v !~ '^\d{4}(-\d{2})?(-\d{2})?$' then raise exception 'Use YYYY, YYYY-MM or YYYY-MM-DD';end if;
   perform (case length(v) when 4 then v||'-01-01' when 7 then v||'-01' else v end)::date;
  end if;
 end loop;
 if coalesce(p_profile->>'start_date','')<>'' and coalesce(p_profile->>'finish_date','')<>'' and (case length(p_profile->>'start_date') when 4 then (p_profile->>'start_date')||'-01-01' when 7 then (p_profile->>'start_date')||'-01' else p_profile->>'start_date' end)::date > (case length(p_profile->>'finish_date') when 4 then (p_profile->>'finish_date')||'-12-31' when 7 then (date_trunc('month',((p_profile->>'finish_date')||'-01')::date)+interval '1 month - 1 day')::date::text else p_profile->>'finish_date' end)::date then raise exception 'Finish must not precede start';end if;
 if jsonb_typeof(p_profile->'documents') is distinct from 'array' or jsonb_array_length(p_profile->'documents')>30 then raise exception 'Invalid document links';end if;
 for item in select value from jsonb_array_elements(p_profile->'documents') loop
  if coalesce(item->>'url','') !~* '^https?://' or coalesce(item->>'kind','') not in ('Document','Photo') then raise exception 'Documents and photos need http(s) URLs';end if;
 end loop;
 if coalesce(p_profile->>'source_url','')<>'' and p_profile->>'source_url' !~* '^https?://' then raise exception 'Source link needs an http(s) URL';end if;
 if p_notes is not null and (jsonb_typeof(p_notes)<>'object' or octet_length(p_notes::text)>40000) then raise exception 'Staff notes are too large';end if;
 select * into prior from public.sr2t_sites where site_id=p_site_id for update;
 if found then
  if p_baseline_version is null or prior.version<>p_baseline_version then raise exception 'This site changed since it was opened. Reload before saving; your draft is retained.';end if;
  update public.sr2t_sites set profile=p_profile||jsonb_build_object('stops',clean_stops),is_published=p_is_published where site_id=p_site_id returning * into saved;
 else
  if p_baseline_version is not null then raise exception 'Site no longer available';end if;
  insert into public.sr2t_sites(site_id,profile,is_published) values(p_site_id,p_profile||jsonb_build_object('stops',clean_stops),p_is_published) returning * into saved;
 end if;
 if p_notes is not null then insert into public.sr2t_site_notes(site_id,notes) values(p_site_id,p_notes) on conflict(site_id) do update set notes=excluded.notes;end if;
 return saved;
end;$$;
revoke all on function public.save_sr2t_site(text,jsonb,boolean,integer,jsonb) from public,anon;
grant execute on function public.save_sr2t_site(text,jsonb,boolean,integer,jsonb) to authenticated;
notify pgrst,'reload schema';
