"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  CalendarCheck,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  KeyRound,
  ShieldCheck,
} from "lucide-react";
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
import { cn } from "@/lib/utils";

export type PublicSchedule = {
  id: string;
  name: string;
  professionalName: string;
  unitName: string;
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
  label: string;
};

const initialState: OnlineBookingState = {};
const initialVerificationState: ContactVerificationState = {};
const stepDefinitions = [
  { n: 1, label: "Selecionar" },
  { n: 2, label: "Preencher" },
  { n: 3, label: "Confirmar" },
] as const;

export function BookingForm({
  slug,
  schedules,
  procedures,
  insurances,
  slots,
  minNoticeHours,
  maxDaysAhead,
  requireContactVerification,
  verificationTtlMinutes,
}: {
  slug: string;
  schedules: PublicSchedule[];
  procedures: PublicProcedure[];
  insurances: PublicInsurance[];
  slots: PublicSlot[];
  minNoticeHours: number;
  maxDaysAhead: number;
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
  const [scheduleId, setScheduleId] = useState(schedules[0]?.id ?? "");
  const [procedureId, setProcedureId] = useState(procedures[0]?.id ?? "");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [verificationContactType, setVerificationContactType] = useState<
    "email" | "phone"
  >("email");
  const [verificationChallengeContactKey, setVerificationChallengeContactKey] =
    useState("");
  const [selectedDayState, setSelectedDayState] = useState("");
  const [dayWindowStart, setDayWindowStart] = useState(0);
  const [slotIdState, setSlotId] = useState("");
  const [prevSelection, setPrevSelection] = useState({
    procedureId,
    scheduleId,
  });

  if (
    prevSelection.procedureId !== procedureId ||
    prevSelection.scheduleId !== scheduleId
  ) {
    setPrevSelection({ procedureId, scheduleId });
    setSelectedDayState("");
    setSlotId("");
    setDayWindowStart(0);
  }

  const matchingSlots = useMemo(
    () =>
      slots.filter(
        (slot) =>
          slot.scheduleId === scheduleId && slot.procedureId === procedureId,
      ),
    [procedureId, scheduleId, slots],
  );
  const slotsByDay = useMemo(() => {
    const map = new Map<string, Array<PublicSlot & { timeLabel: string }>>();
    for (const slot of matchingSlots) {
      const [dayLabel, timeLabel] = slot.label.split(" as ");
      const list = map.get(dayLabel) ?? [];
      list.push({ ...slot, timeLabel });
      map.set(dayLabel, list);
    }
    return map;
  }, [matchingSlots]);
  const days = useMemo(
    () =>
      [...slotsByDay.entries()].map(([key, daySlots]) => ({
        key,
        dateLabel: key.slice(0, 5),
        weekdayLabel: new Intl.DateTimeFormat("pt-BR", {
          weekday: "short",
        }).format(new Date(daySlots[0].startAt)),
      })),
    [slotsByDay],
  );
  const visibleDayCount = 5;
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
  const selectedSlot =
    daySlots.find((slot) => slot.id === slotIdState) ?? daySlots[0];
  const selectedSlotId = selectedSlot?.id ?? "";
  const selectedProcedure = procedures.find((item) => item.id === procedureId);
  const verificationDestination =
    verificationContactType === "email" ? email : phone;
  const verificationId =
    verificationState.verificationId ?? codeState.verificationId ?? "";
  const currentContactKey = buildContactKey(
    verificationContactType,
    verificationDestination,
  );
  const verifiedCurrentContact =
    Boolean(codeState.verified) &&
    Boolean(codeState.verificationId) &&
    Boolean(verificationState.verificationId) &&
    Boolean(currentContactKey) &&
    codeState.verificationId === verificationState.verificationId &&
    verificationChallengeContactKey === currentContactKey;
  const currentStep = state.accessToken ? 3 : selectedSlot ? 2 : 1;

  useEffect(() => {
    if (state.success) toast.success(state.success);
  }, [state]);

  useEffect(() => {
    if (verificationState.success) toast.success(verificationState.success);
  }, [verificationState]);

  useEffect(() => {
    if (codeState.success) toast.success(codeState.success);
  }, [codeState]);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <CalendarCheck className="size-5 text-primary" aria-hidden="true" />
          <h2 className="font-semibold">Solicitar agendamento</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          A clínica confirma o horário antes de ele entrar na agenda.
        </p>
      </CardHeader>

      <BookingStepper step={currentStep} />

      <CardContent>
        <div className="grid gap-4">
          {requireContactVerification ? (
            <div className="grid gap-3 rounded-md border border-border bg-muted/35 p-3">
              <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                <div className="flex items-start gap-2">
                  <KeyRound
                    className="mt-0.5 size-4 shrink-0 text-primary"
                    aria-hidden="true"
                  />
                  <div>
                    <p className="text-sm font-medium">
                      Verificação de contato
                    </p>
                    <p className="text-xs text-muted-foreground">
                      O código vale por {verificationTtlMinutes} minutos.
                    </p>
                  </div>
                </div>
                <Badge variant={verifiedCurrentContact ? "success" : "warning"}>
                  {verifiedCurrentContact ? "Verificado" : "Pendente"}
                </Badge>
              </div>

              <form
                action={startVerificationAction}
                onSubmit={() =>
                  setVerificationChallengeContactKey(currentContactKey)
                }
                className="grid gap-3 md:grid-cols-[160px_minmax(0,1fr)_auto]"
              >
                <input type="hidden" name="slug" value={slug} />
                <input
                  type="hidden"
                  name="destination"
                  value={verificationDestination}
                />
                <label className="grid gap-2 text-sm font-medium">
                  Canal
                  <Select
                    name="contact_type"
                    value={verificationContactType}
                    onValueChange={(nextValue) =>
                      setVerificationContactType(nextValue as "email" | "phone")
                    }
                  >
                    <option value="email">E-mail</option>
                    <option value="phone">Telefone</option>
                  </Select>
                </label>
                <div className="grid content-end gap-1 text-sm">
                  <span className="text-xs text-muted-foreground">
                    {verificationDestination ||
                      "Preencha o contato abaixo antes de gerar o código."}
                  </span>
                  {verificationState.deliveryDebugCode ? (
                    <span className="font-medium text-primary">
                      Código gerado: {verificationState.deliveryDebugCode}
                    </span>
                  ) : null}
                </div>
                <Button
                  type="submit"
                  disabled={
                    startVerificationPending ||
                    verificationDestination.length < 3
                  }
                  className="self-end"
                >
                  Gerar código
                </Button>
                {verificationState.error ? (
                  <p className="text-sm text-destructive md:col-span-3">
                    {verificationState.error}
                  </p>
                ) : null}
              </form>

              <form
                action={verifyCodeAction}
                className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]"
              >
                <input
                  type="hidden"
                  name="verification_id"
                  value={verificationId}
                />
                <label className="grid gap-2 text-sm font-medium">
                  Código de 6 dígitos
                  <Input
                    name="code"
                    inputMode="numeric"
                    maxLength={6}
                    pattern="[0-9]{6}"
                    disabled={!verificationId}
                  />
                </label>
                <Button
                  type="submit"
                  variant="secondary"
                  disabled={verifyCodePending || !verificationId}
                  className="self-end"
                >
                  Validar código
                </Button>
                {codeState.error ? (
                  <p className="text-sm text-destructive md:col-span-2">
                    {codeState.error}
                  </p>
                ) : null}
              </form>
            </div>
          ) : null}

          <form action={action} className="grid gap-4 md:grid-cols-2">
            <input type="hidden" name="slug" value={slug} />
            <input
              type="hidden"
              name="start_at"
              value={selectedSlot?.startAt ?? ""}
            />

            <label className="grid gap-2 text-sm font-medium">
              Profissional e unidade
              <Select
                name="schedule_id"
                value={scheduleId}
                onValueChange={setScheduleId}
                required
              >
                {schedules.map((schedule) => (
                  <option key={schedule.id} value={schedule.id}>
                    {schedule.professionalName} - {schedule.unitName}
                  </option>
                ))}
              </Select>
            </label>

            <label className="grid gap-2 text-sm font-medium">
              Procedimento
              <Select
                name="procedure_id"
                value={procedureId}
                onValueChange={setProcedureId}
                required
              >
                {procedures.map((procedure) => (
                  <option key={procedure.id} value={procedure.id}>
                    {procedure.name} ({procedure.durationMinutes} min)
                  </option>
                ))}
              </Select>
            </label>

            <div className="grid gap-3 md:col-span-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium">
                  Horários disponíveis
                </span>
                <Badge variant="neutral">{matchingSlots.length}</Badge>
                {selectedProcedure ? (
                  <Badge variant="primary">
                    {formatCurrency(selectedProcedure.basePrice)}
                  </Badge>
                ) : null}
              </div>

              {days.length ? (
                <div className="rounded-lg border border-border bg-muted/25 p-3">
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      size="icon"
                      aria-label="Dias anteriores"
                      disabled={!canMoveDayWindowBack}
                      onClick={() => {
                        const nextStart = Math.max(
                          0,
                          dayWindowStart - visibleDayCount,
                        );
                        setDayWindowStart(nextStart);
                        setSelectedDayState(days[nextStart]?.key ?? "");
                        setSlotId("");
                      }}
                      className="shrink-0"
                    >
                      <ChevronLeft className="size-4" aria-hidden="true" />
                    </Button>
                    <div className="grid flex-1 grid-cols-2 gap-2 sm:grid-cols-5">
                      {visibleDays.map((day) => (
                        <Button
                          key={day.key}
                          type="button"
                          variant="secondary"
                          onClick={() => {
                            setSelectedDayState(day.key);
                            setSlotId("");
                          }}
                          className={cn(
                            "flex h-auto min-h-16 flex-col items-center justify-center gap-0 px-2 py-2",
                            day.key === selectedDay
                              ? "border-primary bg-primary text-primary-foreground hover:border-primary hover:bg-primary"
                              : "hover:border-primary/50 hover:bg-primary-muted",
                          )}
                        >
                          <span className="text-caption font-semibold uppercase opacity-80">
                            {day.weekdayLabel}
                          </span>
                          <span className="text-sm font-semibold tabular-nums">
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
                      disabled={!canMoveDayWindowForward}
                      onClick={() => {
                        const nextStart = Math.min(
                          Math.max(days.length - visibleDayCount, 0),
                          dayWindowStart + visibleDayCount,
                        );
                        setDayWindowStart(nextStart);
                        setSelectedDayState(days[nextStart]?.key ?? "");
                        setSlotId("");
                      }}
                      className="shrink-0"
                    >
                      <ChevronRight className="size-4" aria-hidden="true" />
                    </Button>
                  </div>

                  <div className="mt-4 border-t border-border pt-3">
                    <p className="mb-2 text-xs font-medium text-muted-foreground">
                      Horários em {selectedDay}
                    </p>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {daySlots.map((slot) => (
                        <Button
                          key={slot.id}
                          type="button"
                          variant="secondary"
                          onClick={() => setSlotId(slot.id)}
                          className={cn(
                            "h-auto px-3 py-2 font-medium tabular-nums",
                            slot.id === selectedSlotId
                              ? "border-primary bg-primary text-primary-foreground hover:border-primary hover:bg-primary"
                              : "hover:border-primary/50 hover:bg-primary-muted",
                          )}
                        >
                          {slot.timeLabel}
                        </Button>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <p className="rounded-md border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
                  Nenhum horário disponível para esta combinação. Tente outro
                  profissional ou procedimento.
                </p>
              )}
            </div>

            <label className="grid gap-2 text-sm font-medium">
              Nome completo
              <Input name="patient_name" autoComplete="name" required />
            </label>
            <label className="grid gap-2 text-sm font-medium">
              E-mail
              <Input
                name="patient_email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </label>
            <label className="grid gap-2 text-sm font-medium">
              Telefone/WhatsApp
              <Input
                name="patient_phone"
                autoComplete="tel"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
              />
            </label>
            <label className="grid gap-2 text-sm font-medium">
              CPF
              <Input name="patient_cpf" inputMode="numeric" />
            </label>
            <label className="grid gap-2 text-sm font-medium md:col-span-2">
              Convênio
              <Select
                name="health_insurance_id"
                defaultValue=""
                allowEmptyOption
              >
                <option value="">Particular ou informar depois</option>
                {insurances.map((insurance) => (
                  <option key={insurance.id} value={insurance.id}>
                    {insurance.name}
                  </option>
                ))}
              </Select>
            </label>
            <label className="grid gap-2 text-sm font-medium md:col-span-2">
              Observações
              <Textarea name="patient_notes" placeholder="Opcional" />
            </label>

            <div className="grid gap-3 rounded-md border border-border bg-muted/35 p-3 md:col-span-2">
              <div className="flex items-start gap-2 text-sm text-muted-foreground">
                <ShieldCheck
                  className="mt-0.5 size-4 shrink-0 text-primary"
                  aria-hidden="true"
                />
                <p>
                  Seus dados serão usados para contato, confirmação e registro
                  do agendamento. Conteúdo clínico não deve ser enviado neste
                  formulário.
                </p>
              </div>
              <Checkbox
                name="lgpd_consent"
                required
                label="Autorizo o uso dos dados para tratar esta solicitação."
              />
            </div>

            <div className="flex flex-col gap-3 md:col-span-2 md:flex-row md:items-center md:justify-between">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Clock3 className="size-3.5" aria-hidden="true" />
                <span>
                  Janela: mínimo {minNoticeHours}h e até {maxDaysAhead} dias.
                </span>
              </div>
              <Button
                type="submit"
                disabled={
                  pending ||
                  !selectedSlot ||
                  (requireContactVerification && !verifiedCurrentContact)
                }
                className="h-10 px-5"
              >
                {pending ? "Enviando..." : "Enviar solicitação"}
              </Button>
            </div>

            {state.error ? (
              <p className="text-sm text-destructive md:col-span-2">
                {state.error}
              </p>
            ) : null}
            {state.accessToken ? (
              <div className="rounded-md border border-success-muted bg-success-muted p-3 text-sm md:col-span-2">
                <p className="font-medium text-success-foreground">
                  Solicitação registrada.
                </p>
                <Link
                  className="mt-1 inline-flex text-primary underline-offset-4 hover:underline"
                  href={`/agendar/acompanhar/${state.accessToken}`}
                >
                  Acompanhar, cancelar ou remarcar esta solicitação
                </Link>
              </div>
            ) : null}
            {!slots.length ? (
              <p className="text-sm text-muted-foreground md:col-span-2">
                Nenhum horário público disponível no momento.
              </p>
            ) : null}
          </form>
        </div>
      </CardContent>
    </Card>
  );
}

function BookingStepper({ step }: { step: 1 | 2 | 3 }) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border px-5 py-3">
      {stepDefinitions.map((definition, index) => (
        <div key={definition.n} className="flex items-center gap-2">
          <div
            className={cn(
              "flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
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
          </div>
          <span
            className={cn(
              "text-xs font-medium",
              definition.n === step
                ? "text-foreground"
                : "text-muted-foreground",
            )}
          >
            {definition.label}
          </span>
          {index < stepDefinitions.length - 1 ? (
            <div className="h-px w-6 bg-border" aria-hidden="true" />
          ) : null}
        </div>
      ))}
    </div>
  );
}

function buildContactKey(contactType: "email" | "phone", destination: string) {
  if (contactType === "email") return destination.trim().toLowerCase();
  return destination.replace(/\D/g, "");
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number(value) || 0);
}
