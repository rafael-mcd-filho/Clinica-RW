"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getRequestContext } from "@/lib/auth/context";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type MessageAutomationState = { error?: string; success?: string };

const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;

const schema = z.object({
  rule_id: z.string().uuid(),
  template_id: z.union([z.string().uuid(), z.literal("")]),
  active: z.enum(["on", "off"]),
  hours_before: z.union([z.coerce.number().int().min(1).max(168), z.nan()]),
  window_start: z.union([z.string().regex(timePattern), z.literal("")]),
  window_end: z.union([z.string().regex(timePattern), z.literal("")]),
  body: z.string().trim().max(1000),
});

export async function updateMessageAutomation(
  _state: MessageAutomationState,
  formData: FormData,
): Promise<MessageAutomationState> {
  const context = await getRequestContext();
  if (!context.organization || !context.permissionCodes.has("config.geral")) {
    return { error: "Seu perfil não pode alterar as mensagens automáticas." };
  }
  const parsed = schema.safeParse({
    rule_id: formData.get("rule_id"),
    template_id: formData.get("template_id") ?? "",
    active: formData.get("active") === "on" ? "on" : "off",
    hours_before: Number(formData.get("hours_before") ?? Number.NaN),
    window_start: formData.get("window_start") ?? "",
    window_end: formData.get("window_end") ?? "",
    body: formData.get("body") ?? "",
  });
  if (!parsed.success) {
    return { error: "Revise a antecedência, a janela de envio e o texto." };
  }
  const data = parsed.data;
  if (data.template_id && data.body.length < 10) {
    return { error: "Escreva a mensagem (pelo menos 10 caracteres)." };
  }
  if (
    data.window_start &&
    data.window_end &&
    data.window_start >= data.window_end
  ) {
    return { error: "O fim da janela de envio precisa ser depois do início." };
  }

  const supabase = await createSupabaseServerClient();
  const { data: rule, error: ruleError } = await supabase
    .from("automation_rules")
    .select("id, action_config")
    .eq("organization_id", context.organization.id)
    .eq("id", data.rule_id)
    .maybeSingle<{ id: string; action_config: Record<string, unknown> }>();
  if (ruleError || !rule) return { error: "Regra não encontrada." };

  const actionConfig = { ...(rule.action_config ?? {}) };
  if (!Number.isNaN(data.hours_before)) {
    actionConfig.hours_before = data.hours_before;
  }

  const { error: updateError } = await supabase
    .from("automation_rules")
    .update({
      active: data.active === "on",
      action_config: actionConfig,
      send_window_start: data.window_start || null,
      send_window_end: data.window_end || null,
    })
    .eq("organization_id", context.organization.id)
    .eq("id", data.rule_id);
  if (updateError) return { error: "Não foi possível salvar a regra." };

  if (data.template_id) {
    const { error: templateError } = await supabase
      .from("message_templates")
      .update({ body_template: data.body, is_system_default: false })
      .eq("organization_id", context.organization.id)
      .eq("id", data.template_id);
    if (templateError) return { error: "Não foi possível salvar o texto." };
  }

  revalidatePath("/configuracoes/mensagens");
  return { success: "Mensagem salva." };
}
