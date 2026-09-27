create or replace function private.is_tracker_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select auth.uid()) is not null
    and exists (
      select 1
      from auth.sessions session
      join public.admin_users admin
        on admin.user_id = session.user_id
      where session.id::text = (select auth.jwt() ->> 'session_id')
        and session.user_id = (select auth.uid())
    );
$$;

revoke all on function private.is_tracker_admin() from public;
grant execute on function private.is_tracker_admin() to anon, authenticated;

drop policy if exists "admins_can_read_own_membership"
  on public.admin_users;

create policy "admins_can_read_own_membership"
on public.admin_users
for select
to authenticated
using (
  (select auth.uid()) = user_id
  and private.is_tracker_admin()
);

drop policy if exists "admins_can_insert_projects"
  on public.projects;
drop policy if exists "admins_can_update_projects"
  on public.projects;
drop policy if exists "admins_can_delete_projects"
  on public.projects;

create policy "admins_can_insert_projects"
on public.projects
for insert
to authenticated
with check (private.is_tracker_admin());

create policy "admins_can_update_projects"
on public.projects
for update
to authenticated
using (private.is_tracker_admin())
with check (private.is_tracker_admin());

create policy "admins_can_delete_projects"
on public.projects
for delete
to authenticated
using (private.is_tracker_admin());

notify pgrst, 'reload schema';
