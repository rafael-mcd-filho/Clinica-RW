import { describe, expect, it } from "vitest";
import {
  detectColumns,
  normalizeImportRows,
  parseBirthDate,
  parseCsv,
} from "./import";

describe("importação de pacientes", () => {
  it("lê CSV com ponto e vírgula, aspas e BOM", () => {
    const rows = parseCsv(
      '﻿Nome;CPF;Celular\n"Silva, João";529.982.247-25;(84) 99999-0000\nMaria;;\n',
    );
    expect(rows).toEqual([
      ["Nome", "CPF", "Celular"],
      ["Silva, João", "529.982.247-25", "(84) 99999-0000"],
      ["Maria", "", ""],
    ]);
  });

  it("reconhece as colunas pelo cabeçalho, com ou sem acento", () => {
    const mapping = detectColumns([
      "Nome do paciente",
      "Data de Nascimento",
      "Gênero",
      "E-mail",
      "Celular",
    ]);
    expect(mapping.full_name).toBe(0);
    expect(mapping.birth_date).toBe(1);
    expect(mapping.sex_at_birth).toBe(2);
    expect(mapping.email).toBe(3);
    expect(mapping.whatsapp).toBe(4);
    expect(mapping.cpf).toBe(-1);
  });

  it("aceita datas brasileiras e ISO e recusa datas impossíveis", () => {
    expect(parseBirthDate("15/04/1988")).toBe("1988-04-15");
    expect(parseBirthDate("1988-04-15")).toBe("1988-04-15");
    expect(parseBirthDate("31/02/1990")).toBeNull();
    expect(parseBirthDate("01/01/2999")).toBeNull();
  });

  it("valida as linhas e aponta CPF repetido", () => {
    const mapping = detectColumns(["Nome", "CPF", "Telefone"]);
    const results = normalizeImportRows(
      [
        ["Ana Lima", "529.982.247-25", "+55 (11) 3322-4455"],
        ["Ana L.", "52998224725", ""],
        ["Jo", "111.111.111-11", "123"],
      ],
      mapping,
    );
    expect(results[0].errors).toEqual([]);
    expect(results[0].patient.phone).toBe("1133224455");
    expect(results[1].errors).toContain("CPF repetido (linha 2)");
    expect(results[2].errors).toEqual(
      expect.arrayContaining([
        "Nome ausente ou curto",
        "CPF inválido",
        "Telefone inválido",
      ]),
    );
  });
});
