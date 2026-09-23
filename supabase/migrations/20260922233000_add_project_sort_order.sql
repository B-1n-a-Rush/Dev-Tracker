alter table public.projects
  add column sort_order integer not null default 0;

create index projects_sort_order_idx
  on public.projects(sort_order, name);
