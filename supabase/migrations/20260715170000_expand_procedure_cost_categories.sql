alter table public.procedure_costs
  drop constraint if exists procedure_costs_cost_type_check;

alter table public.procedure_costs
  add constraint procedure_costs_cost_type_check
  check (
    cost_type in (
      'commission',
      'location_fee',
      'materials',
      'outsourced_service',
      'taxes',
      'equipment',
      'other'
    )
  );

comment on column public.procedure_costs.cost_type is
  'Standard category used to group procedure costs consistently in margin reports.';
