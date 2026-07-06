import { CreateFunnelDialog } from "./create-funnel-dialog";
import { PanelsList, type PanelRow } from "./panels-list";
import { requireCompanyPermission } from "@/lib/authz/guards";
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

  const [funnelsResult, cardsResult] = await Promise.all([
    supabase
      .from("funnels")
      .select("id, name, description, active, created_at")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .returns<FunnelRow[]>(),
    supabase
      .from("funnel_cards")
      .select("funnel_id")
      .eq("organization_id", organizationId)
      .is("archived_at", null)
      .returns<CardCountRow[]>(),
  ]);

  const cardCountByFunnel = new Map<string, number>();
  for (const row of cardsResult.data ?? []) {
    cardCountByFunnel.set(
      row.funnel_id,
      (cardCountByFunnel.get(row.funnel_id) ?? 0) + 1,
    );
  }

  const panels = (funnelsResult.data ?? []).map<PanelRow>((funnel) => ({
    ...funnel,
    activeCardCount: cardCountByFunnel.get(funnel.id) ?? 0,
  }));

  return (
    <div className="grid gap-6">
      <section>
        <div>
          <h1 className="text-heading-lg font-semibold text-foreground">
            Painéis
          </h1>
          <p className="mt-1 text-body text-muted-foreground">
            Controle suas vendas, crie funis, tarefas e atividades utilizando os
            novos painéis
          </p>
        </div>
      </section>

      <PanelsList
        panels={panels}
        canConfigure={canConfigure}
        action={canConfigure ? <CreateFunnelDialog /> : null}
      />
    </div>
  );
}
