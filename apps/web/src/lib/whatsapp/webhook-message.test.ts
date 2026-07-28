import { describe, expect, it } from "vitest";
import { parseEvolutionUpsertMessage } from "./webhook-message";

describe("parseEvolutionUpsertMessage", () => {
  it("keeps messages sent by the connected phone as outbound", () => {
    const parsed = parseEvolutionUpsertMessage("clinica-rw", {
      key: {
        id: "PHONE-MESSAGE-1",
        remoteJid: "5585999990001@s.whatsapp.net",
        fromMe: true,
      },
      pushName: "Clínica RW",
      messageTimestamp: 1_721_234_567,
      message: { conversation: "Mensagem enviada pelo celular" },
    });

    expect(parsed).toMatchObject({
      direction: "outbound",
      phone: "5585999990001",
      waName: null,
      waMessageId: "PHONE-MESSAGE-1",
      type: "text",
      body: "Mensagem enviada pelo celular",
    });
  });

  it("keeps contact messages inbound and preserves the contact name", () => {
    const parsed = parseEvolutionUpsertMessage("clinica-rw", {
      key: {
        id: "INBOUND-1",
        remoteJid: "5585999990002@s.whatsapp.net",
        fromMe: false,
      },
      pushName: "Maria",
      message: { extendedTextMessage: { text: "Olá" } },
    });

    expect(parsed).toMatchObject({
      direction: "inbound",
      waName: "Maria",
      type: "text",
      body: "Olá",
    });
  });

  it("unwraps media messages and accepts Evolution array payloads", () => {
    const parsed = parseEvolutionUpsertMessage("clinica-rw", [
      {
        key: {
          id: "PHONE-IMAGE-1",
          remoteJid: "5585999990003@s.whatsapp.net",
          fromMe: true,
        },
        message: {
          viewOnceMessageV2: {
            message: {
              imageMessage: {
                caption: "Exame",
                mimetype: "image/jpeg",
              },
            },
          },
        },
      },
    ]);

    expect(parsed).toMatchObject({
      direction: "outbound",
      type: "image",
      body: "Exame",
      mediaMimeType: "image/jpeg",
    });
  });

  it("ignores groups and status broadcasts", () => {
    expect(
      parseEvolutionUpsertMessage("clinica-rw", {
        key: { remoteJid: "123@g.us", fromMe: false },
      }),
    ).toBeNull();
    expect(
      parseEvolutionUpsertMessage("clinica-rw", {
        key: { remoteJid: "status@broadcast", fromMe: false },
      }),
    ).toBeNull();
  });
});
