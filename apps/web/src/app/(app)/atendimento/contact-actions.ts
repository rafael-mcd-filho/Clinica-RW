"use server";

import { z } from "zod";
import { getRequestContext, hasAnyPermission } from "@/lib/auth/context";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const conversationIdSchema = z.string().uuid();
const activeAppointmentStatuses = [
  "scheduled",
  "confirmed",
  "waiting",
  "in_progress",
] as const;
const mediaMessageTypes = [
  "image",
  "audio",
  "video",
  "document",
  "sticker",
] as const;

export type ContactPermissionView = {
  canViewPatient: boolean;
  canViewAgenda: boolean;
  canCreateAppointment: boolean;
  canViewFunnel: boolean;
  canManageFunnel: boolean;
  canConfigureFunnel: boolean;
};

export type ContactAppointmentView = {
  id: string;
  status: string;
  startAt: string;
  endAt: string;
  notes: string | null;
  procedureId: string;
  procedureName: string;
  professionalId: string;
  professionalName: string;
};

export type ContactOnlineBookingView = {
  id: string;
  status: string;
  requestedStartAt: string;
  requestedEndAt: string;
  patientName: string;
  procedureId: string;
  procedureName: string;
  professionalId: string;
  professionalName: string;
  appointmentId: string | null;
};

export type ContactAttendanceEventView = {
  id: string;
  sessionId: string;
  eventType: string;
  actorUserId: string | null;
  actorName: string | null;
  fromUserId: string | null;
  fromUserName: string | null;
  toUserId: string | null;
  toUserName: string | null;
  occurredAt: string;
  metadata: Record<string, unknown>;
};

export type ContactFileView = {
  id: string;
  conversationId: string;
  direction: "inbound" | "outbound";
  messageType: string;
  name: string | null;
  mediaMimeType: string | null;
  status: string;
  createdAt: string;
  sentAt: string | null;
};

export type ContactOpportunityMovementView = {
  id: string;
  cardId: string;
  fromStageName: string | null;
  toStageName: string;
  movedByName: string | null;
  movedAt: string;
  note: string | null;
};

export type ContactOpportunityView = {
  id: string;
  funnelId: string;
  funnelName: string;
  stageId: string;
  stageName: string;
  assignedProfessionalId: string | null;
  assignedProfessionalName: string | null;
  nextAction: string | null;
  nextActionDate: string | null;
  value: number | string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ContactDetailsData = {
  organizationId: string;
  conversationId: string;
  contact: {
    id: string;
    name: string;
    phone: string;
    patientId: string | null;
    createdAt: string;
  };
  patient: {
    id: string;
    fullName: string;
    socialName: string | null;
    email: string | null;
    phone: string | null;
    whatsapp: string | null;
    status: string;
    source: string | null;
    createdAt: string;
  } | null;
  permissions: ContactPermissionView;
  activeAppointments: ContactAppointmentView[];
  appointmentHistory: ContactAppointmentView[];
  onlineBookings: ContactOnlineBookingView[];
  attendanceEvents: ContactAttendanceEventView[];
  files: ContactFileView[];
  opportunities: ContactOpportunityView[];
  opportunityMovements: ContactOpportunityMovementView[];
};

export type ContactDetailsResult =
  | { ok: true; data: ContactDetailsData }
  | { ok: false; error: string };

type ConversationRow = { id: string; contact_id: string };
type ContactRow = {
  id: string;
  phone: string;
  wa_name: string | null;
  patient_id: string | null;
  created_at: string;
};
type PatientRow = {
  id: string;
  full_name: string;
  social_name: string | null;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  status: string;
  source: string | null;
  created_at: string;
};
type AppointmentRow = {
  id: string;
  status: string;
  start_at: string;
  end_at: string;
  notes: string | null;
  procedure_id: string;
  professional_id: string;
};
type BookingRow = {
  id: string;
  status: string;
  requested_start_at: string;
  requested_end_at: string;
  patient_name: string;
  procedure_id: string;
  professional_id: string;
  appointment_id: string | null;
};
type AttendanceEventRow = {
  id: string;
  session_id: string;
  event_type: string;
  actor_user_id: string | null;
  from_user_id: string | null;
  to_user_id: string | null;
  occurred_at: string;
  metadata: Record<string, unknown> | null;
};
type FileRow = {
  id: string;
  conversation_id: string;
  direction: "inbound" | "outbound";
  message_type: string;
  body: string | null;
  media_mime_type: string | null;
  status: string;
  created_at: string;
  sent_at: string | null;
};
type OpportunityRow = {
  id: string;
  funnel_id: string;
  stage_id: string;
  assigned_professional_id: string | null;
  next_action: string | null;
  next_action_date: string | null;
  value: number | string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};
type MovementRow = {
  id: string;
  card_id: string;
  from_stage_id: string | null;
  to_stage_id: string;
  moved_by_user_id: string | null;
  moved_at: string;
  note: string | null;
};

export async function loadContactDetailsAction(
  conversationId: string,
): Promise<ContactDetailsResult> {
  const parsedConversationId = conversationIdSchema.safeParse(conversationId);
  if (!parsedConversationId.success) {
    return { ok: false, error: "Conversa inválida." };
  }

  const context = await getRequestContext();
  if (
    !context.organization ||
    !context.effectiveUser ||
    !hasAnyPermission(context.permissionCodes, [
      "atendimento.ver",
      "atendimento.atender",
      "atendimento.configurar",
    ])
  ) {
    return { ok: false, error: "Acesso negado." };
  }

  const organizationId = context.organization.id;
  const permissions: ContactPermissionView = {
    canViewPatient: context.permissionCodes.has("paciente.ver"),
    canViewAgenda: context.permissionCodes.has("agenda.ver"),
    canCreateAppointment: context.permissionCodes.has(
      "agenda.criar_agendamento",
    ),
    canViewFunnel: hasAnyPermission(context.permissionCodes, [
      "funil.ver",
      "funil.gerenciar",
      "funil.configurar",
    ]),
    canManageFunnel: context.permissionCodes.has("funil.gerenciar"),
    canConfigureFunnel: context.permissionCodes.has("funil.configurar"),
  };
  const supabase = await createSupabaseServerClient();

  const { data: conversation, error: conversationError } = await supabase
    .from("whatsapp_conversations")
    .select("id, contact_id")
    .eq("organization_id", organizationId)
    .eq("id", parsedConversationId.data)
    .maybeSingle<ConversationRow>();
  if (conversationError || !conversation) {
    return { ok: false, error: "Conversa não encontrada." };
  }

  const { data: contact, error: contactError } = await supabase
    .from("whatsapp_contacts")
    .select("id, phone, wa_name, patient_id, created_at")
    .eq("organization_id", organizationId)
    .eq("id", conversation.contact_id)
    .maybeSingle<ContactRow>();
  if (contactError || !contact) {
    return { ok: false, error: "Contato não encontrado." };
  }

  const patientPromise =
    permissions.canViewPatient && contact.patient_id
      ? supabase
          .from("patients")
          .select(
            "id, full_name, social_name, email, phone, whatsapp, status, source, created_at",
          )
          .eq("organization_id", organizationId)
          .eq("id", contact.patient_id)
          .is("deleted_at", null)
          .maybeSingle<PatientRow>()
      : Promise.resolve({ data: null as PatientRow | null, error: null });

  const allAppointmentsPromise =
    permissions.canViewAgenda && contact.patient_id
      ? supabase
          .from("appointments")
          .select(
            "id, status, start_at, end_at, notes, procedure_id, professional_id",
          )
          .eq("organization_id", organizationId)
          .eq("patient_id", contact.patient_id)
          .order("start_at", { ascending: false })
          .limit(80)
          .returns<AppointmentRow[]>()
      : Promise.resolve({ data: [] as AppointmentRow[], error: null });

  const activeAppointmentsPromise =
    permissions.canViewAgenda && contact.patient_id
      ? supabase
          .from("appointments")
          .select(
            "id, status, start_at, end_at, notes, procedure_id, professional_id",
          )
          .eq("organization_id", organizationId)
          .eq("patient_id", contact.patient_id)
          .in("status", [...activeAppointmentStatuses])
          .gte("end_at", new Date().toISOString())
          .order("start_at", { ascending: true })
          .limit(12)
          .returns<AppointmentRow[]>()
      : Promise.resolve({ data: [] as AppointmentRow[], error: null });

  const bookingsQuery = supabase
    .from("online_booking_requests")
    .select(
      "id, status, requested_start_at, requested_end_at, patient_name, procedure_id, professional_id, appointment_id",
    )
    .eq("organization_id", organizationId);
  const phoneSuffix = contact.phone.replace(/\D/g, "").slice(-8);
  const onlineBookingsPromise = permissions.canViewAgenda
    ? (contact.patient_id
        ? phoneSuffix.length === 8
          ? bookingsQuery.or(
              `patient_id.eq.${contact.patient_id},patient_phone.ilike.%${phoneSuffix}%`,
            )
          : bookingsQuery.eq("patient_id", contact.patient_id)
        : phoneSuffix.length === 8
          ? bookingsQuery.ilike("patient_phone", `%${phoneSuffix}%`)
          : bookingsQuery.eq("id", "00000000-0000-0000-0000-000000000000")
      )
        .order("requested_start_at", { ascending: false })
        .limit(40)
        .returns<BookingRow[]>()
    : Promise.resolve({ data: [] as BookingRow[], error: null });

  const contactConversationsPromise = supabase
    .from("whatsapp_conversations")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("contact_id", contact.id)
    .order("created_at", { ascending: false })
    .limit(20)
    .returns<Array<{ id: string }>>();

  // Cards do paciente e cards criados direto da conversa (que podem nem ter
  // paciente ainda) contam como oportunidades do mesmo contato.
  const opportunityFilters = [
    `contact_id.eq.${contact.id}`,
    ...(contact.patient_id ? [`patient_id.eq.${contact.patient_id}`] : []),
  ];
  const opportunitiesPromise = permissions.canViewFunnel
    ? supabase
        .from("funnel_cards")
        .select(
          "id, funnel_id, stage_id, assigned_professional_id, next_action, next_action_date, value, archived_at, created_at, updated_at",
        )
        .eq("organization_id", organizationId)
        .or(opportunityFilters.join(","))
        .order("created_at", { ascending: false })
        .limit(30)
        .returns<OpportunityRow[]>()
    : Promise.resolve({ data: [] as OpportunityRow[], error: null });

  // Os catálogos do agendamento não vêm mais daqui: o modal compartilhado
  // (components/agenda/appointment-form-modal) carrega os seus quando abre.
  const [
    patientResult,
    allAppointmentsResult,
    activeAppointmentsResult,
    onlineBookingsResult,
    contactConversationsResult,
    opportunitiesResult,
  ] = await Promise.all([
    patientPromise,
    allAppointmentsPromise,
    activeAppointmentsPromise,
    onlineBookingsPromise,
    contactConversationsPromise,
    opportunitiesPromise,
  ]);

  const allAppointments = allAppointmentsResult.data ?? [];
  const activeAppointments = activeAppointmentsResult.data ?? [];
  const activeAppointmentIds = new Set(
    activeAppointments.map((appointment) => appointment.id),
  );
  const appointmentHistory = allAppointments
    .filter((appointment) => !activeAppointmentIds.has(appointment.id))
    .slice(0, 50);
  const onlineBookings = onlineBookingsResult.data ?? [];
  const opportunities = opportunitiesResult.data ?? [];
  const conversationIds = (contactConversationsResult.data ?? []).map(
    (item) => item.id,
  );
  const eventsResult = conversationIds.length
    ? await supabase
        .from("whatsapp_attendance_events")
        .select(
          "id, session_id, event_type, actor_user_id, from_user_id, to_user_id, occurred_at, metadata",
        )
        .eq("organization_id", organizationId)
        .in("conversation_id", conversationIds)
        .order("occurred_at", { ascending: false })
        .limit(120)
        .returns<AttendanceEventRow[]>()
    : { data: [] as AttendanceEventRow[] };
  const events = eventsResult.data ?? [];

  const procedureIds = [
    ...new Set(
      [...activeAppointments, ...appointmentHistory]
        .map((appointment) => appointment.procedure_id)
        .concat(onlineBookings.map((booking) => booking.procedure_id)),
    ),
  ];
  const professionalIds = [
    ...new Set(
      [...activeAppointments, ...appointmentHistory]
        .map((appointment) => appointment.professional_id)
        .concat(onlineBookings.map((booking) => booking.professional_id))
        .concat(
          opportunities
            .map((opportunity) => opportunity.assigned_professional_id)
            .filter((id): id is string => Boolean(id)),
        ),
    ),
  ];
  const funnelIds = [...new Set(opportunities.map((item) => item.funnel_id))];
  const cardIds = opportunities.map((item) => item.id);
  const eventUserIds = [
    ...new Set(
      events
        .flatMap((event) => [
          event.actor_user_id,
          event.from_user_id,
          event.to_user_id,
        ])
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  const [
    proceduresResult,
    professionalsResult,
    funnelsResult,
    stagesResult,
    movementsResult,
    eventUsersResult,
    filesResult,
  ] = await Promise.all([
    procedureIds.length
      ? supabase
          .from("procedures")
          .select("id, name")
          .eq("organization_id", organizationId)
          .in("id", procedureIds)
          .returns<Array<{ id: string; name: string }>>()
      : Promise.resolve({ data: [] as Array<{ id: string; name: string }> }),
    professionalIds.length
      ? supabase
          .from("professionals")
          .select("id, name")
          .eq("organization_id", organizationId)
          .in("id", professionalIds)
          .returns<Array<{ id: string; name: string }>>()
      : Promise.resolve({ data: [] as Array<{ id: string; name: string }> }),
    funnelIds.length
      ? supabase
          .from("funnels")
          .select("id, name")
          .eq("organization_id", organizationId)
          .in("id", funnelIds)
          .returns<Array<{ id: string; name: string }>>()
      : Promise.resolve({ data: [] as Array<{ id: string; name: string }> }),
    cardIds.length
      ? supabase
          .from("funnel_stages")
          .select("id, name")
          .eq("organization_id", organizationId)
          .in("funnel_id", funnelIds)
          .returns<Array<{ id: string; name: string }>>()
      : Promise.resolve({ data: [] as Array<{ id: string; name: string }> }),
    cardIds.length
      ? supabase
          .from("funnel_card_movements")
          .select(
            "id, card_id, from_stage_id, to_stage_id, moved_by_user_id, moved_at, note",
          )
          .eq("organization_id", organizationId)
          .in("card_id", cardIds)
          .order("moved_at", { ascending: false })
          .limit(150)
          .returns<MovementRow[]>()
      : Promise.resolve({ data: [] as MovementRow[] }),
    eventUserIds.length
      ? supabase
          .from("app_users")
          .select("id, name")
          .eq("organization_id", organizationId)
          .in("id", eventUserIds)
          .returns<Array<{ id: string; name: string }>>()
      : Promise.resolve({ data: [] as Array<{ id: string; name: string }> }),
    conversationIds.length
      ? supabase
          .from("whatsapp_messages")
          .select(
            "id, conversation_id, direction, message_type, body, media_mime_type, status, created_at, sent_at",
          )
          .eq("organization_id", organizationId)
          .in("conversation_id", conversationIds)
          .in("message_type", [...mediaMessageTypes])
          .not("media_url", "is", null)
          .order("created_at", { ascending: false })
          .limit(120)
          .returns<FileRow[]>()
      : Promise.resolve({ data: [] as FileRow[] }),
  ]);

  const movements = movementsResult.data ?? [];
  const movementUserIds = [
    ...new Set(
      movements
        .map((movement) => movement.moved_by_user_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const { data: movementUsers } = movementUserIds.length
    ? await supabase
        .from("app_users")
        .select("id, name")
        .eq("organization_id", organizationId)
        .in("id", movementUserIds)
        .returns<Array<{ id: string; name: string }>>()
    : { data: [] as Array<{ id: string; name: string }> };

  const procedureName = new Map(
    (proceduresResult.data ?? []).map((item) => [item.id, item.name]),
  );
  const professionalName = new Map(
    (professionalsResult.data ?? []).map((item) => [item.id, item.name]),
  );
  const funnelName = new Map(
    (funnelsResult.data ?? []).map((item) => [item.id, item.name]),
  );
  const stageName = new Map(
    (stagesResult.data ?? []).map((item) => [item.id, item.name]),
  );
  const eventUserName = new Map(
    (eventUsersResult.data ?? []).map((item) => [item.id, item.name]),
  );
  const movementUserName = new Map(
    (movementUsers ?? []).map((item) => [item.id, item.name]),
  );

  function mapAppointment(row: AppointmentRow): ContactAppointmentView {
    return {
      id: row.id,
      status: row.status,
      startAt: row.start_at,
      endAt: row.end_at,
      notes: row.notes,
      procedureId: row.procedure_id,
      procedureName: procedureName.get(row.procedure_id) ?? "Procedimento",
      professionalId: row.professional_id,
      professionalName:
        professionalName.get(row.professional_id) ?? "Profissional",
    };
  }

  const patient = patientResult.data;
  return {
    ok: true,
    data: {
      organizationId,
      conversationId: conversation.id,
      contact: {
        id: contact.id,
        name: contact.wa_name || contact.phone || "Contato",
        phone: contact.phone,
        patientId: contact.patient_id,
        createdAt: contact.created_at,
      },
      patient: patient
        ? {
            id: patient.id,
            fullName: patient.full_name,
            socialName: patient.social_name,
            email: patient.email,
            phone: patient.phone,
            whatsapp: patient.whatsapp,
            status: patient.status,
            source: patient.source,
            createdAt: patient.created_at,
          }
        : null,
      permissions,
      activeAppointments: activeAppointments.map(mapAppointment),
      appointmentHistory: appointmentHistory.map(mapAppointment),
      onlineBookings: onlineBookings.map((booking) => ({
        id: booking.id,
        status: booking.status,
        requestedStartAt: booking.requested_start_at,
        requestedEndAt: booking.requested_end_at,
        patientName: booking.patient_name,
        procedureId: booking.procedure_id,
        procedureName:
          procedureName.get(booking.procedure_id) ?? "Procedimento",
        professionalId: booking.professional_id,
        professionalName:
          professionalName.get(booking.professional_id) ?? "Profissional",
        appointmentId: booking.appointment_id,
      })),
      attendanceEvents: events.map((event) => ({
        id: event.id,
        sessionId: event.session_id,
        eventType: event.event_type,
        actorUserId: event.actor_user_id,
        actorName: event.actor_user_id
          ? (eventUserName.get(event.actor_user_id) ?? null)
          : null,
        fromUserId: event.from_user_id,
        fromUserName: event.from_user_id
          ? (eventUserName.get(event.from_user_id) ?? null)
          : null,
        toUserId: event.to_user_id,
        toUserName: event.to_user_id
          ? (eventUserName.get(event.to_user_id) ?? null)
          : null,
        occurredAt: event.occurred_at,
        metadata: event.metadata ?? {},
      })),
      files: (filesResult.data ?? []).map((file) => ({
        id: file.id,
        conversationId: file.conversation_id,
        direction: file.direction,
        messageType: file.message_type,
        name: file.body,
        mediaMimeType: file.media_mime_type,
        status: file.status,
        createdAt: file.created_at,
        sentAt: file.sent_at,
      })),
      opportunities: opportunities.map((opportunity) => ({
        id: opportunity.id,
        funnelId: opportunity.funnel_id,
        funnelName: funnelName.get(opportunity.funnel_id) ?? "Funil",
        stageId: opportunity.stage_id,
        stageName: stageName.get(opportunity.stage_id) ?? "Etapa",
        assignedProfessionalId: opportunity.assigned_professional_id,
        assignedProfessionalName: opportunity.assigned_professional_id
          ? (professionalName.get(opportunity.assigned_professional_id) ?? null)
          : null,
        nextAction: opportunity.next_action,
        nextActionDate: opportunity.next_action_date,
        value: opportunity.value,
        archivedAt: opportunity.archived_at,
        createdAt: opportunity.created_at,
        updatedAt: opportunity.updated_at,
      })),
      opportunityMovements: movements.map((movement) => ({
        id: movement.id,
        cardId: movement.card_id,
        fromStageName: movement.from_stage_id
          ? (stageName.get(movement.from_stage_id) ?? "Etapa")
          : null,
        toStageName: stageName.get(movement.to_stage_id) ?? "Etapa",
        movedByName: movement.moved_by_user_id
          ? (movementUserName.get(movement.moved_by_user_id) ?? null)
          : null,
        movedAt: movement.moved_at,
        note: movement.note,
      })),
    },
  };
}
