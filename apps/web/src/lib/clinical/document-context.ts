import type { DocumentVariableValues } from "./document-templates";
import { formatCNPJ, formatCPF, formatPhoneBR } from "../validation/br";

type AddressSource = {
  addressLine?: string | null;
  addressNumber?: string | null;
  addressComplement?: string | null;
  district?: string | null;
  city?: string | null;
  state?: string | null;
};

export type ClinicalDocumentContextInput = {
  timeZone: string;
  emissionAt?: Date | string;
  patient: {
    fullName: string;
    socialName?: string | null;
    birthDate?: string | null;
    cpf?: string | null;
    rg?: string | null;
    email?: string | null;
    phone?: string | null;
  };
  professional: {
    name: string;
    specialty?: string | null;
    councilType?: string | null;
    councilNumber?: string | null;
    councilState?: string | null;
  };
  clinic?:
    | (AddressSource & {
        tradeName?: string | null;
        legalName?: string | null;
        document?: string | null;
        phone?: string | null;
        email?: string | null;
      })
    | null;
  unit?:
    | (AddressSource & {
        name?: string | null;
        phone?: string | null;
        email?: string | null;
      })
    | null;
  appointment?: {
    startAt?: string | null;
    endAt?: string | null;
    procedure?: string | null;
  } | null;
  encounter: {
    startedAt: string;
    finalizedAt?: string | null;
  };
};

export function buildClinicalDocumentVariables(
  input: ClinicalDocumentContextInput,
): DocumentVariableValues {
  const emissionAt = toDate(input.emissionAt ?? new Date()) ?? new Date();
  const appointmentStart = toDate(
    input.appointment?.startAt ?? input.encounter.startedAt,
  );
  const appointmentEnd = toDate(
    input.appointment?.endAt ?? input.encounter.finalizedAt,
  );
  const patientName = input.patient.socialName || input.patient.fullName;
  const cpf = optionalFormatted(input.patient.cpf, formatCPF);
  const rg = optional(input.patient.rg);
  const council = optional(input.professional.councilType);
  const councilNumber = optional(input.professional.councilNumber);
  const councilState = optional(input.professional.councilState);

  return {
    "paciente.nome": patientName,
    "paciente.nome_completo": input.patient.fullName,
    "paciente.nome_social": optional(input.patient.socialName),
    "paciente.cpf": cpf,
    "paciente.rg": rg,
    "paciente.documento": rg ? `RG ${rg}` : cpf ? `CPF ${cpf}` : null,
    "paciente.data_nascimento": input.patient.birthDate
      ? formatIsoDate(input.patient.birthDate)
      : null,
    "paciente.idade": input.patient.birthDate
      ? formatAge(input.patient.birthDate, emissionAt, input.timeZone)
      : null,
    "paciente.email": optional(input.patient.email),
    "paciente.telefone": optionalFormatted(input.patient.phone, formatPhoneBR),
    "profissional.nome": input.professional.name,
    "profissional.especialidade": optional(input.professional.specialty),
    "profissional.conselho": council,
    "profissional.numero_conselho": councilNumber,
    "profissional.uf_conselho": councilState,
    "profissional.registro": joinNonEmpty(
      [council, councilNumber, councilState],
      " ",
    ),
    "clinica.nome": optional(
      input.clinic?.tradeName ?? input.clinic?.legalName,
    ),
    "clinica.razao_social": optional(input.clinic?.legalName),
    "clinica.cnpj": optionalFormatted(input.clinic?.document, formatCNPJ),
    "clinica.endereco": formatAddress(input.clinic),
    "clinica.cidade": optional(input.clinic?.city),
    "clinica.uf": optional(input.clinic?.state),
    "clinica.telefone": optionalFormatted(input.clinic?.phone, formatPhoneBR),
    "clinica.email": optional(input.clinic?.email),
    "unidade.nome": optional(input.unit?.name),
    "unidade.endereco": formatAddress(input.unit),
    "unidade.cidade": optional(input.unit?.city),
    "unidade.uf": optional(input.unit?.state),
    "unidade.telefone": optionalFormatted(input.unit?.phone, formatPhoneBR),
    "unidade.email": optional(input.unit?.email),
    "atendimento.data": appointmentStart
      ? formatDate(appointmentStart, input.timeZone)
      : null,
    "atendimento.hora_inicio": appointmentStart
      ? formatTime(appointmentStart, input.timeZone)
      : null,
    "atendimento.hora_fim": appointmentEnd
      ? formatTime(appointmentEnd, input.timeZone)
      : null,
    "atendimento.procedimento": optional(input.appointment?.procedure),
    "documento.data_emissao": formatDate(emissionAt, input.timeZone),
    "documento.hora_emissao": formatTime(emissionAt, input.timeZone),
  };
}

function formatAddress(source?: AddressSource | null) {
  if (!source) return null;
  const street = joinNonEmpty(
    [optional(source.addressLine), optional(source.addressNumber)],
    ", ",
  );
  const cityAndState = joinNonEmpty(
    [optional(source.city), optional(source.state)],
    " - ",
  );
  return joinNonEmpty(
    [
      street,
      optional(source.addressComplement),
      optional(source.district),
      cityAndState,
    ],
    ", ",
  );
}

function formatAge(birthDate: string, reference: Date, timeZone: string) {
  const [birthYear, birthMonth, birthDay] = birthDate.split("-").map(Number);
  if (!birthYear || !birthMonth || !birthDay) return null;
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(reference)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );
  let age = parts.year - birthYear;
  if (
    parts.month < birthMonth ||
    (parts.month === birthMonth && parts.day < birthDay)
  ) {
    age -= 1;
  }
  return age >= 0 ? `${age} ${age === 1 ? "ano" : "anos"}` : null;
}

function formatIsoDate(value: string) {
  const [year, month, day] = value.split("-");
  return year && month && day ? `${day}/${month}/${year}` : value;
}

function formatDate(value: Date, timeZone: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeZone,
  }).format(value);
}

function formatTime(value: Date, timeZone: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone,
  }).format(value);
}

function toDate(value?: Date | string | null) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function optional(value?: string | null) {
  const normalized = value?.trim();
  return normalized || null;
}

function optionalFormatted(
  value: string | null | undefined,
  formatter: (value: string) => string,
) {
  const normalized = optional(value);
  return normalized ? formatter(normalized) : null;
}

function joinNonEmpty(
  values: Array<string | null | undefined>,
  separator: string,
) {
  const result = values.filter((value): value is string => Boolean(value));
  return result.length ? result.join(separator) : null;
}
