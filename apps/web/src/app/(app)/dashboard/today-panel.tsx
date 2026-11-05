import Link from "next/link";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import {
  ArrowRight,
  CalendarCheck,
  ChatCircleText,
  ClipboardText,
  Hourglass,
  ListChecks,
} from "@phosphor-icons/react/dist/ssr";
import type { Icon } from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { appointmentStatusLabels } from "@/lib/agenda/status";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

type TodayAppointment = {
  id: string;
  status: string;
  start_at: string;
  end_at: string;
  is_extra: boolean;
  professional_id: string;
  patients: { full_name: string; social_name: string | null } | null;
  procedures: { name: string } | null;
  professionals: { name: string } | null;
};

const activeStatuses = new Set([
  "scheduled",
  "confirmed",
  "waiting",
  "in_progress",
]);

const statusVariant: Record<
  string,
  "neutral" | "primary" | "success" | "warning" | "destructive"
> = {
  scheduled: "primary",
  confirmed: "success",
  waiting: "warning",
  in_progress: "primary",
  attended: "neutral",
  no_show: "destructive",
  cancelled: "destructive",
};

const upcomingShown = 6;

function addDaysToKey(dateKey: string, days: number) {
  const date = new Date(`${dateKey}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function minutesBetween(from: string, to: Date) {
  return Math.max(
    0,
    Math.round((to.getTime() - new Date(from).getTime()) / 60_000),
  );
}

function formatWait(minutes: number) {
  if (minutes < 1) return "chegou agora";
  if (minutes < 60) return `aguardando há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `aguardando há ${hours} h${rest ? ` ${rest} min` : ""}`;
}

/**
 * O "hoje" da clínica no topo do painel: quem vem agora, quem está esperando
 * e o que ficou pendente. Para um profissional, só a agenda dele (o painel
 * era igual para todos os perfis).
 */
export async function TodayPanel({
  organizationId,
  userId,
  timeZone,
  now,
  canSeeClinical,
  canManageQueue,
}: {
  organizationId: string;
  userId: string | null;
  timeZone: string;
  now: Date;
  canSeeClinical: boolean;
  canManageQueue: boolean;
}) {
  const supabase = await createSupabaseServerClient();
  const todayKey = formatInTimeZone(now, timeZone, "yyyy-MM-dd");
  const tomorrowKey = addDaysToKey(todayKey, 1);
  const dayStart = fromZonedTime(`${todayKey}T00:00:00`, timeZone);
  const dayEnd = fromZonedTime(`${tomorrowKey}T00:00:00`, timeZone);
  const tomorrowEnd = fromZonedTime(
    `${addDaysToKey(todayKey, 2)}T00:00:00`,
    timeZone,
  );

  const [
    ownProfessionalResult,
    appointmentsResult,
    tomorrowResult,
    onlineRequestsResult,
    waitlistResult,
  ] = await Promise.all([
    userId
      ? supabase
          .from("professionals")
          .select("id")
          .eq("organization_id", organizationId)
          .eq("user_id", userId)
          .eq("active", true)
          .maybeSingle<{ id: string }>()
      : Promise.resolve({ data: null as { id: string } | null }),
    supabase
      .from("appointments")
      .select(
        "id, status, start_at, end_at, is_extra, professional_id, patients(full_name, social_name), procedures(name), professionals(name)",
      )
      .eq("organization_id", organizationId)
      .gte("start_at", dayStart.toISOString())
      .lt("start_at", dayEnd.toISOString())
      .order("start_at")
      .returns<TodayAppointment[]>(),
    supabase
      .from("appointments")
      .select("id, professional_id")
      .eq("organization_id", organizationId)
      .eq("status", "scheduled")
      .gte("start_at", dayEnd.toISOString())
      .lt("start_at", tomorrowEnd.toISOString())
      .returns<Array<{ id: string; professional_id: string }>>(),
    canManageQueue
      ? supabase
          .from("online_booking_requests")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", organizationId)
          .eq("status", "requested")
      : Promise.resolve({ count: 0 }),
    canManageQueue
      ? supabase
          .from("waitlist_entries")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", organizationId)
          .in("status", ["waiting", "contacted"])
      : Promise.resolve({ count: 0 }),
  ]);

  const ownProfessionalId = ownProfessionalResult.data?.id ?? null;
  const allToday = appointmentsResult.data ?? [];
  const today = ownProfessionalId
    ? allToday.filter((item) => item.professional_id === ownProfessionalId)
    : allToday;
  const tomorrowUnconfirmed = (tomorrowResult.data ?? []).filter(
    (item) => !ownProfessionalId || item.professional_id === ownProfessionalId,
  ).length;

  const draftsResult = canSeeClinical
    ? await (ownProfessionalId
        ? supabase
            .from("encounters")
            .select("id", { count: "exact", head: true })
            .eq("organization_id", organizationId)
            .eq("status", "draft")
            .eq("professional_id", ownProfessionalId)
        : supabase
            .from("encounters")
            .select("id", { count: "exact", head: true })
            .eq("organization_id", organizationId)
            .eq("status", "draft"))
    : { count: 0 };

  const waitingIds = today
    .filter((item) => item.status === "waiting")
    .map((item) => item.id);
  const { data: waitingEvents } = waitingIds.length
    ? await supabase
        .from("appointment_status_events")
        .select("appointment_id, created_at")
        .eq("organization_id", organizationId)
        .eq("to_status", "waiting")
        .in("appointment_id", waitingIds)
        .order("created_at", { ascending: false })
        .returns<Array<{ appointment_id: string; created_at: string }>>()
    : { data: [] as Array<{ appointment_id: string; created_at: string }> };
  const waitingSince = new Map<string, string>();
  for (const event of waitingEvents ?? []) {
    if (!waitingSince.has(event.appointment_id)) {
      waitingSince.set(event.appointment_id, event.created_at);
    }
  }

  const counts = {
    total: today.filter((item) => item.status !== "cancelled").length,
    confirmed: today.filter((item) => item.status === "confirmed").length,
    waiting: today.filter((item) => item.status === "waiting").length,
    inProgress: today.filter((item) => item.status === "in_progress").length,
    attended: today.filter((item) => item.status === "attended").length,
    noShow: today.filter((item) => item.status === "no_show").length,
  };
  // Em atendimento e aguardando primeiro (são o agora), depois quem ainda
  // vai chegar, por horário.
  const priority = (status: string) =>
    status === "in_progress" ? 0 : status === "waiting" ? 1 : 2;
  const upcoming = today
    .filter(
      (item) =>
        activeStatuses.has(item.status) &&
        (item.status === "waiting" ||
          item.status === "in_progress" ||
          new Date(item.end_at) >= now),
    )
    .sort(
      (a, b) =>
        priority(a.status) - priority(b.status) ||
        new Date(a.start_at).getTime() - new Date(b.start_at).getTime(),
    );
  const agendaHref = `/agenda?date=${todayKey}&view=day`;

  const strip: Array<{ label: string; value: number; tone?: string }> = [
    { label: "Agendados", value: counts.total },
    { label: "Confirmados", value: counts.confirmed },
    {
      label: "Aguardando",
      value: counts.waiting,
      tone: counts.waiting ? "text-warning-foreground" : undefined,
    },
    { label: "Em atendimento", value: counts.inProgress },
    { label: "Atendidos", value: counts.attended },
    {
      label: "Faltas",
      value: counts.noShow,
      tone: counts.noShow ? "text-destructive-foreground" : undefined,
    },
  ];

  const pending: Array<{
    label: string;
    detail: string;
    value: number;
    href: string;
    icon: Icon;
  }> = [
    ...(canManageQueue
      ? [
          {
            label: "Solicitações online",
            detail: "Pedidos de horário esperando resposta",
            value: onlineRequestsResult.count ?? 0,
            href: "/dashboard?view=operational#solicitacoes-online",
            icon: ChatCircleText,
          },
          {
            label: "Fila de espera",
            detail: "Pacientes esperando uma vaga",
            value: waitlistResult.count ?? 0,
            href: "/dashboard?view=operational#fila-de-espera",
            icon: ListChecks,
          },
        ]
      : []),
    {
      label: "Confirmar amanhã",
      detail: "Agendamentos de amanhã ainda sem confirmação",
      value: tomorrowUnconfirmed,
      href: `/agenda?date=${tomorrowKey}&view=day`,
      icon: CalendarCheck,
    },
    ...(canSeeClinical
      ? [
          {
            label: ownProfessionalId
              ? "Seus prontuários em rascunho"
              : "Prontuários em rascunho",
            detail: "Atendimentos ainda não finalizados",
            value: draftsResult.count ?? 0,
            href: "/prontuario?status=draft",
            icon: ClipboardText,
          },
        ]
      : []),
  ];

  return (
    <section
      aria-labelledby="painel-hoje"
      className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem] xl:items-start"
    >
      <Card className="min-w-0">
        <CardHeader className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
          <div className="min-w-0">
            <h2 id="painel-hoje" className="text-heading-sm font-semibold">
              {ownProfessionalId ? "Seus pacientes hoje" : "Hoje na clínica"}
            </h2>
            <p className="text-caption text-muted-foreground first-letter:uppercase">
              {new Intl.DateTimeFormat("pt-BR", {
                weekday: "long",
                day: "numeric",
                month: "long",
                timeZone,
              }).format(now)}
            </p>
          </div>
          <Link
            href={agendaHref}
            className="inline-flex items-center gap-1 text-label font-medium text-primary hover:underline"
          >
            Abrir agenda do dia
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </CardHeader>
        <dl className="grid grid-cols-3 border-b border-border sm:grid-cols-6">
          {strip.map((item) => (
            <div
              key={item.label}
              className="grid gap-0.5 border-border px-4 py-2.5 [&:not(:last-child)]:border-r max-sm:[&:nth-child(3)]:border-r-0 max-sm:[&:nth-child(-n+3)]:border-b"
            >
              <dt className="truncate text-caption text-muted-foreground">
                {item.label}
              </dt>
              <dd
                className={cn(
                  "text-heading font-semibold tabular-nums",
                  item.tone ?? "text-foreground",
                )}
              >
                {item.value}
              </dd>
            </div>
          ))}
        </dl>
        {upcoming.length ? (
          <ul className="divide-y divide-border">
            {upcoming.slice(0, upcomingShown).map((item) => {
              const patientName =
                item.patients?.social_name ||
                item.patients?.full_name ||
                "Paciente";
              const since = waitingSince.get(item.id);
              return (
                <li key={item.id}>
                  <Link
                    href={agendaHref}
                    className="grid grid-cols-[3.25rem_minmax(0,1fr)_auto] items-center gap-3 px-4 py-2.5 transition-colors duration-[var(--motion-fast)] hover:bg-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
                  >
                    <span className="text-body-sm font-semibold tabular-nums text-foreground">
                      {formatInTimeZone(
                        new Date(item.start_at),
                        timeZone,
                        "HH:mm",
                      )}
                    </span>
                    <span className="grid min-w-0 gap-0.5">
                      <span className="truncate text-body-sm font-medium text-foreground">
                        {patientName}
                      </span>
                      <span className="truncate text-caption text-muted-foreground">
                        {[
                          item.procedures?.name ?? "Atendimento",
                          ownProfessionalId ? null : item.professionals?.name,
                          item.is_extra ? "encaixe" : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </span>
                    <span className="flex flex-col items-end gap-0.5">
                      <Badge variant={statusVariant[item.status] ?? "neutral"}>
                        {appointmentStatusLabels[item.status] ?? item.status}
                      </Badge>
                      {item.status === "waiting" && since ? (
                        <span className="flex items-center gap-1 text-caption text-warning-foreground">
                          <Hourglass className="size-3" aria-hidden="true" />
                          {formatWait(minutesBetween(since, now))}
                        </span>
                      ) : null}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <CardContent className="px-4 py-8 text-center text-body-sm text-muted-foreground">
            {today.length
              ? "Ninguém mais pela frente hoje."
              : "Nenhum agendamento para hoje."}
          </CardContent>
        )}
        {upcoming.length > upcomingShown ? (
          <div className="border-t border-border px-4 py-2.5 text-right">
            <Link
              href={agendaHref}
              className="text-label font-medium text-primary hover:underline"
            >
              Ver os outros {upcoming.length - upcomingShown}
            </Link>
          </div>
        ) : null}
      </Card>

      <Card className="min-w-0">
        <CardHeader className="px-4 py-3">
          <h2 className="text-heading-sm font-semibold">Pendências</h2>
        </CardHeader>
        <ul className="divide-y divide-border">
          {pending.map((item) => {
            const ItemIcon = item.icon;
            return (
              <li key={item.label}>
                <Link
                  href={item.href}
                  className="flex items-center gap-3 px-4 py-3 transition-colors duration-[var(--motion-fast)] hover:bg-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      "flex size-9 shrink-0 items-center justify-center rounded-full",
                      item.value
                        ? "bg-primary-muted text-primary"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    <ItemIcon className="size-4" />
                  </span>
                  <span className="grid min-w-0 flex-1 gap-0.5">
                    <span className="truncate text-body-sm font-medium text-foreground">
                      {item.label}
                    </span>
                    <span className="truncate text-caption text-muted-foreground">
                      {item.detail}
                    </span>
                  </span>
                  <span
                    className={cn(
                      "text-heading-sm font-semibold tabular-nums",
                      item.value ? "text-foreground" : "text-muted-foreground",
                    )}
                  >
                    {item.value}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </Card>
    </section>
  );
}
