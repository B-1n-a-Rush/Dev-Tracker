create index if not exists project_information_reports_submitted_by_idx
  on public.project_information_reports (submitted_by)
  where submitted_by is not null;

create index if not exists project_information_reports_reviewed_by_idx
  on public.project_information_reports (reviewed_by)
  where reviewed_by is not null;
