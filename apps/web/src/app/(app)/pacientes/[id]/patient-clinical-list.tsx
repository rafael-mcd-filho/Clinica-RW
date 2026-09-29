"use client";

import { useState } from "react";
import {
  CaretRight,
  FileText,
  Heart,
  Leaf,
  Pill,
  UsersThree,
  Warning,
} from "@phosphor-icons/react";
import {
  ClinicalQuickEditDialog,
  type ClinicalSummary,
  type ClinicalSummaryField,
} from "./patient-detail-panels";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/utils";

type Tone = "danger" | "warning" | "primary" | "neutral" | "success";

const rows: Array<{
  field: ClinicalSummaryField;
  label: string;
  icon: React.ComponentType<{
    className?: string;
    weight?: "fill" | "regular" | "bold";
  }>;
  iconTone: string;
  chipTone: Tone;
}> = [
  {
    field: "allergies",
    label: "Alergias",
    icon: Warning,
    iconTone: "bg-destructive-muted text-destructive",
    chipTone: "danger",
  },
  {
    field: "comorbidities",
    label: "Comorbidades",
    icon: Heart,
    iconTone: "bg-destructive-muted text-destructive",
    chipTone: "warning",
  },
  {
    field: "medications",
    label: "Medicações contínuas",
    icon: Pill,
    iconTone: "bg-primary-muted text-primary",
    chipTone: "primary",
  },
  {
    field: "medical_history",
    label: "Antecedentes pessoais",
    icon: FileText,
    iconTone: "bg-primary-muted text-primary",
    chipTone: "neutral",
  },
  {
    field: "family_history",
    label: "História familiar",
    icon: UsersThree,
    iconTone: "bg-primary-muted text-primary",
    chipTone: "neutral",
  },
  {
    field: "habits",
    label: "Hábitos",
    icon: Leaf,
    iconTone: "bg-success-muted text-success-foreground",
    chipTone: "success",
  },
];

const chipTones: Record<Tone, string> = {
  danger: "bg-destructive-muted text-destructive-foreground",
  warning: "bg-warning-muted text-warning-foreground",
  primary: "bg-primary-muted text-primary-hover",
  neutral: "bg-muted text-secondary-foreground",
  success: "bg-success-muted text-success-foreground",
};

/** Um item por linha (ou separado por ";"), como o resumo é salvo. */
function splitSummary(value?: string | null) {
  return (value ?? "")
    .split(/\r?\n|;/)
    .map((item) => item.replace(/^[\s•·–—*-]+/, "").trim())
    .filter(Boolean);
}

/** "Losartana 50 mg - 1x ao dia" vira nome e posologia. */
function splitMedication(item: string) {
  const match = item.match(/^(.+?)(?:\s[-–—]\s|:\s|,\s)(.+)$/);
  return match
    ? { name: match[1].trim(), detail: match[2].trim() }
    : { name: item, detail: null };
}

/**
 * Resumo clínico permanente na coluna da ficha: cada linha mostra o que está
 * registrado em etiquetas e abre para editar (ou só ler, sem permissão).
 */
export function PatientClinicalList({
  canEdit,
  patientId,
  summary,
}: {
  canEdit: boolean;
  patientId: string;
  summary: ClinicalSummary | null;
}) {
  const [openField, setOpenField] = useState<ClinicalSummaryField | null>(null);
  const openRow = rows.find((row) => row.field === openField) ?? null;

  return (
    <>
      <ul className="divide-y divide-border">
        {rows.map((row) => {
          const items = splitSummary(summary?.[row.field]);
          const Icon = row.icon;
          const visible = items.slice(0, 2);
          const hidden = items.length - visible.length;
          return (
            <li key={row.field}>
              <button
                type="button"
                onClick={() => setOpenField(row.field)}
                aria-label={`${row.label}: ${
                  items.length ? items.join(", ") : "não informado"
                }. ${canEdit ? "Editar" : "Ver detalhes"}`}
                className="group flex w-full items-center gap-3 px-4 py-3 text-left transition-colors duration-[var(--motion-fast)] ease-[var(--ease-out)] hover:bg-muted/60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
              >
                <span
                  className={cn(
                    "flex size-10 shrink-0 items-center justify-center rounded-full",
                    row.iconTone,
                  )}
                  aria-hidden="true"
                >
                  <Icon className="size-5" weight="fill" />
                </span>
                <span className="grid min-w-0 flex-1 gap-1">
                  <span className="text-sm font-semibold text-foreground">
                    {row.label}
                  </span>
                  {items.length ? (
                    <span className="flex min-w-0 flex-wrap items-center gap-1">
                      {visible.map((item, index) => {
                        const medication =
                          row.field === "medications"
                            ? splitMedication(item)
                            : null;
                        return (
                          <span
                            key={`${index}-${item}`}
                            className="grid min-w-0 gap-0.5"
                          >
                            <Chip tone={row.chipTone}>
                              {row.field === "medications" ? (
                                <Pill
                                  className="size-3 shrink-0"
                                  weight="fill"
                                  aria-hidden="true"
                                />
                              ) : null}
                              <span className="truncate">
                                {medication?.name ?? item}
                              </span>
                            </Chip>
                            {medication?.detail ? (
                              <span className="truncate pl-1 text-caption text-muted-foreground">
                                {medication.detail}
                              </span>
                            ) : null}
                          </span>
                        );
                      })}
                      {hidden > 0 ? (
                        <Chip tone="neutral">+{hidden}</Chip>
                      ) : null}
                    </span>
                  ) : (
                    <span className="flex">
                      <Chip tone="neutral">Não informado</Chip>
                    </span>
                  )}
                </span>
                <CaretRight
                  className="size-4 shrink-0 text-muted-foreground transition-transform duration-[var(--motion-fast)] ease-[var(--ease-out)] group-hover:translate-x-0.5"
                  aria-hidden="true"
                />
              </button>
            </li>
          );
        })}
      </ul>

      {openRow && canEdit ? (
        <ClinicalQuickEditDialog
          field={openRow.field}
          label={openRow.label}
          patientId={patientId}
          value={summary?.[openRow.field]}
          onClose={() => setOpenField(null)}
        />
      ) : null}
      {openRow && !canEdit ? (
        <Modal
          open
          onClose={() => setOpenField(null)}
          title={openRow.label}
          footer={
            <div className="flex w-full justify-end">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setOpenField(null)}
              >
                Fechar
              </Button>
            </div>
          }
        >
          {splitSummary(summary?.[openRow.field]).length ? (
            <ul className="grid list-disc gap-1 pl-5 text-sm">
              {splitSummary(summary?.[openRow.field]).map((item, index) => (
                <li key={`${index}-${item}`}>{item}</li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Nada registrado.</p>
          )}
        </Modal>
      ) : null}
    </>
  );
}

function Chip({ children, tone }: { children: React.ReactNode; tone: Tone }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 max-w-full items-center gap-1 rounded-md px-1.5 text-caption font-medium",
        chipTones[tone],
      )}
    >
      {children}
    </span>
  );
}
