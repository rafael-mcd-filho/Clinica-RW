import { describe, expect, it } from "vitest";
import {
  describePrescriptionItem,
  parsePrescriptionItems,
} from "./prescription-items";

describe("parsePrescriptionItems", () => {
  it("lê o modelo numerado com posologia", () => {
    const body =
      "Uso oral\n\n1. Losartana 50 mg ______ unidade(s)\n   Posologia: 1x ao dia, uso contínuo\n\n2. Atorvastatina 20 mg 30 unidade(s)\n   Posologia: 1x ao dia por 30 dias\n\nFortaleza, 13/07/2026.";

    expect(parsePrescriptionItems(body)).toEqual([
      {
        name: "Losartana 50 mg",
        posology: "1x ao dia",
        duration: "Uso contínuo",
        continuous: true,
      },
      {
        name: "Atorvastatina 20 mg",
        posology: "1x ao dia",
        duration: "30 dias",
        continuous: false,
      },
    ]);
  });

  it("lê uma linha por medicamento, separada por dois-pontos", () => {
    const body =
      "Dipirona 500mg: tomar 1 comprimido se dor, até 6/6h, por até 3 dias.\nHidratação oral e repouso relativo.";

    expect(parsePrescriptionItems(body)).toEqual([
      {
        name: "Dipirona 500mg",
        posology: "Tomar 1 comprimido se dor, até 6/6h",
        duration: "3 dias",
        continuous: false,
      },
    ]);
  });

  it("separa a instrução quando não há dois-pontos", () => {
    expect(
      parsePrescriptionItems("Amoxicilina 500 mg tomar 1 cápsula de 8/8h"),
    ).toEqual([
      {
        name: "Amoxicilina 500 mg",
        posology: "Tomar 1 cápsula de 8/8h",
        duration: null,
        continuous: false,
      },
    ]);
  });

  it("ignora itens em branco do modelo e texto sem medicamento", () => {
    expect(
      parsePrescriptionItems(
        "Uso oral\n\n1. ______________ ______ unidade(s)\n   Posologia: ______\n\nFortaleza, 01/02/2026.",
      ),
    ).toEqual([]);
    expect(parsePrescriptionItems("Repouso e hidratação.")).toEqual([]);
    expect(parsePrescriptionItems(null)).toEqual([]);
  });

  it("aceita uso contínuo junto do nome", () => {
    expect(
      parsePrescriptionItems("1. Metformina 850 mg, uso contínuo"),
    ).toEqual([
      {
        name: "Metformina 850 mg",
        posology: null,
        duration: "Uso contínuo",
        continuous: true,
      },
    ]);
  });
});

describe("describePrescriptionItem", () => {
  it("junta posologia e duração", () => {
    expect(
      describePrescriptionItem({
        name: "Losartana 50 mg",
        posology: "1x ao dia",
        duration: "Uso contínuo",
        continuous: true,
      }),
    ).toBe("1x ao dia · Uso contínuo");
    expect(
      describePrescriptionItem({
        name: "X",
        posology: null,
        duration: null,
        continuous: false,
      }),
    ).toBe("");
  });
});
