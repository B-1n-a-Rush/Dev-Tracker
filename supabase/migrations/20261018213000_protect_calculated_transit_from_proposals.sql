begin;

create or replace function private.prevent_proposal_transit_overwrite()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  change_reason text := current_setting('trackside.change_reason', true);
begin
  if change_reason like 'Approved proposal #%'
    and new.transit is distinct from old.transit then
    raise exception
      'Nearby high-capacity route access is calculated from route geometry and cannot be approved from a monitoring proposal.';
  end if;

  return new;
end;
$$;

drop trigger if exists protect_calculated_transit_from_proposals
  on public.projects;

create trigger protect_calculated_transit_from_proposals
before update of transit on public.projects
for each row
execute function private.prevent_proposal_transit_overwrite();

revoke all on function private.prevent_proposal_transit_overwrite()
  from public, anon, authenticated;

commit;
