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

function localDate(offsetDays = 0) {
  const value = new Date();
  value.setDate(value.getDate() + offsetDays);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Fortaleza",
  }).format(value);
}

function at(date, time) {
  return new Date(`${date}T${time}:00-03:00`).toISOString();
}

function addMinutes(isoDate, minutes) {
  return new Date(new Date(isoDate).getTime() + minutes * 60_000).toISOString();
}

function pick(items, index) {
  return items[((index % items.length) + items.length) % items.length];
}

const organizationId = readArg("organization-id");
if (!organizationId) {
  console.error(
    "Usage: npm run seed:demo-agenda -- --organization-id UUID_DA_EMPRESA",
  );
  process.exit(1);
}

const env = readEnv();
const supabase = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

async function upsertOne(table, payload, onConflict, columns = "id") {
  const result = await supabase
    .from(table)
    .upsert(payload, { onConflict })
    .select(columns)
    .single();
  if (result.error || !result.data) {
    console.error(result.error?.message ?? `Falha ao salvar ${table}.`);
    process.exit(1);
  }
  return result.data;
}

async function saveProfessional(payload) {
  const { data: existing, error: lookupError } = await supabase
    .from("professionals")
    .select("id")
    .eq("organization_id", payload.organization_id)
    .eq("name", payload.name)
    .maybeSingle();
  if (lookupError) {
    console.error(lookupError.message);
    process.exit(1);
  }

  const result = existing
    ? await supabase
        .from("professionals")
        .update(payload)
        .eq("id", existing.id)
        .select("id")
        .single()
    : await supabase
        .from("professionals")
        .insert(payload)
        .select("id")
        .single();
  if (result.error || !result.data) {
    console.error(result.error?.message ?? "Falha ao salvar profissional.");
    process.exit(1);
  }
  return result.data;
}

async function saveAppointment(payload) {
  const { data: existing, error: lookupError } = await supabase
    .from("appointments")
    .select("id")
    .eq("organization_id", payload.organization_id)
    .eq("schedule_id", payload.schedule_id)
    .eq("start_at", payload.start_at)
    .maybeSingle();
  if (lookupError) {
    console.error(lookupError.message);
    process.exit(1);
  }
  if (existing) return false;

  const { error } = await supabase.from("appointments").insert(payload);
  if (error) {
    if (
      error.message.includes("conflicting key value") ||
      error.message.includes("overlap") ||
      error.message.includes("schedule block")
    ) {
      console.warn(
        `Skipped appointment at ${payload.start_at}: ${error.message}`,
      );
      return false;
    }
    console.error(error.message);
    process.exit(1);
  }
  return true;
}

async function saveBlock(payload) {
  const { data: existing, error: lookupError } = await supabase
    .from("schedule_blocks")
    .select("id")
    .eq("organization_id", payload.organization_id)
    .eq("schedule_id", payload.schedule_id)
    .eq("start_at", payload.start_at)
    .maybeSingle();
  if (lookupError) {
    console.error(lookupError.message);
    process.exit(1);
  }
  if (existing) return false;

  const { error } = await supabase.from("schedule_blocks").insert(payload);
  if (error) {
    if (
      error.message.includes("appointment") ||
      error.message.includes("block")
    ) {
      console.warn(`Skipped block at ${payload.start_at}: ${error.message}`);
      return false;
    }
    console.error(error.message);
    process.exit(1);
  }
  return true;
}

const { data: organization, error: organizationError } = await supabase
  .from("organizations")
  .select("id, name")
  .eq("id", organizationId)
  .maybeSingle();
if (organizationError || !organization) {
  console.error(organizationError?.message ?? "Empresa nao encontrada.");
  process.exit(1);
}

const { data: patients, error: patientsError } = await supabase
  .from("patients")
  .select("id, full_name")
  .eq("organization_id", organizationId)
  .is("deleted_at", null)
  .order("full_name")
  .limit(40);
if (patientsError || !patients?.length) {
  console.error(
    "Nenhum paciente encontrado. Execute seed:demo-patients antes da agenda.",
  );
  process.exit(1);
}

const units = {
  centro: await upsertOne(
    "units",
    { organization_id: organizationId, name: "Unidade Centro", code: "CENTRO" },
    "organization_id,name",
  ),
  aldeota: await upsertOne(
    "units",
    {
      organization_id: organizationId,
      name: "Unidade Aldeota",
      code: "ALDEOTA",
    },
    "organization_id,name",
  ),
};

const procedures = {
  clinica: await upsertOne(
    "procedures",
    {
      organization_id: organizationId,
      name: "Consulta clinica",
      duration_minutes: 30,
      base_price: 180,
    },
    "organization_id,name",
  ),
  retorno: await upsertOne(
    "procedures",
    {
      organization_id: organizationId,
      name: "Retorno",
      duration_minutes: 30,
      base_price: 120,
    },
    "organization_id,name",
  ),
  cardiologia: await upsertOne(
    "procedures",
    {
      organization_id: organizationId,
      name: "Cardiologia",
      duration_minutes: 45,
      base_price: 250,
    },
    "organization_id,name",
  ),
  psiquiatria: await upsertOne(
    "procedures",
    {
      organization_id: organizationId,
      name: "Psiquiatria",
      duration_minutes: 50,
      base_price: 320,
    },
    "organization_id,name",
  ),
  checkup: await upsertOne(
    "procedures",
    {
      organization_id: organizationId,
      name: "Check-up",
      duration_minutes: 60,
      base_price: 400,
    },
    "organization_id,name",
  ),
  exame: await upsertOne(
    "procedures",
    {
      organization_id: organizationId,
      name: "Exame de rotina",
      duration_minutes: 30,
      base_price: 150,
    },
    "organization_id,name",
  ),
};

const insurances = {
  particular: await upsertOne(
    "health_insurances",
    { organization_id: organizationId, name: "Particular" },
    "organization_id,name",
  ),
  unimed: await upsertOne(
    "health_insurances",
    { organization_id: organizationId, name: "Unimed" },
    "organization_id,name",
  ),
  bradesco: await upsertOne(
    "health_insurances",
    { organization_id: organizationId, name: "Bradesco Saude" },
    "organization_id,name",
  ),
};

const professionalConfigs = [
  {
    key: "helena",
    name: "Dra. Helena Martins",
    council_number: "12345",
    unit: units.centro,
    room: "Consultorio 1",
    scheduleName: "Agenda Dra. Helena",
    color: "#2563eb",
  },
  {
    key: "rafael",
    name: "Dr. Rafael Mendonca",
    council_number: "22334",
    unit: units.centro,
    room: "Consultorio 2",
    scheduleName: "Agenda Dr. Rafael",
    color: "#ef4444",
  },
  {
    key: "juliana",
    name: "Dra. Juliana Costa",
    council_number: "33445",
    unit: units.aldeota,
    room: "Sala Terapia",
    scheduleName: "Agenda Dra. Juliana",
    color: "#7c3aed",
  },
  {
    key: "camila",
    name: "Dra. Camila Ribeiro",
    council_number: "44556",
    unit: units.aldeota,
    room: "Consultorio 3",
    scheduleName: "Agenda Dra. Camila",
    color: "#10b981",
  },
  {
    key: "pedro",
    name: "Dr. Pedro Oliveira",
    council_number: "55667",
    unit: units.centro,
    room: "Sala de Procedimentos",
    scheduleName: "Agenda Dr. Pedro",
    color: "#f97316",
  },
];

const resources = {};
for (const config of professionalConfigs) {
  const professional = await saveProfessional({
    organization_id: organizationId,
    name: config.name,
    council_type: "CRM",
    council_number: config.council_number,
    council_state: "CE",
  });
  const room = await upsertOne(
    "rooms",
    {
      organization_id: organizationId,
      unit_id: config.unit.id,
      name: config.room,
    },
    "organization_id,unit_id,name",
  );
  const schedule = await upsertOne(
    "schedules",
    {
      organization_id: organizationId,
      professional_id: professional.id,
      unit_id: config.unit.id,
      name: config.scheduleName,
      color: config.color,
    },
    "organization_id,professional_id,unit_id",
  );

  for (let weekday = 0; weekday <= 6; weekday += 1) {
    await upsertOne(
      "schedule_availability",
      {
        organization_id: organizationId,
        schedule_id: schedule.id,
        weekday,
        start_time: "08:00",
        end_time: "20:00",
        slot_minutes: 30,
      },
      "organization_id,schedule_id,weekday,start_time",
    );
  }

  resources[config.key] = {
    professional,
    room,
    schedule,
    unit: config.unit,
  };
}

const statuses = [
  "scheduled",
  "confirmed",
  "waiting",
  "in_progress",
  "attended",
  "no_show",
];
const procedureOrder = [
  procedures.clinica,
  procedures.retorno,
  procedures.cardiologia,
  procedures.psiquiatria,
  procedures.checkup,
  procedures.exame,
];
const insuranceOrder = [
  insurances.particular,
  insurances.unimed,
  insurances.bradesco,
];

const dailySlots = [
  ["helena", "08:00", 30, 0],
  ["rafael", "08:00", 45, 2],
  ["juliana", "08:30", 50, 3],
  ["camila", "09:00", 60, 4],
  ["pedro", "09:30", 30, 5],
  ["helena", "10:00", 30, 1],
  ["rafael", "10:15", 45, 2],
  ["juliana", "10:30", 50, 3],
  ["camila", "11:00", 60, 4],
  ["pedro", "11:30", 30, 5],
  ["helena", "14:00", 30, 0],
  ["rafael", "14:15", 45, 2],
  ["juliana", "14:30", 50, 3],
  ["camila", "15:00", 60, 4],
  ["pedro", "15:30", 30, 5],
  ["helena", "16:00", 30, 1],
  ["rafael", "16:15", 45, 2],
  ["juliana", "16:30", 50, 3],
  ["pedro", "18:00", 30, 0],
  ["juliana", "18:15", 50, 3],
];

let createdAppointments = 0;
for (let dayOffset = -2; dayOffset <= 8; dayOffset += 1) {
  const date = localDate(dayOffset);
  const day = new Date(`${date}T12:00:00-03:00`).getDay();
  if (day === 0) continue;
  const slotLimit = day === 6 ? 10 : dailySlots.length;

  for (let index = 0; index < slotLimit; index += 1) {
    const [professionalKey, time, duration, procedureIndex] = dailySlots[index];
    const resource = resources[professionalKey];
    const startAt = at(date, time);
    const procedure = pick(procedureOrder, procedureIndex + dayOffset + index);
    const patient = pick(patients, index + dayOffset);
    const insurance = pick(insuranceOrder, index + dayOffset);
    const created = await saveAppointment({
      organization_id: organizationId,
      patient_id: patient.id,
      professional_id: resource.professional.id,
      procedure_id: procedure.id,
      schedule_id: resource.schedule.id,
      unit_id: resource.unit.id,
      room_id: resource.room.id,
      health_insurance_id: insurance.id,
      status: statuses[(index + dayOffset + 20) % statuses.length],
      start_at: startAt,
      end_at: addMinutes(startAt, duration),
      notes: "Seed demonstrativo com agenda multi-profissional.",
    });
    if (created) createdAppointments += 1;
  }
}

let createdBlocks = 0;
for (const [professionalKey, offset, start, end, reason] of [
  ["helena", 0, "12:00", "13:30", "Intervalo da equipe"],
  ["rafael", 0, "15:30", "16:30", "Reuniao interna"],
  ["juliana", 1, "09:30", "10:30", "Supervisao clinica"],
  ["camila", 2, "13:00", "14:00", "Treinamento"],
  ["pedro", 3, "17:00", "18:30", "Ausente"],
]) {
  const resource = resources[professionalKey];
  const date = localDate(offset);
  const created = await saveBlock({
    organization_id: organizationId,
    schedule_id: resource.schedule.id,
    start_at: at(date, start),
    end_at: at(date, end),
    reason,
  });
  if (created) createdBlocks += 1;
}

let createdWaitlist = 0;
for (let index = 0; index < Math.min(8, patients.length); index += 1) {
  const patient = patients[(index + 4) % patients.length];
  const resource =
    Object.values(resources)[index % Object.values(resources).length];
  const procedure = procedureOrder[index % procedureOrder.length];
  const { data: existingWaitlist, error: lookupError } = await supabase
    .from("waitlist_entries")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("patient_id", patient.id)
    .eq("procedure_id", procedure.id)
    .in("status", ["waiting", "contacted"])
    .maybeSingle();
  if (lookupError) {
    console.error(lookupError.message);
    process.exit(1);
  }
  if (existingWaitlist) continue;

  const { error } = await supabase.from("waitlist_entries").insert({
    organization_id: organizationId,
    patient_id: patient.id,
    procedure_id: procedure.id,
    professional_id: resource.professional.id,
    preferred_period: ["morning", "afternoon", "evening", "any"][index % 4],
    notes: "Avisar se surgir encaixe na semana.",
  });
  if (error) {
    console.error(error.message);
    process.exit(1);
  }
  createdWaitlist += 1;
}

console.log(
  [
    `Demo agenda ready for ${organization.name}.`,
    `${Object.keys(resources).length} schedules/professionals.`,
    `${createdAppointments} new appointments.`,
    `${createdBlocks} new blocks.`,
    `${createdWaitlist} new waitlist entries.`,
  ].join(" "),
);
