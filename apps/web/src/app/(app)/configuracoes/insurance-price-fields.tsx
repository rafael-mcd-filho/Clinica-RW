"use client";

import { Input } from "@/components/ui/field";
import { HelpTooltip } from "@/components/ui/help-tooltip";
import type { HealthInsuranceRow } from "@/lib/clinic/base-registrations";

/**
 * Quanto cada convênio paga por este procedimento, dentro do próprio cadastro.
 *
 * Fica aqui, e não numa tela separada, porque definir preço é um gesto só:
 * quem informa o particular informa os convênios na mesma passada. O banco
 * guarda isso como tabela de preço por convênio, mas quem cadastra não precisa
 * saber disso — a tabela é criada por baixo quando necessária.
 */
export function InsurancePriceFields({
  procedureId,
  insurances,
  insurancePrices,
}: {
  /** Nulo em cadastro novo: os valores são gravados junto com o procedimento. */
  procedureId: string | null;
  insurances: HealthInsuranceRow[];
  insurancePrices: Record<string, number>;
}) {
  const active = insurances.filter((insurance) => insurance.active);

  if (!active.length) {
    return (
      <p className="text-body-sm text-muted-foreground">
        Cadastre um convênio para definir quanto ele paga por este procedimento.
      </p>
    );
  }

  return (
    <div className="grid gap-3">
      <div className="flex items-center gap-1.5">
        <span className="text-body-sm font-medium">Valor por convênio</span>
        <HelpTooltip>
          É o que a clínica recebe por este procedimento em cada convênio. Ao
          agendar, o valor entra sozinho conforme o convênio escolhido. Deixe em
          branco quando o convênio não cobrir o procedimento — aí vale o preço
          particular.
        </HelpTooltip>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {active.map((insurance) => (
          <label
            key={insurance.id}
            className="grid gap-1.5 text-xs font-medium text-muted-foreground"
          >
            {insurance.name}
            <div className="flex items-center gap-1.5">
              <span className="text-sm text-muted-foreground">R$</span>
              <Input
                name={`price_${insurance.id}`}
                inputMode="decimal"
                defaultValue={
                  procedureId
                    ? formatPriceValue(
                        insurancePrices[`${insurance.id}:${procedureId}`],
                      )
                    : ""
                }
                placeholder="Não cobre"
                className="h-9 text-right tabular-nums"
              />
            </div>
          </label>
        ))}
      </div>
    </div>
  );
}

function formatPriceValue(value: number | undefined) {
  return typeof value === "number" ? value.toFixed(2).replace(".", ",") : "";
}
