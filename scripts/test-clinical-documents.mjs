// Isolated PostgreSQL checks using production migrations and RPCs. No clinic data.
// Set PGLITE_MODULE_PATH to a temporary installation's @electric-sql/pglite/dist/index.js.
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { pathToFileURL } from "node:url";
const { PGlite } = await import(
  process.env.PGLITE_MODULE_PATH
    ? pathToFileURL(process.env.PGLITE_MODULE_PATH).href
    : "@electric-sql/pglite"
);
const db = new PGlite();
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const org = id(1),
  otherOrg = id(2),
  doctor = id(3),
  reader = id(4),
  outsider = id(5),
  support = id(6),
  otherDoctor = id(7),
  patient = id(10),
  professional = id(11),
  encounter = id(12),
  session = id(13);
const readSql = (name) =>
  readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), "utf8");
const advanced = await readSql(
  "20260714180000_advanced_clinical_and_document_templates.sql",
);
const phase8 = await readSql("20260622220000_phase8_clinical_documents.sql");
function extractFunction(sql, name) {
  const start = sql.indexOf(`create or replace function ${name}(`);
  assert(start >= 0, name);
  return sql.slice(start, sql.indexOf("$$;", start) + 3);
}
function extractTable(sql, name) {
  const start = sql.indexOf(`create table if not exists public.${name} (`);
  assert(start >= 0, name);
  return sql.slice(start, sql.indexOf("\n);", start) + 3);
}
const scalar = async (sql, values = []) =>
  Object.values((await db.query(sql, values)).rows[0])[0];
const login = (user) =>
  db.query("select set_config('test.user',$1,false)", [user]);
const denied = (fn, code = "42501") =>
  assert.rejects(fn, (e) => e.code === code);
let count = 0;
async function check(name, test) {
  await test();
  console.log(`ok ${++count} - ${name}`);
}
const fields = {
  referral: { destination: "Cardiologia", reason: "Avaliacao solicitada" },
  clinical_report: { purpose: "Continuidade do cuidado" },
  patient_instructions: { care: "Consulta de acompanhamento" },
  informed_consent: { procedure: "Procedimento de demonstracao" },
};
const issue = (
  type = "informed_consent",
  details = fields[type],
  template = null,
  version = null,
  supportSession = null,
) =>
  scalar(
    "select issue_clinical_document_v2($1,$2,'Documento de teste','Conteudo revisado pelo profissional.',$3,$4,$5,$6)",
    [
      encounter,
      type,
      template,
      version,
      JSON.stringify({ fields: details }),
      supportSession,
    ],
  );
const evidence = (overrides = {}) => ({
  signer_role: "patient",
  signer_name: "Paciente Teste",
  signer_document: "RG demonstracao",
  acknowledged: true,
  signature: { method: "typed", name: "Paciente Teste" },
  ...overrides,
});
const record = (doc, type, data = {}, supportSession = null) =>
  scalar("select record_clinical_document_consent($1,$2,$3,$4)", [
    doc,
    type,
    JSON.stringify(data),
    supportSession,
  ]);
const details = (doc, supportSession = null) =>
  scalar("select get_clinical_document_consent($1,$2)", [doc, supportSession]);
try {
  await db.exec(`
    create role authenticated; create role service_role; create role anon;
    create schema app_private; create schema auth;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.user',true),'')::uuid $$;
    create table organizations(id uuid primary key, name text, logo_url text);
    create table app_users(id uuid primary key, organization_id uuid, auth_user_id uuid, status text default 'active', is_super_admin boolean default false, name text, unique(organization_id,id));
    create table impersonation_sessions(id uuid primary key, organization_id uuid, super_admin_user_id uuid, target_user_id uuid, started_at timestamptz default now(), ended_at timestamptz);
    create table test_permissions(user_id uuid, code text);
    create function app_private.user_permission_codes(p_user uuid) returns setof text language sql stable as $$ select code from test_permissions where user_id=p_user $$;
    create function app_private.current_organization_id() returns uuid language sql stable security definer as $$ select organization_id from app_users where auth_user_id=auth.uid() $$;
    create function app_private.current_is_super_admin() returns boolean language sql stable security definer as $$ select coalesce((select is_super_admin from app_users where auth_user_id=auth.uid()),false) $$;
    create function app_private.current_user_has_permission(p_code text) returns boolean language sql stable security definer as $$ select exists(select 1 from test_permissions where user_id=auth.uid() and code=p_code) $$;
    create table permissions(id uuid primary key default gen_random_uuid(), code text unique, category text, description text);
    create table profile_permissions(profile_id uuid, permission_id uuid, unique(profile_id,permission_id));
    create table organization_settings(organization_id uuid, timezone text);
    create table patients(id uuid primary key, organization_id uuid, full_name text, social_name text, cpf text, rg text, birth_date date, email text, phone text, unique(organization_id,id));
    create table professionals(id uuid primary key, organization_id uuid, user_id uuid, active boolean default true, name text, council_type text, council_number text, council_state text, specialty_id uuid, unique(organization_id,id));
    create table specialties(id uuid,organization_id uuid,name text);
    create table encounters(id uuid primary key,organization_id uuid,patient_id uuid,professional_id uuid,appointment_id uuid,started_at timestamptz default now(),finalized_at timestamptz,status text default 'draft',unique(organization_id,id));
    create table clinics(id uuid,organization_id uuid,trade_name text,legal_name text,document text,phone text,email text,postal_code text,address_line text,address_number text,address_complement text,district text,city text,state text);
    create table units(id uuid,organization_id uuid,name text,phone text,email text,postal_code text,address_line text,address_number text,address_complement text,district text,city text,state text);
    create table procedures(id uuid,organization_id uuid,name text);
    create table appointments(id uuid,organization_id uuid,start_at timestamptz,end_at timestamptz,unit_id uuid,procedure_id uuid,status text);
    create table audit_logs(organization_id uuid,actor_user_id uuid,action text,resource_type text,resource_id uuid,metadata jsonb);
    insert into organizations(id) values ('${org}'),('${otherOrg}');
    insert into app_users(id,organization_id,auth_user_id,name) values ('${doctor}','${org}','${doctor}','Medica Teste'),('${reader}','${org}','${reader}','Leitura'),('${outsider}','${otherOrg}','${outsider}','Outra clinica'),('${otherDoctor}','${org}','${otherDoctor}','Outro medico');
    insert into app_users(id,auth_user_id,name,is_super_admin) values ('${support}','${support}','Suporte',true);
    insert into impersonation_sessions(id,organization_id,super_admin_user_id,target_user_id) values ('${session}','${org}','${support}','${reader}');
    insert into patients(id,organization_id,full_name) values ('${patient}','${org}','Paciente Teste');
    insert into professionals(id,organization_id,user_id,name) values ('${professional}','${org}','${doctor}','Medica Teste');
    insert into encounters(id,organization_id,patient_id,professional_id) values ('${encounter}','${org}','${patient}','${professional}');
    insert into test_permissions(user_id,code) select '${doctor}', unnest(array['clinico.ver_prontuario_proprios','clinico.criar_template','clinico.prescrever','clinico.emitir_documento','clinico.gerenciar_consentimento']);
    insert into test_permissions values ('${reader}','clinico.ver_prontuario'),('${outsider}','clinico.ver_prontuario'),('${otherDoctor}','clinico.ver_prontuario_proprios'),('${otherDoctor}','clinico.gerenciar_consentimento');
    insert into permissions(code) values ('clinico.emitir_atestado');
    insert into profile_permissions select '${doctor}',id from permissions;
  `);
  await db.exec(extractTable(phase8, "clinical_document_templates"));
  await db.exec(extractTable(phase8, "clinical_documents"));
  await db.exec(
    "alter table clinical_document_templates add description text, add layout_schema jsonb default '{}'::jsonb; alter table clinical_documents add template_version_id uuid;",
  );
  await db.exec(extractTable(advanced, "clinical_document_template_versions"));
  for (const name of [
    "app_private.user_has_permission",
    "app_private.resolve_effective_request_context",
    "app_private.resolve_template_management_context",
    "app_private.is_valid_document_custom_variables",
    "public.create_clinical_document_template",
    "public.issue_clinical_document_v2",
  ])
    await db.exec(extractFunction(advanced, name));
  const migrationNames = await readdir(
    new URL("../supabase/migrations/", import.meta.url),
  );
  let immutable;
  for (const file of migrationNames.filter((name) => name.includes("phase7"))) {
    const content = await readSql(file);
    if (
      content.includes(
        "create or replace function app_private.prevent_clinical_immutable_change(",
      )
    )
      immutable = extractFunction(
        content,
        "app_private.prevent_clinical_immutable_change",
      );
  }
  assert(immutable, "production immutability trigger found");
  await db.exec(immutable);
  await db.exec(
    await readSql("20260927160000_extended_documents_and_consent.sql"),
  );
  await db.exec(`create trigger prevent_document_change before update or delete on clinical_documents for each row execute function app_private.prevent_clinical_immutable_change();
    alter table clinical_documents enable row level security;
    grant usage on schema public,app_private,auth to authenticated;
    grant select on clinical_documents to authenticated;
    create policy fixture_document_scope on clinical_documents for select to authenticated using (organization_id=app_private.current_organization_id() and app_private.current_user_has_permission('clinico.ver_prontuario'));
  `);
  await login(doctor);
  await check(
    "new capabilities inherited by existing document profiles",
    async () =>
      assert.equal(await scalar("select count(*) from profile_permissions"), 3),
  );
  for (const type of Object.keys(fields))
    await check(`template version and document issuance: ${type}`, async () => {
      const [template] = (
        await db.query(
          "select * from create_clinical_document_template($1,$1,'Modelo de teste','Titulo','Texto do modelo')",
          [type],
        )
      ).rows;
      const doc = await issue(
        type,
        fields[type],
        template.template_id,
        template.version_id,
      );
      const metadata = await scalar(
        "select metadata from clinical_documents where id=$1",
        [doc],
      );
      assert.equal(metadata.template.version_id, template.version_id);
      assert.deepEqual(metadata.fields, fields[type]);
      assert.equal(metadata.render.patient.full_name, "Paciente Teste");
    });
  await check("legacy prescriptions remain available", async () =>
    assert.ok(await issue("prescription")),
  );
  await check(
    "new documents require their purpose fields in PostgreSQL",
    async () => {
      for (const type of Object.keys(fields))
        await denied(() => issue(type, {}), "23514");
    },
  );
  const doc = await issue();
  await check("new consent starts pending with no signature", async () =>
    assert.deepEqual((await details(doc)).events, []),
  );
  await check("signature needs explicit boolean acknowledgement", async () => {
    for (const acknowledged of [false, "true", null])
      await denied(
        () => record(doc, "signed", evidence({ acknowledged })),
        "22023",
      );
  });
  await check("patient identity and typed signature must match", async () => {
    await denied(
      () =>
        record(
          doc,
          "signed",
          evidence({
            signer_name: "Outra Pessoa",
            signature: { method: "typed", name: "Outra Pessoa" },
          }),
        ),
      "22023",
    );
    await denied(
      () =>
        record(
          doc,
          "signed",
          evidence({ signature: { method: "typed", name: "Outro Nome" } }),
        ),
      "22023",
    );
  });
  await check("guardian requires relationship and identification", async () => {
    await denied(
      () => record(doc, "signed", evidence({ signer_role: "guardian" })),
      "22023",
    );
    await denied(
      () => record(doc, "signed", evidence({ signer_document: "" })),
      "22023",
    );
  });
  await check(
    "reject empty, tiny, excessive and out-of-bounds drawn signatures",
    async () => {
      for (const strokes of [
        [],
        [
          [
            { x: 0.1, y: 0.1 },
            { x: 0.1, y: 0.1 },
            { x: 0.1, y: 0.1 },
            { x: 0.1, y: 0.1 },
          ],
        ],
        [
          [
            { x: 0, y: 0 },
            { x: 2, y: 0 },
          ],
        ],
        [Array.from({ length: 2049 }, (_, i) => ({ x: i % 2, y: 0.5 }))],
      ])
        await denied(
          () =>
            record(
              doc,
              "signed",
              evidence({ signature: { method: "drawn", strokes } }),
            ),
          "22023",
        );
      assert.equal(
        await scalar("select app_private.is_valid_consent_signature($1,null)", [
          JSON.stringify({ method: "typed" }),
        ]),
        false,
      );
    },
  );
  await check(
    "signed consent stores immutable content hash and server attribution",
    async () => {
      await record(doc, "signed", evidence());
      const e = (await details(doc)).events[0];
      assert.match(e.document_hash, /^[a-f0-9]{64}$/);
      assert.equal(e.recorded_by_user_id, doctor);
      assert.equal(e.actor_user_id, doctor);
      assert.equal(e.signer_name, "Paciente Teste");
      assert.equal(e.signature.name, "Paciente Teste");
      assert.equal(
        await scalar(
          "select count(*) from audit_logs where action='clinical_consent.signed'",
        ),
        1,
      );
    },
  );
  await check(
    "duplicate signature and cancellation after signature are blocked",
    async () => {
      await denied(() => record(doc, "signed", evidence()), "40001");
      await denied(
        () => record(doc, "cancelled", { reason: "Cancelamento" }),
        "40001",
      );
    },
  );
  await check(
    "revocation requires reason and preserves signature and content hash",
    async () => {
      await denied(() => record(doc, "revoked"), "22023");
      await record(doc, "revoked", {
        reason: "Solicitacao do paciente registrada presencialmente",
      });
      const events = (await details(doc)).events;
      assert.deepEqual(
        events.map((e) => e.event_type),
        ["signed", "revoked"],
      );
      assert.equal(events[0].document_hash, events[1].document_hash);
      await denied(
        () => record(doc, "revoked", { reason: "Nova revogacao" }),
        "40001",
      );
    },
  );
  await check("events and original document cannot be edited", async () => {
    await denied(
      () =>
        db.query(
          "update clinical_document_consent_events set signer_name='Alterado' where document_id=$1",
          [doc],
        ),
      "55000",
    );
    await denied(
      () =>
        db.query(
          "delete from clinical_document_consent_events where document_id=$1",
          [doc],
        ),
      "55000",
    );
    await denied(
      () =>
        db.query("update clinical_documents set body='Alterado' where id=$1", [
          doc,
        ]),
      "55000",
    );
  });
  const cancelled = await issue();
  await check(
    "pending consent may be cancelled but cannot be revoked or signed later",
    async () => {
      await denied(
        () => record(cancelled, "revoked", { reason: "Revogacao" }),
        "40001",
      );
      await record(cancelled, "cancelled", {
        reason: "Procedimento cancelado",
      });
      await denied(() => record(cancelled, "signed", evidence()), "40001");
    },
  );
  const drawnDoc = await issue();
  await check("guardian can sign with a drawn signature", async () => {
    await record(
      drawnDoc,
      "signed",
      evidence({
        signer_role: "guardian",
        signer_name: "Responsavel Teste",
        guardian_relationship: "Mae",
        signature: {
          method: "drawn",
          strokes: [
            [
              { x: 0.1, y: 0.2 },
              { x: 0.3, y: 0.6 },
              { x: 0.5, y: 0.2 },
              { x: 0.8, y: 0.4 },
            ],
          ],
        },
      }),
    );
    assert.equal(
      (await details(drawnDoc)).events[0].guardian_relationship,
      "Mae",
    );
  });
  await login(reader);
  await check(
    "read-only clinician can see consent but cannot manage or issue it",
    async () => {
      assert.equal((await details(doc)).canManage, false);
      await denied(() => record(cancelled, "signed", evidence()));
      await denied(() => issue());
    },
  );
  await login(otherDoctor);
  await check(
    "own-record permission excludes another professional's documents",
    async () => {
      await denied(() => details(doc));
      await denied(() => record(doc, "signed", evidence()));
    },
  );
  await login(outsider);
  await check("cross-organization access is rejected", async () => {
    await denied(() => details(doc), "P0002");
    await denied(() => record(doc, "signed", evidence()), "P0002");
  });
  await login(support);
  await check(
    "support requires a valid session and respects target permission",
    async () => {
      await denied(() => details(doc));
      assert.equal((await details(doc, session)).canManage, false);
      await denied(() => record(cancelled, "signed", evidence(), session));
    },
  );
  await db.query(
    "update impersonation_sessions set target_user_id=$1 where id=$2",
    [doctor, session],
  );
  await check(
    "support records effective clinician and real actor separately",
    async () => {
      const supportDoc = await issue(
        "informed_consent",
        fields.informed_consent,
        null,
        null,
        session,
      );
      await record(supportDoc, "signed", evidence(), session);
      const e = (await details(supportDoc, session)).events[0];
      assert.equal(e.recorded_by_user_id, doctor);
      assert.equal(e.actor_user_id, support);
      assert.equal(e.impersonation_session_id, session);
    },
  );
  await login(reader);
  await db.exec("set role authenticated");
  await check("event RLS follows accessible parent documents", async () => {
    assert.ok(
      await scalar("select count(*) from clinical_document_consent_events"),
    );
  });
  await check(
    "direct event writes are unavailable to authenticated users",
    async () => {
      await denied(() =>
        db.exec("insert into clinical_document_consent_events default values"),
      );
    },
  );
  await login(outsider);
  await check("event RLS hides other organizations", async () =>
    assert.equal(
      await scalar("select count(*) from clinical_document_consent_events"),
      0,
    ),
  );
  console.log(`${count} PostgreSQL checks passed.`);
} finally {
  await db.close();
}
