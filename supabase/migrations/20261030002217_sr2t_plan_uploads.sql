insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('sr2t-site-plans','sr2t-site-plans',false,20971520,array['application/pdf']);
create policy sr2t_plans_staff_read on storage.objects for select to authenticated using(bucket_id='sr2t-site-plans' and (select private.is_tracker_admin()));
create policy sr2t_plans_staff_insert on storage.objects for insert to authenticated with check(bucket_id='sr2t-site-plans' and (select private.is_tracker_admin()) and name ~ '^[0-9a-f-]{36}/[A-Za-z0-9][A-Za-z0-9_-]{0,79}/[0-9a-f-]{36}\.pdf$' and split_part(name,'/',1)=(select auth.uid())::text);
create policy sr2t_plans_published_read on storage.objects for select to anon,authenticated using(bucket_id='sr2t-site-plans' and exists(select 1 from public.sr2t_sites s cross join lateral jsonb_array_elements(s.profile->'documents') d where s.is_published and d->>'storage_path'=objects.name and d->'is_public'='true'::jsonb));
-- Immutable objects: replacement uploads get new paths. No client update/delete grants.
create function private.validate_sr2t_plan_documents() returns trigger language plpgsql security invoker set search_path='' as $$
declare d jsonb; obj storage.objects; paths text[]='{}';
begin
 if jsonb_typeof(new.profile->'documents') is distinct from 'array' or jsonb_array_length(new.profile->'documents')>30 then raise exception 'Up to 30 documents per site';end if;
 for d in select value from jsonb_array_elements(new.profile->'documents') loop
  if d ? 'storage_path' then
   if jsonb_typeof(d->'storage_path') is distinct from 'string' or d->>'storage_path' !~ '^[0-9a-f-]{36}/[A-Za-z0-9][A-Za-z0-9_-]{0,79}/[0-9a-f-]{36}\.pdf$' or split_part(d->>'storage_path','/',2)<>new.site_id or coalesce(d->>'kind','')<>'Document' or coalesce(d->>'content_type','')<>'application/pdf' or jsonb_typeof(d->'is_public') is distinct from 'boolean' or coalesce(d->>'size','') !~ '^[0-9]+$' or (d->>'size')::numeric not between 1 and 20971520 or coalesce(length(btrim(d->>'filename')),0) not between 1 and 250 or coalesce(length(d->>'title'),0)>250 then raise exception 'Invalid uploaded plan details';end if;
   if d->>'storage_path'=any(paths) then raise exception 'Duplicate uploaded plan';end if;paths=array_append(paths,d->>'storage_path');
   select * into obj from storage.objects where bucket_id='sr2t-site-plans' and name=d->>'storage_path';
   if not found then raise exception 'Upload the plan before saving its reference';end if;
   if coalesce(obj.metadata->>'mimetype','')<>'application/pdf' or coalesce(obj.metadata->>'size','') !~ '^[0-9]+$' or (obj.metadata->>'size')::numeric<>(d->>'size')::numeric then raise exception 'Plan size or content type differs from the uploaded object';end if;
  elsif coalesce(d->>'url','') !~* '^https?://' or coalesce(d->>'kind','') not in ('Document','Photo') then raise exception 'Documents need an upload or http(s) URL';end if;
 end loop;return new;
end;$$;
revoke all on function private.validate_sr2t_plan_documents() from public,anon,authenticated;
create trigger sr2t_plan_documents before insert or update on public.sr2t_sites for each row execute function private.validate_sr2t_plan_documents();
create or replace function public.save_sr2t_site(p_site_id text,p_profile jsonb,p_is_published boolean,p_baseline_version integer,p_notes jsonb default null)
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
   if v !~ '^[0-9]{4}(-[0-9]{2})?(-[0-9]{2})?$' then raise exception 'Use YYYY, YYYY-MM or YYYY-MM-DD';end if;
   perform (case length(v) when 4 then v||'-01-01' when 7 then v||'-01' else v end)::date;
  end if;
 end loop;
 if coalesce(p_profile->>'start_date','')<>'' and coalesce(p_profile->>'finish_date','')<>'' and (case length(p_profile->>'start_date') when 4 then (p_profile->>'start_date')||'-01-01' when 7 then (p_profile->>'start_date')||'-01' else p_profile->>'start_date' end)::date > (case length(p_profile->>'finish_date') when 4 then (p_profile->>'finish_date')||'-12-31' when 7 then (date_trunc('month',((p_profile->>'finish_date')||'-01')::date)+interval '1 month - 1 day')::date::text else p_profile->>'finish_date' end)::date then raise exception 'Finish must not precede start';end if;
 if jsonb_typeof(p_profile->'documents') is distinct from 'array' or jsonb_array_length(p_profile->'documents')>30 then raise exception 'Invalid document links';end if;
 for item in select value from jsonb_array_elements(p_profile->'documents') loop
  if coalesce(item->>'storage_path','')='' and (coalesce(item->>'url','') !~* '^https?://' or coalesce(item->>'kind','') not in ('Document','Photo')) then raise exception 'Documents and photos need an upload or http(s) URL';end if;
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

notify pgrst,'reload schema';
