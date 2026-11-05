"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getRequestContext } from "@/lib/auth/context";
import { isValidCPF, isValidPhoneBR } from "@/lib/validation/br";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type ImportPatientsResult = {
  error?: string;
  created?: number;
  skippedExisting?: number;
  failed?: number;
};

const patientSchema = z.object({
  full_name: z.string().trim().min(3).max(200),
  social_name: z.string().trim().max(200).nullable(),
  birth_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
  sex_at_birth: z.enum(["female", "male"]).nullable(),
  cpf: z
    .string()
    .regex(/^\d{11}$/)
    .refine(isValidCPF)
    .nullable(),
  email: z.string().trim().email().max(200).nullable(),
  phone: z.string().refine(isValidPhoneBR).nullable(),
  whatsapp: z.string().refine(isValidPhoneBR).nullable(),
});

const batchSize = 200;

/**
 * Importa pacientes validados no navegador (Raio-X P1). O servidor valida de
 * novo, pula quem já tem o mesmo CPF na clínica e grava em lotes. Pacientes
 * importados entram sem consentimento de mensagens: ele precisa ser colhido
 * pela clínica (LGPD).
 */
export async function importPatients(
  rows: unknown,
): Promise<ImportPatientsResult> {
  const context = await getRequestContext();
  if (!context.organization || !context.permissionCodes.has("paciente.criar")) {
    return { error: "Seu perfil não pode cadastrar pacientes." };
  }
  const parsed = z.array(patientSchema).min(1).max(5000).safeParse(rows);
  if (!parsed.success) {
    return {
      error: "A planilha tem linhas inválidas. Corrija e tente de novo.",
    };
  }
  const organizationId = context.organization.id;
  const supabase = await createSupabaseServerClient();

  const cpfs = parsed.data
    .map((row) => row.cpf)
    .filter((cpf): cpf is string => Boolean(cpf));
  const existing = new Set<string>();
  for (let index = 0; index < cpfs.length; index += 500) {
    const { data, error } = await supabase
      .from("patients")
      .select("cpf")
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .in("cpf", cpfs.slice(index, index + 500))
      .returns<Array<{ cpf: string | null }>>();
    if (error) {
      return { error: "Não foi possível conferir os CPFs já cadastrados." };
    }
    for (const row of data ?? []) if (row.cpf) existing.add(row.cpf);
  }

  const toInsert = parsed.data.filter(
    (row) => !row.cpf || !existing.has(row.cpf),
  );
  let created = 0;
  let failed = 0;
  for (let index = 0; index < toInsert.length; index += batchSize) {
    const batch = toInsert.slice(index, index + batchSize).map((row) => ({
      organization_id: organizationId,
      full_name: row.full_name,
      social_name: row.social_name,
      birth_date: row.birth_date,
      sex_at_birth: row.sex_at_birth,
      cpf: row.cpf,
      email: row.email,
      phone: row.phone,
      whatsapp: row.whatsapp,
      preferred_contact: row.whatsapp
        ? "whatsapp"
        : row.phone
          ? "phone"
          : row.email
            ? "email"
            : "none",
      allow_whatsapp: false,
      allow_email: false,
      allow_sms: false,
      source: "importacao",
    }));
    const { error } = await supabase.from("patients").insert(batch);
    if (error) failed += batch.length;
    else created += batch.length;
  }

  revalidatePath("/pacientes");
  return {
    created,
    skippedExisting: parsed.data.length - toInsert.length,
    failed,
  };
}
