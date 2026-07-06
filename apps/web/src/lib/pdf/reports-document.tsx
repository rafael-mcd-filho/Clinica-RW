import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type * as React from "react";
import type { ReportData } from "@/lib/reports/phase13";

const styles = StyleSheet.create({
  body: {
    color: "#172033",
    fontFamily: "Helvetica",
    fontSize: 9,
    lineHeight: 1.35,
    padding: 36,
  },
  footer: {
    bottom: 22,
    color: "#64748b",
    fontSize: 7,
    left: 36,
    position: "absolute",
  },
  header: {
    borderBottomColor: "#d9e2ec",
    borderBottomWidth: 1,
    marginBottom: 18,
    paddingBottom: 12,
  },
  muted: {
    color: "#64748b",
    fontSize: 8,
  },
  row: {
    borderBottomColor: "#e2e8f0",
    borderBottomWidth: 1,
    flexDirection: "row",
    paddingBottom: 5,
    paddingTop: 5,
  },
  rowHeader: {
    backgroundColor: "#f1f5f9",
    color: "#334155",
    fontWeight: 700,
  },
  section: {
    marginBottom: 16,
  },
  table: {
    borderColor: "#e2e8f0",
    borderRadius: 5,
    borderWidth: 1,
    overflow: "hidden",
  },
  title: {
    color: "#0f172a",
    fontSize: 17,
    fontWeight: 700,
  },
  sectionTitle: {
    color: "#0f172a",
    fontSize: 12,
    fontWeight: 700,
    marginBottom: 7,
  },
  cell: {
    flex: 1,
    paddingHorizontal: 7,
  },
  wideCell: {
    flex: 1.6,
    paddingHorizontal: 7,
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

export function ReportsDocument({
  clinicName,
  data,
}: {
  clinicName: string;
  data: ReportData;
}) {
  return (
    <PdfDocument title="Relatorios">
      <PdfPage size="A4" style={styles.body}>
        <PdfView style={styles.header}>
          <PdfText style={styles.title}>Relatorios</PdfText>
          <PdfText style={styles.muted}>
            {clinicName} | {formatDate(data.filters.from)} a{" "}
            {formatDate(data.filters.to)}
          </PdfText>
        </PdfView>

        {data.operational ? (
          <PdfSection
            title="Operacional"
            rows={[
              ["Agendamentos", String(data.operational.totalAppointments)],
              ["Atendidos", String(data.operational.attended)],
              ["No-show", `${data.operational.noShowRate}%`],
              [
                "Ocupacao",
                data.operational.occupancyRate == null
                  ? "Sem escala"
                  : `${data.operational.occupancyRate}%`,
              ],
              ["Pacientes novos", String(data.operational.newPatients)],
              [
                "Pacientes recorrentes",
                String(data.operational.recurringPatients),
              ],
            ]}
          />
        ) : null}

        {data.financial ? (
          <PdfSection
            title="Financeiro"
            rows={[
              ["Recebido", formatCurrency(data.financial.revenue)],
              ["A receber", formatCurrency(data.financial.openReceivable)],
              [
                "Inadimplencia",
                formatCurrency(data.financial.overdueReceivable),
              ],
              ["Despesas pagas", formatCurrency(data.financial.expenses)],
              [
                "Repasses pendentes",
                formatCurrency(data.financial.pendingPayouts),
              ],
              ["Resultado", formatCurrency(data.financial.netResult)],
            ]}
          />
        ) : null}

        {data.clinical ? (
          <PdfSection
            title="Clinico"
            rows={[
              ["Atendimentos", String(data.clinical.totalEncounters)],
              ["Finalizados", String(data.clinical.finalizedEncounters)],
              ["Rascunhos", String(data.clinical.draftEncounters)],
              [
                "Tempo medio ate finalizar",
                data.clinical.averageCompletionHours == null
                  ? "0h"
                  : `${Math.round(data.clinical.averageCompletionHours * 10) / 10}h`,
              ],
            ]}
          />
        ) : null}

        <PdfView style={styles.section}>
          <PdfText style={styles.sectionTitle}>Por profissional</PdfText>
          <PdfView style={styles.table}>
            <PdfView style={[styles.row, styles.rowHeader]}>
              <PdfText style={styles.wideCell}>Profissional</PdfText>
              <PdfText style={styles.cell}>Consultas</PdfText>
              <PdfText style={styles.cell}>Receita</PdfText>
              <PdfText style={styles.cell}>Prontuarios</PdfText>
            </PdfView>
            {data.professionals.slice(0, 12).map((row) => (
              <PdfView key={row.professionalName} style={styles.row}>
                <PdfText style={styles.wideCell}>
                  {row.professionalName}
                </PdfText>
                <PdfText style={styles.cell}>{row.appointments}</PdfText>
                <PdfText style={styles.cell}>
                  {formatCurrency(row.revenue)}
                </PdfText>
                <PdfText style={styles.cell}>{row.finalizedEncounters}</PdfText>
              </PdfView>
            ))}
          </PdfView>
        </PdfView>

        <PdfText style={styles.footer}>
          Gerado pelo modulo de relatorios da clinica.
        </PdfText>
      </PdfPage>
    </PdfDocument>
  );
}

function PdfSection({
  rows,
  title,
}: {
  rows: Array<[string, string]>;
  title: string;
}) {
  return (
    <PdfView style={styles.section}>
      <PdfText style={styles.sectionTitle}>{title}</PdfText>
      <PdfView style={styles.table}>
        {rows.map(([label, value], index) => (
          <PdfView
            key={label}
            style={index === 0 ? [styles.row, styles.rowHeader] : styles.row}
          >
            <PdfText style={styles.wideCell}>{label}</PdfText>
            <PdfText style={styles.cell}>{value}</PdfText>
          </PdfView>
        ))}
      </PdfView>
    </PdfView>
  );
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number(value) || 0);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(
    new Date(`${value}T00:00:00Z`),
  );
}
