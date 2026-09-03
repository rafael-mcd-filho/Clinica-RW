"use client";

import { useActionState, useEffect } from "react";
import {
  Hourglass,
  ListPlus,
  PhoneCall,
  WhatsappLogo,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import {
  updateWaitlistEntryStatus,
  type AgendaActionState,
  type WaitlistCandidate,
} from "@/app/(app)/agenda/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Modal } from "@/components/ui/modal";

const initialState: AgendaActionState = {};
const periodLabel: Record<string, string> = {
  morning: "Manhã",
  afternoon: "Tarde",
  evening: "Noite",
  any: "Qualquer período",
};

/**
 * O que a fila de espera existe para fazer: um horário vagou, quem estava
 * esperando por ele aparece na hora.
 *
 * Antes disso o cancelamento liberava o horário em silêncio e a fila só era
 * consultada se alguém lembrasse de abrir o painel. A ordem é a de chegada, e
 * o casamento por procedimento, profissional e turno é feito no banco.
 */
export function WaitlistSuggestionModal({
  candidates,
  slotLabel,
  onClose,
}: {
  candidates: WaitlistCandidate[];
  /** Data e hora do horário que vagou, já no fuso da empresa. */
  slotLabel: string;
  onClose: () => void;
}) {
  return (
    <Modal
      open
      onClose={onClose}
      title="Quem está esperando por este horário"
      description={`${slotLabel} acabou de vagar. A ordem é a de chegada na fila.`}
    >
      {candidates.length ? (
        <ul className="divide-y divide-border">
          {candidates.map((candidate, index) => (
            <CandidateRow
              key={candidate.id}
              candidate={candidate}
              position={index + 1}
            />
          ))}
        </ul>
      ) : (
        <EmptyState
          icon={ListPlus}
          title="Ninguém na fila para este horário."
          description="A fila não tem paciente aguardando por este procedimento, profissional e turno."
          className="py-6"
        />
      )}
    </Modal>
  );
}

function CandidateRow({
  candidate,
  position,
}: {
  candidate: WaitlistCandidate;
  position: number;
}) {
  const action = updateWaitlistEntryStatus.bind(null, candidate.id);
  const [state, formAction, pending] = useActionState(action, initialState);
  // Derivado, não guardado: a entrada já vinha contatada, ou acabou de ser
  // marcada por este formulário.
  const contacted = candidate.status === "contacted" || Boolean(state.success);

  useEffect(() => {
    if (state.success) toast.success(state.success);
    if (state.error) toast.error(state.error);
  }, [state]);

  const whatsappHref = candidate.patient_phone
    ? `https://wa.me/${toWhatsAppDigits(candidate.patient_phone)}`
    : null;

  return (
    <li className="flex flex-wrap items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
      <div className="min-w-0 flex-1">
        <p className="flex min-w-0 items-center gap-2 text-body font-semibold">
          <span className="shrink-0 text-body-sm tabular-nums text-muted-foreground">
            {position}
          </span>
          <span className="truncate">{candidate.patient_name}</span>
          {contacted ? <Badge variant="neutral">Contatado</Badge> : null}
        </p>
        <p className="truncate text-body-sm text-muted-foreground">
          {candidate.procedure_name ?? "Qualquer procedimento"}
          {candidate.professional_name ? ` · ${candidate.professional_name}` : ""}
        </p>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-body-sm text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Hourglass className="size-3.5" aria-hidden="true" />
            na fila desde {formatDate(candidate.created_at)}
          </span>
          <span>
            {periodLabel[candidate.preferred_period || "any"] ?? "Período"}
          </span>
          {candidate.patient_phone ? (
            <span className="inline-flex items-center gap-1 tabular-nums">
              <PhoneCall className="size-3.5" aria-hidden="true" />
              {candidate.patient_phone}
            </span>
          ) : null}
        </p>
      </div>
      <div className="flex shrink-0 flex-wrap gap-2">
        {whatsappHref ? (
          <Button asChild size="sm" variant="secondary">
            <a href={whatsappHref} target="_blank" rel="noreferrer">
              <WhatsappLogo className="size-4" aria-hidden="true" />
              WhatsApp
            </a>
          </Button>
        ) : null}
        {contacted ? null : (
          <form action={formAction}>
            <input type="hidden" name="status" value="contacted" />
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? "Salvando..." : "Marcar contatado"}
            </Button>
          </form>
        )}
      </div>
    </li>
  );
}

function toWhatsAppDigits(phone: string) {
  const digits = phone.replace(/\D/g, "");
  return digits.length <= 11 && !digits.startsWith("55")
    ? `55${digits}`
    : digits;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(
    new Date(value),
  );
}
