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
    "Usage: npm run seed:demo-finance -- --organization-id UUID_DA_EMPRESA",
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

const pix = await must(
  "Pix",
  supabase
    .from("payment_methods")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("name", "Pix")
    .single(),
);

const receivable = await must(
  "Conta a receber",
  supabase
    .from("accounts_receivable")
    .select("id, amount, paid_amount, status")
    .eq("organization_id", organizationId)
    .in("status", ["open", "partial"])
    .order("due_date", { ascending: true })
    .limit(1)
    .maybeSingle(),
);

const remaining =
  Number(receivable.amount ?? 0) - Number(receivable.paid_amount ?? 0);
if (remaining > 0) {
  const { data: existingPayment } = await supabase
    .from("payments")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("account_receivable_id", receivable.id)
    .eq("notes", "Recebimento demonstrativo da Fase 9")
    .maybeSingle();

  if (!existingPayment) {
    const { error } = await supabase.from("payments").insert({
      organization_id: organizationId,
      account_receivable_id: receivable.id,
      payment_method_id: pix.id,
      amount: remaining,
      paid_at: new Date().toISOString(),
      received_by_user_id: actor.id,
      notes: "Recebimento demonstrativo da Fase 9",
    });
    if (error) {
      console.error(error.message);
      process.exit(1);
    }
  }
}

const category = await must(
  "Categoria",
  supabase
    .from("financial_categories")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("name", "Despesas operacionais")
    .single(),
);

const dueDate = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Fortaleza",
}).format(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));

const { data: existingPayable } = await supabase
  .from("accounts_payable")
  .select("id")
  .eq("organization_id", organizationId)
  .eq("vendor_name", "Fornecedor Demo")
  .eq("description", "Despesa operacional demonstrativa")
  .maybeSingle();

if (!existingPayable) {
  const { error } = await supabase.from("accounts_payable").insert({
    organization_id: organizationId,
    category_id: category.id,
    vendor_name: "Fornecedor Demo",
    description: "Despesa operacional demonstrativa",
    amount: 320,
    due_date: dueDate,
    created_by_user_id: actor.id,
  });
  if (error) {
    console.error(error.message);
    process.exit(1);
  }
}

console.log(`Demo ready: finance data in ${organization.name}.`);
