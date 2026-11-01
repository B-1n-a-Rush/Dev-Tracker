create table public.sr2t_field_visits(
 visit_id uuid primary key,
 site_id text not null references public.sr2t_sites(site_id),
 data jsonb not null,
 version integer not null default 1,
 created_by uuid not null,
 updated_by uuid not null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index sr2t_field_visits_site_date on public.sr2t_field_visits(site_id,(data->>'visited_on') desc,visit_id);
create index sr2t_field_visits_created_by on public.sr2t_field_visits(created_by);
create index sr2t_field_visits_updated_by on public.sr2t_field_visits(updated_by);
create table public.sr2t_field_history(
 id bigint generated always as identity primary key,
 visit_id uuid not null references public.sr2t_field_visits(visit_id),
 changed_at timestamptz not null default now(),changed_by uuid not null,
 before_record jsonb,after_record jsonb not null
);
create index sr2t_field_history_visit_time on public.sr2t_field_history(visit_id,changed_at desc);
create index sr2t_field_history_changed_by on public.sr2t_field_history(changed_by);
alter table public.sr2t_field_visits enable row level security;
alter table public.sr2t_field_history enable row level security;
revoke all on public.sr2t_field_visits,public.sr2t_field_history from public,anon,authenticated;
grant select,insert,update on public.sr2t_field_visits to authenticated;
grant select on public.sr2t_field_history to authenticated;
grant all on public.sr2t_field_visits,public.sr2t_field_history to service_role;
create policy sr2t_field_read on public.sr2t_field_visits for select to authenticated using((select private.is_tracker_admin()));
create policy sr2t_field_insert on public.sr2t_field_visits for insert to authenticated with check((select private.is_tracker_admin()));
create policy sr2t_field_update on public.sr2t_field_visits for update to authenticated using((select private.is_tracker_admin())) with check((select private.is_tracker_admin()));
create policy sr2t_field_history_read on public.sr2t_field_history for select to authenticated using((select private.is_tracker_admin()));
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('sr2t-field-photos','sr2t-field-photos',false,5242880,array['image/jpeg']);
create policy sr2t_field_photo_read on storage.objects for select to authenticated using(bucket_id='sr2t-field-photos' and (select private.is_tracker_admin()));
create policy sr2t_field_photo_insert on storage.objects for insert to authenticated with check(bucket_id='sr2t-field-photos' and (select private.is_tracker_admin()) and name ~ '^[0-9a-f-]{36}/[A-Za-z0-9][A-Za-z0-9_-]{0,79}/[0-9a-f-]{36}/[0-9a-f-]{36}\.jpg$' and split_part(name,'/',1)=(select auth.uid())::text and exists(select 1 from public.sr2t_sites s where s.site_id=split_part(name,'/',2) and s.removed_at is null));
create function private.validate_sr2t_field_visit() returns trigger language plpgsql security invoker set search_path='' as $$
declare k text; item jsonb; photo jsonb; obj storage.objects; paths text[]='{}';d date;
begin
 if not (select private.is_tracker_admin()) then raise insufficient_privilege using message='Tracker administrator access required';end if;
 if not exists(select 1 from public.sr2t_sites where site_id=new.site_id and removed_at is null) then raise exception 'Restore the SR2T site before recording field visits';end if;
 if tg_op='UPDATE' and (new.visit_id<>old.visit_id or new.site_id<>old.site_id) then raise exception 'A field visit cannot be moved to another site';end if;
 if jsonb_typeof(new.data) is distinct from 'object' or octet_length(new.data::text)>40000 or exists(select 1 from jsonb_object_keys(new.data) x where x not in ('visited_on','stop_number','checklist','notes','next_action','photos')) then raise exception 'Invalid field visit data';end if;
 if coalesce(new.data->>'visited_on','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'Visit date must be YYYY-MM-DD';end if;
 d=(new.data->>'visited_on')::date;if d<'1900-01-01' or d>(now() at time zone 'America/New_York')::date then raise exception 'Visit date must be today or earlier';end if;
 if jsonb_typeof(new.data->'stop_number') is distinct from 'string' or (new.data->>'stop_number'<>'' and not exists(select 1 from public.sr2t_sites s cross join lateral jsonb_array_elements(s.profile->'stops') st where s.site_id=new.site_id and st->>'number'=new.data->>'stop_number')) then raise exception 'Choose a stop linked to this SR2T site';end if;
 if jsonb_typeof(new.data->'checklist') is distinct from 'object' or (select count(*) from jsonb_object_keys(new.data->'checklist'))<>4 then raise exception 'Supply all four observation items';end if;
 foreach k in array array['sidewalk','crossing','curb_ramp','stop_access'] loop
  item=new.data->'checklist'->k;if jsonb_typeof(item) is distinct from 'object' or coalesce(item->>'state','') not in ('Not checked','Observed','Needs attention','Not applicable') or jsonb_typeof(item->'note') is distinct from 'string' or length(item->>'note')>1000 or (item->>'state'='Needs attention' and length(btrim(item->>'note'))=0) or exists(select 1 from jsonb_object_keys(item) x where x not in ('state','note')) then raise exception 'Invalid observation or missing concern note';end if;
 end loop;
 if jsonb_typeof(new.data->'notes') is distinct from 'string' or length(new.data->>'notes')>5000 or jsonb_typeof(new.data->'next_action') is distinct from 'string' or length(new.data->>'next_action')>2000 then raise exception 'Visit notes are too large';end if;
 if jsonb_typeof(new.data->'photos') is distinct from 'array' or jsonb_array_length(new.data->'photos')>6 then raise exception 'Up to six photos per visit';end if;
 for photo in select value from jsonb_array_elements(new.data->'photos') loop
  if jsonb_typeof(photo) is distinct from 'object' or coalesce(photo->>'storage_path','') !~ '^[0-9a-f-]{36}/[A-Za-z0-9][A-Za-z0-9_-]{0,79}/[0-9a-f-]{36}/[0-9a-f-]{36}\.jpg$' or split_part(photo->>'storage_path','/',2)<>new.site_id or split_part(photo->>'storage_path','/',3)<>new.visit_id::text or photo->>'storage_path'=any(paths) or coalesce(photo->>'content_type','')<>'image/jpeg' or coalesce(photo->>'kind','') not in ('Before','After','Condition') or jsonb_typeof(photo->'caption') is distinct from 'string' or length(btrim(photo->>'caption')) not between 1 and 500 or jsonb_typeof(photo->'size') is distinct from 'number' or coalesce(photo->>'size','') !~ '^[0-9]+$' or (photo->>'size')::numeric not between 1 and 5242880 or exists(select 1 from jsonb_object_keys(photo) x where x not in ('storage_path','content_type','kind','caption','size')) then raise exception 'Invalid field photo reference';end if;
  paths=array_append(paths,photo->>'storage_path');
  select * into obj from storage.objects where bucket_id='sr2t-field-photos' and name=photo->>'storage_path';
  if not found or coalesce(obj.metadata->>'mimetype','')<>'image/jpeg' or coalesce(obj.metadata->>'size','') !~ '^[0-9]+$' or (obj.metadata->>'size')::numeric<>(photo->>'size')::numeric then raise exception 'Upload the field photo before saving its reference';end if;
 end loop;
 if tg_op='INSERT' then new.version=1;new.created_by=(select auth.uid());new.created_at=clock_timestamp();else new.version=old.version+1;new.created_by=old.created_by;new.created_at=old.created_at;end if;
 new.updated_by=(select auth.uid());new.updated_at=clock_timestamp();return new;
end;$$;
revoke all on function private.validate_sr2t_field_visit() from public,anon,authenticated;
create trigger sr2t_field_validate before insert or update on public.sr2t_field_visits for each row execute function private.validate_sr2t_field_visit();
create function private.audit_sr2t_field_visit() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if not (select private.is_tracker_admin()) then raise insufficient_privilege using message='Tracker administrator access required';end if;
 insert into public.sr2t_field_history(visit_id,changed_by,before_record,after_record) values(new.visit_id,(select auth.uid()),case when tg_op='UPDATE' then to_jsonb(old) else null end,to_jsonb(new));return new;
end;$$;
revoke all on function private.audit_sr2t_field_visit() from public,anon,authenticated;
create trigger sr2t_field_audit after insert or update on public.sr2t_field_visits for each row execute function private.audit_sr2t_field_visit();
create function public.save_sr2t_field_visit(p_visit_id uuid,p_site_id text,p_data jsonb,p_baseline_version integer default null) returns public.sr2t_field_visits language plpgsql security invoker set search_path='' as $$
declare prior public.sr2t_field_visits;saved public.sr2t_field_visits;
begin
 if not (select private.is_tracker_admin()) then raise insufficient_privilege using message='Tracker administrator access required';end if;
 -- Serialize concurrent saves of the same client-generated ID, including first insert.
 perform pg_advisory_xact_lock(hashtextextended(p_visit_id::text,0));
 select * into prior from public.sr2t_field_visits where visit_id=p_visit_id for update;
 if found then
  if prior.site_id<>p_site_id then raise exception 'A field visit cannot be moved to another site';end if;
  if prior.data=p_data and prior.updated_by=(select auth.uid()) then return prior;end if;
  if p_baseline_version is null or p_baseline_version<>prior.version then raise exception 'This visit changed since it was opened. Your draft is retained; reopen the latest visit before saving.';end if;
  update public.sr2t_field_visits set data=p_data where visit_id=p_visit_id returning * into saved;
 else
  if p_baseline_version is not null then raise exception 'Field visit no longer available';end if;
  insert into public.sr2t_field_visits(visit_id,site_id,data) values(p_visit_id,p_site_id,p_data) returning * into saved;
 end if;return saved;
end;$$;
revoke all on function public.save_sr2t_field_visit(uuid,text,jsonb,integer) from public,anon;
grant execute on function public.save_sr2t_field_visit(uuid,text,jsonb,integer) to authenticated;
notify pgrst,'reload schema';
