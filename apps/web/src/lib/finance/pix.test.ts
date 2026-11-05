import { describe, expect, it } from "vitest";
import {
  buildPixPayload,
  crc16,
  maskPixKey,
  normalizePixKey,
  pixReference,
} from "./pix";

describe("crc16", () => {
  it("bate com o valor de referência do CRC-16/CCITT-FALSE", () => {
    expect(crc16("123456789")).toBe("29B1");
  });

  it("bate com o exemplo do manual do BR Code", () => {
    const payload =
      "00020126580014br.gov.bcb.pix0136123e4567-e12b-12d1-a456-4266554400005204000053039865802BR5913Fulano de Tal6008BRASILIA62070503***6304";
    expect(crc16(payload)).toBe("1D3D");
  });
});

describe("normalizePixKey", () => {
  it("descobre o tipo pelo formato", () => {
    expect(normalizePixKey("Financeiro@Clinica.com.br")).toEqual({
      key: "financeiro@clinica.com.br",
      type: "email",
    });
    expect(normalizePixKey("529.982.247-25")).toEqual({
      key: "52998224725",
      type: "cpf",
    });
    expect(normalizePixKey("11.222.333/0001-81")).toEqual({
      key: "11222333000181",
      type: "cnpj",
    });
    expect(normalizePixKey("(11) 98765-4321")).toEqual({
      key: "+5511987654321",
      type: "phone",
    });
    expect(normalizePixKey("+55 11 98765-4321")?.key).toBe("+5511987654321");
    expect(normalizePixKey("123E4567-E12B-12D1-A456-426655440000")?.type).toBe(
      "random",
    );
  });

  it("respeita o tipo escolhido e recusa o que não confere", () => {
    expect(normalizePixKey("52998224725", "phone")).toEqual({
      key: "+5552998224725",
      type: "phone",
    });
    expect(normalizePixKey("12345678900", "cpf")).toBeNull();
    expect(normalizePixKey("não é chave")).toBeNull();
    expect(normalizePixKey("")).toBeNull();
  });
});

describe("buildPixPayload", () => {
  it("monta o BR Code com valor, nome, cidade e referência", () => {
    const payload = buildPixPayload({
      key: "financeiro@clinica.com.br",
      merchantName: "Clínica Aurora Saúde Integrada Ltda",
      merchantCity: "São Paulo",
      amount: 250,
      reference: "a1b2-c3d4",
      description: "Consulta 05/11",
    });
    expect(payload.startsWith("000201")).toBe(true);
    expect(payload).toContain(
      "0014br.gov.bcb.pix0125financeiro@clinica.com.br",
    );
    expect(payload).toContain("0214Consulta 05/11");
    expect(payload).toContain("5406250.00");
    expect(payload).toContain("5925Clinica Aurora Saude Inte");
    expect(payload).toContain("6009SAO PAULO");
    expect(payload).toContain("62120508A1B2C3D4");
    expect(payload.slice(-8, -4)).toBe("6304");
    expect(payload.slice(-4)).toBe(crc16(payload.slice(0, -4)));
  });

  it("deixa a descrição de fora quando não cabe com a chave", () => {
    const longKey = `${"a".repeat(68)}@exemplo.com`;
    const payload = buildPixPayload({
      key: longKey,
      merchantName: "Clinica",
      merchantCity: "Recife",
      description: "Consulta de retorno com descrição longa",
    });
    expect(payload).not.toContain("Consulta de retorno");
  });

  it("recusa valor zero ou negativo", () => {
    expect(() =>
      buildPixPayload({
        key: "+5511987654321",
        merchantName: "Clinica",
        merchantCity: "Recife",
        amount: 0,
      }),
    ).toThrow();
  });
});

describe("auxiliares", () => {
  it("referência só com letras e números", () => {
    expect(pixReference("rec-0f3a_99")).toBe("REC0F3A99");
    expect(pixReference("")).toBe("***");
  });

  it("mascara CPF e celular", () => {
    expect(maskPixKey("52998224725", "cpf")).toBe("***.982.247-**");
    expect(maskPixKey("+5511987654321", "phone")).toBe("+5511 *****-4321");
  });
});
