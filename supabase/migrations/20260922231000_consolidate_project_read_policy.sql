create schema if not exists private;

revoke all on schema private from public, anon, authenticated;
grant usage on schema private to anon, authenticated;

create or replace function private.is_tracker_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.admin_users
    where user_id = (select auth.uid())
  );
$$;

revoke all on function private.is_tracker_admin() from public;
grant execute on function private.is_tracker_admin() to anon, authenticated;

drop policy if exists "published_projects_are_public" on public.projects;
drop policy if exists "admins_can_read_all_projects" on public.projects;

create policy "projects_read_access"
on public.projects
for select
to anon, authenticated
using (is_published or private.is_tracker_admin());
