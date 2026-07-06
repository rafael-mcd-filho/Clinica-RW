import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

function readEnv() {
  const content = readFileSync(resolve(process.cwd(), ".env"), "utf8");
  return Object.fromEntries(
    content
      .split(/\r?\n/)
      .filter(
        (line) => line && !line.trim().startsWith("#") && line.includes("="),
      )
      .map((line) => {
        const separator = line.indexOf("=");
        return [
          line.slice(0, separator).trim(),
          line.slice(separator + 1).trim(),
        ];
      }),
  );
}

function readArg(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const organizationId = readArg("organization-id");
if (!organizationId) {
  console.error(
    "Usage: npm run seed:demo-clinical -- --organization-id UUID_DA_EMPRESA",
  );
  process.exit(1);
}

const env = readEnv();
const supabase = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

async function must(label, promise) {
  const result = await promise;
  if (result.error || !result.data) {
    console.error(result.error?.message ?? `${label} não encontrado.`);
    process.exit(1);
  }
  return result.data;
}

const organization = await must(
  "Empresa",
  supabase
    .from("organizations")
    .select("id, name")
    .eq("id", organizationId)
    .maybeSingle(),
);
const patients = await must(
  "Pacientes",
  supabase
    .from("patients")
    .select("id, full_name")
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .order("full_name")
    .limit(3),
);
const professional = await must(
  "Profissional",
  supabase
    .from("professionals")
    .select("id, name")
    .eq("organization_id", organizationId)
    .eq("active", true)
    .order("created_at")
    .limit(1)
    .single(),
);
const templateVersion = await must(
  "Template clínico",
  supabase
    .from("clinical_template_versions")
    .select("id, template_id, version_number, schema, clinical_templates(name)")
    .eq("organization_id", organizationId)
    .order("version_number", { ascending: false })
    .limit(1)
    .single(),
);

if (patients.length < 2) {
  console.error("Crie ao menos 2 pacientes antes do seed clínico.");
  process.exit(1);
}

async function createEncounter({ patient, status, data, notes, cid }) {
  const { data: existing } = await supabase
    .from("encounters")
    .select("id, status")
    .eq("organization_id", organizationId)
    .eq("patient_id", patient.id)
    .eq("professional_id", professional.id)
    .eq("status", status)
    .maybeSingle();

  if (existing) return existing.id;

  const { data: encounter, error } = await supabase
    .from("encounters")
    .insert({
      organization_id: organizationId,
      patient_id: patient.id,
      professional_id: professional.id,
      template_version_id: templateVersion.id,
      status,
      finalized_at: status === "finalized" ? new Date().toISOString() : null,
    })
    .select("id")
    .single();
  if (error || !encounter) {
    console.error(error?.message ?? "Falha ao criar atendimento.");
    process.exit(1);
  }

  await supabase.from("encounter_entries").insert({
    organization_id: organizationId,
    encounter_id: encounter.id,
    template_snapshot: {
      template_id: templateVersion.template_id,
      template_version_id: templateVersion.id,
      name: templateVersion.clinical_templates?.name ?? "Template",
      version_number: templateVersion.version_number,
      schema: templateVersion.schema,
    },
    structured_data: data,
    free_notes: notes,
  });
  if (cid) {
    await supabase.from("encounter_diagnoses").insert({
      organization_id: organizationId,
      encounter_id: encounter.id,
      cid_code: cid.code,
      description: cid.description,
      is_primary: true,
    });
  }
  return encounter.id;
}

const finalizedId = await createEncounter({
  patient: patients[0],
  status: "finalized",
  data: {
    queixa_principal: "Cefaleia recorrente há 3 dias.",
    historia_doenca_atual: "Sem sinais de alarme relatados.",
    exame_fisico: "Paciente em bom estado geral, PA 120x80 mmHg.",
    conduta: "Orientado hidratação, analgesia e retorno se piora.",
  },
  notes: "Atendimento demonstrativo finalizado da Fase 7.",
  cid: { code: "R51", description: "Cefaleia" },
});

const { data: existingAddendum } = await supabase
  .from("encounter_addenda")
  .select("id")
  .eq("organization_id", organizationId)
  .eq("encounter_id", finalizedId)
  .maybeSingle();
if (!existingAddendum) {
  const { data: author } = await supabase
    .from("app_users")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("status", "active")
    .limit(1)
    .single();
  if (author) {
    await supabase.from("encounter_addenda").insert({
      organization_id: organizationId,
      encounter_id: finalizedId,
      author_user_id: author.id,
      content: "Paciente informou melhora após 24h por contato telefônico.",
    });
  }
}

await createEncounter({
  patient: patients[1],
  status: "draft",
  data: {
    queixa_principal: "Retorno para avaliação de exames.",
    conduta: "Rascunho em andamento.",
  },
  notes: "Rascunho demonstrativo para edição.",
  cid: { code: "Z00", description: "Exame geral" },
});

console.log(`Demo ready: clinical records in ${organization.name}.`);
