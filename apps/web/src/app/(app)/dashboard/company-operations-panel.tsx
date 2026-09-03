"use client";

import {
  useActionState,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  Buildings as Building2,
  CalendarDots as CalendarClock,
  CalendarPlus,
  Check,
  Clock as Clock3,
  Globe as Globe2,
  Hourglass,
  ListPlus,
  EnvelopeSimple as Mail,
  ChatCenteredText as MessageSquareText,
  MagnifyingGlass as Search,
  PhoneCall,
  Phone,
  Stethoscope,
  Trash,
  UserPlus,
  X,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import {
  confirmOnlineBookingRequest,
  loadAppointmentFormData,
  rejectOnlineBookingRequest,
  updateWaitlistEntryStatus,
  type AgendaActionState,
} from "@/app/(app)/agenda/actions";
import { AddToWaitlistModal } from "@/components/agenda/add-to-waitlist-modal";
import { AppointmentFormModal } from "@/components/agenda/appointment-form-modal";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import type { AppointmentFormData } from "@/lib/agenda/slots";

export type DashboardOnlineRequest = {
  id: string;
  created_at: string;
  requested_start_at: string;
  requested_end_at: string;
  patient_name: string;
  patient_email: string | null;
  patient_phone: string | null;
  patient_notes: string | null;
  procedures: { name: string } | null;
  professionals: { name: string } | null;
  units: { name: string } | null;
  health_insurances: { name: string } | null;
};

export type DashboardWaitlistEntry = {
  id: string;
  patient_id: string;
  procedure_id: string | null;
  professional_id: string | null;
  preferred_period: string | null;
  status: string;
  notes: string | null;
  created_at: string;
  patients: { full_name: string; social_name: string | null } | null;
  procedures: { name: string } | null;
  professionals: { name: string } | null;
};

const initialState: AgendaActionState = {};
const periodLabel: Record<string, string> = {
  morning: "Manhã",
  afternoon: "Tarde",
  evening: "Noite",
  any: "Qualquer período",
};

export function CompanyOperationsPanel({
  onlineRequests,
  onlineRequestsTotal,
  waitlist,
  waitlistTotal,
  timeZone,
  renderedAt,
  canConfirmOnlineRequests,
  canRejectOnlineRequests,
  canManageWaitlist,
  canCreatePatient,
  canExtra,
}: {
  onlineRequests: DashboardOnlineRequest[];
  onlineRequestsTotal: number;
  waitlist: DashboardWaitlistEntry[];
  waitlistTotal: number;
  timeZone: string;
  /** Instante em que a página foi montada no servidor. O tempo de espera é
      medido a partir dele para o texto do servidor e o da hidratação baterem. */
  renderedAt: string;
  canConfirmOnlineRequests: boolean;
  canRejectOnlineRequests: boolean;
  canManageWaitlist: boolean;
  canCreatePatient: boolean;
  canExtra: boolean;
}) {
  return (
    <section className="grid gap-4">
      <WaitlistCard
        entries={waitlist}
        total={waitlistTotal}
        timeZone={timeZone}
        renderedAt={renderedAt}
        canManage={canManageWaitlist}
        canCreatePatient={canCreatePatient}
        canExtra={canExtra}
      />
      <OnlineRequestsCard
        requests={onlineRequests}
        total={onlineRequestsTotal}
        timeZone={timeZone}
        renderedAt={renderedAt}
        canConfirm={canConfirmOnlineRequests}
        canReject={canRejectOnlineRequests}
        canCreatePatient={canCreatePatient}
      />
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Fila de espera                                                             */
/* -------------------------------------------------------------------------- */

/**
 * A fila é uma lista de prioridade por ordem de chegada: a posição e o tempo de
 * espera ficam visíveis na linha justamente para essa ordem ser conferível a
 * olho. Clicar abre a ficha, de onde o paciente é encaixado na agenda,
 * marcado como contatado ou removido — os três jeitos de sair da fila.
 */
function WaitlistCard({
  entries,
  total,
  timeZone,
  renderedAt,
  canManage,
  canCreatePatient,
  canExtra,
}: {
  entries: DashboardWaitlistEntry[];
  total: number;
  timeZone: string;
  renderedAt: string;
  canManage: boolean;
  canCreatePatient: boolean;
  canExtra: boolean;
}) {
  const [query, setQuery] = useState("");
  const [professionalFilter, setProfessionalFilter] = useState("");
  const [procedureFilter, setProcedureFilter] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const closeEntry = useCallback(() => setSelectedId(null), []);
  const closeAdd = useCallback(() => setAddOpen(false), []);

  // A posição vem da lista inteira, não do resultado da busca: procurar por um
  // nome não pode mudar o lugar dele na fila.
  const positions = useMemo(
    () => new Map(entries.map((entry, index) => [entry.id, index + 1])),
    [entries],
  );
  // Os recortes saem de quem está na fila, não do catálogo inteiro: filtrar por
  // um profissional sem ninguém esperando por ele não diz nada.
  const professionalOptions = useMemo(
    () => distinctNames(entries.map((entry) => entry.professionals?.name)),
    [entries],
  );
  const procedureOptions = useMemo(
    () => distinctNames(entries.map((entry) => entry.procedures?.name)),
    [entries],
  );
  const visible = useMemo(() => {
    const term = normalizeSearchText(query);
    return entries.filter((entry) => {
      if (
        professionalFilter &&
        (entry.professionals?.name ?? "") !== professionalFilter
      ) {
        return false;
      }
      if (procedureFilter && (entry.procedures?.name ?? "") !== procedureFilter) {
        return false;
      }
      if (!term) return true;
      return normalizeSearchText(
        [
          waitlistPatientName(entry),
          entry.procedures?.name,
          entry.professionals?.name,
        ]
          .filter(Boolean)
          .join(" "),
      ).includes(term);
    });
  }, [entries, query, professionalFilter, procedureFilter]);
  const selected = entries.find((entry) => entry.id === selectedId) ?? null;
  const filtering = Boolean(query || professionalFilter || procedureFilter);

  return (
    <Card>
      <CardHeader className="px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <ListPlus className="size-4 text-primary" aria-hidden="true" />
            <h2 className="text-heading-sm font-semibold">Fila de espera</h2>
            <Badge variant={total ? "primary" : "neutral"}>{total}</Badge>
          </div>
          {canManage ? (
            <Button type="button" size="sm" onClick={() => setAddOpen(true)}>
              <UserPlus className="size-4" aria-hidden="true" />
              Adicionar
            </Button>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="grid gap-3 p-4">
        {entries.length ? (
          <>
            <SearchField
              label="Pesquisar na fila de espera"
              placeholder="Paciente, procedimento ou profissional"
              value={query}
              onChange={setQuery}
            />
            {professionalOptions.length > 1 || procedureOptions.length > 1 ? (
              <div className="grid gap-2 sm:grid-cols-2">
                {professionalOptions.length > 1 ? (
                  <Select
                    value={professionalFilter}
                    onValueChange={setProfessionalFilter}
                    allowEmptyOption
                    aria-label="Filtrar por profissional"
                  >
                    <option value="">Todos os profissionais</option>
                    {professionalOptions.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </Select>
                ) : null}
                {procedureOptions.length > 1 ? (
                  <Select
                    value={procedureFilter}
                    onValueChange={setProcedureFilter}
                    allowEmptyOption
                    aria-label="Filtrar por procedimento"
                  >
                    <option value="">Todos os procedimentos</option>
                    {procedureOptions.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </Select>
                ) : null}
              </div>
            ) : null}
            {visible.length ? (
              <ul className="divide-y divide-border">
                {visible.map((entry) => (
                  <WaitlistRow
                    key={entry.id}
                    entry={entry}
                    position={positions.get(entry.id) ?? 0}
                    renderedAt={renderedAt}
                    onOpen={() => setSelectedId(entry.id)}
                  />
                ))}
              </ul>
            ) : (
              <p className="py-6 text-center text-body-sm text-muted-foreground">
                {filtering
                  ? "Nenhum paciente da fila corresponde a esses filtros."
                  : "Nenhum paciente aguardando vaga."}
              </p>
            )}
            <ListFooter shown={entries.length} total={total} />
          </>
        ) : (
          <EmptyState
            icon={ListPlus}
            title="Nenhum paciente aguardando vaga."
            className="py-6"
          />
        )}
      </CardContent>

      {selected ? (
        <WaitlistEntryModal
          key={selected.id}
          entry={selected}
          position={positions.get(selected.id) ?? 0}
          timeZone={timeZone}
          renderedAt={renderedAt}
          canManage={canManage}
          canExtra={canExtra}
          onClose={closeEntry}
        />
      ) : null}
      {addOpen ? (
        <AddToWaitlistModal
          canCreatePatient={canCreatePatient}
          onClose={closeAdd}
        />
      ) : null}
    </Card>
  );
}

function WaitlistRow({
  entry,
  position,
  renderedAt,
  onOpen,
}: {
  entry: DashboardWaitlistEntry;
  position: number;
  renderedAt: string;
  onOpen: () => void;
}) {
  const patientName = waitlistPatientName(entry);

  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full min-w-0 items-start gap-3 rounded-md px-2 py-3 text-left transition-colors duration-[var(--motion-fast)] hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        <span
          className="mt-1 w-5 shrink-0 text-right text-body-sm font-semibold tabular-nums text-muted-foreground"
          aria-label={`Posição ${position} na fila`}
        >
          {position}
        </span>
        <Avatar name={patientName} size="sm" />
        <div className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
          <div className="min-w-0">
            <p className="flex min-w-0 items-center gap-2 text-body font-semibold">
              <span className="truncate">{patientName}</span>
              {entry.status === "contacted" ? (
                <Badge variant="neutral" className="shrink-0">
                  Contatado
                </Badge>
              ) : null}
            </p>
            <p className="truncate text-body-sm text-muted-foreground">
              {entry.procedures?.name ?? "Qualquer procedimento"}
              {entry.professionals?.name
                ? ` · ${entry.professionals.name}`
                : ""}
            </p>
            {entry.notes ? (
              <p className="line-clamp-1 text-body-sm text-secondary-foreground">
                {entry.notes}
              </p>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-2 sm:flex-col sm:items-end sm:gap-1">
            <Badge variant="neutral" className="w-fit">
              {periodLabel[entry.preferred_period || "any"] ?? "Período"}
            </Badge>
            <span className="text-body-sm text-muted-foreground">
              {formatWaitingTime(entry.created_at, renderedAt)}
            </span>
          </div>
        </div>
      </button>
    </li>
  );
}

function WaitlistEntryModal({
  entry,
  position,
  timeZone,
  renderedAt,
  canManage,
  canExtra,
  onClose,
}: {
  entry: DashboardWaitlistEntry;
  position: number;
  timeZone: string;
  renderedAt: string;
  canManage: boolean;
  canExtra: boolean;
  onClose: () => void;
}) {
  const patientName = waitlistPatientName(entry);
  const statusAction = updateWaitlistEntryStatus.bind(null, entry.id);
  const [state, action, pending] = useActionState(statusAction, initialState);
  const [confirmingRemoval, setConfirmingRemoval] = useState(false);

  useToastState(state);
  useEffect(() => {
    if (state.success) onClose();
  }, [state, onClose]);

  return (
    <Modal
      open
      onClose={onClose}
      title={patientName}
      description={`Posição ${position} na fila de espera.`}
    >
      <div className="grid gap-4">
        <dl className="grid gap-x-5 gap-y-3 sm:grid-cols-2">
          <DetailItem
            icon={Stethoscope}
            label="Procedimento"
            value={entry.procedures?.name ?? "Qualquer procedimento"}
          />
          <DetailItem
            icon={CalendarClock}
            label="Profissional"
            value={entry.professionals?.name ?? "Qualquer profissional"}
          />
          <DetailItem
            icon={Clock3}
            label="Turno preferido"
            value={periodLabel[entry.preferred_period || "any"] ?? "Período"}
          />
          <DetailItem
            icon={Hourglass}
            label="Entrou na fila"
            value={`${formatDateTime(entry.created_at, timeZone)} · ${formatWaitingTime(
              entry.created_at,
              renderedAt,
            )}`}
          />
        </dl>

        {entry.notes ? (
          <div className="flex gap-2 rounded-md border border-border bg-muted/25 px-3 py-2 text-body-sm">
            <MessageSquareText
              className="mt-0.5 size-4 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
            <p className="min-w-0 whitespace-pre-wrap break-words">
              {entry.notes}
            </p>
          </div>
        ) : null}

        {canManage ? (
          <div className="grid gap-2 border-t border-border pt-4">
            <ScheduleFromWaitlistButton
              entry={entry}
              patientName={patientName}
              canExtra={canExtra}
              onScheduled={onClose}
            />
            <div className="flex flex-wrap gap-2">
              {entry.status === "contacted" ? null : (
                <form action={action} className="flex-1">
                  <input type="hidden" name="status" value="contacted" />
                  <Button
                    type="submit"
                    variant="secondary"
                    disabled={pending}
                    className="w-full"
                  >
                    <PhoneCall className="size-4" aria-hidden="true" />
                    Marcar como contatado
                  </Button>
                </form>
              )}
              <Button
                type="button"
                variant="destructive-ghost"
                disabled={pending}
                className="flex-1"
                onClick={() => setConfirmingRemoval(true)}
              >
                <Trash className="size-4" aria-hidden="true" />
                Remover da fila
              </Button>
            </div>
            <ConfirmDialog
              open={confirmingRemoval}
              onClose={() => setConfirmingRemoval(false)}
              title="Remover da fila de espera?"
              description={`${patientName} sai da fila e deixa de aparecer para encaixe.`}
              confirmLabel="Remover da fila"
              pendingLabel="Removendo..."
              destructive
              pending={pending}
              error={state.error}
              formAction={action}
            >
              <input type="hidden" name="status" value="cancelled" />
            </ConfirmDialog>
          </div>
        ) : null}

        {state.error ? (
          <p
            className="rounded-md border border-destructive-muted bg-destructive-muted/40 px-3 py-2 text-body-sm text-destructive"
            role="alert"
          >
            {state.error}
          </p>
        ) : null}
      </div>
    </Modal>
  );
}

/**
 * Encaixe a partir da fila: o formulário é o mesmo modal de agendamento do
 * resto do sistema, com o paciente amarrado e procedimento/agenda já
 * escolhidos pelo que o paciente pediu ao entrar na fila. Os catálogos e a
 * grade só são carregados quando o botão é acionado.
 */
function ScheduleFromWaitlistButton({
  entry,
  patientName,
  canExtra,
  onScheduled,
}: {
  entry: DashboardWaitlistEntry;
  patientName: string;
  canExtra: boolean;
  onScheduled: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [formData, setFormData] = useState<AppointmentFormData | null>(null);
  const [loading, setLoading] = useState(false);

  async function openDialog() {
    setOpen(true);
    if (formData || loading) return;
    setLoading(true);
    const result = await loadAppointmentFormData();
    setLoading(false);
    if (!result.ok || !result.data) {
      setOpen(false);
      toast.error(result.error ?? "Não foi possível abrir o agendamento.");
      return;
    }
    setFormData(result.data);
  }

  // A fila guarda o profissional, o formulário trabalha com agenda: a primeira
  // agenda ativa dele já vem escolhida, e quem marca troca se precisar.
  const defaultScheduleId = entry.professional_id
    ? (formData?.schedules.find(
        (schedule) => schedule.professional_id === entry.professional_id,
      )?.id ?? "")
    : "";
  const defaultProcedureId = entry.procedure_id
    ? (formData?.procedures.find((item) => item.id === entry.procedure_id)
        ?.id ?? "")
    : "";

  return (
    <>
      <Button
        type="button"
        disabled={loading}
        className="w-full"
        onClick={() => void openDialog()}
      >
        <CalendarPlus className="size-4" aria-hidden="true" />
        {loading ? "Abrindo..." : "Encaixar na agenda"}
      </Button>
      {formData ? (
        <AppointmentFormModal
          open={open}
          onClose={() => setOpen(false)}
          data={formData}
          title="Encaixar da fila de espera"
          patient={{ id: entry.patient_id, name: patientName }}
          canExtra={canExtra}
          defaultScheduleId={defaultScheduleId}
          defaultProcedureId={defaultProcedureId}
          waitlistEntryId={entry.id}
          onCreated={onScheduled}
        />
      ) : null}
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Solicitações online                                                        */
/* -------------------------------------------------------------------------- */

function OnlineRequestsCard({
  requests,
  total,
  timeZone,
  renderedAt,
  canConfirm,
  canReject,
  canCreatePatient,
}: {
  requests: DashboardOnlineRequest[];
  total: number;
  timeZone: string;
  renderedAt: string;
  canConfirm: boolean;
  canReject: boolean;
  canCreatePatient: boolean;
}) {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const closeRequest = useCallback(() => setSelectedId(null), []);
  // Solicitação pendente segura o horário: quem está esperando resposta há mais
  // de um dia precisa saltar aos olhos, não ficar igual às que chegaram agora.
  const stalled = useMemo(
    () =>
      requests.filter((request) => isStalledRequest(request, renderedAt)).length,
    [requests, renderedAt],
  );

  const visible = useMemo(() => {
    const term = normalizeSearchText(query);
    if (!term) return requests;
    return requests.filter((request) =>
      normalizeSearchText(
        [
          request.patient_name,
          request.patient_phone,
          request.procedures?.name,
          request.professionals?.name,
        ]
          .filter(Boolean)
          .join(" "),
      ).includes(term),
    );
  }, [requests, query]);
  const selected = requests.find((request) => request.id === selectedId) ?? null;

  return (
    <Card>
      <CardHeader className="px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Globe2 className="size-4 text-primary" aria-hidden="true" />
            <h2 className="text-heading-sm font-semibold">
              Solicitações online
            </h2>
          </div>
          <Badge variant={total ? "warning" : "neutral"}>{total}</Badge>
        </div>
      </CardHeader>
      <CardContent className="grid gap-3 p-4">
        {requests.length ? (
          <>
            {stalled ? (
              <p className="rounded-md border border-warning-muted bg-warning-muted/40 px-3 py-2 text-body-sm text-warning-foreground">
                {stalled === 1
                  ? "1 solicitação está há mais de 24h sem resposta e continua segurando o horário."
                  : `${stalled} solicitações estão há mais de 24h sem resposta e continuam segurando os horários.`}
              </p>
            ) : null}
            <SearchField
              label="Pesquisar nas solicitações online"
              placeholder="Paciente, telefone, procedimento ou profissional"
              value={query}
              onChange={setQuery}
            />
            {visible.length ? (
              <ul className="divide-y divide-border">
                {visible.map((request) => (
                  <OnlineRequestRow
                    key={request.id}
                    request={request}
                    timeZone={timeZone}
                    renderedAt={renderedAt}
                    onOpen={() => setSelectedId(request.id)}
                  />
                ))}
              </ul>
            ) : (
              <p className="py-6 text-center text-body-sm text-muted-foreground">
                Nenhuma solicitação encontrada para “{query}”.
              </p>
            )}
            <ListFooter shown={requests.length} total={total} />
          </>
        ) : (
          <EmptyState
            icon={CalendarClock}
            title="Nenhuma solicitação online pendente."
            className="py-6"
          />
        )}
      </CardContent>

      {selected ? (
        <OnlineRequestModal
          key={selected.id}
          request={selected}
          timeZone={timeZone}
          renderedAt={renderedAt}
          canConfirm={canConfirm}
          canReject={canReject}
          canCreatePatient={canCreatePatient}
          onClose={closeRequest}
        />
      ) : null}
    </Card>
  );
}

function OnlineRequestRow({
  request,
  timeZone,
  renderedAt,
  onOpen,
}: {
  request: DashboardOnlineRequest;
  timeZone: string;
  renderedAt: string;
  onOpen: () => void;
}) {
  const stalled = isStalledRequest(request, renderedAt);
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full min-w-0 items-start gap-3 rounded-md px-2 py-3 text-left transition-colors duration-[var(--motion-fast)] hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        <Avatar name={request.patient_name} size="sm" />
        <div className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
          <div className="min-w-0">
            <p className="truncate text-body font-semibold">
              {request.patient_name}
            </p>
            <p className="truncate text-body-sm text-muted-foreground">
              {request.procedures?.name ?? "Procedimento"}
              {request.professionals?.name
                ? ` · ${request.professionals.name}`
                : ""}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2 sm:flex-col sm:items-end sm:gap-1">
            <Badge variant={stalled ? "destructive" : "warning"} className="w-fit">
              {stalled ? "Parada" : "Pendente"}
            </Badge>
            <span className="text-body-sm tabular-nums text-muted-foreground">
              {formatDateTime(request.requested_start_at, timeZone)}
            </span>
            <span className="text-body-sm text-muted-foreground">
              pedida {formatWaitingTime(request.created_at, renderedAt)}
            </span>
          </div>
        </div>
      </button>
    </li>
  );
}

function OnlineRequestModal({
  request,
  timeZone,
  renderedAt,
  canConfirm,
  canReject,
  canCreatePatient,
  onClose,
}: {
  request: DashboardOnlineRequest;
  timeZone: string;
  renderedAt: string;
  canConfirm: boolean;
  canReject: boolean;
  canCreatePatient: boolean;
  onClose: () => void;
}) {
  // Recusar deixava o pedido morrer sem saída. Depois de rejeitar, a fila de
  // espera é oferecida na hora — é o único caminho que sobra para quem queria
  // um horário que não tinha.
  const [offerWaitlist, setOfferWaitlist] = useState(false);

  return (
    <Modal
      open
      onClose={onClose}
      title={request.patient_name}
      description={`Solicitação recebida pelo portal online ${formatWaitingTime(
        request.created_at,
        renderedAt,
      )}.`}
    >
      <div className="grid gap-4">
        {isStalledRequest(request, renderedAt) ? (
          <p className="rounded-md border border-warning-muted bg-warning-muted/40 px-3 py-2 text-body-sm text-warning-foreground">
            Este pedido está sem resposta há mais de 24h e continua segurando o
            horário para os outros pacientes.
          </p>
        ) : null}
        <dl className="grid gap-x-5 gap-y-3 sm:grid-cols-2">
          <DetailItem
            icon={Clock3}
            label="Horário pedido"
            value={`${formatDateTime(
              request.requested_start_at,
              timeZone,
            )} - ${formatTime(request.requested_end_at, timeZone)}`}
          />
          <DetailItem
            icon={Stethoscope}
            label="Procedimento e profissional"
            value={`${request.procedures?.name ?? "Procedimento"} · ${
              request.professionals?.name ?? "Profissional"
            }`}
          />
          <DetailItem
            icon={Phone}
            label="Telefone"
            value={request.patient_phone || "Não informado"}
          />
          <DetailItem
            icon={Mail}
            label="E-mail"
            value={request.patient_email || "Não informado"}
          />
          <DetailItem
            icon={Building2}
            label="Unidade e convênio"
            value={
              [
                request.units?.name,
                request.health_insurances?.name ?? "Particular",
              ]
                .filter(Boolean)
                .join(" · ") || "Não informado"
            }
          />
        </dl>

        {request.patient_notes ? (
          <div className="flex gap-2 rounded-md border border-border bg-muted/25 px-3 py-2 text-body-sm">
            <MessageSquareText
              className="mt-0.5 size-4 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
            <p className="min-w-0 whitespace-pre-wrap break-words">
              {request.patient_notes}
            </p>
          </div>
        ) : null}

        {canConfirm || canReject ? (
          <OnlineRequestActions
            requestId={request.id}
            canConfirm={canConfirm}
            canReject={canReject}
            onDone={onClose}
            onRejected={() => setOfferWaitlist(true)}
          />
        ) : null}
      </div>

      {offerWaitlist ? (
        <AddToWaitlistModal
          canCreatePatient={canCreatePatient}
          onClose={() => {
            setOfferWaitlist(false);
            onClose();
          }}
        />
      ) : null}
    </Modal>
  );
}

function OnlineRequestActions({
  requestId,
  canConfirm,
  canReject,
  onDone,
  onRejected,
}: {
  requestId: string;
  canConfirm: boolean;
  canReject: boolean;
  onDone: () => void;
  onRejected: () => void;
}) {
  const confirmActionForRequest = confirmOnlineBookingRequest.bind(
    null,
    requestId,
  );
  const rejectActionForRequest = rejectOnlineBookingRequest.bind(
    null,
    requestId,
  );
  const [confirmState, confirmAction, confirmPending] = useActionState(
    confirmActionForRequest,
    initialState,
  );
  const [rejectState, rejectAction, rejectPending] = useActionState(
    rejectActionForRequest,
    initialState,
  );
  const [rejectReason, setRejectReason] = useState("");
  const [confirmingReject, setConfirmingReject] = useState(false);
  const pending = confirmPending || rejectPending;

  useToastState(confirmState);
  useToastState(rejectState);
  useEffect(() => {
    if (confirmState.success) onDone();
  }, [confirmState, onDone]);
  // Recusar não fecha a ficha direto: oferece a fila de espera antes, que é a
  // única saída que sobra para quem queria um horário indisponível.
  useEffect(() => {
    if (rejectState.success) onRejected();
  }, [rejectState, onRejected]);

  return (
    <div className="grid content-start gap-2 border-t border-border pt-4">
      {canConfirm ? (
        <form action={confirmAction}>
          <Button type="submit" disabled={pending} className="w-full">
            <Check className="size-4" aria-hidden="true" />
            {confirmPending ? "Confirmando..." : "Confirmar"}
          </Button>
        </form>
      ) : null}
      {canReject ? (
        <div className="grid gap-2">
          <Input
            value={rejectReason}
            onChange={(event) => setRejectReason(event.target.value)}
            placeholder="Motivo da rejeição (opcional)"
            aria-label="Motivo da rejeição"
          />
          <Button
            type="button"
            disabled={pending}
            variant="secondary"
            className="w-full"
            onClick={() => setConfirmingReject(true)}
          >
            <X className="size-4" aria-hidden="true" />
            Rejeitar
          </Button>
          <ConfirmDialog
            open={confirmingReject && !rejectState.success}
            onClose={() => setConfirmingReject(false)}
            title="Rejeitar solicitação?"
            description="A solicitação de agendamento será rejeitada e o horário voltará a ficar disponível."
            confirmLabel="Rejeitar solicitação"
            pendingLabel="Rejeitando..."
            destructive
            pending={rejectPending}
            error={rejectState.error}
            formAction={rejectAction}
          >
            <input type="hidden" name="reason" value={rejectReason} />
          </ConfirmDialog>
        </div>
      ) : null}
      {confirmState.error || rejectState.error ? (
        <p
          className="rounded-md border border-destructive-muted bg-destructive-muted/40 px-3 py-2 text-sm text-destructive"
          role="alert"
        >
          {confirmState.error ?? rejectState.error}
        </p>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Compartilhado                                                              */
/* -------------------------------------------------------------------------- */

function SearchField({
  label,
  placeholder,
  value,
  onChange,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="relative">
      <span className="sr-only">{label}</span>
      <Input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="w-full pr-9"
      />
      <Search
        className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-placeholder"
        aria-hidden="true"
      />
    </label>
  );
}

/** Avisa que a lista está recortada: a busca só alcança o que veio nesta carga. */
function ListFooter({ shown, total }: { shown: number; total: number }) {
  if (total <= shown) return null;
  return (
    <p className="text-body-sm text-muted-foreground">
      Mostrando {shown} de {total} — a pesquisa alcança apenas estes.
    </p>
  );
}

function DetailItem({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="flex min-w-0 gap-2">
      <Icon
        className="mt-0.5 size-4 shrink-0 text-muted-foreground"
        aria-hidden="true"
      />
      <div className="min-w-0">
        <dt className="text-body-sm text-muted-foreground">{label}</dt>
        <dd className="break-words text-body-sm font-medium">{value}</dd>
      </div>
    </div>
  );
}

function useToastState(state: AgendaActionState) {
  useEffect(() => {
    if (state.success) toast.success(state.success);
    if (state.error) toast.error(state.error);
  }, [state]);
}

function waitlistPatientName(entry: DashboardWaitlistEntry) {
  return (
    entry.patients?.social_name || entry.patients?.full_name || "Paciente"
  );
}

function distinctNames(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter((value): value is string => !!value)))
    .sort((a, b) => a.localeCompare(b, "pt-BR"));
}

function normalizeSearchText(value: string) {
  return value
    .trim()
    .toLocaleLowerCase("pt-BR")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

/**
 * Solicitação parada: mais de um dia sem alguém confirmar ou recusar. Importa
 * porque enquanto está pendente ela bloqueia aquele horário para todo mundo.
 */
const stalledRequestHours = 24;

function isStalledRequest(
  request: DashboardOnlineRequest,
  reference: string,
) {
  const elapsed =
    new Date(reference).getTime() - new Date(request.created_at).getTime();
  return elapsed >= stalledRequestHours * 60 * 60 * 1000;
}

/** Há quanto tempo o paciente está na fila, na maior unidade que couber. */
function formatWaitingTime(value: string, reference: string) {
  const minutes = Math.max(
    0,
    Math.round(
      (new Date(reference).getTime() - new Date(value).getTime()) / 60_000,
    ),
  );
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `há ${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `há ${days} ${days === 1 ? "dia" : "dias"}`;
  const months = Math.floor(days / 30);
  return `há ${months} ${months === 1 ? "mês" : "meses"}`;
}

function formatDateTime(value: string, timeZone: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone,
  }).format(new Date(value));
}

function formatTime(value: string, timeZone: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  }).format(new Date(value));
}
