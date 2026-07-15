import { describe, expect, it } from "vitest";
import { buildClinicalDocumentVariables } from "./document-context";

describe("buildClinicalDocumentVariables", () => {
  it("preenche dados formatados do paciente, atendimento e clínica", () => {
    const variables = buildClinicalDocumentVariables({
      timeZone: "America/Fortaleza",
      emissionAt: "2026-07-14T18:30:00.000Z",
      patient: {
        fullName: "Maria de Souza",
        socialName: "Maria Souza",
        birthDate: "1987-04-15",
        cpf: "12345678900",
        rg: "1234567",
        phone: "84999999999",
      },
      professional: {
        name: "Dra. Ana",
        councilType: "CRM",
        councilNumber: "12345",
        councilState: "RN",
      },
      clinic: {
        tradeName: "Clínica Centro",
        document: "12345678000190",
        addressLine: "Rua Principal",
        addressNumber: "100",
        district: "Centro",
        city: "Natal",
        state: "RN",
      },
      appointment: {
        startAt: "2026-07-14T17:00:00.000Z",
        endAt: "2026-07-14T17:45:00.000Z",
        procedure: "Consulta médica",
      },
      encounter: { startedAt: "2026-07-14T17:02:00.000Z" },
    });

    expect(variables["paciente.nome"]).toBe("Maria Souza");
    expect(variables["paciente.documento"]).toBe("RG 1234567");
    expect(variables["paciente.idade"]).toBe("39 anos");
    expect(variables["profissional.registro"]).toBe("CRM 12345 RN");
    expect(variables["clinica.endereco"]).toBe(
      "Rua Principal, 100, Centro, Natal - RN",
    );
    expect(variables["atendimento.data"]).toBe("14/07/2026");
    expect(variables["atendimento.hora_inicio"]).toBe("14:00");
    expect(variables["atendimento.hora_fim"]).toBe("14:45");
    expect(variables["documento.hora_emissao"]).toBe("15:30");
  });

  it("mantém valores opcionais ausentes como null para edição manual", () => {
    const variables = buildClinicalDocumentVariables({
      timeZone: "UTC",
      emissionAt: "2026-01-01T12:00:00.000Z",
      patient: { fullName: "Paciente" },
      professional: { name: "Profissional" },
      encounter: { startedAt: "2026-01-01T10:00:00.000Z" },
    });

    expect(variables["paciente.rg"]).toBeNull();
    expect(variables["paciente.documento"]).toBeNull();
    expect(variables["clinica.endereco"]).toBeNull();
    expect(variables["atendimento.hora_fim"]).toBeNull();
  });
});
