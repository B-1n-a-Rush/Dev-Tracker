create table public.infrastructure_source_findings (
  id text primary key check (id ~ '^[0-9a-f]{64}$'),
  infrastructure_id text check (char_length(infrastructure_id) between 1 and 250),
  source_name text not null check (char_length(source_name) between 1 and 200),
  source_url text not null check (char_length(source_url) between 10 and 1800 and source_url ~ '^https://[^[:space:]]+$'),
  project_name text not null check (char_length(project_name) between 1 and 500),
  kind text not null check (kind in ('discrepancy', 'new', 'changed', 'missing', 'reverted')),
  reason text not null check (char_length(reason) between 1 and 750),
  priority smallint not null default 0 check (priority between 0 and 2),
  previous_label text not null check (char_length(previous_label) between 1 and 90),
  incoming_label text not null check (char_length(incoming_label) between 1 and 90),
  comparisons jsonb not null check (jsonb_typeof(comparisons) = 'array' and pg_column_size(comparisons) <= 24000),
  checked_at timestamptz not null,
  decision text not null default 'pending' check (decision in ('pending', 'keep_current', 'verified_update', 'agency_confirmation')),
  review_note text not null default '' check (char_length(review_note) <= 1000),
  review_version integer not null default 0 check (review_version >= 0),
  reviewed_at timestamptz
);
alter table public.infrastructure_source_findings enable row level security;
revoke all on public.infrastructure_source_findings from public, anon, authenticated;
grant select, update (decision, review_note) on public.infrastructure_source_findings to authenticated;
grant select, insert on public.infrastructure_source_findings to service_role;
create policy infrastructure_source_findings_admin_read on public.infrastructure_source_findings
  for select to authenticated using ((select private.is_tracker_admin()));
create policy infrastructure_source_findings_admin_review on public.infrastructure_source_findings
  for update to authenticated using ((select private.is_tracker_admin())) with check ((select private.is_tracker_admin()));
create index infrastructure_source_findings_queue_order on public.infrastructure_source_findings (priority desc, checked_at desc, id);

create function private.bump_infrastructure_source_review()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.decision = 'pending' then
    raise check_violation using message = 'Choose a review decision';
  end if;
  new.review_version := old.review_version + 1;
  new.reviewed_at := statement_timestamp();
  return new;
end
$$;
revoke all on function private.bump_infrastructure_source_review() from public, anon, authenticated;
create trigger infrastructure_source_findings_review_checkpoint
before update of decision, review_note on public.infrastructure_source_findings
for each row execute function private.bump_infrastructure_source_review();
