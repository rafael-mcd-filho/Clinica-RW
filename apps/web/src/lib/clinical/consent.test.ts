import { describe, expect, it } from "vitest";
import {
  consentEvidenceSchema,
  consentSignatureSchema,
  consentStatus,
} from "./consent";

const evidence = {
  signer_role: "patient",
  signer_name: "Maria Teste",
  signer_document: "RG exemplo",
  acknowledged: true,
  signature: { method: "typed", name: "Maria Teste" },
};

describe("consent evidence validation", () => {
  it("requires affirmative acknowledgement and identification", () => {
    expect(consentEvidenceSchema.safeParse(evidence).success).toBe(true);
    for (const acknowledged of [false, "true", undefined])
      expect(
        consentEvidenceSchema.safeParse({ ...evidence, acknowledged }).success,
      ).toBe(false);
    expect(
      consentEvidenceSchema.safeParse({ ...evidence, signer_document: "" })
        .success,
    ).toBe(false);
  });
  it("requires guardian relationship", () => {
    expect(
      consentEvidenceSchema.safeParse({ ...evidence, signer_role: "guardian" })
        .success,
    ).toBe(false);
    expect(
      consentEvidenceSchema.safeParse({
        ...evidence,
        signer_role: "guardian",
        guardian_relationship: "Mãe",
      }).success,
    ).toBe(true);
  });
  it("matches the typed signature to the identified signer after trimming", () => {
    expect(
      consentEvidenceSchema.safeParse({
        ...evidence,
        signature: { method: "typed", name: "Outra pessoa" },
      }).success,
    ).toBe(false);
    expect(
      consentEvidenceSchema.safeParse({
        ...evidence,
        signature: { method: "typed", name: " Maria Teste " },
      }).success,
    ).toBe(true);
  });
  it("rejects caller-supplied attribution", () => {
    expect(
      consentEvidenceSchema.safeParse({
        ...evidence,
        recorded_by_user_id: "forged",
      }).success,
    ).toBe(false);
  });
  it("accepts a complete drawing", () => {
    expect(
      consentSignatureSchema.safeParse({
        method: "drawn",
        strokes: [
          [
            { x: 0.1, y: 0.2 },
            { x: 0.3, y: 0.6 },
            { x: 0.5, y: 0.2 },
            { x: 0.8, y: 0.4 },
          ],
        ],
      }).success,
    ).toBe(true);
  });
  it.each(
    [
      [],
      [[{ x: 0.1, y: 0.1 }]],
      [
        [
          { x: 0.1, y: 0.1 },
          { x: 0.1, y: 0.1 },
          { x: 0.1, y: 0.1 },
          { x: 0.1, y: 0.1 },
        ],
      ],
      [
        [
          { x: -0.1, y: 0.1 },
          { x: 0.1, y: 0.5 },
          { x: 0.7, y: 0.1 },
          { x: 0.3, y: 0.1 },
        ],
      ],
      [Array.from({ length: 2049 }, (_, i) => ({ x: i % 2, y: 0.5 }))],
    ].map((strokes) => ({ strokes })),
  )("rejects incomplete or invalid drawings (%#)", ({ strokes }) => {
    expect(
      consentSignatureSchema.safeParse({ method: "drawn", strokes }).success,
    ).toBe(false);
  });
  it("derives current state by event time, not query order", () => {
    expect(consentStatus([])).toBe("pending");
    expect(
      consentStatus([
        { event_type: "revoked", created_at: "2026-09-27T15:00:00Z" },
        { event_type: "signed", created_at: "2026-09-27T14:00:00Z" },
      ]),
    ).toBe("revoked");
  });
});
