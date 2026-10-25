do $migration$
declare
  function_sql text;
  required_description_check constant text :=
    '        case when nullif(btrim(b.description), '''') is null then ''description'' end,' || E'\n';
begin
  select pg_get_functiondef('public.get_project_data_health(integer)'::regprocedure)
  into function_sql;

  if position(required_description_check in function_sql) = 0 then
    raise exception 'Could not find the required-description health check in get_project_data_health(integer).';
  end if;

  execute replace(function_sql, required_description_check, '');
end;
$migration$;

comment on function public.get_project_data_health(integer) is
  'Returns admin-only source health, monitoring freshness, required-field completeness, duplicate, and proposal-conflict findings. Project descriptions are optional.';

notify pgrst, 'reload schema';
