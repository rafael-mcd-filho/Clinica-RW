"use client";

import {
  useActionState,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Ban,
  CalendarClock,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Check,
  Clock3,
  FileText,
  Mail,
  Phone,
  Plus,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Stethoscope,
  UserCheck,
  UserRound,
  WalletCards,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  changeAppointmentStatus,
  createAppointment,
  createQuickPatientFromAgenda,
  rescheduleAppointment,
  startAppointmentEncounter,
  type AgendaActionState,
  updateAppointmentPaymentMethod,
} from "./actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input, MultiSelect, Select, Textarea } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { PatientSearchField } from "@/components/patient-search-field";
import { defaultScheduleColor } from "@/lib/colors";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { formatCPF, formatPhoneBR } from "@/lib/validation/br";

type Option = { id: string; name: string };
export type AgendaData = {
  organizationId: string;
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
  canCreate,
  canCreatePatient,
  canEdit,
  canExtra,
  canViewPatient,
  canViewClinical,
  canStartEncounter,
}: {
  data: AgendaData;
  canCreate: boolean;
  canCreatePatient: boolean;
  canEdit: boolean;
  canExtra: boolean;
  canViewPatient: boolean;
  canViewClinical: boolean;
  canStartEncounter: boolean;
}) {
  const router = useRouter();

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
        () => router.refresh(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [data.organizationId, router]);

  return (
    <div className="grid gap-5">
      <section className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h1 className="text-xl font-semibold">Agenda</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Operação diária da recepção e dos profissionais.
          </p>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          {canCreate ? (
            <AppointmentForm
              data={data}
              canExtra={canExtra}
              canCreatePatient={canCreatePatient}
            />
          ) : null}
        </div>
      </section>

      <AgendaCalendarView
        data={data}
        canEdit={canEdit}
        canViewPatient={canViewPatient}
        canViewClinical={canViewClinical}
        canStartEncounter={canStartEncounter}
      />
    </div>
  );
}

function AgendaCalendarView({
  data,
  canEdit,
  canViewPatient,
  canViewClinical,
  canStartEncounter,
}: {
  data: AgendaData;
  canEdit: boolean;
  canViewPatient: boolean;
  canViewClinical: boolean;
  canStartEncounter: boolean;
}) {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Fortaleza",
  }).format(new Date());
  const [view, setView] = useState<"day" | "week" | "month">("day");
  const [date, setDate] = useState(today);
  const [professionalIds, setProfessionalIds] = useState<string[]>([]);
  const [statusValues, setStatusValues] = useState<string[]>([]);
  const [unitIds, setUnitIds] = useState<string[]>([]);
  const [specialtyIds, setSpecialtyIds] = useState<string[]>([]);
  const [procedureIds, setProcedureIds] = useState<string[]>([]);
  const [insuranceIds, setInsuranceIds] = useState<string[]>([]);
  const [patientQuery, setPatientQuery] = useState("");
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
  const paymentMethod = useMemo(
    () => new Map(data.paymentMethods.map((item) => [item.id, item])),
    [data.paymentMethods],
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
      const itemDate = localDateKey(item.start_at);
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
      const itemDate = localDateKey(item.start_at);
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
    () => groupByLocalDay(filteredAppointments),
    [filteredAppointments],
  );
  const blocksByDay = useMemo(
    () => groupBlocksByLocalDay(filteredBlocks),
    [filteredBlocks],
  );

  function moveDate(direction: -1 | 1) {
    const base = localDateFromKey(date);
    if (view === "day") setDate(dateKey(addDays(base, direction)));
    if (view === "week") setDate(dateKey(addDays(base, direction * 7)));
    if (view === "month") setDate(dateKey(addMonths(base, direction)));
  }

  return (
    <div className="grid gap-4">
      <Card>
        <CardContent className="grid gap-3 p-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex rounded-md bg-muted p-0.5">
                {[
                  ["day", "Diária"],
                  ["week", "Semanal"],
                  ["month", "Mensal"],
                ].map(([value, label]) => (
                  <Button
                    key={value}
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setView(value as "day" | "week" | "month")}
                    className={
                      view === value
                        ? "bg-card text-foreground shadow-[var(--shadow-soft)] hover:bg-card"
                        : ""
                    }
                  >
                    {label}
                  </Button>
                ))}
              </div>
              <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-1 shadow-[var(--shadow-soft)]">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Periodo anterior"
                  onClick={() => moveDate(-1)}
                >
                  <ChevronLeft className="size-4" />
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setDate(today)}
                >
                  Hoje
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Proximo periodo"
                  onClick={() => moveDate(1)}
                >
                  <ChevronRight className="size-4" />
                </Button>
              </div>
              <label className="relative">
                <span className="sr-only">Data da agenda</span>
                <Input
                  type="date"
                  value={date}
                  onChange={(event) => setDate(event.target.value)}
                  className="w-44"
                />
              </label>
              <Badge variant="neutral">{rangeLabel}</Badge>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Badge variant="neutral">
                {filteredAppointments.length} agendamentos
              </Badge>
              <Badge variant="neutral">{filteredBlocks.length} bloqueios</Badge>
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                value={patientQuery}
                onChange={(event) => setPatientQuery(event.target.value)}
                placeholder="Buscar paciente por nome, telefone, e-mail ou código interno"
                className="w-full pl-9"
                aria-label="Buscar paciente na agenda"
              />
            </div>
            <FiltersPopover activeCount={activeFilterCount}>
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
              <MultiSelect
                value={unitIds}
                onValueChange={setUnitIds}
                allLabel="Todas as unidades"
                aria-label="Filtrar unidades"
                options={data.units.map((item) => ({
                  value: item.id,
                  label: item.name,
                }))}
              />
              <MultiSelect
                value={specialtyIds}
                onValueChange={setSpecialtyIds}
                allLabel="Todas as especialidades"
                aria-label="Filtrar especialidades"
                options={data.specialties.map((item) => ({
                  value: item.id,
                  label: item.name,
                }))}
              />
              <MultiSelect
                value={procedureIds}
                onValueChange={setProcedureIds}
                allLabel="Todos os procedimentos"
                aria-label="Filtrar procedimentos"
                options={data.procedures.map((item) => ({
                  value: item.id,
                  label: item.name,
                }))}
              />
              <MultiSelect
                value={insuranceIds}
                onValueChange={setInsuranceIds}
                allLabel="Todos os convenios"
                aria-label="Filtrar convenios"
                options={data.insurances.map((item) => ({
                  value: item.id,
                  label: item.name,
                }))}
              />
            </FiltersPopover>
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
          paymentMethod={
            selectedAppointment.payment_method_id
              ? paymentMethod.get(selectedAppointment.payment_method_id)
              : undefined
          }
          paymentMethods={data.paymentMethods}
          encounter={encounterByAppointment.get(selectedAppointment.id)}
          canEdit={canEdit}
          canViewPatient={canViewPatient}
          canViewClinical={canViewClinical}
          canStartEncounter={canStartEncounter}
          onClose={() => setSelectedAppointmentId(null)}
        />
      ) : null}
    </div>
  );
}

function FiltersPopover({
  activeCount,
  children,
}: {
  activeCount: number;
  children: React.ReactNode;
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(
    null,
  );

  const close = useCallback(() => setOpen(false), []);

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const width = 340;
    const left = Math.min(rect.right - width, window.innerWidth - width - 8);
    setCoords({ top: rect.bottom + 6, left: Math.max(8, left) });
  }, []);

  useLayoutEffect(() => {
    if (open) updatePosition();
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (
        panelRef.current?.contains(target) ||
        triggerRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }

    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", close);

    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", close);
    };
  }, [open, close]);

  return (
    <>
      <Button
        ref={triggerRef}
        type="button"
        variant="secondary"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => (open ? setOpen(false) : setOpen(true))}
        className="h-10 shrink-0 aria-expanded:border-primary"
      >
        <SlidersHorizontal
          className="size-4 text-muted-foreground"
          aria-hidden="true"
        />
        Filtros
        {activeCount > 0 ? (
          <Badge variant="primary" className="h-5 px-1.5">
            {activeCount}
          </Badge>
        ) : null}
      </Button>

      {open && coords && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={panelRef}
              role="dialog"
              aria-label="Filtros da agenda"
              data-select-portal-root
              style={{ top: coords.top, left: coords.left, width: 340 }}
              className="fixed z-[60] max-w-[calc(100vw-1rem)] animate-content-enter rounded-lg border border-border bg-popover p-4 shadow-[var(--shadow-md)]"
            >
              <p className="mb-3 text-sm font-semibold">Filtros</p>
              <div className="grid gap-3">{children}</div>
            </div>,
            document.body,
          )
        : null}
    </>
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
  const dayAppointments = appointments.filter(
    (item) => localDateKey(item.start_at) === date,
  );
  const dayBlocks = blocks.filter(
    (item) => localDateKey(item.start_at) === date,
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
    <div className="grid gap-4 xl:grid-cols-3">
      {periods.map((period) => {
        const periodAppointments = dayAppointments.filter((item) =>
          localIntervalIntersectsMinuteRange(
            item.start_at,
            item.end_at,
            period.startMinute,
            period.endMinute,
          ),
        );
        const periodBlocks = dayBlocks.filter((item) =>
          localIntervalIntersectsMinuteRange(
            item.start_at,
            item.end_at,
            period.startMinute,
            period.endMinute,
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
        });

        return (
          <Card key={period.id} className="overflow-hidden">
            <div className="grid grid-cols-[4.5rem_minmax(0,1fr)] border-b border-border bg-card">
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
              className="grid grid-cols-[4.5rem_minmax(0,1fr)]"
              style={{ height: totalHeight }}
            >
              <div className="relative border-r border-border bg-card">
                {slots
                  .filter((slot) => slot.minute < period.endMinute)
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
              <div
                className="relative overflow-hidden bg-background"
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
  const days = weekDays(date);
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Fortaleza",
  }).format(new Date());
  const timelineRange = getWeekTimelineRange(
    days,
    appointmentsByDay,
    blocksByDay,
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
              });

              return (
                <div
                  key={dayKey}
                  className={`relative border-r border-border last:border-r-0 ${
                    dayKey === today ? "bg-primary-muted/40" : "bg-background"
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

function currentMinuteInFortaleza() {
  const parts = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Fortaleza",
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
}: {
  startMinute: number;
  endMinute: number;
}) {
  const [minute, setMinute] = useState(currentMinuteInFortaleza);

  useEffect(() => {
    const id = setInterval(() => {
      setMinute(currentMinuteInFortaleza());
    }, 60_000);
    return () => clearInterval(id);
  }, []);

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
  const patientName = patient?.social_name || patient?.full_name || "Paciente";
  const colors = timelineScheduleColor(schedule?.color ?? defaultScheduleColor);
  const width = `calc(${100 / item.laneCount}% - 6px)`;
  const left = `calc(${(100 / item.laneCount) * item.lane}% + 3px)`;

  return (
    <div
      role={onSelect ? "button" : undefined}
      tabIndex={onSelect ? 0 : undefined}
      onClick={onSelect}
      onKeyDown={(event) => handleAppointmentCardKeyDown(event, onSelect)}
      className={`absolute z-10 overflow-hidden rounded-md border px-2 py-1 text-xs shadow-[var(--shadow-soft)] ${
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
        borderColor: colors.border,
        color: colors.text,
      }}
      title={`${formatTime(appointment.start_at)} - ${formatTime(
        appointment.end_at,
      )} · ${patientName}`}
    >
      <div className="flex items-start justify-between gap-1">
        <div className="min-w-0">
          <p className="truncate font-semibold tabular-nums">
            {formatTime(appointment.start_at)} -{" "}
            {formatTime(appointment.end_at)}
          </p>
          <p className="truncate font-semibold uppercase">{patientName}</p>
        </div>
        {appointment.status === "confirmed" ||
        appointment.status === "attended" ? (
          <Check className="size-3.5 shrink-0" aria-hidden="true" />
        ) : null}
      </div>
      {item.height >= 42 ? (
        <p className="mt-0.5 truncate opacity-85">
          {procedure?.name ?? "Procedimento"}
          {professional ? ` · ${professional.name}` : ""}
        </p>
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
      title={`${formatTime(item.block.start_at)} - ${formatTime(
        item.block.end_at,
      )}`}
    >
      <div className="flex min-w-0 items-center gap-1">
        <Ban className="size-3.5 shrink-0" aria-hidden="true" />
        <p className="truncate font-semibold tabular-nums">
          {formatTime(item.block.start_at)} - {formatTime(item.block.end_at)}
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
            {formatTime(appointment.start_at)}
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
  paymentMethod,
  paymentMethods,
  encounter,
  canEdit,
  canViewPatient,
  canViewClinical,
  canStartEncounter,
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
  paymentMethod?: AgendaData["paymentMethods"][number];
  paymentMethods: AgendaData["paymentMethods"];
  encounter?: AgendaData["encounters"][number];
  canEdit: boolean;
  canViewPatient: boolean;
  canViewClinical: boolean;
  canStartEncounter: boolean;
  onClose: () => void;
}) {
  const patientName = patient?.social_name || patient?.full_name || "Paciente";
  const appointmentStatus =
    statusLabel[appointment.status] ?? appointment.status;
  const canStartClinicalEncounter =
    canStartEncounter &&
    !encounter &&
    !["attended", "no_show", "cancelled"].includes(appointment.status);

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
                patient?.phone
                  ? formatPhoneBR(patient.phone)
                  : patient?.whatsapp
                    ? formatPhoneBR(patient.whatsapp)
                    : "Nao informado"
              }
              icon={Phone}
            />
            <SummaryItem
              label="WhatsApp"
              value={
                patient?.whatsapp
                  ? formatPhoneBR(patient.whatsapp)
                  : "Nao informado"
              }
              icon={Phone}
            />
            <SummaryItem
              label="E-mail"
              value={patient?.email || "Nao informado"}
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
            <SummaryItem
              label="Forma de pagamento"
              value={paymentMethod?.name ?? "Nao selecionada"}
              icon={WalletCards}
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

        <div className="flex flex-col gap-2 border-t border-border pt-4 sm:flex-row sm:flex-wrap sm:justify-end">
          {canViewPatient && patient ? (
            <Button asChild variant="secondary">
              <Link href={`/pacientes/${patient.id}`}>
                <UserRound className="size-4" aria-hidden="true" />
                Ir ao paciente
              </Link>
            </Button>
          ) : null}
          {canViewClinical && encounter ? (
            <Button asChild variant="secondary">
              <Link href={`/prontuario/${encounter.id}`}>
                <FileText className="size-4" aria-hidden="true" />
                Abrir prontuario
              </Link>
            </Button>
          ) : null}
          {canStartClinicalEncounter ? (
            <StartEncounterForm appointmentId={appointment.id} />
          ) : null}
          {canEdit ? (
            <div className="flex flex-wrap justify-end gap-2">
              <StatusActions
                appointmentId={appointment.id}
                status={appointment.status}
                startAt={appointment.start_at}
                hideInProgressAction={canStartClinicalEncounter}
              />
            </div>
          ) : null}
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

function StartEncounterForm({ appointmentId }: { appointmentId: string }) {
  const boundAction = startAppointmentEncounter.bind(null, appointmentId);
  const [state, action, pending] = useActionState(boundAction, initialState);

  useEffect(() => {
    if (state.error) toast.error(state.error);
  }, [state]);

  return (
    <form action={action}>
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
  value: string;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="min-w-0 rounded-md bg-background px-3 py-2">
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

function formatAppointmentDateTime(startAt: string, endAt: string) {
  return `${formatFullDay(localDateKey(startAt))}, ${formatTime(
    startAt,
  )} - ${formatTime(endAt)}`;
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
  return (
    <div className="min-w-0 overflow-hidden rounded-lg border border-dashed border-border bg-muted/40 p-3">
      <div className="flex min-w-0 items-center gap-2">
        <Ban
          className="size-4 shrink-0 text-muted-foreground"
          aria-hidden="true"
        />
        <p className="truncate text-xs font-semibold tabular-nums">
          {formatTime(block.start_at)}-{formatTime(block.end_at)}
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

function AppointmentForm({
  data,
  canExtra,
  canCreatePatient,
}: {
  data: AgendaData;
  canExtra: boolean;
  canCreatePatient: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [selectedScheduleId, setSelectedScheduleId] = useState("");
  const [selectedProcedureId, setSelectedProcedureId] = useState("");
  const [state, action, pending] = useActionState(
    createAppointment,
    initialState,
  );
  const selectedProcedure = data.procedures.find(
    (item) => item.id === selectedProcedureId,
  );
  useEffect(() => {
    if (state.success) {
      toast.success(state.success);
    }
  }, [state]);
  if (!open)
    return (
      <Button type="button" onClick={() => setOpen(true)}>
        <Plus className="size-4" />
        Novo agendamento
      </Button>
    );
  return (
    <Card className="fixed inset-x-4 top-20 z-40 mx-auto max-h-[calc(100vh-6rem)] max-w-2xl overflow-y-auto shadow-[var(--shadow-lg)]">
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <h2 className="font-semibold">Novo agendamento</h2>
          <p className="text-sm text-muted-foreground">
            A duração será definida pelo procedimento.
          </p>
        </div>
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
        <form action={action} className="grid gap-4 md:grid-cols-2">
          <PatientSearchField
            patients={data.patients}
            canCreatePatient={canCreatePatient}
            createPatientAction={createQuickPatientFromAgenda}
            className="md:col-span-2"
          />
          <label className="grid gap-2 text-sm font-medium">
            Agenda
            <Select
              name="schedule_id"
              required
              value={selectedScheduleId}
              onValueChange={setSelectedScheduleId}
            >
              <option value="">Selecione</option>
              {data.schedules.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </Select>
          </label>
          <label className="grid gap-2 text-sm font-medium">
            Procedimento
            <Select
              name="procedure_id"
              required
              value={selectedProcedureId}
              onValueChange={setSelectedProcedureId}
            >
              <option value="">Selecione</option>
              {data.procedures.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} ({item.duration_minutes} min)
                </option>
              ))}
            </Select>
          </label>
          <AppointmentTimeField
            name="start_at"
            label="Data e hora"
            required
            durationMinutes={selectedProcedure?.duration_minutes ?? 30}
            scheduleId={selectedScheduleId}
            procedureId={selectedProcedureId}
            data={data}
            className="md:col-span-2"
          />
          <OptionSelect
            name="room_id"
            label="Sala (opcional)"
            options={data.rooms}
            optional
          />
          <OptionSelect
            name="health_insurance_id"
            label="Convênio (opcional)"
            options={data.insurances}
            optional
          />
          <OptionSelect
            name="payment_method_id"
            label="Forma de pagamento (opcional)"
            options={data.paymentMethods}
            optional
          />
          <label className="grid gap-2 text-sm font-medium md:col-span-2">
            Observações
            <Textarea name="notes" />
          </label>
          {canExtra ? (
            <div className="md:col-span-2">
              <Checkbox name="is_extra" label="Registrar como encaixe" />
            </div>
          ) : null}
          {state.error ? (
            <p className="text-sm text-destructive md:col-span-2">
              {state.error}
            </p>
          ) : null}
          <div className="flex justify-end gap-2 md:col-span-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setOpen(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={pending || !data.schedules.length}>
              {pending ? "Salvando..." : "Agendar"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function AppointmentTimeField({
  name,
  label,
  durationMinutes,
  scheduleId,
  procedureId,
  data,
  required,
  className,
}: {
  name: string;
  label: string;
  durationMinutes: number;
  scheduleId: string;
  procedureId: string;
  data: AgendaData;
  required?: boolean;
  className?: string;
}) {
  const initial = defaultAppointmentDateTime();
  const [date, setDate] = useState(initial.date);
  const [startTime, setStartTime] = useState(initial.time);
  const normalizedStart = normalizeTimeValue(startTime);
  const endTime = addMinutesToTime(date, normalizedStart, durationMinutes);
  const value = date ? `${date}T${normalizedStart}` : "";

  function fillNextFreeSlot() {
    if (!scheduleId || !procedureId) {
      toast.error("Selecione agenda e procedimento antes.");
      return;
    }

    const next = findNextFreeSlot({
      data,
      scheduleId,
      durationMinutes,
      date,
      time: normalizedStart,
    });

    if (!next) {
      toast.error("Nenhum horário livre encontrado na janela carregada.");
      return;
    }

    setDate(next.date);
    setStartTime(next.time);
  }

  return (
    <label className={`grid gap-2 text-sm font-medium ${className ?? ""}`}>
      {label}
      <input type="hidden" name={name} value={value} />
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <CalendarDays
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            required={required}
            className="w-44 pl-9 [&::-webkit-calendar-picker-indicator]:opacity-0"
          />
        </div>
        <TimeTextInput
          value={startTime}
          onChange={setStartTime}
          onBlur={() => setStartTime(normalizedStart)}
          ariaLabel={`${label}: horário inicial`}
        />
        <span className="text-sm font-medium text-muted-foreground">às</span>
        <Input
          value={endTime}
          readOnly
          aria-label={`${label}: horário final`}
          className="w-20 text-center tabular-nums"
        />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-primary"
          onClick={fillNextFreeSlot}
        >
          <RefreshCw className="size-4" />
          Próximo horário livre
        </Button>
      </div>
    </label>
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
  const parsed = splitDateTimeValue(defaultValue);
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
        <Input
          type="date"
          value={date}
          onChange={(event) => setDate(event.target.value)}
          required={required}
          className="w-full"
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

function OptionSelect({
  name,
  label,
  options,
  optional,
}: {
  name: string;
  label: string;
  options: Option[];
  optional?: boolean;
}) {
  return (
    <label className="grid gap-2 text-sm font-medium">
      {label}
      <Select
        name={name}
        required={!optional}
        defaultValue=""
        allowEmptyOption={optional}
      >
        <option value="">{optional ? "Nenhum" : "Selecione"}</option>
        {options.map((item) => (
          <option key={item.id} value={item.id}>
            {item.name}
          </option>
        ))}
      </Select>
    </label>
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
        <form
          key={String(next)}
          action={changeAppointmentStatus.bind(
            null,
            appointmentId,
            String(next),
          )}
        >
          <Button
            type="submit"
            size="sm"
            variant={
              next === "cancelled" || next === "no_show" ? "ghost" : "secondary"
            }
          >
            {typeof Icon !== "string" ? <Icon className="size-3.5" /> : null}
            {String(label)}
          </Button>
        </form>
      ))}
    </div>
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

function localDateKey(value: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Fortaleza",
  }).format(new Date(value));
}

function localDateFromKey(value: string) {
  return new Date(`${value}T12:00:00-03:00`);
}

function dateKey(value: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Fortaleza",
  }).format(value);
}

function addDays(value: Date, days: number) {
  const next = new Date(value);
  next.setDate(next.getDate() + days);
  return next;
}

function addMonths(value: Date, months: number) {
  const next = new Date(value);
  next.setMonth(next.getMonth() + months);
  return next;
}

function weekStart(value: Date) {
  const next = new Date(value);
  const day = next.getDay();
  const offset = day === 0 ? -6 : 1 - day;
  next.setDate(next.getDate() + offset);
  return next;
}

function weekDays(date: string) {
  const start = weekStart(localDateFromKey(date));
  return Array.from({ length: 7 }, (_, index) => addDays(start, index));
}

function monthDays(date: string) {
  const base = localDateFromKey(date);
  const lastDay = new Date(
    base.getFullYear(),
    base.getMonth() + 1,
    0,
  ).getDate();
  return Array.from(
    { length: lastDay },
    (_, index) => new Date(base.getFullYear(), base.getMonth(), index + 1, 12),
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
      item.getFullYear() === selected.getFullYear() &&
      item.getMonth() === selected.getMonth()
    );
  }

  const start = weekStart(selected);
  const end = addDays(start, 7);
  return item >= start && item < end;
}

function groupByLocalDay(items: AgendaData["appointments"]) {
  const grouped = new Map<string, AgendaData["appointments"]>();
  for (const item of items) {
    const key = localDateKey(item.start_at);
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

function groupBlocksByLocalDay(items: AgendaData["blocks"]) {
  const grouped = new Map<string, AgendaData["blocks"]>();
  for (const item of items) {
    const key = localDateKey(item.start_at);
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
      timeZone: "America/Fortaleza",
    }).format(base);
  }
  if (view === "month") {
    return new Intl.DateTimeFormat("pt-BR", {
      month: "long",
      year: "numeric",
      timeZone: "America/Fortaleza",
    }).format(base);
  }
  const start = weekStart(base);
  const end = addDays(start, 6);
  return `${formatDayMonth(dateKey(start))} - ${formatDayMonth(dateKey(end))}`;
}

function weekdayShort(value: Date) {
  return new Intl.DateTimeFormat("pt-BR", {
    weekday: "short",
    timeZone: "America/Fortaleza",
  })
    .format(value)
    .replace(".", "");
}

function weekdayLong(value: Date) {
  const label = new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    timeZone: "America/Fortaleza",
  })
    .format(value)
    .split("-")[0];
  return `${label.charAt(0).toUpperCase()}${label.slice(1)}`;
}

function formatDayMonth(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    timeZone: "America/Fortaleza",
  })
    .format(localDateFromKey(value))
    .replace(".", "");
}

function formatFullDay(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    timeZone: "America/Fortaleza",
  }).format(localDateFromKey(value));
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Fortaleza",
  }).format(new Date(value));
}

function getWeekTimelineRange(
  days: Date[],
  appointmentsByDay: Map<string, AgendaData["appointments"]>,
  blocksByDay: Map<string, AgendaData["blocks"]>,
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
      const start = minutesOfLocalDay(new Date(entry.startAt));
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
) {
  const startMinute = minutesOfLocalDay(new Date(startAt));
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
}: {
  appointments: AgendaData["appointments"];
  blocks: AgendaData["blocks"];
  startMinute: number;
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
      }
    | {
        id: string;
        type: "block";
        block: AgendaData["blocks"][number];
        startAt: Date;
        endAt: Date;
        startMinute: number;
      },
): TimedWeekItem {
  const localStart = minutesOfLocalDay(input.startAt);
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
    background: `color-mix(in srgb, ${color} 14%, white)`,
    border: `color-mix(in srgb, ${color} 58%, white)`,
    text: `color-mix(in srgb, ${color} 82%, black)`,
  };
}

function minutesOfLocalDay(value: Date) {
  const [, time = "00:00"] = value
    .toLocaleString("sv-SE", { timeZone: "America/Fortaleza" })
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

function defaultAppointmentDateTime() {
  return localDateTimeParts(roundDateToStep(new Date(), 15));
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

function addMinutesToTime(date: string, time: string, minutes: number) {
  const start = parseLocalDateTimeForUi(date, time);
  if (!start) return "--:--";
  return localDateTimeParts(new Date(start.getTime() + minutes * 60_000)).time;
}

function findNextFreeSlot({
  data,
  scheduleId,
  durationMinutes,
  date,
  time,
}: {
  data: AgendaData;
  scheduleId: string;
  durationMinutes: number;
  date: string;
  time: string;
}) {
  const schedule = data.schedules.find((item) => item.id === scheduleId);
  const initial = parseLocalDateTimeForUi(date, time);
  if (!schedule || !initial) return null;

  const sortedAvailability = data.availability
    .filter((item) => item.schedule_id === scheduleId)
    .sort(
      (a, b) =>
        a.weekday - b.weekday || a.start_time.localeCompare(b.start_time),
    );

  for (let offset = 0; offset <= 90; offset += 1) {
    const day = addDays(localDateFromKey(dateKey(initial)), offset);
    const dayKey = dateKey(day);
    const dayStartLimit =
      offset === 0 ? initial : parseLocalDateTimeForUi(dayKey, "00:00");
    const dayAvailability = sortedAvailability.filter(
      (item) => item.weekday === day.getDay(),
    );

    for (const availability of dayAvailability) {
      const windowStart = parseLocalDateTimeForUi(
        dayKey,
        availability.start_time.slice(0, 5),
      );
      const windowEnd = parseLocalDateTimeForUi(
        dayKey,
        availability.end_time.slice(0, 5),
      );

      if (!windowStart || !windowEnd || !dayStartLimit) continue;

      let candidate = roundDateToStep(
        maxDate(dayStartLimit, windowStart),
        availability.slot_minutes,
      );

      while (
        candidate.getTime() + durationMinutes * 60_000 <=
        windowEnd.getTime()
      ) {
        const candidateEnd = new Date(
          candidate.getTime() + durationMinutes * 60_000,
        );

        if (
          !hasScheduleConflict({
            data,
            schedule,
            startAt: candidate,
            endAt: candidateEnd,
          })
        ) {
          return localDateTimeParts(candidate);
        }

        candidate = new Date(
          candidate.getTime() + availability.slot_minutes * 60_000,
        );
      }
    }
  }

  return null;
}

function hasScheduleConflict({
  data,
  schedule,
  startAt,
  endAt,
}: {
  data: AgendaData;
  schedule: AgendaData["schedules"][number];
  startAt: Date;
  endAt: Date;
}) {
  return (
    data.appointments.some((appointment) => {
      if (
        appointment.schedule_id !== schedule.id &&
        appointment.professional_id !== schedule.professional_id
      ) {
        return false;
      }
      return intervalsOverlap(
        startAt,
        endAt,
        new Date(appointment.start_at),
        new Date(appointment.end_at),
      );
    }) ||
    data.blocks.some((block) => {
      if (block.schedule_id !== schedule.id) return false;
      return intervalsOverlap(
        startAt,
        endAt,
        new Date(block.start_at),
        new Date(block.end_at),
      );
    })
  );
}

function intervalsOverlap(startA: Date, endA: Date, startB: Date, endB: Date) {
  return startA < endB && endA > startB;
}

function maxDate(first: Date, second: Date) {
  return first > second ? first : second;
}

function roundDateToStep(value: Date, stepMinutes: number) {
  const stepMs = Math.max(stepMinutes, 1) * 60_000;
  return new Date(Math.ceil(value.getTime() / stepMs) * stepMs);
}

function parseLocalDateTimeForUi(date: string, time: string) {
  const parsed = new Date(`${date}T${normalizeTimeValue(time)}:00-03:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function localDateTimeParts(value: Date) {
  const [date, time = "00:00"] = value
    .toLocaleString("sv-SE", { timeZone: "America/Fortaleza" })
    .split(" ");
  return { date, time: time.slice(0, 5) };
}

function formatDateTimeInput(value: string) {
  return new Date(value)
    .toLocaleString("sv-SE", { timeZone: "America/Fortaleza" })
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

function splitDateTimeValue(value?: string) {
  if (!value) {
    return { date: "", hour: "08", minute: "00" };
  }

  const [date = "", time = ""] = formatDateTimeInput(value).split("T");
  const [hour = "08", minute = "00"] = time.split(":");

  return {
    date,
    hour: normalizeTimePart(hour, 23),
    minute: normalizeTimePart(minute, 59),
  };
}
