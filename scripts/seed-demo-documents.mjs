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
    "Usage: npm run seed:demo-documents -- --organization-id UUID_DA_EMPRESA",
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

const encounter = await must(
  "Atendimento",
  supabase
    .from("encounters")
    .select("id, patient_id, professional_id, status")
    .eq("organization_id", organizationId)
    .order("finalized_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle(),
);

const actor = await must(
  "Usuário",
  supabase
    .from("app_users")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("status", "active")
    .limit(1)
    .single(),
);

const templates = await must(
  "Templates de documentos",
  supabase
    .from("clinical_document_templates")
    .select("id, document_type")
    .eq("organization_id", organizationId)
    .eq("active", true),
);
const templateByType = new Map(
  templates.map((template) => [template.document_type, template.id]),
);

const documents = [
  {
    document_type: "prescription",
    title: "Prescrição",
    body: "Dipirona 500mg: tomar 1 comprimido se dor, até 6/6h, por até 3 dias.\nHidratação oral e repouso relativo.",
  },
  {
    document_type: "exam_request",
    title: "Solicitação de exames",
    body: "Solicito hemograma completo, glicemia de jejum e TSH para avaliação clínica.",
  },
  {
    document_type: "medical_certificate",
    title: "Atestado",
    body: "Atesto, para os devidos fins, necessidade de afastamento das atividades por 1 dia a partir da data de emissão.",
  },
  {
    document_type: "attendance_declaration",
    title: "Declaração de comparecimento",
    body: "Declaro que o(a) paciente compareceu a atendimento nesta clínica na data de emissão.",
  },
];

for (const document of documents) {
  const { data: existing } = await supabase
    .from("clinical_documents")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("encounter_id", encounter.id)
    .eq("document_type", document.document_type)
    .eq("title", document.title)
    .maybeSingle();
  if (existing) continue;

  const { error } = await supabase.from("clinical_documents").insert({
    organization_id: organizationId,
    encounter_id: encounter.id,
    patient_id: encounter.patient_id,
    professional_id: encounter.professional_id,
    template_id: templateByType.get(document.document_type) ?? null,
    document_type: document.document_type,
    title: document.title,
    body: document.body,
    metadata: { source: "seed-demo-documents" },
    issued_by_user_id: actor.id,
  });
  if (error) {
    console.error(error.message);
    process.exit(1);
  }
}

console.log(`Demo ready: clinical documents in ${organization.name}.`);
