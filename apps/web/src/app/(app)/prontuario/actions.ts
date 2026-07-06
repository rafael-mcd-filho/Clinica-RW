"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getRequestContext } from "@/lib/auth/context";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type ClinicalActionState = {
  error?: string;
  success?: string;
};

async function requireClinicalPermission(code: string) {
  const context = await getRequestContext();
  if (!context.organization || !context.permissionCodes.has(code)) return null;
  return context;
}

function friendlyError(message: string) {
  if (message.includes("duplicate key")) {
    return "Já existe um atendimento para este agendamento.";
  }
  if (message.includes("Clinical encounter is empty")) {
    return "Preencha ao menos um campo ou uma anotação antes de finalizar.";
  }
  if (message.includes("Not allowed to issue clinical document")) {
    return "Seu perfil não possui permissão para emitir este documento.";
  }
  if (message.includes("Clinical document title and body are required")) {
    return "Informe título e conteúdo do documento.";
  }
  return message;
}

function documentPermission(documentType: string) {
  switch (documentType) {
    case "prescription":
      return "clinico.prescrever";
    case "exam_request":
      return "clinico.solicitar_exame";
    case "medical_certificate":
    case "attendance_declaration":
      return "clinico.emitir_atestado";
    default:
      return null;
  }
}

export async function createEncounter(formData: FormData) {
  const context = await requireClinicalPermission(
    "clinico.preencher_prontuario",
  );
  if (!context?.organization) redirect("/dashboard");
  const parsed = z
    .object({
      patient_id: z.string().uuid(),
      professional_id: z.string().uuid(),
      template_version_id: z.string().uuid(),
      appointment_id: z.union([z.string().uuid(), z.literal("")]),
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/prontuario?erro=dados-invalidos");

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("create_clinical_encounter", {
    p_patient_id: parsed.data.patient_id,
    p_professional_id: parsed.data.professional_id,
    p_template_version_id: parsed.data.template_version_id,
    p_appointment_id: parsed.data.appointment_id || null,
  });

  if (error || !data) {
    redirect(
      `/prontuario?erro=${encodeURIComponent(error?.message ?? "erro")}`,
    );
  }

  revalidatePath("/prontuario");
  redirect(`/prontuario/${data}`);
}

export async function createClinicalTemplate(
  _state: ClinicalActionState,
  formData: FormData,
): Promise<ClinicalActionState> {
  const context = await requireClinicalPermission("clinico.criar_template");
  if (!context?.organization) return { error: "Acesso negado." };
  const parsed = z
    .object({
      name: z.string().trim().min(3),
      section_title: z.string().trim().min(3),
      fields: z.string().trim().min(3),
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: "Informe nome, seção e campos do template." };
  }

  const fields = parsed.data.fields
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((label, index) => ({
      id:
        label
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "_")
          .replace(/^_|_$/g, "") || `campo_${index + 1}`,
      label,
      type: "textarea",
      required: index === 0,
    }));

  const supabase = await createSupabaseServerClient();
  const { data: template, error: templateError } = await supabase
    .from("clinical_templates")
    .insert({
      organization_id: context.organization.id,
      name: parsed.data.name,
      description: "Criado pelo builder simples.",
      created_by_user_id: context.effectiveUser?.id ?? null,
    })
    .select("id")
    .single<{ id: string }>();
  if (templateError || !template) {
    return { error: templateError?.message ?? "Não foi possível criar." };
  }

  const { error: versionError } = await supabase
    .from("clinical_template_versions")
    .insert({
      organization_id: context.organization.id,
      template_id: template.id,
      version_number: 1,
      schema: {
        sections: [
          {
            id: "secao_1",
            title: parsed.data.section_title,
            fields,
          },
        ],
      },
      created_by_user_id: context.effectiveUser?.id ?? null,
    });
  if (versionError) return { error: versionError.message };

  revalidatePath("/prontuario");
  revalidatePath("/configuracoes");
  return { success: "Template criado." };
}

export async function saveEncounterDraft(
  encounterId: string,
  _state: ClinicalActionState,
  formData: FormData,
): Promise<ClinicalActionState> {
  const context = await requireClinicalPermission(
    "clinico.preencher_prontuario",
  );
  if (!context?.organization) return { error: "Acesso negado." };

  const structuredData = Object.fromEntries(
    Array.from(formData.entries())
      .filter(([key]) => key.startsWith("field:"))
      .map(([key, value]) => [key.slice(6), String(value).trim()]),
  );
  const cidCode = String(formData.get("cid_code") ?? "")
    .trim()
    .toUpperCase();
  const cidDescription = String(formData.get("cid_description") ?? "").trim();
  const diagnoses = cidCode
    ? [{ cid_code: cidCode, description: cidDescription, is_primary: true }]
    : [];

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("save_clinical_encounter_draft", {
    p_encounter_id: encounterId,
    p_structured_data: structuredData,
    p_free_notes: String(formData.get("free_notes") ?? ""),
    p_diagnoses: diagnoses,
  });
  if (error) return { error: friendlyError(error.message) };

  revalidatePath(`/prontuario/${encounterId}`);
  return { success: "Rascunho salvo." };
}

export async function finalizeEncounter(
  encounterId: string,
  _state: ClinicalActionState,
): Promise<ClinicalActionState> {
  void _state;
  const context = await requireClinicalPermission(
    "clinico.finalizar_prontuario",
  );
  if (!context?.organization) return { error: "Acesso negado." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("finalize_clinical_encounter", {
    p_encounter_id: encounterId,
  });
  if (error) return { error: friendlyError(error.message) };
  revalidatePath(`/prontuario/${encounterId}`);
  revalidatePath("/prontuario");
  return { success: "Atendimento finalizado." };
}

export async function addEncounterAddendum(
  encounterId: string,
  _state: ClinicalActionState,
  formData: FormData,
): Promise<ClinicalActionState> {
  const context = await requireClinicalPermission("clinico.adicionar_adendo");
  if (!context?.organization) return { error: "Acesso negado." };
  const content = String(formData.get("content") ?? "").trim();
  if (!content) return { error: "Informe o conteúdo do adendo." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("add_clinical_encounter_addendum", {
    p_encounter_id: encounterId,
    p_content: content,
  });
  if (error) return { error: friendlyError(error.message) };

  revalidatePath(`/prontuario/${encounterId}`);
  return { success: "Adendo registrado." };
}

export async function issueClinicalDocument(
  encounterId: string,
  _state: ClinicalActionState,
  formData: FormData,
): Promise<ClinicalActionState> {
  const documentType = String(formData.get("document_type") ?? "").trim();
  const permission = documentPermission(documentType);
  if (!permission) return { error: "Tipo de documento inválido." };

  const context = await requireClinicalPermission(permission);
  if (!context?.organization) return { error: "Acesso negado." };

  const parsed = z
    .object({
      document_type: z.enum([
        "prescription",
        "exam_request",
        "medical_certificate",
        "attendance_declaration",
      ]),
      template_id: z.union([z.string().uuid(), z.literal("")]),
      title: z.string().trim().min(3),
      body: z.string().trim().min(3),
    })
    .safeParse(Object.fromEntries(formData));

  if (!parsed.success) {
    return { error: "Informe tipo, título e conteúdo do documento." };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("issue_clinical_document", {
    p_encounter_id: encounterId,
    p_document_type: parsed.data.document_type,
    p_title: parsed.data.title,
    p_body: parsed.data.body,
    p_template_id: parsed.data.template_id || null,
    p_metadata: {
      issued_from: "encounter_page",
    },
  });
  if (error) return { error: friendlyError(error.message) };

  revalidatePath(`/prontuario/${encounterId}`);
  return { success: "Documento emitido." };
}
