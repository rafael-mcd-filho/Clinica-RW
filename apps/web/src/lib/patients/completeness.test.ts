import { describe, expect, it } from "vitest";
import { getPatientCompleteness } from "./completeness";

const completePatient = {
  fullName: "Carlos Eduardo Lima",
  birthDate: "1976-09-03",
  sexAtBirth: "male",
  cpf: "11144477735",
  rg: "20001234567",
  source: "Indicação",
  email: "carlos@example.com",
  phone: "85999910002",
  whatsapp: null,
  preferredContact: "phone",
  allowWhatsapp: false,
  allowEmail: true,
  postalCode: "60160150",
  addressLine: "Rua das Flores",
  addressNumber: "120",
  district: "Aldeota",
  city: "Fortaleza",
  state: "CE",
};

describe("getPatientCompleteness", () => {
  it("only reaches 100% when every essential group is complete", () => {
    expect(getPatientCompleteness(completePatient)).toEqual({
      completed: 13,
      missing: [],
      percentage: 100,
      total: 13,
    });
  });

  it("accepts WhatsApp as the primary telephone contact", () => {
    const result = getPatientCompleteness({
      ...completePatient,
      phone: null,
      whatsapp: "85999910002",
      preferredContact: "whatsapp",
      allowWhatsapp: true,
    });

    expect(result.percentage).toBe(100);
  });

  it("reports missing groups and never rounds an incomplete record to 100", () => {
    const result = getPatientCompleteness({
      ...completePatient,
      email: null,
      addressNumber: null,
    });

    expect(result.percentage).toBe(85);
    expect(result.missing).toEqual(["e-mail", "endereço e número"]);
  });

  it("does not complete a preferred channel without its authorization", () => {
    const result = getPatientCompleteness({
      ...completePatient,
      whatsapp: "85999910002",
      preferredContact: "whatsapp",
      allowWhatsapp: false,
    });

    expect(result.percentage).toBeLessThan(100);
    expect(result.missing).toContain("canal preferido autorizado");
  });
});
