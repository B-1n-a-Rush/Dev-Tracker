create table public.project_change_proposals (
  id bigint generated always as identity primary key,
  project_id text not null references public.projects(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  source_title text not null,
  source_url text not null check (source_url ~* '^https?://'),
  source_publisher text,
  source_published_at date,
  source_excerpt text,
  analysis_summary text not null,
  proposed_patch jsonb not null,
  changed_fields text[] not null,
  confidence numeric(3,2) not null default 0.50
    check (confidence >= 0 and confidence <= 1),
  baseline_updated_at timestamptz not null,
  dedupe_fingerprint text not null unique,
  suggested_by text not null default 'scheduled-news-monitor',
  detected_at timestamptz not null default now(),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  review_note text,
  constraint project_change_proposals_patch_is_object
    check (
      jsonb_typeof(proposed_patch) = 'object'
      and proposed_patch <> '{}'::jsonb
    ),
  constraint project_change_proposals_patch_fields_are_safe
    check (
      proposed_patch - array[
        'status',
        'project_type',
        'subtypes',
        'dri',
        'homes',
        'residential_units',
        'transit',
        'investment',
        'description',
        'source_url',
        'source_status',
        'events',
        'metadata'
      ]::text[] = '{}'::jsonb
    ),
  constraint project_change_proposals_changed_fields_are_safe
    check (
      cardinality(changed_fields) > 0
      and changed_fields <@ array[
        'status',
        'project_type',
        'subtypes',
        'dri',
        'homes',
        'residential_units',
        'transit',
        'investment',
        'description',
        'source_url',
        'source_status',
        'events',
        'metadata'
      ]::text[]
    )
);

create index project_change_proposals_status_detected_idx
  on public.project_change_proposals (status, detected_at desc);

create index project_change_proposals_project_detected_idx
  on public.project_change_proposals (project_id, detected_at desc);

alter table public.project_change_proposals enable row level security;

revoke all on table public.project_change_proposals from public, anon, authenticated;
revoke all on sequence public.project_change_proposals_id_seq from public, anon, authenticated;
grant select, update on table public.project_change_proposals to authenticated;
grant select, insert, update, delete on table public.project_change_proposals to service_role;
grant usage, select on sequence public.project_change_proposals_id_seq to service_role;

create policy admins_can_read_project_change_proposals
  on public.project_change_proposals
  for select
  to authenticated
  using ((select private.is_tracker_admin()));

create policy admins_can_review_project_change_proposals
  on public.project_change_proposals
  for update
  to authenticated
  using ((select private.is_tracker_admin()))
  with check ((select private.is_tracker_admin()));

create table private.project_monitoring_state (
  project_id text primary key references public.projects(id) on delete cascade,
  last_checked_at timestamptz,
  last_result text,
  last_source_url text,
  last_error text,
  updated_at timestamptz not null default now()
);

revoke all on table private.project_monitoring_state from public, anon, authenticated;
grant select, insert, update, delete on table private.project_monitoring_state to service_role;

create or replace function public.review_project_change_proposal(
  p_proposal_id bigint,
  p_decision text,
  p_note text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  proposal public.project_change_proposals%rowtype;
  updated_project public.projects%rowtype;
  decision text := lower(trim(p_decision));
begin
  if not private.is_tracker_admin() then
    raise exception 'Approved tracker administrator access is required.';
  end if;

  if decision not in ('approve', 'reject') then
    raise exception 'Decision must be approve or reject.';
  end if;

  select *
    into proposal
  from public.project_change_proposals
  where id = p_proposal_id
  for update;

  if not found then
    raise exception 'Suggested change was not found.';
  end if;

  if proposal.status <> 'pending' then
    raise exception 'Suggested change has already been reviewed.';
  end if;

  if decision = 'reject' then
    update public.project_change_proposals
    set status = 'rejected',
        reviewed_by = (select auth.uid()),
        reviewed_at = now(),
        review_note = nullif(trim(p_note), '')
    where id = proposal.id;

    return jsonb_build_object(
      'proposal_id', proposal.id,
      'status', 'rejected'
    );
  end if;

  if not exists (
    select 1
    from public.projects
    where id = proposal.project_id
      and updated_at = proposal.baseline_updated_at
  ) then
    raise exception 'This project changed after the suggestion was created. Refresh the source review before approving it.';
  end if;

  update public.projects
  set status = case
        when proposal.proposed_patch ? 'status' then proposal.proposed_patch ->> 'status'
        else status
      end,
      project_type = case
        when proposal.proposed_patch ? 'project_type' then proposal.proposed_patch ->> 'project_type'
        else project_type
      end,
      subtypes = case
        when proposal.proposed_patch ? 'subtypes' then
          array(select jsonb_array_elements_text(proposal.proposed_patch -> 'subtypes'))
        else subtypes
      end,
      dri = case
        when proposal.proposed_patch ? 'dri' then nullif(trim(proposal.proposed_patch ->> 'dri'), '')
        else dri
      end,
      homes = case
        when proposal.proposed_patch ? 'homes' then (proposal.proposed_patch ->> 'homes')::integer
        else homes
      end,
      residential_units = case
        when proposal.proposed_patch ? 'residential_units' then (proposal.proposed_patch ->> 'residential_units')::integer
        else residential_units
      end,
      transit = case
        when proposal.proposed_patch ? 'transit' then nullif(trim(proposal.proposed_patch ->> 'transit'), '')
        else transit
      end,
      investment = case
        when proposal.proposed_patch ? 'investment' then nullif(trim(proposal.proposed_patch ->> 'investment'), '')
        else investment
      end,
      description = case
        when proposal.proposed_patch ? 'description' then nullif(trim(proposal.proposed_patch ->> 'description'), '')
        else description
      end,
      source_url = case
        when proposal.proposed_patch ? 'source_url' then nullif(trim(proposal.proposed_patch ->> 'source_url'), '')
        else source_url
      end,
      source_status = case
        when proposal.proposed_patch ? 'source_status' then nullif(trim(proposal.proposed_patch ->> 'source_status'), '')
        else source_status
      end,
      events = case
        when proposal.proposed_patch ? 'events' then proposal.proposed_patch -> 'events'
        else events
      end,
      metadata = case
        when proposal.proposed_patch ? 'metadata' then metadata || (proposal.proposed_patch -> 'metadata')
        else metadata
      end,
      updated_at = now()
  where id = proposal.project_id
  returning * into updated_project;

  update public.project_change_proposals
  set status = 'approved',
      reviewed_by = (select auth.uid()),
      reviewed_at = now(),
      review_note = nullif(trim(p_note), '')
  where id = proposal.id;

  return jsonb_build_object(
    'proposal_id', proposal.id,
    'status', 'approved',
    'project', to_jsonb(updated_project)
  );
end;
$$;

revoke all on function public.review_project_change_proposal(bigint, text, text) from public, anon;
grant execute on function public.review_project_change_proposal(bigint, text, text) to authenticated;

notify pgrst, 'reload schema';
