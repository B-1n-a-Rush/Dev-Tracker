create table public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

comment on table public.admin_users is
  'Allow-list of authenticated users who may manage tracker content. Rows are added only after account ownership is verified.';

alter table public.admin_users enable row level security;

revoke all on table public.admin_users from anon, authenticated;
grant select on table public.admin_users to authenticated;

create policy "admins_can_read_own_membership"
on public.admin_users
for select
to authenticated
using ((select auth.uid()) = user_id);


create table public.projects (
  id text primary key,
  name text not null check (length(btrim(name)) > 0),
  area text,
  location text,
  status text not null default 'Planning'
    check (status in ('Planning', 'Construction', 'Complete')),
  project_type text not null default 'Commercial'
    check (project_type in ('Commercial', 'Residential', 'Retail', 'Mixed-use')),
  subtypes text[] not null default '{}'::text[],
  dri text,
  homes integer not null default 0 check (homes >= 0),
  residential_units integer not null default 0 check (residential_units >= 0),
  transit text,
  investment text,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  parcels jsonb not null default '[]'::jsonb
    check (jsonb_typeof(parcels) = 'array'),
  events jsonb not null default '[]'::jsonb
    check (jsonb_typeof(events) = 'array'),
  description text,
  source_url text,
  source_status text,
  color text,
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.projects is
  'Canonical development-project records for the Trackside ATL map.';

alter table public.projects enable row level security;

revoke all on table public.projects from anon, authenticated;
grant select on table public.projects to anon, authenticated;
grant insert, update, delete on table public.projects to authenticated;

create policy "published_projects_are_public"
on public.projects
for select
to anon, authenticated
using (is_published);

create policy "admins_can_read_all_projects"
on public.projects
for select
to authenticated
using (
  exists (
    select 1
    from public.admin_users
    where user_id = (select auth.uid())
  )
);

create policy "admins_can_insert_projects"
on public.projects
for insert
to authenticated
with check (
  exists (
    select 1
    from public.admin_users
    where user_id = (select auth.uid())
  )
);

create policy "admins_can_update_projects"
on public.projects
for update
to authenticated
using (
  exists (
    select 1
    from public.admin_users
    where user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1
    from public.admin_users
    where user_id = (select auth.uid())
  )
);

create policy "admins_can_delete_projects"
on public.projects
for delete
to authenticated
using (
  exists (
    select 1
    from public.admin_users
    where user_id = (select auth.uid())
  )
);


create table public.saved_projects (
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id text not null references public.projects(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, project_id)
);

comment on table public.saved_projects is
  'Per-account project bookmarks. Anonymous visitors continue to use browser storage until they sign in.';

create index saved_projects_project_id_idx
on public.saved_projects(project_id);

alter table public.saved_projects enable row level security;

revoke all on table public.saved_projects from anon, authenticated;
grant select, insert, delete on table public.saved_projects to authenticated;

create policy "users_can_read_their_saved_projects"
on public.saved_projects
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "users_can_save_projects"
on public.saved_projects
for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "users_can_remove_their_saved_projects"
on public.saved_projects
for delete
to authenticated
using ((select auth.uid()) = user_id);
