create or replace function public.latest_patient_encounters(
  p_organization_id uuid,
  p_patient_ids uuid[]
)
returns table (
  id uuid,
  patient_id uuid,
  status text,
  started_at timestamptz,
  professional_name text,
  insurance_name text
)
language sql
stable
security invoker
set search_path = pg_catalog, public
as $$
  select distinct on (encounter.patient_id)
    encounter.id,
    encounter.patient_id,
    encounter.status::text,
    encounter.started_at,
    professional.name::text as professional_name,
    insurance.name::text as insurance_name
  from public.encounters as encounter
  left join public.professionals as professional
    on professional.id = encounter.professional_id
   and professional.organization_id = encounter.organization_id
  left join public.appointments as appointment
    on appointment.id = encounter.appointment_id
   and appointment.organization_id = encounter.organization_id
  left join public.health_insurances as insurance
    on insurance.id = appointment.health_insurance_id
   and insurance.organization_id = appointment.organization_id
  where encounter.organization_id = p_organization_id
    and encounter.patient_id = any(coalesce(p_patient_ids, array[]::uuid[]))
  order by encounter.patient_id, encounter.started_at desc;
$$;

revoke all on function public.latest_patient_encounters(uuid, uuid[])
  from public;
grant execute on function public.latest_patient_encounters(uuid, uuid[])
  to authenticated, service_role;
