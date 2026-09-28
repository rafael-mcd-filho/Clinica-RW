"use client";

import {
  useActionState,
  useCallback,
  createContext,
  useEffect,
  useContext,
  useId,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { DayPicker, type DayButtonProps } from "react-day-picker";
import { fromZonedTime } from "date-fns-tz";
import { ptBR } from "date-fns/locale";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Prohibit as Ban,
  CalendarDots as CalendarClock,
  CaretLeft as ChevronLeft,
  CaretRight as ChevronRight,
  Check,
  ArrowRight,
  Funnel,
  Clock as Clock3,
  FileText,
  Buildings,
  Copy,
  CreditCard,
  CurrencyDollar,
  Door,
  IdentificationCard,
  Info,
  Lightning,
  PencilSimple,
  Printer,
  ShieldCheck,
  WhatsappLogo,
  ListPlus,
  EnvelopeSimple as Mail,
  Phone,
  Plus,
  ArrowsClockwise as RefreshCw,
  SlidersHorizontal,
  Stethoscope,
  UserCheck,
  UserCircle as UserRound,
  X,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import {
  changeAppointmentStatus,
  createScheduleBlock,
  loadWaitlistCandidatesForAppointment,
  rescheduleAppointment,
  startAppointmentEncounter,
  type AgendaActionState,
  type WaitlistCandidate,
  updateAppointmentPaymentMethod,
  updateAppointmentPrice,
} from "./actions";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import detailsStyles from "./appointment-details.module.css";
import {
  appointmentStatusLabels as statusLabel,
  appointmentStatusDescriptions,
  availableAppointmentStatuses,
} from "@/lib/agenda/status";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { AddToWaitlistModal } from "@/components/agenda/add-to-waitlist-modal";
import { AgendaCalendarCaption } from "@/components/agenda/calendar-caption";
import { AppointmentFormModal } from "@/components/agenda/appointment-form-modal";
import { WaitlistSuggestionModal } from "@/components/agenda/waitlist-suggestion-modal";
import { Input, MultiSelect, Select } from "@/components/ui/field";
import { AgendaPatientSearch } from "./agenda-patient-search";
import { Modal } from "@/components/ui/modal";
import { DatePickerInput } from "@/components/ui/date-picker-input";
import { ConfirmDialog } from "@/components/ui/dialog";
import {
  addAgendaPeriod,
  buildAgendaEncounterHref,
  buildAgendaReturnTo,
  defaultAgendaTimeZone,
  type AgendaView,
} from "@/lib/agenda/range";
import { defaultScheduleColor } from "@/lib/colors";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { cn } from "@/lib/utils";
import { formatCPF, formatPhoneBR } from "@/lib/validation/br";
import { useCoalescedRouterRefresh } from "@/hooks/use-coalesced-router-refresh";

type Option = { id: string; name: string };
export type AgendaData = {
  organizationId: string;
  timeZone: string;
  selectedDate: string;
  visibleFrom: string;
  visibleTo: string;
  schedules: Array<{
    id: string;
    professional_id: string;
    unit_id: string;
    name: string;
    color: string;
    active: boolean;
  }>;
  professionals: Array<{
    id: string;
    name: string;
    specialty_id: string | null;
  }>;
  specialties: Option[];
  units: Option[];
  rooms: Array<{ id: string; unit_id: string; name: string }>;
  patients: Array<{
    id: string;
    full_name: string;
    social_name: string | null;
    cpf?: string | null;
    email?: string | null;
    phone?: string | null;
    whatsapp?: string | null;
  }>;
  procedures: Array<{
    id: string;
    name: string;
    duration_minutes: number;
    base_price?: number | null;
  }>;
  insurances: Option[];
  /** Preço por convênio: `${convênio}:${procedimento}`. */
  insurancePrices?: Record<string, number>;
  paymentMethods: Option[];
  appointments: Array<{
    id: string;
    patient_id: string;
    professional_id: string;
    procedure_id: string;
    schedule_id: string;
    unit_id: string;
    room_id: string | null;
    health_insurance_id: string | null;
    payment_method_id: string | null;
    status: string;
    start_at: string;
    end_at: string;
    notes: string | null;
    is_extra: boolean;
    price?: number | string | null;
    list_price?: number | string | null;
    price_note?: string | null;
  }>;
  // Total de agendamentos por dia local na grade do mini calendário, sem os
  // cancelados e independente dos filtros aplicados na tela.
  dayCounts: Record<string, number>;
  encounters: Array<{
    id: string;
    appointment_id: string | null;
    status: string;
    started_at: string;
  }>;
  clinicalTemplates: Array<{
    id: string;
    name: string;
    description: string | null;
    is_default: boolean;
    version_id: string;
    version_number: number;
  }>;
  availability: Array<{
    id: string;
    schedule_id: string;
    weekday: number;
    start_time: string;
    end_time: string;
    slot_minutes: number;
  }>;
  blocks: Array<{
    id: string;
    schedule_id: string;
    start_at: string;
    end_at: string;
    reason: string | null;
  }>;
  waitlist: Array<{
    id: string;
    patient_id: string;
    procedure_id: string | null;
    professional_id: string | null;
    preferred_period: string | null;
    notes: string | null;
    status: string;
    created_at: string;
  }>;
  onlineSettings: {
    id: string;
    public_slug: string;
    enabled: boolean;
    min_notice_hours: number;
    max_days_ahead: number;
    cancellation_notice_hours: number;
    max_requests_per_contact_day: number;
    max_no_shows_180_days: number;
    require_contact_verification: boolean;
    contact_verification_ttl_minutes: number;
    public_instructions: string | null;
    cancellation_policy: string | null;
  } | null;
  onlineRequests: Array<{
    id: string;
    schedule_id: string;
    procedure_id: string;
    professional_id: string;
    unit_id: string;
    health_insurance_id: string | null;
    requested_start_at: string;
    requested_end_at: string;
    patient_name: string;
    patient_email: string | null;
    patient_phone: string | null;
    patient_notes: string | null;
    status: string;
    created_at: string;
    procedures: { name: string } | null;
    professionals: { name: string } | null;
    units: { name: string } | null;
    health_insurances: { name: string } | null;
  }>;
};

const initialState: AgendaActionState = {};
const AgendaTimeZoneContext = createContext(defaultAgendaTimeZone);

function useAgendaTimeZone() {
  return useContext(AgendaTimeZoneContext);
}
const weekTimelineStepMinutes = 30;
const weekTimelineRowHeight = 76;
export function AgendaBoard({
  data,
  initialDate,
  initialView,
  canCreate,
  canBlock,
  canCreatePatient,
  canEdit,
  canExtra,
  canViewPatient,
  canViewClinical,
  canStartEncounter,
}: {
  data: AgendaData;
  initialDate: string;
  initialView: AgendaView;
  canCreate: boolean;
  canBlock: boolean;
  canCreatePatient: boolean;
  canEdit: boolean;
  canExtra: boolean;
  canViewPatient: boolean;
  canViewClinical: boolean;
  canStartEncounter: boolean;
}) {
  const refreshFromRealtime = useCoalescedRouterRefresh();

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    const channel = supabase
      .channel(`agenda:${data.organizationId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "appointments",
          filter: `organization_id=eq.${data.organizationId}`,
        },
        refreshFromRealtime,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "schedule_blocks",
          filter: `organization_id=eq.${data.organizationId}`,
        },
        refreshFromRealtime,
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [data.organizationId, refreshFromRealtime]);

  return (
    <AgendaTimeZoneContext.Provider value={data.timeZone}>
      <div className="grid gap-5">
        <AgendaCalendarView
          data={data}
          date={initialDate}
          view={initialView}
          canCreate={canCreate}
          canExtra={canExtra}
          canCreatePatient={canCreatePatient}
          canEdit={canEdit}
          canViewPatient={canViewPatient}
          canViewClinical={canViewClinical}
          canStartEncounter={canStartEncounter}
        />

        {canCreate || canBlock ? (
          <AgendaFloatingActions
            data={data}
            canCreate={canCreate}
            canBlock={canBlock}
            canExtra={canExtra}
            canCreatePatient={canCreatePatient}
          />
        ) : null}
      </div>
    </AgendaTimeZoneContext.Provider>
  );
}

function AgendaFloatingActions({
  data,
  canCreate,
  canBlock,
  canExtra,
  canCreatePatient,
}: {
  data: AgendaData;
  canCreate: boolean;
  canBlock: boolean;
  canExtra: boolean;
  canCreatePatient: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const menuId = useId();
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!expanded) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setExpanded(false);
    }
    function closeOnOutsideClick(event: PointerEvent) {
      if (
        event.target instanceof Node &&
        !containerRef.current?.contains(event.target)
      ) {
        setExpanded(false);
      }
    }
    document.addEventListener("keydown", closeOnEscape);
    document.addEventListener("pointerdown", closeOnOutsideClick);
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      document.removeEventListener("pointerdown", closeOnOutsideClick);
    };
  }, [expanded]);

  return (
    <div
      ref={containerRef}
      // Acompanha a gaveta "Atendimentos do dia" deslocando (translate), não
      // animando `right`, que recalculava o layout a cada quadro.
      className="fixed bottom-6 right-6 z-50 flex translate-x-[calc(var(--today-rail-offset,0rem)*-1)] flex-col items-end gap-3 transition-[translate] duration-[var(--motion-drawer)] ease-[var(--ease-out)] motion-reduce:transition-none"
    >
      <div
        id={menuId}
        aria-hidden={!expanded}
        // translate/scale são propriedades próprias no Tailwind 4: com
        // `transform` na lista, elas pulavam direto e só a opacidade animava.
        className={cn(
          "flex origin-bottom flex-col items-end gap-2 transition-[opacity,translate,scale] duration-[var(--motion-normal)] ease-[var(--ease-out)] motion-reduce:transition-opacity",
          expanded
            ? "pointer-events-auto translate-y-0 scale-100 opacity-100"
            : "pointer-events-none translate-y-3 scale-95 opacity-0",
        )}
      >
        {canBlock ? (
          <ScheduleBlockForm
            data={data}
            floatingTrigger
            triggerTabIndex={expanded ? 0 : -1}
            onTrigger={() => setExpanded(false)}
          />
        ) : null}
        {/* Anotar na fila é o que sobra quando não há vaga — e é aqui, com a
            grade na frente, que se descobre isso. Antes só dava para fazer
            saindo da agenda e indo ao painel. */}
        {canCreate ? (
          <WaitlistEntryTrigger
            canCreatePatient={canCreatePatient}
            triggerTabIndex={expanded ? 0 : -1}
            onTrigger={() => setExpanded(false)}
          />
        ) : null}
        {canCreate ? (
          <AppointmentForm
            data={data}
            canExtra={canExtra}
            canCreatePatient={canCreatePatient}
            floatingTrigger
            triggerTabIndex={expanded ? 0 : -1}
            onTrigger={() => setExpanded(false)}
          />
        ) : null}
      </div>

      <Button
        type="button"
        size="icon"
        aria-controls={menuId}
        aria-expanded={expanded}
        aria-label={
          expanded ? "Fechar ações da agenda" : "Abrir ações da agenda"
        }
        onClick={() => setExpanded((value) => !value)}
        className="size-14 rounded-full shadow-[var(--shadow-hover)]"
      >
        <Plus
          className={cn(
            "size-6 transition-transform duration-[var(--motion-normal)] ease-[var(--ease-out)]",
            expanded ? "rotate-45" : "rotate-0",
          )}
          aria-hidden="true"
        />
      </Button>
    </div>
  );
}

function AgendaCalendarView({
  data,
  date,
  view,
  canCreate,
  canExtra,
  canCreatePatient,
  canEdit,
  canViewPatient,
  canViewClinical,
  canStartEncounter,
}: {
  data: AgendaData;
  date: string;
  view: AgendaView;
  canCreate: boolean;
  canExtra: boolean;
  canCreatePatient: boolean;
  canEdit: boolean;
  canViewPatient: boolean;
  canViewClinical: boolean;
  canStartEncounter: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [navigationPending, startNavigation] = useTransition();
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: data.timeZone,
  }).format(new Date());
  const [professionalIds, setProfessionalIds] = useState<string[]>([]);
  const [statusValues, setStatusValues] = useState<string[]>([]);
  const [unitIds, setUnitIds] = useState<string[]>([]);
  const [specialtyIds, setSpecialtyIds] = useState<string[]>([]);
  const [procedureIds, setProcedureIds] = useState<string[]>([]);
  const [insuranceIds, setInsuranceIds] = useState<string[]>([]);
  const [patientQuery, setPatientQuery] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [moreFiltersOpen, setMoreFiltersOpen] = useState(false);
  const [newAppointmentSlot, setNewAppointmentSlot] = useState<{
    date: string;
    time: string;
  } | null>(null);
  const moreFiltersId = useId();
  const [selectedAppointmentId, setSelectedAppointmentId] = useState<
    string | null
  >(null);

  const patient = useMemo(
    () => new Map(data.patients.map((item) => [item.id, item])),
    [data.patients],
  );
  const professional = useMemo(
    () => new Map(data.professionals.map((item) => [item.id, item])),
    [data.professionals],
  );
  const procedure = useMemo(
    () => new Map(data.procedures.map((item) => [item.id, item])),
    [data.procedures],
  );
  const schedule = useMemo(
    () => new Map(data.schedules.map((item) => [item.id, item])),
    [data.schedules],
  );
  const unit = useMemo(
    () => new Map(data.units.map((item) => [item.id, item])),
    [data.units],
  );
  const room = useMemo(
    () => new Map(data.rooms.map((item) => [item.id, item])),
    [data.rooms],
  );
  const insurance = useMemo(
    () => new Map(data.insurances.map((item) => [item.id, item])),
    [data.insurances],
  );
  const encounterByAppointment = useMemo(
    () =>
      new Map(
        data.encounters
          .filter((item) => item.appointment_id)
          .map((item) => [item.appointment_id as string, item]),
      ),
    [data.encounters],
  );
  const selectedAppointment = useMemo(
    () =>
      selectedAppointmentId
        ? (data.appointments.find(
            (item) => item.id === selectedAppointmentId,
          ) ?? null)
        : null,
    [data.appointments, selectedAppointmentId],
  );

  const filteredAppointments = useMemo(() => {
    const rawPatientQuery = patientQuery.trim().toLowerCase();
    const patientDigits = rawPatientQuery.replace(/\D/g, "");

    return data.appointments.filter((item) => {
      const itemDate = localDateKey(item.start_at, data.timeZone);
      if (!dateInView(itemDate, date, view)) return false;
      if (rawPatientQuery) {
        const itemPatient = patient.get(item.patient_id);
        const textMatch = [
          itemPatient?.full_name ?? "",
          itemPatient?.social_name ?? "",
          itemPatient?.email ?? "",
          itemPatient?.id ?? "",
        ]
          .join(" ")
          .toLowerCase()
          .includes(rawPatientQuery);
        const digitMatch = patientDigits
          ? [
              itemPatient?.cpf ?? "",
              itemPatient?.phone ?? "",
              itemPatient?.whatsapp ?? "",
              itemPatient?.id ?? "",
            ]
              .join(" ")
              .replace(/\D/g, "")
              .includes(patientDigits)
          : false;

        if (!textMatch && !digitMatch) return false;
      }
      if (
        professionalIds.length &&
        !professionalIds.includes(item.professional_id)
      )
        return false;
      if (statusValues.length && !statusValues.includes(item.status))
        return false;
      if (unitIds.length && !unitIds.includes(item.unit_id)) return false;
      if (procedureIds.length && !procedureIds.includes(item.procedure_id))
        return false;
      if (
        insuranceIds.length &&
        (!item.health_insurance_id ||
          !insuranceIds.includes(item.health_insurance_id))
      )
        return false;
      if (specialtyIds.length) {
        const itemProfessional = professional.get(item.professional_id);
        if (
          !itemProfessional?.specialty_id ||
          !specialtyIds.includes(itemProfessional.specialty_id)
        )
          return false;
      }
      return true;
    });
  }, [
    data.appointments,
    data.timeZone,
    date,
    insuranceIds,
    patient,
    patientQuery,
    procedureIds,
    professional,
    professionalIds,
    specialtyIds,
    statusValues,
    unitIds,
    view,
  ]);

  const filteredBlocks = useMemo(() => {
    if (statusValues.length || procedureIds.length || insuranceIds.length) {
      return [];
    }

    return data.blocks.filter((item) => {
      const itemDate = localDateKey(item.start_at, data.timeZone);
      const itemSchedule = schedule.get(item.schedule_id);
      if (!dateInView(itemDate, date, view)) return false;
      if (
        professionalIds.length &&
        (!itemSchedule ||
          !professionalIds.includes(itemSchedule.professional_id))
      )
        return false;
      if (
        unitIds.length &&
        (!itemSchedule || !unitIds.includes(itemSchedule.unit_id))
      )
        return false;
      if (specialtyIds.length) {
        const itemProfessional = itemSchedule
          ? professional.get(itemSchedule.professional_id)
          : null;
        if (
          !itemProfessional?.specialty_id ||
          !specialtyIds.includes(itemProfessional.specialty_id)
        )
          return false;
      }
      return true;
    });
  }, [
    data.blocks,
    data.timeZone,
    date,
    insuranceIds,
    procedureIds,
    professional,
    professionalIds,
    schedule,
    specialtyIds,
    statusValues,
    unitIds,
    view,
  ]);

  const rangeLabel = formatRangeLabel(date, view);
  const activeFilterCount = [
    professionalIds,
    statusValues,
    unitIds,
    specialtyIds,
    procedureIds,
    insuranceIds,
  ].filter((list) => list.length > 0).length;
  const appointmentsByDay = useMemo(
    () => groupByLocalDay(filteredAppointments, data.timeZone),
    [data.timeZone, filteredAppointments],
  );
  const blocksByDay = useMemo(
    () => groupBlocksByLocalDay(filteredBlocks, data.timeZone),
    [data.timeZone, filteredBlocks],
  );
  const agendaReturnTo = buildAgendaReturnTo(date, view);
  const candidateSchedules = data.schedules.filter(
    (item) =>
      item.active &&
      (!professionalIds.length ||
        professionalIds.includes(item.professional_id)) &&
      (!unitIds.length || unitIds.includes(item.unit_id)),
  );

  function navigateAgenda(nextDate: string, nextView: AgendaView) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("date", nextDate);
    params.set("view", nextView);
    startNavigation(() => {
      router.push(`${pathname}?${params.toString()}`, { scroll: false });
    });
  }

  function moveDate(direction: -1 | 1) {
    navigateAgenda(addAgendaPeriod(date, view, direction), view);
  }

  function clearFilters() {
    setProfessionalIds([]);
    setStatusValues([]);
    setUnitIds([]);
    setSpecialtyIds([]);
    setProcedureIds([]);
    setInsuranceIds([]);
    setPatientQuery("");
  }

  return (
    <div className="grid min-w-0 gap-4 xl:grid-cols-[17.5rem_minmax(0,1fr)] xl:items-start">
      <AgendaSidebar
        date={date}
        view={view}
        dayCounts={data.dayCounts}
        open={sidebarOpen}
        canClear={activeFilterCount > 0 || patientQuery.trim().length > 0}
        onClearFilters={clearFilters}
        onSelectDate={(nextDate) => navigateAgenda(nextDate, view)}
        moreFiltersOpen={moreFiltersOpen}
        moreFiltersId={moreFiltersId}
        onToggleMoreFilters={() => setMoreFiltersOpen((value) => !value)}
        moreFilterCount={
          [specialtyIds, procedureIds, unitIds, insuranceIds].filter(
            (items) => items.length,
          ).length
        }
      >
        <FilterField label="Status">
          <MultiSelect
            value={statusValues}
            onValueChange={setStatusValues}
            allLabel="Todos os status"
            aria-label="Filtrar status"
            options={Object.entries(statusLabel).map(([value, label]) => ({
              value,
              label,
            }))}
          />
        </FilterField>
        <FilterField label="Profissional">
          <MultiSelect
            value={professionalIds}
            onValueChange={setProfessionalIds}
            allLabel="Todos os profissionais"
            aria-label="Filtrar profissionais"
            options={data.professionals.map((item) => ({
              value: item.id,
              label: item.name,
            }))}
          />
        </FilterField>
        <div id={moreFiltersId} hidden={!moreFiltersOpen} className="space-y-4">
          <FilterField label="Especialidade">
            <MultiSelect
              value={specialtyIds}
              onValueChange={setSpecialtyIds}
              allLabel="Todas"
              aria-label="Filtrar especialidades"
              options={data.specialties.map((item) => ({
                value: item.id,
                label: item.name,
              }))}
            />
          </FilterField>
          <FilterField label="Procedimento">
            <MultiSelect
              value={procedureIds}
              onValueChange={setProcedureIds}
              allLabel="Todos"
              aria-label="Filtrar procedimentos"
              options={data.procedures.map((item) => ({
                value: item.id,
                label: item.name,
              }))}
            />
          </FilterField>
          <FilterField label="Unidade">
            <MultiSelect
              value={unitIds}
              onValueChange={setUnitIds}
              allLabel="Todas"
              aria-label="Filtrar unidades"
              options={data.units.map((item) => ({
                value: item.id,
                label: item.name,
              }))}
            />
          </FilterField>
          <FilterField label="Convênio">
            <MultiSelect
              value={insuranceIds}
              onValueChange={setInsuranceIds}
              allLabel="Todos"
              aria-label="Filtrar convenios"
              options={data.insurances.map((item) => ({
                value: item.id,
                label: item.name,
              }))}
            />
          </FilterField>
        </div>
      </AgendaSidebar>

      <div className="order-2 min-w-0 rounded-xl border border-border bg-card shadow-[var(--shadow-soft)]">
        <Card
          aria-busy={navigationPending}
          className="rounded-none rounded-t-xl border-0 border-b bg-card shadow-none"
        >
          <CardContent className="flex flex-wrap items-center gap-x-3 gap-y-2 p-3">
            <div className="flex min-w-0 items-center gap-1">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={navigationPending}
                onClick={() => navigateAgenda(today, view)}
              >
                Hoje
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Período anterior"
                disabled={navigationPending}
                onClick={() => moveDate(-1)}
              >
                <ChevronLeft className="size-4" aria-hidden="true" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Próximo período"
                disabled={navigationPending}
                onClick={() => moveDate(1)}
              >
                <ChevronRight className="size-4" aria-hidden="true" />
              </Button>
              <p className="min-w-0 px-2 text-base font-semibold tracking-tight first-letter:uppercase sm:text-xl">
                {rangeLabel}
              </p>
              {navigationPending ? (
                <RefreshCw
                  className="size-4 animate-spin text-muted-foreground"
                  aria-label="Atualizando"
                />
              ) : null}
            </div>

            {/* Com base zero este grupo cabia "ao lado" da navegação mesmo sem
                espaço: no celular a busca virava só a lupa, "Filtros" cobria o
                período e a visão saía cortada. A base de 22rem faz o grupo
                descer de linha quando não cabe, e a base da busca faz o mesmo
                dentro dele. */}
            <div className="flex min-w-0 flex-1 basis-[22rem] flex-wrap items-center justify-end gap-2">
              {/* Filtra a tela na hora e procura a pessoa em outras datas. */}
              <AgendaPatientSearch
                value={patientQuery}
                onChange={setPatientQuery}
                timeZone={data.timeZone}
                isInView={(dateKey) => dateInView(dateKey, date, view)}
                visibleCount={filteredAppointments.length}
                onOpenAppointment={(result) => {
                  navigateAgenda(
                    localDateKey(result.startAt, data.timeZone),
                    view,
                  );
                  setSelectedAppointmentId(result.id);
                }}
              />
              <Badge
                variant="neutral"
                className="hidden rounded-full border-0 bg-muted/70 px-2.5 py-1 text-xs font-normal lg:inline-flex"
              >
                {filteredAppointments.length}{" "}
                {filteredAppointments.length === 1
                  ? "agendamento"
                  : "agendamentos"}
              </Badge>
              {filteredBlocks.length ? (
                <Badge variant="neutral" className="hidden lg:inline-flex">
                  {filteredBlocks.length} bloqueios
                </Badge>
              ) : null}
              <Button
                type="button"
                variant="secondary"
                aria-expanded={sidebarOpen}
                onClick={() => setSidebarOpen((value) => !value)}
                className="shrink-0 xl:hidden"
              >
                <SlidersHorizontal
                  className="size-4 text-muted-foreground"
                  aria-hidden="true"
                />
                Filtros
                {activeFilterCount > 0 ? (
                  <Badge variant="primary" className="h-5 px-1.5">
                    {activeFilterCount}
                  </Badge>
                ) : null}
              </Button>
              <Select
                value={view}
                onValueChange={(nextView) =>
                  navigateAgenda(date, nextView as AgendaView)
                }
                disabled={navigationPending}
                aria-label="Visão da agenda"
                className="w-28 shrink-0"
              >
                <option value="day">Diária</option>
                <option value="week">Semanal</option>
                <option value="month">Mensal</option>
              </Select>
            </div>
          </CardContent>
        </Card>

        {view === "day" ? (
          <DayAgenda
            date={date}
            appointments={filteredAppointments}
            blocks={filteredBlocks}
            patient={patient}
            professional={professional}
            procedure={procedure}
            schedule={schedule}
            canEdit={canEdit}
            onSelectSlot={canCreate ? setNewAppointmentSlot : undefined}
            onSelectAppointment={setSelectedAppointmentId}
          />
        ) : view === "week" ? (
          <WeekAgenda
            date={date}
            dayCounts={data.dayCounts}
            onSelectSlot={canCreate ? setNewAppointmentSlot : undefined}
            hasFilters={activeFilterCount > 0 || patientQuery.trim().length > 0}
            appointmentsByDay={appointmentsByDay}
            blocksByDay={blocksByDay}
            patient={patient}
            professional={professional}
            procedure={procedure}
            schedule={schedule}
            onSelectAppointment={setSelectedAppointmentId}
          />
        ) : (
          <MonthAgenda
            date={date}
            appointmentsByDay={appointmentsByDay}
            blocksByDay={blocksByDay}
            patient={patient}
            professional={professional}
            procedure={procedure}
            schedule={schedule}
            onSelectAppointment={setSelectedAppointmentId}
          />
        )}
      </div>

      {newAppointmentSlot ? (
        <AppointmentFormModal
          open
          onClose={() => setNewAppointmentSlot(null)}
          data={data}
          defaultStart={newAppointmentSlot}
          defaultScheduleId={
            candidateSchedules.length === 1
              ? candidateSchedules[0].id
              : undefined
          }
          canExtra={canExtra}
          canCreatePatient={canCreatePatient}
        />
      ) : null}
      {selectedAppointment ? (
        <AppointmentDetailsModal
          key={selectedAppointment.id}
          appointment={selectedAppointment}
          patient={patient.get(selectedAppointment.patient_id)}
          professional={professional.get(selectedAppointment.professional_id)}
          procedure={procedure.get(selectedAppointment.procedure_id)}
          schedule={schedule.get(selectedAppointment.schedule_id)}
          unit={unit.get(selectedAppointment.unit_id)}
          room={
            selectedAppointment.room_id
              ? room.get(selectedAppointment.room_id)
              : undefined
          }
          insurance={
            selectedAppointment.health_insurance_id
              ? insurance.get(selectedAppointment.health_insurance_id)
              : undefined
          }
          paymentMethods={data.paymentMethods}
          clinicalTemplates={data.clinicalTemplates}
          encounter={encounterByAppointment.get(selectedAppointment.id)}
          canEdit={canEdit}
          canViewPatient={canViewPatient}
          canViewClinical={canViewClinical}
          canStartEncounter={canStartEncounter}
          returnTo={agendaReturnTo}
          onClose={() => setSelectedAppointmentId(null)}
        />
      ) : null}
    </div>
  );
}

// Coluna fixa da agenda: mini calendário do mês para saltar entre datas e,
// logo abaixo, os filtros do período visível. Abaixo de xl ela sai do fluxo
// e é aberta pelo botão "Filtros" da barra superior.
function AgendaSidebar({
  canClear,
  children,
  date,
  view,
  dayCounts,
  onClearFilters,
  onSelectDate,
  open,
  moreFiltersOpen,
  moreFiltersId,
  moreFilterCount,
  onToggleMoreFilters,
}: {
  canClear: boolean;
  children: React.ReactNode;
  date: string;
  view: AgendaView;
  dayCounts: Record<string, number>;
  onClearFilters: () => void;
  onSelectDate: (nextDate: string) => void;
  open: boolean;
  moreFiltersOpen: boolean;
  moreFiltersId: string;
  moreFilterCount: number;
  onToggleMoreFilters: () => void;
}) {
  const selectedDay = useMemo(() => calendarDateFromKey(date), [date]);
  const density = useMemo(() => buildDayDensity(dayCounts), [dayCounts]);

  return (
    <div
      className={cn(
        "order-1 min-w-0 content-start gap-4 xl:sticky xl:top-[calc(var(--app-sticky-offset,0rem)+0.5rem)] xl:grid xl:max-h-[calc(100svh-var(--app-sticky-offset,0rem)-1.5rem)] xl:overflow-y-auto xl:pr-1",
        open ? "grid" : "hidden",
      )}
    >
      <Card className="relative rounded-xl shadow-none">
        <CardContent className="p-4">
          <AgendaDayDensityContext.Provider value={density}>
            <DayPicker
              mode="single"
              locale={ptBR}
              weekStartsOn={1}
              navLayout="around"
              showOutsideDays
              // O mês exibido segue o dia selecionado, então as setas do mini
              // calendário movem o próprio período da agenda — é assim que a
              // ocupação do mês novo chega junto na navegação.
              month={selectedDay}
              onMonthChange={(nextMonth) =>
                onSelectDate(sameDayOfMonth(nextMonth, selectedDay.getDate()))
              }
              selected={selectedDay}
              onSelect={(nextDay) => {
                if (nextDay) onSelectDate(calendarKeyFromDate(nextDay));
              }}
              // O fundo da semana conecta o período; cada botão mostra sua ocupação.
              modifiers={{
                visiblePeriod: (day) =>
                  dateInView(calendarKeyFromDate(day), date, view),
              }}
              modifiersClassNames={{
                visiblePeriod: "bg-primary-muted text-primary-strong",
              }}
              formatters={{ formatWeekdayName: calendarWeekdayLabel }}
              components={{
                DayButton: AgendaDayButton,
                MonthCaption: AgendaCalendarCaption,
              }}
              classNames={{
                root: "relative w-full",
                caption_label:
                  "text-sm font-semibold first-letter:uppercase text-foreground",
                chevron: "size-4 fill-current",
                day: "h-9 w-8 p-0 text-center text-sm first:rounded-l-lg last:rounded-r-lg",
                day_button: "",
                month: "relative",
                month_caption: "mr-14 mb-2 flex min-h-8 items-center text-left",
                month_grid: "w-full table-fixed border-collapse",
                months: "grid gap-2",
                nav: "absolute inset-x-0 top-0 flex justify-between",
                button_next:
                  "absolute right-0 top-0 flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-40",
                button_previous:
                  "absolute right-7 top-0 flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-40",
                weekday:
                  "h-7 w-8 p-0 text-center text-caption font-medium uppercase text-muted-foreground",
              }}
            />
          </AgendaDayDensityContext.Provider>

          <div className="mt-3 flex items-center justify-between gap-2 rounded-md bg-muted/40 px-2 py-2.5 text-caption text-secondary-foreground">
            {densityLegend.map((item) => (
              <span key={item.level} className="flex items-center gap-1">
                <span
                  aria-hidden="true"
                  className={cn(
                    "size-2 rounded-full",
                    densityCellClass[item.level],
                  )}
                />
                {item.label}
              </span>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-xl shadow-none">
        <CardContent className="grid gap-4 p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="flex items-center gap-2 text-sm font-semibold">
              <Funnel className="size-4" weight="fill" aria-hidden="true" />
              Filtros
            </p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-expanded={moreFiltersOpen}
              aria-controls={moreFiltersId}
              onClick={onToggleMoreFilters}
              className="h-7 px-0 text-xs font-normal text-primary hover:bg-transparent hover:text-primary"
            >
              {moreFiltersOpen ? "Menos filtros" : "Mais filtros"}
              {moreFilterCount > 0 ? (
                <span className="rounded-full bg-primary-muted px-1.5">
                  {moreFilterCount}
                </span>
              ) : null}
              <ArrowRight
                className={cn("size-3.5", moreFiltersOpen && "rotate-90")}
                aria-hidden="true"
              />
            </Button>
          </div>
          {children}
          {canClear ? (
            <Button
              type="button"
              variant="link"
              size="sm"
              onClick={onClearFilters}
              className="h-auto justify-self-start p-0 text-caption"
            >
              Limpar filtros
            </Button>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

type DayDensity = { counts: Record<string, number>; scale: number };
type DensityLevel = "low" | "medium" | "high";

const AgendaDayDensityContext = createContext<DayDensity>({
  counts: {},
  scale: 1,
});

const densityCellClass: Record<DensityLevel, string> = {
  low: "bg-success",
  medium: "bg-warning",
  high: "bg-destructive",
};

const densityDayClass: Record<DensityLevel, string> = {
  low: "bg-success-muted text-success-foreground hover:bg-success/25",
  medium: "bg-warning-muted text-warning-foreground hover:bg-warning/30",
  high: "bg-destructive-muted text-destructive-foreground hover:bg-destructive/25",
};

const densityLegend: Array<{ level: DensityLevel; label: string }> = [
  { level: "low", label: "Tranquilo" },
  { level: "medium", label: "Moderado" },
  { level: "high", label: "Cheio" },
];

// Escala mínima para clínicas de baixo volume: sem ela um dia com dois
// agendamentos apareceria como "cheio" só por ser o pico do mês.
const minimumDensityScale = 6;

function buildDayDensity(counts: Record<string, number>): DayDensity {
  const values = Object.values(counts);
  return {
    counts,
    scale: Math.max(minimumDensityScale, ...values, 1),
  };
}

function densityLevelOf(count: number, scale: number): DensityLevel | null {
  if (count <= 0) return null;
  const ratio = count / scale;
  if (ratio <= 1 / 3) return "low";
  if (ratio <= 2 / 3) return "medium";
  return "high";
}

// Mesmo botão do react-day-picker (inclusive o foco por teclado). O estilo
// fica todo aqui porque o `cn` resolve os conflitos entre selecionado, hoje e
// dia de fora do mês. O dia selecionado mantém azul e um ponto de ocupação.
function AgendaDayButton({
  day,
  modifiers,
  children,
  className,
  ...props
}: DayButtonProps) {
  const density = useContext(AgendaDayDensityContext);
  const ref = useRef<HTMLButtonElement>(null);
  const count = density.counts[calendarKeyFromDate(day.date)] ?? 0;
  const level = densityLevelOf(count, density.scale);
  const occupancyLabel = level
    ? densityLegend.find((item) => item.level === level)?.label
    : "Sem agendamentos";
  const description = `${count} ${count === 1 ? "agendamento" : "agendamentos"} · ${occupancyLabel}`;

  useEffect(() => {
    if (modifiers.focused) ref.current?.focus();
  }, [modifiers.focused]);

  return (
    <button
      ref={ref}
      {...props}
      title={description}
      aria-label={`${props["aria-label"] ?? day.date.toLocaleDateString("pt-BR")} · ${description}`}
      className={cn(
        "relative flex size-full items-center justify-center rounded-lg transition-colors duration-[var(--motion-fast)] hover:bg-primary-muted focus-visible:outline-2 focus-visible:outline-primary",
        modifiers.today && "font-semibold text-primary",
        modifiers.outside && "text-muted-foreground/50",
        level && densityDayClass[level],
        modifiers.visiblePeriod && level && "ring-1 ring-inset ring-primary/20",
        modifiers.selected &&
          "bg-primary font-semibold text-primary-foreground hover:bg-primary",
        className,
      )}
    >
      {children}
      {modifiers.selected && level ? (
        <span
          aria-hidden="true"
          className={cn(
            "absolute bottom-1 size-1 rounded-full",
            densityCellClass[level],
          )}
        />
      ) : null}
    </button>
  );
}

function FilterField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid min-w-0 gap-1.5">
      <span className="text-xs font-medium text-secondary-foreground">
        {label}
      </span>
      {children}
    </div>
  );
}

function DayAgenda({
  date,
  appointments,
  blocks,
  patient,
  professional,
  procedure,
  schedule,
  canEdit,
  onSelectSlot,
  onSelectAppointment,
}: {
  date: string;
  appointments: AgendaData["appointments"];
  blocks: AgendaData["blocks"];
  patient: Map<string, AgendaData["patients"][number]>;
  professional: Map<string, AgendaData["professionals"][number]>;
  procedure: Map<string, AgendaData["procedures"][number]>;
  schedule: Map<string, AgendaData["schedules"][number]>;
  canEdit: boolean;
  onSelectSlot?: (slot: { date: string; time: string }) => void;
  onSelectAppointment: (appointmentId: string) => void;
}) {
  const timeZone = useAgendaTimeZone();
  const dayAppointments = appointments.filter(
    (item) => localDateKey(item.start_at, timeZone) === date,
  );
  const dayBlocks = blocks.filter(
    (item) => localDateKey(item.start_at, timeZone) === date,
  );
  const periods = [
    {
      id: "morning",
      label: "Manhã",
      rangeLabel: "06:00-11:59",
      startMinute: 6 * 60,
      endMinute: 12 * 60,
    },
    {
      id: "afternoon",
      label: "Tarde",
      rangeLabel: "12:00-17:59",
      startMinute: 12 * 60,
      endMinute: 18 * 60,
    },
    {
      id: "evening",
      label: "Noite",
      rangeLabel: "18:00-23:59",
      startMinute: 18 * 60,
      endMinute: 24 * 60,
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {periods.map((period) => {
        const periodAppointments = dayAppointments.filter((item) =>
          localIntervalIntersectsMinuteRange(
            item.start_at,
            item.end_at,
            period.startMinute,
            period.endMinute,
            timeZone,
          ),
        );
        const periodBlocks = dayBlocks.filter((item) =>
          localIntervalIntersectsMinuteRange(
            item.start_at,
            item.end_at,
            period.startMinute,
            period.endMinute,
            timeZone,
          ),
        );
        const slots = buildTimelineSlots(period.startMinute, period.endMinute);
        const totalHeight =
          ((period.endMinute - period.startMinute) / weekTimelineStepMinutes) *
          weekTimelineRowHeight;
        const items = layoutTimedWeekItems({
          appointments: periodAppointments,
          blocks: periodBlocks,
          startMinute: period.startMinute,
          timeZone,
        });

        return (
          <Card key={period.id} className="overflow-hidden">
            <div className="grid grid-cols-[3.25rem_minmax(0,1fr)] border-b border-border bg-card">
              <div className="border-r border-border" />
              <div className="flex items-center justify-between gap-3 px-4 py-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-heading-sm font-semibold">
                      {period.label}
                    </h2>
                    <Badge variant="primary" className="rounded-md">
                      {periodAppointments.length}
                    </Badge>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {period.rangeLabel}
                  </p>
                </div>
              </div>
            </div>
            <div
              className="grid grid-cols-[3.25rem_minmax(0,1fr)]"
              style={{ height: totalHeight }}
            >
              <div className="relative border-r border-border bg-card">
                {slots
                  .filter((slot) => slot.minute < period.endMinute)
                  .map((slot) => (
                    <div
                      key={slot.minute}
                      className="absolute right-1.5 translate-y-1 rounded bg-card px-1 text-caption tabular-nums text-muted-foreground"
                      style={{ top: slot.top }}
                    >
                      {slot.label}
                    </div>
                  ))}
              </div>
              <div
                className="relative overflow-hidden bg-card"
                style={{ height: totalHeight }}
              >
                {slots.map((slot, index) => (
                  <div
                    key={slot.minute}
                    className={`absolute left-0 right-0 ${
                      index % 2 === 0
                        ? "border-t border-border"
                        : "border-t border-dashed border-border"
                    }`}
                    style={{ top: slot.top }}
                  />
                ))}
                <TimelineSlotButtons
                  date={date}
                  slots={slots}
                  endMinute={period.endMinute}
                  onSelectSlot={onSelectSlot}
                />
                {items.map((item) =>
                  item.type === "block" ? (
                    <TimelineBlockItem
                      key={item.id}
                      item={item}
                      schedule={schedule.get(item.block.schedule_id)}
                    />
                  ) : (
                    <TimelineAppointmentItem
                      key={item.id}
                      item={item}
                      appointment={item.appointment}
                      patient={patient.get(item.appointment.patient_id)}
                      professional={professional.get(
                        item.appointment.professional_id,
                      )}
                      procedure={procedure.get(item.appointment.procedure_id)}
                      schedule={schedule.get(item.appointment.schedule_id)}
                      canEdit={canEdit}
                      onSelect={() => onSelectAppointment(item.appointment.id)}
                    />
                  ),
                )}
                {!items.length ? (
                  <div className="pointer-events-none absolute inset-x-6 top-8 rounded-lg border border-dashed border-border bg-card/90 px-4 py-8 text-center text-sm text-muted-foreground">
                    Sem agendamentos neste turno.
                  </div>
                ) : null}
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

function WeekAgenda({
  date,
  dayCounts,
  hasFilters,
  onSelectSlot,
  appointmentsByDay,
  blocksByDay,
  patient,
  professional,
  procedure,
  schedule,
  onSelectAppointment,
}: {
  date: string;
  dayCounts: Record<string, number>;
  hasFilters: boolean;
  onSelectSlot?: (slot: { date: string; time: string }) => void;
  appointmentsByDay: Map<string, AgendaData["appointments"]>;
  blocksByDay: Map<string, AgendaData["blocks"]>;
  patient: Map<string, AgendaData["patients"][number]>;
  professional: Map<string, AgendaData["professionals"][number]>;
  procedure: Map<string, AgendaData["procedures"][number]>;
  schedule: Map<string, AgendaData["schedules"][number]>;
  onSelectAppointment: (appointmentId: string) => void;
}) {
  const timeZone = useAgendaTimeZone();
  const days = weekDays(date);
  const density = buildDayDensity(dayCounts);
  const isEmpty =
    !Array.from(appointmentsByDay.values()).some((items) => items.length) &&
    !Array.from(blocksByDay.values()).some((items) => items.length);
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone,
  }).format(new Date());
  const timelineRange = getWeekTimelineRange(
    days,
    appointmentsByDay,
    blocksByDay,
    timeZone,
  );
  const slots = buildTimelineSlots(
    timelineRange.startMinute,
    timelineRange.endMinute,
  );
  const totalHeight =
    ((timelineRange.endMinute - timelineRange.startMinute) /
      weekTimelineStepMinutes) *
    weekTimelineRowHeight;

  // Em notebook (~1366px) a semana não cabe inteira e o fim de semana fica
  // atrás da rolagem lateral — inclusive "hoje", num sábado. Ao abrir ou
  // trocar de data, a grade rola até o dia selecionado se ele estiver fora.
  const scrollerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const scroller = scrollerRef.current;
    const column = scroller?.querySelector<HTMLElement>(
      `[data-week-day="${date}"]`,
    );
    const gutter = scroller?.querySelector<HTMLElement>("[data-week-gutter]");
    if (!scroller || !column) return;
    const gutterWidth = gutter?.offsetWidth ?? 0;
    const visibleStart = scroller.scrollLeft + gutterWidth;
    const visibleEnd = scroller.scrollLeft + scroller.clientWidth;
    const columnEnd = column.offsetLeft + column.offsetWidth;
    if (column.offsetLeft < visibleStart || columnEnd > visibleEnd) {
      scroller.scrollLeft = Math.max(0, columnEnd - scroller.clientWidth);
    }
  }, [date]);

  return (
    <Card className="overflow-hidden rounded-none rounded-b-xl border-0 shadow-none">
      {/* relative: é a referência do offsetLeft das colunas lido acima. */}
      <div
        ref={scrollerRef}
        role="region"
        aria-label="Agenda semanal; role horizontalmente para ver os demais dias"
        tabIndex={0}
        className="relative max-h-[max(32rem,calc(100svh-var(--app-sticky-offset,0rem)-7rem))] overflow-auto overscroll-contain focus-visible:outline-2 focus-visible:-outline-offset-2"
      >
        <div className="min-w-[1050px]">
          <div className="sticky top-0 z-50 grid grid-cols-[4.5rem_repeat(7,minmax(7.5rem,1fr))] border-b border-border bg-card">
            {/* Coluna de horários presa à esquerda: rolando até o fim de
                semana, as horas continuam à vista. */}
            <div
              data-week-gutter
              className="sticky left-0 z-30 border-r border-border bg-card"
            />
            {days.map((day) => {
              const dayKey = dateKey(day);
              const count = dayCounts[dayKey] ?? 0;
              const densityLevel = densityLevelOf(count, density.scale);
              return (
                <div
                  key={dayKey}
                  data-week-day={dayKey}
                  className={`border-r border-border px-3 py-3 text-center last:border-r-0 ${
                    dayKey === today ? "bg-primary-muted/60" : ""
                  }`}
                >
                  <p
                    className={`text-xs font-semibold ${
                      dayKey === date ? "text-primary" : "text-muted-foreground"
                    }`}
                  >
                    {weekdayLong(day)}
                  </p>
                  <p className="mt-0.5 text-sm font-semibold">
                    {formatDayMonth(dayKey)}
                  </p>
                  <span
                    title={`${count} agendamentos · ${densityLegend.find((item) => item.level === densityLevel)?.label ?? "Sem agendamentos"}`}
                    className={cn(
                      "mx-auto mt-1.5 block size-2 rounded-full",
                      densityLevel
                        ? densityCellClass[densityLevel]
                        : "bg-border-strong",
                    )}
                  />
                </div>
              );
            })}
          </div>
          <div
            className="relative grid grid-cols-[4.5rem_repeat(7,minmax(7.5rem,1fr))]"
            style={{ height: totalHeight }}
          >
            <div className="sticky left-0 z-30 border-r border-border bg-card">
              {slots
                .filter((slot) => slot.minute < timelineRange.endMinute)
                .map((slot) => (
                  <div
                    key={slot.minute}
                    className="absolute right-3 translate-y-1 rounded bg-card px-1 text-xs tabular-nums text-muted-foreground"
                    style={{ top: slot.top }}
                  >
                    {slot.label}
                  </div>
                ))}
            </div>
            {days.map((day) => {
              const dayKey = dateKey(day);
              const dayAppointments = appointmentsByDay.get(dayKey) ?? [];
              const dayBlocks = blocksByDay.get(dayKey) ?? [];
              const items = layoutTimedWeekItems({
                appointments: dayAppointments,
                blocks: dayBlocks,
                startMinute: timelineRange.startMinute,
                timeZone,
              });

              return (
                <div
                  key={dayKey}
                  className={`relative border-r border-border last:border-r-0 ${
                    dayKey === today ? "bg-primary-muted/40" : "bg-card"
                  }`}
                  style={{ height: totalHeight }}
                >
                  {slots.map((slot, index) => (
                    <div
                      key={slot.minute}
                      className={`absolute left-0 right-0 ${
                        index % 2 === 0
                          ? "border-t border-border"
                          : "border-t border-dashed border-border"
                      }`}
                      style={{ top: slot.top }}
                    />
                  ))}
                  <TimelineSlotButtons
                    date={dayKey}
                    slots={slots}
                    endMinute={timelineRange.endMinute}
                    onSelectSlot={onSelectSlot}
                  />
                  {items.map((item) =>
                    item.type === "block" ? (
                      <TimelineBlockItem
                        key={item.id}
                        item={item}
                        schedule={schedule.get(item.block.schedule_id)}
                      />
                    ) : (
                      <TimelineAppointmentItem
                        key={item.id}
                        item={item}
                        appointment={item.appointment}
                        patient={patient.get(item.appointment.patient_id)}
                        professional={professional.get(
                          item.appointment.professional_id,
                        )}
                        procedure={procedure.get(item.appointment.procedure_id)}
                        schedule={schedule.get(item.appointment.schedule_id)}
                        onSelect={() =>
                          onSelectAppointment(item.appointment.id)
                        }
                      />
                    ),
                  )}
                </div>
              );
            })}
            {days.some((day) => dateKey(day) === today) ? (
              <NowIndicator
                startMinute={timelineRange.startMinute}
                endMinute={timelineRange.endMinute}
                timeZone={timeZone}
              />
            ) : null}
            {isEmpty ? (
              <div className="pointer-events-none absolute inset-x-0 top-28 z-10 flex justify-center pl-[4.5rem]">
                <div
                  role="status"
                  className="max-w-sm rounded-xl border border-border bg-card/95 px-7 py-5 text-center shadow-[var(--shadow-soft)]"
                >
                  <CalendarClock
                    className="mx-auto mb-2 size-6 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <p className="text-sm font-medium">
                    {hasFilters
                      ? "Nenhum agendamento com estes filtros"
                      : "Nenhum agendamento nesta semana"}
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    {hasFilters
                      ? "Ajuste os filtros para ver outros atendimentos."
                      : onSelectSlot
                        ? "Clique em um horário para criar um agendamento."
                        : "Os atendimentos aparecerão aqui quando forem agendados."}
                  </p>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </Card>
  );
}

function TimelineSlotButtons({
  date,
  slots,
  endMinute,
  onSelectSlot,
}: {
  date: string;
  slots: ReturnType<typeof buildTimelineSlots>;
  endMinute: number;
  onSelectSlot?: (slot: { date: string; time: string }) => void;
}) {
  if (!onSelectSlot) return null;
  return slots
    .filter((slot) => slot.minute < endMinute)
    .map((slot) => (
      <Button
        key={slot.minute}
        type="button"
        variant="ghost"
        aria-label={`Agendar em ${formatFullDay(date)} às ${slot.label}`}
        onClick={() => onSelectSlot({ date, time: slot.label })}
        className="group absolute inset-x-1 h-auto gap-1.5 rounded-md border border-dashed border-transparent px-1 py-0 text-caption font-normal text-primary hover:border-primary/60 hover:bg-primary-muted/70 hover:text-primary focus-visible:border-primary focus-visible:bg-primary-muted focus-visible:outline-none active:translate-y-0"
        style={{ top: slot.top + 2, height: weekTimelineRowHeight - 4 }}
      >
        <span className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100">
          <Plus className="size-4 shrink-0" aria-hidden="true" />
          <span>Clique para agendar</span>
        </span>
      </Button>
    ));
}

function currentMinuteInTimeZone(timeZone: string) {
  const parts = new Intl.DateTimeFormat("pt-BR", {
    timeZone,
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  }).formatToParts(new Date());
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
  const minute = Number(
    parts.find((part) => part.type === "minute")?.value ?? 0,
  );
  return hour * 60 + minute;
}

function NowIndicator({
  startMinute,
  endMinute,
  timeZone,
}: {
  startMinute: number;
  endMinute: number;
  timeZone: string;
}) {
  const [minute, setMinute] = useState(() => currentMinuteInTimeZone(timeZone));

  useEffect(() => {
    const id = setInterval(() => {
      setMinute(currentMinuteInTimeZone(timeZone));
    }, 60_000);
    return () => clearInterval(id);
  }, [timeZone]);

  if (minute < startMinute || minute > endMinute) {
    return null;
  }

  const top =
    ((minute - startMinute) / weekTimelineStepMinutes) * weekTimelineRowHeight;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 z-40"
      style={{ top }}
    >
      <div className="relative ml-[4.5rem] border-t-2 border-destructive">
        <span className="absolute -top-[5px] -left-1 size-2 rounded-full bg-destructive" />
        <span className="absolute -left-12 -top-3 rounded-md bg-destructive px-1.5 py-0.5 text-caption font-semibold tabular-nums text-white">
          {minutesToTimeLabel(minute)}
        </span>
      </div>
    </div>
  );
}

type TimedWeekItem =
  | {
      id: string;
      type: "appointment";
      appointment: AgendaData["appointments"][number];
      startAt: Date;
      endAt: Date;
      lane: number;
      laneCount: number;
      top: number;
      height: number;
    }
  | {
      id: string;
      type: "block";
      block: AgendaData["blocks"][number];
      startAt: Date;
      endAt: Date;
      lane: number;
      laneCount: number;
      top: number;
      height: number;
    };

function TimelineAppointmentItem({
  item,
  appointment,
  patient,
  professional,
  procedure,
  schedule,
  canEdit,
  onSelect,
}: {
  item: Extract<TimedWeekItem, { type: "appointment" }>;
  appointment: AgendaData["appointments"][number];
  patient?: AgendaData["patients"][number];
  professional?: AgendaData["professionals"][number];
  procedure?: AgendaData["procedures"][number];
  schedule?: AgendaData["schedules"][number];
  canEdit?: boolean;
  onSelect?: () => void;
}) {
  const timeZone = useAgendaTimeZone();
  const patientName = patient?.social_name || patient?.full_name || "Paciente";
  const tone =
    appointment.status === "cancelled" || appointment.status === "no_show"
      ? "destructive"
      : appointment.status === "waiting"
        ? "warning"
        : appointment.status === "confirmed" ||
            appointment.status === "attended"
          ? "success"
          : "primary";
  const width = `calc(${100 / item.laneCount}% - 6px)`;
  const left = `calc(${(100 / item.laneCount) * item.lane}% + 3px)`;
  const summary = `${formatTime(appointment.start_at, timeZone)} - ${formatTime(
    appointment.end_at,
    timeZone,
  )} · ${patientName} · ${statusLabel[appointment.status] ?? appointment.status} · ${procedure?.name ?? "Procedimento"} · ${professional?.name ?? schedule?.name ?? ""}`;

  return (
    <div
      role={onSelect ? "button" : undefined}
      tabIndex={onSelect ? 0 : undefined}
      aria-label={onSelect ? summary : undefined}
      onClick={onSelect}
      onKeyDown={(event) => handleAppointmentCardKeyDown(event, onSelect)}
      className={cn(
        "absolute z-10 overflow-hidden rounded-md border px-2 py-1 text-xs",
        onSelect &&
          "cursor-pointer transition-shadow duration-[var(--motion-fast)] hover:shadow-[var(--shadow-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
      )}
      style={{
        top: item.top,
        height: item.height,
        left,
        width,
        backgroundColor: `color-mix(in srgb, var(--${tone}) 7%, var(--card))`,
        borderColor: `color-mix(in srgb, var(--${tone}) 18%, var(--card))`,
        borderLeft: `3px solid var(--${tone})`,
      }}
      title={summary}
    >
      {item.height >= 44 ? (
        <div className="mb-0.5 flex min-w-0 items-center justify-between gap-1">
          <span className="shrink-0 text-caption leading-tight tabular-nums text-secondary-foreground">
            {formatTime(appointment.start_at, timeZone)} –{" "}
            {formatTime(appointment.end_at, timeZone)}
          </span>
          <span
            className="truncate rounded-full px-1.5 py-0.5 text-caption font-medium leading-none"
            style={{
              backgroundColor: `var(--${tone}-muted)`,
              color: `var(--${tone === "primary" ? "primary-strong" : `${tone}-foreground`})`,
            }}
          >
            {statusLabel[appointment.status] ?? appointment.status}
          </span>
        </div>
      ) : null}
      <p className="truncate font-semibold leading-tight text-foreground">
        {patientName}
      </p>
      {item.height >= 60 ? (
        <p className="mt-0.5 flex min-w-0 items-center gap-1 text-caption leading-tight text-muted-foreground">
          <span
            className="size-1 shrink-0 rounded-full bg-muted-foreground/50"
            aria-hidden="true"
          />
          <span className="truncate">{procedure?.name ?? "Procedimento"}</span>
        </p>
      ) : null}
      {item.height >= 72 ? (
        <p className="mt-0.5 flex min-w-0 items-center gap-1 text-caption leading-tight text-muted-foreground">
          <UserRound className="size-3 shrink-0" aria-hidden="true" />
          <span className="truncate">
            {professional?.name ?? schedule?.name ?? "Profissional"}
          </span>
        </p>
      ) : null}
      {canEdit && item.height >= 120 ? (
        <div
          className="mt-2 rounded bg-card/60 p-1"
          onClick={(event) => event.stopPropagation()}
        >
          <StatusActions
            appointmentId={appointment.id}
            status={appointment.status}
            startAt={appointment.start_at}
          />
        </div>
      ) : null}
    </div>
  );
}

function TimelineBlockItem({
  item,
  schedule,
}: {
  item: Extract<TimedWeekItem, { type: "block" }>;
  schedule?: AgendaData["schedules"][number];
}) {
  const timeZone = useAgendaTimeZone();
  const width = `calc(${100 / item.laneCount}% - 6px)`;
  const left = `calc(${(100 / item.laneCount) * item.lane}% + 3px)`;

  return (
    <div
      className="absolute z-10 overflow-hidden rounded-md border border-dashed border-border-strong bg-muted px-2 py-1 text-xs text-secondary-foreground"
      style={{
        top: item.top,
        height: item.height,
        left,
        width,
      }}
      title={`${formatTime(item.block.start_at, timeZone)} - ${formatTime(
        item.block.end_at,
        timeZone,
      )}`}
    >
      <div className="flex min-w-0 items-center gap-1">
        <Ban className="size-3.5 shrink-0" aria-hidden="true" />
        <p className="truncate font-semibold tabular-nums">
          {formatTime(item.block.start_at, timeZone)} -{" "}
          {formatTime(item.block.end_at, timeZone)}
        </p>
      </div>
      {item.height >= 42 ? (
        <p className="mt-0.5 truncate">
          {item.block.reason || schedule?.name || "Horário bloqueado"}
        </p>
      ) : null}
    </div>
  );
}

function MonthAgenda({
  date,
  appointmentsByDay,
  blocksByDay,
  patient,
  professional,
  procedure,
  schedule,
  onSelectAppointment,
}: {
  date: string;
  appointmentsByDay: Map<string, AgendaData["appointments"]>;
  blocksByDay: Map<string, AgendaData["blocks"]>;
  patient: Map<string, AgendaData["patients"][number]>;
  professional: Map<string, AgendaData["professionals"][number]>;
  procedure: Map<string, AgendaData["procedures"][number]>;
  schedule: Map<string, AgendaData["schedules"][number]>;
  onSelectAppointment: (appointmentId: string) => void;
}) {
  const days = monthDays(date);
  const [detailsDay, setDetailsDay] = useState<string | null>(null);
  const detailsAppointments = detailsDay
    ? (appointmentsByDay.get(detailsDay) ?? [])
    : [];
  const detailsBlocks = detailsDay ? (blocksByDay.get(detailsDay) ?? []) : [];
  const detailsItems = [
    ...detailsBlocks.map((block) => ({
      id: block.id,
      type: "block" as const,
      startAt: block.start_at,
      block,
    })),
    ...detailsAppointments.map((appointment) => ({
      id: appointment.id,
      type: "appointment" as const,
      startAt: appointment.start_at,
      appointment,
    })),
  ].sort(
    (a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime(),
  );

  return (
    <>
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-7">
        {days.map((day) => {
          const dayKey = dateKey(day);
          const appointments = appointmentsByDay.get(dayKey) ?? [];
          const blocks = blocksByDay.get(dayKey) ?? [];
          return (
            <Card key={dayKey} className="min-h-64 bg-card">
              <CardHeader className="p-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-semibold uppercase text-muted-foreground">
                      {weekdayShort(day)}
                    </p>
                    <p className="font-semibold tabular-nums">
                      {day.getDate()}
                    </p>
                  </div>
                  <Badge variant={appointments.length ? "primary" : "neutral"}>
                    {appointments.length}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="grid min-w-0 gap-2 p-3 pt-0">
                {blocks.slice(0, 1).map((block) => (
                  <BlockCard
                    key={block.id}
                    block={block}
                    schedule={schedule.get(block.schedule_id)}
                    compact
                  />
                ))}
                {appointments.slice(0, 3).map((appointment) => (
                  <AppointmentCard
                    key={appointment.id}
                    appointment={appointment}
                    patient={patient.get(appointment.patient_id)}
                    professional={professional.get(appointment.professional_id)}
                    procedure={procedure.get(appointment.procedure_id)}
                    schedule={schedule.get(appointment.schedule_id)}
                    compact
                    onSelect={() => onSelectAppointment(appointment.id)}
                  />
                ))}
                {appointments.length > 3 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 w-fit justify-start px-1 text-control text-primary hover:bg-primary-muted hover:text-primary"
                    onClick={() => setDetailsDay(dayKey)}
                  >
                    +{appointments.length - 3} mais
                  </Button>
                ) : null}
                {!appointments.length && !blocks.length ? (
                  <EmptyAgendaBlock text="Sem agendamentos" />
                ) : null}
              </CardContent>
            </Card>
          );
        })}
      </section>

      <Modal
        open={Boolean(detailsDay)}
        onClose={() => setDetailsDay(null)}
        title={
          detailsDay
            ? `Agenda de ${formatFullDay(detailsDay)}`
            : "Agenda do dia"
        }
        description={`${detailsAppointments.length} ${
          detailsAppointments.length === 1 ? "agendamento" : "agendamentos"
        } e ${detailsBlocks.length} ${
          detailsBlocks.length === 1 ? "bloqueio" : "bloqueios"
        }.`}
        className="max-w-2xl"
      >
        <div className="grid gap-3">
          {detailsItems.length ? (
            detailsItems.map((item) =>
              item.type === "block" ? (
                <BlockCard
                  key={`block-${item.id}`}
                  block={item.block}
                  schedule={schedule.get(item.block.schedule_id)}
                />
              ) : (
                <AppointmentCard
                  key={`appointment-${item.id}`}
                  appointment={item.appointment}
                  patient={patient.get(item.appointment.patient_id)}
                  professional={professional.get(
                    item.appointment.professional_id,
                  )}
                  procedure={procedure.get(item.appointment.procedure_id)}
                  schedule={schedule.get(item.appointment.schedule_id)}
                  onSelect={() => onSelectAppointment(item.appointment.id)}
                />
              ),
            )
          ) : (
            <EmptyAgendaBlock text="Sem agendamentos neste dia" />
          )}
        </div>
      </Modal>
    </>
  );
}

function AppointmentCard({
  appointment,
  patient,
  professional,
  procedure,
  schedule,
  canEdit,
  expanded,
  compact,
  onSelect,
}: {
  appointment: AgendaData["appointments"][number];
  patient?: AgendaData["patients"][number];
  professional?: AgendaData["professionals"][number];
  procedure?: AgendaData["procedures"][number];
  schedule?: AgendaData["schedules"][number];
  canEdit?: boolean;
  expanded?: boolean;
  compact?: boolean;
  onSelect?: () => void;
}) {
  const timeZone = useAgendaTimeZone();
  const color = schedule?.color ?? defaultScheduleColor;
  const patientName = patient?.social_name || patient?.full_name || "Paciente";
  const statusTone =
    appointment.status === "cancelled"
      ? "var(--muted-foreground)"
      : appointment.status === "attended"
        ? "var(--success)"
        : appointment.status === "no_show"
          ? "var(--warning)"
          : "var(--primary)";

  return (
    <div
      role={onSelect ? "button" : undefined}
      tabIndex={onSelect ? 0 : undefined}
      onClick={onSelect}
      onKeyDown={(event) => handleAppointmentCardKeyDown(event, onSelect)}
      className={`min-w-0 overflow-hidden rounded-lg border border-border bg-background shadow-[var(--shadow-soft)] transition-[border-color,box-shadow,transform] ${
        compact ? "p-2.5" : "p-3"
      } ${
        onSelect
          ? "cursor-pointer hover:border-border-strong hover:shadow-[var(--shadow-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          : ""
      }`}
      style={{ borderLeftColor: color, borderLeftWidth: 4 }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-semibold tabular-nums text-muted-foreground">
            {formatTime(appointment.start_at, timeZone)}
          </p>
          <p className="truncate text-sm font-semibold" title={patientName}>
            {patientName}
          </p>
        </div>
        {compact ? (
          <span
            className="mt-1 size-2 shrink-0 rounded-full"
            style={{ backgroundColor: statusTone }}
            aria-label={statusLabel[appointment.status] ?? appointment.status}
          />
        ) : (
          <Badge
            variant={
              appointment.status === "cancelled"
                ? "neutral"
                : appointment.status === "attended"
                  ? "success"
                  : appointment.status === "no_show"
                    ? "warning"
                    : "primary"
            }
          >
            {statusLabel[appointment.status] ?? appointment.status}
          </Badge>
        )}
      </div>
      <p
        className="mt-1 truncate text-xs text-muted-foreground"
        title={`${procedure?.name ?? "Procedimento"}${
          professional ? ` - ${professional.name}` : ""
        }`}
      >
        {procedure?.name ?? "Procedimento"}
        {professional ? ` · ${professional.name}` : ""}
      </p>
      {appointment.is_extra && !compact ? (
        <Badge variant="warning" className="mt-2">
          Encaixe
        </Badge>
      ) : null}
      {expanded && canEdit ? (
        <div className="mt-3" onClick={(event) => event.stopPropagation()}>
          <StatusActions
            appointmentId={appointment.id}
            status={appointment.status}
            startAt={appointment.start_at}
          />
        </div>
      ) : null}
    </div>
  );
}

function AppointmentDetailsModal({
  appointment,
  patient,
  professional,
  procedure,
  schedule,
  unit,
  room,
  insurance,
  paymentMethods,
  clinicalTemplates,
  encounter,
  canEdit,
  canViewPatient,
  canViewClinical,
  canStartEncounter,
  returnTo,
  onClose,
}: {
  appointment: AgendaData["appointments"][number];
  patient?: AgendaData["patients"][number];
  professional?: AgendaData["professionals"][number];
  procedure?: AgendaData["procedures"][number];
  schedule?: AgendaData["schedules"][number];
  unit?: AgendaData["units"][number];
  room?: AgendaData["rooms"][number];
  insurance?: AgendaData["insurances"][number];
  paymentMethods: AgendaData["paymentMethods"];
  clinicalTemplates: AgendaData["clinicalTemplates"];
  encounter?: AgendaData["encounters"][number];
  canEdit: boolean;
  canViewPatient: boolean;
  canViewClinical: boolean;
  canStartEncounter: boolean;
  returnTo: string;
  onClose: () => void;
}) {
  const [editingPrice, setEditingPrice] = useState(false);
  const timeZone = useAgendaTimeZone();
  const patientName = patient?.social_name || patient?.full_name || "Paciente";
  const appointmentStatus =
    statusLabel[appointment.status] ?? appointment.status;
  const canStartClinicalEncounter =
    canStartEncounter &&
    ["confirmed", "waiting", "in_progress"].includes(appointment.status) &&
    encounter?.status !== "finalized";
  const modalFooter = (
    <div className="flex w-full flex-col justify-between gap-3 sm:flex-row sm:items-end">
      <div className="flex flex-wrap gap-2">
        {canViewPatient && patient ? (
          <Button asChild variant="secondary">
            <Link href={`/pacientes/${patient.id}`}>
              <UserRound className="size-4" aria-hidden="true" />
              Ver paciente
            </Link>
          </Button>
        ) : null}
        {canViewClinical && encounter?.status === "finalized" ? (
          <Button asChild variant="secondary">
            <Link href={buildAgendaEncounterHref(encounter.id, returnTo)}>
              <FileText className="size-4" aria-hidden="true" />
              Abrir prontuário
            </Link>
          </Button>
        ) : null}
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        {canEdit ? (
          <StatusActions
            appointmentId={appointment.id}
            status={appointment.status}
            startAt={appointment.start_at}
            hideInProgressAction={canStartClinicalEncounter}
            hideAttendedAction={
              canStartEncounter && encounter?.status === "draft"
            }
            fullLabels
          />
        ) : null}
        {canStartClinicalEncounter ? (
          <StartEncounterForm
            appointmentId={appointment.id}
            returnTo={returnTo}
            templates={clinicalTemplates}
            continuing={encounter?.status === "draft"}
          />
        ) : null}
      </div>
    </div>
  );

  return (
    <Modal
      open
      onClose={onClose}
      title="Detalhes do agendamento"
      description={`${patientName} · ${appointmentStatus}`}
      className={cn(
        "max-w-6xl [&>header]:border-b-0 [&>header]:pb-0 [&>header]:pt-6 [&>header]:sm:px-6 [&>header_h2]:text-display",
        detailsStyles.details,
      )}
      footer={modalFooter}
    >
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.7fr)_minmax(20rem,1fr)]">
        <div className="grid min-w-0 gap-4">
          <section className="rounded-xl border border-border bg-card p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-4">
                <Avatar name={patientName} size="lg" />
                <div className="min-w-0">
                  <h3 className="break-words text-heading font-semibold">
                    {patientName}
                  </h3>
                  {patient?.social_name ? (
                    <p className="mt-0.5 text-caption text-muted-foreground">
                      Nome civil: {patient.full_name}
                    </p>
                  ) : null}
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-body-sm text-muted-foreground">
                    <span>Prontuário</span>
                    <span className="font-mono font-semibold uppercase text-primary">
                      #{patient?.id.slice(0, 8).toUpperCase() ?? "---"}
                    </span>
                    {patient ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Copiar número do prontuário"
                        className="size-6 text-primary"
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(
                              patient.id.slice(0, 8).toUpperCase(),
                            );
                            toast.success("Número do prontuário copiado.");
                          } catch {
                            toast.error(
                              "Não foi possível copiar o número do prontuário.",
                            );
                          }
                        }}
                      >
                        <Copy className="size-3.5" aria-hidden="true" />
                      </Button>
                    ) : null}
                  </div>
                </div>
              </div>
              <Badge
                variant={
                  appointment.status === "cancelled" ||
                  appointment.status === "no_show"
                    ? "destructive"
                    : appointment.status === "confirmed" ||
                        appointment.status === "attended"
                      ? "success"
                      : appointment.status === "waiting"
                        ? "warning"
                        : "primary"
                }
                className="gap-2 rounded-full px-3 py-2"
              >
                <CalendarClock className="size-4" aria-hidden="true" />
                {appointmentStatus}
              </Badge>
            </div>
            <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <SummaryItem
                label="CPF"
                icon={IdentificationCard}
                value={patient?.cpf ? formatCPF(patient.cpf) : "Não informado"}
              />
              <SummaryItem
                label="Telefone"
                icon={Phone}
                value={
                  patient?.phone || patient?.whatsapp ? (
                    <a
                      className="hover:text-primary hover:underline"
                      href={`tel:${patient.phone || patient.whatsapp}`}
                    >
                      {formatPhoneBR(patient.phone || patient.whatsapp || "")}
                    </a>
                  ) : (
                    "Não informado"
                  )
                }
              />
              <SummaryItem
                label="WhatsApp"
                icon={WhatsappLogo}
                value={
                  patient?.whatsapp ? (
                    <a
                      className="hover:text-primary hover:underline"
                      href={`https://wa.me/${patient.whatsapp.replace(/\D/g, "")}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {formatPhoneBR(patient.whatsapp)}
                    </a>
                  ) : (
                    "Não informado"
                  )
                }
              />
              <SummaryItem
                label="E-mail"
                icon={Mail}
                value={
                  patient?.email ? (
                    <a
                      className="hover:text-primary hover:underline"
                      href={`mailto:${patient.email}`}
                    >
                      <EmailText email={patient.email} />
                    </a>
                  ) : (
                    "Não informado"
                  )
                }
              />
            </div>
          </section>

          <section className="rounded-xl border border-border bg-card p-5">
            <DetailsSectionHeading
              icon={CalendarClock}
              title="Resumo do atendimento"
            />
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-primary-muted/60 p-4">
              <div className="flex items-center gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary-muted text-primary">
                  <CalendarClock className="size-5" aria-hidden="true" />
                </span>
                <div>
                  <p className="text-body-sm font-medium">
                    {formatFullDay(
                      localDateKey(appointment.start_at, timeZone),
                    )}
                  </p>
                  <p className="mt-1 text-body-sm tabular-nums text-muted-foreground">
                    {formatTime(appointment.start_at, timeZone)} –{" "}
                    {formatTime(appointment.end_at, timeZone)} ·{" "}
                    {Math.round(
                      (new Date(appointment.end_at).getTime() -
                        new Date(appointment.start_at).getTime()) /
                        60000,
                    )}{" "}
                    min
                  </p>
                </div>
              </div>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={onClose}
                className="text-primary"
              >
                <CalendarClock className="size-4" aria-hidden="true" />
                Ver na agenda
              </Button>
            </div>
            <div className="mt-5 grid gap-x-4 gap-y-5 sm:grid-cols-2 xl:grid-cols-3">
              <SummaryItem
                label="Procedimento"
                value={procedure?.name ?? "Procedimento"}
                icon={Stethoscope}
              />
              <SummaryItem
                label="Profissional"
                value={professional?.name ?? "Não informado"}
                icon={UserRound}
              />
              <SummaryItem
                label="Agenda"
                value={schedule?.name ?? "Agenda"}
                icon={CalendarClock}
              />
              <SummaryItem
                label="Unidade"
                value={unit?.name ?? "Não informada"}
                icon={Buildings}
              />
              <SummaryItem
                label="Sala"
                value={room?.name ?? "Não informada"}
                icon={Door}
              />
              <SummaryItem
                label="Convênio"
                value={insurance?.name ?? "Sem convênio"}
                icon={ShieldCheck}
              />
            </div>
            {appointment.is_extra ? (
              <Badge variant="warning" className="mt-4">
                Encaixe
              </Badge>
            ) : null}
            <div className="mt-5 flex items-start gap-3 border-t border-border pt-4">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary-muted text-primary">
                <FileText className="size-4" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <h4 className="text-body-sm font-medium">Observações</h4>
                <p className="mt-2 whitespace-pre-wrap break-words rounded-lg bg-muted/60 p-3 text-body-sm text-secondary-foreground">
                  {appointment.notes || "Nenhuma observação registrada."}
                </p>
              </div>
            </div>
          </section>
        </div>

        <section className="min-w-0 rounded-xl border border-border bg-card p-5">
          <DetailsSectionHeading
            icon={CreditCard}
            title="Financeiro e ações"
            description="Informações de pagamento e ações do agendamento."
          />
          <div className="mt-5 rounded-lg bg-success-muted/40 p-4">
            <div className="flex items-start gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-success-muted text-success-foreground">
                <CurrencyDollar className="size-5" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-body-sm text-secondary-foreground">
                  Valor do atendimento
                </p>
                <p className="mt-1 text-display font-semibold tabular-nums">
                  {appointment.price == null
                    ? "Não informado"
                    : formatMoney(appointment.price)}
                </p>
                {appointment.list_price != null ? (
                  <p className="mt-1 text-caption text-muted-foreground">
                    Preço de tabela: {formatMoney(appointment.list_price)}
                  </p>
                ) : null}
                {appointmentPriceHint(appointment) ? (
                  <p className="mt-1 text-caption text-muted-foreground">
                    {appointmentPriceHint(appointment)}
                  </p>
                ) : null}
              </div>
            </div>
            {canEdit ? (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                aria-expanded={editingPrice}
                onClick={() => setEditingPrice((value) => !value)}
                className="mt-3 text-primary"
              >
                <PencilSimple className="size-3.5" aria-hidden="true" />
                {editingPrice ? "Fechar edição" : "Editar valor"}
              </Button>
            ) : null}
          </div>
          {canEdit && editingPrice ? (
            <div className="mt-3">
              <AppointmentPriceForm
                appointmentId={appointment.id}
                price={appointment.price ?? null}
                listPrice={appointment.list_price ?? null}
                priceNote={appointment.price_note ?? null}
                onSaved={() => setEditingPrice(false)}
              />
            </div>
          ) : null}
          <div className="mt-5">
            {canEdit ? (
              <PaymentMethodForm
                appointmentId={appointment.id}
                paymentMethodId={appointment.payment_method_id}
                paymentMethods={paymentMethods}
              />
            ) : null}
            <p className={canEdit ? detailsStyles.printOnly : "text-body-sm"}>
              Forma de pagamento:{" "}
              {paymentMethods.find(
                (method) => method.id === appointment.payment_method_id,
              )?.name ?? "Não selecionada"}
            </p>
          </div>
          <div className="mt-5 border-t border-border pt-5">
            <AppointmentStatusSelector
              appointment={appointment}
              canEdit={canEdit}
              startThroughEncounter={canStartClinicalEncounter}
              finishThroughEncounter={
                canStartEncounter && encounter?.status === "draft"
              }
            />
          </div>
          <div
            className={cn(
              "mt-5 border-t border-border pt-4",
              detailsStyles.screenOnly,
            )}
          >
            <h4 className="mb-3 flex items-center gap-2 text-body-sm font-medium">
              <Lightning className="size-4 text-primary" aria-hidden="true" />
              Ações rápidas
            </h4>
            <Button
              type="button"
              variant="secondary"
              onClick={() => window.print()}
              className="w-full"
            >
              <Printer className="size-4 text-primary" aria-hidden="true" />
              Imprimir
            </Button>
          </div>
        </section>
      </div>
    </Modal>
  );
}

function DetailsSectionHeading({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary-muted text-primary">
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <h3 className="text-heading-sm font-semibold">{title}</h3>
        {description ? (
          <p className="mt-1 text-caption leading-relaxed text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function AppointmentStatusSelector({
  appointment,
  canEdit,
  startThroughEncounter,
  finishThroughEncounter,
}: {
  appointment: AgendaData["appointments"][number];
  canEdit: boolean;
  startThroughEncounter: boolean;
  finishThroughEncounter: boolean;
}) {
  const timeZone = useAgendaTimeZone();
  const [selection, setSelection] = useState<{
    from: string;
    to: string;
  } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const [waitlistCandidates, setWaitlistCandidates] = useState<
    WaitlistCandidate[] | null
  >(null);
  const options = availableAppointmentStatuses(appointment.status, {
    startThroughEncounter,
    finishThroughEncounter,
  });
  const selectedStatus =
    selection?.from === appointment.status && options.includes(selection.to)
      ? selection.to
      : appointment.status;
  const hasChange = selectedStatus !== appointment.status;
  const destructive =
    selectedStatus === "cancelled" || selectedStatus === "no_show";

  async function applyStatus() {
    if (!canEdit || !hasChange || !options.includes(selectedStatus))
      return false;
    setError(undefined);
    try {
      const result = await changeAppointmentStatus(
        appointment.id,
        selectedStatus,
        initialState,
      );
      if (result.error) {
        setError(result.error);
        toast.error(result.error);
        return false;
      }
      if (result.success) toast.success(result.success);
      setSelection(null);
      if (destructive) {
        const candidates = await loadWaitlistCandidatesForAppointment(
          appointment.id,
        );
        if (candidates.ok && candidates.data?.length)
          setWaitlistCandidates(candidates.data);
      }
      return true;
    } catch {
      setError("Não foi possível atualizar o status. Tente novamente.");
      return false;
    }
  }

  return (
    <div className="grid gap-3">
      <label
        className={cn(
          "grid gap-2 text-body-sm font-medium",
          detailsStyles.screenOnly,
        )}
      >
        Status do agendamento
        <Select
          value={selectedStatus}
          onValueChange={(to) => {
            setSelection({ from: appointment.status, to });
            setError(undefined);
          }}
          disabled={!canEdit || !options.length || pending || confirming}
          aria-label="Status do agendamento"
          className="h-11 font-medium text-primary"
        >
          <option value={appointment.status}>
            {statusLabel[appointment.status] ?? appointment.status}
          </option>
          {options.map((status) => (
            <option key={status} value={status}>
              {statusLabel[status]}
            </option>
          ))}
        </Select>
      </label>
      <p className={detailsStyles.printOnly}>
        Status: {statusLabel[appointment.status] ?? appointment.status}
      </p>
      <div className="flex items-start gap-2 rounded-lg bg-primary-muted/70 p-3 text-body-sm leading-relaxed text-secondary-foreground">
        <Info
          className="mt-0.5 size-4 shrink-0 text-primary"
          aria-hidden="true"
        />
        <p>
          {appointmentStatusDescriptions[appointment.status] ??
            "Status atual do agendamento."}
          {finishThroughEncounter
            ? " Conclua o prontuário para finalizar o atendimento."
            : startThroughEncounter && appointment.status !== "in_progress"
              ? " Use Iniciar atendimento para abrir a ficha clínica."
              : ""}
        </p>
      </div>
      {canEdit && hasChange ? (
        <Button
          type="button"
          disabled={pending}
          onClick={() => {
            if (destructive || selectedStatus === "attended")
              setConfirming(true);
            else
              startTransition(async () => {
                await applyStatus();
              });
          }}
        >
          {pending ? "Atualizando..." : "Aplicar status"}
        </Button>
      ) : null}
      {error ? (
        <p role="alert" className="text-caption text-destructive">
          {error}
        </p>
      ) : null}
      <ConfirmDialog
        open={confirming && hasChange}
        onClose={() => {
          setConfirming(false);
          setError(undefined);
        }}
        title={
          selectedStatus === "cancelled"
            ? "Cancelar agendamento?"
            : selectedStatus === "no_show"
              ? "Registrar falta?"
              : "Finalizar atendimento?"
        }
        description={
          selectedStatus === "cancelled"
            ? "O agendamento será cancelado e deixará de ocupar este horário."
            : selectedStatus === "no_show"
              ? "O atendimento será marcado como falta no histórico do paciente."
              : "O agendamento será marcado como atendido. Confirme apenas após concluir o atendimento."
        }
        confirmLabel={
          selectedStatus === "cancelled"
            ? "Cancelar agendamento"
            : selectedStatus === "no_show"
              ? "Registrar falta"
              : "Finalizar atendimento"
        }
        pendingLabel="Atualizando..."
        destructive={destructive}
        error={error}
        onConfirm={async () => {
          const success = await applyStatus();
          if (success) setConfirming(false);
          return success;
        }}
      />
      {waitlistCandidates ? (
        <WaitlistSuggestionModal
          candidates={waitlistCandidates}
          slotLabel={formatSlotLabel(appointment.start_at, timeZone)}
          onClose={() => setWaitlistCandidates(null)}
        />
      ) : null}
    </div>
  );
}

function PaymentMethodForm({
  appointmentId,
  paymentMethodId,
  paymentMethods,
}: {
  appointmentId: string;
  paymentMethodId: string | null;
  paymentMethods: AgendaData["paymentMethods"];
}) {
  const boundAction = updateAppointmentPaymentMethod.bind(null, appointmentId);
  const [state, action, pending] = useActionState(boundAction, initialState);

  useEffect(() => {
    if (state.success) toast.success(state.success);
    if (state.error) toast.error(state.error);
  }, [state]);

  return (
    <form
      action={action}
      className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2"
    >
      <label className="grid gap-2 text-sm font-medium">
        <span className="flex items-center gap-2">
          <CreditCard className="size-4 text-primary" aria-hidden="true" />
          Forma de pagamento
        </span>
        <Select
          name="payment_method_id"
          defaultValue={paymentMethodId ?? ""}
          disabled={pending}
          aria-label="Forma de pagamento do agendamento"
          allowEmptyOption
        >
          <option value="">Não selecionada</option>
          {paymentMethods.map((method) => (
            <option key={method.id} value={method.id}>
              {method.name}
            </option>
          ))}
        </Select>
      </label>
      <Button type="submit" variant="secondary" size="lg" disabled={pending}>
        {pending ? "Salvando..." : "Salvar"}
      </Button>
    </form>
  );
}

function StartEncounterForm({
  appointmentId,
  returnTo,
  templates,
  continuing,
}: {
  appointmentId: string;
  returnTo: string;
  templates: AgendaData["clinicalTemplates"];
  continuing: boolean;
}) {
  const boundAction = startAppointmentEncounter.bind(null, appointmentId);
  const [state, action, pending] = useActionState(boundAction, initialState);

  useEffect(() => {
    if (state.error) toast.error(state.error);
  }, [state]);

  return (
    <form
      action={action}
      className="flex flex-col gap-2 sm:flex-row sm:items-end"
    >
      <input type="hidden" name="return_to" value={returnTo} readOnly />
      {continuing ? (
        <div className="min-w-56 rounded-md border border-border bg-muted px-3 py-2">
          <p className="text-sm font-medium">Ficha clínica já criada</p>
          <p className="text-xs text-muted-foreground">
            O conteúdo existente será preservado.
          </p>
          <input type="hidden" name="template_version_id" value="" />
        </div>
      ) : (
        <label className="grid min-w-56 gap-1.5 text-sm font-medium">
          Ficha clínica
          <Select
            name="template_version_id"
            defaultValue={
              templates.find((template) => template.is_default)?.version_id ??
              templates[0]?.version_id ??
              ""
            }
            required
            disabled={pending}
          >
            {!templates.length ? (
              <option value="">Nenhuma ficha disponível</option>
            ) : null}
            {templates.map((template) => (
              <option key={template.version_id} value={template.version_id}>
                {template.name}
              </option>
            ))}
          </Select>
          {!templates.length ? (
            <span className="text-xs font-normal text-destructive">
              Ative uma ficha clínica nas configurações para iniciar.
            </span>
          ) : null}
        </label>
      )}
      <Button
        type="submit"
        disabled={pending || (!continuing && !templates.length)}
      >
        <Stethoscope className="size-4" aria-hidden="true" />
        {pending
          ? continuing
            ? "Abrindo..."
            : "Iniciando..."
          : continuing
            ? "Continuar atendimento"
            : "Iniciar atendimento"}
      </Button>
      {state.error ? (
        <p className="text-sm text-destructive sm:self-center" role="alert">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}

function SummaryItem({
  label,
  value,
  hint,
  icon: Icon,
}: {
  label: string;
  value: React.ReactNode;
  /** Linha de apoio abaixo do valor (ex.: o desconto aplicado). */
  hint?: string | null;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="flex min-w-0 items-start gap-2.5">
      {Icon ? (
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary-muted text-primary">
          <Icon className="size-4" aria-hidden="true" />
        </span>
      ) : null}
      <div className="min-w-0">
        <p className="text-caption text-muted-foreground">{label}</p>
        <p className="mt-1 break-words text-body-sm font-medium">{value}</p>
        {hint ? (
          <p className="mt-0.5 break-words text-xs text-muted-foreground">
            {hint}
          </p>
        ) : null}
      </div>
    </div>
  );
}

// Numa coluna estreita o e-mail quebrava no meio do domínio ("exam|ple.com");
// o <wbr> dá ao navegador um ponto de quebra melhor, logo depois do @, sem
// inserir caractere nenhum no texto copiado.
function EmailText({ email }: { email: string }) {
  const at = email.lastIndexOf("@");
  if (at === -1) return email;
  return (
    <>
      {email.slice(0, at + 1)}
      <wbr />
      {email.slice(at + 1)}
    </>
  );
}

function formatMoney(value: number | string) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number(value));
}

/** Conta a diferença entre o preço de tabela e o cobrado, com o motivo quando
    houver — é o que transforma "R$ 360" em "R$ 360, com R$ 40 de desconto". */
function appointmentPriceHint(appointment: {
  price?: number | string | null;
  list_price?: number | string | null;
  price_note?: string | null;
}) {
  const price = Number(appointment.price ?? 0);
  const listPrice = Number(appointment.list_price ?? 0);
  const difference = listPrice - price;
  if (!listPrice || Math.abs(difference) < 0.01) {
    return appointment.price_note ?? null;
  }
  const label =
    difference > 0
      ? `${formatMoney(difference)} de desconto sobre ${formatMoney(listPrice)}`
      : `${formatMoney(-difference)} acima da tabela de ${formatMoney(listPrice)}`;
  return appointment.price_note
    ? `${label} · ${appointment.price_note}`
    : label;
}

/**
 * Ajuste de valor do agendamento já criado, no mesmo formato do campo de forma
 * de pagamento ao lado: mostra, deixa corrigir e salva ali mesmo.
 */
function AppointmentPriceForm({
  appointmentId,
  price,
  listPrice,
  priceNote,
  onSaved,
}: {
  appointmentId: string;
  price: number | string | null;
  listPrice: number | string | null;
  priceNote: string | null;
  onSaved?: () => void;
}) {
  const boundAction = async (
    previousState: AgendaActionState,
    formData: FormData,
  ) => {
    const result = await updateAppointmentPrice(
      appointmentId,
      previousState,
      formData,
    );
    if (result.success) {
      toast.success(result.success);
      onSaved?.();
    }
    return result;
  };
  const [state, action, pending] = useActionState(boundAction, initialState);

  useEffect(() => {
    if (state.error) toast.error(state.error);
  }, [state]);

  const currentPrice =
    price === null ? "" : Number(price).toFixed(2).replace(".", ",");
  const tableLabel =
    listPrice === null || Number(listPrice) <= 0
      ? null
      : `Preço de tabela: ${formatMoney(listPrice)}`;

  return (
    <form
      action={action}
      className="grid gap-3 rounded-lg border border-border bg-muted/20 p-3"
    >
      <label className="grid gap-2 text-sm font-medium">
        Valor do agendamento
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">R$</span>
          <Input
            name="price"
            inputMode="decimal"
            defaultValue={currentPrice}
            aria-label="Valor do agendamento"
            className="text-right tabular-nums"
          />
        </div>
      </label>
      <label className="grid gap-2 text-sm font-medium">
        Motivo do ajuste
        <Input
          name="price_note"
          defaultValue={priceNote ?? ""}
          maxLength={200}
          placeholder={tableLabel ?? "Ex.: valor combinado."}
        />
      </label>
      <Button type="submit" variant="secondary" size="lg" disabled={pending}>
        {pending ? "Salvando..." : "Salvar"}
      </Button>
    </form>
  );
}

function handleAppointmentCardKeyDown(
  event: React.KeyboardEvent<HTMLElement>,
  onSelect?: () => void,
) {
  if (!onSelect) return;
  if (event.key !== "Enter" && event.key !== " ") return;
  event.preventDefault();
  onSelect();
}

function BlockCard({
  block,
  schedule,
  compact,
}: {
  block: AgendaData["blocks"][number];
  schedule?: AgendaData["schedules"][number];
  compact?: boolean;
}) {
  const timeZone = useAgendaTimeZone();
  return (
    <div className="min-w-0 overflow-hidden rounded-lg border border-dashed border-border bg-muted/40 p-3">
      <div className="flex min-w-0 items-center gap-2">
        <Ban
          className="size-4 shrink-0 text-muted-foreground"
          aria-hidden="true"
        />
        <p className="truncate text-xs font-semibold tabular-nums">
          {formatTime(block.start_at, timeZone)}-
          {formatTime(block.end_at, timeZone)}
        </p>
      </div>
      {!compact ? (
        <p className="mt-1 text-xs text-muted-foreground">
          {block.reason || schedule?.name || "Horário bloqueado"}
        </p>
      ) : null}
    </div>
  );
}

function EmptyAgendaBlock({ text }: { text: string }) {
  return (
    <div className="flex min-h-28 items-center justify-center rounded-lg border border-dashed border-border bg-muted/20 px-3 text-center text-sm text-muted-foreground">
      {text}
    </div>
  );
}

function ScheduleBlockForm({
  data,
  floatingTrigger = false,
  onTrigger,
  triggerTabIndex,
}: {
  data: AgendaData;
  floatingTrigger?: boolean;
  onTrigger?: () => void;
  triggerTabIndex?: number;
}) {
  const [open, setOpen] = useState(false);
  const initial = defaultAppointmentDateTime(data.timeZone, data.selectedDate);
  const initialStart = parseLocalDateTimeForUi(
    initial.date,
    initial.time,
    data.timeZone,
  );
  const initialEnd = initialStart
    ? localDateTimeParts(
        new Date(initialStart.getTime() + 60 * 60_000),
        data.timeZone,
      )
    : { date: initial.date, time: "09:00" };
  const [scheduleId, setScheduleId] = useState("");
  const [startDate, setStartDate] = useState(initial.date);
  const [startTime, setStartTime] = useState(initial.time);
  const [endDate, setEndDate] = useState(initialEnd.date);
  const [endTime, setEndTime] = useState(initialEnd.time);
  const [allDay, setAllDay] = useState(false);
  const normalizedStartTime = normalizeTimeValue(startTime);
  const normalizedEndTime = normalizeTimeValue(endTime);
  const nextDate = startDate
    ? dateKey(addDays(localDateFromKey(startDate), 1))
    : "";
  const startValue = startDate
    ? `${startDate}T${allDay ? "00:00" : normalizedStartTime}`
    : "";
  const endValue = allDay
    ? nextDate
      ? `${nextDate}T00:00`
      : ""
    : endDate
      ? `${endDate}T${normalizedEndTime}`
      : "";
  const parsedStart = parseLocalDateTimeForUi(
    startDate,
    allDay ? "00:00" : normalizedStartTime,
    data.timeZone,
  );
  const parsedEnd = parseLocalDateTimeForUi(
    allDay ? nextDate : endDate,
    allDay ? "00:00" : normalizedEndTime,
    data.timeZone,
  );
  const validRange = Boolean(
    scheduleId && parsedStart && parsedEnd && parsedEnd > parsedStart,
  );

  const submitBlock = useCallback(
    async (previousState: AgendaActionState, formData: FormData) => {
      const result = await createScheduleBlock(previousState, formData);
      if (result.success) {
        toast.success(result.success);
        setOpen(false);
      }
      return result;
    },
    [],
  );
  const [state, action, pending] = useActionState(submitBlock, initialState);

  function keepEndAfterStart(nextDateValue: string, nextTimeValue: string) {
    const nextStart = parseLocalDateTimeForUi(
      nextDateValue,
      normalizeTimeValue(nextTimeValue),
      data.timeZone,
    );
    const currentEnd = parseLocalDateTimeForUi(
      endDate,
      normalizedEndTime,
      data.timeZone,
    );
    if (!nextStart || (currentEnd && currentEnd > nextStart)) return;
    const nextEnd = localDateTimeParts(
      new Date(nextStart.getTime() + 60 * 60_000),
      data.timeZone,
    );
    setEndDate(nextEnd.date);
    setEndTime(nextEnd.time);
  }

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        tabIndex={triggerTabIndex}
        onClick={() => {
          setOpen(true);
          onTrigger?.();
        }}
        className={
          floatingTrigger
            ? "h-11 rounded-full px-4 shadow-[var(--shadow-hover)]"
            : undefined
        }
      >
        <Ban className="size-4" aria-hidden="true" />
        Bloquear horário
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Bloquear horário"
        description="O bloqueio vale para a agenda interna e para o agendamento online."
        className="max-w-3xl"
      >
        <form
          action={action}
          className="grid min-w-0 gap-4"
          aria-busy={pending}
        >
          <label className="grid min-w-0 gap-2 text-sm font-medium">
            Agenda
            <Select
              name="schedule_id"
              required
              value={scheduleId}
              onValueChange={setScheduleId}
            >
              <option value="">Selecione</option>
              {data.schedules.map((schedule) => (
                <option key={schedule.id} value={schedule.id}>
                  {schedule.name}
                </option>
              ))}
            </Select>
          </label>

          <Checkbox
            checked={allDay}
            onChange={(event) => setAllDay(event.target.checked)}
            label="Bloquear o dia inteiro"
          />

          <input type="hidden" name="start_at" value={startValue} readOnly />
          <input type="hidden" name="end_at" value={endValue} readOnly />

          <div
            className={cn("grid min-w-0 gap-4", allDay ? "" : "md:grid-cols-2")}
          >
            <label className="grid min-w-0 content-start gap-2 text-sm font-medium">
              {allDay ? "Dia do bloqueio" : "Início do bloqueio"}
              <div className="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_5rem]">
                <DatePickerInput
                  name="block_start_date"
                  value={startDate}
                  onValueChange={(value) => {
                    setStartDate(value);
                    keepEndAfterStart(value, normalizedStartTime);
                  }}
                  required
                  ariaLabel="Início do bloqueio: data"
                  className="min-w-0"
                  todayValue={localDateKey(
                    new Date().toISOString(),
                    data.timeZone,
                  )}
                />
                {!allDay ? (
                  <TimeTextInput
                    value={startTime}
                    onChange={setStartTime}
                    onBlur={() => {
                      setStartTime(normalizedStartTime);
                      keepEndAfterStart(startDate, normalizedStartTime);
                    }}
                    ariaLabel="Início do bloqueio: horário"
                  />
                ) : null}
              </div>
            </label>

            {!allDay ? (
              <label className="grid min-w-0 content-start gap-2 text-sm font-medium">
                Fim do bloqueio
                <div className="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_5rem]">
                  <DatePickerInput
                    name="block_end_date"
                    value={endDate}
                    onValueChange={setEndDate}
                    required
                    ariaLabel="Fim do bloqueio: data"
                    className="min-w-0"
                    panelAlign="end"
                    todayValue={localDateKey(
                      new Date().toISOString(),
                      data.timeZone,
                    )}
                  />
                  <TimeTextInput
                    value={endTime}
                    onChange={setEndTime}
                    onBlur={() => setEndTime(normalizedEndTime)}
                    ariaLabel="Fim do bloqueio: horário"
                  />
                </div>
              </label>
            ) : null}
          </div>

          <label className="grid gap-2 text-sm font-medium">
            Motivo
            <Input
              name="reason"
              maxLength={300}
              placeholder="Ex.: reunião, férias ou almoço"
            />
          </label>

          {!validRange && scheduleId ? (
            <p className="text-sm text-destructive">
              O fim do bloqueio deve ser posterior ao início.
            </p>
          ) : null}
          {state.error ? (
            <p className="text-sm text-destructive">{state.error}</p>
          ) : null}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setOpen(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={pending || !validRange}>
              {pending ? "Bloqueando..." : "Bloquear horário"}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}

function AppointmentForm({
  data,
  canExtra,
  canCreatePatient,
  floatingTrigger = false,
  onTrigger,
  triggerTabIndex,
}: {
  data: AgendaData;
  canExtra: boolean;
  canCreatePatient: boolean;
  floatingTrigger?: boolean;
  onTrigger?: () => void;
  triggerTabIndex?: number;
}) {
  const [open, setOpen] = useState(false);

  // O formulário em si é o componente compartilhado: o mesmo que o painel de
  // contato do atendimento abre. Aqui fica só o gatilho.
  return (
    <>
      <Button
        type="button"
        tabIndex={triggerTabIndex}
        onClick={() => {
          setOpen(true);
          onTrigger?.();
        }}
        className={
          floatingTrigger
            ? "h-11 rounded-full px-4 shadow-[var(--shadow-hover)]"
            : undefined
        }
      >
        <Plus className="size-4" aria-hidden="true" />
        Novo agendamento
      </Button>
      <AppointmentFormModal
        open={open}
        onClose={() => setOpen(false)}
        data={data}
        canExtra={canExtra}
        canCreatePatient={canCreatePatient}
      />
    </>
  );
}

function DateTimeField({
  name,
  label,
  defaultValue,
  required,
  className,
}: {
  name: string;
  label: string;
  defaultValue?: string;
  required?: boolean;
  className?: string;
}) {
  const timeZone = useAgendaTimeZone();
  const parsed = splitDateTimeValue(defaultValue, timeZone);
  const [date, setDate] = useState(parsed.date);
  const [hour, setHour] = useState(parsed.hour);
  const [minute, setMinute] = useState(parsed.minute);
  const normalizedHour = normalizeTimePart(hour, 23);
  const normalizedMinute = normalizeTimePart(minute, 59);
  const value = date ? `${date}T${normalizedHour}:${normalizedMinute}` : "";

  return (
    <label className={`grid gap-2 text-sm font-medium ${className ?? ""}`}>
      {label}
      <input type="hidden" name={name} value={value} />
      <div className="grid gap-2 sm:grid-cols-[minmax(12rem,1fr)_5.5rem_5.5rem]">
        <DatePickerInput
          name={`${name}_date`}
          value={date}
          onValueChange={setDate}
          required={required}
          ariaLabel={`${label}: data`}
          className="w-full"
          todayValue={localDateKey(new Date().toISOString(), timeZone)}
        />
        <TimeInput
          value={hour}
          onChange={setHour}
          onBlur={() => setHour(normalizedHour)}
          max={23}
          ariaLabel={`${label}: hora`}
        />
        <TimeInput
          value={minute}
          onChange={setMinute}
          onBlur={() => setMinute(normalizedMinute)}
          max={59}
          ariaLabel={`${label}: minuto`}
        />
      </div>
    </label>
  );
}

function TimeInput({
  value,
  onChange,
  onBlur,
  max,
  ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  onBlur: () => void;
  max: number;
  ariaLabel: string;
}) {
  return (
    <Input
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      value={value}
      onChange={(event) =>
        onChange(event.target.value.replace(/\D/g, "").slice(0, 2))
      }
      onBlur={onBlur}
      aria-label={ariaLabel}
      maxLength={2}
      placeholder={max === 23 ? "hh" : "mm"}
      className="w-full text-center tabular-nums"
    />
  );
}

function TimeTextInput({
  value,
  onChange,
  onBlur,
  ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  onBlur: () => void;
  ariaLabel: string;
}) {
  return (
    <Input
      type="text"
      inputMode="numeric"
      value={value}
      onChange={(event) => onChange(formatPartialTime(event.target.value))}
      onBlur={onBlur}
      aria-label={ariaLabel}
      placeholder="hh:mm"
      maxLength={5}
      className="w-20 text-center tabular-nums"
    />
  );
}

function StatusActions({
  appointmentId,
  status,
  startAt,
  hideInProgressAction = false,
  hideAttendedAction = false,
  fullLabels = false,
}: {
  appointmentId: string;
  status: string;
  startAt: string;
  hideInProgressAction?: boolean;
  hideAttendedAction?: boolean;
  /** No rodapé do modal, "Cancelar" sozinho lê como "fechar a janela" e
      "Faltou" descreve em vez de agir: lá os botões dizem o que fazem. Nos
      cards da grade não há espaço. */
  fullLabels?: boolean;
}) {
  if (["attended", "no_show", "cancelled"].includes(status)) return null;
  const cancelLabel = fullLabels ? "Cancelar agendamento" : "Cancelar";
  const noShowLabel = fullLabels ? "Registrar falta" : "Faltou";
  const actions =
    status === "scheduled"
      ? [
          ["confirmed", "Confirmar", Check],
          ["cancelled", cancelLabel, X],
        ]
      : status === "confirmed"
        ? [
            ["waiting", "Check-in", UserCheck],
            ["cancelled", cancelLabel, X],
          ]
        : status === "waiting"
          ? [
              ["in_progress", "Iniciar", Clock3],
              ["no_show", noShowLabel, X],
            ]
          : [["attended", "Finalizar", Check]];
  const visibleActions = actions.filter(
    ([next]) =>
      !(hideInProgressAction && next === "in_progress") &&
      !(hideAttendedAction && next === "attended"),
  );
  return (
    <div className="flex flex-wrap justify-end gap-2">
      <RescheduleForm appointmentId={appointmentId} startAt={startAt} />
      {visibleActions.map(([next, label, Icon]) => (
        <StatusActionForm
          key={String(next)}
          appointmentId={appointmentId}
          startAt={startAt}
          nextStatus={String(next)}
          label={String(label)}
          icon={typeof Icon === "string" ? undefined : Icon}
          destructive={next === "cancelled" || next === "no_show"}
          requiresConfirmation={
            next === "cancelled" || next === "no_show" || next === "attended"
          }
        />
      ))}
    </div>
  );
}

function StatusActionForm({
  appointmentId,
  startAt,
  destructive,
  icon: Icon,
  label,
  nextStatus,
  requiresConfirmation,
}: {
  appointmentId: string;
  startAt: string;
  destructive: boolean;
  icon?: React.ComponentType<{ className?: string }>;
  label: string;
  nextStatus: string;
  requiresConfirmation: boolean;
}) {
  const timeZone = useAgendaTimeZone();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const [waitlistCandidates, setWaitlistCandidates] = useState<
    WaitlistCandidate[] | null
  >(null);

  async function updateStatus() {
    setError(undefined);
    const result = await changeAppointmentStatus(
      appointmentId,
      nextStatus,
      initialState,
    );
    if (result.error) {
      setError(result.error);
      toast.error(result.error);
      return false;
    }
    if (result.success) toast.success(result.success);

    // Cancelamento e falta abrem um horário. É aqui que a fila de espera deixa
    // de ser um caderno que ninguém abre: quem cabe naquele horário aparece
    // sozinho, sem depender de alguém lembrar de conferir.
    if (nextStatus === "cancelled" || nextStatus === "no_show") {
      const candidates =
        await loadWaitlistCandidatesForAppointment(appointmentId);
      if (candidates.ok && candidates.data?.length) {
        setWaitlistCandidates(candidates.data);
      }
    }
    return true;
  }

  function closeConfirmation() {
    setConfirming(false);
    setError(undefined);
  }

  const waitlistSuggestion = waitlistCandidates ? (
    <WaitlistSuggestionModal
      candidates={waitlistCandidates}
      slotLabel={formatSlotLabel(startAt, timeZone)}
      onClose={() => setWaitlistCandidates(null)}
    />
  ) : null;

  if (requiresConfirmation) {
    const isFinalizing = nextStatus === "attended";
    return (
      <>
        <Button
          type="button"
          size="sm"
          variant={destructive ? "destructive-ghost" : "primary"}
          disabled={pending}
          onClick={() => setConfirming(true)}
        >
          {Icon ? <Icon className="size-3.5" aria-hidden="true" /> : null}
          {label}
        </Button>
        <ConfirmDialog
          open={confirming}
          onClose={closeConfirmation}
          title={
            isFinalizing
              ? "Finalizar atendimento?"
              : nextStatus === "cancelled"
                ? "Cancelar agendamento?"
                : "Registrar falta?"
          }
          description={
            isFinalizing
              ? "O agendamento será marcado como atendido. Confirme apenas após concluir o atendimento."
              : nextStatus === "cancelled"
                ? "O agendamento será cancelado e deixará de ocupar este horário."
                : "O atendimento será marcado como falta no histórico do paciente."
          }
          confirmLabel={
            isFinalizing
              ? "Finalizar atendimento"
              : nextStatus === "cancelled"
                ? "Cancelar agendamento"
                : "Registrar falta"
          }
          pendingLabel="Atualizando..."
          destructive={destructive}
          error={error}
          onConfirm={updateStatus}
        />
        {waitlistSuggestion}
      </>
    );
  }

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="primary"
        disabled={pending}
        onClick={() => {
          startTransition(async () => {
            await updateStatus();
          });
        }}
      >
        {Icon ? <Icon className="size-3.5" /> : null}
        {pending ? "Atualizando..." : label}
      </Button>
      {waitlistSuggestion}
    </>
  );
}

function WaitlistEntryTrigger({
  canCreatePatient,
  triggerTabIndex,
  onTrigger,
}: {
  canCreatePatient: boolean;
  triggerTabIndex: number;
  onTrigger: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        tabIndex={triggerTabIndex}
        onClick={() => {
          setOpen(true);
          onTrigger();
        }}
        className="h-11 rounded-full px-4 shadow-[var(--shadow-hover)]"
      >
        <ListPlus className="size-4" aria-hidden="true" />
        Fila de espera
      </Button>
      {open ? (
        <AddToWaitlistModal
          canCreatePatient={canCreatePatient}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

function formatSlotLabel(startAt: string, timeZone: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone,
  }).format(new Date(startAt));
}

function RescheduleForm({
  appointmentId,
  startAt,
}: {
  appointmentId: string;
  startAt: string;
}) {
  const [open, setOpen] = useState(false);
  const boundAction = rescheduleAppointment.bind(null, appointmentId);
  const [state, action, pending] = useActionState(boundAction, initialState);
  useEffect(() => {
    if (state.success) toast.success(state.success);
  }, [state]);
  if (!open)
    return (
      <Button
        type="button"
        size="sm"
        variant="ghost"
        onClick={() => setOpen(true)}
      >
        <CalendarClock className="size-3.5" />
        Remarcar
      </Button>
    );
  return (
    <Card className="fixed inset-x-4 top-28 z-50 mx-auto max-w-md text-left shadow-[var(--shadow-lg)]">
      <CardHeader className="flex flex-row items-center justify-between">
        <h2 className="font-semibold">Remarcar atendimento</h2>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Fechar remarcação"
          onClick={() => setOpen(false)}
        >
          <X className="size-4" aria-hidden="true" />
        </Button>
      </CardHeader>
      <CardContent>
        <form action={action} className="grid gap-4">
          <DateTimeField
            name="start_at"
            label="Nova data e hora"
            defaultValue={startAt}
            required
          />
          {state.error ? (
            <p className="text-sm text-destructive">{state.error}</p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setOpen(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Salvando..." : "Confirmar remarcação"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function localDateKey(value: string, timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
  }).format(new Date(value));
}

function localDateFromKey(value: string) {
  return new Date(`${value}T12:00:00Z`);
}

function dateKey(value: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "UTC",
  }).format(value);
}

// O react-day-picker trabalha com datas no fuso do navegador, então o par
// abaixo converte para/de chave `yyyy-MM-dd` sem passar por UTC (o que
// deslocaria o dia em fusos negativos).
function calendarDateFromKey(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day, 12);
}

function calendarKeyFromDate(value: Date) {
  return [
    String(value.getFullYear()).padStart(4, "0"),
    String(value.getMonth() + 1).padStart(2, "0"),
    String(value.getDate()).padStart(2, "0"),
  ].join("-");
}

function sameDayOfMonth(month: Date, day: number) {
  const lastDay = new Date(
    month.getFullYear(),
    month.getMonth() + 1,
    0,
  ).getDate();
  return calendarKeyFromDate(
    new Date(month.getFullYear(), month.getMonth(), Math.min(day, lastDay), 12),
  );
}

function calendarWeekdayLabel(value: Date) {
  return new Intl.DateTimeFormat("pt-BR", { weekday: "short" })
    .format(value)
    .replace(".", "");
}

function addDays(value: Date, days: number) {
  const next = new Date(value);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function weekStart(value: Date) {
  const next = new Date(value);
  const day = next.getUTCDay();
  const offset = day === 0 ? -6 : 1 - day;
  next.setUTCDate(next.getUTCDate() + offset);
  return next;
}

function weekDays(date: string) {
  const start = weekStart(localDateFromKey(date));
  return Array.from({ length: 7 }, (_, index) => addDays(start, index));
}

function monthDays(date: string) {
  const base = localDateFromKey(date);
  const lastDay = new Date(
    Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 0),
  ).getUTCDate();
  return Array.from(
    { length: lastDay },
    (_, index) =>
      new Date(
        Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), index + 1, 12),
      ),
  );
}

function dateInView(
  itemDate: string,
  selectedDate: string,
  view: "day" | "week" | "month",
) {
  if (view === "day") return itemDate === selectedDate;

  const item = localDateFromKey(itemDate);
  const selected = localDateFromKey(selectedDate);
  if (view === "month") {
    return (
      item.getUTCFullYear() === selected.getUTCFullYear() &&
      item.getUTCMonth() === selected.getUTCMonth()
    );
  }

  const start = weekStart(selected);
  const end = addDays(start, 7);
  return item >= start && item < end;
}

function groupByLocalDay(items: AgendaData["appointments"], timeZone: string) {
  const grouped = new Map<string, AgendaData["appointments"]>();
  for (const item of items) {
    const key = localDateKey(item.start_at, timeZone);
    grouped.set(key, [...(grouped.get(key) ?? []), item]);
  }
  for (const [key, values] of grouped) {
    grouped.set(
      key,
      values.sort(
        (a, b) =>
          new Date(a.start_at).getTime() - new Date(b.start_at).getTime(),
      ),
    );
  }
  return grouped;
}

function groupBlocksByLocalDay(items: AgendaData["blocks"], timeZone: string) {
  const grouped = new Map<string, AgendaData["blocks"]>();
  for (const item of items) {
    const key = localDateKey(item.start_at, timeZone);
    grouped.set(key, [...(grouped.get(key) ?? []), item]);
  }
  return grouped;
}

function formatRangeLabel(date: string, view: "day" | "week" | "month") {
  const base = localDateFromKey(date);
  if (view === "day") {
    return new Intl.DateTimeFormat("pt-BR", {
      weekday: "long",
      day: "2-digit",
      month: "short",
      timeZone: "UTC",
    }).format(base);
  }
  if (view === "month") {
    return new Intl.DateTimeFormat("pt-BR", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }).format(base);
  }
  const start = weekStart(base);
  const end = addDays(start, 6);
  const startYear = start.getUTCFullYear();
  const endYear = end.getUTCFullYear();
  return `${formatDayMonth(dateKey(start))}${startYear !== endYear ? ` ${startYear}` : ""} – ${formatDayMonth(dateKey(end))} ${endYear}`;
}

function weekdayShort(value: Date) {
  return new Intl.DateTimeFormat("pt-BR", {
    weekday: "short",
    timeZone: "UTC",
  })
    .format(value)
    .replace(".", "");
}

function weekdayLong(value: Date) {
  const label = new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    timeZone: "UTC",
  })
    .format(value)
    .split("-")[0];
  return `${label.charAt(0).toUpperCase()}${label.slice(1)}`;
}

function formatDayMonth(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
  })
    .format(localDateFromKey(value))
    .replace(".", "");
}

function formatFullDay(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    timeZone: "UTC",
  }).format(localDateFromKey(value));
}

function formatTime(value: string, timeZone: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  }).format(new Date(value));
}

function getWeekTimelineRange(
  days: Date[],
  appointmentsByDay: Map<string, AgendaData["appointments"]>,
  blocksByDay: Map<string, AgendaData["blocks"]>,
  timeZone: string,
) {
  let startMinute = 8 * 60;
  let endMinute = 18 * 60 + 30;

  for (const day of days) {
    const key = dateKey(day);
    const appointments = appointmentsByDay.get(key) ?? [];
    const blocks = blocksByDay.get(key) ?? [];
    const entries = [
      ...appointments.map((item) => ({
        startAt: item.start_at,
        endAt: item.end_at,
      })),
      ...blocks.map((item) => ({ startAt: item.start_at, endAt: item.end_at })),
    ];

    for (const entry of entries) {
      const start = minutesOfLocalDay(new Date(entry.startAt), timeZone);
      const duration = Math.max(
        15,
        (new Date(entry.endAt).getTime() - new Date(entry.startAt).getTime()) /
          60_000,
      );
      const end = start + duration;
      startMinute = Math.min(
        startMinute,
        floorToStep(start, weekTimelineStepMinutes),
      );
      endMinute = Math.max(endMinute, ceilToStep(end, weekTimelineStepMinutes));
    }
  }

  return {
    startMinute: Math.max(0, startMinute),
    endMinute: Math.min(24 * 60, Math.max(endMinute, startMinute + 4 * 60)),
  };
}

function localIntervalIntersectsMinuteRange(
  startAt: string,
  endAt: string,
  rangeStartMinute: number,
  rangeEndMinute: number,
  timeZone: string,
) {
  const startMinute = minutesOfLocalDay(new Date(startAt), timeZone);
  const durationMinutes = Math.max(
    15,
    (new Date(endAt).getTime() - new Date(startAt).getTime()) / 60_000,
  );
  const endMinute = startMinute + durationMinutes;

  return startMinute < rangeEndMinute && endMinute > rangeStartMinute;
}

function buildTimelineSlots(startMinute: number, endMinute: number) {
  const slots = [];
  for (
    let minute = startMinute;
    minute <= endMinute;
    minute += weekTimelineStepMinutes
  ) {
    slots.push({
      minute,
      label: minutesToTimeLabel(minute),
      top:
        ((minute - startMinute) / weekTimelineStepMinutes) *
        weekTimelineRowHeight,
    });
  }
  return slots;
}

function layoutTimedWeekItems({
  appointments,
  blocks,
  startMinute,
  timeZone,
}: {
  appointments: AgendaData["appointments"];
  blocks: AgendaData["blocks"];
  startMinute: number;
  timeZone: string;
}) {
  const items: TimedWeekItem[] = [
    ...appointments.map((appointment) => {
      const startAt = new Date(appointment.start_at);
      const endAt = new Date(appointment.end_at);
      return buildTimedWeekItem({
        id: appointment.id,
        type: "appointment" as const,
        appointment,
        startAt,
        endAt,
        startMinute,
        timeZone,
      });
    }),
    ...blocks.map((block) => {
      const startAt = new Date(block.start_at);
      const endAt = new Date(block.end_at);
      return buildTimedWeekItem({
        id: block.id,
        type: "block" as const,
        block,
        startAt,
        endAt,
        startMinute,
        timeZone,
      });
    }),
  ].sort((a, b) => a.startAt.getTime() - b.startAt.getTime());

  let group: TimedWeekItem[] = [];
  let groupEndTime = 0;

  for (const item of items) {
    if (!group.length || item.startAt.getTime() < groupEndTime) {
      group.push(item);
      groupEndTime = Math.max(groupEndTime, item.endAt.getTime());
      continue;
    }

    assignTimelineLanes(group);
    group = [item];
    groupEndTime = item.endAt.getTime();
  }

  if (group.length) assignTimelineLanes(group);

  return items;
}

function buildTimedWeekItem(
  input:
    | {
        id: string;
        type: "appointment";
        appointment: AgendaData["appointments"][number];
        startAt: Date;
        endAt: Date;
        startMinute: number;
        timeZone: string;
      }
    | {
        id: string;
        type: "block";
        block: AgendaData["blocks"][number];
        startAt: Date;
        endAt: Date;
        startMinute: number;
        timeZone: string;
      },
): TimedWeekItem {
  const localStart = minutesOfLocalDay(input.startAt, input.timeZone);
  const durationMinutes = Math.max(
    15,
    (input.endAt.getTime() - input.startAt.getTime()) / 60_000,
  );
  const top =
    ((localStart - input.startMinute) / weekTimelineStepMinutes) *
    weekTimelineRowHeight;
  const height = Math.max(
    24,
    (durationMinutes / weekTimelineStepMinutes) * weekTimelineRowHeight - 2,
  );

  return {
    ...input,
    lane: 0,
    laneCount: 1,
    top,
    height,
  };
}

function assignTimelineLanes(group: TimedWeekItem[]) {
  let active: Array<{ lane: number; endAt: Date }> = [];
  let laneCount = 1;

  for (const item of group) {
    active = active.filter((candidate) => candidate.endAt > item.startAt);
    const used = new Set(active.map((candidate) => candidate.lane));
    let lane = 0;
    while (used.has(lane)) lane += 1;
    item.lane = lane;
    laneCount = Math.max(laneCount, lane + 1);
    active.push({ lane, endAt: item.endAt });
  }

  for (const item of group) {
    item.laneCount = laneCount;
  }
}

function minutesOfLocalDay(value: Date, timeZone: string) {
  const [, time = "00:00"] = value
    .toLocaleString("sv-SE", { timeZone })
    .split(" ");
  const [hour = "0", minute = "0"] = time.split(":");
  return Number(hour) * 60 + Number(minute);
}

function minutesToTimeLabel(value: number) {
  const hour = Math.floor(value / 60);
  const minute = value % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function floorToStep(value: number, step: number) {
  return Math.floor(value / step) * step;
}

function ceilToStep(value: number, step: number) {
  return Math.ceil(value / step) * step;
}

function defaultAppointmentDateTime(timeZone: string, selectedDate: string) {
  const roundedNow = localDateTimeParts(
    roundDateToStep(new Date(), 15),
    timeZone,
  );
  return roundedNow.date === selectedDate
    ? roundedNow
    : { date: selectedDate, time: "08:00" };
}

function formatPartialTime(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}:${digits.slice(2)}`;
}

function normalizeTimeValue(value: string) {
  const parts = value.split(":");
  const digits = value.replace(/\D/g, "").slice(0, 4);
  const hourSource = value.includes(":")
    ? parts[0]
    : digits.length <= 2
      ? digits
      : digits.slice(0, 2);
  const minuteSource = value.includes(":")
    ? parts[1]
    : digits.length > 2
      ? digits.slice(2, 4)
      : "00";
  const hour = normalizeTimePart(hourSource || "0", 23);
  const minute = normalizeTimePart(minuteSource || "0", 59);
  return `${hour}:${minute}`;
}

// Todos os horários de início livres do dia para aquela agenda, no passo de
// cada janela de atendimento e já descontando a duração do procedimento, os
// agendamentos existentes e os bloqueios. Fora da faixa carregada pela agenda
// devolve vazio: sem os agendamentos daquele dia em mãos, oferecer horário
// "livre" seria chute.
function roundDateToStep(value: Date, stepMinutes: number) {
  const stepMs = Math.max(stepMinutes, 1) * 60_000;
  return new Date(Math.ceil(value.getTime() / stepMs) * stepMs);
}

function parseLocalDateTimeForUi(date: string, time: string, timeZone: string) {
  const parsed = fromZonedTime(
    `${date}T${normalizeTimeValue(time)}:00`,
    timeZone,
  );
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function localDateTimeParts(value: Date, timeZone: string) {
  const [date, time = "00:00"] = value
    .toLocaleString("sv-SE", { timeZone })
    .split(" ");
  return { date, time: time.slice(0, 5) };
}

function formatDateTimeInput(value: string, timeZone: string) {
  return new Date(value)
    .toLocaleString("sv-SE", { timeZone })
    .replace(" ", "T")
    .slice(0, 16);
}

function normalizeTimePart(value: string, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "00";
  return String(Math.min(Math.max(Math.trunc(parsed), 0), max)).padStart(
    2,
    "0",
  );
}

function splitDateTimeValue(value: string | undefined, timeZone: string) {
  if (!value) {
    return { date: "", hour: "08", minute: "00" };
  }

  const [date = "", time = ""] = formatDateTimeInput(value, timeZone).split(
    "T",
  );
  const [hour = "08", minute = "00"] = time.split(":");

  return {
    date,
    hour: normalizeTimePart(hour, 23),
    minute: normalizeTimePart(minute, 59),
  };
}
