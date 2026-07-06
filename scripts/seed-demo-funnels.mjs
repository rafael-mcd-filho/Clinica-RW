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
    "Usage: npm run seed:demo-funnels -- --organization-id UUID_DA_EMPRESA",
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

const actor = await must(
  "Usuario",
  supabase
    .from("app_users")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("status", "active")
    .limit(1)
    .single(),
);

const patients = await must(
  "Pacientes",
  supabase
    .from("patients")
    .select("id, full_name")
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .order("created_at")
    .limit(4),
);

const { data: existingFunnel } = await supabase
  .from("funnels")
  .select("id")
  .eq("organization_id", organizationId)
  .eq("name", "Funil Comercial")
  .maybeSingle();

let funnelId = existingFunnel?.id;

if (!funnelId) {
  const { data: funnel, error: funnelError } = await supabase
    .from("funnels")
    .insert({
      organization_id: organizationId,
      name: "Funil Comercial",
      description: "Acompanhamento de leads até virarem pacientes ativos.",
      created_by_user_id: actor.id,
    })
    .select("id")
    .single();

  if (funnelError) {
    console.error(funnelError.message);
    process.exit(1);
  }
  funnelId = funnel.id;

  const stageDefinitions = [
    { name: "Lead", color: "#64748b", stage_type: "initial" },
    { name: "Contato realizado", color: "#3b82f6", stage_type: "intermediate" },
    { name: "Agendamento marcado", color: "#6366f1", stage_type: "intermediate" },
    { name: "Cliente ativo", color: "#22c55e", stage_type: "success" },
    { name: "Perdido", color: "#ef4444", stage_type: "failure" },
  ];

  const { data: stages, error: stagesError } = await supabase
    .from("funnel_stages")
    .insert(
      stageDefinitions.map((stage, index) => ({
        organization_id: organizationId,
        funnel_id: funnelId,
        name: stage.name,
        color: stage.color,
        stage_type: stage.stage_type,
        position: index,
      })),
    )
    .select("id, name");

  if (stagesError) {
    console.error(stagesError.message);
    process.exit(1);
  }

  const stageByName = new Map(stages.map((stage) => [stage.name, stage.id]));
  const placements = [
    "Lead",
    "Contato realizado",
    "Agendamento marcado",
    "Cliente ativo",
  ];

  for (const [index, patient] of patients.entries()) {
    const stageName = placements[index % placements.length];
    const { error: cardError } = await supabase.from("funnel_cards").insert({
      organization_id: organizationId,
      funnel_id: funnelId,
      stage_id: stageByName.get(stageName),
      patient_id: patient.id,
      next_action: "Ligar para confirmar interesse",
      created_by_user_id: actor.id,
    });
    if (cardError && !cardError.message.includes("funnel_cards_active_patient_key")) {
      console.error(cardError.message);
      process.exit(1);
    }
  }
}

console.log(`Demo ready: funnel data in ${organization.name}.`);
