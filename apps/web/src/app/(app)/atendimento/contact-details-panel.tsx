"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowCounterClockwise,
  ArrowsLeftRight,
  ArrowSquareOut,
  CalendarDots,
  CalendarPlus,
  CaretRight,
  CheckCircle,
  ClockCounterClockwise,
  File as FileIcon,
  FileAudio,
  FileImage,
  FileVideo,
  FunnelSimple,
  LinkSimple,
  MagnifyingGlass,
  Paperclip,
  Play,
  Tag as TagIcon,
  TrendUp,
  UserCircle,
  WhatsappLogo,
  X,
  type Icon as PhosphorIcon,
} from "@phosphor-icons/react";
import {
  useActionState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
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
  type ContactDetailsResult,
  type ContactFileView,
  type ContactOnlineBookingView,
  type ContactOpportunityMovementView,
  type ContactOpportunityView,
} from "./contact-actions";
import { linkPatientAction, setConversationTagAction } from "./actions";
import { createAppointment, type AgendaActionState } from "../agenda/actions";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Input, Select, Textarea } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { Tabs } from "@/components/ui/tabs";
import { Timeline } from "@/components/ui/timeline";
import type {
  ConversationListItem,
  ConversationTagView,
} from "@/lib/whatsapp/types";
import { cn } from "@/lib/utils";

type LoadedContactDetails = {
  conversationId: string;
  data: ContactDetailsData | null;
  error: string | null;
};

type ContactDetailsCacheEntry = {
  expiresAt: number;
  promise: Promise<LoadedContactDetails>;
  value?: LoadedContactDetails;
};

const contactDetailsCache = new Map<string, ContactDetailsCacheEntry>();
const contactDetailsCacheTtlMs = 60_000;

function contactDetailsCacheKey(
  organizationId: string,
  conversationId: string,
) {
  return `${organizationId}:${conversationId}`;
}

function normalizeContactDetailsResult(
  result: ContactDetailsResult,
  conversationId: string,
  organizationId: string,
): LoadedContactDetails {
  if (result.ok && result.data.organizationId === organizationId) {
    return { conversationId, data: result.data, error: null };
  }
  return {
    conversationId,
    data: null,
    error: result.ok ? "Empresa inválida." : result.error,
  };
}

/**
 * Starts loading the contact sidebar before it is opened.
 * The inbox should call this as soon as the selected conversation changes.
 */
export function preloadContactDetails(
  conversationId: string,
  organizationId: string,
  force = false,
): Promise<LoadedContactDetails> {
  const key = contactDetailsCacheKey(organizationId, conversationId);
  const cached = contactDetailsCache.get(key);
  if (!force && cached && cached.expiresAt > Date.now()) {
    return cached.promise;
  }

  const promise = loadContactDetailsAction(conversationId).then((result) =>
    normalizeContactDetailsResult(result, conversationId, organizationId),
  );
  const entry: ContactDetailsCacheEntry = {
    expiresAt: Date.now() + contactDetailsCacheTtlMs,
    promise,
  };
  contactDetailsCache.set(key, entry);
  void promise.then((value) => {
    if (contactDetailsCache.get(key) === entry) entry.value = value;
  });
  return promise;
}

function cachedContactDetails(
  conversationId: string,
  organizationId: string,
): LoadedContactDetails | undefined {
  const entry = contactDetailsCache.get(
    contactDetailsCacheKey(organizationId, conversationId),
  );
  return entry && entry.expiresAt > Date.now() ? entry.value : undefined;
}

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
  const [activeTab, setActiveTab] = useState("contato");
  const [loaded, setLoaded] = useState<LoadedContactDetails | null>(
    () => cachedContactDetails(conversation.id, organizationId) ?? null,
  );

  useEffect(() => {
    let active = true;
    void preloadContactDetails(conversation.id, organizationId, false).then(
      (result) => {
        if (active) setLoaded(result);
      },
    );
    return () => {
      active = false;
    };
  }, [conversation.id, loadRevision, organizationId]);

  const refresh = useCallback(() => {
    contactDetailsCache.delete(
      contactDetailsCacheKey(organizationId, conversation.id),
    );
    setLoadRevision((value) => value + 1);
  }, [conversation.id, organizationId]);
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
            {activeTab === "arquivos" ? (
              <>
                <Paperclip
                  className="size-5 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
                <p className="truncate text-body-sm font-semibold">
                  Arquivos na conversa
                </p>
              </>
            ) : (
              <>
                <Avatar
                  name={conversation.contactName}
                  photoUrl={conversation.contactPhotoUrl}
                />
                <div className="min-w-0">
                  <p className="truncate text-body-sm font-semibold">
                    {conversation.contactName}
                  </p>
                  <p className="truncate text-label tabular-nums text-muted-foreground">
                    {formatPhone(conversation.contactPhone)}
                  </p>
                </div>
              </>
            )}
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
            iconOnly
            value={activeTab}
            onValueChange={setActiveTab}
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
                content: (
                  <FilesTab
                    files={current.data.files}
                    contactName={conversation.contactName}
                  />
                ),
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
  const [confirmingUnlink, setConfirmingUnlink] = useState(false);
  const [tagToRemove, setTagToRemove] = useState<ConversationTagView | null>(
    null,
  );
  const selectedTagIds = useMemo(
    () => new Set(conversation.tags.map((tag) => tag.id)),
    [conversation.tags],
  );

  function toggleTag(tag: ConversationTagView) {
    const attach = !selectedTagIds.has(tag.id);
    if (!attach) {
      setTagToRemove(tag);
      return;
    }
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

  async function unlinkPatient() {
    const result = await linkPatientAction(data.contact.id, null);
    if (!result.ok) {
      toast.error(result.error ?? "Não foi possível remover o vínculo.");
      return false;
    }
    toast.success("Vínculo com o paciente removido.");
    onRefresh();
    router.refresh();
    return true;
  }

  async function removeTag() {
    if (!tagToRemove) return false;
    const result = await setConversationTagAction(
      conversation.id,
      tagToRemove.id,
      false,
    );
    if (!result.ok) {
      toast.error(result.error ?? "Não foi possível remover a etiqueta.");
      return false;
    }
    onTagsChange(
      conversation.tags.filter((item) => item.id !== tagToRemove.id),
    );
    return true;
  }

  return (
    <div className="grid gap-5">
      <ConfirmDialog
        open={confirmingUnlink}
        onClose={() => setConfirmingUnlink(false)}
        title="Desvincular paciente?"
        description="O contato deixará de estar associado a este paciente. O histórico da conversa será preservado."
        confirmLabel="Desvincular paciente"
        destructive
        onConfirm={unlinkPatient}
      />
      <ConfirmDialog
        open={Boolean(tagToRemove)}
        onClose={() => setTagToRemove(null)}
        title="Remover etiqueta?"
        description={`A etiqueta “${tagToRemove?.name ?? ""}” será removida desta conversa.`}
        confirmLabel="Remover etiqueta"
        destructive
        onConfirm={removeTag}
      />
      <div className="flex flex-col items-center border-b border-border pb-5 text-center">
        <Avatar
          name={conversation.contactName}
          photoUrl={conversation.contactPhotoUrl}
          size="lg"
        />
        <h2 className="mt-3 max-w-full truncate text-base font-semibold">
          {data.contact.name}
        </h2>
        {data.patient ? (
          <p className="mt-1 text-label text-muted-foreground">
            Paciente vinculado
          </p>
        ) : null}
      </div>

      <section className="grid gap-5 border-b border-border px-1 pb-5">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-label text-muted-foreground">Telefone</p>
            <p className="mt-0.5 truncate text-body-sm font-medium tabular-nums">
              {formatPhone(data.contact.phone)}
            </p>
          </div>
          <Button
            asChild
            variant="ghost"
            size="icon-sm"
            className="rounded-full border border-border text-[#128c7e]"
          >
            <a
              href={`https://wa.me/${whatsappPhone(data.contact.phone)}`}
              target="_blank"
              rel="noreferrer"
              aria-label="Abrir conversa no WhatsApp"
            >
              <WhatsappLogo className="size-4" aria-hidden="true" />
            </a>
          </Button>
        </div>

        {data.patient?.email ? (
          <div>
            <p className="text-label text-muted-foreground">E-mail</p>
            <p className="mt-0.5 break-words text-body-sm font-medium">
              {data.patient.email}
            </p>
          </div>
        ) : null}

        {data.contact.patientId ? (
          <div className="grid gap-2 rounded-lg bg-muted/50 p-3">
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
                onClick={() => setConfirmingUnlink(true)}
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
      </section>

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
    <Timeline
      items={events.map((event) => {
        const reason = metadataText(event.metadata, "reason");
        return {
          id: event.id,
          icon: attendanceEventIcon(event.eventType),
          title: attendanceEventLabel(event.eventType),
          timestamp: formatDateTime(event.occurredAt),
          dateTime: event.occurredAt,
          description: attendanceEventDescription(event),
          detail: reason ? `Motivo: ${reason}` : null,
        };
      })}
    />
  );
}

type FileFilter = "all" | "image" | "audio" | "video" | "document";

const fileSizeCache = new Map<string, number | null>();

function FilesTab({
  files,
  contactName,
}: {
  files: ContactFileView[];
  contactName: string;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FileFilter>("all");
  const normalizedQuery = query.trim().toLocaleLowerCase("pt-BR");
  const filteredFiles = useMemo(
    () =>
      files.filter((file) => {
        const normalizedType =
          file.messageType === "sticker" ? "image" : file.messageType;
        const matchesFilter = filter === "all" || normalizedType === filter;
        const matchesQuery =
          !normalizedQuery ||
          [
            file.name,
            file.mediaMimeType,
            fileTypeLabel(file.messageType),
            file.direction === "inbound" ? contactName : "Equipe",
          ].some((value) =>
            value?.toLocaleLowerCase("pt-BR").includes(normalizedQuery),
          );
        return matchesFilter && matchesQuery;
      }),
    [contactName, files, filter, normalizedQuery],
  );

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
    <div className="grid gap-4">
      <div className="flex items-center gap-2">
        <label className="relative min-w-0 flex-1">
          <span className="sr-only">Buscar arquivos</span>
          <MagnifyingGlass
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar"
            className="rounded-full pl-9"
          />
        </label>
        <label className="relative">
          <span className="sr-only">Filtrar arquivos por tipo</span>
          <FunnelSimple
            className="pointer-events-none absolute left-2.5 top-1/2 z-10 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Select
            value={filter}
            onValueChange={(value) => setFilter(value as FileFilter)}
            className="w-10 px-2 [&>span]:sr-only [&>svg]:hidden"
            aria-label="Filtrar arquivos por tipo"
          >
            <option value="all">Todos</option>
            <option value="image">Imagens</option>
            <option value="audio">Áudios</option>
            <option value="video">Vídeos</option>
            <option value="document">Documentos</option>
          </Select>
        </label>
      </div>

      {filteredFiles.length ? (
        <ul className="grid gap-2">
          {filteredFiles.map((file) => (
            <FileItem key={file.id} file={file} contactName={contactName} />
          ))}
        </ul>
      ) : (
        <EmptyPanel
          icon={<MagnifyingGlass className="size-5" />}
          title="Nenhum arquivo encontrado"
          description="Ajuste a busca ou o tipo de arquivo."
        />
      )}
    </div>
  );
}

function FileItem({
  file,
  contactName,
}: {
  file: ContactFileView;
  contactName: string;
}) {
  const mediaEndpoint = `/api/whatsapp/media/${file.id}`;
  const sender = file.direction === "inbound" ? contactName : "Equipe";

  return (
    <li>
      <a
        href={mediaEndpoint}
        target="_blank"
        rel="noreferrer"
        className="group flex min-w-0 items-center gap-2.5 rounded-md bg-muted/70 p-2 transition-colors hover:bg-muted"
      >
        <FilePreview file={file} endpoint={mediaEndpoint} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-body-sm font-medium">
            {file.name || fileTypeLabel(file.messageType)}
          </span>
          <span className="mt-0.5 block truncate text-caption text-muted-foreground">
            <FileSizeLabel fileId={file.id} endpoint={mediaEndpoint} />
            {" · "}
            {fileTypeLabel(file.messageType)}
            {" · "}
            {sender}
          </span>
          <span className="block truncate text-caption text-muted-foreground">
            {formatDateTime(file.createdAt)}
          </span>
        </span>
        <ArrowSquareOut
          className="size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground"
          aria-hidden="true"
        />
      </a>
    </li>
  );
}

function FilePreview({
  file,
  endpoint,
}: {
  file: ContactFileView;
  endpoint: string;
}) {
  if (file.messageType === "image" || file.messageType === "sticker") {
    return (
      <Image
        unoptimized
        src={endpoint}
        alt=""
        width={48}
        height={48}
        loading="lazy"
        className="size-12 shrink-0 rounded-md bg-card object-cover"
      />
    );
  }
  return (
    <span className="flex size-12 shrink-0 items-center justify-center rounded-md bg-card text-primary">
      {fileTypeIcon(file.messageType)}
    </span>
  );
}

function FileSizeLabel({
  fileId,
  endpoint,
}: {
  fileId: string;
  endpoint: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [size, setSize] = useState<number | null | undefined>(() =>
    fileSizeCache.has(fileId) ? fileSizeCache.get(fileId) : undefined,
  );

  useEffect(() => {
    if (size !== undefined) return;
    const element = ref.current;
    if (!element) return;
    const controller = new AbortController();
    const load = async () => {
      try {
        const response = await fetch(endpoint, {
          method: "HEAD",
          cache: "force-cache",
          signal: controller.signal,
        });
        const value = Number(response.headers.get("content-length"));
        const nextSize =
          response.ok && Number.isFinite(value) && value > 0 ? value : null;
        fileSizeCache.set(fileId, nextSize);
        setSize(nextSize);
      } catch {
        if (!controller.signal.aborted) {
          fileSizeCache.set(fileId, null);
          setSize(null);
        }
      }
    };
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        observer.disconnect();
        void load();
      }
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
      controller.abort();
    };
  }, [endpoint, fileId, size]);

  return <span ref={ref}>{size ? formatFileSize(size) : "Tamanho n/d"}</span>;
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
    <section className="border-b border-border px-1 pb-5 last:border-b-0">
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

/** Mesmos ramos de `attendanceEventLabel` — mantenha os dois em sincronia. */
function attendanceEventIcon(eventType: string): PhosphorIcon {
  const normalized = eventType.toLowerCase();
  if (normalized.includes("transfer")) return ArrowsLeftRight;
  if (normalized.includes("complete") || normalized.includes("resolv")) {
    return CheckCircle;
  }
  if (normalized.includes("reopen")) return ArrowCounterClockwise;
  if (normalized.includes("start") || normalized.includes("claim")) return Play;
  return ClockCounterClockwise;
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

function whatsappPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.startsWith("55") ? digits : `55${digits}`;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 ** 2).toLocaleString("pt-BR", {
    maximumFractionDigits: 1,
  })} MB`;
}
