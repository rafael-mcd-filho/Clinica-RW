export type PatientCompletenessInput = {
  fullName?: string | null;
  birthDate?: string | null;
  sexAtBirth?: string | null;
  cpf?: string | null;
  rg?: string | null;
  source?: string | null;
  email?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  preferredContact?: string | null;
  allowWhatsapp?: boolean | null;
  allowEmail?: boolean | null;
  postalCode?: string | null;
  addressLine?: string | null;
  addressNumber?: string | null;
  district?: string | null;
  city?: string | null;
  state?: string | null;
};

export type PatientCompleteness = {
  completed: number;
  missing: string[];
  percentage: number;
  total: number;
};

const hasText = (value: string | null | undefined) =>
  Boolean(value?.trim().length);

function hasUsablePreferredContact(input: PatientCompletenessInput) {
  switch (input.preferredContact) {
    case "none":
      return true;
    case "phone":
      return hasText(input.phone);
    case "email":
      return hasText(input.email) && input.allowEmail === true;
    case "whatsapp":
      return hasText(input.whatsapp) && input.allowWhatsapp === true;
    default:
      return false;
  }
}

/**
 * O verde representa um cadastro efetivamente concluído. Somente campos que
 * podem não se aplicar (nome social e complemento) ficam fora do cálculo.
 */
export function getPatientCompleteness(
  input: PatientCompletenessInput,
): PatientCompleteness {
  const checks = [
    { label: "nome completo", complete: hasText(input.fullName) },
    { label: "data de nascimento", complete: hasText(input.birthDate) },
    { label: "sexo ao nascer", complete: hasText(input.sexAtBirth) },
    { label: "CPF", complete: hasText(input.cpf) },
    { label: "RG", complete: hasText(input.rg) },
    { label: "origem do paciente", complete: hasText(input.source) },
    {
      label: "telefone ou WhatsApp",
      complete: hasText(input.phone) || hasText(input.whatsapp),
    },
    { label: "e-mail", complete: hasText(input.email) },
    {
      label: "canal preferido autorizado",
      complete: hasUsablePreferredContact(input),
    },
    { label: "CEP", complete: hasText(input.postalCode) },
    {
      label: "endereço e número",
      complete: hasText(input.addressLine) && hasText(input.addressNumber),
    },
    { label: "bairro", complete: hasText(input.district) },
    {
      label: "cidade e UF",
      complete: hasText(input.city) && hasText(input.state),
    },
  ];
  const missing = checks
    .filter((check) => !check.complete)
    .map((check) => check.label);
  const completed = checks.length - missing.length;

  return {
    completed,
    missing,
    percentage: Math.round((completed / checks.length) * 100),
    total: checks.length,
  };
}
