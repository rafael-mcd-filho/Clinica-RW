import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

function readEnv() {
  const content = readFileSync(resolve(process.cwd(), ".env"), "utf8");
  return Object.fromEntries(
    content
      .split(/\r?\n/)
      .filter((line) => line && !line.trim().startsWith("#") && line.includes("="))
      .map((line) => {
        const separator = line.indexOf("=");
        return [line.slice(0, separator).trim(), line.slice(separator + 1).trim()];
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
    "Usage: npm run seed:demo-patients -- --organization-id UUID_DA_EMPRESA",
  );
  process.exit(1);
}

const env = readEnv();
const supabase = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const { data: organization, error: organizationError } = await supabase
  .from("organizations")
  .select("id, name")
  .eq("id", organizationId)
  .maybeSingle();

if (organizationError || !organization) {
  console.error(organizationError?.message ?? "Empresa não encontrada.");
  process.exit(1);
}

const tags = [
  { name: "Acompanhamento", color: "#2563eb" },
  { name: "Primeira consulta", color: "#7c3aed" },
  { name: "Retorno", color: "#16a34a" },
  { name: "Atenção", color: "#dc2626" },
];

for (const tag of tags) {
  await supabase.from("tags").upsert(
    { organization_id: organizationId, ...tag },
    { onConflict: "organization_id,name" },
  );
}

const { data: savedTags } = await supabase
  .from("tags")
  .select("id, name")
  .eq("organization_id", organizationId);
const tagId = new Map((savedTags ?? []).map((tag) => [tag.name, tag.id]));

const patients = [
  {
    full_name: "Mariana Alves de Souza",
    birth_date: "1988-04-12",
    cpf: "52998224725",
    email: "mariana.demo@example.com",
    phone: "85999910001",
    whatsapp: "85999910001",
    source: "Indicação",
    city: "Fortaleza",
    state: "CE",
    allergies: "Dipirona",
    comorbidities: "Hipertensão controlada",
    tags: ["Acompanhamento", "Atenção"],
  },
  {
    full_name: "Carlos Eduardo Lima",
    birth_date: "1976-09-03",
    cpf: "11144477735",
    email: "carlos.demo@example.com",
    phone: "85999910002",
    whatsapp: "85999910002",
    source: "Google",
    city: "Fortaleza",
    state: "CE",
    allergies: null,
    comorbidities: "Diabetes tipo 2",
    tags: ["Retorno"],
  },
  {
    full_name: "Ana Beatriz Martins",
    social_name: "Bia Martins",
    birth_date: "1995-01-27",
    cpf: "12345678909",
    email: "bia.demo@example.com",
    phone: "85999910003",
    whatsapp: "85999910003",
    source: "Instagram",
    city: "Caucaia",
    state: "CE",
    allergies: "Nenhuma conhecida",
    comorbidities: null,
    tags: ["Primeira consulta"],
  },
  {
    full_name: "João Pedro Ferreira",
    birth_date: "2001-11-18",
    cpf: "98765432100",
    email: "joao.demo@example.com",
    phone: "85999910004",
    whatsapp: "85999910004",
    source: "Site",
    city: "Maracanaú",
    state: "CE",
    allergies: null,
    comorbidities: null,
    tags: ["Primeira consulta"],
  },
];

for (const demo of patients) {
  const { data: existing } = await supabase
    .from("patients")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("cpf", demo.cpf)
    .maybeSingle();

  const payload = {
    organization_id: organizationId,
    full_name: demo.full_name,
    social_name: demo.social_name ?? null,
    birth_date: demo.birth_date,
    cpf: demo.cpf,
    email: demo.email,
    phone: demo.phone,
    whatsapp: demo.whatsapp,
    preferred_contact: "whatsapp",
    allow_whatsapp: true,
    allow_email: true,
    source: demo.source,
    status: "active",
    deleted_at: null,
  };

  const patientResult = existing
    ? await supabase
        .from("patients")
        .update(payload)
        .eq("id", existing.id)
        .select("id")
        .single()
    : await supabase.from("patients").insert(payload).select("id").single();

  if (patientResult.error || !patientResult.data) {
    console.error(patientResult.error?.message ?? `Falha ao salvar ${demo.full_name}.`);
    process.exit(1);
  }

  const patientId = patientResult.data.id;
  await supabase.from("patient_addresses").upsert(
    {
      organization_id: organizationId,
      patient_id: patientId,
      city: demo.city,
      state: demo.state,
    },
    { onConflict: "organization_id,patient_id" },
  );
  await supabase.from("patient_clinical_summaries").upsert(
    {
      organization_id: organizationId,
      patient_id: patientId,
      allergies: demo.allergies,
      comorbidities: demo.comorbidities,
    },
    { onConflict: "organization_id,patient_id" },
  );
  const { data: existingConsent } = await supabase
    .from("patient_consents")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("patient_id", patientId)
    .eq("consent_type", "privacy_notice")
    .eq("version", "1.0")
    .is("revoked_at", null)
    .maybeSingle();
  if (!existingConsent) {
    await supabase.from("patient_consents").insert({
      organization_id: organizationId,
      patient_id: patientId,
      consent_type: "privacy_notice",
      version: "1.0",
      accepted_at: new Date().toISOString(),
    });
  }

  await supabase.from("patient_tags").delete().eq("patient_id", patientId);
  const patientTagRows = demo.tags
    .map((name) => tagId.get(name))
    .filter(Boolean)
    .map((id) => ({ organization_id: organizationId, patient_id: patientId, tag_id: id }));
  if (patientTagRows.length) await supabase.from("patient_tags").insert(patientTagRows);
}

console.log(`Demo ready: ${patients.length} patients in ${organization.name}.`);
