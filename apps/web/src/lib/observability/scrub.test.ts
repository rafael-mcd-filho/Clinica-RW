import { describe, expect, it } from "vitest";
import { scrubContext, scrubText } from "./scrub";

describe("scrubText", () => {
  it("tira contato, documentos e tokens", () => {
    expect(
      scrubText(
        "Falha ao enviar para maria.silva@email.com (11) 98765-4321, CPF 529.982.247-25, CNPJ 11.222.333/0001-81, Bearer abc.def-123 eyJhbGciOi.eyJzdWIi.c2ln",
      ),
    ).toBe(
      "Falha ao enviar para [e-mail] [telefone], CPF [cpf], CNPJ [cnpj], Bearer [token] [token]",
    );
    expect(scrubText("instância 5511987654321 caiu")).toBe(
      "instância [número] caiu",
    );
  });

  it("mantém o que ajuda a investigar", () => {
    expect(
      scrubText(
        "job 3f2a9c1e-7b4d-4e8a-9f10-2b3c4d5e6f70 falhou após 5 tentativas",
      ),
    ).toBe("job 3f2a9c1e-7b4d-4e8a-9f10-2b3c4d5e6f70 falhou após 5 tentativas");
  });

  it("corta textos longos", () => {
    expect(scrubText("a".repeat(600), 10)).toBe("aaaaaaaaaa…");
  });
});

describe("scrubContext", () => {
  it("remove campos pessoais e limpa o resto", () => {
    expect(
      scrubContext({
        patient_name: "Maria",
        email: "x@y.com",
        body: "Paciente com dor",
        code: "PGRST116",
        status: 500,
        ok: false,
        detail: "ligar para 11987654321",
        missing: undefined,
      }),
    ).toEqual({
      patient_name: "[removido]",
      email: "[removido]",
      body: "[removido]",
      code: "PGRST116",
      status: 500,
      ok: false,
      detail: "ligar para [número]",
    });
  });
});
