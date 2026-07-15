-- Qualify the generated date column in the dashboard RPC. The preceding
-- migration was already deployed before the ambiguity was detected by
-- plpgsql_check, so this migration repairs existing environments as well as
-- preserving a clean migration history.

do $migration$
declare
  v_definition text;
  v_fixed_definition text;
begin
  select pg_get_functiondef(routine.oid)
  into v_definition
  from pg_proc as routine
  join pg_namespace as routine_schema
    on routine_schema.oid = routine.pronamespace
  where routine_schema.nspname = 'public'
    and routine.proname = 'dashboard_company_aggregates'
    and routine.pronargs = 9;

  if v_definition is null then
    raise exception 'dashboard_company_aggregates function not found';
  end if;

  v_fixed_definition := replace(
    v_definition,
    E'select\n      day::date,\n      coalesce(pc.value, 0)::integer as value',
    E'select\n      series.day::date as day,\n      coalesce(pc.value, 0)::integer as value'
  );
  v_fixed_definition := replace(
    v_fixed_definition,
    'left join period_counts pc on pc.day = day::date',
    'left join period_counts pc on pc.day = series.day::date'
  );
  v_fixed_definition := replace(
    v_fixed_definition,
    E'order by day\n  ),\n  age_counts',
    E'order by series.day\n  ),\n  age_counts'
  );

  execute v_fixed_definition;
end;
$migration$;
