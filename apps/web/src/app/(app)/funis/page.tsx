import { PanelsTopLeft } from "lucide-react";
import { CreateFunnelDialog } from "./create-funnel-dialog";
import { PanelsList, type PanelRow } from "./panels-list";
import { PageHeader } from "@/components/ui/page-header";
import { requireCompanyPermission } from "@/lib/authz/guards";
import { parseFunnelPanelCardCounts } from "@/lib/funnels/panel-counts";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type FunnelRow = {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
  created_at: string;
};

type CardCountRow = { funnel_id: string };

export default async function FunisPage() {
  const context = await requireCompanyPermission(["funil.ver"]);
  const canConfigure = context.permissionCodes.has("funil.configurar");
  const supabase = await createSupabaseServerClient();
  const organizationId = context.organization.id;

  const [funnelsResult, cardCountByFunnel] = await Promise.all([
    supabase
      .from("funnels")
      .select("id, name, description, active, created_at")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .returns<FunnelRow[]>(),
    loadActiveCardCounts(supabase, organizationId),
  ]);

  const panels = (funnelsResult.data ?? []).map<PanelRow>((funnel) => ({
    ...funnel,
    activeCardCount: cardCountByFunnel.get(funnel.id) ?? 0,
  }));

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Painéis"
        description="Controle vendas, jornadas, tarefas e atividades em um só lugar."
        icon={PanelsTopLeft}
      />

      <PanelsList
        panels={panels}
        canConfigure={canConfigure}
        action={canConfigure ? <CreateFunnelDialog /> : null}
      />
    </div>
  );
}

async function loadActiveCardCounts(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  organizationId: string,
) {
  const aggregateResult = await supabase.rpc("funnel_panel_card_counts", {
    p_organization_id: organizationId,
  });
  const aggregate = aggregateResult.error
    ? null
    : parseFunnelPanelCardCounts(aggregateResult.data);

  if (aggregate) {
    return new Map(
      aggregate.map((row) => [row.funnel_id, row.active_card_count]),
    );
  }

  // Compatibility fallback while the aggregate RPC is being deployed.
  const fallbackResult = await supabase
    .from("funnel_cards")
    .select("funnel_id")
    .eq("organization_id", organizationId)
    .is("archived_at", null)
    .returns<CardCountRow[]>();
  const fallback = new Map<string, number>();

  for (const row of fallbackResult.data ?? []) {
    fallback.set(row.funnel_id, (fallback.get(row.funnel_id) ?? 0) + 1);
  }

  return fallback;
}
