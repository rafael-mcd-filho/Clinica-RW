import Link from "next/link";
import { ChatsCircle } from "@phosphor-icons/react/dist/ssr";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { requireCompanyPermission } from "@/lib/authz/guards";
import { formatNumber, formatPercent, pluralize } from "@/lib/format";
import { loadReportTimeZone } from "@/lib/reports/time-zone";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

type AttendanceReport = {
  conversations: number;
  answered: number;
  unanswered: number;
  median_first_response_minutes: number | null;
  average_first_response_minutes: number | null;
  answered_within_hour: number;
  converted: number;
  by_attendant: Array<{
    user_id: string;
    name: string;
    sessions: number;
    conversations: number;
    messages_sent: number;
    first_replies: number;
    median_first_response_minutes: number | null;
  }>;
};

const periods = [
  { id: "7d", label: "Últimos 7 dias" },
  { id: "30d", label: "Últimos 30 dias" },
  { id: "mes", label: "Este mês" },
  { id: "mes-anterior", label: "Mês anterior" },
] as const;
type PeriodId = (typeof periods)[number]["id"];

function resolvePeriod(id: PeriodId, timeZone: string, now = new Date()) {
  const today = formatInTimeZone(now, timeZone, "yyyy-MM-dd");
  const [year, month] = today.split("-").map(Number);
  const dayStart = (key: string) => fromZonedTime(`${key}T00:00:00`, timeZone);
  const shiftDays = (key: string, days: number) => {
    const date = new Date(`${key}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
  };
  const monthKey = (y: number, m: number) =>
    `${String(y)}-${String(m).padStart(2, "0")}-01`;
  if (id === "7d")
    return {
      from: dayStart(shiftDays(today, -6)),
      to: dayStart(shiftDays(today, 1)),
    };
  if (id === "30d")
    return {
      from: dayStart(shiftDays(today, -29)),
      to: dayStart(shiftDays(today, 1)),
    };
  if (id === "mes")
    return {
      from: dayStart(monthKey(year, month)),
      to: dayStart(shiftDays(today, 1)),
    };
  const previousYear = month === 1 ? year - 1 : year;
  const previousMonth = month === 1 ? 12 : month - 1;
  return {
    from: dayStart(monthKey(previousYear, previousMonth)),
    to: dayStart(monthKey(year, month)),
  };
}

function formatMinutes(value: number | null | undefined) {
  if (value == null) return "—";
  if (value < 60) return `${formatNumber(value, value < 10 ? 1 : 0)} min`;
  const hours = Math.floor(value / 60);
  const minutes = Math.round(value % 60);
  return minutes ? `${hours} h ${minutes} min` : `${hours} h`;
}

/**
 * Raio-X W4: indicadores do atendimento por WhatsApp — tempo até a primeira
 * resposta, volume por atendente e conversas que viraram agendamento.
 */
export default async function WhatsappReportPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [params, context] = await Promise.all([
    searchParams ??
      Promise.resolve({} as Record<string, string | string[] | undefined>),
    requireCompanyPermission([
      "relatorio.operacional",
      "atendimento.configurar",
    ]),
  ]);
  const requested = Array.isArray(params.periodo)
    ? params.periodo[0]
    : params.periodo;
  const period: PeriodId = periods.some((item) => item.id === requested)
    ? (requested as PeriodId)
    : "30d";
  const supabase = await createSupabaseServerClient();
  const timeZone = await loadReportTimeZone(supabase, context.organization.id);
  const range = resolvePeriod(period, timeZone);
  const { data, error } = await supabase.rpc("whatsapp_attendance_report", {
    p_from: range.from.toISOString(),
    p_to: range.to.toISOString(),
    p_impersonation_session_id: context.impersonation?.id ?? null,
  });
  const report = (error ? null : data) as AttendanceReport | null;
  const missingFunction =
    error?.code === "PGRST202" ||
    Boolean(error?.message?.includes("Could not find"));

  const answeredRate = report?.conversations
    ? (report.answered / report.conversations) * 100
    : null;
  const withinHourRate = report?.answered
    ? (report.answered_within_hour / report.answered) * 100
    : null;
  const conversionRate = report?.conversations
    ? (report.converted / report.conversations) * 100
    : null;

  return (
    <div className="grid grid-cols-1 gap-6">
      <PageHeader
        icon={ChatsCircle}
        title="Atendimento no WhatsApp"
        description="Tempo até a primeira resposta, volume por atendente e conversas que viraram agendamento."
      />

      <nav aria-label="Período" className="flex flex-wrap gap-2">
        {periods.map((item) => (
          <Link
            key={item.id}
            href={`/relatorios/whatsapp?periodo=${item.id}`}
            aria-current={item.id === period ? "page" : undefined}
            className={cn(
              "inline-flex min-h-9 items-center rounded-full border px-3 text-body-sm font-medium transition-colors duration-[var(--motion-fast)]",
              item.id === period
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-secondary-foreground hover:bg-accent",
            )}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      {!report ? (
        <Card>
          <CardContent className="py-10">
            <EmptyState
              icon={ChatsCircle}
              title={
                missingFunction
                  ? "Indicadores ainda não disponíveis"
                  : "Não foi possível carregar os indicadores"
              }
              description={
                missingFunction
                  ? "Falta aplicar a migração 20261105200000 no banco para calcular estes números."
                  : "Tente de novo em alguns instantes."
              }
            />
          </CardContent>
        </Card>
      ) : (
        <>
          <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              {
                label: "Conversas com paciente",
                value: formatNumber(report.conversations),
                hint: `${pluralize(report.unanswered, "sem resposta", "sem resposta")}`,
              },
              {
                label: "Primeira resposta (mediana)",
                value: formatMinutes(report.median_first_response_minutes),
                hint: `Média: ${formatMinutes(report.average_first_response_minutes)}`,
              },
              {
                label: "Respondidas em até 1 hora",
                value:
                  withinHourRate == null ? "—" : formatPercent(withinHourRate),
                hint:
                  answeredRate == null
                    ? "Sem conversas no período"
                    : `${formatPercent(answeredRate)} das conversas foram respondidas`,
              },
              {
                label: "Viraram agendamento",
                value: formatNumber(report.converted),
                hint:
                  conversionRate == null
                    ? "Em até 7 dias da primeira mensagem"
                    : `${formatPercent(conversionRate)} das conversas, em até 7 dias`,
              },
            ].map((card) => (
              <Card key={card.label}>
                <CardContent className="p-4">
                  <p className="text-body-sm text-muted-foreground">
                    {card.label}
                  </p>
                  <p className="mt-1 text-display font-semibold tabular-nums">
                    {card.value}
                  </p>
                  <p className="mt-1 text-caption text-muted-foreground">
                    {card.hint}
                  </p>
                </CardContent>
              </Card>
            ))}
          </section>

          <Card>
            <CardHeader className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold">Por atendente</h2>
              <Badge variant="neutral">
                {pluralize(report.by_attendant.length, "pessoa", "pessoas")}
              </Badge>
            </CardHeader>
            <CardContent className="p-0">
              {report.by_attendant.length ? (
                <div className="overflow-x-auto">
                  <table className="app-table w-full min-w-[640px] text-body-sm">
                    <thead>
                      <tr>
                        <th className="text-left">Atendente</th>
                        <th className="text-right">Atendimentos</th>
                        <th className="text-right">Conversas</th>
                        <th className="text-right">Mensagens enviadas</th>
                        <th className="text-right">1ª resposta (mediana)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.by_attendant.map((person) => (
                        <tr key={person.user_id}>
                          <td className="font-medium">{person.name}</td>
                          <td className="text-right tabular-nums">
                            {formatNumber(person.sessions)}
                          </td>
                          <td className="text-right tabular-nums">
                            {formatNumber(person.conversations)}
                          </td>
                          <td className="text-right tabular-nums">
                            {formatNumber(person.messages_sent)}
                          </td>
                          <td className="text-right tabular-nums">
                            {formatMinutes(
                              person.median_first_response_minutes,
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="py-8">
                  <EmptyState
                    icon={ChatsCircle}
                    title="Nenhum atendimento no período"
                  />
                </div>
              )}
            </CardContent>
          </Card>
          <p className="text-caption text-muted-foreground">
            Conta como resposta a primeira mensagem enviada por uma pessoa da
            equipe depois da mensagem do paciente; respostas automáticas e notas
            internas ficam de fora. O tempo é corrido, inclusive fora do horário
            de atendimento.
          </p>
        </>
      )}
    </div>
  );
}
