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
  CalendarDots as CalendarDays,
  CaretLeft as ChevronLeft,
  CaretRight as ChevronRight,
  Check,
  Clock as Clock3,
  FileText,
  EnvelopeSimple as Mail,
  Phone,
  Plus,
  ArrowsClockwise as RefreshCw,
  MagnifyingGlass as Search,
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
  rescheduleAppointment,
  startAppointmentEncounter,
  type AgendaActionState,
  updateAppointmentPaymentMethod,
} from "./actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { AppointmentFormModal } from "@/components/agenda/appointment-form-modal";
import { Input, MultiSelect, Select } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { DatePickerInput } from "@/components/ui/date-picker-input";
import { ConfirmDialog } from "@/components/ui/dialog";
import { PageHeader } from "@/components/ui/page-header";
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
  procedures: Array<{ id: string; name: string; duration_minutes: number }>;
  insurances: Option[];
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
const weekTimelineRowHeight = 40;
const statusLabel: Record<string, string> = {
  scheduled: "Agendado",
  confirmed: "Confirmado",
  waiting: "Aguardando",
  in_progress: "Em atendimento",
  attended: "Atendido",
  no_show: "Faltou",
  cancelled: "Cancelado",
};
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
        <PageHeader
          icon={CalendarDays}
          title="Agenda"
          description="Operação diária da recepção e dos profissionais."
        />

        <AgendaCalendarView
          data={data}
          date={initialDate}
          view={initialView}
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
      className="fixed bottom-6 right-[calc(1.5rem+var(--today-rail-offset,0rem))] z-50 flex flex-col items-end gap-3 transition-[right] duration-[var(--motion-drawer)] ease-[var(--ease-out)]"
    >
      <div
        id={menuId}
        aria-hidden={!expanded}
        className={cn(
          "flex origin-bottom flex-col items-end gap-2 transition-[opacity,transform] duration-[var(--motion-normal)] ease-[var(--ease-out)]",
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
  canEdit,
  canViewPatient,
  canViewClinical,
  canStartEncounter,
}: {
  data: AgendaData;
  date: string;
  view: AgendaView;
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
    <div className="grid min-w-0 gap-4 xl:grid-cols-[17rem_minmax(0,1fr)] xl:items-start">
      <AgendaSidebar
        date={date}
        dayCounts={data.dayCounts}
        open={sidebarOpen}
        canClear={activeFilterCount > 0 || patientQuery.trim().length > 0}
        onClearFilters={clearFilters}
        onSelectDate={(nextDate) => navigateAgenda(nextDate, view)}
      >
        <FilterField label="Status">
          <MultiSelect
            value={statusValues}
            onValueChange={setStatusValues}
            allLabel="Todos"
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
            allLabel="Todos"
            aria-label="Filtrar profissionais"
            options={data.professionals.map((item) => ({
              value: item.id,
              label: item.name,
            }))}
          />
        </FilterField>
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
      </AgendaSidebar>

      <div className="order-1 grid min-w-0 gap-4 xl:order-2">
        <Card
          aria-busy={navigationPending}
          className="bg-card/95 shadow-[var(--shadow-hover)] backdrop-blur md:sticky md:top-[calc(var(--app-sticky-offset,0rem)+0.5rem)] md:z-10"
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
                aria-label="Periodo anterior"
                disabled={navigationPending}
                onClick={() => moveDate(-1)}
              >
                <ChevronLeft className="size-4" />
              </Button>
              <p className="min-w-0 truncate px-1 text-sm font-semibold first-letter:uppercase">
                {rangeLabel}
              </p>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Proximo periodo"
                disabled={navigationPending}
                onClick={() => moveDate(1)}
              >
                <ChevronRight className="size-4" />
              </Button>
              {navigationPending ? (
                <RefreshCw
                  className="size-4 animate-spin text-muted-foreground"
                  aria-label="Atualizando"
                />
              ) : null}
            </div>

            <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2">
              <div className="relative min-w-0 flex-1 sm:max-w-64">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
                />
                <Input
                  value={patientQuery}
                  onChange={(event) => setPatientQuery(event.target.value)}
                  placeholder="Buscar paciente"
                  className="w-full pl-9"
                  aria-label="Buscar paciente na agenda"
                />
              </div>
              <Badge variant="neutral" className="hidden lg:inline-flex">
                {filteredAppointments.length} agendamentos
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
                aria-label="Visao da agenda"
                className="w-36 shrink-0"
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
            onSelectAppointment={setSelectedAppointmentId}
          />
        ) : view === "week" ? (
          <WeekAgenda
            date={date}
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

      {selectedAppointment ? (
        <AppointmentDetailsModal
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
  dayCounts,
  onClearFilters,
  onSelectDate,
  open,
}: {
  canClear: boolean;
  children: React.ReactNode;
  date: string;
  dayCounts: Record<string, number>;
  onClearFilters: () => void;
  onSelectDate: (nextDate: string) => void;
  open: boolean;
}) {
  const selectedDay = useMemo(() => calendarDateFromKey(date), [date]);
  const density = useMemo(() => buildDayDensity(dayCounts), [dayCounts]);

  return (
    <div
      className={cn(
        "order-2 min-w-0 content-start gap-4 xl:sticky xl:top-[calc(var(--app-sticky-offset,0rem)+0.5rem)] xl:order-1 xl:grid xl:max-h-[calc(100svh-var(--app-sticky-offset,0rem)-1.5rem)] xl:overflow-y-auto xl:pr-1",
        open ? "grid" : "hidden",
      )}
    >
      <Card className="relative overflow-hidden">
        <CardContent className="p-3">
          <AgendaDayDensityContext.Provider value={density}>
            <DayPicker
              mode="single"
              locale={ptBR}
              weekStartsOn={1}
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
              // A ocupação do dia é o único realce além do dia selecionado:
              // pinta a célula e o botão transparente deixa o tom aparecer.
              modifiers={{
                loadLow: (day) => densityOf(density, day) === "low",
                loadMedium: (day) => densityOf(density, day) === "medium",
                loadHigh: (day) => densityOf(density, day) === "high",
              }}
              modifiersClassNames={{
                loadLow: densityCellClass.low,
                loadMedium: densityCellClass.medium,
                loadHigh: densityCellClass.high,
              }}
              formatters={{ formatWeekdayName: calendarWeekdayLabel }}
              components={{ DayButton: AgendaDayButton }}
              classNames={{
                root: "relative w-full",
                caption_label:
                  "text-sm font-semibold first-letter:uppercase text-foreground",
                chevron: "size-4 fill-current",
                day: "h-9 w-8 rounded-md p-0 text-center text-sm",
                day_button: "",
                month_caption:
                  "mb-1 flex min-h-8 items-center justify-center text-center",
                month_grid: "w-full table-fixed border-collapse",
                months: "grid gap-2",
                nav: "absolute inset-x-0 top-0 flex justify-between",
                button_next:
                  "flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40",
                button_previous:
                  "flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40",
                weekday:
                  "h-7 w-8 p-0 text-center text-[11px] font-medium uppercase text-muted-foreground",
              }}
            />
          </AgendaDayDensityContext.Provider>

          <div className="mt-2 flex items-center justify-center gap-3 border-t border-border pt-2 text-caption text-muted-foreground">
            {densityLegend.map((item) => (
              <span key={item.level} className="flex items-center gap-1">
                <span
                  aria-hidden="true"
                  className={cn(
                    "size-2.5 rounded-sm border border-border",
                    densityCellClass[item.level],
                  )}
                />
                {item.label}
              </span>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="grid gap-3 p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold">Filtros</p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={!canClear}
              onClick={onClearFilters}
              className="h-7 px-2 text-xs text-primary hover:bg-primary-muted hover:text-primary"
            >
              Limpar filtros
            </Button>
          </div>
          {children}
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
  low: "bg-success-muted",
  medium: "bg-warning-muted",
  high: "bg-destructive-muted",
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

function densityOf(density: DayDensity, day: Date) {
  return densityLevelOf(
    density.counts[calendarKeyFromDate(day)] ?? 0,
    density.scale,
  );
}

// Mesmo botão do react-day-picker (inclusive o foco por teclado). O estilo
// fica todo aqui porque o `cn` resolve os conflitos entre selecionado, hoje e
// dia de fora do mês; a contagem do dia vai só no title.
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

  useEffect(() => {
    if (modifiers.focused) ref.current?.focus();
  }, [modifiers.focused]);

  return (
    <button
      ref={ref}
      {...props}
      title={`${count} ${count === 1 ? "agendamento" : "agendamentos"}`}
      className={cn(
        "flex size-full items-center justify-center rounded-md transition-colors duration-[var(--motion-fast)] hover:bg-muted",
        modifiers.today && "font-semibold text-primary",
        modifiers.outside && "text-muted-foreground/50",
        modifiers.selected &&
          "bg-primary font-semibold text-primary-foreground hover:bg-primary",
        className,
      )}
    >
      {children}
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
                    <h2 className="text-base font-semibold">{period.label}</h2>
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
                  <div className="absolute inset-x-6 top-8 rounded-lg border border-dashed border-border bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground">
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
  const timeZone = useAgendaTimeZone();
  const days = weekDays(date);
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

  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <div className="min-w-[980px]">
          <div className="grid grid-cols-[4.5rem_repeat(7,minmax(7.5rem,1fr))] border-b border-border bg-card">
            <div className="border-r border-border" />
            {days.map((day) => {
              const dayKey = dateKey(day);
              return (
                <div
                  key={dayKey}
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
                  <p className="mt-0.5 text-sm font-medium">
                    {formatDayMonth(dayKey)}
                  </p>
                </div>
              );
            })}
          </div>
          <div
            className="grid grid-cols-[4.5rem_repeat(7,minmax(7.5rem,1fr))]"
            style={{ height: totalHeight }}
          >
            <div className="relative border-r border-border bg-card">
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
                  {dayKey === today ? (
                    <NowIndicator
                      startMinute={timelineRange.startMinute}
                      endMinute={timelineRange.endMinute}
                      timeZone={timeZone}
                    />
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </Card>
  );
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
      className="pointer-events-none absolute inset-x-0 z-20"
      style={{ top }}
    >
      <div className="relative border-t-2 border-destructive">
        <span className="absolute -top-[5px] left-0 size-2 rounded-full bg-destructive" />
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
  const scheduleColor = schedule?.color ?? defaultScheduleColor;
  const colors = timelineScheduleColor(scheduleColor);
  const width = `calc(${100 / item.laneCount}% - 6px)`;
  const left = `calc(${(100 / item.laneCount) * item.lane}% + 3px)`;

  return (
    <div
      role={onSelect ? "button" : undefined}
      tabIndex={onSelect ? 0 : undefined}
      onClick={onSelect}
      onKeyDown={(event) => handleAppointmentCardKeyDown(event, onSelect)}
      className={`absolute z-10 overflow-hidden rounded-md px-2 py-1 text-xs shadow-[var(--shadow-soft)] ${
        onSelect
          ? "cursor-pointer transition-shadow duration-[var(--motion-fast)] hover:shadow-[var(--shadow-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          : ""
      }`}
      style={{
        top: item.top,
        height: item.height,
        left,
        width,
        backgroundColor: colors.background,
        borderLeft: `3px solid ${scheduleColor}`,
        color: colors.text,
      }}
      title={`${formatTime(appointment.start_at, timeZone)} - ${formatTime(
        appointment.end_at,
        timeZone,
      )} · ${patientName}`}
    >
      <p className="truncate font-semibold leading-tight" title={patientName}>
        {patientName}
      </p>
      {item.height >= 52 ? (
        <p className="mt-0.5 truncate text-caption font-normal leading-tight opacity-80">
          {procedure?.name ?? "Procedimento"}
          {professional ? ` · ${professional.name}` : ""}
        </p>
      ) : null}
      {item.height >= 34 ? (
        <div className="mt-0.5 flex items-center gap-1">
          <span className="truncate text-caption font-medium tabular-nums opacity-70">
            {formatTime(appointment.start_at, timeZone)} -{" "}
            {formatTime(appointment.end_at, timeZone)}
          </span>
          {appointment.status === "confirmed" ||
          appointment.status === "attended" ? (
            <Check className="size-3 shrink-0 opacity-70" aria-hidden="true" />
          ) : null}
        </div>
      ) : null}
      {canEdit && item.height >= 96 ? (
        <div
          className="mt-2 rounded bg-white/60 p-1"
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
                    className="h-6 w-fit justify-start px-1 text-label text-primary hover:bg-primary-muted hover:text-primary"
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
        description={`${detailsAppointments.length} agendamentos e ${detailsBlocks.length} bloqueios.`}
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
  encounter?: AgendaData["encounters"][number];
  canEdit: boolean;
  canViewPatient: boolean;
  canViewClinical: boolean;
  canStartEncounter: boolean;
  returnTo: string;
  onClose: () => void;
}) {
  const timeZone = useAgendaTimeZone();
  const patientName = patient?.social_name || patient?.full_name || "Paciente";
  const appointmentStatus =
    statusLabel[appointment.status] ?? appointment.status;
  const canStartClinicalEncounter =
    canStartEncounter && !encounter && appointment.status === "waiting";

  return (
    <Modal
      open
      onClose={onClose}
      title="Detalhes do agendamento"
      description={`${patientName} - ${appointmentStatus}`}
      className="max-w-3xl"
    >
      <div className="grid gap-5">
        <section className="grid gap-4 rounded-lg border border-border bg-card p-4">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
            <div className="flex min-w-0 items-start gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary-muted text-primary">
                <UserRound className="size-5" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <h3 className="truncate font-semibold">{patientName}</h3>
                {patient?.social_name ? (
                  <p className="mt-0.5 truncate text-sm text-muted-foreground">
                    Nome civil: {patient.full_name}
                  </p>
                ) : null}
                <p className="mt-1 font-mono text-xs font-semibold uppercase text-primary">
                  Prontuario #{patient?.id.slice(0, 8).toUpperCase() ?? "---"}
                </p>
              </div>
            </div>
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
              {appointmentStatus}
            </Badge>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <SummaryItem
              label="CPF"
              value={patient?.cpf ? formatCPF(patient.cpf) : "Nao informado"}
            />
            <SummaryItem
              label="Telefone"
              value={
                patient?.phone ? (
                  <a
                    className="hover:text-primary hover:underline"
                    href={`tel:${patient.phone}`}
                  >
                    {formatPhoneBR(patient.phone)}
                  </a>
                ) : patient?.whatsapp ? (
                  <a
                    className="hover:text-primary hover:underline"
                    href={`tel:${patient.whatsapp}`}
                  >
                    {formatPhoneBR(patient.whatsapp)}
                  </a>
                ) : (
                  "Nao informado"
                )
              }
              icon={Phone}
            />
            <SummaryItem
              label="WhatsApp"
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
                  "Nao informado"
                )
              }
              icon={Phone}
            />
            <SummaryItem
              label="E-mail"
              value={
                patient?.email ? (
                  <a
                    className="hover:text-primary hover:underline"
                    href={`mailto:${patient.email}`}
                  >
                    {patient.email}
                  </a>
                ) : (
                  "Nao informado"
                )
              }
              icon={Mail}
            />
          </div>
        </section>

        <section className="grid gap-4 rounded-lg border border-border bg-card p-4">
          <div className="flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <CalendarClock className="size-5" aria-hidden="true" />
            </span>
            <div>
              <h3 className="font-semibold">Agendamento atual</h3>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {formatAppointmentDateTime(
                  appointment.start_at,
                  appointment.end_at,
                  timeZone,
                )}
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <SummaryItem
              label="Procedimento"
              value={procedure?.name ?? "Procedimento"}
            />
            <SummaryItem
              label="Profissional"
              value={professional?.name ?? "Nao informado"}
            />
            <SummaryItem label="Agenda" value={schedule?.name ?? "Agenda"} />
            <SummaryItem
              label="Unidade"
              value={unit?.name ?? "Nao informada"}
            />
            <SummaryItem label="Sala" value={room?.name ?? "Nao informada"} />
            <SummaryItem
              label="Convenio"
              value={insurance?.name ?? "Particular"}
            />
          </div>

          {canEdit ? (
            <PaymentMethodForm
              appointmentId={appointment.id}
              paymentMethodId={appointment.payment_method_id}
              paymentMethods={paymentMethods}
            />
          ) : null}

          {appointment.notes ? (
            <div className="rounded-md border border-dashed border-border bg-background px-3 py-2">
              <p className="text-xs font-semibold uppercase text-muted-foreground">
                Observacoes
              </p>
              <p className="mt-1 whitespace-pre-wrap text-sm">
                {appointment.notes}
              </p>
            </div>
          ) : null}
        </section>

        <div className="flex flex-col justify-between gap-3 border-t border-border pt-4 sm:flex-row sm:items-center">
          <div className="flex flex-wrap gap-2">
            {canViewPatient && patient ? (
              <Button asChild variant="secondary">
                <Link href={`/pacientes/${patient.id}`}>
                  <UserRound className="size-4" aria-hidden="true" />
                  Ver paciente
                </Link>
              </Button>
            ) : null}
            {canViewClinical && encounter ? (
              <Button asChild variant="secondary">
                <Link href={buildAgendaEncounterHref(encounter.id, returnTo)}>
                  <FileText className="size-4" aria-hidden="true" />
                  Abrir prontuario
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
              />
            ) : null}
            {canStartClinicalEncounter ? (
              <StartEncounterForm
                appointmentId={appointment.id}
                returnTo={returnTo}
              />
            ) : null}
          </div>
        </div>
      </div>
    </Modal>
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
      className="grid gap-3 rounded-md border border-border bg-muted/20 p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end"
    >
      <label className="grid gap-2 text-sm font-medium">
        Forma de pagamento do agendamento
        <Select
          name="payment_method_id"
          defaultValue={paymentMethodId ?? ""}
          allowEmptyOption
        >
          <option value="">Nao selecionada</option>
          {paymentMethods.map((method) => (
            <option key={method.id} value={method.id}>
              {method.name}
            </option>
          ))}
        </Select>
      </label>
      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? "Salvando..." : "Salvar"}
      </Button>
    </form>
  );
}

function StartEncounterForm({
  appointmentId,
  returnTo,
}: {
  appointmentId: string;
  returnTo: string;
}) {
  const boundAction = startAppointmentEncounter.bind(null, appointmentId);
  const [state, action, pending] = useActionState(boundAction, initialState);

  useEffect(() => {
    if (state.error) toast.error(state.error);
  }, [state]);

  return (
    <form action={action}>
      <input type="hidden" name="return_to" value={returnTo} readOnly />
      <Button type="submit" disabled={pending}>
        <Stethoscope className="size-4" aria-hidden="true" />
        {pending ? "Iniciando..." : "Iniciar atendimento"}
      </Button>
    </form>
  );
}

function SummaryItem({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="min-w-0 border-b border-border/70 px-1 pb-2">
      <p className="flex items-center gap-1.5 text-xs font-semibold uppercase text-muted-foreground">
        {Icon ? <Icon className="size-3.5" aria-hidden="true" /> : null}
        {label}
      </p>
      <p className="mt-1 break-words text-sm font-medium">{value}</p>
    </div>
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

function formatAppointmentDateTime(
  startAt: string,
  endAt: string,
  timeZone: string,
) {
  return `${formatFullDay(localDateKey(startAt, timeZone))}, ${formatTime(
    startAt,
    timeZone,
  )} - ${formatTime(endAt, timeZone)}`;
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
          {block.reason || schedule?.name || "Horario bloqueado"}
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
}: {
  appointmentId: string;
  status: string;
  startAt: string;
  hideInProgressAction?: boolean;
}) {
  if (["attended", "no_show", "cancelled"].includes(status)) return null;
  const actions =
    status === "scheduled"
      ? [
          ["confirmed", "Confirmar", Check],
          ["cancelled", "Cancelar", X],
        ]
      : status === "confirmed"
        ? [
            ["waiting", "Check-in", UserCheck],
            ["cancelled", "Cancelar", X],
          ]
        : status === "waiting"
          ? [
              ["in_progress", "Iniciar", Clock3],
              ["no_show", "Faltou", X],
            ]
          : [["attended", "Finalizar", Check]];
  const visibleActions = hideInProgressAction
    ? actions.filter(([next]) => next !== "in_progress")
    : actions;
  return (
    <div className="flex flex-wrap justify-end gap-2">
      <RescheduleForm appointmentId={appointmentId} startAt={startAt} />
      {visibleActions.map(([next, label, Icon]) => (
        <StatusActionForm
          key={String(next)}
          appointmentId={appointmentId}
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
  destructive,
  icon: Icon,
  label,
  nextStatus,
  requiresConfirmation,
}: {
  appointmentId: string;
  destructive: boolean;
  icon?: React.ComponentType<{ className?: string }>;
  label: string;
  nextStatus: string;
  requiresConfirmation: boolean;
}) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

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
    return true;
  }

  function closeConfirmation() {
    setConfirming(false);
    setError(undefined);
  }

  if (requiresConfirmation) {
    const isFinalizing = nextStatus === "attended";
    return (
      <>
        <Button
          type="button"
          size="sm"
          variant={destructive ? "ghost" : "primary"}
          disabled={pending}
          onClick={() => setConfirming(true)}
        >
          {Icon ? <Icon className="size-3.5" /> : null}
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
      </>
    );
  }

  return (
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
  );
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
          onClick={() => setOpen(false)}
        >
          <X className="size-4" />
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
  return `${formatDayMonth(dateKey(start))} - ${formatDayMonth(dateKey(end))}`;
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

function timelineScheduleColor(color: string) {
  return {
    background: `color-mix(in srgb, ${color} 10%, white)`,
    border: `color-mix(in srgb, ${color} 50%, white)`,
    text: `color-mix(in srgb, ${color} 82%, black)`,
  };
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
