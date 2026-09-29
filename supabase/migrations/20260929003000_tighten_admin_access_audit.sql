create index if not exists admin_users_invited_by_idx
  on public.admin_users (invited_by)
  where invited_by is not null;

create index if not exists admin_access_history_actor_idx
  on public.admin_access_history (actor_user_id, created_at desc)
  where actor_user_id is not null;

drop policy if exists "no_direct_admin_access_history" on public.admin_access_history;
create policy "no_direct_admin_access_history"
on public.admin_access_history
for all
to anon, authenticated
using (false)
with check (false);

comment on policy "no_direct_admin_access_history" on public.admin_access_history is
  'Access history is available only through the owner-verified Edge Function.';
