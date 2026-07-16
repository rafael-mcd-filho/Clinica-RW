import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import { createElement, type ReactElement } from "react";
import { ReportsDocument } from "@/lib/pdf/reports-document";
import {
  buildPhase13ReportData,
  hasAnyReportPermission,
  resolveReportFilters,
  resolveReportPermissions,
  type ReportData,
} from "@/lib/reports/phase13";
import { getRequestContext } from "@/lib/auth/context";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const format = url.searchParams.get("format") ?? "pdf";
  const context = await getRequestContext();

  if (context.isSuperAdmin || !context.organization) {
    return new Response(
      "Relatorios disponiveis apenas no contexto da empresa.",
      {
        status: 403,
      },
    );
  }

  const permissions = resolveReportPermissions(context.permissionCodes);
  if (!hasAnyReportPermission(permissions) || !permissions.export) {
    return new Response("Acesso negado.", { status: 403 });
  }

  const filters = resolveReportFilters(url.searchParams);
  const supabase = await createSupabaseServerClient();
  const data = await buildPhase13ReportData({
    filters,
    organizationId: context.organization.id,
    permissions,
    supabase,
  });
  const clinicName = context.organization.name;

  if (format === "xls") {
    return new Response(buildExcelHtml(data, clinicName), {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Disposition": `attachment; filename="relatorios-${filters.from}-${filters.to}.xls"`,
        "Content-Type": "application/vnd.ms-excel; charset=utf-8",
      },
    });
  }

  if (format !== "pdf") {
    return new Response("Formato invalido.", { status: 400 });
  }

  const pdfBytes = await renderToBuffer(
    createElement(ReportsDocument, {
      clinicName,
      data,
    }) as unknown as ReactElement<DocumentProps>,
  );
  const body = new Uint8Array(pdfBytes).buffer;

  return new Response(body, {
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Disposition": `inline; filename="relatorios-${filters.from}-${filters.to}.pdf"`,
      "Content-Type": "application/pdf",
    },
  });
}

function buildExcelHtml(data: ReportData, clinicName: string) {
  const sections = [
    data.operational
      ? tableHtml("Operacional", [
          ["Agendamentos", data.operational.totalAppointments],
          ["Atendidos", data.operational.attended],
          ["No-show", `${data.operational.noShowRate}%`],
          [
            "Ocupacao",
            data.operational.occupancyRate == null
              ? "Sem escala"
              : `${data.operational.occupancyRate}%`,
          ],
          ["Pacientes novos", data.operational.newPatients],
          ["Pacientes recorrentes", data.operational.recurringPatients],
        ])
      : "",
    data.financial
      ? tableHtml("Financeiro", [
          ["Recebido", formatCurrency(data.financial.revenue)],
          ["A receber", formatCurrency(data.financial.openReceivable)],
          ["Inadimplencia", formatCurrency(data.financial.overdueReceivable)],
          ["Despesas pagas", formatCurrency(data.financial.expenses)],
          ["Repasses pendentes", formatCurrency(data.financial.pendingPayouts)],
          ["Resultado", formatCurrency(data.financial.netResult)],
        ])
      : "",
    data.clinical
      ? tableHtml("Clinico", [
          ["Atendimentos", data.clinical.totalEncounters],
          ["Finalizados", data.clinical.finalizedEncounters],
          ["Rascunhos", data.clinical.draftEncounters],
          [
            "Tempo medio ate finalizar",
            data.clinical.averageCompletionHours == null
              ? "0h"
              : `${Math.round(data.clinical.averageCompletionHours * 10) / 10}h`,
          ],
        ])
      : "",
    professionalTableHtml(data),
  ].join("");

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    body { font-family: Arial, sans-serif; }
    h1 { font-size: 20px; }
    h2 { font-size: 16px; margin-top: 24px; }
    table { border-collapse: collapse; margin-bottom: 16px; width: 100%; }
    th, td { border: 1px solid #cbd5e1; padding: 6px 8px; text-align: left; }
    th { background: #f1f5f9; }
  </style>
</head>
<body>
  <h1>Relatorios - ${escapeHtml(clinicName)}</h1>
  <p>${formatDate(data.filters.from)} a ${formatDate(data.filters.to)}</p>
  ${sections}
</body>
</html>`;
}

function tableHtml(title: string, rows: Array<[string, string | number]>) {
  return `<h2>${escapeHtml(title)}</h2>
<table>
  <thead><tr><th>Indicador</th><th>Valor</th></tr></thead>
  <tbody>
    ${rows
      .map(
        ([label, value]) =>
          `<tr><td>${escapeHtml(label)}</td><td>${escapeHtml(String(value))}</td></tr>`,
      )
      .join("")}
  </tbody>
</table>`;
}

function professionalTableHtml(data: ReportData) {
  return `<h2>Por profissional</h2>
<table>
  <thead>
    <tr>
      <th>Profissional</th>
      <th>Consultas</th>
      <th>Atendidas</th>
      <th>No-show</th>
      <th>Faturamento</th>
      <th>Prontuarios</th>
    </tr>
  </thead>
  <tbody>
    ${data.professionals
      .map(
        (row) => `<tr>
          <td>${escapeHtml(row.professionalName)}</td>
          <td>${row.appointments}</td>
          <td>${row.attended}</td>
          <td>${row.noShowRate}%</td>
          <td>${escapeHtml(formatCurrency(row.revenue))}</td>
          <td>${row.finalizedEncounters}</td>
        </tr>`,
      )
      .join("")}
  </tbody>
</table>`;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
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
