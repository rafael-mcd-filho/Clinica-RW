alter table public.business_hours
  add column if not exists lunch_start_time time,
  add column if not exists lunch_end_time time;

alter table public.business_hours
  drop constraint if exists business_hours_lunch_break_check;

alter table public.business_hours
  add constraint business_hours_lunch_break_check
  check (
    (lunch_start_time is null and lunch_end_time is null)
    or (
      lunch_start_time is not null
      and lunch_end_time is not null
      and start_time < lunch_start_time
      and lunch_start_time < lunch_end_time
      and lunch_end_time < end_time
    )
  );

create or replace function public.replace_clinic_business_hours(
  p_organization_id uuid,
  p_hours jsonb
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
begin
  if not (
    app_private.current_is_super_admin()
    or (
      p_organization_id = app_private.current_organization_id()
      and app_private.current_user_has_permission('config.geral')
    )
  ) then
    raise exception 'Not allowed to change business hours.' using errcode = '42501';
  end if;

  delete from public.business_hours
  where organization_id = p_organization_id
    and unit_id is null
    and professional_id is null;

  insert into public.business_hours (
    organization_id, weekday, start_time, end_time,
    lunch_start_time, lunch_end_time, active
  )
  select
    p_organization_id, value.weekday, value.start_time, value.end_time,
    value.lunch_start_time, value.lunch_end_time, true
  from jsonb_to_recordset(p_hours) as value(
    weekday smallint,
    start_time time,
    end_time time,
    lunch_start_time time,
    lunch_end_time time
  );
end;
$$;

revoke all on function public.replace_clinic_business_hours(uuid, jsonb) from public;
grant execute on function public.replace_clinic_business_hours(uuid, jsonb)
  to authenticated, service_role;

comment on column public.business_hours.lunch_start_time is
  'Optional start of the recurring lunch break.';
comment on column public.business_hours.lunch_end_time is
  'Optional end of the recurring lunch break.';
