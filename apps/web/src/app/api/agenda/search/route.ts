import { NextResponse } from "next/server";
import { getRequestContext } from "@/lib/auth/context";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type AgendaSearchResult = {
  id: string;
  startAt: string;
  endAt: string;
  status: string;
  patientName: string;
  procedureName: string | null;
  professionalName: string | null;
};

type AppointmentRow = {
  id: string;
  start_at: string;
  end_at: string;
  status: string;
  patient_id: string;
  procedures: { name: string } | null;
  professionals: { name: string } | null;
};

/**
 * Agendamentos de um paciente em qualquer data — a agenda só filtra o que
 * está carregado na tela (a semana ou o mês visível). Usa a sessão da pessoa:
 * as regras de acesso da agenda (profissionais e agendas permitidos) valem.
 */
export async function GET(request: Request) {
  const context = await getRequestContext();
  if (!context.organization || !context.permissionCodes.has("agenda.ver")) {
    return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
  }

  const query = (new URL(request.url).searchParams.get("q") ?? "")
    .trim()
    .slice(0, 80)
    .replace(/[,()%*]/g, " ")
    .replace(/\s+/g, " ");
  if (query.length < 3) {
    return NextResponse.json(
      { upcoming: [], past: [] },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  }

  const canSeeSensitive = context.permissionCodes.has(
    "paciente.ver_dados_sensiveis",
  );
  const digits = query.replace(/\D/g, "");
  const filters = [
    `full_name.ilike.%${query}%`,
    `social_name.ilike.%${query}%`,
  ];
  if (digits.length >= 3) {
    filters.push(`phone.ilike.%${digits}%`, `whatsapp.ilike.%${digits}%`);
    if (canSeeSensitive) filters.push(`cpf.ilike.%${digits}%`);
  }

  const supabase = await createSupabaseServerClient();
  const organizationId = context.organization.id;
  const { data: patients } = await supabase
    .from("patients")
    .select("id, full_name, social_name")
    .eq("organization_id", organizationId)
    .or(filters.join(","))
    .limit(10)
    .returns<
      Array<{ id: string; full_name: string; social_name: string | null }>
    >();
  if (!patients?.length) {
    return NextResponse.json(
      { upcoming: [], past: [] },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  }

  const patientIds = patients.map((patient) => patient.id);
  const names = new Map(
    patients.map((patient) => [
      patient.id,
      patient.social_name || patient.full_name,
    ]),
  );
  const now = new Date().toISOString();
  const select =
    "id, start_at, end_at, status, patient_id, procedures(name), professionals(name)";
  const [upcoming, past] = await Promise.all([
    supabase
      .from("appointments")
      .select(select)
      .eq("organization_id", organizationId)
      .in("patient_id", patientIds)
      .gte("start_at", now)
      .order("start_at", { ascending: true })
      .limit(15)
      .returns<AppointmentRow[]>(),
    supabase
      .from("appointments")
      .select(select)
      .eq("organization_id", organizationId)
      .in("patient_id", patientIds)
      .lt("start_at", now)
      .order("start_at", { ascending: false })
      .limit(10)
      .returns<AppointmentRow[]>(),
  ]);

  const toResult = (row: AppointmentRow): AgendaSearchResult => ({
    id: row.id,
    startAt: row.start_at,
    endAt: row.end_at,
    status: row.status,
    patientName: names.get(row.patient_id) ?? "Paciente",
    procedureName: row.procedures?.name ?? null,
    professionalName: row.professionals?.name ?? null,
  });

  return NextResponse.json(
    {
      upcoming: (upcoming.data ?? []).map(toResult),
      past: (past.data ?? []).map(toResult),
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
