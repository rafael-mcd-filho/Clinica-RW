"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getRequestContext } from "@/lib/auth/context";
import { defaultStageColor } from "@/lib/colors";
import {
  createQuickPatient,
  type QuickPatientActionState,
} from "@/lib/patients/quick-create";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type FunilActionState = {
  error?: string;
  success?: string;
};

const stageInputSchema = z.object({
  name: z.string().trim().min(1).max(60),
  color: z
    .string()
    .trim()
    .regex(/^#[0-9A-Fa-f]{6}$/),
  stage_type: z.enum(["initial", "intermediate", "success", "failure"]),
  wip_limit: z.coerce.number().int().positive().nullable().optional(),
});

async function requireFunilPermission(code: string) {
  const context = await getRequestContext();
  if (!context.organization || !context.permissionCodes.has(code)) return null;
  return { ...context, organization: context.organization };
}

function friendlyError(message: string) {
  if (message.includes("funnel_cards_active_patient_key")) {
    return "Este paciente já está ativo neste funil.";
  }
  if (message.includes("WIP limit")) {
    return "A etapa de destino atingiu o limite de cards.";
  }
  if (message.includes("Target stage not found")) {
    return "Etapa inválida para este funil.";
  }
  if (message.includes("archived card")) {
    return "Este card está arquivado e não pode ser movido.";
  }
  if (message.includes("moved_by_user_id")) {
    return "Não foi possível registrar o responsável pela movimentação.";
  }
  if (message.includes("foreign key")) {
    return "Um cadastro vinculado ao funil está inválido ou indisponível.";
  }
  if (message.includes("funnels_organization_id_name_key")) {
    return "Já existe um funil com este nome.";
  }
  return message;
}

export async function createFunnel(
  _state: FunilActionState,
  formData: FormData,
): Promise<FunilActionState> {
  const context = await requireFunilPermission("funil.configurar");
  if (!context) return { error: "Acesso negado." };
  const organizationId = context.organization.id;

  const parsed = z
    .object({
      name: z.string().trim().min(2, "Informe o nome do funil."),
      description: z.string().trim().max(500).optional(),
      stages: z.string().min(2),
    })
    .safeParse({
      name: formData.get("name"),
      description: formData.get("description") || undefined,
      stages: formData.get("stages"),
    });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  let stages: z.infer<typeof stageInputSchema>[];
  try {
    stages = z
      .array(stageInputSchema)
      .min(1)
      .parse(JSON.parse(parsed.data.stages));
  } catch {
    return { error: "Informe ao menos uma etapa válida." };
  }

  const supabase = await createSupabaseServerClient();
  const { data: funnel, error } = await supabase
    .from("funnels")
    .insert({
      organization_id: organizationId,
      name: parsed.data.name,
      description: parsed.data.description || null,
      created_by_user_id: context.effectiveUser?.id ?? null,
    })
    .select("id")
    .single<{ id: string }>();

  if (error || !funnel) {
    return { error: friendlyError(error?.message ?? "Falha ao criar funil.") };
  }

  const { error: stagesError } = await supabase.from("funnel_stages").insert(
    stages.map((stage, index) => ({
      organization_id: organizationId,
      funnel_id: funnel.id,
      name: stage.name,
      color: stage.color,
      position: index,
      stage_type: stage.stage_type,
      wip_limit: stage.wip_limit || null,
    })),
  );

  if (stagesError) {
    return { error: friendlyError(stagesError.message) };
  }

  revalidatePath("/funis");
  return { success: "Funil criado." };
}

export async function updateFunnel(
  funnelId: string,
  _state: FunilActionState,
  formData: FormData,
): Promise<FunilActionState> {
  const context = await requireFunilPermission("funil.configurar");
  if (!context) return { error: "Acesso negado." };
  const organizationId = context.organization.id;

  const parsed = z
    .object({
      name: z.string().trim().min(2, "Informe o nome do funil."),
      description: z.string().trim().max(500).optional(),
    })
    .safeParse({
      name: formData.get("name"),
      description: formData.get("description") || undefined,
    });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("funnels")
    .update({
      name: parsed.data.name,
      description: parsed.data.description || null,
    })
    .eq("organization_id", organizationId)
    .eq("id", funnelId);

  if (error) return { error: friendlyError(error.message) };

  revalidatePath("/funis");
  revalidatePath(`/funis/${funnelId}`);
  return { success: "Funil atualizado." };
}

export async function setFunnelActive(
  funnelId: string,
  active: boolean,
): Promise<FunilActionState> {
  const context = await requireFunilPermission("funil.configurar");
  if (!context) return { error: "Acesso negado." };
  const organizationId = context.organization.id;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("funnels")
    .update({ active })
    .eq("organization_id", organizationId)
    .eq("id", funnelId);

  if (error) return { error: friendlyError(error.message) };

  revalidatePath("/funis");
  return { success: active ? "Funil reativado." : "Funil arquivado." };
}

export async function createStage(
  funnelId: string,
  _state: FunilActionState,
  formData: FormData,
): Promise<FunilActionState> {
  const context = await requireFunilPermission("funil.configurar");
  if (!context) return { error: "Acesso negado." };
  const organizationId = context.organization.id;

  const parsed = stageInputSchema.safeParse({
    name: formData.get("name"),
    color: formData.get("color") || defaultStageColor,
    stage_type: formData.get("stage_type") || "intermediate",
    wip_limit: formData.get("wip_limit") || null,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const supabase = await createSupabaseServerClient();
  const { count } = await supabase
    .from("funnel_stages")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .eq("funnel_id", funnelId);

  const { error } = await supabase.from("funnel_stages").insert({
    organization_id: organizationId,
    funnel_id: funnelId,
    name: parsed.data.name,
    color: parsed.data.color,
    stage_type: parsed.data.stage_type,
    wip_limit: parsed.data.wip_limit || null,
    position: count ?? 0,
  });

  if (error) return { error: friendlyError(error.message) };

  revalidatePath(`/funis/${funnelId}`);
  return { success: "Etapa criada." };
}

export async function updateStage(
  stageId: string,
  _state: FunilActionState,
  formData: FormData,
): Promise<FunilActionState> {
  const context = await requireFunilPermission("funil.configurar");
  if (!context) return { error: "Acesso negado." };
  const organizationId = context.organization.id;

  const parsed = stageInputSchema.safeParse({
    name: formData.get("name"),
    color: formData.get("color") || defaultStageColor,
    stage_type: formData.get("stage_type") || "intermediate",
    wip_limit: formData.get("wip_limit") || null,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const supabase = await createSupabaseServerClient();
  const { data: stage, error } = await supabase
    .from("funnel_stages")
    .update({
      name: parsed.data.name,
      color: parsed.data.color,
      stage_type: parsed.data.stage_type,
      wip_limit: parsed.data.wip_limit || null,
    })
    .eq("organization_id", organizationId)
    .eq("id", stageId)
    .select("funnel_id")
    .single<{ funnel_id: string }>();

  if (error) return { error: friendlyError(error.message) };

  revalidatePath(`/funis/${stage?.funnel_id}`);
  return { success: "Etapa atualizada." };
}

export async function reorderStages(
  funnelId: string,
  orderedStageIds: string[],
): Promise<FunilActionState> {
  const context = await requireFunilPermission("funil.configurar");
  if (!context) return { error: "Acesso negado." };
  const organizationId = context.organization.id;

  const supabase = await createSupabaseServerClient();
  const results = await Promise.all(
    orderedStageIds.map((stageId, index) =>
      supabase
        .from("funnel_stages")
        .update({ position: index })
        .eq("organization_id", organizationId)
        .eq("funnel_id", funnelId)
        .eq("id", stageId),
    ),
  );

  const failed = results.find((result) => result.error);
  if (failed?.error) return { error: friendlyError(failed.error.message) };

  revalidatePath(`/funis/${funnelId}`);
  return { success: "Ordem das etapas atualizada." };
}

export async function deleteStage(
  funnelId: string,
  stageId: string,
): Promise<FunilActionState> {
  const context = await requireFunilPermission("funil.configurar");
  if (!context) return { error: "Acesso negado." };
  const organizationId = context.organization.id;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("funnel_stages")
    .delete()
    .eq("organization_id", organizationId)
    .eq("id", stageId);

  if (error) {
    if (error.message.includes("foreign key")) {
      return {
        error: "Não é possível excluir: existem cards vinculados a esta etapa.",
      };
    }
    return { error: friendlyError(error.message) };
  }

  revalidatePath(`/funis/${funnelId}`);
  return { success: "Etapa excluída." };
}

export async function createCard(
  funnelId: string,
  stageId: string,
  _state: FunilActionState,
  formData: FormData,
): Promise<FunilActionState> {
  const context = await requireFunilPermission("funil.gerenciar");
  if (!context) return { error: "Acesso negado." };
  const organizationId = context.organization.id;

  const parsed = z
    .object({
      patient_id: z.string().uuid("Selecione um paciente."),
      assigned_professional_id: z.union([z.string().uuid(), z.literal("")]),
      next_action: z.string().trim().max(140).optional(),
      next_action_date: z.union([z.string().date(), z.literal("")]).optional(),
      value: z.union([z.coerce.number().min(0), z.literal("")]).optional(),
    })
    .safeParse({
      patient_id: formData.get("patient_id"),
      assigned_professional_id: formData.get("assigned_professional_id") ?? "",
      next_action: formData.get("next_action") || undefined,
      next_action_date: formData.get("next_action_date") ?? "",
      value: formData.get("value") ?? "",
    });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("funnel_cards").insert({
    organization_id: organizationId,
    funnel_id: funnelId,
    stage_id: stageId,
    patient_id: parsed.data.patient_id,
    assigned_professional_id: parsed.data.assigned_professional_id || null,
    next_action: parsed.data.next_action || null,
    next_action_date: parsed.data.next_action_date || null,
    value: parsed.data.value === "" ? null : parsed.data.value,
    created_by_user_id: context.effectiveUser?.id ?? null,
  });

  if (error) return { error: friendlyError(error.message) };

  revalidatePath(`/funis/${funnelId}`);
  return { success: "Card criado." };
}

export async function moveCard(
  cardId: string,
  toStageId: string,
  note?: string,
): Promise<FunilActionState> {
  const context = await requireFunilPermission("funil.gerenciar");
  if (!context) return { error: "Acesso negado." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("move_funnel_card", {
    p_card_id: cardId,
    p_to_stage_id: toStageId,
    p_note: note || null,
  });

  if (error) return { error: friendlyError(error.message) };

  revalidatePath("/funis", "layout");
  return { success: "Card movido." };
}

export async function archiveCard(
  funnelId: string,
  cardId: string,
): Promise<FunilActionState> {
  const context = await requireFunilPermission("funil.gerenciar");
  if (!context) return { error: "Acesso negado." };
  const organizationId = context.organization.id;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("funnel_cards")
    .update({ archived_at: new Date().toISOString() })
    .eq("organization_id", organizationId)
    .eq("id", cardId);

  if (error) return { error: friendlyError(error.message) };

  revalidatePath(`/funis/${funnelId}`);
  return { success: "Card arquivado." };
}

export async function addCardNote(
  cardId: string,
  _state: FunilActionState,
  formData: FormData,
): Promise<FunilActionState> {
  const context = await requireFunilPermission("funil.gerenciar");
  if (!context) return { error: "Acesso negado." };
  const organizationId = context.organization.id;

  const parsed = z
    .object({ note: z.string().trim().min(1, "Escreva uma nota.").max(1000) })
    .safeParse({ note: formData.get("note") });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("funnel_card_notes").insert({
    organization_id: organizationId,
    card_id: cardId,
    author_user_id: context.effectiveUser?.id ?? null,
    note: parsed.data.note,
  });

  if (error) return { error: friendlyError(error.message) };

  revalidatePath("/funis", "layout");
  return { success: "Nota adicionada." };
}

export async function createQuickPatientFromFunil(
  state: QuickPatientActionState,
  formData: FormData,
): Promise<QuickPatientActionState> {
  return createQuickPatient("funil", state, formData);
}

export type CardTimelineEntry = {
  id: string;
  from_stage_name: string | null;
  to_stage_name: string;
  moved_by_name: string | null;
  moved_at: string;
  note: string | null;
};

export type CardNoteEntry = {
  id: string;
  author_name: string | null;
  note: string;
  created_at: string;
};

export async function getCardTimeline(cardId: string): Promise<{
  movements: CardTimelineEntry[];
  notes: CardNoteEntry[];
}> {
  const context = await requireFunilPermission("funil.ver");
  if (!context) return { movements: [], notes: [] };
  const organizationId = context.organization.id;

  const supabase = await createSupabaseServerClient();
  const [movementsResult, notesResult] = await Promise.all([
    supabase
      .from("funnel_card_movements")
      .select(
        "id, moved_at, note, from_stage:from_stage_id(name), to_stage:to_stage_id(name), moved_by:moved_by_user_id(name)",
      )
      .eq("organization_id", organizationId)
      .eq("card_id", cardId)
      .order("moved_at", { ascending: false })
      .returns<
        Array<{
          id: string;
          moved_at: string;
          note: string | null;
          from_stage: { name: string } | null;
          to_stage: { name: string } | null;
          moved_by: { name: string } | null;
        }>
      >(),
    supabase
      .from("funnel_card_notes")
      .select("id, note, created_at, author:author_user_id(name)")
      .eq("organization_id", organizationId)
      .eq("card_id", cardId)
      .order("created_at", { ascending: false })
      .returns<
        Array<{
          id: string;
          note: string;
          created_at: string;
          author: { name: string } | null;
        }>
      >(),
  ]);

  return {
    movements: (movementsResult.data ?? []).map((row) => ({
      id: row.id,
      from_stage_name: row.from_stage?.name ?? null,
      to_stage_name: row.to_stage?.name ?? "—",
      moved_by_name: row.moved_by?.name ?? null,
      moved_at: row.moved_at,
      note: row.note,
    })),
    notes: (notesResult.data ?? []).map((row) => ({
      id: row.id,
      author_name: row.author?.name ?? null,
      note: row.note,
      created_at: row.created_at,
    })),
  };
}
