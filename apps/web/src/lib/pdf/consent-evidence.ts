import { PDFDocument, StandardFonts, rgb, type PDFPage } from "pdf-lib";
import {
  consentStatus,
  consentStatusLabels,
  type ConsentDetails,
} from "../clinical/consent";

/** Folha de evidencias; nao representa uma assinatura criptografica do PDF. */
export async function appendConsentEvidence(
  pdf: PDFDocument,
  details: ConsentDetails,
  size: [number, number] = [595.28, 841.89],
) {
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const margin = 48;
  const width = size[0] - margin * 2;
  let page!: PDFPage;
  let y = 0;
  let pageNumber = 0;
  const format = (value: string) =>
    new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
      timeZone: details.timeZone,
    }).format(new Date(value));
  const safe = (text: string) =>
    text.normalize("NFC").replace(/[^\x20-\x7E\u00A0-\u00FF\n]/g, " ");
  function startPage() {
    page = pdf.addPage(size);
    y = size[1] - margin;
    pageNumber++;
    page.drawText("Registro de consentimento", {
      x: margin,
      y,
      size: 16,
      font: bold,
    });
    y -= 28;
    page.drawText(`Evidências ${pageNumber} | Documento ${details.id}`, {
      x: margin,
      y: 25,
      font: regular,
      size: 8,
      color: rgb(0.35, 0.38, 0.43),
    });
  }
  function space(height: number) {
    if (y - height < 55) startPage();
  }
  function paragraph(text: string, emphasis = false, fontSize = 10) {
    const font = emphasis ? bold : regular;
    for (const source of safe(text).split("\n")) {
      let line = "";
      for (const word of source.split(/\s+/)) {
        const candidate = line ? `${line} ${word}` : word;
        if (font.widthOfTextAtSize(candidate, fontSize) <= width) {
          line = candidate;
          continue;
        }
        if (line) {
          space(fontSize + 5);
          page.drawText(line, { x: margin, y, font, size: fontSize });
          y -= fontSize + 5;
          line = "";
        }
        for (const char of word) {
          if (font.widthOfTextAtSize(line + char, fontSize) > width && line) {
            space(fontSize + 5);
            page.drawText(line, { x: margin, y, font, size: fontSize });
            y -= fontSize + 5;
            line = "";
          }
          line += char;
        }
      }
      space(fontSize + 5);
      page.drawText(line, { x: margin, y, font, size: fontSize });
      y -= fontSize + 5;
    }
    y -= 6;
  }
  startPage();
  paragraph(consentStatusLabels[consentStatus(details.events)], true, 12);
  paragraph(`Termo: ${details.title}`);
  paragraph(`Paciente: ${details.patientName}`);
  paragraph(`Procedimento / tratamento: ${details.procedure}`);
  paragraph(`Preparado em: ${format(details.issuedAt)}`);
  if (!details.events.length)
    paragraph("Este termo ainda não possui assinatura registrada.", true);
  for (const event of details.events) {
    space(65);
    paragraph(
      `${consentStatusLabels[event.event_type]} em ${format(event.created_at)}`,
      true,
    );
    paragraph(`Registrado por: ${event.recorded_by_name}`);
    if (event.event_type === "signed") {
      paragraph(
        `Signatário: ${event.signer_name} (${event.signer_role === "guardian" ? "responsável" : "paciente"})`,
      );
      paragraph(`Documento de identificação: ${event.signer_document}`);
      if (event.guardian_relationship)
        paragraph(`Vínculo com o paciente: ${event.guardian_relationship}`);
      paragraph(
        "Confirmação registrada: li o termo, pude esclarecer minhas dúvidas e concordo com o procedimento ou tratamento descrito.",
      );
      if (event.signature?.method === "drawn") {
        const boxWidth = Math.min(width, 360),
          boxHeight = (boxWidth - 16) * 0.24 + 16;
        space(boxHeight + 24);
        page.drawRectangle({
          x: margin,
          y: y - boxHeight,
          width: boxWidth,
          height: boxHeight,
          borderColor: rgb(0.75, 0.78, 0.82),
          borderWidth: 0.5,
        });
        for (const stroke of event.signature.strokes)
          for (let i = 1; i < stroke.length; i++) {
            page.drawLine({
              start: {
                x: margin + 8 + stroke[i - 1].x * (boxWidth - 16),
                y: y - 8 - stroke[i - 1].y * (boxHeight - 16),
              },
              end: {
                x: margin + 8 + stroke[i].x * (boxWidth - 16),
                y: y - 8 - stroke[i].y * (boxHeight - 16),
              },
              thickness: 1.1,
              color: rgb(0.05, 0.1, 0.2),
            });
          }
        y -= boxHeight + 16;
        paragraph("Método: assinatura desenhada no dispositivo.");
      } else if (event.signature?.method === "typed") {
        paragraph(event.signature.name, true, 14);
        paragraph("Método: assinatura por nome digitado.");
      }
    }
    if (event.reason) paragraph(`Motivo: ${event.reason}`);
    paragraph(
      `Integridade do conteúdo (SHA-256): ${event.document_hash}`,
      false,
      8,
    );
    y -= 8;
  }
  paragraph(
    "Coleta presencial registrada no sistema. Este arquivo não possui assinatura com certificado digital.",
    false,
    9,
  );
}
