import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

function readEnv() {
  const envPath = resolve(process.cwd(), ".env");
  const content = readFileSync(envPath, "utf8");
  const env = {};

  for (const line of content.split(/\r?\n/)) {
    if (!line || line.trim().startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();
    env[key] = value;
  }

  return env;
}

function readArg(name) {
  const index = process.argv.indexOf(`--${name}`);

  if (index === -1) {
    return undefined;
  }

  return process.argv[index + 1];
}

const email = readArg("email");
const password = readArg("password");
const name = readArg("name") ?? email;

if (!email || !password) {
  console.error(
    "Usage: npm run bootstrap:super-admin -- --email voce@exemplo.com --password \"senha-forte\" --name \"Seu Nome\"",
  );
  process.exit(1);
}

const env = readEnv();
const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

const { data: existingSuperAdmins, error: existingSuperAdminError } =
  await supabase
    .from("app_users")
    .select("id, email, auth_user_id")
    .eq("is_super_admin", true);

if (existingSuperAdminError) {
  console.error(existingSuperAdminError.message);
  process.exit(1);
}

const existingSuperAdmin = existingSuperAdmins.at(0);

if (
  existingSuperAdmin &&
  existingSuperAdmin.email.toLowerCase() !== email.toLowerCase()
) {
  console.error(
    `Super Admin already exists for ${existingSuperAdmin.email}. Only one Super Admin is allowed.`,
  );
  process.exit(1);
}

const { data: createdUser, error: createError } =
  await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name },
  });

let authUser = createdUser?.user;

if (createError) {
  const alreadyExists = createError.message
    .toLowerCase()
    .includes("already");

  if (!alreadyExists) {
    console.error(createError.message);
    process.exit(1);
  }

  const { data: listedUsers, error: listError } =
    await supabase.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });

  if (listError) {
    console.error(listError.message);
    process.exit(1);
  }

  authUser = listedUsers.users.find(
    (user) => user.email?.toLowerCase() === email.toLowerCase(),
  );
}

if (!authUser) {
  console.error("Auth user was not found or created.");
  process.exit(1);
}

const { data: appUser, error: appUserError } = await supabase
  .from("app_users")
  .upsert(
    {
      auth_user_id: authUser.id,
      organization_id: null,
      name,
      email,
      status: "active",
      is_super_admin: true,
    },
    { onConflict: "auth_user_id" },
  )
  .select("id, email, is_super_admin")
  .single();

if (appUserError) {
  console.error(appUserError.message);
  process.exit(1);
}

await supabase.from("audit_logs").insert({
  organization_id: null,
  actor_user_id: appUser.id,
  action: "super_admin.bootstrapped",
  resource_type: "app_user",
  resource_id: appUser.id,
  metadata: { email: appUser.email },
});

console.log(`Super Admin ready: ${appUser.email}`);
