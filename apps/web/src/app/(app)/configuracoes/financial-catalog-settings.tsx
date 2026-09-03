"use client";

import {
  useActionState,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react";
import {
  CaretRight,
  CreditCard,
  PencilSimple as Pencil,
  Plus,
  FloppyDisk as Save,
  Trash as Trash2,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import {
  deletePaymentMethod,
  deletePaymentMethodFee,
  deleteProcedureCost,
  savePaymentMethod,
  savePaymentMethodFee,
  saveProcedureCost,
  setPaymentMethodActive,
  setPaymentMethodFeeActive,
  setProcedureCostActive,
  type CatalogActionState,
} from "./financial-catalog-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Input, Select } from "@/components/ui/field";
import { FormError } from "@/components/ui/form-error";
import { HelpTooltip } from "@/components/ui/help-tooltip";
import { Modal } from "@/components/ui/modal";
import type {
  PaymentMethodFeeRow,
  PaymentMethodRow,
  ProcedureCostRow,
  ProcedureRow,
} from "@/lib/clinic/base-registrations";

const initialState: CatalogActionState = {};

type ProcedureCostEditor = {
  procedureId?: string;
  procedureName?: string;
  row?: ProcedureCostRow;
};

type PaymentFeeEditor = {
  paymentMethodId: string;
  row?: PaymentMethodFeeRow;
};

/**
 * Custos de cada procedimento, agrupados por procedimento.
 *
 * Antes este card repetia a lista inteira de procedimentos e cada nível ganhava
 * o seu próprio botão "Custo" — três no total, sendo que o modal ainda
 * perguntava de novo qual era o procedimento. Agora é uma linha por
 * procedimento, que abre nos custos dele, e o modal já sabe de onde veio.
 *
 * Preço, particular e por convênio, mora no cadastro do procedimento: é lá que
 * se decide quanto o item vale, e separar isso em duas telas obrigava a salvar
 * uma para ir preencher a outra.
 */
export function ProcedureCostsSection({
  procedures,
  costs,
}: {
  procedures: ProcedureRow[];
  costs: ProcedureCostRow[];
}) {
  const [editor, setEditor] = useState<ProcedureCostEditor | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const costsByProcedure = useMemo(() => {
    const grouped = new Map<string, ProcedureCostRow[]>();
    for (const cost of costs) {
      grouped.set(cost.procedure_id, [
        ...(grouped.get(cost.procedure_id) ?? []),
        cost,
      ]);
    }
    return grouped;
  }, [costs]);

  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return procedures;
    return procedures.filter((procedure) =>
      procedure.name.toLowerCase().includes(term),
    );
  }, [procedures, query]);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
          <div>
            <div className="flex items-center gap-1.5">
              <h2 className="font-semibold">Custos por procedimento</h2>
              <HelpTooltip>
                Custos não alteram o que é cobrado do paciente — eles entram no
                relatório de margem e no de comissão. Os preços, particular e
                por convênio, ficam no cadastro do procedimento acima.
              </HelpTooltip>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Comissão, aluguel de sala, materiais e impostos que incidem sobre
              cada procedimento.
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="grid gap-3">
        <Modal
          open={Boolean(editor)}
          onClose={() => setEditor(null)}
          title={editor?.row ? "Editar custo" : "Novo custo"}
          description={
            editor?.procedureName
              ? `Custo de ${editor.procedureName}. Não altera o valor cobrado do paciente.`
              : "Configure o custo operacional vinculado ao procedimento."
          }
          className="max-w-2xl"
        >
          {editor ? (
            <ProcedureCostForm
              key={editor.row?.id ?? editor.procedureId ?? "new"}
              procedures={procedures}
              procedureId={editor.procedureId}
              editing={editor.row}
              onClose={() => setEditor(null)}
            />
          ) : null}
        </Modal>

        {procedures.length > 6 ? (
          <label className="relative">
            <span className="sr-only">Pesquisar procedimento</span>
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Pesquisar procedimento ou serviço"
              className="w-full"
            />
          </label>
        ) : null}

        {visible.map((procedure) => (
          <ProcedureValueRow
            key={procedure.id}
            procedure={procedure}
            costs={costsByProcedure.get(procedure.id) ?? []}
            expanded={expandedId === procedure.id}
            onToggleExpanded={() =>
              setExpandedId((current) =>
                current === procedure.id ? null : procedure.id,
              )
            }
            onAddCost={() =>
              setEditor({
                procedureId: procedure.id,
                procedureName: procedure.name,
              })
            }
            onEditCost={(row) =>
              setEditor({
                procedureId: procedure.id,
                procedureName: procedure.name,
                row,
              })
            }
          />
        ))}

        {procedures.length && !visible.length ? (
          <p className="px-1 py-6 text-center text-sm text-muted-foreground">
            Nenhum procedimento encontrado para “{query}”.
          </p>
        ) : null}

        {!procedures.length ? (
          <p className="rounded-md border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
            Cadastre um procedimento ou serviço acima para definir valores e
            custos.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

/** Uma linha por procedimento: fechada mostra o resumo do dinheiro; aberta,
    tudo que o compõe. */
function ProcedureValueRow({
  procedure,
  costs,
  expanded,
  onToggleExpanded,
  onAddCost,
  onEditCost,
}: {
  procedure: ProcedureRow;
  costs: ProcedureCostRow[];
  expanded: boolean;
  onToggleExpanded: () => void;
  onAddCost: () => void;
  onEditCost: (row: ProcedureCostRow) => void;
}) {
  const basePrice = Number(procedure.base_price ?? 0);
  const activeCosts = costs.filter((cost) => cost.active);
  // O custo percentual só vira dinheiro sobre um preço: o resumo usa o
  // particular, que é o valor de referência do procedimento.
  const costTotal = activeCosts.reduce(
    (total, cost) =>
      total +
      (cost.calculation_type === "percentage"
        ? (basePrice * Number(cost.value)) / 100
        : Number(cost.value)),
    0,
  );
  return (
    <section className="overflow-hidden rounded-md border border-border bg-background">
      <button
        type="button"
        onClick={onToggleExpanded}
        aria-expanded={expanded}
        className="flex w-full flex-wrap items-center justify-between gap-3 px-4 py-3 text-left transition-colors duration-[var(--motion-fast)] hover:bg-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
      >
        <div className="flex min-w-0 items-center gap-2">
          <CaretRight
            className={`size-4 shrink-0 text-muted-foreground transition-transform duration-[var(--motion-fast)] ${
              expanded ? "rotate-90" : ""
            }`}
            aria-hidden="true"
          />
          <span className="truncate text-sm font-semibold">
            {procedure.name}
          </span>
          {procedure.active ? null : <Badge variant="neutral">Inativo</Badge>}
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span className="tabular-nums">
            Particular{" "}
            <strong className="font-semibold text-foreground">
              {formatMoney(basePrice)}
            </strong>
          </span>
          <span className="tabular-nums">
            {activeCosts.length
              ? `${activeCosts.length} custo${activeCosts.length === 1 ? "" : "s"} · ${formatMoney(costTotal)}`
              : "Sem custos"}
          </span>
        </div>
      </button>

      {expanded ? (
        <div className="grid gap-4 border-t border-border p-4">
          <div className="grid gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-sm font-semibold">Custos deste item</h4>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={onAddCost}
              >
                <Plus className="size-3.5" aria-hidden="true" />
                Adicionar custo
              </Button>
            </div>
            {costs.map((cost) => (
              <CatalogRuleRow
                key={cost.id}
                name={cost.name}
                description={`${procedureCostTypeLabel(cost.cost_type)} · ${calculationLabel(cost.calculation_type, cost.value)}`}
                active={cost.active}
                compact
                onEdit={() => onEditCost(cost)}
                onToggle={(active) => setProcedureCostActive(cost.id, active)}
                deleteTitle="Excluir custo?"
                deleteDescription="O custo será removido deste procedimento. Esta ação não altera atendimentos ou valores já cobrados."
                deleteAction={deleteProcedureCost.bind(null, cost.id)}
              />
            ))}
            {!costs.length ? (
              <p className="rounded-md border border-dashed border-border px-3 py-4 text-center text-sm text-muted-foreground">
                Nenhum custo neste procedimento. Comissão, aluguel de sala e
                materiais entram aqui e aparecem no relatório de margem.
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}


function ProcedureCostForm({
  procedures,
  procedureId,
  editing,
  onClose,
}: {
  procedures: ProcedureRow[];
  procedureId?: string;
  editing?: ProcedureCostRow;
  onClose: () => void;
}) {
  const [state, action, pending] = useActionState(
    saveProcedureCost.bind(null, editing?.id ?? null),
    initialState,
  );
  const selectedProcedureId = editing?.procedure_id ?? procedureId ?? "";

  useEffect(() => {
    if (state.success) {
      toast.success(state.success);
      onClose();
    }
  }, [onClose, state.success]);

  return (
    <form action={action} className="grid min-w-0 gap-4 sm:grid-cols-2">
      {/* Aberto de dentro de um procedimento, ele já está decidido: perguntar
          de novo era só mais um passo para errar. O seletor volta a aparecer
          quando o custo é criado sem contexto. */}
      {selectedProcedureId ? (
        <input type="hidden" name="procedure_id" value={selectedProcedureId} />
      ) : (
        <CatalogField label="Procedimento ou serviço" required>
          <Select name="procedure_id" required defaultValue="">
            <option value="">Selecione</option>
            {procedures.map((procedure) => (
              <option key={procedure.id} value={procedure.id}>
                {procedure.name}
              </option>
            ))}
          </Select>
        </CatalogField>
      )}
      <CatalogField label="Nome do custo" required>
        <Input
          name="name"
          required
          maxLength={80}
          placeholder="Ex.: Comissão médica"
          defaultValue={editing?.name ?? ""}
        />
      </CatalogField>
      <CatalogField label="Categoria" required>
        <Select
          name="cost_type"
          required
          defaultValue={editing?.cost_type ?? "commission"}
        >
          <option value="commission">Comissão profissional</option>
          <option value="location_fee">Taxa da unidade/local</option>
          <option value="materials">Materiais e insumos</option>
          <option value="outsourced_service">Serviço terceirizado</option>
          <option value="taxes">Taxas e impostos</option>
          <option value="equipment">Equipamento</option>
          <option value="other">Outro</option>
        </Select>
      </CatalogField>
      <CatalogField label="Cálculo" required>
        <Select
          name="calculation_type"
          required
          defaultValue={editing?.calculation_type ?? "percentage"}
        >
          <option value="percentage">Percentual (%)</option>
          <option value="fixed">Valor fixo (R$)</option>
        </Select>
      </CatalogField>
      <CatalogField label="Valor" required>
        <Input
          name="value"
          type="number"
          inputMode="decimal"
          required
          min={0}
          step="0.01"
          placeholder="0,00"
          defaultValue={editing?.value ?? ""}
        />
      </CatalogField>
      <FormError message={state.error} className="sm:col-span-2" />
      <div className="flex justify-end gap-2 border-t border-border pt-4 sm:col-span-2">
        <Button type="button" size="sm" variant="ghost" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="submit" size="sm" disabled={pending}>
          {editing ? (
            <Save className="size-3.5" aria-hidden="true" />
          ) : (
            <Plus className="size-3.5" aria-hidden="true" />
          )}
          {pending
            ? "Salvando..."
            : editing
              ? "Salvar custo"
              : "Adicionar custo"}
        </Button>
      </div>
    </form>
  );
}

export function PaymentMethodsSettings({
  methods,
  fees,
}: {
  methods: PaymentMethodRow[];
  fees: PaymentMethodFeeRow[];
}) {
  const [editingMethod, setEditingMethod] = useState<PaymentMethodRow | null>(
    null,
  );
  const [showMethodForm, setShowMethodForm] = useState(false);
  const [feeEditor, setFeeEditor] = useState<PaymentFeeEditor | null>(null);
  const feesByMethod = useMemo(() => {
    const grouped = new Map<string, PaymentMethodFeeRow[]>();
    for (const fee of fees) {
      grouped.set(fee.payment_method_id, [
        ...(grouped.get(fee.payment_method_id) ?? []),
        fee,
      ]);
    }
    return grouped;
  }, [fees]);

  function openNewMethod() {
    setEditingMethod(null);
    setShowMethodForm(true);
  }

  function openMethod(method: PaymentMethodRow) {
    setEditingMethod(method);
    setShowMethodForm(true);
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
          <div>
            <div className="flex items-center gap-2">
              <CreditCard className="size-4 text-primary" aria-hidden="true" />
              <h2 className="font-semibold">Formas de pagamento</h2>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Defina as formas disponíveis na agenda e no financeiro, com taxas
              opcionais para análises futuras.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="neutral">
              {methods.filter((method) => method.active).length} ativas
            </Badge>
            <Button type="button" size="sm" onClick={openNewMethod}>
              <Plus className="size-3.5" aria-hidden="true" />
              Nova forma
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4">
        <Modal
          open={showMethodForm}
          onClose={() => {
            setShowMethodForm(false);
            setEditingMethod(null);
          }}
          title={
            editingMethod
              ? "Editar forma de pagamento"
              : "Nova forma de pagamento"
          }
          description="Defina como esta forma será identificada na agenda e no financeiro."
          className="max-w-xl"
        >
          {showMethodForm ? (
            <PaymentMethodForm
              key={editingMethod?.id ?? "new"}
              editing={editingMethod}
              onClose={() => {
                setShowMethodForm(false);
                setEditingMethod(null);
              }}
            />
          ) : null}
        </Modal>

        <Modal
          open={Boolean(feeEditor)}
          onClose={() => setFeeEditor(null)}
          title={feeEditor?.row ? "Editar taxa" : "Nova taxa"}
          description="Configure uma taxa opcional para esta forma de pagamento."
          className="max-w-2xl"
        >
          {feeEditor ? (
            <PaymentMethodFeeForm
              key={feeEditor.row?.id ?? feeEditor.paymentMethodId}
              methods={methods}
              paymentMethodId={feeEditor.paymentMethodId}
              editing={feeEditor.row}
              onClose={() => setFeeEditor(null)}
            />
          ) : null}
        </Modal>

        <div className="grid gap-3 lg:grid-cols-2">
          {methods.map((method) => {
            const methodFees = feesByMethod.get(method.id) ?? [];
            return (
              <section
                key={method.id}
                className="flex min-h-48 flex-col rounded-md border border-border bg-background"
                aria-labelledby={`payment-method-${method.id}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h3
                        id={`payment-method-${method.id}`}
                        className="truncate text-sm font-semibold"
                      >
                        {paymentMethodDisplayName(method)}
                      </h3>
                      <Badge variant={method.active ? "success" : "neutral"}>
                        {method.active ? "Ativa" : "Inativa"}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {paymentMethodTypeLabel(method.method_type)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      aria-label={`Editar ${paymentMethodDisplayName(method)}`}
                      onClick={() => openMethod(method)}
                    >
                      <Pencil className="size-3.5" aria-hidden="true" />
                    </Button>
                    <AsyncStatusButton
                      active={method.active}
                      activateLabel={`Ativar ${paymentMethodDisplayName(method)}`}
                      deactivateLabel={`Desativar ${paymentMethodDisplayName(method)}`}
                      execute={(active) =>
                        setPaymentMethodActive(method.id, active)
                      }
                    />
                    <DeleteCatalogButton
                      title="Excluir forma de pagamento?"
                      description="A exclusão só será permitida se a forma nunca tiver sido usada. Caso contrário, desative-a para preservar o histórico."
                      execute={deletePaymentMethod.bind(null, method.id)}
                    />
                  </div>
                </div>
                <div className="flex flex-1 flex-col gap-2 p-3">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Taxas opcionais
                    </p>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() =>
                        setFeeEditor({ paymentMethodId: method.id })
                      }
                    >
                      <Plus className="size-3.5" aria-hidden="true" />
                      Taxa
                    </Button>
                  </div>
                  {methodFees.map((fee) => (
                    <CatalogRuleRow
                      key={fee.id}
                      name={fee.name}
                      description={calculationLabel(
                        fee.calculation_type,
                        fee.value,
                      )}
                      active={fee.active}
                      compact
                      onEdit={() =>
                        setFeeEditor({
                          paymentMethodId: method.id,
                          row: fee,
                        })
                      }
                      onToggle={(active) =>
                        setPaymentMethodFeeActive(fee.id, active)
                      }
                      deleteTitle="Excluir taxa?"
                      deleteDescription="A taxa será removida desta forma de pagamento."
                      deleteAction={deletePaymentMethodFee.bind(null, fee.id)}
                    />
                  ))}
                  {!methodFees.length ? (
                    <p className="my-auto py-3 text-sm text-muted-foreground">
                      Nenhuma taxa cadastrada. O preenchimento é opcional.
                    </p>
                  ) : null}
                </div>
              </section>
            );
          })}
        </div>

        {!methods.length ? (
          <p className="rounded-md border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
            Nenhuma forma de pagamento cadastrada.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function PaymentMethodForm({
  editing,
  onClose,
}: {
  editing: PaymentMethodRow | null;
  onClose: () => void;
}) {
  const [state, action, pending] = useActionState(
    savePaymentMethod.bind(null, editing?.id ?? null),
    initialState,
  );

  useEffect(() => {
    if (state.success) {
      toast.success(state.success);
      onClose();
    }
  }, [onClose, state.success]);

  return (
    <form action={action} className="grid min-w-0 gap-4 sm:grid-cols-2">
      <CatalogField label="Nome" required>
        <Input
          name="name"
          required
          maxLength={80}
          placeholder="Ex.: Cartão de crédito"
          defaultValue={editing ? paymentMethodDisplayName(editing) : ""}
        />
      </CatalogField>
      <CatalogField label="Tipo" required>
        <Select
          name="method_type"
          required
          defaultValue={editing?.method_type ?? "pix"}
        >
          <option value="cash">Dinheiro</option>
          <option value="pix">Pix</option>
          <option value="credit_card">Cartão de crédito</option>
          <option value="debit_card">Cartão de débito</option>
          <option value="bank_transfer">Transferência bancária</option>
          <option value="other">Outro</option>
        </Select>
      </CatalogField>
      <FormError message={state.error} className="md:col-span-2" />
      <div className="flex justify-end gap-2 border-t border-border pt-4 sm:col-span-2">
        <Button type="button" size="sm" variant="ghost" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="submit" size="sm" disabled={pending}>
          {editing ? (
            <Save className="size-3.5" aria-hidden="true" />
          ) : (
            <Plus className="size-3.5" aria-hidden="true" />
          )}
          {pending
            ? "Salvando..."
            : editing
              ? "Salvar forma"
              : "Cadastrar forma"}
        </Button>
      </div>
    </form>
  );
}

function PaymentMethodFeeForm({
  methods,
  paymentMethodId,
  editing,
  onClose,
}: {
  methods: PaymentMethodRow[];
  paymentMethodId: string;
  editing?: PaymentMethodFeeRow;
  onClose: () => void;
}) {
  const [state, action, pending] = useActionState(
    savePaymentMethodFee.bind(null, editing?.id ?? null),
    initialState,
  );

  useEffect(() => {
    if (state.success) {
      toast.success(state.success);
      onClose();
    }
  }, [onClose, state.success]);

  return (
    <form action={action} className="grid min-w-0 gap-4 sm:grid-cols-2">
      <CatalogField label="Forma de pagamento" required>
        <Select
          name="payment_method_id"
          required
          defaultValue={editing?.payment_method_id ?? paymentMethodId}
        >
          {methods.map((method) => (
            <option key={method.id} value={method.id}>
              {paymentMethodDisplayName(method)}
            </option>
          ))}
        </Select>
      </CatalogField>
      <CatalogField label="Nome da taxa" required>
        <Input
          name="name"
          required
          maxLength={80}
          placeholder="Ex.: Taxa da operadora"
          defaultValue={editing?.name ?? ""}
        />
      </CatalogField>
      <CatalogField label="Cálculo" required>
        <Select
          name="calculation_type"
          required
          defaultValue={editing?.calculation_type ?? "percentage"}
        >
          <option value="percentage">Percentual (%)</option>
          <option value="fixed">Valor fixo (R$)</option>
        </Select>
      </CatalogField>
      <CatalogField label="Valor" required>
        <Input
          name="value"
          type="number"
          inputMode="decimal"
          required
          min={0}
          step="0.01"
          placeholder="0,00"
          defaultValue={editing?.value ?? ""}
        />
      </CatalogField>
      <FormError message={state.error} className="sm:col-span-2" />
      <div className="flex justify-end gap-2 border-t border-border pt-4 sm:col-span-2">
        <Button type="button" size="sm" variant="ghost" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="submit" size="sm" disabled={pending}>
          {editing ? (
            <Save className="size-3.5" aria-hidden="true" />
          ) : (
            <Plus className="size-3.5" aria-hidden="true" />
          )}
          {pending ? "Salvando..." : editing ? "Salvar taxa" : "Adicionar taxa"}
        </Button>
      </div>
    </form>
  );
}

function CatalogRuleRow({
  name,
  description,
  active,
  compact,
  onEdit,
  onToggle,
  deleteTitle,
  deleteDescription,
  deleteAction,
}: {
  name: string;
  description: string;
  active: boolean;
  compact?: boolean;
  onEdit: () => void;
  onToggle: (active: boolean) => Promise<CatalogActionState>;
  deleteTitle: string;
  deleteDescription: string;
  deleteAction: (
    previousState: CatalogActionState,
    formData: FormData,
  ) => Promise<CatalogActionState>;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-card px-3 py-2">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-medium">{name}</p>
          <Badge variant={active ? "success" : "neutral"}>
            {active ? "Ativo" : "Inativo"}
          </Badge>
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
      </div>
      <div className="flex items-center gap-1">
        <Button
          type="button"
          size={compact ? "icon-sm" : "sm"}
          variant="ghost"
          aria-label={compact ? `Editar ${name}` : undefined}
          onClick={onEdit}
        >
          <Pencil className="size-3.5" aria-hidden="true" />
          {!compact ? "Editar" : null}
        </Button>
        <AsyncStatusButton
          active={active}
          activateLabel={`Ativar ${name}`}
          deactivateLabel={`Desativar ${name}`}
          execute={onToggle}
        />
        <DeleteCatalogButton
          title={deleteTitle}
          description={deleteDescription}
          execute={deleteAction}
        />
      </div>
    </div>
  );
}

function AsyncStatusButton({
  active,
  activateLabel,
  deactivateLabel,
  execute,
}: {
  active: boolean;
  activateLabel: string;
  deactivateLabel: string;
  execute: (active: boolean) => Promise<CatalogActionState>;
}) {
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string>();

  async function updateStatus(nextActive: boolean) {
    const result = await execute(nextActive);
    if (result.error) {
      setError(result.error);
      toast.error(result.error);
      return false;
    }
    setError(undefined);
    if (result.success) toast.success(result.success);
    return true;
  }

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        disabled={pending}
        aria-label={active ? deactivateLabel : activateLabel}
        onClick={() => {
          if (active) {
            setConfirming(true);
            return;
          }
          startTransition(async () => {
            await updateStatus(true);
          });
        }}
      >
        {pending ? "..." : active ? "Desativar" : "Ativar"}
      </Button>
      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        title={`${deactivateLabel}?`}
        description="O item deixará de estar disponível para novos lançamentos. Registros anteriores serão preservados."
        confirmLabel="Desativar"
        pendingLabel="Desativando..."
        destructive
        error={error}
        onConfirm={() => updateStatus(false)}
      />
    </>
  );
}

function DeleteCatalogButton({
  title,
  description,
  execute,
}: {
  title: string;
  description: string;
  execute: (
    previousState: CatalogActionState,
    formData: FormData,
  ) => Promise<CatalogActionState>;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  async function formAction(formData: FormData) {
    startTransition(async () => {
      const result = await execute(initialState, formData);
      if (result.error) {
        setError(result.error);
        return;
      }
      setError(undefined);
      setOpen(false);
      if (result.success) toast.success(result.success);
    });
  }

  return (
    <>
      <Button
        type="button"
        size="icon-sm"
        variant="destructive-ghost"
        aria-label={title}
        onClick={() => {
          setError(undefined);
          setOpen(true);
        }}
      >
        <Trash2 className="size-3.5" aria-hidden="true" />
      </Button>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        title={title}
        description={description}
        error={error}
        pending={pending}
        formAction={formAction}
        confirmLabel="Excluir"
        pendingLabel="Excluindo..."
        destructive
        icon={Trash2}
      />
    </>
  );
}

function CatalogField({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="grid min-w-0 gap-2 text-sm font-medium">
      <span>
        {label}
        {required ? <span className="text-destructive"> *</span> : null}
      </span>
      {children}
    </label>
  );
}

function procedureCostTypeLabel(type: ProcedureCostRow["cost_type"]) {
  return {
    commission: "Comissão profissional",
    location_fee: "Taxa da unidade/local",
    materials: "Materiais e insumos",
    outsourced_service: "Serviço terceirizado",
    taxes: "Taxas e impostos",
    equipment: "Equipamento",
    other: "Outro custo",
  }[type];
}

function calculationLabel(type: "fixed" | "percentage", value: number) {
  if (type === "percentage") {
    return `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(Number(value))}%`;
  }
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number(value));
}

function paymentMethodTypeLabel(type: PaymentMethodRow["method_type"]) {
  return {
    cash: "Dinheiro",
    pix: "Pix",
    credit_card: "Cartão de crédito",
    debit_card: "Cartão de débito",
    bank_transfer: "Transferência bancária",
    other: "Outro",
  }[type];
}

function paymentMethodDisplayName(method: PaymentMethodRow) {
  if (/[ÃÂ�]/.test(method.name) && method.method_type !== "other") {
    return paymentMethodTypeLabel(method.method_type);
  }
  return method.name;
}
