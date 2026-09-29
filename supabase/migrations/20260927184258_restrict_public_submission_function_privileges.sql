revoke all on function public.submit_public_project_submission(text, text, text, text, text, text, text, text)
  from public, anon, authenticated, service_role;
revoke all on function public.get_project_submission_status(text)
  from public, anon, authenticated, service_role;
revoke all on function public.admin_list_project_submissions(text)
  from public, anon, authenticated, service_role;
revoke all on function public.admin_review_project_submission(bigint, text, text)
  from public, anon, authenticated, service_role;
revoke all on function public.submit_project_information_report(text, text, text, text)
  from public, anon, authenticated, service_role;

grant execute on function public.submit_public_project_submission(text, text, text, text, text, text, text, text)
  to anon, authenticated;
grant execute on function public.get_project_submission_status(text)
  to anon, authenticated;
grant execute on function public.admin_list_project_submissions(text)
  to authenticated;
grant execute on function public.admin_review_project_submission(bigint, text, text)
  to authenticated;
grant execute on function public.submit_project_information_report(text, text, text, text)
  to anon, authenticated;

grant select on table public.project_information_reports to authenticated;
grant update (status, status_updated_at, reviewed_by, reviewed_at, resolution_note)
  on table public.project_information_reports to authenticated;

alter function public.admin_list_project_submissions(text) security invoker;
alter function public.admin_review_project_submission(bigint, text, text) security invoker;
