-- Aggregate the company dashboard in PostgreSQL so the browser/server does not
-- need every patient and appointment row merely to render cards and charts.

create or replace function public.dashboard_company_aggregates(
  p_organization_id uuid,
  p_view text,
  p_current_start timestamptz,
  p_current_end timestamptz,
  p_comparison_start timestamptz,
  p_comparison_end timestamptz,
  p_timezone text,
  p_now timestamptz,
  p_include_patient_data boolean default false
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public, app_private, pg_temp
as $$
declare
  v_include_patient_data boolean;
  v_result jsonb;
begin
  if p_view not in ('operational', 'commercial') then
    raise exception 'Invalid dashboard view' using errcode = '22023';
  end if;

  if p_current_start >= p_current_end
     or p_comparison_start >= p_comparison_end then
    raise exception 'Invalid dashboard range' using errcode = '22023';
  end if;

  if not exists (
    select 1 from pg_timezone_names where name = p_timezone
  ) then
    raise exception 'Invalid dashboard timezone' using errcode = '22023';
  end if;

  if not app_private.current_is_super_admin() and (
    p_organization_id is distinct from app_private.current_organization_id()
    or not app_private.current_user_has_permission('agenda.ver')
  ) then
    raise exception 'Insufficient dashboard permission' using errcode = '42501';
  end if;

  v_include_patient_data := p_include_patient_data and (
    app_private.current_is_super_admin()
    or app_private.current_user_has_permission('paciente.ver')
  );

  with scoped_appointments as materialized (
    select
      a.id,
      a.patient_id,
      a.procedure_id,
      a.health_insurance_id,
      a.status,
      a.start_at,
      a.end_at,
      a.created_at,
      case
        when (
          case when p_view = 'commercial' then a.created_at else a.start_at end
        ) >= p_current_start
        and (
          case when p_view = 'commercial' then a.created_at else a.start_at end
        ) < p_current_end then 'current'
        else 'comparison'
      end as range_key
    from public.appointments a
    where a.organization_id = p_organization_id
      and (
        (
          (case when p_view = 'commercial' then a.created_at else a.start_at end)
            >= p_current_start
          and
          (case when p_view = 'commercial' then a.created_at else a.start_at end)
            < p_current_end
        )
        or
        (
          (case when p_view = 'commercial' then a.created_at else a.start_at end)
            >= p_comparison_start
          and
          (case when p_view = 'commercial' then a.created_at else a.start_at end)
            < p_comparison_end
        )
      )
  ),
  current_rows as materialized (
    select * from scoped_appointments where range_key = 'current'
  ),
  comparison_rows as materialized (
    select * from scoped_appointments where range_key = 'comparison'
  ),
  current_mix as materialized (
    select *
    from current_rows
    where p_view = 'commercial' or status <> 'cancelled'
  ),
  current_stats as (
    select
      count(*)::integer as total,
      count(*) filter (where status = 'attended')::integer as attended,
      count(*) filter (where status = 'no_show')::integer as no_shows,
      count(*) filter (where status = 'cancelled')::integer as cancellations,
      count(distinct patient_id)::integer as unique_patients
    from current_rows
  ),
  comparison_stats as (
    select
      count(*)::integer as total,
      count(*) filter (where status = 'attended')::integer as attended,
      count(*) filter (where status = 'no_show')::integer as no_shows,
      count(*) filter (where status = 'cancelled')::integer as cancellations,
      count(distinct patient_id)::integer as unique_patients
    from comparison_rows
  ),
  timing_stats as (
    select
      avg(
        case
          when p_view = 'commercial'
            then extract(epoch from (start_at - created_at)) / 86400.0
          else extract(epoch from (end_at - start_at)) / 60.0
        end
      ) filter (
        where case
          when p_view = 'commercial' then start_at >= created_at
          else end_at >= start_at
        end
      ) as average_value,
      avg(
        case
          when p_view = 'commercial'
            then extract(epoch from (start_at - created_at)) / 86400.0
          else extract(epoch from (end_at - start_at)) / 60.0
        end
      ) filter (
        where health_insurance_id is null
          and case
            when p_view = 'commercial' then start_at >= created_at
            else end_at >= start_at
          end
      ) as particular_value,
      avg(
        case
          when p_view = 'commercial'
            then extract(epoch from (start_at - created_at)) / 86400.0
          else extract(epoch from (end_at - start_at)) / 60.0
        end
      ) filter (
        where health_insurance_id is not null
          and case
            when p_view = 'commercial' then start_at >= created_at
            else end_at >= start_at
          end
      ) as insurance_value
    from current_mix
  ),
  patient_profile as (
    select
      count(*) filter (
        where p.created_at >= p_current_start and p.created_at < p_current_end
      )::integer as new_count,
      count(*) filter (
        where not (
          p.created_at >= p_current_start and p.created_at < p_current_end
        )
      )::integer as recurring_count
    from current_mix a
    join public.patients p
      on p.organization_id = p_organization_id and p.id = a.patient_id
    where v_include_patient_data
  ),
  cohort_patients as materialized (
    select distinct
      p.id,
      p.birth_date,
      p.sex_at_birth
    from current_mix a
    join public.patients p
      on p.organization_id = p_organization_id and p.id = a.patient_id
    where v_include_patient_data
  ),
  procedure_counts as (
    select
      coalesce(p.name, 'Sem procedimento') as label,
      count(*)::integer as value
    from current_mix a
    left join public.procedures p
      on p.organization_id = p_organization_id and p.id = a.procedure_id
    group by coalesce(p.name, 'Sem procedimento')
    order by value desc, label
    limit 5
  ),
  insurance_counts as (
    select
      coalesce(i.name, 'Convenio') as label,
      count(*)::integer as value
    from current_mix a
    join public.health_insurances i
      on i.organization_id = p_organization_id
      and i.id = a.health_insurance_id
    group by coalesce(i.name, 'Convenio')
    order by value desc, label
    limit 5
  ),
  period_counts as (
    select
      (
        case when p_view = 'commercial' then created_at else start_at end
        at time zone p_timezone
      )::date as day,
      count(*)::integer as value
    from current_rows
    group by day
  ),
  period_points as (
    select
      series.day::date as day,
      coalesce(pc.value, 0)::integer as value
    from generate_series(
      (p_current_start at time zone p_timezone)::date,
      ((p_current_end - interval '1 microsecond') at time zone p_timezone)::date,
      interval '1 day'
    ) as series(day)
    left join period_counts pc on pc.day = series.day::date
    order by series.day
  ),
  age_counts as (
    select
      extract(
        year from age((p_now at time zone p_timezone)::date, birth_date)
      )::integer as age,
      count(*)::integer as value
    from cohort_patients
    where birth_date is not null
    group by age
    order by age
  )
  select jsonb_build_object(
    'patient_data_available', v_include_patient_data,
    'current_stats', jsonb_build_object(
      'total', cs.total,
      'valid', cs.total - cs.cancellations - cs.no_shows,
      'attended', cs.attended,
      'unique_patients', cs.unique_patients,
      'no_show_rate', round(
        100.0 * cs.no_shows / nullif(cs.attended + cs.no_shows, 0)
      )::integer,
      'cancellation_rate', round(
        100.0 * cs.cancellations / nullif(cs.total, 0)
      )::integer
    ),
    'comparison_stats', jsonb_build_object(
      'total', cps.total,
      'valid', cps.total - cps.cancellations - cps.no_shows,
      'attended', cps.attended,
      'unique_patients', cps.unique_patients,
      'no_show_rate', round(
        100.0 * cps.no_shows / nullif(cps.attended + cps.no_shows, 0)
      )::integer,
      'cancellation_rate', round(
        100.0 * cps.cancellations / nullif(cps.total, 0)
      )::integer
    ),
    'current_new_patients', case when v_include_patient_data then (
      select count(*)::integer
      from public.patients p
      where p.organization_id = p_organization_id
        and p.created_at >= p_current_start
        and p.created_at < p_current_end
    ) else 0 end,
    'comparison_new_patients', case when v_include_patient_data then (
      select count(*)::integer
      from public.patients p
      where p.organization_id = p_organization_id
        and p.created_at >= p_comparison_start
        and p.created_at < p_comparison_end
    ) else 0 end,
    'average_lead_days', (
      select avg(extract(epoch from (start_at - created_at)) / 86400.0)
      from current_rows
      where start_at >= created_at
    ),
    'charts', jsonb_build_object(
      'patients', jsonb_build_object(
        'new_count', coalesce(pp.new_count, 0),
        'recurring_count', coalesce(pp.recurring_count, 0),
        'male_count', case when v_include_patient_data then (
          select count(*)::integer from cohort_patients where sex_at_birth = 'male'
        ) else 0 end,
        'female_count', case when v_include_patient_data then (
          select count(*)::integer from cohort_patients where sex_at_birth = 'female'
        ) else 0 end
      ),
      'procedures', coalesce((
        select jsonb_agg(
          jsonb_build_object('label', label, 'value', value)
          order by value desc, label
        ) from procedure_counts
      ), '[]'::jsonb),
      'insurance_status', jsonb_build_object(
        'with_insurance', (
          select count(*)::integer
          from current_mix where health_insurance_id is not null
        ),
        'without_insurance', (
          select count(*)::integer
          from current_mix where health_insurance_id is null
        )
      ),
      'insurance_breakdown', coalesce((
        select jsonb_agg(
          jsonb_build_object('label', label, 'value', value)
          order by value desc, label
        ) from insurance_counts
      ), '[]'::jsonb),
      'timing', jsonb_build_object(
        'average_value', ts.average_value,
        'particular_value', ts.particular_value,
        'insurance_value', ts.insurance_value
      ),
      'cancellations', jsonb_build_object(
        'no_shows', cs.no_shows,
        'cancellations', cs.cancellations,
        'no_show_rate', round(
          100.0 * cs.no_shows / nullif(cs.attended + cs.no_shows, 0)
        )::integer,
        'cancellation_rate', round(
          100.0 * cs.cancellations / nullif(cs.total, 0)
        )::integer
      ),
      'period_points', coalesce((
        select jsonb_agg(
          jsonb_build_object('date', day::text, 'value', value)
          order by day
        ) from period_points
      ), '[]'::jsonb),
      'age_distribution', case when v_include_patient_data then coalesce((
        select jsonb_agg(
          jsonb_build_object('age', age, 'value', value)
          order by age
        ) from age_counts
      ), '[]'::jsonb) else '[]'::jsonb end,
      'birthdays', case when v_include_patient_data then coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', p.id,
            'name', coalesce(p.social_name, p.full_name),
            'age', extract(
              year from age((p_now at time zone p_timezone)::date, p.birth_date)
            )::integer
          ) order by coalesce(p.social_name, p.full_name)
        )
        from public.patients p
        where p.organization_id = p_organization_id
          and p.deleted_at is null
          and p.status = 'active'
          and p.birth_date is not null
          and extract(month from p.birth_date) = extract(
            month from (p_now at time zone p_timezone)::date
          )
          and extract(day from p.birth_date) = extract(
            day from (p_now at time zone p_timezone)::date
          )
      ), '[]'::jsonb) else '[]'::jsonb end,
      'commercial_summary', jsonb_build_object(
        'future', (
          select count(*)::integer from current_rows
          where status not in ('attended', 'cancelled', 'no_show')
            and start_at > p_now
        ),
        'attended', cs.attended,
        'open', (
          select count(*)::integer from current_rows
          where status not in ('attended', 'cancelled', 'no_show')
            and start_at <= p_now
        ),
        'losses', cs.no_shows + cs.cancellations
      )
    )
  )
  into v_result
  from current_stats cs
  cross join comparison_stats cps
  cross join timing_stats ts
  cross join patient_profile pp;

  return v_result;
end;
$$;

revoke all on function public.dashboard_company_aggregates(
  uuid, text, timestamptz, timestamptz, timestamptz, timestamptz,
  text, timestamptz, boolean
) from public;

grant execute on function public.dashboard_company_aggregates(
  uuid, text, timestamptz, timestamptz, timestamptz, timestamptz,
  text, timestamptz, boolean
) to authenticated, service_role;
