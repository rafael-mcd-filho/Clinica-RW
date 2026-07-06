import type { SupabaseClient } from "@supabase/supabase-js";

export type ReportFilters = {
  from: string;
  to: string;
  professionalId: string;
  unitId: string;
  healthInsuranceId: string;
  procedureId: string;
};

export type ReportPermissions = {
  operational: boolean;
  financial: boolean;
  clinical: boolean;
  export: boolean;
};

export type ReportOption = {
  id: string;
  name: string;
};

export type ReportPoint = {
  label: string;
  value: number;
};

export type ReportBreakdown = {
  label: string;
  value: number;
};

export type OperationalProfessionalRow = {
  professionalId: string | null;
  professionalName: string;
  appointments: number;
  attended: number;
  noShows: number;
  cancellations: number;
  occupiedMinutes: number;
  occupancyRate: number | null;
};

export type ProfessionalReportRow = {
  professionalId: string | null;
  professionalName: string;
  appointments: number;
  attended: number;
  noShowRate: number;
  revenue: number;
  receivable: number;
  finalizedEncounters: number;
};

export type ReportData = {
  filters: ReportFilters;
  permissions: ReportPermissions;
  options: {
    professionals: ReportOption[];
    units: ReportOption[];
    healthInsurances: ReportOption[];
    procedures: ReportOption[];
  };
  operational: {
    totalAppointments: number;
    attended: number;
    noShows: number;
    cancellations: number;
    noShowRate: number;
    occupancyRate: number | null;
    averageDurationMinutes: number | null;
    newPatients: number;
    recurringPatients: number;
    dailyVolume: ReportPoint[];
    statusBreakdown: ReportBreakdown[];
    procedureBreakdown: ReportBreakdown[];
    professionals: OperationalProfessionalRow[];
  } | null;
  financial: {
    revenue: number;
    receivable: number;
    openReceivable: number;
    overdueReceivable: number;
    expenses: number;
    pendingPayouts: number;
    netResult: number;
    paymentMethods: ReportBreakdown[];
    insuranceRevenue: ReportBreakdown[];
  } | null;
  clinical: {
    totalEncounters: number;
    finalizedEncounters: number;
    draftEncounters: number;
    averageCompletionHours: number | null;
    diagnoses: ReportBreakdown[];
    procedures: ReportBreakdown[];
  } | null;
  professionals: ProfessionalReportRow[];
};

type SearchParamsInput =
  | URLSearchParams
  | Record<string, string | string[] | undefined>
  | undefined;

type AppointmentRow = {
  id: string;
  patient_id: string;
  professional_id: string;
  procedure_id: string;
  unit_id: string;
  health_insurance_id: string | null;
  status: string;
  start_at: string;
  end_at: string;
};

type ScheduleRow = {
  id: string;
  professional_id: string;
  unit_id: string;
};

type AvailabilityRow = {
  schedule_id: string;
  weekday: number;
  start_time: string;
  end_time: string;
};

type ReceivableRow = {
  id: string;
  appointment_id: string | null;
  professional_id: string | null;
  procedure_id: string | null;
  health_insurance_id: string | null;
  amount: number;
  paid_amount: number;
  due_date: string;
  status: string;
};

type PaymentRow = {
  id: string;
  account_receivable_id: string;
  amount: number;
  paid_at: string;
  payment_methods: { name: string } | null;
  accounts_receivable: {
    appointment_id: string | null;
    professional_id: string | null;
    procedure_id: string | null;
    health_insurance_id: string | null;
  } | null;
};

type PayableRow = {
  amount: number;
  due_date: string;
  paid_at: string | null;
  status: string;
};

type PayoutRow = {
  professional_id: string;
  amount: number;
  status: string;
};

type EncounterRow = {
  id: string;
  professional_id: string;
  appointment_id: string | null;
  status: string;
  started_at: string;
  finalized_at: string | null;
};

type DiagnosisRow = {
  encounter_id: string;
  cid_code: string;
  description: string | null;
};

const emptyPermissions: ReportPermissions = {
  operational: false,
  financial: false,
  clinical: false,
  export: false,
};

export function resolveReportPermissions(permissionCodes: Set<string>) {
  return {
    operational: permissionCodes.has("relatorio.operacional"),
    financial: permissionCodes.has("relatorio.financeiro"),
    clinical: permissionCodes.has("relatorio.clinico"),
    export: permissionCodes.has("relatorio.exportar"),
  };
}

export function hasAnyReportPermission(permissions: ReportPermissions) {
  return (
    permissions.operational || permissions.financial || permissions.clinical
  );
}

export function resolveReportFilters(input: SearchParamsInput): ReportFilters {
  const today = new Date();
  const from = new Date(today);
  from.setDate(from.getDate() - 30);

  const fallbackFrom = toDateInputValue(from);
  const fallbackTo = toDateInputValue(today);

  return {
    from: normalizeDateParam(readParam(input, "from"), fallbackFrom),
    to: normalizeDateParam(readParam(input, "to"), fallbackTo),
    professionalId: normalizeIdParam(readParam(input, "professional_id")),
    unitId: normalizeIdParam(readParam(input, "unit_id")),
    healthInsuranceId: normalizeIdParam(
      readParam(input, "health_insurance_id"),
    ),
    procedureId: normalizeIdParam(readParam(input, "procedure_id")),
  };
}

export function createReportQueryString(
  filters: ReportFilters,
  extra?: Record<string, string>,
) {
  const params = new URLSearchParams();
  params.set("from", filters.from);
  params.set("to", filters.to);
  if (filters.professionalId) {
    params.set("professional_id", filters.professionalId);
  }
  if (filters.unitId) params.set("unit_id", filters.unitId);
  if (filters.healthInsuranceId) {
    params.set("health_insurance_id", filters.healthInsuranceId);
  }
  if (filters.procedureId) params.set("procedure_id", filters.procedureId);

  for (const [key, value] of Object.entries(extra ?? {})) {
    params.set(key, value);
  }

  return params.toString();
}

export async function buildPhase13ReportData({
  filters,
  organizationId,
  permissions,
  supabase,
}: {
  filters: ReportFilters;
  organizationId: string;
  permissions: ReportPermissions;
  supabase: SupabaseClient;
}): Promise<ReportData> {
  const periodStart = new Date(`${filters.from}T00:00:00.000Z`);
  const periodEnd = new Date(`${filters.to}T23:59:59.999Z`);
  const hasReports = hasAnyReportPermission(permissions);

  const [professionalsResult, unitsResult, proceduresResult, insurancesResult] =
    await Promise.all([
      supabase
        .from("professionals")
        .select("id, name")
        .eq("organization_id", organizationId)
        .order("name")
        .returns<ReportOption[]>(),
      supabase
        .from("units")
        .select("id, name")
        .eq("organization_id", organizationId)
        .order("name")
        .returns<ReportOption[]>(),
      supabase
        .from("procedures")
        .select("id, name")
        .eq("organization_id", organizationId)
        .order("name")
        .returns<ReportOption[]>(),
      supabase
        .from("health_insurances")
        .select("id, name")
        .eq("organization_id", organizationId)
        .order("name")
        .returns<ReportOption[]>(),
    ]);

  const options = {
    professionals: professionalsResult.data ?? [],
    units: unitsResult.data ?? [],
    healthInsurances: insurancesResult.data ?? [],
    procedures: proceduresResult.data ?? [],
  };
  const names = buildNameMaps(options);

  const appointmentsResult = hasReports
    ? await queryAppointmentContext({
        filters,
        organizationId,
        periodEnd,
        supabase,
      })
    : { data: [] as AppointmentRow[] };
  const appointmentContext = appointmentsResult.data ?? [];
  const appointments = appointmentContext.filter((appointment) =>
    isWithinPeriod(appointment.start_at, periodStart, periodEnd),
  );
  const appointmentById = new Map(
    appointmentContext.map((appointment) => [appointment.id, appointment]),
  );

  const [schedulesResult, availabilityResult] = permissions.operational
    ? await Promise.all([
        querySchedules({ filters, organizationId, supabase }),
        supabase
          .from("schedule_availability")
          .select("schedule_id, weekday, start_time, end_time")
          .eq("organization_id", organizationId)
          .returns<AvailabilityRow[]>(),
      ])
    : [{ data: [] as ScheduleRow[] }, { data: [] as AvailabilityRow[] }];

  const [receivablesResult, paymentsResult, payablesResult, payoutsResult] =
    permissions.financial
      ? await Promise.all([
          supabase
            .from("accounts_receivable")
            .select(
              "id, appointment_id, professional_id, procedure_id, health_insurance_id, amount, paid_amount, due_date, status",
            )
            .eq("organization_id", organizationId)
            .gte("due_date", filters.from)
            .lte("due_date", filters.to)
            .returns<ReceivableRow[]>(),
          supabase
            .from("payments")
            .select(
              "id, account_receivable_id, amount, paid_at, payment_methods(name), accounts_receivable(appointment_id, professional_id, procedure_id, health_insurance_id)",
            )
            .eq("organization_id", organizationId)
            .gte("paid_at", periodStart.toISOString())
            .lte("paid_at", periodEnd.toISOString())
            .returns<PaymentRow[]>(),
          supabase
            .from("accounts_payable")
            .select("amount, due_date, paid_at, status")
            .eq("organization_id", organizationId)
            .gte("due_date", filters.from)
            .lte("due_date", filters.to)
            .returns<PayableRow[]>(),
          supabase
            .from("professional_payouts")
            .select("professional_id, amount, status")
            .eq("organization_id", organizationId)
            .gte("due_date", filters.from)
            .lte("due_date", filters.to)
            .returns<PayoutRow[]>(),
        ])
      : [
          { data: [] as ReceivableRow[] },
          { data: [] as PaymentRow[] },
          { data: [] as PayableRow[] },
          { data: [] as PayoutRow[] },
        ];

  const receivables = (receivablesResult.data ?? []).filter((row) =>
    matchesReportFilters(row, filters, appointmentById),
  );
  const payments = (paymentsResult.data ?? []).filter((row) =>
    matchesReportFilters(row.accounts_receivable, filters, appointmentById),
  );
  const payouts = (payoutsResult.data ?? []).filter((row) =>
    filters.professionalId
      ? row.professional_id === filters.professionalId
      : true,
  );

  const encountersResult = permissions.clinical
    ? await supabase
        .from("encounters")
        .select(
          "id, professional_id, appointment_id, status, started_at, finalized_at",
        )
        .eq("organization_id", organizationId)
        .gte("started_at", periodStart.toISOString())
        .lte("started_at", periodEnd.toISOString())
        .returns<EncounterRow[]>()
    : { data: [] as EncounterRow[] };
  const encounters = (encountersResult.data ?? []).filter((row) =>
    matchesEncounterFilters(row, filters, appointmentById),
  );
  const encounterIds = encounters.map((encounter) => encounter.id);
  const diagnosesResult = encounterIds.length
    ? await supabase
        .from("encounter_diagnoses")
        .select("encounter_id, cid_code, description")
        .eq("organization_id", organizationId)
        .in("encounter_id", encounterIds)
        .returns<DiagnosisRow[]>()
    : { data: [] as DiagnosisRow[] };

  return {
    filters,
    permissions,
    options,
    operational: permissions.operational
      ? buildOperationalReport({
          appointments,
          appointmentHistory: appointmentContext,
          availability: availabilityResult.data ?? [],
          names,
          periodEnd,
          periodStart,
          schedules: schedulesResult.data ?? [],
        })
      : null,
    financial: permissions.financial
      ? buildFinancialReport({
          appointmentById,
          filters,
          names,
          payables: payablesResult.data ?? [],
          payments,
          payouts,
          receivables,
        })
      : null,
    clinical: permissions.clinical
      ? buildClinicalReport({
          appointmentById,
          diagnoses: diagnosesResult.data ?? [],
          encounters,
          names,
        })
      : null,
    professionals: buildProfessionalRows({
      appointments: permissions.operational ? appointments : [],
      encounters: permissions.clinical ? encounters : [],
      names,
      payments: permissions.financial ? payments : [],
      receivables: permissions.financial ? receivables : [],
    }),
  };
}

function readParam(input: SearchParamsInput, key: string) {
  if (!input) return undefined;
  if (input instanceof URLSearchParams) return input.get(key) ?? undefined;
  const value = input[key];
  return Array.isArray(value) ? value[0] : value;
}

function normalizeDateParam(value: string | undefined, fallback: string) {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : fallback;
}

function normalizeIdParam(value: string | undefined) {
  return value && /^[0-9a-fA-F-]{36}$/.test(value) ? value : "";
}

function toDateInputValue(value: Date) {
  return value.toISOString().slice(0, 10);
}

async function queryAppointmentContext({
  filters,
  organizationId,
  periodEnd,
  supabase,
}: {
  filters: ReportFilters;
  organizationId: string;
  periodEnd: Date;
  supabase: SupabaseClient;
}) {
  let query = supabase
    .from("appointments")
    .select(
      "id, patient_id, professional_id, procedure_id, unit_id, health_insurance_id, status, start_at, end_at",
    )
    .eq("organization_id", organizationId)
    .lte("start_at", periodEnd.toISOString());

  if (filters.professionalId) {
    query = query.eq("professional_id", filters.professionalId);
  }
  if (filters.unitId) query = query.eq("unit_id", filters.unitId);
  if (filters.healthInsuranceId) {
    query = query.eq("health_insurance_id", filters.healthInsuranceId);
  }
  if (filters.procedureId)
    query = query.eq("procedure_id", filters.procedureId);

  return query.order("start_at").returns<AppointmentRow[]>();
}

async function querySchedules({
  filters,
  organizationId,
  supabase,
}: {
  filters: ReportFilters;
  organizationId: string;
  supabase: SupabaseClient;
}) {
  let query = supabase
    .from("schedules")
    .select("id, professional_id, unit_id")
    .eq("organization_id", organizationId)
    .eq("active", true);

  if (filters.professionalId) {
    query = query.eq("professional_id", filters.professionalId);
  }
  if (filters.unitId) query = query.eq("unit_id", filters.unitId);

  return query.returns<ScheduleRow[]>();
}

function buildNameMaps(options: ReportData["options"]) {
  return {
    professionals: new Map(
      options.professionals.map((item) => [item.id, item.name]),
    ),
    procedures: new Map(options.procedures.map((item) => [item.id, item.name])),
    healthInsurances: new Map(
      options.healthInsurances.map((item) => [item.id, item.name]),
    ),
  };
}

function buildOperationalReport({
  appointments,
  appointmentHistory,
  availability,
  names,
  periodEnd,
  periodStart,
  schedules,
}: {
  appointments: AppointmentRow[];
  appointmentHistory: AppointmentRow[];
  availability: AvailabilityRow[];
  names: ReturnType<typeof buildNameMaps>;
  periodEnd: Date;
  periodStart: Date;
  schedules: ScheduleRow[];
}) {
  const activeAppointments = appointments.filter(
    (appointment) => !["cancelled", "no_show"].includes(appointment.status),
  );
  const attended = appointments.filter(
    (appointment) => appointment.status === "attended",
  ).length;
  const noShows = appointments.filter(
    (appointment) => appointment.status === "no_show",
  ).length;
  const cancellations = appointments.filter(
    (appointment) => appointment.status === "cancelled",
  ).length;
  const occupiedMinutes = sumDurations(activeAppointments);
  const capacityMinutes = calculateCapacityMinutes({
    availability,
    periodEnd,
    periodStart,
    schedules,
  });
  const patientFirstAppointment = new Map<string, string>();

  for (const appointment of appointmentHistory) {
    const current = patientFirstAppointment.get(appointment.patient_id);
    if (!current || appointment.start_at < current) {
      patientFirstAppointment.set(appointment.patient_id, appointment.start_at);
    }
  }

  const patientIdsInPeriod = new Set(
    appointments.map((appointment) => appointment.patient_id),
  );
  const newPatients = [...patientIdsInPeriod].filter((patientId) => {
    const first = patientFirstAppointment.get(patientId);
    return first ? new Date(first) >= periodStart : false;
  }).length;
  const recurringPatients = Math.max(0, patientIdsInPeriod.size - newPatients);
  const durations = activeAppointments
    .map((appointment) => appointmentDurationMinutes(appointment))
    .filter((value): value is number => value != null);

  return {
    totalAppointments: appointments.length,
    attended,
    noShows,
    cancellations,
    noShowRate: percent(noShows, appointments.length),
    occupancyRate: capacityMinutes
      ? percent(occupiedMinutes, capacityMinutes)
      : null,
    averageDurationMinutes: average(durations),
    newPatients,
    recurringPatients,
    dailyVolume: buildDailyPoints(periodStart, periodEnd, appointments),
    statusBreakdown: toBreakdown(countBy(appointments, statusLabel)),
    procedureBreakdown: toBreakdown(
      countBy(
        activeAppointments,
        (appointment) =>
          names.procedures.get(appointment.procedure_id) ?? "Sem procedimento",
      ),
    ),
    professionals: buildOperationalProfessionalRows({
      activeAppointments,
      appointments,
      capacityByProfessional: calculateCapacityByProfessional({
        availability,
        periodEnd,
        periodStart,
        schedules,
      }),
      names,
    }),
  };
}

function buildFinancialReport({
  appointmentById,
  filters,
  names,
  payables,
  payments,
  payouts,
  receivables,
}: {
  appointmentById: Map<string, AppointmentRow>;
  filters: ReportFilters;
  names: ReturnType<typeof buildNameMaps>;
  payables: PayableRow[];
  payments: PaymentRow[];
  payouts: PayoutRow[];
  receivables: ReceivableRow[];
}) {
  const filteredPayables = payables.filter(() => !hasCareFilter(filters));
  const revenue = sum(payments, (payment) => numberValue(payment.amount));
  const expenses = sum(
    filteredPayables.filter((payable) => payable.status === "paid"),
    (payable) => numberValue(payable.amount),
  );
  const today = toDateInputValue(new Date());
  const openReceivable = sum(
    receivables.filter((receivable) =>
      ["open", "partial"].includes(receivable.status),
    ),
    (receivable) =>
      Math.max(
        0,
        numberValue(receivable.amount) - numberValue(receivable.paid_amount),
      ),
  );
  const overdueReceivable = sum(
    receivables.filter(
      (receivable) =>
        ["open", "partial"].includes(receivable.status) &&
        receivable.due_date < today,
    ),
    (receivable) =>
      Math.max(
        0,
        numberValue(receivable.amount) - numberValue(receivable.paid_amount),
      ),
  );

  return {
    revenue,
    receivable: sum(receivables, (receivable) =>
      numberValue(receivable.amount),
    ),
    openReceivable,
    overdueReceivable,
    expenses,
    pendingPayouts: sum(
      payouts.filter((payout) => payout.status === "pending"),
      (payout) => numberValue(payout.amount),
    ),
    netResult: revenue - expenses,
    paymentMethods: toBreakdown(
      sumBy(
        payments,
        (payment) => payment.payment_methods?.name ?? "Nao informado",
        (payment) => numberValue(payment.amount),
      ),
    ),
    insuranceRevenue: toBreakdown(
      sumBy(
        payments,
        (payment) => {
          const source = payment.accounts_receivable;
          const appointment = source?.appointment_id
            ? appointmentById.get(source.appointment_id)
            : null;
          const insuranceId =
            source?.health_insurance_id ??
            appointment?.health_insurance_id ??
            null;
          return insuranceId
            ? (names.healthInsurances.get(insuranceId) ?? "Convenio")
            : "Particular";
        },
        (payment) => numberValue(payment.amount),
      ),
    ),
  };
}

function buildClinicalReport({
  appointmentById,
  diagnoses,
  encounters,
  names,
}: {
  appointmentById: Map<string, AppointmentRow>;
  diagnoses: DiagnosisRow[];
  encounters: EncounterRow[];
  names: ReturnType<typeof buildNameMaps>;
}) {
  const finalized = encounters.filter(
    (encounter) => encounter.status === "finalized",
  );
  const completionDurations = finalized
    .map((encounter) => {
      if (!encounter.finalized_at) return null;
      const startedAt = new Date(encounter.started_at).getTime();
      const finalizedAt = new Date(encounter.finalized_at).getTime();
      return finalizedAt > startedAt
        ? (finalizedAt - startedAt) / 3_600_000
        : null;
    })
    .filter((value): value is number => value != null);

  return {
    totalEncounters: encounters.length,
    finalizedEncounters: finalized.length,
    draftEncounters: encounters.length - finalized.length,
    averageCompletionHours: average(completionDurations),
    diagnoses: toBreakdown(
      countBy(
        diagnoses,
        (diagnosis) =>
          `${diagnosis.cid_code}${diagnosis.description ? ` - ${diagnosis.description}` : ""}`,
      ),
    ),
    procedures: toBreakdown(
      countBy(encounters, (encounter) => {
        const appointment = encounter.appointment_id
          ? appointmentById.get(encounter.appointment_id)
          : null;
        return appointment
          ? (names.procedures.get(appointment.procedure_id) ?? "Procedimento")
          : "Sem agendamento";
      }),
    ),
  };
}

function buildProfessionalRows({
  appointments,
  encounters,
  names,
  payments,
  receivables,
}: {
  appointments: AppointmentRow[];
  encounters: EncounterRow[];
  names: ReturnType<typeof buildNameMaps>;
  payments: PaymentRow[];
  receivables: ReceivableRow[];
}) {
  const ids = new Set<string>();
  for (const appointment of appointments) ids.add(appointment.professional_id);
  for (const encounter of encounters) ids.add(encounter.professional_id);
  for (const receivable of receivables) {
    if (receivable.professional_id) ids.add(receivable.professional_id);
  }
  for (const payment of payments) {
    if (payment.accounts_receivable?.professional_id) {
      ids.add(payment.accounts_receivable.professional_id);
    }
  }

  return [...ids]
    .map((professionalId) => {
      const professionalAppointments = appointments.filter(
        (appointment) => appointment.professional_id === professionalId,
      );
      const noShows = professionalAppointments.filter(
        (appointment) => appointment.status === "no_show",
      ).length;

      return {
        professionalId,
        professionalName:
          names.professionals.get(professionalId) ?? "Profissional",
        appointments: professionalAppointments.length,
        attended: professionalAppointments.filter(
          (appointment) => appointment.status === "attended",
        ).length,
        noShowRate: percent(noShows, professionalAppointments.length),
        revenue: sum(
          payments.filter(
            (payment) =>
              payment.accounts_receivable?.professional_id === professionalId,
          ),
          (payment) => numberValue(payment.amount),
        ),
        receivable: sum(
          receivables.filter(
            (receivable) => receivable.professional_id === professionalId,
          ),
          (receivable) => numberValue(receivable.amount),
        ),
        finalizedEncounters: encounters.filter(
          (encounter) =>
            encounter.professional_id === professionalId &&
            encounter.status === "finalized",
        ).length,
      };
    })
    .sort((a, b) => b.appointments + b.revenue - (a.appointments + a.revenue));
}

function buildOperationalProfessionalRows({
  activeAppointments,
  appointments,
  capacityByProfessional,
  names,
}: {
  activeAppointments: AppointmentRow[];
  appointments: AppointmentRow[];
  capacityByProfessional: Map<string, number>;
  names: ReturnType<typeof buildNameMaps>;
}) {
  const ids = new Set(
    appointments.map((appointment) => appointment.professional_id),
  );
  return [...ids]
    .map((professionalId) => {
      const rows = appointments.filter(
        (appointment) => appointment.professional_id === professionalId,
      );
      const activeRows = activeAppointments.filter(
        (appointment) => appointment.professional_id === professionalId,
      );
      const occupiedMinutes = sumDurations(activeRows);
      const capacityMinutes = capacityByProfessional.get(professionalId) ?? 0;

      return {
        professionalId,
        professionalName:
          names.professionals.get(professionalId) ?? "Profissional",
        appointments: rows.length,
        attended: rows.filter(
          (appointment) => appointment.status === "attended",
        ).length,
        noShows: rows.filter((appointment) => appointment.status === "no_show")
          .length,
        cancellations: rows.filter(
          (appointment) => appointment.status === "cancelled",
        ).length,
        occupiedMinutes,
        occupancyRate: capacityMinutes
          ? percent(occupiedMinutes, capacityMinutes)
          : null,
      };
    })
    .sort((a, b) => b.appointments - a.appointments);
}

function matchesEncounterFilters(
  row: EncounterRow,
  filters: ReportFilters,
  appointmentById: Map<string, AppointmentRow>,
) {
  if (
    filters.professionalId &&
    row.professional_id !== filters.professionalId
  ) {
    return false;
  }
  if (!hasAppointmentFilter(filters)) return true;
  if (!row.appointment_id) return false;
  const appointment = appointmentById.get(row.appointment_id);
  return appointment ? matchesAppointmentFilters(appointment, filters) : false;
}

function matchesReportFilters(
  row: {
    appointment_id: string | null;
    professional_id: string | null;
    procedure_id: string | null;
    health_insurance_id: string | null;
  } | null,
  filters: ReportFilters,
  appointmentById: Map<string, AppointmentRow>,
) {
  if (!row) return false;
  if (
    filters.professionalId &&
    row.professional_id !== filters.professionalId
  ) {
    return false;
  }
  if (filters.procedureId && row.procedure_id !== filters.procedureId) {
    return false;
  }
  if (
    filters.healthInsuranceId &&
    row.health_insurance_id !== filters.healthInsuranceId
  ) {
    return false;
  }
  if (filters.unitId) {
    const appointment = row.appointment_id
      ? appointmentById.get(row.appointment_id)
      : null;
    return appointment?.unit_id === filters.unitId;
  }
  return true;
}

function matchesAppointmentFilters(
  appointment: AppointmentRow,
  filters: ReportFilters,
) {
  if (
    filters.professionalId &&
    appointment.professional_id !== filters.professionalId
  ) {
    return false;
  }
  if (filters.unitId && appointment.unit_id !== filters.unitId) return false;
  if (
    filters.healthInsuranceId &&
    appointment.health_insurance_id !== filters.healthInsuranceId
  ) {
    return false;
  }
  if (filters.procedureId && appointment.procedure_id !== filters.procedureId) {
    return false;
  }
  return true;
}

function hasCareFilter(filters: ReportFilters) {
  return Boolean(
    filters.professionalId ||
    filters.unitId ||
    filters.healthInsuranceId ||
    filters.procedureId,
  );
}

function hasAppointmentFilter(filters: ReportFilters) {
  return Boolean(
    filters.unitId || filters.healthInsuranceId || filters.procedureId,
  );
}

function buildDailyPoints(
  periodStart: Date,
  periodEnd: Date,
  appointments: AppointmentRow[],
) {
  const counts = countBy(appointments, (appointment) =>
    toDateInputValue(new Date(appointment.start_at)),
  );
  const points: ReportPoint[] = [];
  const cursor = new Date(periodStart);

  while (cursor <= periodEnd) {
    const key = toDateInputValue(cursor);
    points.push({
      label: formatShortDate(cursor),
      value: counts.get(key) ?? 0,
    });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return points;
}

function calculateCapacityMinutes({
  availability,
  periodEnd,
  periodStart,
  schedules,
}: {
  availability: AvailabilityRow[];
  periodEnd: Date;
  periodStart: Date;
  schedules: ScheduleRow[];
}) {
  return sum(
    [
      ...calculateCapacityByProfessional({
        availability,
        periodEnd,
        periodStart,
        schedules,
      }).values(),
    ],
    (value) => value,
  );
}

function calculateCapacityByProfessional({
  availability,
  periodEnd,
  periodStart,
  schedules,
}: {
  availability: AvailabilityRow[];
  periodEnd: Date;
  periodStart: Date;
  schedules: ScheduleRow[];
}) {
  const availabilityBySchedule = new Map<string, AvailabilityRow[]>();
  for (const item of availability) {
    const list = availabilityBySchedule.get(item.schedule_id) ?? [];
    list.push(item);
    availabilityBySchedule.set(item.schedule_id, list);
  }

  const capacity = new Map<string, number>();
  const cursor = new Date(periodStart);
  while (cursor <= periodEnd) {
    const weekday = cursor.getUTCDay();
    for (const schedule of schedules) {
      const minutes = (availabilityBySchedule.get(schedule.id) ?? [])
        .filter((item) => item.weekday === weekday)
        .reduce(
          (total, item) =>
            total + Math.max(0, minutesBetween(item.start_time, item.end_time)),
          0,
        );
      capacity.set(
        schedule.professional_id,
        (capacity.get(schedule.professional_id) ?? 0) + minutes,
      );
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return capacity;
}

function isWithinPeriod(value: string, periodStart: Date, periodEnd: Date) {
  const date = new Date(value);
  return date >= periodStart && date <= periodEnd;
}

function appointmentDurationMinutes(appointment: AppointmentRow) {
  const startAt = new Date(appointment.start_at).getTime();
  const endAt = new Date(appointment.end_at).getTime();
  if (
    !Number.isFinite(startAt) ||
    !Number.isFinite(endAt) ||
    endAt <= startAt
  ) {
    return null;
  }
  return Math.round((endAt - startAt) / 60_000);
}

function sumDurations(appointments: AppointmentRow[]) {
  return sum(
    appointments,
    (appointment) => appointmentDurationMinutes(appointment) ?? 0,
  );
}

function countBy<T>(items: T[], labelFor: (item: T) => string) {
  const counts = new Map<string, number>();
  for (const item of items) {
    const label = labelFor(item);
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return counts;
}

function sumBy<T>(
  items: T[],
  labelFor: (item: T) => string,
  valueFor: (item: T) => number,
) {
  const counts = new Map<string, number>();
  for (const item of items) {
    const label = labelFor(item);
    counts.set(label, (counts.get(label) ?? 0) + valueFor(item));
  }
  return counts;
}

function sum<T>(items: T[], valueFor: (item: T) => number) {
  return items.reduce((total, item) => total + valueFor(item), 0);
}

function average(values: number[]) {
  if (!values.length) return null;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function percent(value: number, total: number) {
  if (!total) return 0;
  return Math.round((value / total) * 100);
}

function toBreakdown(counts: Map<string, number>) {
  return [...counts.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
}

function numberValue(value: number | string | null | undefined) {
  return Number(value) || 0;
}

function minutesBetween(start: string, end: string) {
  const [startHour = 0, startMinute = 0] = start.split(":").map(Number);
  const [endHour = 0, endMinute = 0] = end.split(":").map(Number);
  return endHour * 60 + endMinute - (startHour * 60 + startMinute);
}

function formatShortDate(date: Date) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "UTC",
  }).format(date);
}

function statusLabel(appointment: AppointmentRow) {
  const labels: Record<string, string> = {
    attended: "Atendido",
    cancelled: "Cancelado",
    confirmed: "Confirmado",
    in_progress: "Em atendimento",
    no_show: "Falta",
    scheduled: "Agendado",
    waiting: "Aguardando",
  };
  return labels[appointment.status] ?? appointment.status;
}

export { emptyPermissions };
