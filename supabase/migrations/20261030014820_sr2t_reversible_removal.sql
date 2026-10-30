alter table public.sr2t_sites add column removed_at timestamptz;
alter table public.sr2t_sites add constraint sr2t_removed_not_published check(removed_at is null or not is_published);
alter policy sr2t_public_sites on public.sr2t_sites using(is_published and removed_at is null);

create function public.set_sr2t_site_removed(p_site_id text,p_baseline_version integer,p_removed boolean)
returns public.sr2t_sites language plpgsql security invoker set search_path='' as $$
declare prior public.sr2t_sites; result public.sr2t_sites;
begin
 if not (select private.is_tracker_admin()) then raise insufficient_privilege using message='Tracker administrator access required';end if;
 if p_site_id is null or p_site_id !~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$' or p_removed is null then raise exception 'Invalid SR2T site action';end if;
 select * into prior from public.sr2t_sites where site_id=p_site_id for update;
 if not found then raise exception 'This SR2T site is no longer available';end if;
 if (prior.removed_at is not null)=p_removed then return prior;end if;
 if p_baseline_version is null or prior.version<>p_baseline_version then raise exception 'This site changed. Refresh it before removing or restoring; no changes were made.';end if;
 update public.sr2t_sites set removed_at=case when p_removed then clock_timestamp() else null end,is_published=false where site_id=p_site_id returning * into result;
 return result;
end;$$;
revoke all on function public.set_sr2t_site_removed(text,integer,boolean) from public,anon;
grant execute on function public.set_sr2t_site_removed(text,integer,boolean) to authenticated;
comment on column public.sr2t_sites.removed_at is 'Reversible removal of SR2T designation only. The underlying local bus network is unaffected.';
notify pgrst,'reload schema';
