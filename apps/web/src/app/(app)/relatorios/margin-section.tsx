import { TrendUp as TrendingUp } from "@phosphor-icons/react/dist/ssr";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type MarginRow = {
  procedure_id: string;
  procedure_name: string;
  appointment_count: number;
  list_total: number | string;
  revenue: number | string;
  discount_total: number | string;
  commission_total: number | string;
  location_total: number | string;
  materials_total: number | string;
  other_costs_total: number | string;
  payment_fee_total: number | string;
  cost_total: number | string;
  margin: number | string;
  margin_percent: number | string;
};

/**
 * Margem por procedimento — o que finalmente dá uso às regras de
 * `procedure_costs` e `payment_method_fees`.
 *
 * Elas existiam há tempos na tela de configurações, com sete categorias de
 * custo, fixo ou percentual, e nunca entravam em conta nenhuma. Aqui a receita
 * é o valor cobrado no agendamento (não mais o preço de tabela lido na hora do
 * relatório), os custos são aplicados sobre esse valor, e sobra a margem.
 */
export async function MarginSection({
  from,
  to,
}: {
  from: string;
  to: string;
}) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("procedure_margin_report", {
    p_from: from,
    p_to: to,
  });

  if (error) {
    return (
      <Card>
        <CardHeader className="px-5 py-4">
          <h2 className="text-heading-sm font-semibold">
            Margem por procedimento
          </h2>
        </CardHeader>
        <CardContent>
          <p className="text-body-sm text-muted-foreground">
            Não foi possível calcular a margem agora. Se esta empresa acabou de
            ser atualizada, aplique as migrations pendentes.
          </p>
        </CardContent>
      </Card>
    );
  }

  const rows = (data ?? []) as MarginRow[];
  const totals = rows.reduce(
    (accumulator, row) => ({
      revenue: accumulator.revenue + Number(row.revenue),
      discount: accumulator.discount + Number(row.discount_total),
      cost: accumulator.cost + Number(row.cost_total),
      margin: accumulator.margin + Number(row.margin),
    }),
    { revenue: 0, discount: 0, cost: 0, margin: 0 },
  );

  return (
    <Card>
      <CardHeader className="px-5 py-4">
        <div className="flex items-center gap-2">
          <TrendingUp className="size-4 text-primary" aria-hidden="true" />
          <h2 className="text-heading-sm font-semibold">
            Margem por procedimento
          </h2>
        </div>
        <p className="mt-1 text-body-sm text-muted-foreground">
          Receita pelo valor cobrado no agendamento, menos os custos cadastrados
          no procedimento e a taxa da forma de pagamento. Cancelados e faltas
          ficam de fora.
        </p>
      </CardHeader>
      <CardContent className="p-0">
        {rows.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[52rem] border-collapse text-body-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-left">
                  <th className="px-4 py-2 font-medium">Procedimento</th>
                  <th className="px-4 py-2 text-right font-medium">Atend.</th>
                  <th className="px-4 py-2 text-right font-medium">Receita</th>
                  <th className="px-4 py-2 text-right font-medium">Desconto</th>
                  <th className="px-4 py-2 text-right font-medium">Comissão</th>
                  <th className="px-4 py-2 text-right font-medium">Sala</th>
                  <th className="px-4 py-2 text-right font-medium">Materiais</th>
                  <th className="px-4 py-2 text-right font-medium">Taxas</th>
                  <th className="px-4 py-2 text-right font-medium">Margem</th>
                  <th className="px-4 py-2 text-right font-medium">%</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const percent = Number(row.margin_percent);
                  return (
                    <tr
                      key={row.procedure_id}
                      className="border-b border-border last:border-b-0"
                    >
                      <td className="px-4 py-2 font-medium">
                        {row.procedure_name}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        {row.appointment_count}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        {currency(row.revenue)}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">
                        {currency(row.discount_total)}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">
                        {currency(row.commission_total)}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">
                        {currency(row.location_total)}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">
                        {currency(row.materials_total)}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">
                        {currency(row.payment_fee_total)}
                      </td>
                      <td className="px-4 py-2 text-right font-semibold tabular-nums">
                        {currency(row.margin)}
                      </td>
                      <td
                        className={`px-4 py-2 text-right font-semibold tabular-nums ${
                          percent < 0
                            ? "text-destructive"
                            : percent < 20
                              ? "text-warning-foreground"
                              : "text-success-foreground"
                        }`}
                      >
                        {percent.toFixed(1)}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-border-strong bg-muted/40 font-semibold">
                  <td className="px-4 py-2">Total</td>
                  <td className="px-4 py-2" />
                  <td className="px-4 py-2 text-right tabular-nums">
                    {currency(totals.revenue)}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {currency(totals.discount)}
                  </td>
                  <td className="px-4 py-2" colSpan={3} />
                  <td className="px-4 py-2 text-right tabular-nums">
                    {currency(totals.cost)}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {currency(totals.margin)}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {totals.revenue > 0
                      ? `${((totals.margin / totals.revenue) * 100).toFixed(1)}%`
                      : "—"}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        ) : (
          <EmptyState
            icon={TrendingUp}
            title="Nenhum atendimento com valor no período."
            description="A margem aparece assim que houver agendamentos com valor cobrado."
            className="py-8"
          />
        )}
      </CardContent>
    </Card>
  );
}

function currency(value: number | string) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number(value));
}
