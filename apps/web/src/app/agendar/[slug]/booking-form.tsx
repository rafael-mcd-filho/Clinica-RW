"use client";

import {
  useActionState,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import {
  CalendarCheck,
  Check,
  CaretLeft as ChevronLeft,
  CaretRight as ChevronRight,
  Clock as Clock3,
  Key as KeyRound,
  CircleNotch as LoaderCircle,
  ShieldCheck,
  UserCircle as UserRound,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import {
  startContactVerification,
  submitOnlineBookingRequest,
  verifyContactCode,
  type ContactVerificationState,
  type OnlineBookingState,
} from "./actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input, Select, Textarea } from "@/components/ui/field";
import { MaskedInput } from "@/components/ui/masked-input";
import { isValidCPF, isValidPhoneBR } from "@/lib/validation/br";
import { cn } from "@/lib/utils";

export type PublicSchedule = {
  id: string;
  name: string;
  professionalId: string;
  professionalName: string;
  unitName: string;
  procedureIds: string[];
  minNoticeHours: number;
  maxDaysAhead: number;
  cancellationNoticeHours: number;
};

export type PublicProcedure = {
  id: string;
  name: string;
  durationMinutes: number;
  basePrice: number;
};

export type PublicInsurance = {
  id: string;
  name: string;
};

export type PublicSlot = {
  id: string;
  scheduleId: string;
  procedureId: string;
  startAt: string;
  dayKey: string;
  dateLabel: string;
  weekdayLabel: string;
  timeLabel: string;
  label: string;
};

type BookingStep = 1 | 2 | 3 | 4;

const initialState: OnlineBookingState = {};
const initialVerificationState: ContactVerificationState = {};
const visibleDayCount = 3;
const stepDefinitions = [
  { n: 1, label: "Profissional" },
  { n: 2, label: "Horário" },
  { n: 3, label: "Dados" },
  { n: 4, label: "Confirmar" },
] as const;

export function BookingForm({
  slug,
  schedules,
  procedures,
  insurances,
  requireContactVerification,
  verificationTtlMinutes,
}: {
  slug: string;
  schedules: PublicSchedule[];
  procedures: PublicProcedure[];
  insurances: PublicInsurance[];
  requireContactVerification: boolean;
  verificationTtlMinutes: number;
}) {
  const [state, action, pending] = useActionState(
    submitOnlineBookingRequest,
    initialState,
  );
  const [verificationState, startVerificationAction, startVerificationPending] =
    useActionState(startContactVerification, initialVerificationState);
  const [codeState, verifyCodeAction, verifyCodePending] = useActionState(
    verifyContactCode,
    initialVerificationState,
  );

  const [step, setStep] = useState<BookingStep>(1);
  // Direção da última troca de passo: o passo novo entra do lado para onde
  // se foi. Nula no primeiro passo, que não anima ao abrir a página.
  const [stepDirection, setStepDirection] = useState<"forward" | "back" | null>(
    null,
  );
  const stepEnterClass =
    stepDirection === "forward"
      ? "animate-step-forward"
      : stepDirection === "back"
        ? "animate-step-back"
        : "";
  const [stepError, setStepError] = useState("");
  // Com um único profissional (e uma única agenda dele) não há o que
  // escolher: já vem selecionado.
  const [professionalId, setProfessionalId] = useState(() => {
    const ids = [...new Set(schedules.map((item) => item.professionalId))];
    return ids.length === 1 ? ids[0] : "";
  });
  const [scheduleId, setScheduleId] = useState(() => {
    const ids = [...new Set(schedules.map((item) => item.professionalId))];
    if (ids.length !== 1) return "";
    const own = schedules.filter((item) => item.professionalId === ids[0]);
    return own.length === 1 ? own[0].id : "";
  });
  const [procedureId, setProcedureId] = useState("");
  // Serviço escolhido pelo botão "Agendar" da lista de serviços da página.
  const [preferredProcedureId, setPreferredProcedureId] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [selectedDayState, setSelectedDayState] = useState("");
  const [dayWindowStart, setDayWindowStart] = useState(0);
  const [slotId, setSlotId] = useState("");
  const [patientName, setPatientName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [cpf, setCpf] = useState("");
  const [insuranceId, setInsuranceId] = useState("");
  const [notes, setNotes] = useState("");
  const [lgpdConsent, setLgpdConsent] = useState(false);
  const [slots, setSlots] = useState<PublicSlot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotsError, setSlotsError] = useState("");
  const [slotsReloadKey, setSlotsReloadKey] = useState(0);
  const [reviewRefreshPending, setReviewRefreshPending] = useState(false);
  const [verificationChallengeContactKey, setVerificationChallengeContactKey] =
    useState("");

  const professionals = useMemo(() => {
    const grouped = new Map<
      string,
      { id: string; name: string; schedules: PublicSchedule[] }
    >();

    for (const schedule of schedules) {
      const professional = grouped.get(schedule.professionalId);
      if (professional) {
        professional.schedules.push(schedule);
      } else {
        grouped.set(schedule.professionalId, {
          id: schedule.professionalId,
          name: schedule.professionalName,
          schedules: [schedule],
        });
      }
    }

    return [...grouped.values()].sort((a, b) =>
      a.name.localeCompare(b.name, "pt-BR"),
    );
  }, [schedules]);

  const preferredProcedure = procedures.find(
    (procedure) => procedure.id === preferredProcedureId,
  );
  const orderedProfessionals = preferredProcedureId
    ? [...professionals].sort(
        (left, right) =>
          Number(
            right.schedules.some((schedule) =>
              schedule.procedureIds.includes(preferredProcedureId),
            ),
          ) -
          Number(
            left.schedules.some((schedule) =>
              schedule.procedureIds.includes(preferredProcedureId),
            ),
          ),
      )
    : professionals;
  const selectedProfessional = professionals.find(
    (professional) => professional.id === professionalId,
  );
  const professionalSchedules = selectedProfessional?.schedules ?? [];
  const selectedSchedule = professionalSchedules.find(
    (schedule) => schedule.id === scheduleId,
  );
  const allowedProcedureIds = new Set(selectedSchedule?.procedureIds ?? []);
  const availableProcedures = selectedSchedule
    ? procedures.filter((procedure) => allowedProcedureIds.has(procedure.id))
    : [];

  const matchingSlots = useMemo(
    () =>
      slots.filter(
        (slot) =>
          slot.scheduleId === scheduleId && slot.procedureId === procedureId,
      ),
    [procedureId, scheduleId, slots],
  );
  const slotsByDay = useMemo(() => {
    const map = new Map<string, PublicSlot[]>();
    for (const slot of matchingSlots) {
      const list = map.get(slot.dayKey) ?? [];
      list.push(slot);
      map.set(slot.dayKey, list);
    }
    return map;
  }, [matchingSlots]);
  const days = useMemo(
    () =>
      [...slotsByDay.entries()].map(([key, daySlots]) => ({
        key,
        dateLabel: daySlots[0].dateLabel,
        weekdayLabel: daySlots[0].weekdayLabel,
      })),
    [slotsByDay],
  );
  const visibleDays = days.slice(
    dayWindowStart,
    dayWindowStart + visibleDayCount,
  );
  const canMoveDayWindowBack = dayWindowStart > 0;
  const canMoveDayWindowForward =
    dayWindowStart + visibleDayCount < days.length;
  const selectedDay =
    days.find((day) => day.key === selectedDayState)?.key ?? days[0]?.key ?? "";
  const daySlots = slotsByDay.get(selectedDay) ?? [];
  const selectedSlot = matchingSlots.find((slot) => slot.id === slotId);
  const selectedProcedure = procedures.find((item) => item.id === procedureId);
  const selectedInsurance = insurances.find((item) => item.id === insuranceId);

  // O código sai pelo WhatsApp da clínica: o contato verificado é o telefone.
  const verificationDestination = phone;
  const verificationId =
    verificationState.verificationId ?? codeState.verificationId ?? "";
  const currentContactKey = buildContactKey(verificationDestination);
  const verifiedCurrentContact =
    Boolean(codeState.verified) &&
    Boolean(codeState.verificationId) &&
    Boolean(verificationState.verificationId) &&
    Boolean(currentContactKey) &&
    codeState.verificationId === verificationState.verificationId &&
    verificationChallengeContactKey === currentContactKey;

  useEffect(() => {
    if (state.success) toast.success(state.success);
  }, [state]);

  useEffect(() => {
    if (verificationState.success) toast.success(verificationState.success);
  }, [verificationState]);

  useEffect(() => {
    if (codeState.success) toast.success(codeState.success);
  }, [codeState]);

  useEffect(() => {
    if (!scheduleId || !procedureId) return;

    const controller = new AbortController();

    fetchPublicBookingSlots({
      slug,
      scheduleId,
      procedureId,
      signal: controller.signal,
    })
      .then(setSlots)
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setSlotsError(
          error instanceof Error
            ? error.message
            : "Não foi possível carregar os horários.",
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setSlotsLoading(false);
      });

    return () => controller.abort();
  }, [procedureId, scheduleId, slotsReloadKey, slug]);

  useEffect(() => {
    function onChooseService(event: Event) {
      const nextProcedureId = (event as CustomEvent<string>).detail;
      if (!procedures.some((procedure) => procedure.id === nextProcedureId)) {
        return;
      }
      setPreferredProcedureId(nextProcedureId);
      // Agenda já escolhida e oferecendo o serviço: ele entra direto.
      const schedule = schedules.find((item) => item.id === scheduleId);
      if (schedule?.procedureIds.includes(nextProcedureId)) {
        handleProcedureChange(nextProcedureId);
      }
    }
    window.addEventListener("booking:choose-service", onChooseService);
    return () =>
      window.removeEventListener("booking:choose-service", onChooseService);
  });

  function clearFieldError(key: string) {
    setStepError("");
    setFieldErrors((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  }

  function resetDateAndSlot() {
    setSelectedDayState("");
    setSlotId("");
    setDayWindowStart(0);
  }

  function handleProfessionalChange(nextProfessionalId: string) {
    const nextSchedules = schedules.filter(
      (schedule) => schedule.professionalId === nextProfessionalId,
    );
    const nextScheduleId =
      nextSchedules.length === 1 ? nextSchedules[0].id : "";
    const preferred =
      nextScheduleId &&
      nextSchedules[0].procedureIds.includes(preferredProcedureId)
        ? preferredProcedureId
        : "";
    setProfessionalId(nextProfessionalId);
    setScheduleId(nextScheduleId);
    setProcedureId(preferred);
    setSlots([]);
    setSlotsError("");
    setSlotsLoading(Boolean(preferred));
    resetDateAndSlot();
    setStepError("");
  }

  function handleScheduleChange(nextScheduleId: string) {
    const preferred = schedules
      .find((item) => item.id === nextScheduleId)
      ?.procedureIds.includes(preferredProcedureId)
      ? preferredProcedureId
      : "";
    setScheduleId(nextScheduleId);
    setProcedureId(preferred);
    setSlots([]);
    setSlotsError("");
    setSlotsLoading(Boolean(preferred));
    resetDateAndSlot();
    setStepError("");
  }

  function handleProcedureChange(nextProcedureId: string) {
    setProcedureId(nextProcedureId);
    setSlots([]);
    setSlotsError("");
    setSlotsLoading(Boolean(nextProcedureId && scheduleId));
    resetDateAndSlot();
    setStepError("");
  }

  function goToStep(nextStep: BookingStep) {
    setStepError("");
    setStepDirection(nextStep > step ? "forward" : "back");
    setStep(nextStep);
  }

  async function continueFromDetails() {
    const errors: Record<string, string> = {};
    if (patientName.trim().length < 2) errors.name = "Informe o nome completo.";
    if (!email.trim() && !phone.trim()) {
      errors.phone = "Informe um telefone ou um e-mail para contato.";
    }
    if (email.trim() && !isValidEmail(email)) {
      errors.email = "Confira o e-mail: falta algo, como o @ ou o domínio.";
    }
    if (phone.trim() && !isValidPhoneBR(phone)) {
      errors.phone = "Informe o telefone com DDD, ex.: (85) 99999-0000.";
    }
    if (requireContactVerification && !phone.trim()) {
      errors.phone = "Informe o WhatsApp para receber o código.";
    }
    if (cpf.trim() && !isValidCPF(cpf)) {
      errors.cpf = "CPF inválido. Confira os números ou deixe em branco.";
    }
    if (
      requireContactVerification &&
      !verifiedCurrentContact &&
      !errors.phone
    ) {
      errors.verification = "Confirme o código enviado pelo WhatsApp.";
    }
    if (!lgpdConsent) {
      errors.consent = "Marque a autorização para continuar.";
    }
    setFieldErrors(errors);
    const firstError = [
      ["name", "booking-name"],
      ["phone", "booking-phone"],
      ["email", "booking-email"],
      ["verification", "booking-verification"],
      ["cpf", "booking-cpf"],
      ["consent", "booking-consent"],
    ].find(([key]) => errors[key]);
    if (firstError) {
      document.getElementById(firstError[1])?.focus();
      return;
    }
    if (!selectedSlot || !scheduleId || !procedureId) {
      setSlotsError("Selecione novamente um horário disponível.");
      goToStep(2);
      return;
    }

    setReviewRefreshPending(true);
    setStepError("");
    try {
      const latestSlots = await fetchPublicBookingSlots({
        slug,
        scheduleId,
        procedureId,
      });
      setSlots(latestSlots);
      const slotStillAvailable = latestSlots.some(
        (slot) =>
          slot.id === selectedSlot.id && slot.startAt === selectedSlot.startAt,
      );
      if (!slotStillAvailable) {
        setSlotId("");
        setSlotsError(
          "Esse horário não está mais disponível. Escolha outro horário.",
        );
        goToStep(2);
        return;
      }
      goToStep(4);
    } catch (error) {
      setStepError(
        error instanceof Error
          ? error.message
          : "Não foi possível confirmar a disponibilidade do horário.",
      );
    } finally {
      setReviewRefreshPending(false);
    }
  }

  return (
    <Card className="min-w-0 overflow-hidden">
      <CardHeader className="relative min-w-0 border-0 pb-2 pl-[3.75rem] pt-4">
        <div className="flex min-w-0 items-center gap-2">
          <CalendarCheck
            className="absolute left-5 top-4 size-7 shrink-0 text-primary"
            aria-hidden="true"
          />
          <h2 className="text-base font-bold">Solicitar agendamento</h2>
        </div>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          A clínica confirma o horário antes de ele entrar na agenda.
        </p>
      </CardHeader>

      <BookingStepper step={state.accessToken ? 4 : step} />

      <CardContent className="min-w-0 overflow-hidden p-4">
        {state.accessToken ? (
          <BookingSuccess
            accessToken={state.accessToken}
            summary={[
              selectedProcedure?.name,
              selectedProfessional?.name,
              formatSlotLabel(selectedSlot?.label),
            ]
              .filter((item) => item && item !== "—")
              .join(" · ")}
          />
        ) : (
          <div className="min-w-0">
            {step === 1 ? (
              <section
                className={cn("grid min-w-0 gap-3", stepEnterClass)}
                aria-labelledby="step-1-title"
              >
                <div>
                  <h3 id="step-1-title" className="font-semibold">
                    Escolha o profissional
                  </h3>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    {preferredProcedure
                      ? `Serviço escolhido: ${preferredProcedure.name}. Quem oferece aparece primeiro.`
                      : "Depois você escolhe o serviço, o dia e o horário."}
                  </p>
                </div>

                {professionals.length ? (
                  // Cartões em vez de lista suspensa: o paciente vê todos os
                  // nomes de uma vez e toca no que quer.
                  <div
                    role="radiogroup"
                    aria-labelledby="step-1-title"
                    className="grid max-h-[26rem] min-w-0 gap-1.5 overflow-y-auto"
                  >
                    {orderedProfessionals.map((professional) => {
                      const selected = professional.id === professionalId;
                      const offersPreferred =
                        !preferredProcedureId ||
                        professional.schedules.some((schedule) =>
                          schedule.procedureIds.includes(preferredProcedureId),
                        );
                      return (
                        <button
                          key={professional.id}
                          type="button"
                          role="radio"
                          aria-checked={selected}
                          onClick={() =>
                            handleProfessionalChange(professional.id)
                          }
                          className={cn(
                            "flex min-w-0 items-center gap-4 rounded-lg border px-3 py-2 text-left transition-[border-color,background-color,box-shadow,scale] duration-[var(--motion-fast)] ease-[var(--ease-out)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary active:scale-[0.99] motion-reduce:active:scale-100",
                            selected
                              ? "border-primary bg-primary-muted/50 shadow-[var(--shadow-soft)]"
                              : "border-border bg-card hover:border-primary/50",
                          )}
                        >
                          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-muted text-primary">
                            <UserRound className="size-5" aria-hidden="true" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold">
                              {professional.name}
                            </span>
                            <span className="block truncate text-xs text-muted-foreground">
                              {offersPreferred
                                ? [
                                    ...new Set(
                                      professional.schedules.map(
                                        (schedule) => schedule.unitName,
                                      ),
                                    ),
                                  ].join(" · ")
                                : "Não oferece o serviço escolhido online"}
                            </span>
                          </span>
                          <span
                            aria-hidden="true"
                            className={cn(
                              "flex size-5 shrink-0 items-center justify-center rounded-full border transition-colors duration-[var(--motion-fast)]",
                              selected
                                ? "border-primary bg-primary text-primary-foreground"
                                : "border-border-strong",
                            )}
                          >
                            {selected ? <Check className="size-3" /> : null}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <p className="rounded-md border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
                    Nenhum profissional está disponível para agendamento online
                    no momento.
                  </p>
                )}

                <Button
                  type="button"
                  disabled={!professionalId}
                  onClick={() => goToStep(2)}
                  className="w-full"
                >
                  Continuar
                  <ChevronRight className="size-4" aria-hidden="true" />
                </Button>
              </section>
            ) : null}

            {step === 2 ? (
              <section
                className={cn("grid min-w-0 gap-4", stepEnterClass)}
                aria-labelledby="step-2-title"
              >
                <div className="min-w-0">
                  <h3 id="step-2-title" className="font-semibold">
                    Serviço, data e horário
                  </h3>
                  <p className="mt-1 truncate text-sm text-muted-foreground">
                    {selectedProfessional?.name}
                  </p>
                </div>

                {professionalSchedules.length > 1 ? (
                  <label className="grid min-w-0 gap-2 text-sm font-medium">
                    Local de atendimento
                    <Select
                      value={scheduleId}
                      onValueChange={handleScheduleChange}
                      className="min-w-0 w-full"
                    >
                      <option value="">Selecione o local</option>
                      {professionalSchedules.map((schedule) => (
                        <option key={schedule.id} value={schedule.id}>
                          {professionalSchedules.filter(
                            (item) => item.unitName === schedule.unitName,
                          ).length > 1
                            ? `${schedule.unitName} — ${schedule.name}`
                            : schedule.unitName}
                        </option>
                      ))}
                    </Select>
                  </label>
                ) : professionalSchedules[0] ? (
                  <p className="text-sm text-muted-foreground">
                    Local:{" "}
                    <span className="font-medium text-foreground">
                      {professionalSchedules[0].unitName}
                    </span>
                  </p>
                ) : null}

                <label className="grid min-w-0 gap-2 text-sm font-medium">
                  Serviço
                  <Select
                    value={procedureId}
                    onValueChange={handleProcedureChange}
                    disabled={!scheduleId}
                    className="min-w-0 w-full"
                  >
                    <option value="">Selecione um serviço</option>
                    {availableProcedures.map((procedure) => (
                      <option key={procedure.id} value={procedure.id}>
                        {procedure.name} · {procedure.durationMinutes} min
                      </option>
                    ))}
                  </Select>
                </label>

                {scheduleId && procedureId ? (
                  slotsLoading ? (
                    <div className="flex items-center justify-center gap-2 rounded-md border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
                      <LoaderCircle
                        className="size-4 animate-spin"
                        aria-hidden="true"
                      />
                      Consultando horários disponíveis...
                    </div>
                  ) : slotsError ? (
                    <div className="grid justify-items-center gap-3 rounded-md border border-dashed border-destructive/40 px-4 py-5 text-center text-sm text-destructive">
                      <p role="alert">{slotsError}</p>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          setSlots([]);
                          setSlotsError("");
                          setSlotsLoading(true);
                          setSlotsReloadKey((value) => value + 1);
                        }}
                      >
                        Tentar novamente
                      </Button>
                    </div>
                  ) : (
                    <AvailabilityPicker
                      days={days}
                      visibleDays={visibleDays}
                      selectedDay={selectedDay}
                      daySlots={daySlots}
                      selectedSlotId={slotId}
                      matchingSlotCount={matchingSlots.length}
                      selectedProcedure={selectedProcedure}
                      canMoveBack={canMoveDayWindowBack}
                      canMoveForward={canMoveDayWindowForward}
                      onMoveBack={() => {
                        const nextStart = Math.max(
                          0,
                          dayWindowStart - visibleDayCount,
                        );
                        setDayWindowStart(nextStart);
                        setSelectedDayState(days[nextStart]?.key ?? "");
                        setSlotId("");
                      }}
                      onMoveForward={() => {
                        const nextStart = Math.min(
                          Math.max(days.length - visibleDayCount, 0),
                          dayWindowStart + visibleDayCount,
                        );
                        setDayWindowStart(nextStart);
                        setSelectedDayState(days[nextStart]?.key ?? "");
                        setSlotId("");
                      }}
                      onSelectDay={(day) => {
                        setSelectedDayState(day);
                        setSlotId("");
                      }}
                      onSelectSlot={setSlotId}
                    />
                  )
                ) : (
                  <p className="rounded-md border border-dashed border-border px-4 py-5 text-center text-sm text-muted-foreground">
                    Selecione a agenda e o serviço para carregar as datas.
                  </p>
                )}

                <div className="flex min-w-0 gap-2 pt-1">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => goToStep(1)}
                    className="min-w-0 flex-1"
                  >
                    <ChevronLeft className="size-4" aria-hidden="true" />
                    Voltar
                  </Button>
                  <Button
                    type="button"
                    disabled={!selectedSlot}
                    onClick={() => goToStep(3)}
                    className="min-w-0 flex-1"
                  >
                    Continuar
                    <ChevronRight className="size-4" aria-hidden="true" />
                  </Button>
                </div>
              </section>
            ) : null}

            {step === 3 ? (
              <section
                className={cn("grid min-w-0 gap-4", stepEnterClass)}
                aria-labelledby="step-3-title"
              >
                <div>
                  <h3 id="step-3-title" className="font-semibold">
                    Seus dados
                  </h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    A clínica usará estas informações para confirmar o pedido.
                    Campos com <span className="text-destructive">*</span> são
                    obrigatórios.
                  </p>
                </div>

                <DetailsField
                  id="booking-name"
                  label="Nome completo"
                  required
                  error={fieldErrors.name}
                >
                  <Input
                    id="booking-name"
                    autoComplete="name"
                    value={patientName}
                    aria-invalid={Boolean(fieldErrors.name)}
                    aria-describedby={
                      fieldErrors.name ? "booking-name-error" : undefined
                    }
                    onChange={(event) => {
                      setPatientName(event.target.value);
                      clearFieldError("name");
                    }}
                  />
                </DetailsField>
                <DetailsField
                  id="booking-phone"
                  label="Telefone/WhatsApp"
                  required={requireContactVerification}
                  hint={
                    requireContactVerification
                      ? undefined
                      : "Informe telefone ou e-mail (pelo menos um)."
                  }
                  error={fieldErrors.phone}
                >
                  <MaskedInput
                    id="booking-phone"
                    maskKind="phone"
                    autoComplete="tel"
                    inputMode="tel"
                    placeholder="(00) 00000-0000"
                    value={phone}
                    aria-invalid={Boolean(fieldErrors.phone)}
                    aria-describedby={
                      fieldErrors.phone ? "booking-phone-error" : undefined
                    }
                    onValueChange={(value) => {
                      setPhone(value);
                      clearFieldError("phone");
                    }}
                  />
                </DetailsField>
                <DetailsField
                  id="booking-email"
                  label="E-mail"
                  optional={requireContactVerification}
                  error={fieldErrors.email}
                >
                  <Input
                    id="booking-email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    aria-invalid={Boolean(fieldErrors.email)}
                    aria-describedby={
                      fieldErrors.email ? "booking-email-error" : undefined
                    }
                    onChange={(event) => {
                      setEmail(event.target.value);
                      clearFieldError("email");
                      clearFieldError("phone");
                    }}
                  />
                </DetailsField>

                {requireContactVerification ? (
                  <div
                    id="booking-verification"
                    tabIndex={-1}
                    className="grid gap-2 outline-none"
                  >
                    <ContactVerification
                      slug={slug}
                      destination={verificationDestination}
                      verificationId={verificationId}
                      ttlMinutes={verificationTtlMinutes}
                      verified={verifiedCurrentContact}
                      startState={verificationState}
                      codeState={codeState}
                      startAction={startVerificationAction}
                      verifyAction={verifyCodeAction}
                      startPending={startVerificationPending}
                      verifyPending={verifyCodePending}
                      onStart={() =>
                        setVerificationChallengeContactKey(currentContactKey)
                      }
                    />
                    {fieldErrors.verification ? (
                      <p role="alert" className="text-sm text-destructive">
                        {fieldErrors.verification}
                      </p>
                    ) : null}
                  </div>
                ) : null}

                <DetailsField
                  id="booking-cpf"
                  label="CPF"
                  optional
                  error={fieldErrors.cpf}
                >
                  <MaskedInput
                    id="booking-cpf"
                    maskKind="cpf"
                    inputMode="numeric"
                    placeholder="000.000.000-00"
                    value={cpf}
                    aria-invalid={Boolean(fieldErrors.cpf)}
                    aria-describedby={
                      fieldErrors.cpf ? "booking-cpf-error" : undefined
                    }
                    onValueChange={(value) => {
                      setCpf(value);
                      clearFieldError("cpf");
                    }}
                  />
                </DetailsField>
                <DetailsField id="booking-insurance" label="Convênio" optional>
                  <Select
                    id="booking-insurance"
                    value={insuranceId}
                    onValueChange={setInsuranceId}
                    allowEmptyOption
                    className="min-w-0 w-full"
                  >
                    <option value="">Particular ou informar depois</option>
                    {insurances.map((insurance) => (
                      <option key={insurance.id} value={insurance.id}>
                        {insurance.name}
                      </option>
                    ))}
                  </Select>
                </DetailsField>
                <DetailsField id="booking-notes" label="Observações" optional>
                  <Textarea
                    id="booking-notes"
                    value={notes}
                    maxLength={500}
                    onChange={(event) => setNotes(event.target.value)}
                    placeholder="Algo que a clínica deva saber antes da consulta"
                  />
                </DetailsField>

                <div
                  id="booking-consent"
                  tabIndex={-1}
                  className={cn(
                    "grid min-w-0 gap-3 rounded-md border bg-muted/35 p-3 outline-none",
                    fieldErrors.consent
                      ? "border-destructive"
                      : "border-border",
                  )}
                >
                  <div className="flex min-w-0 items-start gap-2 text-sm text-muted-foreground">
                    <ShieldCheck
                      className="mt-0.5 size-4 shrink-0 text-primary"
                      aria-hidden="true"
                    />
                    <p className="min-w-0">
                      Seus dados serão usados somente para contato, confirmação
                      e registro do agendamento.
                    </p>
                  </div>
                  <Checkbox
                    checked={lgpdConsent}
                    onChange={(event) => {
                      setLgpdConsent(event.target.checked);
                      clearFieldError("consent");
                    }}
                    label="Autorizo o uso dos dados para tratar esta solicitação."
                  />
                  {fieldErrors.consent ? (
                    <p role="alert" className="text-sm text-destructive">
                      {fieldErrors.consent}
                    </p>
                  ) : null}
                </div>

                {stepError ? (
                  <p role="alert" className="text-sm text-destructive">
                    {stepError}
                  </p>
                ) : null}

                <div className="flex min-w-0 gap-2 pt-1">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => goToStep(2)}
                    className="min-w-0 flex-1"
                  >
                    <ChevronLeft className="size-4" aria-hidden="true" />
                    Voltar
                  </Button>
                  <Button
                    type="button"
                    onClick={continueFromDetails}
                    disabled={reviewRefreshPending}
                    className="min-w-0 flex-1"
                  >
                    {reviewRefreshPending ? (
                      <LoaderCircle
                        className="size-4 animate-spin"
                        aria-hidden="true"
                      />
                    ) : (
                      <ChevronRight className="size-4" aria-hidden="true" />
                    )}
                    {reviewRefreshPending ? "Verificando..." : "Revisar"}
                  </Button>
                </div>
              </section>
            ) : null}

            {step === 4 ? (
              <section
                className={cn("grid min-w-0 gap-4", stepEnterClass)}
                aria-labelledby="step-4-title"
              >
                <div>
                  <h3 id="step-4-title" className="font-semibold">
                    Revise e confirme
                  </h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Confira as informações antes de enviar a solicitação.
                  </p>
                </div>

                <ReviewBlock title="Agendamento">
                  <ReviewRow
                    label="Profissional"
                    value={selectedProfessional?.name ?? "—"}
                  />
                  <ReviewRow
                    label="Agenda"
                    value={
                      selectedSchedule
                        ? `${selectedSchedule.name} — ${selectedSchedule.unitName}`
                        : "—"
                    }
                  />
                  <ReviewRow
                    label="Serviço"
                    value={
                      selectedProcedure
                        ? `${selectedProcedure.name} · ${selectedProcedure.durationMinutes} min`
                        : "—"
                    }
                  />
                  <ReviewRow
                    label="Data e hora"
                    value={formatSlotLabel(selectedSlot?.label)}
                  />
                  {selectedProcedure ? (
                    <ReviewRow
                      label="Valor"
                      value={
                        selectedInsurance
                          ? `Pelo convênio ${selectedInsurance.name}`
                          : selectedProcedure.basePrice > 0
                            ? formatCurrency(selectedProcedure.basePrice)
                            : "A combinar com a clínica"
                      }
                    />
                  ) : null}
                </ReviewBlock>

                <ReviewBlock title="Contato">
                  <ReviewRow label="Nome" value={patientName} />
                  {email ? <ReviewRow label="E-mail" value={email} /> : null}
                  {phone ? <ReviewRow label="Telefone" value={phone} /> : null}
                  <ReviewRow
                    label="Convênio"
                    value={selectedInsurance?.name ?? "Particular"}
                  />
                  {notes ? (
                    <ReviewRow label="Observações" value={notes} />
                  ) : null}
                </ReviewBlock>

                <div className="flex min-w-0 items-start gap-2 rounded-md bg-muted/40 p-3 text-xs text-muted-foreground">
                  <Clock3
                    className="mt-0.5 size-3.5 shrink-0"
                    aria-hidden="true"
                  />
                  <span>
                    A solicitação respeita a janela mínima de{" "}
                    {selectedSchedule?.minNoticeHours ?? 0}h e máxima de{" "}
                    {selectedSchedule?.maxDaysAhead ?? 0} dias desta agenda.
                  </span>
                </div>

                <form action={action} className="grid min-w-0 gap-3">
                  <input type="hidden" name="slug" value={slug} />
                  <input type="hidden" name="schedule_id" value={scheduleId} />
                  <input
                    type="hidden"
                    name="procedure_id"
                    value={procedureId}
                  />
                  <input
                    type="hidden"
                    name="start_at"
                    value={selectedSlot?.startAt ?? ""}
                  />
                  <input
                    type="hidden"
                    name="patient_name"
                    value={patientName}
                  />
                  <input type="hidden" name="patient_email" value={email} />
                  <input type="hidden" name="patient_phone" value={phone} />
                  <input type="hidden" name="patient_cpf" value={cpf} />
                  <input
                    type="hidden"
                    name="health_insurance_id"
                    value={insuranceId}
                  />
                  <input type="hidden" name="patient_notes" value={notes} />
                  <input
                    type="hidden"
                    name="lgpd_consent"
                    value={lgpdConsent ? "on" : ""}
                  />

                  {state.error ? (
                    <p role="alert" className="text-sm text-destructive">
                      {state.error}
                    </p>
                  ) : null}

                  <div className="flex min-w-0 gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => goToStep(3)}
                      disabled={pending}
                      className="min-w-0 flex-1"
                    >
                      <ChevronLeft className="size-4" aria-hidden="true" />
                      Voltar
                    </Button>
                    <Button
                      type="submit"
                      disabled={pending || !selectedSlot}
                      className="min-w-0 flex-1"
                    >
                      {pending ? "Enviando..." : "Confirmar pedido"}
                    </Button>
                  </div>
                </form>
              </section>
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function AvailabilityPicker({
  days,
  visibleDays,
  selectedDay,
  daySlots,
  selectedSlotId,
  matchingSlotCount,
  selectedProcedure,
  canMoveBack,
  canMoveForward,
  onMoveBack,
  onMoveForward,
  onSelectDay,
  onSelectSlot,
}: {
  days: Array<{ key: string; dateLabel: string; weekdayLabel: string }>;
  visibleDays: Array<{ key: string; dateLabel: string; weekdayLabel: string }>;
  selectedDay: string;
  daySlots: PublicSlot[];
  selectedSlotId: string;
  matchingSlotCount: number;
  selectedProcedure: PublicProcedure | undefined;
  canMoveBack: boolean;
  canMoveForward: boolean;
  onMoveBack: () => void;
  onMoveForward: () => void;
  onSelectDay: (day: string) => void;
  onSelectSlot: (slotId: string) => void;
}) {
  const selectedDayInfo = days.find((day) => day.key === selectedDay);
  return (
    <div className="grid min-w-0 gap-3">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <span className="text-sm font-medium">Horários disponíveis</span>
        <Badge variant="neutral">{matchingSlotCount}</Badge>
        {selectedProcedure && selectedProcedure.basePrice > 0 ? (
          <Badge variant="primary">
            {formatCurrency(selectedProcedure.basePrice)}
          </Badge>
        ) : null}
      </div>

      {days.length ? (
        <div className="min-w-0 overflow-hidden rounded-lg border border-border bg-muted/25 p-2.5">
          <div className="flex min-w-0 items-center gap-1.5">
            <Button
              type="button"
              variant="secondary"
              size="icon"
              aria-label="Dias anteriores"
              disabled={!canMoveBack}
              onClick={onMoveBack}
              className="size-9 shrink-0"
            >
              <ChevronLeft className="size-4" aria-hidden="true" />
            </Button>
            <div className="grid min-w-0 flex-1 grid-cols-3 gap-1.5">
              {visibleDays.map((day) => (
                <Button
                  key={day.key}
                  type="button"
                  variant="secondary"
                  onClick={() => onSelectDay(day.key)}
                  aria-pressed={day.key === selectedDay}
                  aria-label={`${day.weekdayLabel}, ${day.dateLabel}`}
                  className={cn(
                    "h-auto min-w-0 flex-col gap-0 overflow-hidden px-1 py-2",
                    day.key === selectedDay
                      ? "border-primary bg-primary text-primary-foreground hover:border-primary hover:bg-primary"
                      : "hover:border-primary/50 hover:bg-primary-muted",
                  )}
                >
                  <span className="w-full truncate text-caption font-semibold uppercase opacity-80">
                    {day.weekdayLabel}
                  </span>
                  <span className="text-control font-semibold tabular-nums">
                    {day.dateLabel}
                  </span>
                </Button>
              ))}
            </div>
            <Button
              type="button"
              variant="secondary"
              size="icon"
              aria-label="Próximos dias"
              disabled={!canMoveForward}
              onClick={onMoveForward}
              className="size-9 shrink-0"
            >
              <ChevronRight className="size-4" aria-hidden="true" />
            </Button>
          </div>

          <div className="mt-3 min-w-0 border-t border-border pt-3">
            <p className="mb-2 truncate text-xs font-medium text-muted-foreground">
              {selectedDayInfo
                ? `Horários de ${selectedDayInfo.weekdayLabel}, ${selectedDayInfo.dateLabel}`
                : "Horários"}
            </p>
            <div className="grid min-w-0 grid-cols-3 gap-2">
              {daySlots.map((slot) => (
                <Button
                  key={slot.id}
                  type="button"
                  variant="secondary"
                  onClick={() => onSelectSlot(slot.id)}
                  aria-pressed={slot.id === selectedSlotId}
                  className={cn(
                    "min-w-0 px-1.5 py-2 text-control font-medium tabular-nums",
                    slot.id === selectedSlotId
                      ? "border-primary bg-primary text-primary-foreground hover:border-primary hover:bg-primary"
                      : "hover:border-primary/50 hover:bg-primary-muted",
                  )}
                >
                  <span className="truncate">{slot.timeLabel}</span>
                </Button>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <p className="rounded-md border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
          Nenhum horário disponível para esta combinação. Tente outra agenda ou
          outro serviço.
        </p>
      )}
    </div>
  );
}

function ContactVerification({
  slug,
  destination,
  verificationId,
  ttlMinutes,
  verified,
  startState,
  codeState,
  startAction,
  verifyAction,
  startPending,
  verifyPending,
  onStart,
}: {
  slug: string;
  destination: string;
  verificationId: string;
  ttlMinutes: number;
  verified: boolean;
  startState: ContactVerificationState;
  codeState: ContactVerificationState;
  startAction: (payload: FormData) => void;
  verifyAction: (payload: FormData) => void;
  startPending: boolean;
  verifyPending: boolean;
  onStart: () => void;
}) {
  const phoneReady = isValidPhoneBR(destination);
  return (
    <div className="grid min-w-0 gap-3 rounded-md border border-border bg-muted/35 p-3">
      <div className="flex min-w-0 items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2">
          <KeyRound
            className="mt-0.5 size-4 shrink-0 text-primary"
            aria-hidden="true"
          />
          <div className="min-w-0">
            <p className="text-sm font-medium">Confirme seu WhatsApp</p>
            <p className="text-xs text-muted-foreground">
              {phoneReady
                ? `Enviaremos um código de 6 dígitos para ${destination}. Ele vale por ${ttlMinutes} minutos.`
                : "Preencha o telefone acima para receber o código pelo WhatsApp."}
            </p>
          </div>
        </div>
        <Badge variant={verified ? "success" : "warning"}>
          {verified ? "Confirmado" : "Pendente"}
        </Badge>
      </div>

      {!verified ? (
        <form
          action={startAction}
          onSubmit={onStart}
          className="grid min-w-0 gap-2"
        >
          <input type="hidden" name="slug" value={slug} />
          <input type="hidden" name="destination" value={destination} />
          {startState.deliveryDebugCode ? (
            <p className="text-sm font-medium text-primary">
              Código de teste: {startState.deliveryDebugCode}
            </p>
          ) : null}
          <Button
            type="submit"
            variant={verificationId ? "secondary" : "primary"}
            disabled={startPending || !phoneReady}
            className="w-full"
          >
            {startPending
              ? "Enviando..."
              : verificationId
                ? "Enviar outro código"
                : "Enviar código pelo WhatsApp"}
          </Button>
          {startState.error ? (
            <p role="alert" className="text-sm text-destructive">
              {startState.error}
            </p>
          ) : null}
        </form>
      ) : null}

      {verificationId && !verified ? (
        <form
          action={verifyAction}
          className="grid min-w-0 gap-3 border-t border-border pt-3"
        >
          <input type="hidden" name="verification_id" value={verificationId} />
          <label className="grid min-w-0 gap-2 text-sm font-medium">
            Código recebido
            <Input
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              pattern="[0-9]{6}"
              placeholder="000000"
              className="tabular-nums tracking-[0.3em]"
              required
            />
          </label>
          <Button
            type="submit"
            variant="secondary"
            disabled={verifyPending}
            className="w-full"
          >
            {verifyPending ? "Confirmando..." : "Confirmar código"}
          </Button>
          {codeState.error ? (
            <p role="alert" className="text-sm text-destructive">
              {codeState.error}
            </p>
          ) : null}
        </form>
      ) : null}
    </div>
  );
}

function DetailsField({
  children,
  error,
  hint,
  id,
  label,
  optional,
  required,
}: {
  children: React.ReactNode;
  error?: string;
  hint?: string;
  id: string;
  label: string;
  optional?: boolean;
  required?: boolean;
}) {
  return (
    <div className="grid min-w-0 gap-2">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
        {required ? (
          <span className="text-destructive" aria-hidden="true">
            {" "}
            *
          </span>
        ) : null}
        {optional ? (
          <span className="font-normal text-muted-foreground"> (opcional)</span>
        ) : null}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

function BookingStepper({ step }: { step: BookingStep }) {
  return (
    <div
      className="grid grid-cols-4 border-b border-border px-2 pb-4 pt-2"
      aria-label="Etapas do agendamento"
    >
      {stepDefinitions.map((definition, index) => (
        <div
          key={definition.n}
          className="relative flex min-w-0 flex-col items-center gap-1.5 text-center"
          aria-current={definition.n === step ? "step" : undefined}
        >
          {index > 0 ? (
            <span
              className={cn(
                "absolute right-[calc(50%+1.5rem)] top-3.5 z-0 h-px w-[calc(100%-3rem)] bg-border-strong",
                definition.n <= step && "bg-primary/40",
              )}
              aria-hidden="true"
            />
          ) : null}
          <span
            className={cn(
              "relative z-10 flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
              definition.n < step
                ? "bg-success text-white"
                : definition.n === step
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground",
            )}
          >
            {definition.n < step ? (
              <Check className="size-3.5" aria-hidden="true" />
            ) : (
              definition.n
            )}
          </span>
          <span
            className={cn(
              "w-full truncate px-0.5 text-caption font-medium sm:text-xs",
              definition.n === step
                ? "text-foreground"
                : "text-muted-foreground",
            )}
          >
            {definition.label}
          </span>
        </div>
      ))}
    </div>
  );
}

function ReviewBlock({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid min-w-0 gap-2 rounded-lg border border-border p-3">
      <p className="text-sm font-semibold">{title}</p>
      <dl className="grid min-w-0 gap-2">{children}</dl>
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid min-w-0 gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words text-sm font-medium">{value}</dd>
    </div>
  );
}

function BookingSuccess({
  accessToken,
  summary,
}: {
  accessToken: string;
  summary: string;
}) {
  const router = useRouter();
  const [isNavigating, startNavigation] = useTransition();

  function followBooking() {
    startNavigation(() => {
      router.push(`/agendar/acompanhar/${accessToken}`);
    });
  }

  return (
    // O único momento de encanto do fluxo, e raro: uma vez por agendamento.
    // O selo cresce até o lugar e o texto vem logo depois, sem repetir.
    <div className="grid min-w-0 gap-4 py-2 text-center">
      <span className="mx-auto flex size-12 animate-success-pop items-center justify-center rounded-full bg-success-muted text-success-foreground">
        <Check className="size-6" aria-hidden="true" />
      </span>
      <div className="animate-content-enter [animation-delay:60ms]">
        <h3 className="font-semibold">Solicitação registrada</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          A clínica entrará em contato para confirmar o horário.
        </p>
        {summary ? (
          <p className="mt-3 rounded-md bg-muted/50 px-3 py-2 text-sm font-medium">
            {summary}
          </p>
        ) : null}
      </div>
      <Button
        type="button"
        className="w-full"
        disabled={isNavigating}
        onClick={followBooking}
      >
        {isNavigating ? (
          <>
            <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
            Abrindo solicitação...
          </>
        ) : (
          "Acompanhar solicitação"
        )}
      </Button>
    </div>
  );
}

async function fetchPublicBookingSlots({
  slug,
  scheduleId,
  procedureId,
  signal,
}: {
  slug: string;
  scheduleId: string;
  procedureId: string;
  signal?: AbortSignal;
}) {
  const query = new URLSearchParams({
    slug,
    schedule_id: scheduleId,
    procedure_id: procedureId,
  });
  let response: Response;
  try {
    response = await fetch(`/api/public-booking/slots?${query}`, {
      cache: "no-store",
      signal,
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    // Sem conexão o navegador rejeita com "Failed to fetch", que chegava
    // assim, em inglês, à tela do paciente.
    throw new Error(
      "Não foi possível carregar os horários. Verifique sua conexão e tente de novo.",
    );
  }
  const payload = (await response.json().catch(() => null)) as {
    error?: unknown;
    slots?: unknown;
  } | null;

  if (!response.ok) {
    throw new Error(
      typeof payload?.error === "string"
        ? payload.error
        : "Não foi possível carregar os horários.",
    );
  }
  if (!Array.isArray(payload?.slots)) {
    throw new Error("A resposta de horários recebida é inválida.");
  }

  return payload.slots.filter(isPublicSlot);
}

function isPublicSlot(value: unknown): value is PublicSlot {
  if (!value || typeof value !== "object") return false;
  const slot = value as Record<string, unknown>;
  return [
    "id",
    "scheduleId",
    "procedureId",
    "startAt",
    "dayKey",
    "dateLabel",
    "weekdayLabel",
    "timeLabel",
    "label",
  ].every((key) => typeof slot[key] === "string");
}

function buildContactKey(destination: string) {
  return destination.replace(/D/g, "");
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function formatSlotLabel(value: string | undefined) {
  return value?.replace(" as ", " às ") ?? "—";
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number(value) || 0);
}
