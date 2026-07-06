"use client";

import { createPortal } from "react-dom";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, User, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/field";
import type { QuickPatientActionState } from "@/lib/patients/quick-create";

export type PatientSearchOption = {
  id: string;
  full_name: string;
  social_name: string | null;
  cpf?: string | null;
  email?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
};

type QuickCreateAction = (
  state: QuickPatientActionState,
  formData: FormData,
) => Promise<QuickPatientActionState>;

export function PatientSearchField({
  patients,
  canCreatePatient,
  createPatientAction,
  className,
}: {
  patients: PatientSearchOption[];
  canCreatePatient: boolean;
  createPatientAction: QuickCreateAction;
  className?: string;
}) {
  const [query, setQuery] = useState("");
  const [selectedPatientId, setSelectedPatientId] = useState("");
  const [focused, setFocused] = useState(false);
  const [quickCreateOpen, setQuickCreateOpen] = useState(false);
  const router = useRouter();
  const normalizedQuery = query.trim().toLowerCase();
  const queryDigits = normalizedQuery.replace(/\D/g, "");
  const selectedPatient = patients.find(
    (item) => item.id === selectedPatientId,
  );
  const options = useMemo(() => {
    if (normalizedQuery.length < 3) return [];

    return patients
      .filter((patient) => {
        const textMatch = [
          patient.full_name,
          patient.social_name ?? "",
          patient.email ?? "",
          patient.id,
        ]
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery);
        const digitMatch = queryDigits
          ? [
              patient.cpf ?? "",
              patient.phone ?? "",
              patient.whatsapp ?? "",
              patient.id,
            ]
              .join(" ")
              .replace(/\D/g, "")
              .includes(queryDigits)
          : false;

        return textMatch || digitMatch;
      })
      .slice(0, 8);
  }, [normalizedQuery, patients, queryDigits]);
  const showQuickCreate =
    canCreatePatient &&
    normalizedQuery.length >= 3 &&
    !selectedPatientId &&
    !options.length;

  return (
    <label
      className={`relative grid gap-2 text-sm font-medium ${className ?? ""}`}
    >
      Paciente
      <input type="hidden" name="patient_id" value={selectedPatientId} />
      <div className="relative">
        <User
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setSelectedPatientId("");
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder="Digite 3 letras para buscar..."
          className="w-full pl-9"
          autoComplete="off"
        />
      </div>
      {focused && normalizedQuery.length >= 3 && options.length ? (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-56 overflow-y-auto rounded-md border border-border bg-card py-1 shadow-[var(--shadow-lg)]">
          {options.map((patient) => {
            const name = patient.social_name || patient.full_name;
            return (
              <button
                key={patient.id}
                type="button"
                className="grid w-full gap-0.5 px-3 py-2 text-left text-sm hover:bg-muted"
                onMouseDown={(event) => {
                  event.preventDefault();
                  setSelectedPatientId(patient.id);
                  setQuery(name);
                  setFocused(false);
                }}
              >
                <span className="font-medium">{name}</span>
                <span className="truncate text-xs text-muted-foreground">
                  {[patient.phone, patient.email].filter(Boolean).join(" · ") ||
                    patient.id}
                </span>
              </button>
            );
          })}
        </div>
      ) : null}
      {showQuickCreate ? (
        <div className="flex flex-col gap-2 rounded-md border border-dashed border-border bg-muted/20 p-3">
          <p className="text-sm text-muted-foreground">
            Nenhum paciente encontrado para &quot;{query.trim()}&quot;.
          </p>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="w-fit"
            onClick={() => {
              setQuickCreateOpen(true);
              setFocused(false);
            }}
          >
            <Plus className="size-4" />
            Cadastrar paciente
          </Button>
        </div>
      ) : null}
      {selectedPatient ? (
        <span className="text-xs text-muted-foreground">
          Selecionado:{" "}
          {selectedPatient.social_name || selectedPatient.full_name}
        </span>
      ) : null}
      <QuickPatientCreateModal
        open={quickCreateOpen}
        initialName={query}
        createPatientAction={createPatientAction}
        onClose={() => setQuickCreateOpen(false)}
        onCreated={(patient) => {
          setSelectedPatientId(patient.id);
          setQuery(patient.social_name || patient.full_name);
          setQuickCreateOpen(false);
          router.refresh();
        }}
      />
    </label>
  );
}

function QuickPatientCreateModal({
  open,
  initialName,
  createPatientAction,
  onClose,
  onCreated,
}: {
  open: boolean;
  initialName: string;
  createPatientAction: QuickCreateAction;
  onClose: () => void;
  onCreated: (patient: NonNullable<QuickPatientActionState["patient"]>) => void;
}) {
  const handledPatientIdRef = useRef<string | null>(null);
  const [state, action, pending] = useActionState(createPatientAction, {});
  const portalTarget = typeof document === "undefined" ? null : document.body;

  useEffect(() => {
    if (
      state.success &&
      state.patient &&
      state.patient.id !== handledPatientIdRef.current
    ) {
      toast.success(state.success);
      handledPatientIdRef.current = state.patient.id;
      onCreated(state.patient);
    }
  }, [onCreated, state]);

  if (!open || !portalTarget) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[80] grid place-items-center bg-foreground/20 p-4"
      data-select-portal-root
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <Card className="w-full max-w-md shadow-[var(--shadow-lg)]">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <h2 className="font-semibold">Cadastrar paciente</h2>
            <p className="text-sm text-muted-foreground">
              Cadastro rápido para continuar o fluxo.
            </p>
          </div>
          <Button type="button" variant="ghost" size="icon" onClick={onClose}>
            <X className="size-4" />
          </Button>
        </CardHeader>
        <CardContent>
          <form action={action} className="grid gap-4">
            <label className="grid gap-2 text-sm font-medium">
              Nome
              <Input
                name="full_name"
                defaultValue={initialName.trim()}
                required
                autoFocus
              />
            </label>
            <label className="grid gap-2 text-sm font-medium">
              Telefone
              <Input
                name="phone"
                inputMode="tel"
                placeholder="(11) 90000-0000"
              />
            </label>
            <label className="grid gap-2 text-sm font-medium">
              E-mail
              <Input name="email" type="email" placeholder="nome@email.com" />
            </label>
            {state.error ? (
              <p className="text-sm text-destructive">{state.error}</p>
            ) : null}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={onClose}>
                Cancelar
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? "Salvando..." : "Cadastrar e selecionar"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>,
    portalTarget,
  );
}
