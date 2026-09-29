import { redirect } from "next/navigation";
import {
  HandCoins,
  ChartLineUp as TrendingUp,
  WarningCircle,
} from "@phosphor-icons/react/dist/ssr";
import { ReportsFilters } from "../reports-filters";
import { CommissionChart, type CommissionPoint } from "./commission-chart";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { requireCompanyPermission } from "@/lib/authz/guards";
import { logger } from "@/lib/observability/logger";
import {
  buildPhase13ReportData,
  resolveReportFilters,
  resolveReportPermissions,
} from "@/lib/reports/phase13";
import {
  loadReportTimeZone,
  zonedDayEndExclusive,
  zonedDayStart,
} from "@/lib/reports/time-zone";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type CommissionRow = {
  professional_id: string;
  professional_name: string;
  appointment_count: number;
  revenue: number | string;
  commission_due: number | string;
  payout_total: number | string;
  payout_paid: number | string;
  payout_pending: number | string;
  commission_percent: number | string;
};

type MonthlyRow = {
  month_start: string;
  revenue: number | string;
  commission_due: number | string;
};

export default async function CommissionReportPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [params, context] = await Promise.all([
    searchParams ?? Promise.resolve({}),
    requireCompanyPermission(["relatorio.financeiro"]),
  ]);
  // O cálculo (RPC) exige `financeiro.ver_geral`, e a comissão de cada
  // profissional é dado sensível: a página segue a regra do cálculo em vez
  // de abrir e mostrar só o aviso de acesso negado. O menu esconde o item.
  if (!context.permissionCodes.has("financeiro.ver_geral")) {
    redirect("/relatorios/financeiro");
  }
  const supabase = await createSupabaseServerClient();
  const timeZone = await loadReportTimeZone(supabase, context.organization.id);
  const filters = resolveReportFilters(params, timeZone);

  // Limites no fuso da clínica; `to` é exclusivo (o RPC usa `< p_to`).
  const from = zonedDayStart(filters.from, timeZone).toISOString();
  const to = zonedDayEndExclusive(filters.to, timeZone).toISOString();

  const [reportData, commission, series] = await Promise.all([
    buildPhase13ReportData({
      filters,
      organizationId: context.organization.id,
      permissions: {
        ...resolveReportPermissions(context.permissionCodes),
        clinical: false,
        operational: false,
      },
      supabase,
      timeZone,
    }),
    supabase.rpc("commission_report", { p_from: from, p_to: to }),
    supabase.rpc("commission_monthly_series", { p_from: from, p_to: to }),
  ]);

  const rows = (commission.data ?? []) as CommissionRow[];
  const points: CommissionPoint[] = ((series.data ?? []) as MonthlyRow[]).map(
    (row) => ({
      month: formatMonth(row.month_start),
      Receita: Number(row.revenue),
      Comissão: Number(row.commission_due),
    }),
  );

  const totals = rows.reduce(
    (accumulator, row) => ({
      revenue: accumulator.revenue + Number(row.revenue),
      due: accumulator.due + Number(row.commission_due),
      paid: accumulator.paid + Number(row.payout_paid),
      pending: accumulator.pending + Number(row.payout_pending),
    }),
    { revenue: 0, due: 0, paid: 0, pending: 0 },
  );
  const unavailable = Boolean(commission.error);
  // 42501 é permissão: a função exige `financeiro.ver_geral`, que a página
  // (liberada por `relatorio.financeiro`) não garante. É um caso esperado,
  // não uma falha — e pede outra mensagem. O resto vai para o log como erro.
  const deniedByPermission = commission.error?.code === "42501";
  if (commission.error) {
    (deniedByPermission ? logger.warn : logger.error)(
      "reports.commission_unavailable",
      { code: commission.error.code, message: commission.error.message },
    );
  }

  return (
    <div className="grid grid-cols-1 gap-6">
      <PageHeader
        icon={HandCoins}
        title="Comissões"
        description="Quanto cada profissional gerou de comissão pelas regras dos procedimentos, e quanto de repasse foi lançado."
      />

      <Card>
        <CardContent>
          <ReportsFilters
            filters={filters}
            options={reportData.options}
            resetHref="/relatorios/comissoes"
          />
        </CardContent>
      </Card>

      {unavailable ? (
        <Card>
          {/* No acesso de suporte o banco vê o login do suporte, que não
              pertence à clínica — o perfil acessado não é o problema. */}
          {deniedByPermission && context.impersonation ? (
            <EmptyState
              icon={WarningCircle}
              title="Comissões indisponíveis no acesso de suporte"
              description="O cálculo roda com o login da própria clínica. Para conferir os números, entre com um usuário dela."
            />
          ) : deniedByPermission ? (
            <EmptyState
              icon={WarningCircle}
              title="Comissões indisponíveis para o seu perfil"
              description="Este relatório exige a permissão de ver o financeiro completo."
            />
          ) : (
            <EmptyState
              icon={WarningCircle}
              title="Não foi possível calcular as comissões"
              description="Tente de novo em alguns instantes. Se continuar, fale com o suporte."
            />
          )}
        </Card>
      ) : rows.length ? (
        <>
          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <SummaryTile
              label="Receita no período"
              value={currency(totals.revenue)}
            />
            <SummaryTile
              label="Comissão gerada"
              value={currency(totals.due)}
              hint={
                totals.revenue > 0
                  ? `${((totals.due / totals.revenue) * 100).toFixed(1)}% da receita`
                  : undefined
              }
            />
            <SummaryTile label="Repasse pago" value={currency(totals.paid)} />
            <SummaryTile
              label="Repasse pendente"
              value={currency(totals.pending)}
              tone={totals.pending > 0 ? "warning" : undefined}
            />
          </section>

          {points.length > 1 ? (
            <Card>
              <CardHeader className="px-5 py-4">
                <div className="flex items-center gap-2">
                  <TrendingUp
                    className="size-4 text-primary"
                    aria-hidden="true"
                  />
                  <h2 className="text-heading-sm font-semibold">
                    Receita e comissão por mês
                  </h2>
                </div>
                <p className="mt-1 text-body-sm text-muted-foreground">
                  A distância entre as linhas é o que sobra depois do repasse.
                </p>
              </CardHeader>
              <CardContent>
                <CommissionChart data={points} />
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader className="px-5 py-4">
              <h2 className="text-heading-sm font-semibold">
                Comissão por profissional
              </h2>
              <p className="mt-1 text-body-sm text-muted-foreground">
                “Comissão gerada” vem das regras cadastradas no procedimento.
                “Repasse” é o que o financeiro lançou de fato — a diferença
                aponta regra desatualizada ou repasse esquecido.
              </p>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="app-table w-full min-w-[46rem] text-body-sm">
                  <thead>
                    <tr>
                      <th className="px-4 py-2 font-medium">Profissional</th>
                      <th className="px-4 py-2 text-right font-medium">
                        Atend.
                      </th>
                      <th className="px-4 py-2 text-right font-medium">
                        Receita
                      </th>
                      <th className="px-4 py-2 text-right font-medium">
                        Comissão gerada
                      </th>
                      <th className="px-4 py-2 text-right font-medium">%</th>
                      <th className="px-4 py-2 text-right font-medium">
                        Repasse pago
                      </th>
                      <th className="px-4 py-2 text-right font-medium">
                        Pendente
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr
                        key={row.professional_id}
                        className="border-b border-border last:border-b-0"
                      >
                        <td className="px-4 py-2 font-medium">
                          {row.professional_name}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums">
                          {row.appointment_count}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums">
                          {currency(row.revenue)}
                        </td>
                        <td className="px-4 py-2 text-right font-semibold tabular-nums">
                          {currency(row.commission_due)}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">
                          {Number(row.commission_percent).toFixed(1)}%
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums">
                          {currency(row.payout_paid)}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums">
                          {Number(row.payout_pending) > 0 ? (
                            <Badge variant="warning">
                              {currency(row.payout_pending)}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      ) : (
        <Card>
          <CardContent>
            <EmptyState
              icon={HandCoins}
              title="Nenhuma comissão no período."
              description="A comissão aparece quando houver atendimentos com valor e uma regra de custo do tipo comissão no procedimento."
              className="py-8"
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function SummaryTile({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "warning";
}) {
  return (
    <div className="rounded-lg border border-border bg-card px-4 py-3.5 shadow-[var(--shadow-soft)]">
      <p className="text-body-sm font-medium text-muted-foreground">{label}</p>
      <p
        className={`mt-1.5 text-heading font-bold tabular-nums ${
          tone === "warning" ? "text-warning-foreground" : "text-foreground"
        }`}
      >
        {value}
      </p>
      {hint ? (
        <p className="mt-0.5 text-body-sm text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

function currency(value: number | string) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number(value));
}

function formatMonth(value: string) {
  const [year, month] = value.split("-");
  return `${month}/${year.slice(2)}`;
}
