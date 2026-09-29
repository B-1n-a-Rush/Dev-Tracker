create or replace function public.service_grant_tracker_admin(
  p_actor_user_id uuid,
  p_target_user_id uuid,
  p_target_email text,
  p_action text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(btrim(coalesce(p_target_email, '')));
  v_action text := lower(btrim(coalesce(p_action, '')));
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service-role access is required.';
  end if;
  if not exists (
    select 1 from public.admin_users
    where user_id = p_actor_user_id and role = 'owner'
  ) then
    raise exception 'Only a tracker owner can grant administrator access.';
  end if;
  if v_action not in ('invited', 'granted_existing') then
    raise exception 'Invalid administrator grant action.';
  end if;
  if v_email = '' or char_length(v_email) > 254 then
    raise exception 'A valid target email is required.';
  end if;

  insert into public.admin_users (user_id, role, invited_by, invited_at)
  values (p_target_user_id, 'admin', p_actor_user_id, now());

  insert into public.admin_access_history (
    actor_user_id,
    target_user_id,
    target_email,
    action,
    target_role
  ) values (
    p_actor_user_id,
    p_target_user_id,
    v_email,
    v_action,
    'admin'
  );

  return jsonb_build_object('granted', true, 'user_id', p_target_user_id, 'role', 'admin');
end;
$$;

create or replace function public.service_revoke_tracker_admin(
  p_actor_user_id uuid,
  p_target_user_id uuid,
  p_target_email text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_target public.admin_users%rowtype;
  v_email text := lower(btrim(coalesce(p_target_email, '')));
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service-role access is required.';
  end if;
  if not exists (
    select 1 from public.admin_users
    where user_id = p_actor_user_id and role = 'owner'
  ) then
    raise exception 'Only a tracker owner can revoke administrator access.';
  end if;
  if p_actor_user_id = p_target_user_id then
    raise exception 'You cannot remove your own owner access.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('trackside-admin-owners', 0));
  select * into v_target
  from public.admin_users
  where user_id = p_target_user_id
  for update;

  if not found then
    raise exception 'That administrator no longer has access.';
  end if;
  if v_target.role = 'owner' and (
    select count(*) from public.admin_users where role = 'owner'
  ) <= 1 then
    raise exception 'The final owner cannot be removed.';
  end if;

  delete from public.admin_users where user_id = p_target_user_id;

  insert into public.admin_access_history (
    actor_user_id,
    target_user_id,
    target_email,
    action,
    target_role
  ) values (
    p_actor_user_id,
    p_target_user_id,
    case when v_email = '' then 'Email unavailable' else v_email end,
    'revoked',
    v_target.role
  );

  return jsonb_build_object('revoked', true, 'user_id', p_target_user_id);
end;
$$;

revoke all on function public.service_grant_tracker_admin(uuid, uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.service_revoke_tracker_admin(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.service_grant_tracker_admin(uuid, uuid, text, text)
  to service_role;
grant execute on function public.service_revoke_tracker_admin(uuid, uuid, text)
  to service_role;

comment on function public.service_grant_tracker_admin(uuid, uuid, text, text) is
  'Atomically grants administrator membership and records the owner action; service role only.';
comment on function public.service_revoke_tracker_admin(uuid, uuid, text) is
  'Atomically revokes administrator membership and records the owner action; service role only.';

notify pgrst, 'reload schema';
