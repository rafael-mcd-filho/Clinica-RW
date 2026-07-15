"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getRequestContext } from "@/lib/auth/context";
import {
  documentTemplateLayoutSchema,
  inspectDocumentTemplateVariables,
  sanitizeDocumentTemplateText,
} from "@/lib/clinical/document-templates";
import { clinicalTemplateSchema } from "@/lib/clinical/template-schema";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type ModelActionState = {
  error?: string;
  success?: string;
};

const templateIdSchema = z.union([z.string().uuid(), z.literal("")]);
const expectedVersionSchema = z.coerce.number().int().nonnegative();

async function requireTemplateManager() {
  const context = await getRequestContext();
  if (
    !context.organization ||
    !context.effectiveUser ||
    !context.permissionCodes.has("clinico.criar_template")
  ) {
    return null;
  }
  return context;
}

function parseJson(value: string) {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function friendlyModelError(error: { code?: string; message: string }) {
  const normalizedMessage = error.message.toLowerCase();
  if (error.code === "40001" || error.message.includes("version conflict")) {
    return "Este modelo foi alterado por outra pessoa. Atualize a página e tente novamente.";
  }
  if (error.code === "23505" || error.message.includes("duplicate key")) {
    return "Já existe um modelo com esse nome nesta empresa.";
  }
  if (normalizedMessage.includes("support session")) {
    return "A sessão de suporte expirou. Encerre o suporte e inicie uma nova sessão.";
  }
  if (error.code === "42501") {
    return "Seu perfil não possui permissão para alterar modelos.";
  }
  return error.message;
}

function revalidateModels() {
  revalidatePath("/configuracoes/modelos-clinicos");
  revalidatePath("/configuracoes", "layout");
  revalidatePath("/prontuario");
  revalidatePath("/agenda");
}

export async function saveClinicalTemplate(
  _state: ModelActionState,
  formData: FormData,
): Promise<ModelActionState> {
  const context = await requireTemplateManager();
  if (!context) return { error: "Acesso negado." };

  const parsed = z
    .object({
      template_id: templateIdSchema,
      expected_version_number: expectedVersionSchema,
      name: z.string().trim().min(3).max(160),
      description: z.string().trim().max(500),
      schema_json: z.string().min(2),
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: "Revise o nome e a estrutura da ficha clínica." };
  }

  const schemaResult = clinicalTemplateSchema.safeParse(
    parseJson(parsed.data.schema_json),
  );
  if (!schemaResult.success) {
    return {
      error:
        schemaResult.error.issues[0]?.message ??
        "A estrutura da ficha clínica é inválida.",
    };
  }

  const supabase = await createSupabaseServerClient();
  const impersonationSessionId = context.impersonation?.id ?? null;
  const { error } = parsed.data.template_id
    ? await supabase.rpc("update_clinical_template", {
        p_template_id: parsed.data.template_id,
        p_expected_version_number: parsed.data.expected_version_number,
        p_name: parsed.data.name,
        p_schema: schemaResult.data,
        p_description: parsed.data.description || null,
        p_specialty_id: null,
        p_change_summary: "Nova versão publicada pelo construtor clínico.",
        p_impersonation_session_id: impersonationSessionId,
      })
    : await supabase.rpc("create_clinical_template", {
        p_name: parsed.data.name,
        p_schema: schemaResult.data,
        p_description: parsed.data.description || null,
        p_specialty_id: null,
        p_impersonation_session_id: impersonationSessionId,
      });

  if (error) return { error: friendlyModelError(error) };
  revalidateModels();
  return {
    success: parsed.data.template_id
      ? "Nova versão da ficha publicada."
      : "Ficha clínica criada.",
  };
}

export async function setClinicalTemplateStatus(
  _state: ModelActionState,
  formData: FormData,
): Promise<ModelActionState> {
  const context = await requireTemplateManager();
  if (!context) return { error: "Acesso negado." };
  const parsed = z
    .object({
      template_id: z.string().uuid(),
      status: z.enum(["active", "archived"]),
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Modelo inválido." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("set_clinical_template_status", {
    p_template_id: parsed.data.template_id,
    p_status: parsed.data.status,
    p_impersonation_session_id: context.impersonation?.id ?? null,
  });
  if (error) return { error: friendlyModelError(error) };
  revalidateModels();
  return {
    success:
      parsed.data.status === "active"
        ? "Ficha clínica reativada."
        : "Ficha clínica arquivada.",
  };
}

export async function setDefaultClinicalTemplate(
  _state: ModelActionState,
  formData: FormData,
): Promise<ModelActionState> {
  const context = await requireTemplateManager();
  if (!context) return { error: "Acesso negado." };
  const parsed = z
    .object({ template_id: z.string().uuid() })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Modelo inválido." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("set_default_clinical_template", {
    p_template_id: parsed.data.template_id,
    p_impersonation_session_id: context.impersonation?.id ?? null,
  });
  if (error) return { error: friendlyModelError(error) };
  revalidateModels();
  return { success: "Ficha padrão atualizada." };
}

export async function saveDocumentTemplate(
  _state: ModelActionState,
  formData: FormData,
): Promise<ModelActionState> {
  const context = await requireTemplateManager();
  if (!context) return { error: "Acesso negado." };
  const parsed = z
    .object({
      template_id: templateIdSchema,
      expected_version_number: expectedVersionSchema,
      document_type: z.enum([
        "prescription",
        "exam_request",
        "medical_certificate",
        "attendance_declaration",
      ]),
      name: z.string().trim().min(3).max(160),
      description: z.string().trim().max(500),
      title_template: z.string().trim().min(3).max(300),
      body_template: z.string().trim().min(3).max(30_000),
      layout_json: z.string().min(2),
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: "Revise os dados e o texto do modelo de documento." };
  }

  const layoutResult = documentTemplateLayoutSchema.safeParse(
    parseJson(parsed.data.layout_json),
  );
  if (!layoutResult.success) {
    return { error: "A configuração de impressão é inválida." };
  }
  const titleTemplate = sanitizeDocumentTemplateText(
    parsed.data.title_template,
  );
  const bodyTemplate = sanitizeDocumentTemplateText(parsed.data.body_template);
  const variableInspection = inspectDocumentTemplateVariables(
    titleTemplate,
    bodyTemplate,
  );
  if (variableInspection.unknownVariables.length) {
    return {
      error: `Variáveis desconhecidas: ${variableInspection.unknownVariables.join(", ")}.`,
    };
  }

  const supabase = await createSupabaseServerClient();
  const impersonationSessionId = context.impersonation?.id ?? null;
  const { error } = parsed.data.template_id
    ? await supabase.rpc("update_clinical_document_template", {
        p_template_id: parsed.data.template_id,
        p_expected_version_number: parsed.data.expected_version_number,
        p_name: parsed.data.name,
        p_description: parsed.data.description || null,
        p_title_template: titleTemplate,
        p_body_template: bodyTemplate,
        p_layout_schema: layoutResult.data,
        p_custom_variables_schema: [],
        p_change_summary: "Nova versão publicada pelo editor de documentos.",
        p_impersonation_session_id: impersonationSessionId,
      })
    : await supabase.rpc("create_clinical_document_template", {
        p_document_type: parsed.data.document_type,
        p_name: parsed.data.name,
        p_description: parsed.data.description || null,
        p_title_template: titleTemplate,
        p_body_template: bodyTemplate,
        p_layout_schema: layoutResult.data,
        p_custom_variables_schema: [],
        p_impersonation_session_id: impersonationSessionId,
      });

  if (error) return { error: friendlyModelError(error) };
  revalidateModels();
  return {
    success: parsed.data.template_id
      ? "Nova versão do documento publicada."
      : "Modelo de documento criado.",
  };
}

export async function setDocumentTemplateActive(
  _state: ModelActionState,
  formData: FormData,
): Promise<ModelActionState> {
  const context = await requireTemplateManager();
  if (!context) return { error: "Acesso negado." };
  const parsed = z
    .object({
      template_id: z.string().uuid(),
      active: z.enum(["true", "false"]).transform((value) => value === "true"),
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Modelo inválido." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc(
    "set_clinical_document_template_active",
    {
      p_template_id: parsed.data.template_id,
      p_active: parsed.data.active,
      p_impersonation_session_id: context.impersonation?.id ?? null,
    },
  );
  if (error) return { error: friendlyModelError(error) };
  revalidateModels();
  return {
    success: parsed.data.active
      ? "Modelo de documento reativado."
      : "Modelo de documento desativado.",
  };
}
