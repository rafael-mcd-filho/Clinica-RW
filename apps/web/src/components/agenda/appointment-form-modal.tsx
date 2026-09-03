"use client";

import { useActionState, useCallback, useMemo, useState } from "react";
import { ArrowsClockwise as RefreshCw } from "@phosphor-icons/react";
import { toast } from "sonner";
import {
  createAppointment,
  createQuickPatientFromAgenda,
  type AgendaActionState,
} from "@/app/(app)/agenda/actions";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/field";
import { Checkbox } from "@/components/ui/checkbox";
import { DatePickerInput } from "@/components/ui/date-picker-input";
import { Modal } from "@/components/ui/modal";
import { PatientSearchField } from "@/components/patient-search-field";
import {
  addMinutesToTime,
  dayHasSchedule,
  defaultAppointmentDateTime,
  findNextFreeSlot,
  formatPartialTime,
  listFreeSlotsForDay,
  localDateKey,
  normalizeTimeValue,
  resolveListPrice,
  type AppointmentFormData,
} from "@/lib/agenda/slots";

const initialState: AgendaActionState = {};

/**
 * O formulário de novo agendamento, um só para o sistema inteiro.
 *
 * A agenda, o painel de contato do atendimento e a fila de espera montam o
 * mesmo modal: mudar um campo aqui muda nos três lugares, que é justamente o
 * que se perdia quando cada tela mantinha a sua cópia. Quem chama entrega os
 * catálogos e a grade (`data`); com um paciente fixo (`patient`) a busca some e
 * o vínculo já vai resolvido.
 *
 * Os `default*` só valem na montagem: quem reaproveita o modal para outro
 * paciente deve trocar a `key` para o formulário nascer de novo.
 */
export function AppointmentFormModal({
  open,
  onClose,
  data,
  canExtra = false,
  canCreatePatient = false,
  patient = null,
  title = "Novo agendamento",
  defaultScheduleId = "",
  defaultProcedureId = "",
  defaultExtra = false,
  waitlistEntryId = null,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  data: AppointmentFormData;
  canExtra?: boolean;
  canCreatePatient?: boolean;
  /** Paciente já definido (criação a partir de um contato/conversa). */
  patient?: { id: string; name: string } | null;
  title?: string;
  defaultScheduleId?: string;
  defaultProcedureId?: string;
  defaultExtra?: boolean;
  /** Entrada da fila de espera que este agendamento fecha. */
  waitlistEntryId?: string | null;
  onCreated?: () => void;
}) {
  const [scheduleId, setScheduleId] = useState(defaultScheduleId);
  const [procedureId, setProcedureId] = useState(defaultProcedureId);
  const [healthInsuranceId, setHealthInsuranceId] = useState("");

  const submitAppointment = useCallback(
    async (previousState: AgendaActionState, formData: FormData) => {
      const result = await createAppointment(previousState, formData);
      if (result.success) {
        toast.success(result.success);
        setScheduleId(defaultScheduleId);
        setProcedureId(defaultProcedureId);
        setHealthInsuranceId("");
        onCreated?.();
        onClose();
      }
      return result;
    },
    [defaultProcedureId, defaultScheduleId, onClose, onCreated],
  );
  const [state, action, pending] = useActionState(
    submitAppointment,
    initialState,
  );
  const selectedProcedure = data.procedures.find(
    (item) => item.id === procedureId,
  );
  const selectedSchedule = data.schedules.find(
    (item) => item.id === scheduleId,
  );
  // Sala segue a unidade da agenda escolhida; sem agenda, mostra todas.
  const rooms = selectedSchedule
    ? data.rooms.filter((room) => room.unit_id === selectedSchedule.unit_id)
    : data.rooms;
  // Preço de tabela pela mesma regra do banco: convênio manda, senão o preço
  // base. Muda sozinho quando o procedimento ou o convênio muda.
  const listPrice = resolveListPrice({
    data,
    procedureId,
    healthInsuranceId,
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={
        patient
          ? `A duração será definida pelo procedimento. Paciente: ${patient.name}.`
          : "A duração será definida pelo procedimento."
      }
      className="max-w-2xl"
    >
      <form
        action={action}
        aria-busy={pending}
        className="grid gap-4 md:grid-cols-2"
      >
        {waitlistEntryId ? (
          <input
            type="hidden"
            name="waitlist_entry_id"
            value={waitlistEntryId}
          />
        ) : null}
        {patient ? (
          <input type="hidden" name="patient_id" value={patient.id} />
        ) : (
          <PatientSearchField
            patients={data.patients}
            remoteSearch
            canCreatePatient={canCreatePatient}
            createPatientAction={createQuickPatientFromAgenda}
            className="md:col-span-2"
          />
        )}
        <label className="grid gap-2 text-body-sm font-medium">
          Agenda
          <Select
            name="schedule_id"
            required
            value={scheduleId}
            onValueChange={setScheduleId}
          >
            <option value="">Selecione</option>
            {data.schedules.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </Select>
        </label>
        <label className="grid gap-2 text-body-sm font-medium">
          Procedimento
          <Select
            name="procedure_id"
            required
            value={procedureId}
            onValueChange={setProcedureId}
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
          scheduleId={scheduleId}
          procedureId={procedureId}
          data={data}
          className="md:col-span-2"
        />
        <OptionSelect
          name="room_id"
          label="Sala (opcional)"
          options={rooms}
          optional
        />
        <label className="grid gap-2 text-body-sm font-medium">
          Convênio (opcional)
          <Select
            name="health_insurance_id"
            value={healthInsuranceId}
            onValueChange={setHealthInsuranceId}
            allowEmptyOption
          >
            <option value="">Nenhum</option>
            {data.insurances.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </Select>
        </label>
        <OptionSelect
          name="payment_method_id"
          label="Forma de pagamento (opcional)"
          options={data.paymentMethods}
          optional
        />
        <AppointmentPriceField
          listPrice={listPrice}
          className="md:col-span-2"
        />
        <label className="grid gap-2 text-body-sm font-medium md:col-span-2">
          Observações
          <Textarea name="notes" maxLength={1000} />
        </label>
        {canExtra ? (
          <div className="md:col-span-2 grid gap-1">
            <Checkbox
              name="is_extra"
              label="Registrar como encaixe"
              defaultChecked={defaultExtra}
            />
            <p className="text-body-sm font-normal text-muted-foreground">
              Permite marcar fora do horário de atendimento do profissional.
              Bloqueios da agenda e conflito com outro agendamento continuam
              valendo.
            </p>
          </div>
        ) : null}
        {state.error ? (
          <p
            className="text-body-sm text-destructive md:col-span-2"
            role="alert"
          >
            {state.error}
          </p>
        ) : null}
        <div className="flex justify-end gap-2 md:col-span-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={pending || !data.schedules.length}>
            {pending ? "Salvando..." : "Agendar"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/**
 * Valor do agendamento: chega preenchido pelo preço de tabela e aceita ajuste.
 *
 * O preço de tabela fica visível ao lado do campo justamente para o ajuste ser
 * consciente — quem dá desconto vê de quanto foi. Sem esse campo, o valor só
 * aparecia depois, no recebível que o banco criava a partir do preço do
 * procedimento, sem convênio e sem chance de negociar nada.
 */
function AppointmentPriceField({
  listPrice,
  className,
}: {
  listPrice: number;
  className?: string;
}) {
  const [touched, setTouched] = useState(false);
  const [value, setValue] = useState("");
  // Enquanto ninguém digitou, o campo acompanha procedimento e convênio.
  const shownValue = touched ? value : formatPriceInput(listPrice);
  const numericValue = parsePriceInput(shownValue);
  const discount = listPrice - numericValue;

  return (
    <div className={`grid gap-2 text-body-sm font-medium ${className ?? ""}`}>
      <span>Valor do agendamento</span>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-body-sm text-muted-foreground">R$</span>
        <Input
          name="price"
          inputMode="decimal"
          value={shownValue}
          onChange={(event) => {
            setTouched(true);
            setValue(event.target.value);
          }}
          aria-label="Valor do agendamento"
          className="w-32 text-right tabular-nums"
        />
        <span className="text-body-sm font-normal text-muted-foreground">
          {listPrice > 0
            ? `tabela: ${formatCurrency(listPrice)}`
            : "sem preço cadastrado para este procedimento"}
        </span>
        {touched && listPrice > 0 ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-primary"
            onClick={() => {
              setTouched(false);
              setValue("");
            }}
          >
            <RefreshCw className="size-4" aria-hidden="true" />
            Voltar ao preço de tabela
          </Button>
        ) : null}
      </div>
      {Math.abs(discount) >= 0.01 ? (
        <>
          <input
            type="hidden"
            name="list_price"
            value={formatPriceInput(listPrice)}
          />
          <label className="grid gap-2">
            <span className="font-normal text-muted-foreground">
              {discount > 0
                ? `Desconto de ${formatCurrency(discount)} — registre o motivo`
                : `Acréscimo de ${formatCurrency(-discount)} — registre o motivo`}
            </span>
            <Input
              name="price_note"
              maxLength={200}
              placeholder="Ex.: retorno de cortesia, valor combinado."
            />
          </label>
        </>
      ) : null}
    </div>
  );
}

function formatPriceInput(value: number) {
  return value > 0 ? value.toFixed(2).replace(".", ",") : "";
}

function parsePriceInput(value: string) {
  const normalized = value.replace(/\./g, "").replace(",", ".");
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

export function AppointmentTimeField({
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
  data: AppointmentFormData;
  required?: boolean;
  className?: string;
}) {
  const initial = defaultAppointmentDateTime(data.timeZone, data.selectedDate);
  const [date, setDate] = useState(initial.date);
  const [startTime, setStartTime] = useState(initial.time);
  const normalizedStart = normalizeTimeValue(startTime);
  const endTime = addMinutesToTime(
    date,
    normalizedStart,
    durationMinutes,
    data.timeZone,
  );
  const value = date ? `${date}T${normalizedStart}` : "";
  const freeSlots = useMemo(
    () =>
      scheduleId
        ? listFreeSlotsForDay({ data, scheduleId, durationMinutes, date })
        : [],
    [data, scheduleId, durationMinutes, date],
  );
  const knownDay = useMemo(
    () => dayHasSchedule({ data, scheduleId, date }),
    [data, date, scheduleId],
  );

  function fillNextFreeSlot() {
    if (!scheduleId || !procedureId) {
      toast.error("Selecione agenda e procedimento antes.");
      return;
    }

    // Com data escolhida, o "próximo" é dentro dela: pular para outro dia por
    // conta própria trocaria a decisão de quem está agendando. Só quando o dia
    // não tem grade (ou está fora da faixa carregada) a busca segue adiante.
    if (knownDay) {
      const nextInDay =
        freeSlots.find((slot) => slot > normalizedStart) ?? freeSlots[0];
      if (!nextInDay) {
        toast.error("Nenhum horário livre nesta data.");
        return;
      }
      setStartTime(nextInDay);
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

  // Um <label> em volta de vários controles faz o clique em qualquer ponto
  // vazio da linha (o texto do rótulo, o "às", o espaço entre os campos) ser
  // encaminhado para o primeiro controle rotulável — aqui, o botão do
  // calendário, que reabria o popover sem parar. Por isso o campo composto é
  // um <div>: cada controle já tem seu próprio aria-label.
  return (
    <div className={`grid gap-2 text-body-sm font-medium ${className ?? ""}`}>
      <span>{label}</span>
      <input type="hidden" name={name} value={value} />
      <div className="flex flex-wrap items-center gap-2">
        <DatePickerInput
          name={`${name}_date`}
          value={date}
          onValueChange={setDate}
          required={required}
          ariaLabel={`${label}: data`}
          className="w-44"
          todayValue={localDateKey(new Date().toISOString(), data.timeZone)}
        />
        {freeSlots.length ? (
          // Com agenda, data e procedimento escolhidos o horário deixa de ser
          // digitado: a lista já traz só os inícios que cabem no dia.
          <Select
            value={startTime}
            onValueChange={setStartTime}
            aria-label={`${label}: horário inicial`}
            className="w-28 tabular-nums"
          >
            {freeSlots.includes(normalizedStart) ? null : (
              <option value={startTime}>{startTime || "--:--"}</option>
            )}
            {freeSlots.map((slot) => (
              <option key={slot} value={slot}>
                {slot}
              </option>
            ))}
          </Select>
        ) : (
          <Input
            type="text"
            inputMode="numeric"
            value={startTime}
            onChange={(event) =>
              setStartTime(formatPartialTime(event.target.value))
            }
            onBlur={() => setStartTime(normalizedStart)}
            aria-label={`${label}: horário inicial`}
            placeholder="hh:mm"
            maxLength={5}
            className="w-20 text-center tabular-nums"
          />
        )}
        <span className="text-body-sm font-medium text-muted-foreground">
          às
        </span>
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
          <RefreshCw className="size-4" aria-hidden="true" />
          Próximo horário livre
        </Button>
      </div>
    </div>
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
  options: Array<{ id: string; name: string }>;
  optional?: boolean;
}) {
  return (
    <label className="grid gap-2 text-body-sm font-medium">
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
