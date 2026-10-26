-- Bounded, authenticated chunk transport; final validation/activation is atomic.
create table private.local_bus_network_uploads (
 id uuid primary key default gen_random_uuid(),
 created_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
 created_at timestamptz not null default clock_timestamp(),
 fingerprint text not null check(fingerprint ~ '^[0-9a-f]{64}$'),
 archive_sha256 text not null check(archive_sha256 ~ '^[0-9a-f]{64}$'),
 source_filename text not null check(length(source_filename) between 1 and 500)
);
create index local_bus_upload_owner on private.local_bus_network_uploads(created_by);
create table private.local_bus_network_upload_parts (
 upload_id uuid not null references private.local_bus_network_uploads(id) on delete cascade,
 part integer not null check(part between 0 and 599),
 content text not null check(octet_length(content)<=200000),
 primary key(upload_id,part)
);
alter table private.local_bus_network_uploads enable row level security;
alter table private.local_bus_network_upload_parts enable row level security;
revoke all on private.local_bus_network_uploads,private.local_bus_network_upload_parts from public,anon,authenticated;
grant select,insert,update,delete on private.local_bus_network_uploads to authenticated;
grant select,insert,update,delete on private.local_bus_network_upload_parts to authenticated;
grant all on private.local_bus_network_uploads,private.local_bus_network_upload_parts to service_role;
create policy admin_owns_bus_upload on private.local_bus_network_uploads for all to authenticated using(created_by=(select auth.uid()) and (select private.is_tracker_admin())) with check(created_by=(select auth.uid()) and (select private.is_tracker_admin()));
create policy admin_owns_bus_upload_part on private.local_bus_network_upload_parts for all to authenticated using((select private.is_tracker_admin()) and exists(select 1 from private.local_bus_network_uploads u where u.id=upload_id and u.created_by=(select auth.uid()))) with check((select private.is_tracker_admin()) and exists(select 1 from private.local_bus_network_uploads u where u.id=upload_id and u.created_by=(select auth.uid())));
create function public.begin_local_bus_upload(p_fingerprint text,p_archive_sha256 text,p_source_filename text) returns uuid language plpgsql security invoker set search_path='' as $$
declare upload_id uuid;
begin
 if not (select private.is_tracker_admin()) then raise insufficient_privilege using message='Tracker administrator access required';end if;
 delete from private.local_bus_network_uploads where created_by=(select auth.uid()) and created_at<clock_timestamp()-interval '1 day';
 if (select count(*) from private.local_bus_network_uploads where created_by=(select auth.uid()))>=5 then raise exception 'Five unfinished uploads exist. Retry after expiry or cancel an upload.';end if;
 insert into private.local_bus_network_uploads(fingerprint,archive_sha256,source_filename) values(p_fingerprint,p_archive_sha256,p_source_filename) returning id into upload_id;return upload_id;
end;$$;
create function public.append_local_bus_upload(p_upload_id uuid,p_part integer,p_content text) returns integer language plpgsql security invoker set search_path='' as $$
begin
 if not (select private.is_tracker_admin()) then raise insufficient_privilege using message='Tracker administrator access required';end if;
 if not exists(select 1 from private.local_bus_network_uploads where id=p_upload_id and created_by=(select auth.uid())) then raise exception 'Upload expired or is unavailable';end if;
 insert into private.local_bus_network_upload_parts(upload_id,part,content) values(p_upload_id,p_part,p_content) on conflict(upload_id,part) do update set content=excluded.content;return p_part;
end;$$;
create function public.finish_local_bus_upload(p_upload_id uuid,p_parts integer) returns jsonb language plpgsql security invoker set search_path='' as $$
declare upload private.local_bus_network_uploads; payload text; result jsonb; amount integer; highest integer; lowest integer;
begin
 if not (select private.is_tracker_admin()) then raise insufficient_privilege using message='Tracker administrator access required';end if;
 select * into upload from private.local_bus_network_uploads where id=p_upload_id and created_by=(select auth.uid()) for update;
 if not found then raise exception 'Upload expired or is unavailable';end if;
 select count(*),max(part),min(part) into amount,highest,lowest from private.local_bus_network_upload_parts where upload_id=p_upload_id;
 if amount<>p_parts or lowest<>0 or highest<>p_parts-1 or p_parts<1 then raise exception 'Incomplete upload';end if;
 if (select sum(octet_length(content)) from private.local_bus_network_upload_parts where upload_id=p_upload_id)>25000000 then raise exception 'Network payload exceeds 25 MB';end if;
 select string_agg(content,'' order by part) into payload from private.local_bus_network_upload_parts where upload_id=p_upload_id;
 result=public.import_local_bus_network(upload.fingerprint,upload.archive_sha256,upload.source_filename,payload::jsonb);
 delete from private.local_bus_network_uploads where id=p_upload_id;
 return result;
end;$$;
create function public.cancel_local_bus_upload(p_upload_id uuid) returns void language plpgsql security invoker set search_path='' as $$
begin
 if not (select private.is_tracker_admin()) then raise insufficient_privilege using message='Tracker administrator access required';end if;
 delete from private.local_bus_network_uploads where id=p_upload_id and created_by=(select auth.uid());
end;$$;
revoke all on function public.begin_local_bus_upload(text,text,text),public.append_local_bus_upload(uuid,integer,text),public.finish_local_bus_upload(uuid,integer),public.cancel_local_bus_upload(uuid) from public,anon;
grant execute on function public.begin_local_bus_upload(text,text,text),public.append_local_bus_upload(uuid,integer,text),public.finish_local_bus_upload(uuid,integer),public.cancel_local_bus_upload(uuid) to authenticated,service_role;
