import "server-only";

import type { PatientInsuranceOption } from "./patient-form";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;

/**
 * Convênios para o cadastro do paciente: os ativos e, se o paciente usa um
 * que foi desativado, esse também (para não sumir ao salvar).
 *
 * Devolve `undefined` quando o banco ainda não tem o campo de convênio do
 * paciente (migração pendente): aí o formulário não mostra o bloco.
 */
export async function loadPatientInsuranceOptions(
  supabase: Supabase,
  organizationId: string,
  patientId?: string,
): Promise<{
  options: PatientInsuranceOption[] | undefined;
  current: { id: string | null; card: string | null };
}> {
  const empty = { id: null, card: null };
  const probe = patientId
    ? await supabase
        .from("patients")
        .select("health_insurance_id, health_insurance_card")
        .eq("id", patientId)
        .eq("organization_id", organizationId)
        .maybeSingle<{
          health_insurance_id: string | null;
          health_insurance_card: string | null;
        }>()
    : await supabase.from("patients").select("health_insurance_id").limit(1);
  if (probe.error) return { options: undefined, current: empty };

  const current =
    patientId && probe.data && !Array.isArray(probe.data)
      ? {
          id: probe.data.health_insurance_id,
          card: probe.data.health_insurance_card,
        }
      : empty;

  let query = supabase
    .from("health_insurances")
    .select("id, name")
    .eq("organization_id", organizationId)
    .order("name");
  query = current.id
    ? query.or(`active.eq.true,id.eq.${current.id}`)
    : query.eq("active", true);
  const { data } = await query.returns<PatientInsuranceOption[]>();
  return { options: data ?? [], current };
}
