import { getRequestContext } from "@/lib/auth/context";
import {
  appointmentRowsToCsv,
  buildAppointmentSummaryData,
  resolveAppointmentSummaryFilters,
} from "@/lib/reports/appointments-summary";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const context = await getRequestContext();
  if (
    !context.organization ||
    !context.permissionCodes.has("relatorio.operacional") ||
    !context.permissionCodes.has("relatorio.exportar")
  ) {
    return new Response("Acesso negado.", { status: 403 });
  }

  const url = new URL(request.url);
  const filters = resolveAppointmentSummaryFilters(url.searchParams);
  const supabase = await createSupabaseServerClient();
  const data = await buildAppointmentSummaryData({
    filters,
    organizationId: context.organization.id,
    supabase,
  });
  const csv = appointmentRowsToCsv(data.rows);

  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="resumo-agendamentos-${filters.from}-${filters.to}.csv"`,
    },
  });
}
