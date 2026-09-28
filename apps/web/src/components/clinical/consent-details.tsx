"use client";

import { useEffect, useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  loadConsentDetails,
  recordConsentEvent,
} from "@/app/(app)/documentos/consent-actions";
import {
  consentEvidenceSchema,
  consentStatus,
  consentStatusLabels,
  type ConsentDetails,
  type ConsentSignature,
  type ConsentEventSummary,
} from "@/lib/clinical/consent";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, Select, Textarea } from "@/components/ui/field";
import { Checkbox } from "@/components/ui/checkbox";
import { FormError } from "@/components/ui/form-error";
import { ConsentSignatureInput, SignaturePaths } from "./consent-signature";

export function ConsentStatusBadge({
  events,
}: {
  events: ConsentEventSummary[];
}) {
  const status = consentStatus(events);
  return (
    <Badge
      variant={
        status === "signed"
          ? "success"
          : status === "revoked" || status === "cancelled"
            ? "destructive"
            : "neutral"
      }
    >
      {consentStatusLabels[status]}
    </Badge>
  );
}

export function ConsentDetailsButton({ documentId }: { documentId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={() => setOpen(true)}
      >
        Ver termo e assinatura
      </Button>
      {open ? (
        <ConsentDetailsModal
          documentId={documentId}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

export function ConsentDetailsModal({
  documentId,
  onClose,
}: {
  documentId: string;
  onClose: () => void;
}) {
  const [result, setResult] = useState<{
    data?: ConsentDetails;
    error?: string;
  } | null>(null);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let current = true;
    loadConsentDetails(documentId)
      .then((data) => {
        if (current) setResult(data);
      })
      .catch(() => {
        if (current) setResult({ error: "Não foi possível carregar o termo." });
      });
    return () => {
      current = false;
    };
  }, [documentId, revision]);
  if (!result?.data)
    return (
      <Modal open onClose={onClose} title="Termo de consentimento">
        {!result ? (
          <p role="status" className="text-body-sm text-muted-foreground">
            Carregando termo...
          </p>
        ) : (
          <div className="grid gap-3">
            <FormError message={result.error} />
            <Button
              variant="secondary"
              onClick={() => {
                setResult(null);
                setRevision((v) => v + 1);
              }}
            >
              Tentar novamente
            </Button>
          </div>
        )}
      </Modal>
    );
  return (
    <ConsentContent
      data={result.data}
      onClose={onClose}
      onRefresh={async () => {
        const loaded = await loadConsentDetails(documentId);
        setResult(loaded);
      }}
    />
  );
}

function ConsentContent({
  data,
  onClose,
  onRefresh,
}: {
  data: ConsentDetails;
  onClose: () => void;
  onRefresh: () => Promise<void>;
}) {
  const router = useRouter();
  const formId = useId();
  const [mode, setMode] = useState<"view" | "signed" | "cancelled" | "revoked">(
    "view",
  );
  const [role, setRole] = useState<"patient" | "guardian">("patient");
  const [name, setName] = useState(data.patientName);
  const [identity, setIdentity] = useState("");
  const [relationship, setRelationship] = useState("");
  const [signature, setSignature] = useState<ConsentSignature>({
    method: "drawn",
    strokes: [],
  });
  const [acknowledged, setAcknowledged] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const status = consentStatus(data.events);
  const signed = data.events.find((event) => event.event_type === "signed");
  const format = (date: string) =>
    new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
      timeZone: data.timeZone,
    }).format(new Date(date));
  const evidence = {
    signer_role: role,
    signer_name: name,
    signer_document: identity,
    guardian_relationship: relationship,
    signature,
    acknowledged,
  };
  const ready =
    mode === "signed"
      ? consentEvidenceSchema.safeParse(evidence).success
      : reason.trim().length >= 5;

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (mode === "view" || pending) return;
    setError(undefined);
    startTransition(async () => {
      try {
        const result = await recordConsentEvent(
          data.id,
          mode,
          mode === "signed" ? evidence : { reason },
        );
        if (result.error) {
          setError(result.error);
          return;
        }
        toast.success(
          mode === "signed"
            ? "Assinatura registrada."
            : mode === "revoked"
              ? "Revogação registrada."
              : "Termo cancelado.",
        );
        setMode("view");
        setSignature({ method: "drawn", strokes: [] });
        setAcknowledged(false);
        router.refresh();
        await onRefresh();
      } catch {
        setError(
          "Não foi possível confirmar o resultado. Atualize os detalhes antes de tentar novamente.",
        );
      }
    });
  }
  return (
    <Modal
      open
      onClose={() => {
        if (!pending) onClose();
      }}
      title={data.title}
      description={`${data.patientName} · ${data.procedure}`}
      className="max-w-3xl"
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            type="button"
            variant="secondary"
            disabled={pending}
            onClick={() => {
              setError(undefined);
              if (mode === "view") onClose();
              else setMode("view");
            }}
          >
            {mode === "view" ? "Fechar" : "Voltar"}
          </Button>
          {mode === "view" ? (
            <>
              <Button asChild variant="secondary">
                <a
                  href={`/documentos/${data.id}/pdf`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Abrir PDF<span className="sr-only"> (nova aba)</span>
                </a>
              </Button>
              {data.canManage && status === "pending" ? (
                <>
                  <Button variant="ghost" onClick={() => setMode("cancelled")}>
                    Cancelar termo
                  </Button>
                  <Button onClick={() => setMode("signed")}>
                    Coletar assinatura
                  </Button>
                </>
              ) : null}
              {data.canManage && status === "signed" ? (
                <Button variant="secondary" onClick={() => setMode("revoked")}>
                  Registrar revogação
                </Button>
              ) : null}
            </>
          ) : (
            <Button
              type="submit"
              form={formId}
              disabled={pending || !ready}
              variant={mode === "signed" ? "primary" : "destructive"}
            >
              {pending
                ? "Registrando..."
                : mode === "signed"
                  ? "Assinar e registrar consentimento"
                  : mode === "revoked"
                    ? "Confirmar revogação"
                    : "Confirmar cancelamento"}
            </Button>
          )}
        </div>
      }
    >
      <div className="grid gap-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <ConsentStatusBadge events={data.events} />
          <span className="text-caption text-muted-foreground">
            Preparado em {format(data.issuedAt)}
          </span>
        </div>
        <section
          aria-label="Texto integral do termo"
          className="rounded-md border border-border bg-muted/30 p-4"
        >
          <p className="whitespace-pre-wrap break-words text-body-sm leading-relaxed">
            {data.body}
          </p>
        </section>
        {mode === "signed" ? (
          <form
            id={formId}
            onSubmit={submit}
            className="grid gap-4 border-t border-border pt-4"
          >
            <div>
              <h3 className="text-heading-sm font-semibold">
                Assinatura presencial
              </h3>
              <p className="mt-1 text-body-sm text-muted-foreground">
                Entregue o dispositivo ao paciente ou responsável para conferir
                o termo e assinar. O registro ficará associado ao usuário que
                está conduzindo a coleta.
              </p>
            </div>
            <label className="grid gap-2 text-label font-medium">
              Quem está assinando?
              <Select
                value={role}
                disabled={pending}
                onValueChange={(value) => {
                  const next = value as "patient" | "guardian";
                  setRole(next);
                  setName(next === "patient" ? data.patientName : "");
                  setSignature({ method: "drawn", strokes: [] });
                  setAcknowledged(false);
                }}
              >
                <option value="patient">Paciente</option>
                <option value="guardian">Responsável pelo paciente</option>
              </Select>
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-2 text-label font-medium">
                Nome completo
                <Input
                  value={name}
                  readOnly={role === "patient"}
                  disabled={pending}
                  onChange={(e) => setName(e.target.value)}
                  required
                  minLength={3}
                  maxLength={160}
                />
              </label>
              <label className="grid gap-2 text-label font-medium">
                Documento de identificação
                <Input
                  value={identity}
                  disabled={pending}
                  onChange={(e) => setIdentity(e.target.value)}
                  placeholder="CPF, RG ou outro documento"
                  required
                  minLength={3}
                  maxLength={80}
                />
              </label>
            </div>
            {role === "guardian" ? (
              <label className="grid gap-2 text-label font-medium">
                Vínculo com o paciente
                <Input
                  value={relationship}
                  disabled={pending}
                  onChange={(e) => setRelationship(e.target.value)}
                  placeholder="Ex.: mãe, pai, tutor"
                  required
                  minLength={3}
                  maxLength={160}
                />
              </label>
            ) : null}
            <ConsentSignatureInput
              value={signature}
              onChange={setSignature}
              disabled={pending}
            />
            <Checkbox
              label="Li o termo acima, pude esclarecer minhas dúvidas e concordo com o procedimento ou tratamento descrito."
              checked={acknowledged}
              disabled={pending}
              onChange={(event) => setAcknowledged(event.target.checked)}
              required
            />
            <p className="text-caption text-muted-foreground">
              A assinatura é coletada neste dispositivo, sem certificado
              digital.
            </p>
          </form>
        ) : mode !== "view" ? (
          <form id={formId} onSubmit={submit} className="grid gap-3">
            <p className="text-body-sm">
              {mode === "revoked"
                ? "Registre a solicitação de revogação, identificando quem a solicitou e o motivo. A assinatura e o texto original continuarão no histórico."
                : "O termo ficará cancelado e não poderá receber assinatura. O histórico será preservado."}
            </p>
            <label className="grid gap-2 text-label font-medium">
              Motivo
              <Textarea
                value={reason}
                disabled={pending}
                onChange={(e) => setReason(e.target.value)}
                required
                minLength={5}
                maxLength={2000}
              />
            </label>
          </form>
        ) : null}
        <FormError message={error} />
        {mode === "view" && signed ? (
          <section className="grid gap-2 border-t border-border pt-4">
            <h3 className="text-heading-sm font-semibold">
              Assinatura registrada
            </h3>
            <p className="text-body-sm">
              {signed.signer_name} ·{" "}
              {signed.signer_role === "guardian"
                ? `Responsável (${signed.guardian_relationship})`
                : "Paciente"}
            </p>
            <p className="text-caption text-muted-foreground">
              Documento: {signed.signer_document}
            </p>
            {signed.signature?.method === "drawn" ? (
              <svg
                viewBox="0 0 1000 240"
                role="img"
                aria-label={`Assinatura de ${signed.signer_name}`}
                className="h-32 w-full rounded-md border border-border bg-white text-slate-950"
              >
                <SignaturePaths signature={signed.signature} />
              </svg>
            ) : (
              <p className="rounded-md border border-border p-3 text-heading-sm">
                {signed.signature?.method === "typed"
                  ? signed.signature.name
                  : ""}
                <span className="mt-1 block text-caption text-muted-foreground">
                  Assinatura por nome digitado
                </span>
              </p>
            )}
          </section>
        ) : null}
        {mode === "view" && data.events.length ? (
          <section className="grid gap-2 border-t border-border pt-4">
            <h3 className="text-heading-sm font-semibold">
              Histórico do termo
            </h3>
            <ol className="grid gap-3">
              {data.events.map((event) => (
                <li key={event.id} className="text-body-sm">
                  <p className="font-medium">
                    {consentStatusLabels[event.event_type]} ·{" "}
                    {format(event.created_at)}
                  </p>
                  <p className="text-caption text-muted-foreground">
                    Registrado por {event.recorded_by_name}
                  </p>
                  {event.reason ? (
                    <p className="mt-1 whitespace-pre-wrap break-words">
                      {event.reason}
                    </p>
                  ) : null}
                </li>
              ))}
            </ol>
          </section>
        ) : null}
      </div>
    </Modal>
  );
}
