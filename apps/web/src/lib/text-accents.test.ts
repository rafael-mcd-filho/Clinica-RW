import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Raio-X N6: texto da interface sem acento ("Nao informado", "Usuario",
 * "periodo") passa descuido, inclusive para o paciente. Este teste procura
 * palavras comuns sem acento nas frases do código e falha se alguma voltar.
 *
 * Ficam de fora: comparação com mensagens cruas do banco (".includes(" e
 * "message"), texto já normalizado sem acento de propósito (allergy-check),
 * caminhos e códigos de permissão (sem espaço).
 */
const root = join(__dirname, "..");

const unaccented = [
  "nao",
  "voce",
  "periodo",
  "usuario",
  "usuarios",
  "solicitacao",
  "informacoes",
  "permissao",
  "invalido",
  "invalida",
  "obrigatorio",
  "obrigatoria",
  "descricao",
  "endereco",
  "atencao",
  "sessao",
  "historico",
  "numero",
  "conteudo",
  "proprio",
  "propria",
  "tambem",
  "sera",
  "apos",
  "ola",
  "convenio",
  "convenios",
  "inadimplencia",
  "prontuarios",
  "codigo",
];
const pattern = new RegExp(
  `(?<![\\w-])(${unaccented.join("|")})(?![\\w-])`,
  "i",
);
const stringPattern =
  /"([^"\n]*\s[^"\n]*)"|`([^`\n]*\s[^`\n]*)`|>([^<>{}\n]*\s[^<>{}\n]*)</g;
const ignoredFiles = [/\.test\.tsx?$/, /allergy-check\.ts$/];
const ignoredLine = /\.includes\(|message\.|^\s*(\/\/|\*|\/\*|import )/;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(name) ? [path] : [];
  });
}

describe("textos da interface", () => {
  it("não têm palavras comuns sem acento", () => {
    const findings: string[] = [];
    for (const file of sourceFiles(root)) {
      const name = relative(root, file);
      if (ignoredFiles.some((rule) => rule.test(name))) continue;
      readFileSync(file, "utf8")
        .split("\n")
        .forEach((line, index) => {
          if (ignoredLine.test(line)) return;
          for (const match of line.matchAll(stringPattern)) {
            const text = match[1] ?? match[2] ?? match[3] ?? "";
            const word = text.match(pattern)?.[0];
            if (word)
              findings.push(
                `${name}:${index + 1} "${word}" em: ${text.trim()}`,
              );
          }
        });
    }
    expect(findings).toEqual([]);
  });
});
