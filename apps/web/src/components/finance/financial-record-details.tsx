"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ArrowSquareOut, CaretRight, QrCode } from "@phosphor-icons/react";
import {
  loadFinancialDetails,
  type FinancialDetails,
  type FinancialDetailsResult,
  type FinancialRecordKind,
} from "@/app/(app)/financeiro/detail-actions";
import {
  ReceivePaymentDialog,
  PayPayableDialog,
  PayPayoutDialog,
} from "./settlement-dialogs";
import { Modal } from "@/components/ui/modal";
import {
  cancelAccountPayable,
  cancelAccountReceivable,
  reopenAccountPayable,
  reverseReceivablePayment,
  updateOpenAccountReceivable,
} from "@/app/(app)/financeiro/actions";
import { EditReceivableDialog, ReasonDialog } from "./correction-dialogs";
import { PixChargeDialog } from "./pix-charge-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const money = (value: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    value,
  );
const date = (value: string) => value.split("-").reverse().join("/");
const titles = {
  receivable: "Conta a receber",
  payment: "Recebimento",
  payable: "Conta a pagar",
  payout: "Repasse profissional",
};
const statuses: Record<string, string> = {
  open: "Em aberto",
  partial: "Recebido parcialmente",
  paid: "Pago",
  pending: "Pendente",
  cancelled: "Cancelado",
  written_off: "Baixado",
};

/** O mesmo ponto de entrada no perfil e nas listas do financeiro. */
export function FinancialRecordTrigger({
  kind,
  recordId,
  label,
  className,
  children,
  card = false,
}: {
  kind: FinancialRecordKind;
  recordId: string;
  label: string;
  children: ReactNode;
  className?: string;
  card?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        aria-label={`Ver detalhes: ${label}`}
        aria-haspopup="dialog"
        onClick={(event) => {
          event.stopPropagation();
          setOpen(true);
        }}
        className={cn(
          "min-w-0 cursor-pointer rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          card
            ? "group flex w-full items-center gap-3 border border-border px-3 py-3 hover:bg-accent/40"
            : "min-h-8 underline decoration-border underline-offset-4 hover:text-primary hover:decoration-current",
          className,
        )}
      >
        {children}
        {card ? (
          <CaretRight
            className="size-4 shrink-0 text-muted-foreground group-hover:text-primary"
            aria-hidden="true"
          />
        ) : null}
      </button>
      {open ? (
        <FinancialRecordDetails
          kind={kind}
          recordId={recordId}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

function FinancialRecordDetails({
  kind,
  recordId,
  onClose,
}: {
  kind: FinancialRecordKind;
  recordId: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [result, setResult] = useState<FinancialDetailsResult | null>(null);
  const [revision, setRevision] = useState(0);
  const [settling, setSettling] = useState(false);
  useEffect(() => {
    let current = true;
    loadFinancialDetails(kind, recordId)
      .then((loaded) => {
        if (current) setResult(loaded);
      })
      .catch(() => {
        if (current)
          setResult({
            error: "Não foi possível carregar o lançamento. Tente novamente.",
          });
      });
    return () => {
      current = false;
    };
  }, [kind, recordId, revision]);
  const reload = useCallback(() => {
    setResult(null);
    setRevision((value) => value + 1);
    router.refresh();
  }, [router]);
  const closeSettlement = useCallback(() => setSettling(false), []);
  const [chargingPix, setChargingPix] = useState(false);
  const [correction, setCorrection] = useState<
    | null
    | {
        type:
          | "cancel-receivable"
          | "edit-receivable"
          | "cancel-payable"
          | "reopen-payable";
      }
    | { type: "reverse-payment"; paymentId: string }
  >(null);
  const details = result?.data;
  const row = details?.record.row as
    | {
        id: string;
        status?: string;
        description?: string;
        amount?: number | string;
        due_date?: string;
        paid_amount?: number | string;
      }
    | undefined;
  const canSettle =
    details?.canSettle &&
    (kind === "payout" || details.paymentMethods.length > 0);
  return (
    <>
      <Modal
        open
        onClose={onClose}
        title={titles[kind]}
        description={
          details?.description ?? "Detalhes e ações do lançamento financeiro."
        }
        footer={
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>
              Fechar
            </Button>
            {details?.record.kind === "payment" ? (
              <ReceiptLink id={details.record.row.id} />
            ) : null}
            {/* Correções (Raio-X FI1): estorno, cancelamento e edição. */}
            {details?.record.kind === "payment" ? (
              <Button
                variant="destructive-ghost"
                onClick={() =>
                  setCorrection({
                    type: "reverse-payment",
                    paymentId: details.record.row.id,
                  })
                }
              >
                Estornar recebimento
              </Button>
            ) : null}
            {details?.record.kind === "receivable" &&
            row &&
            ["open", "partial"].includes(row.status ?? "") ? (
              <>
                {Number(row.paid_amount ?? 0) === 0 ? (
                  <Button
                    variant="destructive-ghost"
                    onClick={() => setCorrection({ type: "cancel-receivable" })}
                  >
                    Cancelar conta
                  </Button>
                ) : null}
                <Button
                  variant="secondary"
                  onClick={() => setCorrection({ type: "edit-receivable" })}
                >
                  Editar
                </Button>
              </>
            ) : null}
            {details?.record.kind === "payable" && row?.status === "open" ? (
              <Button
                variant="destructive-ghost"
                onClick={() => setCorrection({ type: "cancel-payable" })}
              >
                Cancelar conta
              </Button>
            ) : null}
            {details?.record.kind === "payable" && row?.status === "paid" ? (
              <Button
                variant="destructive-ghost"
                onClick={() => setCorrection({ type: "reopen-payable" })}
              >
                Estornar pagamento
              </Button>
            ) : null}
            {details?.record.kind === "receivable" &&
            row &&
            ["open", "partial"].includes(row.status ?? "") &&
            Number(row.amount ?? 0) > Number(row.paid_amount ?? 0) ? (
              <Button variant="secondary" onClick={() => setChargingPix(true)}>
                <QrCode className="size-4" aria-hidden="true" />
                Cobrar por Pix
              </Button>
            ) : null}
            {canSettle ? (
              <Button onClick={() => setSettling(true)}>
                {kind === "receivable"
                  ? "Registrar recebimento"
                  : "Registrar pagamento"}
              </Button>
            ) : null}
          </div>
        }
      >
        {!result ? (
          <p role="status" className="py-6 text-body-sm text-muted-foreground">
            Carregando lançamento...
          </p>
        ) : result.error ? (
          <div className="grid gap-3">
            <p
              role="alert"
              className="text-body-sm text-destructive-foreground"
            >
              {result.error}
            </p>
            <Button variant="secondary" onClick={reload}>
              Tentar novamente
            </Button>
          </div>
        ) : details ? (
          <DetailsContent details={details} />
        ) : null}
      </Modal>
      {correction?.type === "reverse-payment" ? (
        <ReasonDialog
          open
          title="Estornar este recebimento?"
          description="O valor sai do caixa e volta a ficar em aberto na conta. O repasse pendente gerado por ele também é desfeito."
          confirmLabel="Estornar"
          onClose={() => setCorrection(null)}
          onSubmit={(reason) =>
            reverseReceivablePayment(correction.paymentId, reason)
          }
          onDone={() => {
            setCorrection(null);
            reload();
          }}
        />
      ) : null}
      {correction?.type === "cancel-receivable" && row ? (
        <ReasonDialog
          open
          title="Cancelar esta conta a receber?"
          description="A conta sai dos valores em aberto. O motivo fica registrado."
          confirmLabel="Cancelar conta"
          onClose={() => setCorrection(null)}
          onSubmit={(reason) => cancelAccountReceivable(row.id, reason)}
          onDone={() => {
            setCorrection(null);
            reload();
          }}
        />
      ) : null}
      {correction?.type === "edit-receivable" && row ? (
        <EditReceivableDialog
          open
          initial={{
            description: row.description ?? "",
            amount: Number(row.amount ?? 0),
            due_date: row.due_date ?? details?.today ?? "",
          }}
          onClose={() => setCorrection(null)}
          onSubmit={(input) => updateOpenAccountReceivable(row.id, input)}
          onDone={() => {
            setCorrection(null);
            reload();
          }}
        />
      ) : null}
      {correction?.type === "cancel-payable" && row ? (
        <ReasonDialog
          open
          title="Cancelar esta conta a pagar?"
          description="A conta sai dos compromissos em aberto. O motivo fica registrado."
          confirmLabel="Cancelar conta"
          onClose={() => setCorrection(null)}
          onSubmit={(reason) => cancelAccountPayable(row.id, reason)}
          onDone={() => {
            setCorrection(null);
            reload();
          }}
        />
      ) : null}
      {correction?.type === "reopen-payable" && row ? (
        <ReasonDialog
          open
          title="Estornar o pagamento desta conta?"
          description="A conta volta a ficar em aberto e sai das saídas do caixa."
          confirmLabel="Estornar pagamento"
          onClose={() => setCorrection(null)}
          onSubmit={(reason) => reopenAccountPayable(row.id, reason)}
          onDone={() => {
            setCorrection(null);
            reload();
          }}
        />
      ) : null}
      {chargingPix && details?.record.kind === "receivable" ? (
        <PixChargeDialog
          receivableId={details.record.row.id}
          onClose={() => setChargingPix(false)}
        />
      ) : null}
      {settling && details?.canSettle ? (
        <>
          {details.record.kind === "receivable" ? (
            <ReceivePaymentDialog
              receivable={details.record.row}
              paymentMethods={details.paymentMethods}
              today={details.today}
              onClose={closeSettlement}
              onSuccess={reload}
            />
          ) : null}
          {details.record.kind === "payable" ? (
            <PayPayableDialog
              payable={details.record.row}
              paymentMethods={details.paymentMethods}
              today={details.today}
              onClose={closeSettlement}
              onSuccess={reload}
            />
          ) : null}
          {details.record.kind === "payout" ? (
            <PayPayoutDialog
              payout={details.record.row}
              today={details.today}
              onClose={closeSettlement}
              onSuccess={reload}
            />
          ) : null}
        </>
      ) : null}
    </>
  );
}

function DetailsContent({ details: d }: { details: FinancialDetails }) {
  const remaining =
    d.paidAmount === null ? null : Math.max(0, d.amount - d.paidAmount);
  const overdue =
    d.dueDate &&
    d.dueDate < d.today &&
    ["open", "partial", "pending"].includes(d.status);
  const settledDate = (value: string) =>
    new Intl.DateTimeFormat("pt-BR", {
      timeZone: d.timeZone,
      dateStyle: "short",
    }).format(new Date(value));
  return (
    <div className="grid min-w-0 gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-heading font-semibold tabular-nums">
          {money(d.amount)}
        </p>
        <Badge
          variant={
            overdue
              ? "destructive"
              : d.status === "paid"
                ? "success"
                : "neutral"
          }
        >
          {overdue ? "Vencido" : (statuses[d.status] ?? d.status)}
        </Badge>
      </div>
      <dl className="grid grid-cols-1 gap-4 text-body-sm sm:grid-cols-2">
        {d.party ? (
          <Detail
            label={
              d.record.kind === "payable"
                ? "Fornecedor"
                : d.record.kind === "payout"
                  ? "Profissional"
                  : "Paciente"
            }
          >
            {d.party}
          </Detail>
        ) : null}
        {d.dueDate ? (
          <Detail label="Vencimento">{date(d.dueDate)}</Detail>
        ) : null}
        {d.record.kind === "receivable" || d.record.kind === "payable" ? (
          <Detail label="Categoria">{d.category || "Sem categoria"}</Detail>
        ) : null}
        {d.paidAt ? (
          <Detail label="Data do pagamento">{settledDate(d.paidAt)}</Detail>
        ) : null}
        {d.paymentMethod ? (
          <Detail label="Forma de pagamento">{d.paymentMethod}</Detail>
        ) : null}
        {d.paidAmount !== null ? (
          <Detail label="Total recebido">{money(d.paidAmount)}</Detail>
        ) : null}
        {remaining !== null &&
        ["open", "partial", "paid"].includes(d.status) ? (
          <Detail label="Saldo em aberto">{money(remaining)}</Detail>
        ) : null}
      </dl>
      {d.notes ? (
        <section>
          <h3 className="text-label font-semibold">Observações</h3>
          <p className="mt-1 whitespace-pre-wrap break-words text-body-sm text-muted-foreground">
            {d.notes}
          </p>
        </section>
      ) : null}
      {d.canSettle && d.record.kind !== "payout" && !d.paymentMethods.length ? (
        <p role="status" className="text-body-sm text-muted-foreground">
          Cadastre uma forma de pagamento ativa nas configurações do financeiro
          para registrar a baixa.
        </p>
      ) : null}
      {d.record.kind === "receivable" ? (
        <section className="grid gap-3 border-t border-border pt-4">
          <h3 className="text-heading-sm font-semibold">
            Recebimentos ({d.paymentCount})
          </h3>
          {!d.payments.length ? (
            <p className="text-body-sm text-muted-foreground">
              Nenhum recebimento registrado.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {d.payments.map((payment) => (
                <li
                  key={payment.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-2"
                >
                  <div>
                    <p className="text-body-sm font-medium tabular-nums">
                      {money(Number(payment.amount))}
                    </p>
                    <p className="text-caption text-muted-foreground">
                      {settledDate(payment.paid_at)} ·{" "}
                      {payment.payment_methods?.name ?? "Forma não informada"}
                    </p>
                  </div>
                  <ReceiptLink id={payment.id} />
                </li>
              ))}
            </ul>
          )}
          {d.paymentCount > d.payments.length ? (
            <p className="text-caption text-muted-foreground">
              Exibindo os {d.payments.length} recebimentos mais recentes.
              Consulte os demais em Financeiro → Movimentações.
            </p>
          ) : null}
        </section>
      ) : null}
      {d.record.kind === "payment" ? (
        <FinancialRecordTrigger
          kind="receivable"
          recordId={d.record.row.account_receivable_id}
          label="Conta de origem"
        >
          Ver conta de origem
        </FinancialRecordTrigger>
      ) : null}
    </div>
  );
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-caption text-muted-foreground">{label}</dt>
      <dd className="mt-1 break-words font-medium tabular-nums">{children}</dd>
    </div>
  );
}

function ReceiptLink({ id }: { id: string }) {
  return (
    <Button asChild variant="secondary" size="sm">
      <a
        href={`/financeiro/recibos/${id}/pdf`}
        target="_blank"
        rel="noopener noreferrer"
      >
        Recibo <ArrowSquareOut className="size-4" aria-hidden="true" />
        <span className="sr-only"> (abre em nova aba)</span>
      </a>
    </Button>
  );
}
