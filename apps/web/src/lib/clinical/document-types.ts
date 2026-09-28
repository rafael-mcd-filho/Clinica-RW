export const clinicalDocumentTypes = [
  "prescription",
  "exam_request",
  "medical_certificate",
  "attendance_declaration",
  "referral",
  "clinical_report",
  "patient_instructions",
  "informed_consent",
] as const;
export type ClinicalDocumentType = (typeof clinicalDocumentTypes)[number];
export const documentTypeLabels: Record<ClinicalDocumentType, string> = {
  prescription: "Prescrição",
  exam_request: "Solicitação de exame",
  medical_certificate: "Atestado",
  attendance_declaration: "Declaração de comparecimento",
  referral: "Encaminhamento",
  clinical_report: "Relatório clínico",
  patient_instructions: "Orientações ao paciente",
  informed_consent: "Termo de consentimento",
};
export const documentTypePermissions: Record<ClinicalDocumentType, string> = {
  prescription: "clinico.prescrever",
  exam_request: "clinico.solicitar_exame",
  medical_certificate: "clinico.emitir_atestado",
  attendance_declaration: "clinico.emitir_atestado",
  referral: "clinico.emitir_documento",
  clinical_report: "clinico.emitir_documento",
  patient_instructions: "clinico.emitir_documento",
  informed_consent: "clinico.gerenciar_consentimento",
};
export function isClinicalDocumentType(
  value: string,
): value is ClinicalDocumentType {
  return clinicalDocumentTypes.some((type) => type === value);
}
export const documentFields: Partial<
  Record<
    ClinicalDocumentType,
    Array<{ key: string; label: string; placeholder: string }>
  >
> = {
  referral: [
    {
      key: "destination",
      label: "Profissional ou especialidade de destino",
      placeholder: "Informe o destino do encaminhamento",
    },
    {
      key: "reason",
      label: "Motivo do encaminhamento",
      placeholder: "Descreva o motivo clínico",
    },
  ],
  clinical_report: [
    {
      key: "purpose",
      label: "Finalidade do relatório",
      placeholder: "Informe para que o relatório será utilizado",
    },
  ],
  patient_instructions: [
    {
      key: "care",
      label: "Atendimento ou cuidado relacionado",
      placeholder: "Informe a consulta, tratamento ou procedimento",
    },
  ],
  informed_consent: [
    {
      key: "procedure",
      label: "Procedimento ou tratamento",
      placeholder: "Informe o procedimento ao qual este termo se aplica",
    },
  ],
};
export function describeDocumentFields(
  type: ClinicalDocumentType,
  fields: Record<string, string>,
): string {
  return (documentFields[type] ?? [])
    .map((field) => field.label + ": " + (fields[field.key] ?? ""))
    .join("\n");
}

export const documentTypeStarters: Record<
  ClinicalDocumentType,
  { title: string; body: string }
> = {
  prescription: {
    title: "Prescrição",
    body: "Uso oral\n\n1. ______________________________ ______ unidade(s)\n   Posologia: ______________________________\n\n2. ______________________________ ______ unidade(s)\n   Posologia: ______________________________\n\n{{clinica.cidade}}, {{documento.data_emissao}}.",
  },
  exam_request: {
    title: "Solicitação de exames",
    body: "Solicito para {{paciente.nome_completo}} a realização dos exames abaixo:\n\n1. ______________________________\n2. ______________________________\n3. ______________________________\n\nIndicação clínica: ______________________________\n\n{{clinica.cidade}}, {{documento.data_emissao}}.",
  },
  medical_certificate: {
    title: "Atestado",
    body: "Atesto, para os devidos fins, que {{paciente.nome_completo}}, {{paciente.documento}}, esteve sob meus cuidados em {{atendimento.data}}, das {{atendimento.hora_inicio}} às {{atendimento.hora_fim}}, e necessita de ____ dia(s) de afastamento de suas atividades a partir desta data.\n\n{{clinica.cidade}}, {{documento.data_emissao}}.",
  },
  attendance_declaration: {
    title: "Declaração de comparecimento",
    body: "Declaro, para os devidos fins, que {{paciente.nome_completo}}, {{paciente.documento}}, compareceu a atendimento em {{atendimento.data}}, das {{atendimento.hora_inicio}} às {{atendimento.hora_fim}}.\n\n{{clinica.cidade}}, {{documento.data_emissao}}.",
  },
  referral: {
    title: "Encaminhamento",
    body: "Informações clínicas relevantes:\n\nCondutas já realizadas:\n\nSolicitação ao profissional de destino:",
  },
  clinical_report: {
    title: "Relatório clínico",
    body: "Histórico e período de acompanhamento:\n\nAvaliação e evolução:\n\nConduta e conclusão:",
  },
  patient_instructions: {
    title: "Orientações ao paciente",
    body: "Cuidados recomendados:\n\nOrientações para retorno:\n\nEm caso de dúvidas:",
  },
  informed_consent: {
    title: "Termo de consentimento",
    body: "Descrição do procedimento e benefícios esperados:\n\nRiscos e possíveis desconfortos:\n\nAlternativas disponíveis:\n\nCuidados antes e depois do procedimento:\n\nEsclarecimentos prestados:",
  },
};
