"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  DotsThreeVertical,
  Plus,
  Star,
  Stethoscope,
  Trash,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import {
  addPatientDiagnosis,
  removePatientDiagnosis,
  setPrimaryPatientDiagnosis,
} from "./overview-actions";
import { CidCombobox } from "@/components/clinical/cid-combobox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmDialog } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/field";
import { OverviewCard } from "./patient-overview-card";

export type PatientDiagnosisView = {
  id: string;
  cidCode: string;
  description: string | null;
  isPrimary: boolean;
};

export type DiagnosisSuggestion = {
  cidCode: string;
  description: string | null;
};

/**
 * Diagnósticos (CID) do paciente: a lista que acompanha a pessoa entre os
 * atendimentos. Os CIDs lançados nos atendimentos aparecem como sugestão
 * para entrar na lista com um clique.
 */
export function PatientDiagnosesCard({
  available,
  canEdit,
  diagnoses,
  patientId,
  suggestions,
}: {
  /** Falso enquanto o banco não tem a lista (migração pendente). */
  available: boolean;
  canEdit: boolean;
  diagnoses: PatientDiagnosisView[];
  patientId: string;
  suggestions: DiagnosisSuggestion[];
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<PatientDiagnosisView | null>(null);
  // Sem a lista no banco, mostra os CIDs dos atendimentos (só leitura).
  const rows: PatientDiagnosisView[] = available
    ? diagnoses
    : suggestions.map((item, index) => ({
        id: `atendimento-${item.cidCode}`,
        cidCode: item.cidCode,
        description: item.description,
        isPrimary: index === 0,
      }));
  const editable = canEdit && available;

  async function makePrimary(diagnosis: PatientDiagnosisView) {
    const result = await setPrimaryPatientDiagnosis(patientId, diagnosis.id);
    if (result.error) toast.error(result.error);
    else {
      toast.success(result.success);
      router.refresh();
    }
  }

  return (
    <OverviewCard
      icon={Stethoscope}
      title="Diagnósticos (CID)"
      action={
        editable ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setAdding(true)}
          >
            <Plus className="size-4" weight="bold" aria-hidden="true" />
            Adicionar
          </Button>
        ) : null
      }
    >
      {rows.length ? (
        <ul className="grid gap-2">
          {rows.map((diagnosis) => (
            <li
              key={diagnosis.id}
              className="flex min-w-0 items-center gap-3 rounded-md border border-border px-2.5 py-2"
            >
              <span className="inline-flex h-8 min-w-14 shrink-0 items-center justify-center rounded-md bg-primary-muted px-2 text-sm font-semibold tabular-nums text-primary">
                {diagnosis.cidCode}
              </span>
              <span
                className="min-w-0 flex-1 truncate text-sm font-medium"
                title={diagnosis.description ?? undefined}
              >
                {diagnosis.description || "Sem descrição"}
              </span>
              {diagnosis.isPrimary ? (
                <Badge variant="primary" className="shrink-0">
                  Principal
                </Badge>
              ) : null}
              {editable ? (
                <DropdownMenu
                  trigger={
                    <DotsThreeVertical
                      className="size-4"
                      weight="bold"
                      aria-hidden="true"
                    />
                  }
                  triggerLabel={`Opções de ${diagnosis.cidCode}`}
                  triggerClassName="border-transparent shadow-none"
                >
                  {(close) => (
                    <>
                      {!diagnosis.isPrimary ? (
                        <DropdownMenuItem
                          icon={Star}
                          onSelect={() => {
                            close();
                            void makePrimary(diagnosis);
                          }}
                        >
                          Definir como principal
                        </DropdownMenuItem>
                      ) : null}
                      <DropdownMenuItem
                        icon={Trash}
                        variant="destructive"
                        onSelect={() => {
                          close();
                          setRemoving(diagnosis);
                        }}
                      >
                        Remover da lista
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenu>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-md border border-dashed border-border px-4 py-5 text-center text-sm text-muted-foreground">
          Nenhum diagnóstico registrado.
        </p>
      )}
      {!available && rows.length ? (
        <p className="mt-2 text-caption text-muted-foreground">
          CIDs registrados nos atendimentos.
        </p>
      ) : null}

      {adding ? (
        <AddDiagnosisDialog
          patientId={patientId}
          suggestions={suggestions.filter(
            (item) => !diagnoses.some((row) => row.cidCode === item.cidCode),
          )}
          firstDiagnosis={!diagnoses.length}
          onClose={() => setAdding(false)}
          onAdded={() => router.refresh()}
        />
      ) : null}

      <ConfirmDialog
        open={Boolean(removing)}
        onClose={() => setRemoving(null)}
        title="Remover diagnóstico da lista?"
        description={
          removing
            ? `${removing.cidCode}${removing.description ? ` · ${removing.description}` : ""} sai da ficha. Os atendimentos em que ele foi registrado não mudam.`
            : undefined
        }
        confirmLabel="Remover"
        destructive
        onConfirm={async () => {
          if (!removing) return;
          const result = await removePatientDiagnosis(patientId, removing.id);
          if (result.error) {
            toast.error(result.error);
            return false;
          }
          toast.success(result.success);
          router.refresh();
        }}
      />
    </OverviewCard>
  );
}

function AddDiagnosisDialog({
  firstDiagnosis,
  onAdded,
  onClose,
  patientId,
  suggestions,
}: {
  firstDiagnosis: boolean;
  onAdded: () => void;
  onClose: () => void;
  patientId: string;
  suggestions: DiagnosisSuggestion[];
}) {
  const [code, setCode] = useState("");
  const [description, setDescription] = useState("");
  // O primeiro diagnóstico da lista já nasce como principal.
  const [isPrimary, setIsPrimary] = useState(firstDiagnosis);
  const [error, setError] = useState<string>();

  return (
    <ConfirmDialog
      open
      onClose={onClose}
      title="Adicionar diagnóstico"
      description="Busque pelo código ou por palavras da descrição na tabela CID-10."
      confirmLabel="Adicionar"
      pendingLabel="Adicionando..."
      confirmDisabled={!code.trim()}
      error={error}
      onConfirm={async () => {
        setError(undefined);
        const result = await addPatientDiagnosis(patientId, {
          cidCode: code,
          description: description.trim() || undefined,
          isPrimary,
        });
        if (result.error) {
          setError(result.error);
          return false;
        }
        toast.success(result.success);
        onAdded();
      }}
    >
      <label className="grid gap-2 text-sm font-medium">
        CID
        <CidCombobox
          name="cid_code"
          ariaLabel="CID do diagnóstico"
          code={code}
          onSelect={(value) => {
            setCode(value.code);
            if (value.description) setDescription(value.description);
          }}
        />
      </label>
      <label className="grid gap-2 text-sm font-medium">
        Descrição
        <Input
          value={description}
          maxLength={300}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="Preenchida ao escolher o CID"
        />
      </label>
      <Checkbox
        checked={isPrimary}
        onChange={(event) => setIsPrimary(event.target.checked)}
        label="Diagnóstico principal"
      />
      {suggestions.length ? (
        <div className="grid gap-2 border-t border-border pt-3">
          <p className="text-caption font-semibold uppercase tracking-wide text-muted-foreground">
            Registrados nos atendimentos
          </p>
          <div className="flex flex-wrap gap-2">
            {suggestions.slice(0, 8).map((item) => (
              <button
                key={item.cidCode}
                type="button"
                onClick={() => {
                  setCode(item.cidCode);
                  setDescription(item.description ?? "");
                }}
                className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-border px-2 py-1 text-left text-caption transition-colors duration-[var(--motion-fast)] hover:border-primary hover:bg-primary-muted"
              >
                <span className="font-semibold text-primary">
                  {item.cidCode}
                </span>
                <span className="truncate text-secondary-foreground">
                  {item.description}
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </ConfirmDialog>
  );
}
