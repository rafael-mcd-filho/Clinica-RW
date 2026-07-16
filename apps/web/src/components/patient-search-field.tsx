"use client";

import {
  useActionState,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { Plus, User } from "@phosphor-icons/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
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
  remoteSearch = false,
}: {
  patients: PatientSearchOption[];
  canCreatePatient: boolean;
  createPatientAction: QuickCreateAction;
  className?: string;
  remoteSearch?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [selectedPatientId, setSelectedPatientId] = useState("");
  const [focused, setFocused] = useState(false);
  const [quickCreateOpen, setQuickCreateOpen] = useState(false);
  const [remoteOptions, setRemoteOptions] = useState<PatientSearchOption[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [activeOptionIndex, setActiveOptionIndex] = useState(-1);
  const latestQueryRef = useRef("");
  const fieldId = useId();
  const listboxId = `${fieldId}-listbox`;
  const normalizedQuery = query.trim().toLowerCase();
  const queryDigits = normalizedQuery.replace(/\D/g, "");
  const availablePatients = remoteSearch ? remoteOptions : patients;
  const selectedPatient = availablePatients.find(
    (item) => item.id === selectedPatientId,
  );

  useEffect(() => {
    if (!remoteSearch || normalizedQuery.length < 3 || selectedPatientId) {
      return;
    }

    const controller = new AbortController();
    const requestedQuery = query.trim();
    const timeout = window.setTimeout(async () => {
      setSearching(true);
      setSearchError(null);
      try {
        const response = await fetch(
          `/api/patients/search?q=${encodeURIComponent(requestedQuery)}`,
          { cache: "no-store", signal: controller.signal },
        );
        if (!response.ok) throw new Error("search_failed");
        const payload = (await response.json()) as {
          patients?: PatientSearchOption[];
        };
        if (latestQueryRef.current.trim() !== requestedQuery) return;
        setRemoteOptions(payload.patients ?? []);
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          setRemoteOptions([]);
          setSearchError("Não foi possível buscar pacientes agora.");
        }
      } finally {
        if (
          !controller.signal.aborted &&
          latestQueryRef.current.trim() === requestedQuery
        ) {
          setSearching(false);
        }
      }
    }, 250);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [normalizedQuery, query, remoteSearch, selectedPatientId]);

  const options = useMemo(() => {
    if (normalizedQuery.length < 3) return [];
    if (remoteSearch) return remoteOptions;

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
  }, [normalizedQuery, patients, queryDigits, remoteOptions, remoteSearch]);
  const showQuickCreate =
    canCreatePatient &&
    normalizedQuery.length >= 3 &&
    !selectedPatientId &&
    !searching &&
    !searchError &&
    !options.length;
  const listboxOpen =
    focused && normalizedQuery.length >= 3 && options.length > 0;

  function selectPatient(patient: PatientSearchOption) {
    setSelectedPatientId(patient.id);
    const patientName = patient.social_name || patient.full_name;
    latestQueryRef.current = patientName;
    setQuery(patientName);
    setFocused(false);
    setSearching(false);
    setActiveOptionIndex(-1);
  }

  return (
    <div
      className={`relative grid gap-2 text-sm font-medium ${className ?? ""}`}
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setFocused(false);
          setActiveOptionIndex(-1);
        }
      }}
    >
      <label htmlFor={fieldId}>Paciente</label>
      <input
        type="hidden"
        name="patient_id"
        value={selectedPatientId}
        readOnly
      />
      <div className="relative">
        <User
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          id={fieldId}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={listboxOpen}
          aria-controls={listboxId}
          aria-activedescendant={
            listboxOpen && activeOptionIndex >= 0
              ? `${listboxId}-option-${activeOptionIndex}`
              : undefined
          }
          value={query}
          onChange={(event) => {
            const nextQuery = event.target.value;
            const nextNormalizedQuery = nextQuery.trim();
            latestQueryRef.current = nextQuery;
            setQuery(nextQuery);
            setSelectedPatientId("");
            setActiveOptionIndex(-1);
            if (remoteSearch) {
              setRemoteOptions([]);
              setSearchError(null);
              setSearching(nextNormalizedQuery.length >= 3);
            }
            if (nextNormalizedQuery.length < 3) {
              setSearching(false);
            }
          }}
          onFocus={() => setFocused(true)}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" && options.length) {
              event.preventDefault();
              setActiveOptionIndex((current) =>
                current < options.length - 1 ? current + 1 : 0,
              );
            } else if (event.key === "ArrowUp" && options.length) {
              event.preventDefault();
              setActiveOptionIndex((current) =>
                current > 0 ? current - 1 : options.length - 1,
              );
            } else if (
              event.key === "Enter" &&
              activeOptionIndex >= 0 &&
              options[activeOptionIndex]
            ) {
              event.preventDefault();
              selectPatient(options[activeOptionIndex]);
            } else if (event.key === "Escape") {
              setFocused(false);
              setActiveOptionIndex(-1);
            }
          }}
          placeholder="Digite 3 letras para buscar..."
          className="w-full pl-9"
          autoComplete="off"
        />
      </div>
      {searching ? (
        <span className="text-xs text-muted-foreground" aria-live="polite">
          Buscando pacientes...
        </span>
      ) : null}
      {searchError ? (
        <span className="text-xs text-destructive" role="alert">
          {searchError}
        </span>
      ) : null}
      {listboxOpen ? (
        <div
          id={listboxId}
          role="listbox"
          aria-label="Pacientes encontrados"
          className="absolute left-0 right-0 top-full z-50 mt-1 max-h-56 overflow-y-auto rounded-md border border-border bg-card py-1 shadow-[var(--shadow-lg)]"
        >
          {options.map((patient, index) => {
            const name = patient.social_name || patient.full_name;
            return (
              <button
                key={patient.id}
                id={`${listboxId}-option-${index}`}
                type="button"
                role="option"
                aria-selected={index === activeOptionIndex}
                className="grid w-full gap-0.5 px-3 py-2 text-left text-sm hover:bg-muted aria-selected:bg-muted"
                onMouseEnter={() => setActiveOptionIndex(index)}
                onMouseDown={(event) => {
                  event.preventDefault();
                  selectPatient(patient);
                }}
                onClick={() => selectPatient(patient)}
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
          setRemoteOptions((current) => [
            patient,
            ...current.filter((item) => item.id !== patient.id),
          ]);
          setSelectedPatientId(patient.id);
          const patientName = patient.social_name || patient.full_name;
          latestQueryRef.current = patientName;
          setQuery(patientName);
          setQuickCreateOpen(false);
          setActiveOptionIndex(-1);
        }}
      />
    </div>
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

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Cadastrar paciente"
      description="Cadastro rápido para continuar o agendamento."
      className="max-w-md"
    >
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
          <Input name="phone" inputMode="tel" placeholder="(11) 90000-0000" />
        </label>
        <label className="grid gap-2 text-sm font-medium">
          E-mail
          <Input name="email" type="email" placeholder="nome@email.com" />
        </label>
        {state.error ? (
          <p className="text-sm text-destructive" role="alert">
            {state.error}
          </p>
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
    </Modal>
  );
}
