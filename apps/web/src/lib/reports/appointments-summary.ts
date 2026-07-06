import type { SupabaseClient } from "@supabase/supabase-js";

export type AppointmentSummaryFilters = {
  from: string;
  to: string;
  unitId: string;
  patientQuery: string;
  healthInsuranceId: string;
  procedureId: string;
  statuses: string[];
  paymentStatuses: string[];
};

export type AppointmentSummaryOption = {
  id: string;
  name: string;
};

export type AppointmentSummaryRow = {
  id: string;
  date: string;
  time: string;
  patientName: string;
  serviceName: string;
  insuranceName: string;
  unitName: string;
  price: number | null;
  source: string;
  status: string;
  statusLabel: string;
  paymentStatus: string;
  paymentStatusLabel: string;
  paymentMethodName: string;
};

export type AppointmentSummaryData = {
  filters: AppointmentSummaryFilters;
  options: {
    units: AppointmentSummaryOption[];
    healthInsurances: AppointmentSummaryOption[];
    procedures: AppointmentSummaryOption[];
  };
  rows: AppointmentSummaryRow[];
  totals: {
    appointments: number;
    amount: number;
    paid: number;
    pending: number;
  };
};

type SearchParamsInput =
  | URLSearchParams
  | Record<string, string | string[] | undefined>
  | undefined;

type AppointmentRow = {
  id: string;
  patient_id: string;
  procedure_id: string;
  health_insurance_id: string | null;
  unit_id: string;
  payment_method_id: string | null;
  status: string;
  start_at: string;
  end_at: string;
  patients: { full_name: string; social_name: string | null } | null;
  procedures: { name: string; base_price: number | string | null } | null;
  health_insurances: { name: string } | null;
  units: { name: string } | null;
  payment_methods: { name: string } | null;
};

type ReceivableRow = {
  appointment_id: string | null;
  amount: number | string;
  paid_amount: number | string;
  status: string;
};

type OnlineRequestRow = {
  appointment_id: string | null;
};

export const appointmentStatusOptions = [
  { value: "scheduled", label: "Programado" },
  { value: "confirmed", label: "Confirmado" },
  { value: "waiting", label: "Aguardando" },
  { value: "in_progress", label: "Em atendimento" },
  { value: "attended", label: "Consulta realizada" },
  { value: "no_show", label: "Nao compareceu" },
  { value: "cancelled", label: "Cancelado" },
];

export const paymentStatusOptions = [
  { value: "paid", label: "Pago" },
  { value: "pending", label: "Pendente" },
  { value: "partial", label: "Parcial" },
  { value: "cancelled", label: "Cancelado/baixado" },
  { value: "none", label: "Sem cobranca" },
];

export function resolveAppointmentSummaryFilters(
  input: SearchParamsInput,
): AppointmentSummaryFilters {
  const today = new Date();
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

  return {
    from: normalizeDateParam(readParam(input, "from"), toDateInput(monthStart)),
    to: normalizeDateParam(readParam(input, "to"), toDateInput(today)),
    unitId: normalizeIdParam(readParam(input, "unit_id")),
    patientQuery: (readParam(input, "patient") ?? "").trim().slice(0, 120),
    healthInsuranceId: normalizeIdParam(
      readParam(input, "health_insurance_id"),
    ),
    procedureId: normalizeIdParam(readParam(input, "procedure_id")),
    statuses: normalizeListParam(input, "status", appointmentStatusOptions),
    paymentStatuses: normalizeListParam(
      input,
      "payment_status",
      paymentStatusOptions,
    ),
  };
}

export function createAppointmentSummaryQueryString(
  filters: AppointmentSummaryFilters,
  extra?: Record<string, string>,
) {
  const params = new URLSearchParams();
  params.set("from", filters.from);
  params.set("to", filters.to);
  if (filters.unitId) params.set("unit_id", filters.unitId);
  if (filters.patientQuery) params.set("patient", filters.patientQuery);
  if (filters.healthInsuranceId) {
    params.set("health_insurance_id", filters.healthInsuranceId);
  }
  if (filters.procedureId) params.set("procedure_id", filters.procedureId);
  for (const status of filters.statuses) params.append("status", status);
  for (const status of filters.paymentStatuses) {
    params.append("payment_status", status);
  }
  for (const [key, value] of Object.entries(extra ?? {})) {
    params.set(key, value);
  }
  return params.toString();
}

export async function buildAppointmentSummaryData({
  filters,
  organizationId,
  supabase,
}: {
  filters: AppointmentSummaryFilters;
  organizationId: string;
  supabase: SupabaseClient;
}): Promise<AppointmentSummaryData> {
  let appointmentsQuery = supabase
    .from("appointments")
    .select(
      "id, patient_id, procedure_id, health_insurance_id, unit_id, payment_method_id, status, start_at, end_at, patients(full_name, social_name), procedures(name, base_price), health_insurances(name), units(name), payment_methods(name)",
    )
    .eq("organization_id", organizationId)
    .gte("start_at", startOfDayIso(filters.from))
    .lte("start_at", endOfDayIso(filters.to))
    .order("start_at", { ascending: true })
    .limit(1000);

  if (filters.unitId) {
    appointmentsQuery = appointmentsQuery.eq("unit_id", filters.unitId);
  }
  if (filters.healthInsuranceId) {
    appointmentsQuery = appointmentsQuery.eq(
      "health_insurance_id",
      filters.healthInsuranceId,
    );
  }
  if (filters.procedureId) {
    appointmentsQuery = appointmentsQuery.eq(
      "procedure_id",
      filters.procedureId,
    );
  }
  if (filters.statuses.length) {
    appointmentsQuery = appointmentsQuery.in("status", filters.statuses);
  }

  const [unitsResult, insurancesResult, proceduresResult, appointmentsResult] =
    await Promise.all([
      supabase
        .from("units")
        .select("id, name")
        .eq("organization_id", organizationId)
        .eq("active", true)
        .order("name")
        .returns<AppointmentSummaryOption[]>(),
      supabase
        .from("health_insurances")
        .select("id, name")
        .eq("organization_id", organizationId)
        .eq("active", true)
        .order("name")
        .returns<AppointmentSummaryOption[]>(),
      supabase
        .from("procedures")
        .select("id, name")
        .eq("organization_id", organizationId)
        .eq("active", true)
        .order("name")
        .returns<AppointmentSummaryOption[]>(),
      appointmentsQuery.returns<AppointmentRow[]>(),
    ]);

  const appointmentRows = filterByPatientQuery(
    appointmentsResult.data ?? [],
    filters.patientQuery,
  );
  const appointmentIds = appointmentRows.map((appointment) => appointment.id);
  const [receivablesResult, onlineRequestsResult] = appointmentIds.length
    ? await Promise.all([
        supabase
          .from("accounts_receivable")
          .select("appointment_id, amount, paid_amount, status")
          .eq("organization_id", organizationId)
          .in("appointment_id", appointmentIds)
          .returns<ReceivableRow[]>(),
        supabase
          .from("online_booking_requests")
          .select("appointment_id")
          .eq("organization_id", organizationId)
          .in("appointment_id", appointmentIds)
          .returns<OnlineRequestRow[]>(),
      ])
    : [{ data: [] as ReceivableRow[] }, { data: [] as OnlineRequestRow[] }];

  const receivableByAppointment = new Map(
    (receivablesResult.data ?? [])
      .filter((item) => item.appointment_id)
      .map((item) => [item.appointment_id as string, item]),
  );
  const onlineAppointmentIds = new Set(
    (onlineRequestsResult.data ?? [])
      .map((item) => item.appointment_id)
      .filter((id): id is string => Boolean(id)),
  );

  const rows = appointmentRows
    .map((appointment): AppointmentSummaryRow => {
      const receivable = receivableByAppointment.get(appointment.id) ?? null;
      const paymentStatus = resolvePaymentStatus(receivable);
      const startAt = new Date(appointment.start_at);
      return {
        id: appointment.id,
        date: formatDate(startAt),
        time: formatTime(startAt),
        patientName:
          appointment.patients?.social_name ||
          appointment.patients?.full_name ||
          "Paciente",
        serviceName: appointment.procedures?.name ?? "Procedimento",
        insuranceName: appointment.health_insurances?.name ?? "Particular",
        unitName: appointment.units?.name ?? "Unidade",
        price: resolvePrice(appointment, receivable),
        source: onlineAppointmentIds.has(appointment.id)
          ? "Agendamento online"
          : "Agenda",
        status: appointment.status,
        statusLabel: appointmentStatusLabel(appointment.status),
        paymentStatus,
        paymentStatusLabel: paymentStatusLabel(paymentStatus),
        paymentMethodName:
          appointment.payment_methods?.name ?? "Nao selecionada",
      };
    })
    .filter(
      (row) =>
        !filters.paymentStatuses.length ||
        filters.paymentStatuses.includes(row.paymentStatus),
    );

  const totals = rows.reduce(
    (summary, row) => {
      const price = row.price ?? 0;
      summary.appointments += 1;
      summary.amount += price;
      if (row.paymentStatus === "paid") summary.paid += price;
      if (["pending", "partial"].includes(row.paymentStatus)) {
        summary.pending += price;
      }
      return summary;
    },
    { appointments: 0, amount: 0, paid: 0, pending: 0 },
  );

  return {
    filters,
    options: {
      units: unitsResult.data ?? [],
      healthInsurances: insurancesResult.data ?? [],
      procedures: proceduresResult.data ?? [],
    },
    rows,
    totals,
  };
}

export function appointmentRowsToCsv(rows: AppointmentSummaryRow[]) {
  const headers = [
    "Data",
    "Horario",
    "Paciente",
    "Servicos",
    "Convenio",
    "Unidade",
    "Preco",
    "Fonte da consulta",
    "Estado",
    "Pagamento",
    "Forma de pagamento",
  ];
  const lines = rows.map((row) =>
    [
      row.date,
      row.time,
      row.patientName,
      row.serviceName,
      row.insuranceName,
      row.unitName,
      row.price == null ? "" : row.price.toFixed(2).replace(".", ","),
      row.source,
      row.statusLabel,
      row.paymentStatusLabel,
      row.paymentMethodName,
    ]
      .map(csvCell)
      .join(";"),
  );
  return `\uFEFF${headers.map(csvCell).join(";")}\n${lines.join("\n")}`;
}

export function appointmentStatusLabel(status: string) {
  return (
    appointmentStatusOptions.find((option) => option.value === status)?.label ??
    status
  );
}

export function paymentStatusLabel(status: string) {
  return (
    paymentStatusOptions.find((option) => option.value === status)?.label ??
    status
  );
}

function filterByPatientQuery(rows: AppointmentRow[], query: string) {
  const normalizedQuery = normalizeText(query);
  if (!normalizedQuery) return rows;
  return rows.filter((row) => {
    const name = `${row.patients?.full_name ?? ""} ${
      row.patients?.social_name ?? ""
    }`;
    return normalizeText(name).includes(normalizedQuery);
  });
}

function resolvePaymentStatus(receivable: ReceivableRow | null) {
  if (!receivable) return "none";
  if (receivable.status === "paid") return "paid";
  if (receivable.status === "partial") return "partial";
  if (["cancelled", "written_off"].includes(receivable.status)) {
    return "cancelled";
  }
  return "pending";
}

function resolvePrice(
  appointment: AppointmentRow,
  receivable: ReceivableRow | null,
) {
  if (receivable) return Number(receivable.amount) || 0;
  const basePrice = Number(appointment.procedures?.base_price ?? 0);
  return basePrice > 0 ? basePrice : null;
}

function normalizeListParam(
  input: SearchParamsInput,
  key: string,
  options: Array<{ value: string }>,
) {
  const allowed = new Set(options.map((option) => option.value));
  return readParams(input, key).filter((value) => allowed.has(value));
}

function readParam(input: SearchParamsInput, key: string) {
  if (!input) return undefined;
  if (input instanceof URLSearchParams) {
    return input.get(key) ?? undefined;
  }
  const value = input[key];
  return Array.isArray(value) ? value[0] : value;
}

function readParams(input: SearchParamsInput, key: string) {
  if (!input) return [];
  if (input instanceof URLSearchParams) {
    return input.getAll(key).filter(Boolean);
  }
  const value = input[key];
  if (Array.isArray(value)) return value.filter(Boolean);
  return value ? [value] : [];
}

function normalizeDateParam(value: string | undefined, fallback: string) {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : fallback;
}

function normalizeIdParam(value: string | undefined) {
  return value &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
    ? value
    : "";
}

function toDateInput(date: Date) {
  return date.toISOString().slice(0, 10);
}

function startOfDayIso(date: string) {
  return `${date}T00:00:00.000-03:00`;
}

function endOfDayIso(date: string) {
  return `${date}T23:59:59.999-03:00`;
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "America/Fortaleza",
  }).format(date);
}

function formatTime(date: Date) {
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Fortaleza",
  }).format(date);
}

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function csvCell(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}
