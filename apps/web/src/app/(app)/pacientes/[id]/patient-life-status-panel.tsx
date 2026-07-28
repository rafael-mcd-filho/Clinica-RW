"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  HeartBreak,
  ArrowCounterClockwise as RotateCcw,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import { updatePatientLifeStatus } from "../actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { DatePickerInput } from "@/components/ui/date-picker-input";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/field";

export function PatientLifeStatusPanel({
  canEdit,
  deathNotes,
  deceasedAt,
  patientId,
  patientName,
  today,
}: {
  canEdit: boolean;
  deathNotes: string | null;
  deceasedAt: string | null;
  patientId: string;
  patientName: string;
  today: string;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [date, setDate] = useState(deceasedAt ?? today);
  const [notes, setNotes] = useState(deathNotes ?? "");
  const [actionError, setActionError] = useState<string>();

  function closeConfirmation() {
    setConfirming(false);
    setActionError(undefined);
  }

  async function submitLifeStatus(deceased: boolean) {
    setActionError(undefined);
    const formData = new FormData();
    formData.set("deceased", String(deceased));
    if (deceased) {
      formData.set("deceased_at", date);
      formData.set("death_notes", notes);
    }

    const result = await updatePatientLifeStatus(patientId, {}, formData);
    if (result.error) {
      setActionError(result.error);
      toast.error(result.error);
      return false;
    }

    if (result.success) toast.success(result.success);
    router.refresh();
    return true;
  }

  if (deceasedAt) {
    return (
      <Card className="border-destructive/35 bg-destructive-muted/30">
        <CardHeader className="flex-row items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-semibold text-destructive-foreground">
                Óbito registrado
              </h3>
              <Badge variant="destructive">{formatDate(deceasedAt)}</Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Comunicações e automações de aniversário estão bloqueadas.
            </p>
          </div>
          <HeartBreak
            className="size-5 shrink-0 text-destructive"
            aria-hidden="true"
          />
        </CardHeader>
        {deathNotes ? (
          <CardContent>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Observação interna
            </p>
            <p className="mt-1 whitespace-pre-wrap text-sm">{deathNotes}</p>
          </CardContent>
        ) : null}
        {canEdit ? (
          <CardContent className="flex justify-end border-t border-destructive/20 pt-4">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => setConfirming(true)}
            >
              <RotateCcw className="size-4" aria-hidden="true" />
              Corrigir informação
            </Button>
            <ConfirmDialog
              open={confirming}
              onClose={closeConfirmation}
              title="Remover registro de óbito?"
              description={`Use esta opção somente para corrigir um registro feito por engano para ${patientName}. As preferências anteriores de contato serão preservadas.`}
              confirmLabel="Remover registro"
              pendingLabel="Removendo..."
              error={actionError}
              onConfirm={() => submitLifeStatus(false)}
            />
          </CardContent>
        ) : null}
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <h3 className="font-semibold">Situação do paciente</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          O registro de óbito desativa o paciente, bloqueia novos envios e
          impede automações de aniversário.
        </p>
      </CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-2">
        <label className="grid gap-2 text-sm font-medium">
          Data do óbito
          <DatePickerInput
            name="deceased_at_preview"
            value={date}
            onValueChange={setDate}
            todayValue={today}
            disabled={!canEdit}
          />
        </label>
        <label className="grid gap-2 text-sm font-medium">
          Observação interna (opcional)
          <Textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            rows={3}
            maxLength={1000}
            className="min-h-20"
            disabled={!canEdit}
          />
        </label>
        {canEdit ? (
          <div className="flex justify-end md:col-span-2">
            <Button
              type="button"
              variant="destructive"
              onClick={() => setConfirming(true)}
              disabled={!date}
            >
              <HeartBreak className="size-4" aria-hidden="true" />
              Informar óbito
            </Button>
          </div>
        ) : null}
      </CardContent>
      <ConfirmDialog
        open={confirming}
        onClose={closeConfirmation}
        title="Confirmar óbito?"
        description={`Esta ação sinalizará ${patientName} como falecido, bloqueará novos envios de mensagens e impedirá automações de aniversário. As preferências de contato serão preservadas no histórico.`}
        confirmLabel="Confirmar óbito"
        pendingLabel="Registrando..."
        destructive
        error={actionError}
        onConfirm={() => submitLifeStatus(true)}
      />
    </Card>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(
    new Date(`${value}T00:00:00Z`),
  );
}
