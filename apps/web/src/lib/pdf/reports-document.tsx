import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type * as React from "react";
import { pdfTheme } from "@/lib/pdf/pdf-theme";
import type { ReportData } from "@/lib/reports/phase13";

const styles = StyleSheet.create({
  body: {
    color: pdfTheme.colors.foreground,
    fontFamily: pdfTheme.font.family,
    fontSize: pdfTheme.text.body,
    lineHeight: 1.35,
    padding: pdfTheme.spacing.page,
  },
  footer: {
    bottom: 22,
    color: pdfTheme.colors.muted,
    fontSize: pdfTheme.text.caption,
    left: pdfTheme.spacing.page,
    position: "absolute",
  },
  header: {
    borderBottomColor: pdfTheme.colors.border,
    borderBottomWidth: 1,
    marginBottom: 18,
    paddingBottom: 12,
  },
  muted: {
    color: pdfTheme.colors.muted,
    fontSize: pdfTheme.text.label,
  },
  row: {
    borderBottomColor: pdfTheme.colors.border,
    borderBottomWidth: 1,
    flexDirection: "row",
    paddingBottom: 5,
    paddingTop: 5,
  },
  rowHeader: {
    backgroundColor: pdfTheme.colors.surface,
    color: pdfTheme.colors.secondary,
    fontWeight: 700,
  },
  section: {
    marginBottom: pdfTheme.spacing.section,
  },
  table: {
    borderColor: pdfTheme.colors.border,
    borderRadius: 5,
    borderWidth: 1,
    overflow: "hidden",
  },
  title: {
    color: pdfTheme.colors.heading,
    fontSize: pdfTheme.text.title,
    fontWeight: 700,
  },
  sectionTitle: {
    color: pdfTheme.colors.heading,
    fontSize: pdfTheme.text.heading,
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
    <PdfDocument title="Relatórios">
      <PdfPage size="A4" style={styles.body}>
        <PdfView style={styles.header}>
          <PdfText style={styles.title}>Relatórios</PdfText>
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
                "Ocupação",
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
                "Inadimplência",
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
            title="Clínico"
            rows={[
              ["Atendimentos", String(data.clinical.totalEncounters)],
              ["Finalizados", String(data.clinical.finalizedEncounters)],
              ["Rascunhos", String(data.clinical.draftEncounters)],
              [
                "Tempo médio até finalizar",
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
              <PdfText style={styles.cell}>Prontuários</PdfText>
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
          Gerado pelo módulo de relatórios da clínica.
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
