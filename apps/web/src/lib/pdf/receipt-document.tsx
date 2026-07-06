import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type * as React from "react";

export type ReceiptPdfData = {
  clinic: {
    city: string | null;
    document: string | null;
    email: string | null;
    legal_name: string | null;
    phone: string | null;
    state: string | null;
    trade_name: string;
  } | null;
  methodName: string;
  patient: {
    cpf: string | null;
    full_name: string;
    social_name: string | null;
  };
  payment: {
    amount: number;
    id: string;
    paid_at: string;
  };
  professionalName: string | null;
  receivable: {
    amount: number;
    description: string;
  };
};

const styles = StyleSheet.create({
  amountBox: {
    borderColor: "#cbd5e1",
    borderRadius: 6,
    borderWidth: 1,
    marginTop: 18,
    padding: 16,
  },
  amountLabel: {
    color: "#64748b",
    fontSize: 10,
  },
  amountValue: {
    color: "#0f172a",
    fontSize: 20,
    fontWeight: 700,
    marginTop: 8,
  },
  body: {
    color: "#172033",
    fontFamily: "Helvetica",
    fontSize: 11,
    lineHeight: 1.45,
    padding: 48,
  },
  footer: {
    bottom: 28,
    color: "#64748b",
    fontSize: 7,
    left: 48,
    position: "absolute",
  },
  header: {
    borderBottomColor: "#d9e2ec",
    borderBottomWidth: 1,
    paddingBottom: 16,
  },
  line: {
    marginTop: 7,
  },
  muted: {
    color: "#64748b",
    fontSize: 8,
    marginTop: 4,
  },
  signature: {
    alignItems: "center",
    marginTop: 96,
  },
  signatureLine: {
    borderTopColor: "#334155",
    borderTopWidth: 1,
    width: 235,
  },
  signatureText: {
    fontSize: 10,
    marginTop: 10,
  },
  title: {
    color: "#0f172a",
    fontSize: 18,
    fontWeight: 700,
    marginBottom: 32,
    marginTop: 34,
    textAlign: "center",
  },
  tradeName: {
    color: "#0f172a",
    fontSize: 15,
    fontWeight: 700,
  },
});

type PdfComponentProps = {
  children?: React.ReactNode;
  style?: unknown;
};

const PdfDocument = Document as unknown as React.ComponentType<
  PdfComponentProps & { title?: string }
>;
const PdfPage = Page as unknown as React.ComponentType<
  PdfComponentProps & { size?: string }
>;
const PdfText = Text as unknown as React.ComponentType<PdfComponentProps>;
const PdfView = View as unknown as React.ComponentType<PdfComponentProps>;

export function ReceiptDocument({ data }: { data: ReceiptPdfData }) {
  const clinicName = data.clinic?.trade_name ?? "Clinica";
  const clinicDetails = [
    data.clinic?.legal_name,
    data.clinic?.document ? `CNPJ ${data.clinic.document}` : null,
    data.clinic?.phone,
    data.clinic?.email,
    [data.clinic?.city, data.clinic?.state].filter(Boolean).join(" - ") || null,
  ]
    .filter(Boolean)
    .join(" | ");

  return (
    <PdfDocument title={`Recibo ${data.payment.id}`}>
      <PdfPage size="A4" style={styles.body}>
        <PdfView style={styles.header}>
          <PdfText style={styles.tradeName}>{clinicName}</PdfText>
          {clinicDetails ? (
            <PdfText style={styles.muted}>{clinicDetails}</PdfText>
          ) : null}
        </PdfView>

        <PdfText style={styles.title}>Recibo de pagamento</PdfText>

        <PdfText style={styles.line}>
          Recebemos de: {data.patient.social_name || data.patient.full_name}
        </PdfText>
        {data.patient.cpf ? (
          <PdfText style={styles.line}>CPF: {data.patient.cpf}</PdfText>
        ) : null}
        <PdfText style={styles.line}>
          Referente a: {data.receivable.description}
        </PdfText>
        {data.professionalName ? (
          <PdfText style={styles.line}>
            Profissional: {data.professionalName}
          </PdfText>
        ) : null}
        <PdfText style={styles.line}>
          Forma de pagamento: {data.methodName}
        </PdfText>
        <PdfText style={styles.line}>
          Data do pagamento: {formatDateTime(data.payment.paid_at)}
        </PdfText>

        <PdfView style={styles.amountBox}>
          <PdfText style={styles.amountLabel}>Valor recebido</PdfText>
          <PdfText style={styles.amountValue}>
            {formatCurrency(data.payment.amount)}
          </PdfText>
        </PdfView>

        <PdfView style={styles.signature}>
          <PdfView style={styles.signatureLine} />
          <PdfText style={styles.signatureText}>{clinicName}</PdfText>
        </PdfView>

        <PdfText style={styles.footer}>Recibo {data.payment.id}</PdfText>
      </PdfPage>
    </PdfDocument>
  );
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number(value) || 0);
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Fortaleza",
  }).format(new Date(value));
}
