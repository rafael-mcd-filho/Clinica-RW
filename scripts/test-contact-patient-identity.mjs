// Isolated PostgreSQL regression checks. No connection to a clinic database.
// Install @electric-sql/pglite in a temporary directory and set PGLITE_MODULE_PATH
// to its dist/index.js, then: node scripts/test-contact-patient-identity.mjs
// Uses the actual migration/trigger/policy SQL with a minimal identity fixture.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const { PGlite } = await import(
  process.env.PGLITE_MODULE_PATH
    ? pathToFileURL(process.env.PGLITE_MODULE_PATH).href
    : "@electric-sql/pglite"
);
const db = new PGlite();
const org = "11111111-1111-4111-8111-111111111111";
const otherOrg = "22222222-2222-4222-8222-222222222222";
const user = "33333333-3333-4333-8333-333333333333";
let checks = 0;
const sqlFile = (name) =>
  readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), "utf8");
async function check(name, callback) {
  await callback();
  checks++;
  console.log(`ok ${checks} - ${name}`);
}
async function scalar(sql, params = []) {
  return Object.values((await db.query(sql, params)).rows[0])[0];
}
async function key(phone) {
  return scalar("select app_private.phone_match_key($1)", [phone]);
}
async function patient(phone, organization = org, whatsapp = null) {
  return scalar(
    "insert into patients(organization_id, full_name, phone, whatsapp) values ($1, 'Paciente teste', $2, $3) returning id",
    [organization, phone, whatsapp],
  );
}
async function contact(phone, disabled = false, organization = org) {
  return scalar(
    "insert into whatsapp_contacts(organization_id,phone,patient_auto_link_disabled) values($1,$2,$3) returning id",
    [organization, phone, disabled],
  );
}
const linked = (id) =>
  scalar("select patient_id from whatsapp_contacts where id=$1", [id]);
const create = (id, organization = org, name = "Novo paciente", email = null) =>
  scalar("select create_patient_from_whatsapp_contact($1,$2,$3,$4)", [
    organization,
    id,
    name,
    email,
  ]);
async function permissions(codes) {
  await db.query("select set_config('test.permissions', $1, false)", [
    codes.join(","),
  ]);
}
async function rejectsCode(fn, code) {
  await assert.rejects(fn, (error) => error.code === code);
}

try {
  await db.exec(`
    create role authenticated; create role anon; create role service_role;
    create schema app_private; create schema auth;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.user',true),'')::uuid $$;
    create function app_private.current_organization_id() returns uuid language sql stable as $$ select current_setting('test.org',true)::uuid $$;
    create function app_private.current_is_super_admin() returns boolean language sql stable as $$ select false $$;
    create function app_private.current_user_has_permission(code text) returns boolean language sql stable as $$ select code = any(string_to_array(current_setting('test.permissions',true),',')) $$;
    create table patients(id uuid primary key default gen_random_uuid(), organization_id uuid not null, full_name text not null,
      phone text, whatsapp text, email text, source text, preferred_contact text default 'whatsapp', allow_whatsapp boolean default false,
      deleted_at timestamptz, unique(organization_id,id));
    create table whatsapp_contacts(id uuid primary key default gen_random_uuid(), organization_id uuid not null, phone text not null,
      patient_id uuid, updated_at timestamptz default now(), unique(organization_id,phone),
      foreign key(organization_id,patient_id) references patients(organization_id,id));
    grant usage on schema app_private, auth to authenticated;
    grant select,insert,update on patients,whatsapp_contacts to authenticated;
    alter table patients enable row level security;
    alter table whatsapp_contacts enable row level security;
  `);
  for (const [migration, tables] of [
    ["20260620230000_phase5_patients_crm.sql", ["patients"]],
    ["20260714000000_phase13_whatsapp_attendance.sql", ["whatsapp_contacts"]],
  ]) {
    const source = await sqlFile(migration);
    for (const statement of source.matchAll(/create policy [\s\S]*?;/g)) {
      if (
        tables.some((table) =>
          new RegExp(`on public\\.${table}\\s`).test(statement[0]),
        )
      )
        await db.exec(statement[0]);
    }
  }
  await db.exec(
    await sqlFile("20260901130000_whatsapp_contact_patient_autolink.sql"),
  );
  const beforeMigration = await patient("(84) 99646-3570");
  await db.exec(await sqlFile("20260927120000_contact_patient_identity.sql"));
  await check("country code, formatting and ninth digit match", async () => {
    assert.equal(await key("+55 (84) 99646-3570"), await key("558496463570"));
    assert.equal(await key("(84) 99646-3570"), "br:8496463570");
  });
  await check("DDD is part of identity", async () =>
    assert.notEqual(await key("11996463570"), await key("84996463570")),
  );
  await check("incomplete phone and null never match", async () => {
    assert.equal(await key("96463570"), null);
    assert.equal(await key(null), null);
  });
  await check("fixed line is not mistaken for a mobile number", async () =>
    assert.notEqual(await key("1132345678"), await key("11932345678")),
  );
  await check("international phone preserves country code", async () =>
    assert.equal(await key("+1 (202) 555-0123"), "intl:12025550123"),
  );
  await check(
    "reindexed existing patient is found by incoming contact",
    async () =>
      assert.equal(
        await linked(await contact("558496463570")),
        beforeMigration,
      ),
  );
  await check("same suffix in another DDD stays unlinked", async () =>
    assert.equal(await linked(await contact("551196463570")), null),
  );
  await check("tenant isolation in automatic matching", async () =>
    assert.equal(
      await linked(await contact("558496463570", false, otherOrg)),
      null,
    ),
  );
  await check("shared family phone does not choose a patient", async () => {
    await patient("11988887777");
    await patient("11988887777");
    assert.equal(await linked(await contact("5511988887777")), null);
  });
  await check(
    "patient created after contact links existing conversation",
    async () => {
      const c = await contact("5511988886666");
      const p = await patient("11988886666");
      assert.equal(await linked(c), p);
    },
  );
  await check(
    "manual unlink survives incoming upsert and patient update",
    async () => {
      const c = await contact("5511988885555");
      const p = await patient("11988885555");
      await db.query(
        "update whatsapp_contacts set patient_id=null, patient_auto_link_disabled=true where id=$1",
        [c],
      );
      await db.query(
        "insert into whatsapp_contacts(organization_id,phone) values($1,'5511988885555') on conflict(organization_id,phone) do update set phone=excluded.phone",
        [org],
      );
      await db.query("update patients set phone=phone where id=$1", [p]);
      assert.equal(await linked(c), null);
    },
  );
  await check(
    "same-phone upsert retries a newly unambiguous match",
    async () => {
      const p = await patient("11988884444");
      const duplicate = await patient("11988884444");
      const c = await contact("5511988884444");
      assert.equal(await linked(c), null);
      await db.query("update patients set deleted_at=now() where id=$1", [
        duplicate,
      ]);
      await db.query(
        "insert into whatsapp_contacts(organization_id,phone) values($1,'5511988884444') on conflict(organization_id,phone) do update set phone=excluded.phone",
        [org],
      );
      assert.equal(await linked(c), p);
    },
  );
  const newContact = await contact("5511999991234");
  const duplicateContact = await contact("11988887777", true);
  const foreignContact = await contact("5511999991234", false, otherOrg);
  const invalidPhone = await contact("123");
  await db.query(
    "select set_config('test.user',$1,false), set_config('test.org',$2,false)",
    [user, org],
  );
  await permissions(["atendimento.atender", "paciente.ver", "paciente.criar"]);
  await db.exec("set role authenticated");
  await check(
    "RPC creates, links and preserves consent defaults with RLS",
    async () => {
      const id = await create(
        newContact,
        org,
        "Novo paciente",
        "teste@example.com",
      );
      assert.equal(await linked(newContact), id);
      const row = (
        await db.query(
          "select full_name,phone,email,source,allow_whatsapp from patients where id=$1",
          [id],
        )
      ).rows[0];
      assert.deepEqual(row, {
        full_name: "Novo paciente",
        phone: "5511999991234",
        email: "teste@example.com",
        source: "whatsapp",
        allow_whatsapp: false,
      });
      assert.equal(await create(newContact), id);
      assert.equal(
        await scalar(
          "select count(*)::integer from patients where phone='5511999991234'",
        ),
        1,
      );
    },
  );
  await check("duplicate phone requires explicit selection", async () =>
    rejectsCode(() => create(duplicateContact), "23505"),
  );
  await check("another tenant cannot be requested through RPC", async () =>
    rejectsCode(() => create(foreignContact, otherOrg), "42501"),
  );
  await check("foreign contact ID cannot bypass tenant scope", async () =>
    rejectsCode(() => create(foreignContact), "P0002"),
  );
  await check("incomplete phone cannot create a patient", async () =>
    rejectsCode(() => create(invalidPhone), "22023"),
  );
  await check("invalid name/email rejected by database", async () => {
    await rejectsCode(() => create(newContact, org, "A"), "22023");
    await rejectsCode(
      () => create(newContact, org, "Paciente", "invalid"),
      "22023",
    );
  });
  await check("missing patient-create permission blocks RPC", async () => {
    await permissions(["atendimento.atender", "paciente.ver"]);
    await rejectsCode(() => create(newContact), "42501");
  });
  await check("unauthenticated caller cannot execute RPC", async () => {
    await db.exec("reset role; set role anon");
    await rejectsCode(() => create(newContact), "42501");
  });
  console.log(`${checks} isolated PostgreSQL checks passed.`);
} catch (error) {
  console.error(error.message, error.code ?? "", error.where ?? "");
  process.exitCode = 1;
} finally {
  await db.close();
}
