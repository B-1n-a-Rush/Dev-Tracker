alter table public.admin_users
  add column if not exists role text,
  add column if not exists invited_by uuid references auth.users(id) on delete set null,
  add column if not exists invited_at timestamptz;

update public.admin_users
set role = coalesce(role, 'admin'),
    invited_at = coalesce(invited_at, created_at);

update public.admin_users
set role = 'owner'
where user_id = (
  select user_id
  from public.admin_users
  order by created_at, user_id
  limit 1
)
and not exists (
  select 1 from public.admin_users where role = 'owner'
);

alter table public.admin_users
  alter column role set default 'admin',
  alter column role set not null,
  alter column invited_at set default now(),
  alter column invited_at set not null,
  drop constraint if exists admin_users_role_check,
  add constraint admin_users_role_check check (role in ('owner', 'admin'));

create index if not exists admin_users_role_idx
  on public.admin_users (role, created_at);

create or replace function private.is_tracker_owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    private.is_tracker_admin()
    and exists (
      select 1
      from public.admin_users admin
      where admin.user_id = (select auth.uid())
        and admin.role = 'owner'
    );
$$;

revoke all on function private.is_tracker_owner() from public;
grant execute on function private.is_tracker_owner() to authenticated;

create or replace function private.protect_last_tracker_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.role = 'owner'
     and (tg_op = 'DELETE' or new.role <> 'owner')
     and not exists (
       select 1
       from public.admin_users other_admin
       where other_admin.user_id <> old.user_id
         and other_admin.role = 'owner'
     ) then
    raise exception 'The tracker must retain at least one owner.';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function private.protect_last_tracker_owner() from public;

drop trigger if exists protect_last_tracker_owner on public.admin_users;
create trigger protect_last_tracker_owner
before delete or update of role on public.admin_users
for each row execute function private.protect_last_tracker_owner();

create table if not exists public.admin_access_history (
  id bigint generated always as identity primary key,
  actor_user_id uuid references auth.users(id) on delete set null,
  target_user_id uuid references auth.users(id) on delete set null,
  target_email text not null,
  action text not null check (action in ('invited', 'granted_existing', 'revoked')),
  target_role text not null check (target_role in ('owner', 'admin')),
  created_at timestamptz not null default now()
);

create index if not exists admin_access_history_created_at_idx
  on public.admin_access_history (created_at desc);

create index if not exists admin_access_history_target_idx
  on public.admin_access_history (target_user_id, created_at desc);

alter table public.admin_access_history enable row level security;

revoke all on table public.admin_users from anon;
revoke insert, update, delete on table public.admin_users from authenticated;
grant select on table public.admin_users to authenticated;
grant all on table public.admin_users to service_role;

revoke all on table public.admin_access_history from public, anon, authenticated;
revoke all on sequence public.admin_access_history_id_seq from public, anon, authenticated;
grant all on table public.admin_access_history to service_role;
grant all on sequence public.admin_access_history_id_seq to service_role;

comment on column public.admin_users.role is
  'Owner can manage administrator access; admin can manage tracker content only.';
comment on table public.admin_access_history is
  'Server-managed audit trail for administrator invitations, grants, and revocations.';
comment on function private.is_tracker_owner() is
  'Checks that the current authenticated live session belongs to an owner.';

notify pgrst, 'reload schema';
