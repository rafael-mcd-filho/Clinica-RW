import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { appendConsentEvidence } from "./consent-evidence";
import type { ConsentDetails, ConsentEvent } from "../clinical/consent";

const signed: ConsentEvent = {
  id: "event-example",
  event_type: "signed",
  signer_role: "guardian",
  signer_name: "Ana de Souza",
  signer_document: "Documento demonstrativo",
  guardian_relationship: "Mãe",
  signature: {
    method: "drawn",
    strokes: [
      [
        { x: 0.1, y: 0.5 },
        { x: 0.2, y: 0.2 },
        { x: 0.3, y: 0.8 },
        { x: 0.5, y: 0.4 },
        { x: 0.8, y: 0.5 },
      ],
    ],
  },
  reason: null,
  document_hash: "a".repeat(64),
  recorded_by_name: "Dra. Helena Teste",
  created_at: "2026-09-27T14:30:00Z",
};
const base: ConsentDetails = {
  id: "00000000-0000-4000-8000-000000000001",
  encounterId: "example",
  patientId: "example",
  title: "Termo de consentimento — demonstração",
  body: "Conteúdo demonstrativo revisado.",
  patientName: "Maria de Souza",
  procedure: "Procedimento de demonstração",
  issuedAt: "2026-09-27T14:00:00Z",
  timeZone: "America/Sao_Paulo",
  canManage: true,
  events: [],
};
describe("consent evidence PDF", () => {
  it.each(
    [
      [],
      [signed],
      [
        {
          ...signed,
          signature: { method: "typed" as const, name: "Ana de Souza" },
        },
      ],
    ].map((events) => ({ events })),
  )("renders pending and both signature methods (%#)", async ({ events }) => {
    const pdf = await PDFDocument.create();
    await appendConsentEvidence(pdf, { ...base, events });
    const reopened = await PDFDocument.load(await pdf.save());
    expect(reopened.getPageCount()).toBe(1);
    expect(reopened.getPage(0).getWidth()).toBeCloseTo(595.28);
  });
  it("paginates long revocation reasons without removing signed evidence", async () => {
    const pdf = await PDFDocument.create();
    pdf.addPage();
    await appendConsentEvidence(
      pdf,
      {
        ...base,
        events: [
          signed,
          {
            ...signed,
            id: "revocation",
            event_type: "revoked",
            signature: null,
            signer_name: null,
            reason: "Motivo detalhado com informações e confirmação. ".repeat(
              43,
            ),
            created_at: "2026-09-27T15:00:00Z",
          },
        ],
      },
      [595.28, 841.89],
    );
    const reopened = await PDFDocument.load(await pdf.save());
    expect(reopened.getPageCount()).toBeGreaterThan(2);
  });
});
