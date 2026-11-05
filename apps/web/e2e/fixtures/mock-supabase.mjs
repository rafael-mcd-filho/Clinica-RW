/* Supabase falso (PostgREST + Auth) com uma clínica fictícia, para os testes
   de tela e de jornada (Playwright) rodarem sem banco: npm run test:e2e.
   Dados gerados com semente fixa; "hoje" é a data real. Nenhum dado real.
   Grava em memória (PATCH/POST) para as jornadas; reiniciar zera tudo.
   Não é PostgREST: sem RLS nem regras do banco — isso é testado pelo
   supabase test db (supabase/tests). */
import http from "node:http";
import crypto from "node:crypto";

const PORT = Number(process.env.MOCK_SUPABASE_PORT ?? 54321);
const OFFSET_H = 9; // fuso da clínica fictícia (Asia/Tokyo) para "agora" cair no meio do expediente
const TZ = "Asia/Tokyo";
const ENC_KEY = process.env.WHATSAPP_CREDENTIALS_ENCRYPTION_KEY || "mock-key";

// ---------- utilidades ----------
let seed = 20261105;
function rnd() {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
}
function pick(a) {
  return a[Math.floor(rnd() * a.length)];
}
function int(a, b) {
  return a + Math.floor(rnd() * (b - a + 1));
}
function chance(p) {
  return rnd() < p;
}
function uuid() {
  const h = Array.from({ length: 32 }, () =>
    Math.floor(rnd() * 16).toString(16),
  ).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-${"89ab"[Math.floor(rnd() * 4)]}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
function iso(d) {
  return new Date(d).toISOString();
}
function utcFromLocal(y, m, d, h, mi) {
  return new Date(Date.UTC(y, m - 1, d, h - OFFSET_H, mi || 0));
}
function localParts(date) {
  const d = new Date(new Date(date).getTime() + OFFSET_H * 3600e3);
  return {
    y: d.getUTCFullYear(),
    m: d.getUTCMonth() + 1,
    d: d.getUTCDate(),
    wd: d.getUTCDay(),
    h: d.getUTCHours(),
    mi: d.getUTCMinutes(),
  };
}
function localDateKey(date) {
  const p = localParts(date);
  return `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
}
function addDaysLocal(y, m, d, n) {
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return {
    y: t.getUTCFullYear(),
    m: t.getUTCMonth() + 1,
    d: t.getUTCDate(),
    wd: t.getUTCDay(),
  };
}
function cpf() {
  const n = Array.from({ length: 9 }, () => int(0, 9));
  const dv = (arr, f) => {
    const s = arr.reduce((a, v, i) => a + v * (f - i), 0);
    const r = (s * 10) % 11;
    return r === 10 ? 0 : r;
  };
  n.push(dv(n, 10));
  n.push(dv(n, 11));
  return n.join("");
}
function encryptCredential(value) {
  const key = crypto.createHash("sha256").update(ENC_KEY).digest();
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([c.update(value, "utf8"), c.final()]);
  return [
    "v1",
    iv.toString("base64url"),
    c.getAuthTag().toString("base64url"),
    enc.toString("base64url"),
  ].join(".");
}
function slug(s) {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ".");
}

// ---------- dados ----------
const db = {};
const NOW = new Date();
const today = localParts(NOW);
const ORG = uuid();
const AUTH_UID = uuid();
const ME = uuid();

db.platform_settings = [
  {
    id: true,
    app_name: "Hi Clinic",
    primary_color: "#0054C2",
    logo_url: null,
    support_email: "suporte@hiclinic.example",
    support_phone: null,
    support_whatsapp: null,
    support_url: null,
  },
];
db.organizations = [
  {
    id: ORG,
    name: "Clínica Aurora",
    legal_name: "Clínica Aurora Serviços Médicos Ltda.",
    document: "12345678000190",
    email: "contato@clinicaaurora.example",
    phone: "1133224455",
    logo_url: null,
    status: "active",
    mode: "clinic",
    plan_key: "pro",
    created_at: "2026-06-01T12:00:00Z",
  },
];
db.organization_settings = [
  {
    id: uuid(),
    organization_id: ORG,
    timezone: TZ,
    locale: "pt-BR",
    automatic_mode: true,
    onboarding_completed_at: "2026-06-02T12:00:00Z",
  },
];
db.clinics = [
  {
    id: uuid(),
    organization_id: ORG,
    trade_name: "Clínica Aurora",
    legal_name: "Clínica Aurora Serviços Médicos Ltda.",
    document: "12345678000190",
    phone: "1133224455",
    email: "contato@clinicaaurora.example",
    postal_code: "01310100",
    address_line: "Avenida Paulista",
    address_number: "1500",
    address_complement: "Conj. 82",
    district: "Bela Vista",
    city: "São Paulo",
    state: "SP",
  },
];

const units = [
  {
    id: uuid(),
    organization_id: ORG,
    name: "Unidade Paulista",
    code: "PAU",
    phone: "1133224455",
    email: "paulista@clinicaaurora.example",
    postal_code: "01310100",
    address_line: "Avenida Paulista",
    address_number: "1500",
    address_complement: "Conj. 82",
    district: "Bela Vista",
    city: "São Paulo",
    state: "SP",
    active: true,
  },
  {
    id: uuid(),
    organization_id: ORG,
    name: "Unidade Moema",
    code: "MOE",
    phone: "1150443322",
    email: "moema@clinicaaurora.example",
    postal_code: "04077000",
    address_line: "Avenida Ibirapuera",
    address_number: "2120",
    address_complement: "Sala 41",
    district: "Moema",
    city: "São Paulo",
    state: "SP",
    active: true,
  },
];
db.units = units;
db.rooms = [
  {
    id: uuid(),
    organization_id: ORG,
    unit_id: units[0].id,
    name: "Consultório 1",
    description: null,
    active: true,
  },
  {
    id: uuid(),
    organization_id: ORG,
    unit_id: units[0].id,
    name: "Consultório 2",
    description: null,
    active: true,
  },
  {
    id: uuid(),
    organization_id: ORG,
    unit_id: units[0].id,
    name: "Sala de exames",
    description: "ECG e procedimentos",
    active: true,
  },
  {
    id: uuid(),
    organization_id: ORG,
    unit_id: units[1].id,
    name: "Consultório 3",
    description: null,
    active: true,
  },
];
db.equipment = [
  {
    id: uuid(),
    organization_id: ORG,
    unit_id: units[0].id,
    name: "Eletrocardiógrafo",
    description: "12 derivações",
    active: true,
  },
];

const specialties = [
  "Cardiologia",
  "Clínica Geral",
  "Pediatria",
  "Psicologia",
  "Dermatologia",
].map((name, i) => ({
  id: uuid(),
  organization_id: ORG,
  name,
  cbo_code: ["225120", "225125", "225124", "251510", "225135"][i],
  active: true,
}));
db.specialties = specialties;

const profDefs = [
  {
    name: "Dra. Helena Prado",
    sp: 0,
    council_type: "CRM",
    council_number: "142587",
    color: "#2563eb",
  },
  {
    name: "Dr. Rafael Nunes",
    sp: 1,
    council_type: "CRM",
    council_number: "128903",
    color: "#16a34a",
  },
  {
    name: "Dra. Camila Duarte",
    sp: 2,
    council_type: "CRM",
    council_number: "156210",
    color: "#d97706",
  },
  {
    name: "Lucas Andrade",
    sp: 3,
    council_type: "CRP",
    council_number: "06/154321",
    color: "#7c3aed",
  },
  {
    name: "Dra. Beatriz Lima",
    sp: 4,
    council_type: "CRM",
    council_number: "161044",
    color: "#db2777",
  },
];
db.app_users = [
  {
    id: ME,
    organization_id: ORG,
    auth_user_id: AUTH_UID,
    name: "Mariana Costa",
    email: "mariana.costa@clinicaaurora.example",
    phone: "11987650001",
    status: "active",
    is_super_admin: false,
    created_at: "2026-06-01T12:00:00Z",
  },
];
db.professionals = profDefs.map((p, i) => {
  const userId = uuid();
  db.app_users.push({
    id: userId,
    organization_id: ORG,
    auth_user_id: uuid(),
    name: p.name.replace(/^Dra?\. /, ""),
    email: `${slug(p.name.replace(/^Dra?\. /, ""))}@clinicaaurora.example`,
    phone: `1198765${String(1000 + i)}`,
    status: "active",
    is_super_admin: false,
    created_at: "2026-06-02T12:00:00Z",
  });
  return {
    id: uuid(),
    organization_id: ORG,
    user_id: userId,
    specialty_id: specialties[p.sp].id,
    name: p.name,
    council_type: p.council_type,
    council_number: p.council_number,
    council_state: "SP",
    active: true,
    color: p.color,
  };
});
db.app_users.push(
  {
    id: uuid(),
    organization_id: ORG,
    auth_user_id: uuid(),
    name: "Juliana Alves",
    email: "juliana.alves@clinicaaurora.example",
    phone: "11987650020",
    status: "active",
    is_super_admin: false,
    created_at: "2026-06-03T12:00:00Z",
  },
  {
    id: uuid(),
    organization_id: ORG,
    auth_user_id: uuid(),
    name: "Pedro Henrique Sales",
    email: "pedro.sales@clinicaaurora.example",
    phone: "11987650021",
    status: "invited",
    is_super_admin: false,
    created_at: "2026-10-20T12:00:00Z",
  },
);

db.schedules = db.professionals.map((p, i) => ({
  id: uuid(),
  organization_id: ORG,
  professional_id: p.id,
  unit_id: i === 4 ? units[1].id : units[0].id,
  name: `Agenda ${p.name}`,
  color: p.color,
  active: true,
}));
db.schedule_availability = [];
db.schedules.forEach((s, i) => {
  [1, 2, 3, 4, 5].forEach((wd) => {
    if (i === 3 && wd === 3) return;
    db.schedule_availability.push({
      id: uuid(),
      organization_id: ORG,
      schedule_id: s.id,
      weekday: wd,
      start_time: "08:00:00",
      end_time: "12:00:00",
      slot_minutes: 30,
    });
    db.schedule_availability.push({
      id: uuid(),
      organization_id: ORG,
      schedule_id: s.id,
      weekday: wd,
      start_time: "13:30:00",
      end_time: "18:00:00",
      slot_minutes: 30,
    });
  });
});
db.business_hours = [1, 2, 3, 4, 5].map((wd) => ({
  id: uuid(),
  organization_id: ORG,
  unit_id: units[0].id,
  professional_id: null,
  weekday: wd,
  start_time: "07:30:00",
  end_time: "19:00:00",
  lunch_start_time: "12:00:00",
  lunch_end_time: "13:30:00",
  active: true,
}));

const procDefs = [
  ["Consulta cardiológica", "CARD-01", 30, 380, [0]],
  ["Eletrocardiograma", "ECG-01", 20, 160, [0]],
  ["Consulta clínica", "CLIN-01", 30, 320, [1]],
  ["Retorno", "RET-01", 20, 0, [0, 1, 2, 4]],
  ["Consulta pediátrica", "PED-01", 30, 340, [2]],
  ["Psicoterapia individual", "PSI-01", 50, 230, [3]],
  ["Avaliação dermatológica", "DERM-01", 30, 360, [4]],
  ["Teleconsulta", "TELE-01", 30, 280, [1, 4]],
];
db.procedures = procDefs.map(([name, code, dur, price]) => ({
  id: uuid(),
  organization_id: ORG,
  name,
  code,
  duration_minutes: dur,
  base_price: price,
  active: true,
}));
const procsByProf = db.professionals.map((_, i) =>
  db.procedures.filter((__, j) => procDefs[j][4].includes(i)),
);
db.health_insurances = ["Unimed", "Bradesco Saúde", "SulAmérica", "Amil"].map(
  (name) => ({
    id: uuid(),
    organization_id: ORG,
    name,
    document: null,
    active: true,
  }),
);
db.price_tables = db.health_insurances.map((h) => ({
  id: uuid(),
  organization_id: ORG,
  name: `Tabela ${h.name}`,
  health_insurance_id: h.id,
  active: true,
}));
db.price_table_items = [];
db.price_tables.forEach((t) =>
  db.procedures.forEach((p) => {
    if (p.base_price > 0)
      db.price_table_items.push({
        id: uuid(),
        organization_id: ORG,
        price_table_id: t.id,
        procedure_id: p.id,
        price: Math.round(p.base_price * (0.55 + rnd() * 0.2)),
      });
  }),
);
db.payment_methods = [
  ["Pix", "pix"],
  ["Cartão de crédito", "credit_card"],
  ["Cartão de débito", "debit_card"],
  ["Dinheiro", "cash"],
  ["Convênio", "insurance"],
].map(([name, method_type]) => ({
  id: uuid(),
  organization_id: ORG,
  name,
  method_type,
  active: true,
}));
db.payment_method_fees = [
  {
    id: uuid(),
    organization_id: ORG,
    payment_method_id: db.payment_methods[1].id,
    name: "Taxa crédito",
    calculation_type: "percentage",
    value: 3.2,
    active: true,
  },
];
db.procedure_costs = [
  {
    id: uuid(),
    organization_id: ORG,
    procedure_id: db.procedures[1].id,
    name: "Eletrodos e papel",
    cost_type: "direct",
    calculation_type: "fixed",
    value: 12,
    active: true,
  },
];
db.financial_categories = [
  ["Consultas", "revenue", "gross_revenue"],
  ["Exames", "revenue", "gross_revenue"],
  ["Impostos sobre serviços", "expense", "revenue_deduction"],
  ["Repasse médico", "expense", "direct_cost"],
  ["Materiais", "expense", "direct_cost"],
  ["Aluguel", "expense", "operating_expense"],
  ["Folha de pagamento", "expense", "operating_expense"],
  ["Marketing", "expense", "operating_expense"],
  ["Tarifas bancárias", "expense", "financial_result"],
].map(([name, category_type, dre_group]) => ({
  id: uuid(),
  organization_id: ORG,
  name,
  category_type,
  dre_group,
}));
db.tags = [
  ["Primeira consulta", "#2563eb"],
  ["Retorno pendente", "#d97706"],
  ["VIP", "#7c3aed"],
  ["Inadimplente", "#dc2626"],
  ["Pós-operatório", "#0d9488"],
  ["Gestante", "#db2777"],
].map(([name, color]) => ({ id: uuid(), organization_id: ORG, name, color }));

// pacientes
const firsts = [
  "Ana",
  "Bruno",
  "Carla",
  "Daniel",
  "Eduarda",
  "Felipe",
  "Gabriela",
  "Henrique",
  "Isabela",
  "João",
  "Karina",
  "Leonardo",
  "Luana",
  "Marcos",
  "Natália",
  "Otávio",
  "Paula",
  "Renan",
  "Sabrina",
  "Thiago",
  "Vanessa",
  "Vinícius",
  "Yasmin",
  "Lucas",
  "Beatriz",
  "Camila",
  "Diego",
  "Elisa",
  "Fernanda",
  "Gustavo",
  "Heloísa",
  "Igor",
  "Júlia",
  "Larissa",
  "Mateus",
  "Patrícia",
  "Renato",
  "Simone",
  "Tatiana",
  "Wagner",
  "Alice",
  "Miguel",
  "Laura",
  "Arthur",
  "Sofia",
  "Davi",
];
const lasts = [
  "Silva",
  "Souza",
  "Oliveira",
  "Santos",
  "Pereira",
  "Lima",
  "Carvalho",
  "Ribeiro",
  "Almeida",
  "Ferreira",
  "Gomes",
  "Martins",
  "Rocha",
  "Barbosa",
  "Araújo",
  "Cardoso",
  "Teixeira",
  "Moreira",
  "Mendes",
  "Correia",
  "Nogueira",
  "Batista",
  "Freitas",
  "Pinto",
  "Moura",
  "Campos",
  "Vieira",
  "Monteiro",
];
const femaleNames = new Set([
  "Ana",
  "Carla",
  "Eduarda",
  "Gabriela",
  "Isabela",
  "Karina",
  "Luana",
  "Natália",
  "Paula",
  "Sabrina",
  "Vanessa",
  "Yasmin",
  "Beatriz",
  "Camila",
  "Elisa",
  "Fernanda",
  "Heloísa",
  "Júlia",
  "Larissa",
  "Patrícia",
  "Simone",
  "Tatiana",
  "Alice",
  "Laura",
  "Sofia",
]);
const districts = [
  ["Bela Vista", "01310"],
  ["Pinheiros", "05422"],
  ["Moema", "04077"],
  ["Vila Mariana", "04101"],
  ["Perdizes", "05014"],
  ["Tatuapé", "03303"],
  ["Santana", "02012"],
  ["Mooca", "03103"],
];
const streets = [
  "Rua Augusta",
  "Rua Haddock Lobo",
  "Alameda Santos",
  "Rua Domingos de Morais",
  "Rua Cardeal Arcoverde",
  "Rua Tuiuti",
  "Rua Voluntários da Pátria",
  "Rua da Mooca",
  "Rua Teodoro Sampaio",
  "Avenida Brigadeiro Luís Antônio",
];
db.patients = [];
db.patient_addresses = [];
db.patient_clinical_summaries = [];
db.patient_tags = [];
db.patient_consents = [];
const usedNames = new Set();
for (let i = 0; i < 150; i++) {
  let first, full;
  do {
    first = pick(firsts);
    full = `${first} ${pick(lasts)} ${pick(lasts)}`;
  } while (usedNames.has(full));
  usedNames.add(full);
  const kid = i % 7 === 0;
  const by = kid ? int(2014, 2024) : int(1948, 2004);
  const id = uuid();
  const created = new Date(NOW.getTime() - int(2, 150) * 86400e3);
  const digits = `119${int(10000000, 99999999)}`;
  db.patients.push({
    id,
    organization_id: ORG,
    full_name: full,
    social_name: i === 11 ? "Luiza" : null,
    birth_date: `${by}-${String(int(1, 12)).padStart(2, "0")}-${String(int(1, 28)).padStart(2, "0")}`,
    sex_at_birth: femaleNames.has(first) ? "female" : "male",
    cpf: chance(0.85) ? cpf() : null,
    rg: chance(0.5) ? String(int(10000000, 59999999)) : null,
    email: chance(0.8)
      ? `${slug(full).split(".").slice(0, 2).join(".")}@email.example`
      : null,
    phone: digits,
    whatsapp: chance(0.9) ? digits : null,
    preferred_contact: "whatsapp",
    allow_whatsapp: true,
    allow_email: chance(0.7),
    allow_sms: false,
    status: "active",
    source: pick([
      "Indicação",
      "Instagram",
      "Google",
      "Agendamento online",
      "Convênio",
    ]),
    photo_path: null,
    deceased_at: null,
    death_notes: null,
    deleted_at: null,
    created_at: iso(created),
    health_insurance_id: chance(0.4) ? pick(db.health_insurances).id : null,
  });
  if (chance(0.75)) {
    const [district, cep] = pick(districts);
    db.patient_addresses.push({
      id: uuid(),
      organization_id: ORG,
      patient_id: id,
      postal_code: `${cep}${int(100, 999)}`,
      address_line: pick(streets),
      address_number: String(int(10, 2500)),
      address_complement: chance(0.4) ? `Apto ${int(11, 154)}` : null,
      district,
      city: "São Paulo",
      state: "SP",
    });
  }
  if (chance(0.7)) {
    db.patient_clinical_summaries.push({
      id: uuid(),
      organization_id: ORG,
      patient_id: id,
      allergies: pick([
        "Dipirona",
        "Penicilina",
        "Nenhuma conhecida",
        "Ibuprofeno; frutos do mar",
        "Látex",
        "Sulfa",
      ]),
      comorbidities: pick([
        "Hipertensão arterial",
        "Diabetes tipo 2",
        "Asma",
        "Hipotireoidismo",
        "Nenhuma",
        "Dislipidemia; hipertensão",
      ]),
      medications: pick([
        "Losartana 50 mg, 1x ao dia",
        "Metformina 850 mg, 2x ao dia",
        "Levotiroxina 50 mcg em jejum",
        "Nenhuma de uso contínuo",
        "Sinvastatina 20 mg à noite",
      ]),
      medical_history: pick([
        "Colecistectomia em 2019",
        "Sem cirurgias prévias",
        "Apendicectomia na infância",
        "Fratura de rádio em 2015",
      ]),
      family_history: pick([
        "Pai com infarto aos 58 anos",
        "Mãe diabética",
        "Sem antecedentes relevantes",
        "Avó com câncer de mama",
      ]),
      habits: pick([
        "Não fumante; atividade física 3x/semana",
        "Ex-tabagista (parou em 2018)",
        "Sedentário; etilismo social",
        "Pratica corrida",
      ]),
      emergency_contact_name: `${pick(firsts)} ${full.split(" ").slice(-1)[0]}`,
      emergency_contact_phone: `119${int(10000000, 99999999)}`,
      emergency_contact_relationship: pick([
        "Cônjuge",
        "Mãe",
        "Pai",
        "Filho(a)",
        "Irmã(o)",
      ]),
    });
  }
  if (chance(0.35))
    db.patient_tags.push({
      id: uuid(),
      organization_id: ORG,
      patient_id: id,
      tag_id: pick(db.tags).id,
      expires_at: null,
      created_at: iso(created),
    });
  db.patient_consents.push({
    id: uuid(),
    organization_id: ORG,
    patient_id: id,
    consent_type: "lgpd_treatment",
    version: "1.0",
    accepted_at: iso(created),
    revoked_at: null,
  });
}

// modelos clínicos
const soapSchema = {
  schemaVersion: 2,
  sections: [
    {
      id: "anamnese",
      title: "Anamnese",
      fields: [
        {
          id: "queixa",
          label: "Queixa principal",
          type: "textarea",
          required: true,
        },
        {
          id: "hda",
          label: "História da doença atual",
          type: "textarea",
          required: false,
        },
      ],
    },
    {
      id: "exame_fisico",
      title: "Exame físico",
      fields: [
        {
          id: "pa",
          label: "Pressão arterial",
          type: "text",
          required: false,
          placeholder: "120/80",
        },
        {
          id: "fc",
          label: "Frequência cardíaca",
          type: "number",
          required: false,
          unit: "bpm",
        },
        {
          id: "peso",
          label: "Peso",
          type: "number",
          required: false,
          unit: "kg",
          step: 0.1,
        },
        {
          id: "exame",
          label: "Achados do exame",
          type: "textarea",
          required: false,
        },
      ],
    },
    {
      id: "conduta",
      title: "Avaliação e conduta",
      fields: [
        {
          id: "hipotese",
          label: "Hipótese diagnóstica",
          type: "textarea",
          required: false,
        },
        { id: "plano", label: "Conduta", type: "textarea", required: false },
        {
          id: "retorno",
          label: "Retorno",
          type: "select",
          required: false,
          options: [
            { id: "r7", label: "7 dias" },
            { id: "r15", label: "15 dias" },
            { id: "r30", label: "30 dias" },
            { id: "r90", label: "90 dias" },
          ],
        },
      ],
    },
  ],
};
const psiSchema = {
  schemaVersion: 2,
  sections: [
    {
      id: "sessao",
      title: "Sessão",
      fields: [
        { id: "tema", label: "Tema principal", type: "text", required: false },
        { id: "evolucao", label: "Evolução", type: "textarea", required: true },
        {
          id: "humor",
          label: "Humor relatado",
          type: "select",
          required: false,
          options: [
            { id: "estavel", label: "Estável" },
            { id: "ansioso", label: "Ansioso" },
            { id: "deprimido", label: "Rebaixado" },
          ],
        },
      ],
    },
  ],
};
db.clinical_templates = [
  {
    id: uuid(),
    organization_id: ORG,
    specialty_id: null,
    name: "Consulta clínica (SOAP)",
    description: "Modelo padrão para consultas médicas",
    status: "published",
    is_default: true,
  },
  {
    id: uuid(),
    organization_id: ORG,
    specialty_id: specialties[3].id,
    name: "Sessão de psicoterapia",
    description: "Registro de evolução por sessão",
    status: "published",
    is_default: false,
  },
  {
    id: uuid(),
    organization_id: ORG,
    specialty_id: specialties[2].id,
    name: "Puericultura",
    description: "Rascunho em revisão",
    status: "draft",
    is_default: false,
  },
];
db.clinical_template_versions = [
  {
    id: uuid(),
    organization_id: ORG,
    template_id: db.clinical_templates[0].id,
    version_number: 3,
    schema: soapSchema,
    published_at: "2026-08-01T12:00:00Z",
  },
  {
    id: uuid(),
    organization_id: ORG,
    template_id: db.clinical_templates[1].id,
    version_number: 1,
    schema: psiSchema,
    published_at: "2026-07-10T12:00:00Z",
  },
  {
    id: uuid(),
    organization_id: ORG,
    template_id: db.clinical_templates[2].id,
    version_number: 1,
    schema: soapSchema,
    published_at: null,
  },
];
db.clinical_document_templates = [
  ["prescription", "Receita simples", "Prescrição de uso comum"],
  [
    "exam_request",
    "Pedido de exames",
    "Solicitação de exames laboratoriais e de imagem",
  ],
  ["medical_certificate", "Atestado médico", "Afastamento por dias"],
  [
    "attendance_declaration",
    "Declaração de comparecimento",
    "Comprovante de presença",
  ],
].map(([document_type, name, description]) => ({
  id: uuid(),
  organization_id: ORG,
  document_type,
  name,
  description,
  active: true,
}));
db.clinical_document_template_versions = db.clinical_document_templates.map(
  (t) => ({
    id: uuid(),
    organization_id: ORG,
    template_id: t.id,
    version_number: 1,
    title_template: t.name,
    body_template:
      t.document_type === "prescription"
        ? "Uso oral:\n1. {{medicamento}}"
        : "Atesto para os devidos fins que {{paciente_nome}} esteve em atendimento nesta data.",
    layout_schema: {},
    published_at: "2026-07-01T12:00:00Z",
  }),
);

// agenda, atendimentos e financeiro
db.appointments = [];
db.encounters = [];
db.encounter_entries = [];
db.encounter_diagnoses = [];
db.encounter_addenda = [];
db.clinical_documents = [];
db.accounts_receivable = [];
db.payments = [];
db.appointment_status_events = [];
const cids = [
  ["I10", "Hipertensão essencial (primária)"],
  ["E11.9", "Diabetes mellitus tipo 2 sem complicações"],
  ["J06.9", "Infecção aguda das vias aéreas superiores"],
  ["F41.1", "Ansiedade generalizada"],
  ["L70.0", "Acne vulgar"],
  ["R07.4", "Dor torácica não especificada"],
  ["Z00.0", "Exame médico geral"],
  ["J45.9", "Asma não especificada"],
];
const queixas = [
  "Dor no peito ao esforço há 2 semanas",
  "Retorno com exames laboratoriais",
  "Tosse e coriza há 4 dias",
  "Ansiedade e insônia",
  "Manchas no rosto",
  "Palpitações esporádicas",
  "Check-up anual",
  "Febre e dor de garganta",
];
function statusFor(start, end) {
  if (end.getTime() < NOW.getTime()) {
    const r = rnd();
    return r < 0.8 ? "attended" : r < 0.9 ? "cancelled" : "no_show";
  }
  if (start.getTime() <= NOW.getTime()) return "in_progress";
  const diffH = (start.getTime() - NOW.getTime()) / 3600e3;
  if (diffH < 1.2 && localDateKey(start) === localDateKey(NOW))
    return chance(0.6) ? "waiting" : "confirmed";
  if (diffH < 48)
    return chance(0.55)
      ? "confirmed"
      : chance(0.08)
        ? "cancelled"
        : "scheduled";
  return chance(0.06) ? "cancelled" : "scheduled";
}
const patientIds = db.patients.map((p) => p.id);
const recentPatientsByProf = db.professionals.map(() => []);
for (let delta = -35; delta <= 18; delta++) {
  const day = addDaysLocal(today.y, today.m, today.d, delta);
  if (day.wd === 0 || day.wd === 6) continue;
  db.professionals.forEach((prof, pi) => {
    if (pi === 3 && day.wd === 3) return;
    const schedule = db.schedules[pi];
    for (const [h0, h1] of [
      [8, 12],
      [13.5, 18],
    ]) {
      let t = h0 * 60;
      while (t < h1 * 60 - 20) {
        const proc = pick(procsByProf[pi]);
        const dur = proc.duration_minutes;
        if (
          chance(
            delta < 0
              ? 0.72
              : delta === 0
                ? 0.85
                : Math.max(0.15, 0.7 - delta * 0.04),
          )
        ) {
          const start = utcFromLocal(
            day.y,
            day.m,
            day.d,
            Math.floor(t / 60),
            t % 60,
          );
          const end = new Date(start.getTime() + dur * 60e3);
          let status = statusFor(start, end);
          if (
            status === "in_progress" &&
            db.appointments.some(
              (a) =>
                a.professional_id === prof.id && a.status === "in_progress",
            )
          )
            status = "attended";
          let patient = pick(patientIds);
          if (pi === 2) {
            const kids = db.patients.filter(
              (p) => Number(p.birth_date.slice(0, 4)) >= 2014,
            );
            patient = pick(kids).id;
          }
          if (chance(0.3) && recentPatientsByProf[pi].length)
            patient = pick(recentPatientsByProf[pi]);
          recentPatientsByProf[pi].push(patient);
          const ins = chance(0.35) ? pick(db.health_insurances) : null;
          const listPrice = ins
            ? (
                db.price_table_items.find(
                  (x) =>
                    x.procedure_id === proc.id &&
                    db.price_tables.find((pt) => pt.id === x.price_table_id)
                      .health_insurance_id === ins.id,
                ) || { price: proc.base_price }
              ).price
            : proc.base_price;
          const appt = {
            id: uuid(),
            organization_id: ORG,
            patient_id: patient,
            professional_id: prof.id,
            procedure_id: proc.id,
            schedule_id: schedule.id,
            unit_id: schedule.unit_id,
            room_id: db.rooms[Math.min(pi, 3)].id,
            health_insurance_id: ins ? ins.id : null,
            payment_method_id:
              status === "attended"
                ? ins
                  ? db.payment_methods[4].id
                  : pick(db.payment_methods.slice(0, 4)).id
                : null,
            status,
            start_at: iso(start),
            end_at: iso(end),
            notes: chance(0.12)
              ? pick([
                  "Paciente pediu horário no fim do dia",
                  "Trazer exames anteriores",
                  "Primeira consulta",
                ])
              : null,
            is_extra: chance(0.03),
            price: listPrice,
            list_price: listPrice,
            price_note: null,
            created_at: iso(new Date(start.getTime() - int(1, 25) * 86400e3)),
            cancelled_at:
              status === "cancelled"
                ? iso(new Date(start.getTime() - int(1, 48) * 3600e3))
                : null,
            cancellation_reason:
              status === "cancelled" ? "Cancelado pela agenda" : null,
          };
          db.appointments.push(appt);
          if (
            (["attended", "in_progress"].includes(status) && pi !== 3) ||
            (pi === 3 && ["attended", "in_progress"].includes(status))
          ) {
            const tv =
              pi === 3
                ? db.clinical_template_versions[1]
                : db.clinical_template_versions[0];
            const tpl =
              pi === 3 ? db.clinical_templates[1] : db.clinical_templates[0];
            const enc = {
              id: uuid(),
              organization_id: ORG,
              patient_id: patient,
              professional_id: prof.id,
              appointment_id: appt.id,
              status: status === "attended" ? "finalized" : "draft",
              started_at: appt.start_at,
              finalized_at: status === "attended" ? appt.end_at : null,
              template_version_id: tv.id,
              created_at: appt.start_at,
              updated_at: appt.end_at,
            };
            db.encounters.push(enc);
            const [cid, cidDesc] = pi === 3 ? cids[3] : pick(cids);
            const sd =
              pi === 3
                ? {
                    tema: pick([
                      "Relações no trabalho",
                      "Luto",
                      "Autoestima",
                      "Rotina de sono",
                    ]),
                    evolucao:
                      "Paciente relata melhora parcial da ansiedade. Trabalhadas estratégias de respiração e registro de pensamentos.",
                    humor: pick(["estavel", "ansioso"]),
                  }
                : {
                    queixa: pick(queixas),
                    hda: "Sintomas iniciados há cerca de duas semanas, sem fatores desencadeantes claros.",
                    pa: `${int(110, 150)}/${int(70, 95)}`,
                    fc: int(62, 98),
                    peso: int(52, 98) + 0.5,
                    exame:
                      "Bom estado geral, corado, hidratado. Ausculta sem alterações.",
                    hipotese: cidDesc,
                    plano:
                      "Orientações gerais. Solicitados exames complementares.",
                    retorno: pick(["r15", "r30", "r90"]),
                  };
            db.encounter_entries.push({
              id: uuid(),
              organization_id: ORG,
              encounter_id: enc.id,
              template_snapshot: {
                template_id: tpl.id,
                name: tpl.name,
                version_number: tv.version_number,
                schema: tv.schema,
              },
              structured_data:
                status === "attended"
                  ? sd
                  : pi === 3
                    ? { evolucao: sd.evolucao }
                    : { queixa: sd.queixa },
              free_notes:
                status === "attended"
                  ? "Paciente orientado sobre sinais de alerta."
                  : "",
              updated_at: appt.end_at,
            });
            if (status === "attended") {
              db.encounter_diagnoses.push({
                id: uuid(),
                organization_id: ORG,
                encounter_id: enc.id,
                cid_code: cid,
                description: cidDesc,
                is_primary: true,
              });
              if (chance(0.3)) {
                const type = pick([
                  "prescription",
                  "medical_certificate",
                  "exam_request",
                ]);
                db.clinical_documents.push({
                  id: uuid(),
                  organization_id: ORG,
                  encounter_id: enc.id,
                  patient_id: patient,
                  professional_id: prof.id,
                  document_type: type,
                  title: {
                    prescription: "Receita",
                    medical_certificate: "Atestado médico",
                    exam_request: "Pedido de exames",
                  }[type],
                  body:
                    type === "prescription"
                      ? "Uso oral:\n1. Losartana 50 mg — 1 comprimido ao dia, pela manhã.\n2. Omeprazol 20 mg — 1 cápsula em jejum por 30 dias."
                      : type === "exam_request"
                        ? "Hemograma completo\nGlicemia de jejum\nPerfil lipídico\nTSH e T4 livre"
                        : "Atesto que o(a) paciente esteve em consulta nesta data, necessitando de 1 dia de afastamento.",
                  metadata: { template: { layout_schema: {} }, render: {} },
                  issued_at: appt.end_at,
                });
              }
            }
          }
          if (status === "attended") {
            const paid = delta < -1 ? chance(0.88) : chance(0.6);
            const ar = {
              id: uuid(),
              organization_id: ORG,
              patient_id: patient,
              professional_id: prof.id,
              procedure_id: proc.id,
              health_insurance_id: appt.health_insurance_id,
              appointment_id: appt.id,
              category_id:
                db.financial_categories[proc.code === "ECG-01" ? 1 : 0].id,
              description: `${proc.name} — ${db.patients.find((p) => p.id === patient).full_name}`,
              amount: listPrice,
              paid_amount: paid ? listPrice : 0,
              due_date: localDateKey(start),
              status: listPrice === 0 ? "paid" : paid ? "paid" : "open",
              created_at: appt.end_at,
            };
            db.accounts_receivable.push(ar);
            if (paid && listPrice > 0)
              db.payments.push({
                id: uuid(),
                organization_id: ORG,
                account_receivable_id: ar.id,
                payment_method_id: appt.payment_method_id,
                amount: listPrice,
                paid_at: appt.end_at,
                notes: null,
              });
          }
        }
        t += dur + (chance(0.25) ? 10 : 0);
      }
    }
  });
}
db.schedule_blocks = [
  {
    id: uuid(),
    organization_id: ORG,
    schedule_id: db.schedules[1].id,
    start_at: iso(utcFromLocal(today.y, today.m, today.d, 16, 0)),
    end_at: iso(utcFromLocal(today.y, today.m, today.d, 18, 0)),
    reason: "Congresso médico",
  },
];
db.accounts_payable = [];
for (let mo = -2; mo <= 1; mo++) {
  const base = addDaysLocal(today.y, today.m, 1, 0);
  const month = ((base.m - 1 + mo + 12) % 12) + 1;
  const year = base.y + Math.floor((base.m - 1 + mo) / 12);
  [
    ["Aluguel — sala Paulista", "Imobiliária Central", 9800, 5, 5],
    ["Energia elétrica", "Enel", 1240, 12, 5],
    ["Internet e telefonia", "Vivo Empresas", 389, 15, 5],
    ["Folha de pagamento", "Equipe administrativa", 18450, 5, 6],
    ["Materiais médicos", "Cirúrgica Paulista", int(1800, 3200), 20, 4],
    ["Campanha Instagram", "Meta Ads", 1500, 25, 7],
    ["Contabilidade", "Escritório Fiscal SP", 1350, 10, 5],
  ].forEach(([description, vendor_name, amount, dueDay, cat]) => {
    const due = `${year}-${String(month).padStart(2, "0")}-${String(dueDay).padStart(2, "0")}`;
    const isPast = due < localDateKey(NOW);
    db.accounts_payable.push({
      id: uuid(),
      organization_id: ORG,
      category_id: db.financial_categories[cat].id,
      vendor_name,
      description,
      amount,
      due_date: due,
      status: isPast ? (chance(0.9) ? "paid" : "open") : "open",
      paid_at: isPast ? `${due}T15:00:00Z` : null,
      payment_method_id: db.payment_methods[0].id,
      created_at: `${due}T12:00:00Z`,
    });
  });
}
db.professional_payouts = db.professionals.map((p) => ({
  id: uuid(),
  organization_id: ORG,
  professional_id: p.id,
  amount: int(6000, 21000),
  due_date: `${today.y}-${String(today.m).padStart(2, "0")}-10`,
  status: chance(0.5) ? "paid" : "pending",
}));

// WhatsApp
db.whatsapp_instances = [
  {
    id: uuid(),
    organization_id: ORG,
    evolution_instance_name: "clinica-aurora",
    evolution_api_url: "https://evolution.example",
    api_key_encrypted: encryptCredential("mock-api-key"),
    webhook_secret_encrypted: encryptCredential("mock-webhook-secret"),
    webhook_url: null,
    status: "connected",
    phone_number: "5511933224455",
    display_name: "Clínica Aurora",
    profile_picture_url: null,
  },
];
db.platform_integration_settings = [];
db.whatsapp_contacts = [];
db.whatsapp_conversations = [];
db.whatsapp_messages = [];
db.conversation_tags = [];
db.whatsapp_attendance_sessions = [];
db.whatsapp_attendance_events = [];
const convoScripts = [
  [
    ["in", "Bom dia! Gostaria de marcar uma consulta com a cardiologista"],
    [
      "out",
      "Bom dia! Temos horários na terça às 9h ou na quinta às 14h. Qual prefere?",
    ],
    ["in", "Quinta às 14h está ótimo"],
    [
      "out",
      "Perfeito, agendado para quinta às 14h com a Dra. Helena. Vou enviar a confirmação no dia anterior.",
    ],
    ["in", "Obrigada!"],
  ],
  [
    ["in", "Oi, preciso remarcar minha consulta de amanhã"],
    ["in", "Surgiu um imprevisto no trabalho"],
    ["out", "Sem problemas! Posso oferecer segunda às 10h30 ou às 16h."],
  ],
  [
    ["in", "Vocês aceitam Bradesco Saúde?"],
    ["out", "Aceitamos sim! Para qual especialidade?"],
    ["in", "Dermatologia"],
  ],
  [["in", "Boa tarde, o resultado do meu exame já saiu?"]],
  [
    ["in", "Qual o valor da consulta particular com o pediatra?"],
    [
      "out",
      "A consulta pediátrica particular custa R$ 340,00. Aceitamos Pix e cartão.",
    ],
    ["in", "Tem horário essa semana?"],
  ],
  [
    [
      "out",
      "Olá! Lembrete: sua consulta é amanhã às 9h com o Dr. Rafael. Responda 1 para confirmar.",
    ],
    ["in", "1"],
    ["out", "Confirmado, obrigado!"],
  ],
  [
    ["in", "Preciso de um atestado da consulta de ontem"],
    ["out", "Vou verificar com o médico e já te retorno."],
  ],
  [
    ["in", "Oi"],
    ["in", "Vocês atendem sábado?"],
  ],
  [
    ["in", "Quero agendar terapia para minha filha de 15 anos"],
    [
      "out",
      "Claro! O psicólogo Lucas atende adolescentes. Posso te passar os horários?",
    ],
    ["in", "Pode sim"],
  ],
  [
    [
      "out",
      "Olá! Como foi seu atendimento hoje? De 0 a 10, o quanto recomendaria a clínica?",
    ],
    ["in", "10! Atendimento excelente"],
  ],
  [
    ["in", "Bom dia, a doutora pediu para eu mandar a foto do exame"],
    ["in", "[imagem]"],
  ],
  [["in", "Esqueci minha receita, consegue mandar por aqui?"]],
];
const convPatients = db.patients.slice(5, 5 + convoScripts.length);
convoScripts.forEach((script, i) => {
  const patient = convPatients[i];
  const contact = {
    id: uuid(),
    organization_id: ORG,
    phone: `55${patient.phone}`,
    wa_name:
      i === 7 ? "Rô 🌻" : patient.full_name.split(" ").slice(0, 2).join(" "),
    patient_id: i === 7 ? null : patient.id,
    photo_path: null,
    photo_checked_at: null,
    created_at: iso(new Date(NOW.getTime() - 20 * 86400e3)),
    updated_at: iso(NOW),
  };
  db.whatsapp_contacts.push(contact);
  const lastAt = new Date(NOW.getTime() - (i * 37 + int(1, 20)) * 60e3);
  const status = i < 4 ? "pending" : i < 9 ? "open" : "resolved";
  const conv = {
    id: uuid(),
    organization_id: ORG,
    contact_id: contact.id,
    phone: contact.phone,
    wa_name: contact.wa_name,
    patient_id: contact.patient_id,
    status,
    assigned_user_id:
      status === "open" ? (i % 2 ? ME : db.app_users[6].id) : null,
    unread_count: status === "pending" ? int(1, 3) : 0,
    last_message_at: iso(lastAt),
    last_message_preview: script[script.length - 1][1],
    created_at: iso(new Date(lastAt.getTime() - 3600e3)),
  };
  db.whatsapp_conversations.push(conv);
  script.forEach(([dir, body], k) => {
    const at = new Date(
      lastAt.getTime() - (script.length - 1 - k) * int(2, 9) * 60e3,
    );
    db.whatsapp_messages.push({
      id: uuid(),
      organization_id: ORG,
      conversation_id: conv.id,
      wa_message_id: `mock-${i}-${k}`,
      direction: dir === "in" ? "inbound" : "outbound",
      message_type: body === "[imagem]" ? "image" : "text",
      body: body === "[imagem]" ? null : body,
      media_url: null,
      media_mime_type: body === "[imagem]" ? "image/jpeg" : null,
      status: dir === "in" ? "received" : "read",
      created_at: iso(at),
      sent_at: iso(at),
    });
  });
  if (i % 3 === 0)
    db.conversation_tags.push({
      id: uuid(),
      organization_id: ORG,
      conversation_id: conv.id,
      tag_id: db.tags[i % db.tags.length].id,
    });
  db.whatsapp_attendance_sessions.push({
    id: uuid(),
    organization_id: ORG,
    conversation_id: conv.id,
    ended_at: status === "resolved" ? iso(lastAt) : null,
  });
});

// agendamento online, fila de espera, auditoria, acessos
db.online_booking_settings = [
  {
    id: uuid(),
    organization_id: ORG,
    public_slug: "clinica-aurora",
    enabled: true,
    min_notice_hours: 2,
    max_days_ahead: 30,
    cancellation_notice_hours: 24,
    max_requests_per_contact_day: 3,
    max_no_shows_180_days: 2,
    require_contact_verification: true,
    contact_verification_ttl_minutes: 10,
    public_instructions:
      "Chegue com 15 minutos de antecedência e traga documento com foto e carteirinha do convênio.",
    cancellation_policy:
      "Cancelamentos com até 24 horas de antecedência, pelo link de acompanhamento.",
    profile_headline: "Cuidado completo para toda a família",
    profile_summary:
      "Cardiologia, clínica geral, pediatria, psicologia e dermatologia em duas unidades em São Paulo.",
    experience_text: "Desde 2012",
    education_count: 5,
    accepted_plan_count: 4,
    excellence_badge_year: 2026,
    treated_conditions: [
      "Hipertensão",
      "Diabetes",
      "Ansiedade",
      "Acne",
      "Asma infantil",
    ],
    patient_groups: ["Adultos", "Crianças", "Adolescentes", "Idosos"],
    consultation_formats: ["Presencial", "Teleconsulta"],
    profile_highlights: [
      "Estacionamento conveniado",
      "Acessibilidade",
      "Resultado de exames pelo WhatsApp",
    ],
    accepted_health_insurance_ids: db.health_insurances.map((h) => h.id),
    accepted_payment_method_ids: db.payment_methods
      .slice(0, 3)
      .map((p) => p.id),
    accepted_plan_notes: "Consulte a cobertura do seu plano.",
  },
];
db.schedule_online_booking_settings = db.schedules.map((s) => ({
  id: uuid(),
  organization_id: ORG,
  schedule_id: s.id,
  enabled: true,
  min_notice_hours: 2,
  max_days_ahead: 30,
  cancellation_notice_hours: 24,
}));
db.schedule_online_booking_procedures = [];
db.schedules.forEach((s, i) =>
  procsByProf[i].forEach((p) =>
    db.schedule_online_booking_procedures.push({
      id: uuid(),
      organization_id: ORG,
      schedule_id: s.id,
      procedure_id: p.id,
    }),
  ),
);
db.online_booking_reviews = [
  {
    id: uuid(),
    organization_id: ORG,
    patient_display_name: "Fernanda M.",
    rating: 5,
    title: "Atendimento impecável",
    body: "A Dra. Helena explicou tudo com calma e a recepção foi muito atenciosa.",
    tags: ["Pontualidade", "Atenção"],
    source_label: "Google",
    verified: true,
    highlighted: true,
    active: true,
    review_date: "2026-10-12",
    professional_response: null,
  },
  {
    id: uuid(),
    organization_id: ORG,
    patient_display_name: "Ricardo S.",
    rating: 4,
    title: "Muito bom",
    body: "Fui atendido no horário. Só a espera do estacionamento que demorou.",
    tags: ["Estrutura"],
    source_label: "Google",
    verified: true,
    highlighted: false,
    active: true,
    review_date: "2026-09-28",
    professional_response:
      "Obrigado, Ricardo! Já estamos ajustando o estacionamento.",
  },
];
db.online_booking_requests = [0, 1, 2].map((k) => {
  const pi = [0, 2, 4][k];
  const proc = procsByProf[pi][0];
  const s = db.schedules[pi];
  const st = utcFromLocal(
    ...Object.values(addDaysLocal(today.y, today.m, today.d, k + 1)).slice(
      0,
      3,
    ),
    10 + k,
    0,
  );
  return {
    id: uuid(),
    organization_id: ORG,
    schedule_id: s.id,
    procedure_id: proc.id,
    professional_id: db.professionals[pi].id,
    unit_id: s.unit_id,
    health_insurance_id: k === 1 ? db.health_insurances[0].id : null,
    requested_start_at: iso(st),
    requested_end_at: iso(
      new Date(st.getTime() + proc.duration_minutes * 60e3),
    ),
    patient_name: ["Roberta Farias", "Thiago Menezes", "Aline Prates"][k],
    patient_email: [
      "roberta.farias@email.example",
      null,
      "aline.prates@email.example",
    ][k],
    patient_phone: ["11991234567", "11992345678", "11993456789"][k],
    patient_notes: [
      "Primeira consulta, tenho exames recentes",
      null,
      "Prefiro horário pela manhã",
    ][k],
    status: "requested",
    public_access_token: uuid(),
    appointment_id: null,
    created_at: iso(new Date(NOW.getTime() - (k + 1) * 3 * 3600e3)),
  };
});
db.waitlist_entries = [0, 1, 2, 3].map((k) => ({
  id: uuid(),
  organization_id: ORG,
  patient_id: db.patients[40 + k].id,
  procedure_id: procsByProf[k][0].id,
  professional_id: db.professionals[k].id,
  preferred_period: ["morning", "afternoon", "any", "morning"][k],
  status: k === 3 ? "contacted" : "waiting",
  notes: k === 0 ? "Pode vir com 1 hora de aviso" : null,
  created_at: iso(new Date(NOW.getTime() - (k + 2) * 86400e3)),
}));
db.audit_logs = Array.from({ length: 30 }, (_, k) => ({
  id: uuid(),
  organization_id: ORG,
  actor_user_id: pick(db.app_users).id,
  action: pick([
    "appointment.created",
    "appointment.status_changed",
    "patient.updated",
    "encounter.finalized",
    "payment.received",
    "user.profile_changed",
  ]),
  resource_type: pick(["appointment", "patient", "encounter", "payment"]),
  resource_id: uuid(),
  metadata: { from: "scheduled", to: "confirmed" },
  created_at: iso(new Date(NOW.getTime() - k * 2.3 * 3600e3)),
}));
db.automation_rules = [
  {
    id: uuid(),
    organization_id: ORG,
    name: "Marcar primeira consulta",
    event_type: "patient.created",
    conditions: {},
    action_type: "add_tag",
    action_config: { tag_id: db.tags[0].id, trigger_type: "new_patient" },
    active: true,
    created_at: "2026-08-01T12:00:00Z",
  },
];
db.message_templates = [];
db.notification_outbox = [];
db.communication_opt_outs = [];
db.impersonation_sessions = [];
db.automation_rules.push({
  id: uuid(),
  organization_id: ORG,
  name: "Lembrete de consulta por WhatsApp",
  event_type: "appointment.reminder_due",
  conditions: {},
  action_type: "send_message",
  action_config: { hours_before: 24 },
  active: true,
  created_at: "2026-08-01T12:00:00Z",
});
db.app_events = db.app_events || [];
// Lembretes de exemplo (Raio-X A7): parte dos agendados de hoje e amanhã.
{
  const nowIso = new Date().toISOString();
  const soon = db.appointments
    .filter(
      (a) =>
        a.status === "scheduled" &&
        a.start_at > nowIso &&
        a.start_at < new Date(Date.now() + 2 * 864e5).toISOString(),
    )
    .slice(0, 9);
  soon.forEach((a, i) => {
    const ev = {
      id: uuid(),
      organization_id: ORG,
      event_type: "appointment.reminder_due",
      aggregate_type: "appointment",
      aggregate_id: a.id,
      actor_user_id: null,
      payload: {},
      occurred_at: new Date(Date.now() - 3 * 36e5).toISOString(),
      created_at: nowIso,
    };
    db.app_events.push(ev);
    const status = i % 3 === 0 ? "queued" : i % 3 === 1 ? "sent" : "failed";
    db.notification_outbox.push({
      id: uuid(),
      organization_id: ORG,
      event_id: ev.id,
      template_id: null,
      channel: "whatsapp",
      recipient: "5511999990000",
      subject: null,
      body: "Lembrete",
      status,
      scheduled_at: ev.occurred_at,
      sent_at:
        status === "sent"
          ? new Date(Date.now() - 2 * 36e5).toISOString()
          : null,
      attempts: 1,
      max_attempts: 5,
      error_message: status === "failed" ? "Número inválido" : null,
      metadata: {},
      created_at: ev.occurred_at,
      updated_at: ev.occurred_at,
    });
  });
}

const PERMS = [
  "agenda.ver",
  "agenda.criar_agendamento",
  "agenda.editar_agendamento",
  "agenda.cancelar_agendamento",
  "agenda.encaixar",
  "agenda.bloquear_horario",
  "agenda.configurar",
  "paciente.ver",
  "paciente.criar",
  "paciente.editar",
  "paciente.excluir",
  "paciente.exportar",
  "paciente.ver_dados_sensiveis",
  "clinico.ver_prontuario",
  "clinico.ver_prontuario_proprios",
  "clinico.preencher_prontuario",
  "clinico.finalizar_prontuario",
  "clinico.adicionar_adendo",
  "clinico.prescrever",
  "clinico.solicitar_exame",
  "clinico.emitir_atestado",
  "clinico.criar_template",
  "financeiro.ver_geral",
  "financeiro.ver_proprio_repasse",
  "financeiro.receber_pagamento",
  "financeiro.gerenciar_contas_pagar",
  "financeiro.conciliar",
  "financeiro.emitir_nf",
  "financeiro.tiss",
  "crescimento.ver_campanhas",
  "crescimento.criar_campanha",
  "crescimento.disparar_campanha",
  "automacao.ver",
  "automacao.criar",
  "automacao.ativar",
  "relatorio.operacional",
  "relatorio.financeiro",
  "relatorio.clinico",
  "relatorio.exportar",
  "config.geral",
  "config.usuarios",
  "config.integracoes",
  "config.plano",
  "atendimento.ver",
  "atendimento.atender",
  "atendimento.configurar",
  "funil.ver",
  "funil.gerenciar",
  "funil.configurar",
];
const cat = (code) =>
  ({
    agenda: "Agenda",
    paciente: "Pacientes",
    clinico: "Clinico",
    financeiro: "Financeiro",
    crescimento: "Crescimento",
    automacao: "Automacao",
    relatorio: "Relatorios",
    config: "Configuracoes",
    atendimento: "Atendimento",
    funil: "Funis",
  })[code.split(".")[0]];
db.permissions = PERMS.map((code) => ({
  id: uuid(),
  code,
  category: cat(code),
  description: code.replace(".", " · ").replace(/_/g, " "),
}));
db.profiles = [
  ["Administrador", "Acesso total à clínica"],
  ["Médico", "Agenda própria e prontuário"],
  ["Recepção", "Agenda, pacientes e WhatsApp"],
  ["Financeiro", "Contas, caixa e relatórios"],
].map(([name, description], i) => ({
  id: uuid(),
  organization_id: ORG,
  name,
  description,
  is_system_default: true,
}));
db.profile_permissions = [];
db.profiles.forEach((pr, i) =>
  db.permissions.forEach((pe) => {
    if (
      i === 0 ||
      (i === 1 && /^(agenda\.ver|clinico|paciente\.ver)/.test(pe.code)) ||
      (i === 2 && /^(agenda|paciente|atendimento)/.test(pe.code)) ||
      (i === 3 && /^(financeiro|relatorio\.financeiro)/.test(pe.code))
    )
      db.profile_permissions.push({ profile_id: pr.id, permission_id: pe.id });
  }),
);
db.user_profiles = db.app_users.map((u, i) => ({
  id: uuid(),
  user_id: u.id,
  profile_id: db.profiles[i === 0 ? 0 : i <= 5 ? 1 : 2].id,
}));
db.user_permission_overrides = [];
db.resource_scopes = [];
db.patient_diagnoses = [];
db.encounter_attachments = [];

// ---------- tabelas do PR #1 (polish/telas-e-pendencias) ----------
db.platform_settings[0].logo_full_url = null;
db.app_users.forEach((u) => {
  u.avatar_path = null;
});
db.patients.forEach((p, i) => {
  p.general_notes =
    i % 6 === 0
      ? "Prefere horários pela manhã. Acompanhante costuma vir junto."
      : null;
  p.health_insurance_card = p.health_insurance_id
    ? String(int(100000000, 999999999))
    : null;
  p.patient_auto_link_disabled = false;
});
db.cid10_codes = [
  ["I10", "Hipertensão essencial (primária)"],
  ["E11.9", "Diabetes mellitus não-insulino-dependente sem complicações"],
  ["J06.9", "Infecção aguda das vias aéreas superiores não especificada"],
  ["F41.1", "Ansiedade generalizada"],
  ["L70.0", "Acne vulgar"],
  ["R07.4", "Dor torácica não especificada"],
  ["Z00.0", "Exame médico geral"],
  ["J45.9", "Asma não especificada"],
  ["R00.2", "Palpitações"],
  ["E78.5", "Hiperlipidemia não especificada"],
  ["K21.9", "Doença de refluxo gastroesofágico sem esofagite"],
  ["M54.5", "Dor lombar baixa"],
].map(([code, description]) => ({
  code,
  code_key: code.replace(".", "").toLowerCase(),
  category: code.slice(0, 3),
  description,
  is_category: !code.includes("."),
  search_text: description.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase(),
}));
db.patient_diagnoses = [];
db.encounter_diagnoses.forEach((d) => {
  const enc = db.encounters.find((e) => e.id === d.encounter_id);
  if (
    !enc ||
    db.patient_diagnoses.some(
      (x) => x.patient_id === enc.patient_id && x.cid_code === d.cid_code,
    )
  )
    return;
  if (
    db.patient_diagnoses.filter((x) => x.patient_id === enc.patient_id)
      .length >= 2
  )
    return;
  db.patient_diagnoses.push({
    id: uuid(),
    organization_id: ORG,
    patient_id: enc.patient_id,
    cid_code: d.cid_code,
    description: d.description,
    is_primary: !db.patient_diagnoses.some(
      (x) => x.patient_id === enc.patient_id,
    ),
    created_by: ME,
    created_at: enc.finalized_at,
    updated_at: enc.finalized_at,
    removed_at: null,
    removed_by: null,
  });
});
db.encounter_attachments = db.encounters
  .filter((e) => e.status === "finalized")
  .slice(0, 40)
  .map((e, i) => ({
    id: uuid(),
    organization_id: ORG,
    encounter_id: e.id,
    patient_id: e.patient_id,
    storage_path: `mock/${e.id}/exame-${i}.pdf`,
    file_name: pick([
      "hemograma.pdf",
      "eletrocardiograma.pdf",
      "laudo-ecocardiograma.pdf",
      "foto-lesao.jpg",
    ]),
    content_type: "application/pdf",
    size_bytes: int(80000, 900000),
    category: "exam",
    created_at: e.finalized_at,
    uploaded_by: ME,
  }));
db.clinical_document_consent_events = [];

// ---------- relações (embed) ----------
const FK = {
  app_events: "event_id",
  financial_categories: "category_id",
  clinical_documents: "document_id",
  organizations: "organization_id",
  patients: "patient_id",
  professionals: "professional_id",
  procedures: "procedure_id",
  health_insurances: "health_insurance_id",
  units: "unit_id",
  rooms: "room_id",
  payment_methods: "payment_method_id",
  accounts_receivable: "account_receivable_id",
  price_tables: "price_table_id",
  profiles: "profile_id",
  specialties: "specialty_id",
  schedules: "schedule_id",
  app_users: "user_id",
  tags: "tag_id",
  whatsapp_contacts: "contact_id",
  whatsapp_conversations: "conversation_id",
  encounters: "encounter_id",
  appointments: "appointment_id",
  clinical_templates: "template_id",
};
function splitTop(s, sep = ",") {
  const out = [];
  let depth = 0,
    cur = "",
    q = false;
  for (const ch of s) {
    if (ch === '"') q = !q;
    if (!q && ch === "(") depth++;
    if (!q && ch === ")") depth--;
    if (!q && depth === 0 && ch === sep) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  if (cur.trim()) out.push(cur);
  return out.map((x) => x.trim()).filter(Boolean);
}
function parseSelect(sel) {
  return splitTop(sel || "*").map((tok) => {
    const m = tok.match(
      /^(?:([a-zA-Z0-9_]+):)?([a-zA-Z0-9_]+)(?:!([a-zA-Z0-9_]+))?\((.*)\)$/s,
    );
    if (m)
      return {
        kind: "embed",
        alias: m[1] || m[2],
        table: m[2],
        hint: m[3],
        inner: parseSelect(m[4]),
      };
    const c = tok.match(/^(?:([a-zA-Z0-9_]+):)?([a-zA-Z0-9_*]+)/);
    return {
      kind: "col",
      alias: (c && (c[1] || c[2])) || tok,
      name: c ? c[2] : tok,
    };
  });
}
function singular(table) {
  return FK[table] || `${table.replace(/ies$/, "y").replace(/s$/, "")}_id`;
}
function project(table, row, spec) {
  const out = {};
  for (const s of spec) {
    if (s.kind === "col") {
      if (s.name === "*") Object.assign(out, row);
      else out[s.alias] = row[s.name] === undefined ? null : row[s.name];
    } else {
      const rel = db[s.table] || [];
      const fk = singular(s.table);
      if (fk in row) {
        const hit = rel.find((r) => r.id === row[fk]);
        out[s.alias] = hit ? project(s.table, hit, s.inner) : null;
      } else {
        const back = singular(table);
        out[s.alias] = rel
          .filter((r) => r[back] === row.id)
          .map((r) => project(s.table, r, s.inner));
      }
    }
  }
  return out;
}
function parseValue(v) {
  return v.replace(/^"(.*)"$/, "$1");
}
function cmp(a, b) {
  if (a === null || a === undefined) return -1;
  if (b === null || b === undefined) return 1;
  const na = Number(a),
    nb = Number(b);
  if (!Number.isNaN(na) && !Number.isNaN(nb) && typeof a !== "string")
    return na - nb;
  return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;
}
function likeToRegex(p, flags) {
  return new RegExp(
    "^" +
      p
        .split("%")
        .map((x) =>
          x
            .split("*")
            .map((y) => y.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
            .join(".*"),
        )
        .join(".*") +
      "$",
    flags,
  );
}
function testCond(row, col, expr) {
  let neg = false;
  if (expr.startsWith("not.")) {
    neg = true;
    expr = expr.slice(4);
  }
  const dot = expr.indexOf(".");
  const op = expr.slice(0, dot);
  const raw = expr.slice(dot + 1);
  const v = row[col];
  let r = true;
  switch (op) {
    case "eq":
      r = String(v) === parseValue(raw);
      break;
    case "neq":
      r = String(v) !== parseValue(raw);
      break;
    case "gt":
      r = v !== null && v !== undefined && cmp(v, raw) > 0;
      break;
    case "gte":
      r = v !== null && v !== undefined && cmp(v, raw) >= 0;
      break;
    case "lt":
      r = v !== null && v !== undefined && cmp(v, raw) < 0;
      break;
    case "lte":
      r = v !== null && v !== undefined && cmp(v, raw) <= 0;
      break;
    case "is":
      r = raw === "null" ? v === null || v === undefined : String(v) === raw;
      break;
    case "in": {
      const list = splitTop(raw.replace(/^\(|\)$/g, "")).map(parseValue);
      r = list.includes(String(v));
      break;
    }
    case "like":
      r = v != null && likeToRegex(raw, "").test(String(v));
      break;
    case "ilike":
      r = v != null && likeToRegex(raw, "i").test(String(v));
      break;
    case "match":
      r = v != null && new RegExp(parseValue(raw)).test(String(v));
      break;
    case "imatch":
      r = v != null && new RegExp(parseValue(raw), "i").test(String(v));
      break;
    case "cs": {
      const want = raw
        .replace(/^\{|\}$/g, "")
        .split(",")
        .filter(Boolean);
      r = Array.isArray(v) && want.every((w) => v.includes(w));
      break;
    }
    default:
      r = true;
  }
  return neg ? !r : r;
}
function testOr(row, expr) {
  return splitTop(expr.replace(/^\(|\)$/g, "")).some((part) => {
    const i = part.indexOf(".");
    const col = part.slice(0, i);
    const rest = part.slice(i + 1);
    if (col === "and") return true;
    return testCond(row, col, rest);
  });
}
const RESERVED = new Set([
  "select",
  "order",
  "limit",
  "offset",
  "or",
  "and",
  "columns",
  "on_conflict",
]);
function queryTable(table, params, headers, method) {
  let rows = (db[table] || []).slice();
  for (const [key, val] of params) {
    if (RESERVED.has(key) || key.includes(".")) continue;
    rows = rows.filter((r) => testCond(r, key, val));
  }
  for (const o of params.getAll("or")) rows = rows.filter((r) => testOr(r, o));
  const order = params.get("order");
  if (order) {
    const keys = order.split(",").map((k) => {
      const [c, dir] = k.split(".");
      return [c, dir === "desc" ? -1 : 1];
    });
    rows.sort((a, b) => {
      for (const [c, d] of keys) {
        const x = cmp(a[c], b[c]);
        if (x) return x * d;
      }
      return 0;
    });
  }
  const total = rows.length;
  let offset = Number(params.get("offset") || 0);
  let limit = params.get("limit") != null ? Number(params.get("limit")) : null;
  const range = headers["range"];
  if (range) {
    const [a, b] = range.split("-").map(Number);
    offset = a;
    limit = b - a + 1;
  }
  if (offset) rows = rows.slice(offset);
  if (limit != null) rows = rows.slice(0, limit);
  const spec = parseSelect(params.get("select"));
  let data = rows.map((r) => project(table, r, spec));
  // !inner: descarta linhas cujo embed com hint inner veio nulo/vazio
  spec
    .filter((s) => s.kind === "embed" && s.hint === "inner")
    .forEach((s) => {
      data = data.filter(
        (d) => d[s.alias] && (!Array.isArray(d[s.alias]) || d[s.alias].length),
      );
    });
  return { data, total, offset };
}

// ---------- RPCs ----------
function sum(a) {
  return a.reduce((x, y) => x + Number(y || 0), 0);
}
function monthKey(d) {
  return localDateKey(d).slice(0, 7);
}
const RPC = {
  current_user_permission_codes: () => PERMS,
  user_permission_codes: () => PERMS,
  dashboard_company_aggregates: () => {
    throw new Error("mock: usar fallback");
  },
  send_appointment_reminders_for_day: (p) => {
    let count = 0;
    const nowIso = new Date().toISOString();
    db.appointments.forEach((a) => {
      if (
        a.status !== "scheduled" ||
        a.start_at <= nowIso ||
        localDateKey(a.start_at) !== p.p_date
      )
        return;
      if (
        db.app_events.some(
          (e) =>
            e.event_type === "appointment.reminder_due" &&
            e.aggregate_id === a.id,
        )
      )
        return;
      db.app_events.push({
        id: uuid(),
        organization_id: ORG,
        event_type: "appointment.reminder_due",
        aggregate_type: "appointment",
        aggregate_id: a.id,
        actor_user_id: null,
        payload: {},
        occurred_at: nowIso,
        created_at: nowIso,
      });
      count++;
    });
    return count;
  },
  agenda_day_counts: (p) => {
    const out = {};
    db.appointments.forEach((a) => {
      if (
        a.start_at >= p.p_start &&
        a.start_at < p.p_end &&
        a.status !== "cancelled"
      ) {
        const k = localDateKey(a.start_at);
        out[k] = (out[k] || 0) + 1;
      }
    });
    return out;
  },
  latest_patient_encounters: (p) =>
    (p.p_patient_ids || [])
      .map((pid) => {
        const enc = db.encounters
          .filter((e) => e.patient_id === pid)
          .sort((a, b) => cmp(b.started_at, a.started_at))[0];
        if (!enc) return null;
        const appt = db.appointments.find((a) => a.id === enc.appointment_id);
        return {
          id: enc.id,
          patient_id: pid,
          status: enc.status,
          started_at: enc.started_at,
          professional_name: (
            db.professionals.find((x) => x.id === enc.professional_id) || {}
          ).name,
          insurance_name:
            appt && appt.health_insurance_id
              ? db.health_insurances.find(
                  (h) => h.id === appt.health_insurance_id,
                ).name
              : null,
        };
      })
      .filter(Boolean),
  get_patient_communications: () => [],
  search_cid10: (p) => {
    const q = String(p.p_query || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();
    if (q.length < 2) return [];
    return db.cid10_codes
      .filter(
        (c) =>
          c.code_key.startsWith(q.replace(".", "")) ||
          q.split(/\s+/).every((w) => c.search_text.includes(w)),
      )
      .slice(0, Number(p.p_limit) || 20)
      .map((c) => ({
        code: c.code,
        description: c.description,
        is_category: c.is_category,
      }));
  },
  get_clinical_document_consent: () => null,
  list_patient_tags_with_usage: () =>
    db.tags.map((t) => ({
      ...t,
      usage_count: db.patient_tags.filter((pt) => pt.tag_id === t.id).length,
      patient_count: db.patient_tags.filter((pt) => pt.tag_id === t.id).length,
    })),
  get_operational_finance_summary: () => {
    const mk = monthKey(NOW);
    return [
      {
        open_receivable: sum(
          db.accounts_receivable
            .filter((r) => r.status === "open")
            .map((r) => r.amount - r.paid_amount),
        ),
        received_month: sum(
          db.payments
            .filter((p) => monthKey(p.paid_at) === mk)
            .map((p) => p.amount),
        ),
        open_payable: sum(
          db.accounts_payable
            .filter((p) => p.status === "open")
            .map((p) => p.amount),
        ),
        pending_payout: sum(
          db.professional_payouts
            .filter((p) => p.status === "pending")
            .map((p) => p.amount),
        ),
        receivable_count: db.accounts_receivable.length,
        payment_count: db.payments.length,
        payable_count: db.accounts_payable.length,
        payout_count: db.professional_payouts.length,
      },
    ];
  },
  get_finance_cash_metrics: (p) => {
    const inRange = (d) => {
      const k = localDateKey(d);
      return (!p.p_from || k >= p.p_from) && (!p.p_to || k <= p.p_to);
    };
    return [
      {
        cash_in: sum(
          db.payments.filter((x) => inRange(x.paid_at)).map((x) => x.amount),
        ),
        cash_out: sum(
          db.accounts_payable
            .filter((x) => x.paid_at && inRange(x.paid_at))
            .map((x) => x.amount),
        ),
        average_collection_days: 3.4,
      },
    ];
  },
  get_finance_dre: () => {
    const rev = sum(db.payments.map((x) => x.amount));
    return [
      { dre_group: "gross_revenue", amount: rev },
      { dre_group: "revenue_deduction", amount: -rev * 0.0965 },
      { dre_group: "direct_cost", amount: -rev * 0.31 },
      {
        dre_group: "operating_expense",
        amount: -sum(
          db.accounts_payable
            .filter((x) => x.status === "paid")
            .map((x) => x.amount),
        ),
      },
      { dre_group: "financial_result", amount: -420 },
      { dre_group: "income_tax", amount: -rev * 0.04 },
    ];
  },
  get_finance_overview: (p) => {
    const series = [];
    const days = 30;
    for (let k = days - 1; k >= 0; k--) {
      const d = addDaysLocal(today.y, today.m, today.d, -k);
      const key = `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
      series.push({
        bucket: key,
        cashIn: sum(
          db.payments
            .filter((x) => localDateKey(x.paid_at) === key)
            .map((x) => x.amount),
        ),
        cashOut: sum(
          db.accounts_payable
            .filter((x) => x.paid_at && x.paid_at.slice(0, 10) === key)
            .map((x) => x.amount),
        ),
        expectedIn: sum(
          db.accounts_receivable
            .filter((x) => x.status === "open" && x.due_date === key)
            .map((x) => x.amount),
        ),
        expectedOut: sum(
          db.accounts_payable
            .filter((x) => x.status === "open" && x.due_date === key)
            .map((x) => x.amount),
        ),
      });
    }
    const openR = db.accounts_receivable.filter((x) => x.status === "open");
    const openP = db.accounts_payable.filter((x) => x.status === "open");
    const tk = localDateKey(NOW);
    return {
      today: tk,
      series,
      receivable: {
        overdue: sum(openR.filter((x) => x.due_date < tk).map((x) => x.amount)),
        dueToday: sum(
          openR.filter((x) => x.due_date === tk).map((x) => x.amount),
        ),
        dueMonth: sum(openR.map((x) => x.amount)),
        dueYear: sum(openR.map((x) => x.amount)),
        settledMonth: sum(
          db.payments
            .filter((x) => monthKey(x.paid_at) === monthKey(NOW))
            .map((x) => x.amount),
        ),
        settledYear: sum(db.payments.map((x) => x.amount)),
      },
      payable: {
        overdue: sum(openP.filter((x) => x.due_date < tk).map((x) => x.amount)),
        dueToday: 0,
        dueMonth: sum(
          openP
            .filter((x) => x.due_date.slice(0, 7) === tk.slice(0, 7))
            .map((x) => x.amount),
        ),
        dueYear: sum(openP.map((x) => x.amount)),
        settledMonth: sum(
          db.accounts_payable
            .filter(
              (x) =>
                x.status === "paid" &&
                x.due_date.slice(0, 7) === tk.slice(0, 7),
            )
            .map((x) => x.amount),
        ),
        settledYear: sum(
          db.accounts_payable
            .filter((x) => x.status === "paid")
            .map((x) => x.amount),
        ),
      },
      revenueCategories: [
        {
          name: "Consultas",
          amount: sum(db.payments.map((x) => x.amount)) * 0.86,
        },
        {
          name: "Exames",
          amount: sum(db.payments.map((x) => x.amount)) * 0.14,
        },
      ],
      expenseCategories: [
        "Folha de pagamento",
        "Aluguel",
        "Materiais",
        "Marketing",
        "Contabilidade",
      ].map((name, i) => ({
        name,
        amount: [18450, 9800, 2600, 1500, 1350][i],
      })),
      paymentMethods: db.payment_methods.slice(0, 4).map((m) => ({
        name: m.name,
        methodType: m.method_type,
        amount: sum(
          db.payments
            .filter((x) => x.payment_method_id === m.id)
            .map((x) => x.amount),
        ),
      })),
    };
  },
  commission_report: () =>
    db.professionals.map((p) => ({
      professional_id: p.id,
      professional_name: p.name,
      appointments: int(30, 90),
      gross_amount: int(15000, 42000),
      commission_amount: int(6000, 21000),
    })),
  commission_monthly_series: () => [],
  procedure_margin_report: () => [],
};

// ---------- auth ----------
function b64url(s) {
  return Buffer.from(s).toString("base64url");
}
const exp = Math.floor(Date.now() / 1000) + 30 * 86400;
const user = {
  id: AUTH_UID,
  aud: "authenticated",
  role: "authenticated",
  email: db.app_users[0].email,
  email_confirmed_at: "2026-06-01T12:00:00Z",
  phone: "",
  app_metadata: { provider: "email", providers: ["email"] },
  user_metadata: { name: "Mariana Costa" },
  identities: [],
  created_at: "2026-06-01T12:00:00Z",
  updated_at: iso(NOW),
  is_anonymous: false,
};
const accessToken = `${b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }))}.${b64url(JSON.stringify({ iss: `http://127.0.0.1:${PORT}/auth/v1`, sub: AUTH_UID, aud: "authenticated", exp, iat: exp - 30 * 86400, email: user.email, phone: "", app_metadata: user.app_metadata, user_metadata: user.user_metadata, role: "authenticated", aal: "aal1", amr: [{ method: "password", timestamp: exp - 30 * 86400 }], session_id: uuid(), is_anonymous: false }))}.${b64url("mock-signature")}`;
const session = {
  access_token: accessToken,
  token_type: "bearer",
  expires_in: 30 * 86400,
  expires_at: exp,
  refresh_token: "mock-refresh-token",
  user,
};

// ---------- servidor ----------
function send(res, status, body, extra = {}) {
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "*",
    "Access-Control-Allow-Methods": "GET,POST,PATCH,PUT,DELETE,HEAD,OPTIONS",
    "Access-Control-Expose-Headers": "Content-Range, X-Total-Count",
    ...extra,
  };
  res.writeHead(status, headers);
  res.end(
    body === undefined
      ? ""
      : typeof body === "string"
        ? body
        : JSON.stringify(body),
  );
}
const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  const path = url.pathname;
  if (req.method === "OPTIONS") return send(res, 204);
  let raw = "";
  req.on("data", (c) => (raw += c));
  req.on("end", () => {
    try {
      if (path === "/__session")
        return send(res, 200, { session, cookieName: "sb-127-auth-token" });
      if (path.startsWith("/auth/v1/")) {
        if (path === "/auth/v1/user") return send(res, 200, user);
        if (path === "/auth/v1/token") return send(res, 200, session);
        if (path === "/auth/v1/logout") return send(res, 204);
        if (path.endsWith("jwks.json")) return send(res, 200, { keys: [] });
        return send(res, 200, {});
      }
      if (path.startsWith("/storage/v1/")) {
        if (path.includes("/object/sign/")) {
          const body = raw ? JSON.parse(raw) : {};
          if (Array.isArray(body.paths))
            return send(
              res,
              200,
              body.paths.map((p) => ({
                path: p,
                signedURL: "/storage/v1/object/public/mock.png",
                error: null,
              })),
            );
          return send(res, 200, {
            signedURL: "/storage/v1/object/public/mock.png",
          });
        }
        return send(res, 404, { message: "not found" });
      }
      if (path.startsWith("/rest/v1/rpc/")) {
        const fn = path.slice("/rest/v1/rpc/".length);
        const params = raw
          ? JSON.parse(raw)
          : Object.fromEntries(url.searchParams);
        const handler = RPC[fn];
        if (!handler) {
          console.log("[rpc sem mock]", fn);
          return send(res, 200, req.method === "POST" ? null : []);
        }
        try {
          return send(res, 200, handler(params));
        } catch (e) {
          return send(res, 400, {
            code: "P0001",
            message: e.message,
            details: null,
            hint: null,
          });
        }
      }
      if (path.startsWith("/rest/v1/")) {
        const table = path.slice("/rest/v1/".length);
        if (!db[table]) console.log("[tabela sem dados]", table);
        if (req.method === "GET" || req.method === "HEAD") {
          const { data, total, offset } = queryTable(
            table,
            url.searchParams,
            req.headers,
            req.method,
          );
          const extra = {};
          if (/count=/.test(req.headers["prefer"] || ""))
            extra["Content-Range"] =
              `${offset}-${Math.max(offset, offset + data.length - 1)}/${total}`;
          const wantsObject = /vnd\.pgrst\.object/.test(
            req.headers["accept"] || "",
          );
          if (req.method === "HEAD") return send(res, 200, undefined, extra);
          if (wantsObject)
            return data.length
              ? send(res, 200, data[0], extra)
              : send(res, 406, {
                  code: "PGRST116",
                  message:
                    "JSON object requested, multiple (or no) rows returned",
                });
          return send(res, 200, data, extra);
        }
        // escritas: PATCH e POST gravam na memória (para testar fluxos)
        const wantsRepr = /return=representation/.test(
          req.headers["prefer"] || "",
        );
        const body = raw ? JSON.parse(raw) : {};
        if (req.method === "PATCH") {
          let rows = db[table] || [];
          for (const [key, val] of url.searchParams) {
            if (RESERVED.has(key) || key.includes(".")) continue;
            rows = rows.filter((r) => testCond(r, key, val));
          }
          rows.forEach((r) =>
            Object.assign(r, body, { updated_at: new Date().toISOString() }),
          );
          return wantsRepr ? send(res, 200, rows) : send(res, 204);
        }
        if (req.method === "POST") {
          db[table] = db[table] || [];
          const list = (Array.isArray(body) ? body : [body]).map((b) => ({
            id: uuid(),
            created_at: new Date().toISOString(),
            ...b,
          }));
          db[table].push(...list);
          return send(res, 201, wantsRepr ? list : []);
        }
        return send(res, 204);
      }
      if (path.startsWith("/realtime/")) return send(res, 404, {});
      return send(res, 404, { message: "mock: rota desconhecida " + path });
    } catch (e) {
      console.error("[erro]", req.method, req.url, e);
      return send(res, 500, { message: e.message });
    }
  });
});
server.listen(PORT, "127.0.0.1", () => {
  console.log(
    `mock pronto em :${PORT} | pacientes=${db.patients.length} agendamentos=${db.appointments.length} atendimentos=${db.encounters.length} hoje=${localDateKey(NOW)} ${today.h}:${String(today.mi).padStart(2, "0")} (${TZ})`,
  );
});
