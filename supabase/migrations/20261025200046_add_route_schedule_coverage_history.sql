-- Additive schedule audit and review checkpoints. No project or route geometry edits.
alter table public.route_construction_schedules add column schedule_version bigint not null default 1 check(schedule_version>0);
alter table public.infrastructure_coordination_reviews add column reviewed_schedule_version bigint check(reviewed_schedule_version>0);

create table public.route_schedule_history (
 id bigint generated always as identity primary key,
 route_id bigint not null,
 recorded_at timestamptz not null default clock_timestamp(),
 changed_by uuid,
 event_type text not null check(event_type in ('baseline','created','updated')),
 changed_fields text[] not null default '{}',
 before_record jsonb,
 after_record jsonb not null,
 dates_changed boolean not null default false,
 check(jsonb_typeof(after_record)='object'),
 check(before_record is null or jsonb_typeof(before_record)='object')
);
create index route_schedule_history_route_time_idx on public.route_schedule_history(route_id,recorded_at desc,id desc);
alter table public.route_schedule_history enable row level security;
revoke all on public.route_schedule_history from public,anon,authenticated;
revoke all on sequence public.route_schedule_history_id_seq from public,anon,authenticated;
grant select on public.route_schedule_history to authenticated,service_role;
create policy tracker_admins_read_schedule_history on public.route_schedule_history for select to authenticated using((select private.is_tracker_admin()));

create function private.version_route_schedule() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if tg_op='INSERT' then new.schedule_version=1;
 elsif row(new.construction_start,new.start_label,new.construction_finish,new.finish_label) is distinct from row(old.construction_start,old.start_label,old.construction_finish,old.finish_label) then new.schedule_version=old.schedule_version+1;
 else new.schedule_version=old.schedule_version;
 end if;
 return new;
end;
$$;
revoke all on function private.version_route_schedule() from public,anon,authenticated;
create trigger version_route_schedule before insert or update on public.route_construction_schedules for each row execute function private.version_route_schedule();

-- A private trigger writes immutable history after the existing admin RLS check.
-- Its inputs can only be supplied by the row trigger; it is not an exposed RPC.
create function private.audit_route_schedule() returns trigger language plpgsql security definer set search_path='' as $$
declare prior jsonb; next_record jsonb; fields text[];
begin
 if tg_table_schema<>'public' or tg_table_name<>'route_construction_schedules' or tg_op not in ('INSERT','UPDATE') then raise exception 'Invalid schedule audit context';end if;
 if (select auth.uid()) is not null and not (select private.is_tracker_admin()) then raise insufficient_privilege using message='Tracker administrator access required';end if;
 next_record=to_jsonb(new)-'updated_at'-'updated_by';
 if tg_op='UPDATE' then prior=to_jsonb(old)-'updated_at'-'updated_by';end if;
 select coalesce(array_agg(key order by key),'{}'::text[]) into fields from jsonb_each(next_record) where key<>'schedule_version' and prior->key is distinct from value;
 if tg_op='UPDATE' and cardinality(fields)=0 then return new;end if;
 insert into public.route_schedule_history(route_id,changed_by,event_type,changed_fields,before_record,after_record,dates_changed)
 values(new.route_id,(select auth.uid()),case when tg_op='INSERT' then 'created' else 'updated' end,fields,prior,next_record,tg_op='UPDATE' and old.schedule_version<>new.schedule_version);
 return new;
end;
$$;
revoke all on function private.audit_route_schedule() from public,anon,authenticated;
create trigger audit_route_schedule after insert or update on public.route_construction_schedules for each row execute function private.audit_route_schedule();

-- Keep the version the administrator actually reviewed, including under a concurrent edit.
-- Legacy clients may save a null checkpoint, which remains explicitly unverified.
create function private.check_coordination_schedule_version() returns trigger language plpgsql security invoker set search_path='' as $$
declare current_version bigint;
begin
 if new.route_id is null then new.reviewed_schedule_version=null;return new;end if;
 select schedule_version into current_version from public.route_construction_schedules where route_id=new.route_id for share;
 if new.reviewed_schedule_version is not null and new.reviewed_schedule_version is distinct from current_version then raise exception 'Route schedule changed. Refresh and review its dates before saving coordination notes.' using errcode='40001';end if;
 return new;
end;
$$;
revoke all on function private.check_coordination_schedule_version() from public,anon,authenticated;
create trigger check_coordination_schedule_version before insert or update on public.infrastructure_coordination_reviews for each row execute function private.check_coordination_schedule_version();

-- A baseline preserves current values without inventing preexisting change history or checks.
insert into public.route_schedule_history(route_id,event_type,after_record)
select route_id,'baseline',to_jsonb(s)-'updated_at'-'updated_by' from public.route_construction_schedules s;
