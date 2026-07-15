"use client";

import {
  useActionState,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react";
import { CreditCard, Pencil, Plus, Save, Trash2 } from "lucide-react";
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
import type {
  PaymentMethodFeeRow,
  PaymentMethodRow,
  ProcedureCostRow,
  ProcedureRow,
} from "@/lib/clinic/base-registrations";

const initialState: CatalogActionState = {};

type ProcedureCostEditor = {
  procedureId?: string;
  row?: ProcedureCostRow;
};

type PaymentFeeEditor = {
  paymentMethodId: string;
  row?: PaymentMethodFeeRow;
};

export function ProcedureCostsSection({
  procedures,
  costs,
}: {
  procedures: ProcedureRow[];
  costs: ProcedureCostRow[];
}) {
  const [editor, setEditor] = useState<ProcedureCostEditor | null>(null);
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

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
          <div>
            <div className="flex items-center gap-1.5">
              <h2 className="font-semibold">Custos opcionais</h2>
              <HelpTooltip>
                Estes custos não alteram o preço cobrado. Eles ficam disponíveis
                para análises de margem, comissão e custo operacional.
              </HelpTooltip>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Configure comissão, taxa do local ou outros custos por
              procedimento e serviço.
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            onClick={() => setEditor({})}
            disabled={!procedures.length}
          >
            <Plus className="size-3.5" aria-hidden="true" />
            Adicionar custo
          </Button>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4">
        {editor ? (
          <ProcedureCostForm
            key={editor.row?.id ?? editor.procedureId ?? "new"}
            procedures={procedures}
            procedureId={editor.procedureId}
            editing={editor.row}
            onClose={() => setEditor(null)}
          />
        ) : null}

        {procedures.map((procedure) => {
          const procedureCosts = costsByProcedure.get(procedure.id) ?? [];
          return (
            <section
              key={procedure.id}
              className="rounded-md border border-border bg-background"
              aria-labelledby={`procedure-costs-${procedure.id}`}
            >
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3
                      id={`procedure-costs-${procedure.id}`}
                      className="truncate text-sm font-semibold"
                    >
                      {procedure.name}
                    </h3>
                    <Badge variant={procedure.active ? "success" : "neutral"}>
                      {procedure.active ? "Ativo" : "Inativo"}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {procedureCosts.length
                      ? `${procedureCosts.length} custo${procedureCosts.length === 1 ? "" : "s"} configurado${procedureCosts.length === 1 ? "" : "s"}`
                      : "Nenhum custo configurado"}
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => setEditor({ procedureId: procedure.id })}
                >
                  <Plus className="size-3.5" aria-hidden="true" />
                  Custo
                </Button>
              </div>
              <div className="grid gap-2 p-3">
                {procedureCosts.map((cost) => (
                  <CatalogRuleRow
                    key={cost.id}
                    name={cost.name}
                    description={`${procedureCostTypeLabel(cost.cost_type)} · ${calculationLabel(cost.calculation_type, cost.value)}`}
                    active={cost.active}
                    onEdit={() =>
                      setEditor({ procedureId: procedure.id, row: cost })
                    }
                    onToggle={(active) =>
                      setProcedureCostActive(cost.id, active)
                    }
                    deleteTitle="Excluir custo?"
                    deleteDescription="O custo será removido deste procedimento. Esta ação não altera atendimentos ou valores já cobrados."
                    deleteAction={deleteProcedureCost.bind(null, cost.id)}
                  />
                ))}
                {!procedureCosts.length ? (
                  <p className="px-1 py-2 text-sm text-muted-foreground">
                    O cadastro de custos é opcional.
                  </p>
                ) : null}
              </div>
            </section>
          );
        })}

        {!procedures.length ? (
          <p className="rounded-md border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
            Cadastre um procedimento ou serviço antes de adicionar custos.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
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

  useEffect(() => {
    if (state.success) {
      toast.success(state.success);
      onClose();
    }
  }, [onClose, state.success]);

  return (
    <form
      action={action}
      className="grid gap-4 rounded-md border border-primary/25 bg-primary-muted/30 p-4 md:grid-cols-2 xl:grid-cols-5"
    >
      <CatalogField label="Procedimento ou serviço" required>
        <Select
          name="procedure_id"
          required
          defaultValue={editing?.procedure_id ?? procedureId ?? ""}
        >
          <option value="">Selecione</option>
          {procedures.map((procedure) => (
            <option key={procedure.id} value={procedure.id}>
              {procedure.name}
            </option>
          ))}
        </Select>
      </CatalogField>
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
          <option value="commission">Comissão</option>
          <option value="location_fee">Taxa do local</option>
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
      <FormError
        message={state.error}
        className="md:col-span-2 xl:col-span-5"
      />
      <div className="flex justify-end gap-2 md:col-span-2 xl:col-span-5">
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

        {feeEditor ? (
          <PaymentMethodFeeForm
            key={feeEditor.row?.id ?? feeEditor.paymentMethodId}
            methods={methods}
            paymentMethodId={feeEditor.paymentMethodId}
            editing={feeEditor.row}
            onClose={() => setFeeEditor(null)}
          />
        ) : null}

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
    <form
      action={action}
      className="grid gap-4 rounded-md border border-primary/25 bg-primary-muted/30 p-4 md:grid-cols-2"
    >
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
      <div className="flex justify-end gap-2 md:col-span-2">
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
    <form
      action={action}
      className="grid gap-4 rounded-md border border-primary/25 bg-primary-muted/30 p-4 md:grid-cols-2 xl:grid-cols-4"
    >
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
      <FormError
        message={state.error}
        className="md:col-span-2 xl:col-span-4"
      />
      <div className="flex justify-end gap-2 md:col-span-2 xl:col-span-4">
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

  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      disabled={pending}
      aria-label={active ? deactivateLabel : activateLabel}
      onClick={() =>
        startTransition(async () => {
          const result = await execute(!active);
          if (result.error) toast.error(result.error);
          else if (result.success) toast.success(result.success);
        })
      }
    >
      {pending ? "..." : active ? "Desativar" : "Ativar"}
    </Button>
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
    <label className="grid gap-2 text-sm font-medium">
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
    commission: "Comissão",
    location_fee: "Taxa do local",
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
