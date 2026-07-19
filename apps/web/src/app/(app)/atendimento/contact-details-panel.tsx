"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowSquareOut,
  CalendarDots,
  CalendarPlus,
  CaretRight,
  ClockCounterClockwise,
  File as FileIcon,
  FileAudio,
  FileImage,
  FileVideo,
  LinkSimple,
  Paperclip,
  Tag as TagIcon,
  TrendUp,
  UserCircle,
  X,
} from "@phosphor-icons/react";
import {
  useActionState,
  useCallback,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react";
import { toast } from "sonner";
import {
  loadContactDetailsAction,
  type ContactAppointmentCreationOptions,
  type ContactAppointmentView,
  type ContactAttendanceEventView,
  type ContactDetailsData,
  type ContactFileView,
  type ContactOnlineBookingView,
  type ContactOpportunityMovementView,
  type ContactOpportunityView,
} from "./contact-actions";
import { linkPatientAction, setConversationTagAction } from "./actions";
import { createAppointment, type AgendaActionState } from "../agenda/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { Tabs } from "@/components/ui/tabs";
import type {
  ConversationListItem,
  ConversationTagView,
} from "@/lib/whatsapp/types";
import { cn } from "@/lib/utils";

export function ContactDetailsPanel({
  conversation,
  organizationId,
  availableTags,
  canAttend,
  onClose,
  onTagsChange,
}: {
  conversation: ConversationListItem;
  organizationId: string;
  availableTags: ConversationTagView[];
  canAttend: boolean;
  onClose: () => void;
  onTagsChange: (tags: ConversationTagView[]) => void;
}) {
  const [loadRevision, setLoadRevision] = useState(0);
  const [loaded, setLoaded] = useState<{
    conversationId: string;
    data: ContactDetailsData | null;
    error: string | null;
  } | null>(null);

  useEffect(() => {
    let active = true;
    void loadContactDetailsAction(conversation.id).then((result) => {
      if (!active) return;
      if (result.ok && result.data.organizationId === organizationId) {
        setLoaded({
          conversationId: conversation.id,
          data: result.data,
          error: null,
        });
      } else {
        setLoaded({
          conversationId: conversation.id,
          data: null,
          error: result.ok ? "Empresa inválida." : result.error,
        });
      }
    });
    return () => {
      active = false;
    };
  }, [conversation.id, loadRevision, organizationId]);

  const refresh = useCallback(() => {
    setLoadRevision((value) => value + 1);
  }, []);
  const current =
    loaded?.conversationId === conversation.id ? loaded : undefined;

  return (
    <>
      <button
        type="button"
        aria-label="Fechar detalhes do contato"
        onClick={onClose}
        className="fixed inset-0 z-40 bg-foreground/35 backdrop-blur-[1px] xl:hidden"
      />
      <aside
        aria-label="Detalhes do contato"
        className="fixed inset-y-0 right-0 z-50 flex min-h-0 w-[min(100%,30rem)] flex-col overflow-hidden border-l border-border bg-card shadow-[var(--shadow-lg)] xl:static xl:inset-auto xl:z-auto xl:w-auto xl:shadow-none"
      >
        <header className="flex min-h-16 shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-2">
          <div className="flex min-w-0 items-center gap-3">
            <ContactAvatar conversation={conversation} />
            <div className="min-w-0">
              <p className="truncate text-body-sm font-semibold">
                {conversation.contactName}
              </p>
              <p className="truncate text-label tabular-nums text-muted-foreground">
                {formatPhone(conversation.contactPhone)}
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Fechar detalhes"
            onClick={onClose}
          >
            <X className="size-4" aria-hidden="true" />
          </Button>
        </header>

        {!current ? (
          <PanelLoading />
        ) : current.error || !current.data ? (
          <PanelError error={current.error} onRetry={refresh} />
        ) : (
          <Tabs
            ariaLabel="Informações do contato"
            className="flex min-h-0 flex-1 flex-col px-4 pt-3"
            contentClassName="min-h-0 flex-1 overflow-y-auto pb-6 outline-none"
            items={[
              {
                id: "contato",
                label: "Contato",
                icon: <UserCircle />,
                content: (
                  <ContactTab
                    conversation={conversation}
                    data={current.data}
                    availableTags={availableTags}
                    canAttend={canAttend}
                    onTagsChange={onTagsChange}
                    onRefresh={refresh}
                  />
                ),
              },
              {
                id: "atendimentos",
                label: "Atendimentos",
                icon: <ClockCounterClockwise />,
                content: (
                  <AttendancesTab events={current.data.attendanceEvents} />
                ),
              },
              {
                id: "arquivos",
                label: "Arquivos",
                icon: <Paperclip />,
                content: <FilesTab files={current.data.files} />,
              },
              {
                id: "historico",
                label: "Histórico",
                icon: <TrendUp />,
                content: <HistoryTab data={current.data} />,
              },
            ]}
          />
        )}
      </aside>
    </>
  );
}

function ContactTab({
  conversation,
  data,
  availableTags,
  canAttend,
  onTagsChange,
  onRefresh,
}: {
  conversation: ConversationListItem;
  data: ContactDetailsData;
  availableTags: ConversationTagView[];
  canAttend: boolean;
  onTagsChange: (tags: ConversationTagView[]) => void;
  onRefresh: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const selectedTagIds = useMemo(
    () => new Set(conversation.tags.map((tag) => tag.id)),
    [conversation.tags],
  );

  function toggleTag(tag: ConversationTagView) {
    const attach = !selectedTagIds.has(tag.id);
    const previousTags = conversation.tags;
    const nextTags = attach
      ? [...previousTags, tag]
      : previousTags.filter((item) => item.id !== tag.id);
    onTagsChange(nextTags);
    startTransition(async () => {
      const result = await setConversationTagAction(
        conversation.id,
        tag.id,
        attach,
      );
      if (!result.ok) {
        onTagsChange(previousTags);
        toast.error(result.error ?? "Não foi possível atualizar a etiqueta.");
      }
    });
  }

  function unlinkPatient() {
    startTransition(async () => {
      const result = await linkPatientAction(data.contact.id, null);
      if (result.ok) {
        toast.success("Vínculo com o paciente removido.");
        onRefresh();
        router.refresh();
      } else {
        toast.error(result.error ?? "Não foi possível remover o vínculo.");
      }
    });
  }

  return (
    <div className="grid gap-5">
      <PanelSection title="Dados do contato">
        <dl className="grid gap-3 text-body-sm">
          <DetailRow label="Nome" value={data.contact.name} />
          <DetailRow label="WhatsApp" value={formatPhone(data.contact.phone)} />
          {data.patient?.email ? (
            <DetailRow label="E-mail" value={data.patient.email} />
          ) : null}
          {data.patient?.phone && data.patient.phone !== data.contact.phone ? (
            <DetailRow
              label="Telefone do paciente"
              value={formatPhone(data.patient.phone)}
            />
          ) : null}
          <DetailRow
            label="Contato desde"
            value={formatDateTime(data.contact.createdAt)}
          />
        </dl>

        {data.contact.patientId ? (
          <div className="mt-4 grid gap-2 rounded-lg border border-border bg-muted/40 p-3">
            {data.patient ? (
              <>
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-label text-muted-foreground">
                      Paciente vinculado
                    </p>
                    <p className="truncate text-body-sm font-medium">
                      {data.patient.socialName || data.patient.fullName}
                    </p>
                  </div>
                  <Badge
                    variant={
                      data.patient.status === "active" ? "success" : "neutral"
                    }
                  >
                    {data.patient.status === "active" ? "Ativo" : "Inativo"}
                  </Badge>
                </div>
                <Button asChild variant="secondary" size="sm">
                  <Link href={`/pacientes/${data.patient.id}`}>
                    <UserCircle className="size-4" aria-hidden="true" />
                    Abrir ficha do paciente
                  </Link>
                </Button>
              </>
            ) : (
              <p className="text-label text-muted-foreground">
                Existe um paciente vinculado, mas você não possui permissão para
                visualizar seus dados.
              </p>
            )}
            {canAttend ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={pending}
                onClick={unlinkPatient}
              >
                Desvincular paciente
              </Button>
            ) : null}
          </div>
        ) : canAttend && data.permissions.canViewPatient ? (
          <PatientLinkSearch
            contactId={data.contact.id}
            onLinked={() => {
              onRefresh();
              router.refresh();
            }}
          />
        ) : (
          <p className="mt-4 rounded-lg border border-dashed border-border p-3 text-label text-muted-foreground">
            Contato ainda não vinculado a um paciente.
          </p>
        )}
      </PanelSection>

      <PanelSection
        title="Etiquetas"
        icon={<TagIcon className="size-4" aria-hidden="true" />}
      >
        {availableTags.length ? (
          <div className="flex flex-wrap gap-2">
            {availableTags.map((tag) => {
              const selected = selectedTagIds.has(tag.id);
              return (
                <button
                  key={tag.id}
                  type="button"
                  disabled={!canAttend || pending}
                  aria-pressed={selected}
                  onClick={() => toggleTag(tag)}
                  className={cn(
                    "inline-flex min-h-8 items-center gap-1.5 rounded-md border px-2.5 text-label font-medium transition-opacity disabled:cursor-not-allowed disabled:opacity-50",
                    selected ? "opacity-100" : "opacity-60 hover:opacity-100",
                  )}
                  style={{
                    borderColor: tag.color,
                    color: tag.color,
                    backgroundColor: selected ? `${tag.color}14` : undefined,
                  }}
                >
                  <span
                    className="size-2 rounded-full"
                    style={{ backgroundColor: tag.color }}
                    aria-hidden="true"
                  />
                  {tag.name}
                </button>
              );
            })}
          </div>
        ) : (
          <EmptyText>Nenhuma etiqueta cadastrada.</EmptyText>
        )}
      </PanelSection>

      <PanelSection
        title="Agendamentos ativos"
        icon={<CalendarDots className="size-4" aria-hidden="true" />}
      >
        {!data.permissions.canViewAgenda ? (
          <PermissionNotice>
            Você não possui permissão para visualizar a agenda.
          </PermissionNotice>
        ) : data.activeAppointments.length ? (
          <ul className="grid gap-2">
            {data.activeAppointments.map((appointment) => (
              <AppointmentItem key={appointment.id} appointment={appointment} />
            ))}
          </ul>
        ) : (
          <EmptyText>Nenhum agendamento ativo.</EmptyText>
        )}

        <div className="mt-3">
          {data.permissions.canCreateAppointment ? (
            data.contact.patientId && data.creationOptions ? (
              <CreateAppointmentDialog
                patientId={data.contact.patientId}
                options={data.creationOptions}
                onCreated={onRefresh}
              />
            ) : (
              <div className="grid gap-2">
                <Button type="button" size="sm" disabled className="w-full">
                  <CalendarPlus className="size-4" aria-hidden="true" />
                  Criar agendamento
                </Button>
                <p className="text-caption text-muted-foreground">
                  Vincule o contato a um paciente antes de criar o agendamento.
                </p>
              </div>
            )
          ) : (
            <PermissionNotice>
              Seu perfil não permite criar agendamentos.
            </PermissionNotice>
          )}
        </div>
      </PanelSection>
    </div>
  );
}

function CreateAppointmentDialog({
  patientId,
  options,
  onCreated,
}: {
  patientId: string;
  options: ContactAppointmentCreationOptions;
  onCreated: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [scheduleId, setScheduleId] = useState("");
  const [procedureId, setProcedureId] = useState("");
  const [roomId, setRoomId] = useState("");
  const selectedSchedule = options.schedules.find(
    (schedule) => schedule.id === scheduleId,
  );
  const availableRooms = selectedSchedule
    ? options.rooms.filter((room) => room.unitId === selectedSchedule.unitId)
    : options.rooms;

  const submitAppointment = useCallback(
    async (previousState: AgendaActionState, formData: FormData) => {
      const result = await createAppointment(previousState, formData);
      if (result.success) {
        toast.success(result.success);
        setOpen(false);
        setScheduleId("");
        setProcedureId("");
        setRoomId("");
        onCreated();
      }
      return result;
    },
    [onCreated],
  );
  const [state, action, pending] = useActionState(submitAppointment, {});

  return (
    <>
      <Button
        type="button"
        size="sm"
        className="w-full"
        onClick={() => setOpen(true)}
      >
        <CalendarPlus className="size-4" aria-hidden="true" />
        Criar agendamento
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Criar agendamento"
        description="O paciente deste contato já será vinculado ao agendamento."
        className="max-w-2xl"
      >
        <form action={action} className="grid gap-4 md:grid-cols-2">
          <input type="hidden" name="patient_id" value={patientId} />
          <label className="grid gap-2 text-body-sm font-medium">
            Agenda
            <Select
              name="schedule_id"
              value={scheduleId}
              onValueChange={(value) => {
                setScheduleId(value);
                setRoomId("");
              }}
              required
            >
              <option value="">Selecione</option>
              {options.schedules.map((schedule) => (
                <option key={schedule.id} value={schedule.id}>
                  {schedule.name}
                </option>
              ))}
            </Select>
          </label>
          <label className="grid gap-2 text-body-sm font-medium">
            Procedimento
            <Select
              name="procedure_id"
              value={procedureId}
              onValueChange={setProcedureId}
              required
            >
              <option value="">Selecione</option>
              {options.procedures.map((procedure) => (
                <option key={procedure.id} value={procedure.id}>
                  {procedure.name} ({procedure.durationMinutes} min)
                </option>
              ))}
            </Select>
          </label>
          <label className="grid gap-2 text-body-sm font-medium md:col-span-2">
            Data e hora
            <Input
              type="datetime-local"
              name="start_at"
              defaultValue={defaultAppointmentDateTime()}
              required
            />
          </label>
          <label className="grid gap-2 text-body-sm font-medium">
            Sala (opcional)
            <Select name="room_id" value={roomId} onValueChange={setRoomId}>
              <option value="">Nenhuma</option>
              {availableRooms.map((room) => (
                <option key={room.id} value={room.id}>
                  {room.name}
                </option>
              ))}
            </Select>
          </label>
          <label className="grid gap-2 text-body-sm font-medium">
            Convênio (opcional)
            <Select name="health_insurance_id" defaultValue="">
              <option value="">Nenhum</option>
              {options.healthInsurances.map((insurance) => (
                <option key={insurance.id} value={insurance.id}>
                  {insurance.name}
                </option>
              ))}
            </Select>
          </label>
          <label className="grid gap-2 text-body-sm font-medium md:col-span-2">
            Forma de pagamento (opcional)
            <Select name="payment_method_id" defaultValue="">
              <option value="">Nenhuma</option>
              {options.paymentMethods.map((method) => (
                <option key={method.id} value={method.id}>
                  {method.name}
                </option>
              ))}
            </Select>
          </label>
          <label className="grid gap-2 text-body-sm font-medium md:col-span-2">
            Observações
            <Textarea name="notes" maxLength={1000} />
          </label>
          {state.error ? (
            <p
              className="text-body-sm text-destructive md:col-span-2"
              role="alert"
            >
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
            <Button
              type="submit"
              disabled={pending || !scheduleId || !procedureId}
            >
              {pending ? "Criando..." : "Criar agendamento"}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}

function AttendancesTab({ events }: { events: ContactAttendanceEventView[] }) {
  if (!events.length) {
    return (
      <EmptyPanel
        icon={<ClockCounterClockwise className="size-5" />}
        title="Nenhum atendimento anterior"
        description="Inícios, transferências e conclusões aparecerão aqui."
      />
    );
  }

  return (
    <ol className="relative ml-2 border-l border-border pl-5">
      {events.map((event) => {
        const description = attendanceEventDescription(event);
        const reason = metadataText(event.metadata, "reason");
        return (
          <li key={event.id} className="relative pb-5 last:pb-0">
            <span className="absolute -left-[1.6rem] top-1.5 size-3 rounded-full border-2 border-card bg-primary" />
            <article className="rounded-lg border border-border p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="text-body-sm font-medium">
                  {attendanceEventLabel(event.eventType)}
                </p>
                <time className="text-caption tabular-nums text-muted-foreground">
                  {formatDateTime(event.occurredAt)}
                </time>
              </div>
              {description ? (
                <p className="mt-1 text-label text-muted-foreground">
                  {description}
                </p>
              ) : null}
              {reason ? (
                <p className="mt-2 rounded-md bg-muted px-2.5 py-2 text-label">
                  Motivo: {reason}
                </p>
              ) : null}
            </article>
          </li>
        );
      })}
    </ol>
  );
}

function FilesTab({ files }: { files: ContactFileView[] }) {
  if (!files.length) {
    return (
      <EmptyPanel
        icon={<Paperclip className="size-5" />}
        title="Nenhum arquivo"
        description="Imagens, áudios, vídeos e documentos aparecerão aqui."
      />
    );
  }

  return (
    <ul className="grid gap-2">
      {files.map((file) => (
        <li key={file.id}>
          <a
            href={`/api/whatsapp/media/${file.id}`}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-3 rounded-lg border border-border p-3 transition-colors hover:border-border-strong hover:bg-muted/50"
          >
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary-muted text-primary">
              {fileTypeIcon(file.messageType)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-body-sm font-medium">
                {file.name || fileTypeLabel(file.messageType)}
              </span>
              <span className="mt-0.5 block text-caption text-muted-foreground">
                {file.direction === "inbound" ? "Recebido" : "Enviado"} ·{" "}
                {formatDateTime(file.createdAt)}
              </span>
              {file.mediaMimeType ? (
                <span className="block truncate text-caption text-muted-foreground">
                  {file.mediaMimeType}
                </span>
              ) : null}
            </span>
            <ArrowSquareOut
              className="size-4 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
          </a>
        </li>
      ))}
    </ul>
  );
}

function HistoryTab({ data }: { data: ContactDetailsData }) {
  const movementsByCard = useMemo(() => {
    const grouped = new Map<string, ContactOpportunityMovementView[]>();
    for (const movement of data.opportunityMovements) {
      const list = grouped.get(movement.cardId) ?? [];
      list.push(movement);
      grouped.set(movement.cardId, list);
    }
    return grouped;
  }, [data.opportunityMovements]);

  return (
    <div className="grid gap-6">
      <HistorySection title="Agendamentos">
        {!data.permissions.canViewAgenda ? (
          <PermissionNotice>
            Você não possui permissão para visualizar agendamentos.
          </PermissionNotice>
        ) : data.appointmentHistory.length ? (
          <ul className="grid gap-2">
            {data.appointmentHistory.map((appointment) => (
              <AppointmentItem key={appointment.id} appointment={appointment} />
            ))}
          </ul>
        ) : (
          <EmptyText>Nenhum agendamento no histórico.</EmptyText>
        )}
      </HistorySection>

      <HistorySection title="Reservas on-line">
        {!data.permissions.canViewAgenda ? (
          <PermissionNotice>
            Você não possui permissão para visualizar reservas.
          </PermissionNotice>
        ) : data.onlineBookings.length ? (
          <ul className="grid gap-2">
            {data.onlineBookings.map((booking) => (
              <BookingItem key={booking.id} booking={booking} />
            ))}
          </ul>
        ) : (
          <EmptyText>Nenhuma reserva on-line.</EmptyText>
        )}
      </HistorySection>

      <HistorySection title="Oportunidades">
        {!data.permissions.canViewFunnel ? (
          <PermissionNotice>
            Você não possui permissão para visualizar oportunidades.
          </PermissionNotice>
        ) : data.opportunities.length ? (
          <ul className="grid gap-3">
            {data.opportunities.map((opportunity) => (
              <OpportunityItem
                key={opportunity.id}
                opportunity={opportunity}
                movements={movementsByCard.get(opportunity.id) ?? []}
              />
            ))}
          </ul>
        ) : data.contact.patientId ? (
          <EmptyText>Nenhuma oportunidade vinculada ao paciente.</EmptyText>
        ) : (
          <EmptyText>
            Vincule o contato a um paciente para consultar oportunidades.
          </EmptyText>
        )}
      </HistorySection>
    </div>
  );
}

type PatientSearchResult = {
  id: string;
  full_name: string;
  social_name: string | null;
};

function PatientLinkSearch({
  contactId,
  onLinked,
}: {
  contactId: string;
  onLinked: () => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PatientSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [linking, startLinking] = useTransition();

  useEffect(() => {
    const term = query.trim();
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      if (term.length < 3) {
        setResults([]);
        return;
      }
      setSearching(true);
      try {
        const response = await fetch(
          `/api/patients/search?q=${encodeURIComponent(term)}`,
          { cache: "no-store", signal: controller.signal },
        );
        if (response.ok) {
          const payload = (await response.json()) as {
            patients?: PatientSearchResult[];
          };
          setResults((payload.patients ?? []).slice(0, 6));
        } else {
          setResults([]);
        }
      } catch {
        if (!controller.signal.aborted) setResults([]);
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 300);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [query]);

  function link(patientId: string) {
    startLinking(async () => {
      const result = await linkPatientAction(contactId, patientId);
      if (result.ok) {
        toast.success("Paciente vinculado ao contato.");
        setQuery("");
        setResults([]);
        onLinked();
      } else {
        toast.error(result.error ?? "Não foi possível vincular o paciente.");
      }
    });
  }

  return (
    <div className="mt-4 grid gap-2 rounded-lg border border-dashed border-border p-3">
      <label className="grid gap-2 text-label font-medium">
        Vincular paciente
        <span className="relative block">
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Busque por nome, telefone ou e-mail"
            className="pl-9"
          />
          <LinkSimple
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-placeholder"
            aria-hidden="true"
          />
        </span>
      </label>
      {searching ? (
        <p className="text-caption text-muted-foreground">Buscando...</p>
      ) : null}
      {results.length ? (
        <ul className="overflow-hidden rounded-md border border-border">
          {results.map((patient) => (
            <li
              key={patient.id}
              className="border-b border-border last:border-0"
            >
              <button
                type="button"
                disabled={linking}
                onClick={() => link(patient.id)}
                className="flex min-h-10 w-full items-center justify-between gap-2 px-3 py-2 text-left text-body-sm hover:bg-muted disabled:opacity-50"
              >
                <span className="truncate">
                  {patient.social_name || patient.full_name}
                </span>
                <CaretRight
                  className="size-4 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
              </button>
            </li>
          ))}
        </ul>
      ) : query.trim().length >= 3 && !searching ? (
        <p className="text-caption text-muted-foreground">
          Nenhum paciente encontrado.
        </p>
      ) : null}
    </div>
  );
}

function AppointmentItem({
  appointment,
}: {
  appointment: ContactAppointmentView;
}) {
  return (
    <li className="rounded-lg border border-border p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-body-sm font-medium">
            {appointment.procedureName}
          </p>
          <p className="mt-0.5 truncate text-label text-muted-foreground">
            {appointment.professionalName}
          </p>
        </div>
        <Badge variant={appointmentStatusVariant(appointment.status)}>
          {appointmentStatusLabel(appointment.status)}
        </Badge>
      </div>
      <p className="mt-2 text-label tabular-nums text-muted-foreground">
        {formatDateTime(appointment.startAt)}
      </p>
    </li>
  );
}

function BookingItem({ booking }: { booking: ContactOnlineBookingView }) {
  return (
    <li className="rounded-lg border border-border p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-body-sm font-medium">
            {booking.procedureName}
          </p>
          <p className="mt-0.5 truncate text-label text-muted-foreground">
            {booking.professionalName}
          </p>
        </div>
        <Badge variant={bookingStatusVariant(booking.status)}>
          {bookingStatusLabel(booking.status)}
        </Badge>
      </div>
      <p className="mt-2 text-label tabular-nums text-muted-foreground">
        {formatDateTime(booking.requestedStartAt)}
      </p>
    </li>
  );
}

function OpportunityItem({
  opportunity,
  movements,
}: {
  opportunity: ContactOpportunityView;
  movements: ContactOpportunityMovementView[];
}) {
  return (
    <li className="rounded-lg border border-border p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-body-sm font-medium">
            {opportunity.funnelName}
          </p>
          <p className="mt-0.5 truncate text-label text-muted-foreground">
            Etapa: {opportunity.stageName}
          </p>
        </div>
        <Badge variant={opportunity.archivedAt ? "neutral" : "primary"}>
          {opportunity.archivedAt ? "Arquivada" : "Ativa"}
        </Badge>
      </div>
      {opportunity.assignedProfessionalName ? (
        <p className="mt-2 text-label text-muted-foreground">
          Responsável: {opportunity.assignedProfessionalName}
        </p>
      ) : null}
      {opportunity.nextAction ? (
        <p className="mt-2 rounded-md bg-muted px-2.5 py-2 text-label">
          {opportunity.nextAction}
          {opportunity.nextActionDate
            ? ` · ${formatDate(opportunity.nextActionDate)}`
            : ""}
        </p>
      ) : null}
      {opportunity.value != null ? (
        <p className="mt-2 text-label font-medium">
          {formatCurrency(opportunity.value)}
        </p>
      ) : null}
      {movements.length ? (
        <ul className="mt-3 grid gap-1.5 border-t border-border pt-3">
          {movements.slice(0, 3).map((movement) => (
            <li
              key={movement.id}
              className="text-caption text-muted-foreground"
            >
              {movement.fromStageName
                ? `${movement.fromStageName} → ${movement.toStageName}`
                : `Entrada em ${movement.toStageName}`}{" "}
              · {formatDateTime(movement.movedAt)}
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}

function PanelSection({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-border p-4">
      <h2 className="mb-3 flex items-center gap-2 text-body-sm font-semibold">
        {icon}
        {title}
      </h2>
      {children}
    </section>
  );
}

function HistorySection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="mb-3 text-body-sm font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[minmax(6rem,0.8fr)_minmax(0,1.2fr)] gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words text-right font-medium">{value}</dd>
    </div>
  );
}

function PermissionNotice({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-lg border border-dashed border-border bg-muted/40 p-3 text-label text-muted-foreground">
      {children}
    </p>
  );
}

function EmptyText({ children }: { children: React.ReactNode }) {
  return <p className="text-label text-muted-foreground">{children}</p>;
}

function EmptyPanel({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="flex min-h-60 items-center justify-center rounded-lg border border-dashed border-border p-6 text-center">
      <div>
        <span className="mx-auto flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
          {icon}
        </span>
        <p className="mt-3 text-body-sm font-medium">{title}</p>
        <p className="mt-1 text-label text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

function PanelLoading() {
  return (
    <div className="grid flex-1 content-start gap-3 p-4" aria-live="polite">
      <span className="sr-only">Carregando detalhes do contato</span>
      <div className="h-10 animate-pulse rounded-lg bg-muted" />
      <div className="h-36 animate-pulse rounded-lg bg-muted" />
      <div className="h-24 animate-pulse rounded-lg bg-muted" />
    </div>
  );
}

function PanelError({
  error,
  onRetry,
}: {
  error: string | null;
  onRetry: () => void;
}) {
  return (
    <div className="flex flex-1 items-center justify-center p-6 text-center">
      <div>
        <p className="text-body-sm font-medium">
          Não foi possível carregar o contato
        </p>
        <p className="mt-1 text-label text-muted-foreground">
          {error ?? "Tente novamente em instantes."}
        </p>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="mt-3"
          onClick={onRetry}
        >
          Tentar novamente
        </Button>
      </div>
    </div>
  );
}

function ContactAvatar({
  conversation,
}: {
  conversation: ConversationListItem;
}) {
  return conversation.contactPhotoUrl ? (
    <Image
      unoptimized
      src={conversation.contactPhotoUrl}
      alt={`Foto de ${conversation.contactName}`}
      width={40}
      height={40}
      className="size-10 shrink-0 rounded-full object-cover"
    />
  ) : (
    <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary-muted text-body-sm font-semibold text-primary">
      {initials(conversation.contactName)}
    </span>
  );
}

function attendanceEventLabel(eventType: string): string {
  const normalized = eventType.toLowerCase();
  if (normalized.includes("transfer")) return "Atendimento transferido";
  if (normalized.includes("complete") || normalized.includes("resolv")) {
    return "Atendimento concluído";
  }
  if (normalized.includes("reopen")) return "Atendimento reaberto";
  if (normalized.includes("start") || normalized.includes("claim")) {
    return "Atendimento iniciado";
  }
  return eventType
    .replaceAll("_", " ")
    .replace(/^./, (letter) => letter.toUpperCase());
}

function attendanceEventDescription(
  event: ContactAttendanceEventView,
): string | null {
  const normalized = event.eventType.toLowerCase();
  if (normalized.includes("transfer")) {
    const from = event.fromUserName ?? "Sem responsável";
    const to = event.toUserName ?? "Novo responsável";
    return `${from} → ${to}${event.actorName ? `, por ${event.actorName}` : ""}`;
  }
  if (normalized.includes("start") || normalized.includes("claim")) {
    return event.toUserName || event.actorName
      ? `Responsável: ${event.toUserName ?? event.actorName}`
      : null;
  }
  return event.actorName ? `Registrado por ${event.actorName}` : null;
}

function metadataText(
  metadata: Record<string, unknown>,
  key: string,
): string | null {
  const value = metadata[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function fileTypeIcon(type: string) {
  if (type === "image") return <FileImage className="size-5" />;
  if (type === "audio") return <FileAudio className="size-5" />;
  if (type === "video") return <FileVideo className="size-5" />;
  return <FileIcon className="size-5" />;
}

function fileTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    image: "Imagem",
    audio: "Áudio",
    video: "Vídeo",
    document: "Documento",
    sticker: "Figurinha",
  };
  return labels[type] ?? "Arquivo";
}

function appointmentStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    scheduled: "Agendado",
    confirmed: "Confirmado",
    waiting: "Aguardando",
    in_progress: "Em atendimento",
    attended: "Atendido",
    no_show: "Faltou",
    cancelled: "Cancelado",
  };
  return labels[status] ?? status;
}

function appointmentStatusVariant(
  status: string,
): "neutral" | "primary" | "success" | "warning" | "destructive" {
  if (status === "attended" || status === "confirmed") return "success";
  if (status === "cancelled" || status === "no_show") return "neutral";
  if (status === "waiting" || status === "in_progress") return "warning";
  return "primary";
}

function bookingStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    requested: "Solicitada",
    confirmed: "Confirmada",
    rejected: "Recusada",
    cancelled: "Cancelada",
  };
  return labels[status] ?? status;
}

function bookingStatusVariant(
  status: string,
): "neutral" | "primary" | "success" | "warning" | "destructive" {
  if (status === "confirmed") return "success";
  if (status === "requested") return "primary";
  return "neutral";
}

function defaultAppointmentDateTime(): string {
  const date = new Date(Date.now() + 60 * 60_000);
  date.setMinutes(Math.ceil(date.getMinutes() / 15) * 15, 0, 0);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(
    new Date(`${value}T12:00:00`),
  );
}

function formatCurrency(value: number | string): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number(value));
}

function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  const local = digits.startsWith("55") ? digits.slice(2) : digits;
  if (local.length === 11) {
    return `(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`;
  }
  if (local.length === 10) {
    return `(${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`;
  }
  return phone;
}

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}
