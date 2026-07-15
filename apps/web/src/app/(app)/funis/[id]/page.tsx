import { notFound } from "next/navigation";
import { Settings } from "lucide-react";
import {
  FunnelBoard,
  stagnationDays,
  type FunnelBoardCard,
  type FunnelBoardStage,
} from "./funnel-board";
import { CreateCardDialog } from "./create-card-dialog";
import { StageSettingsDialog } from "./stage-settings-dialog";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { requireCompanyPermission } from "@/lib/authz/guards";
import { parseFunnelBoardAggregate } from "@/lib/funnels/aggregates";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type FunnelRow = {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
};
type StageRow = {
  id: string;
  name: string;
  color: string;
  position: number;
  stage_type: "initial" | "intermediate" | "success" | "failure";
  wip_limit: number | null;
};
type CardRow = {
  id: string;
  stage_id: string;
  patient_id: string;
  next_action: string | null;
  next_action_date: string | null;
  value: number | null;
  created_at: string;
  archived_at: string | null;
  patients: { full_name: string; social_name: string | null } | null;
  professionals: { name: string } | null;
};
type FunnelMovementRow = {
  card_id: string;
  from_stage_id: string | null;
  to_stage_id: string;
  moved_at: string;
};
type ProfessionalOption = { id: string; name: string };

function isCardStagnant(lastMovedAt: string) {
  const cutoff = Date.now() - stagnationDays * 24 * 60 * 60 * 1000;
  return new Date(lastMovedAt).getTime() < cutoff;
}

export default async function FunilBoardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const context = await requireCompanyPermission(["funil.ver"]);
  const { id } = await params;
  const canManage = context.permissionCodes.has("funil.gerenciar");
  const canConfigure = context.permissionCodes.has("funil.configurar");
  const canCreatePatient = context.permissionCodes.has("paciente.criar");
  const supabase = await createSupabaseServerClient();
  const organizationId = context.organization.id;

  const funnelResult = await supabase
    .from("funnels")
    .select("id, name, description, active")
    .eq("organization_id", organizationId)
    .eq("id", id)
    .maybeSingle<FunnelRow>();

  if (!funnelResult.data) notFound();
  const funnel = funnelResult.data;

  const [stagesResult, cardsResult, professionalsResult, aggregateResult] =
    await Promise.all([
      supabase
        .from("funnel_stages")
        .select("id, name, color, position, stage_type, wip_limit")
        .eq("organization_id", organizationId)
        .eq("funnel_id", id)
        .order("position")
        .returns<StageRow[]>(),
      supabase
        .from("funnel_cards")
        .select(
          "id, stage_id, patient_id, next_action, next_action_date, value, created_at, archived_at, patients(full_name, social_name), professionals(name)",
        )
        .eq("organization_id", organizationId)
        .eq("funnel_id", id)
        .returns<CardRow[]>(),
      supabase
        .from("professionals")
        .select("id, name")
        .eq("organization_id", organizationId)
        .returns<ProfessionalOption[]>(),
      supabase.rpc("funnel_board_aggregates", {
        p_organization_id: organizationId,
        p_funnel_id: id,
      }),
    ]);

  const stages = stagesResult.data ?? [];
  const cardRows = cardsResult.data ?? [];
  const cardIds = cardRows.map((row) => row.id);
  const aggregate = aggregateResult.error
    ? null
    : parseFunnelBoardAggregate(aggregateResult.data);

  const movementsResult =
    !aggregate && cardIds.length
      ? await supabase
          .from("funnel_card_movements")
          .select("card_id, from_stage_id, to_stage_id, moved_at")
          .eq("organization_id", organizationId)
          .in("card_id", cardIds)
          .returns<FunnelMovementRow[]>()
      : { data: [] as FunnelMovementRow[] };

  const lastMovedByCard = new Map<string, string>();
  if (aggregate) {
    for (const movement of aggregate.last_movements) {
      lastMovedByCard.set(movement.card_id, movement.moved_at);
    }
  } else {
    for (const movement of movementsResult.data ?? []) {
      const current = lastMovedByCard.get(movement.card_id);
      if (!current || movement.moved_at > current) {
        lastMovedByCard.set(movement.card_id, movement.moved_at);
      }
    }
  }

  const boardStages: FunnelBoardStage[] = stages;
  const boardCards: FunnelBoardCard[] = cardRows.map((row) => {
    const lastMovedAt = lastMovedByCard.get(row.id) ?? row.created_at;
    return {
      id: row.id,
      stage_id: row.stage_id,
      patient_id: row.patient_id,
      patient_name:
        row.patients?.social_name || row.patients?.full_name || "Paciente",
      assigned_professional_name: row.professionals?.name ?? null,
      next_action: row.next_action,
      next_action_date: row.next_action_date,
      value: row.value,
      archived_at: row.archived_at,
      last_moved_at: lastMovedAt,
      is_stagnant: isCardStagnant(lastMovedAt),
    };
  });
  const stageMetrics = aggregate
    ? Object.fromEntries(
        aggregate.stage_metrics.map((metric) => [
          metric.stage_id,
          {
            enteredCount: metric.entered_count,
            conversionRate: metric.conversion_rate,
            averageDurationHours: metric.average_duration_hours,
          },
        ]),
      )
    : buildStageMetrics(
        stages,
        cardRows.filter((row) => !row.archived_at),
        movementsResult.data ?? [],
      );

  const defaultStageId =
    stages.find((stage) => stage.stage_type === "initial")?.id ??
    stages[0]?.id ??
    "";

  return (
    <div className="grid gap-5">
      <PageHeader
        backHref="/funis"
        backLabel="Voltar para funis"
        title={
          <span className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="truncate">{funnel.name}</span>
            <Badge variant={funnel.active ? "success" : "neutral"}>
              {funnel.active ? "Ativo" : "Arquivado"}
            </Badge>
          </span>
        }
        description={funnel.description}
        actions={
          <>
            {canConfigure ? (
              <StageSettingsDialog funnelId={id} stages={stages} />
            ) : null}
            {canManage && defaultStageId ? (
              <CreateCardDialog
                funnelId={id}
                stages={stages}
                defaultStageId={defaultStageId}
                professionals={professionalsResult.data ?? []}
                canCreatePatient={canCreatePatient}
              />
            ) : null}
          </>
        }
      />

      {stages.length ? (
        <FunnelBoard
          organizationId={organizationId}
          funnelId={id}
          stages={boardStages}
          cards={boardCards}
          stageMetrics={stageMetrics}
          canManage={canManage}
        />
      ) : (
        <div className="rounded-lg border border-dashed border-border bg-muted/20 p-10 text-center">
          <Settings
            className="mx-auto size-8 text-muted-foreground"
            aria-hidden="true"
          />
          <p className="mt-3 text-sm font-medium">
            Este funil ainda não tem etapas
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {canConfigure
              ? "Use o botão de configurações para adicionar etapas."
              : "Peça a um administrador para configurar as etapas."}
          </p>
        </div>
      )}
    </div>
  );
}

function buildStageMetrics(
  stages: StageRow[],
  cards: CardRow[],
  movements: FunnelMovementRow[],
) {
  const stageTypeById = new Map(
    stages.map((stage) => [stage.id, stage.stage_type]),
  );
  const visitsByStage = new Map<
    string,
    Array<{
      enteredAt: string;
      exitedAt: string | null;
      nextStageId: string | null;
    }>
  >();
  const movementsByCard = new Map<string, FunnelMovementRow[]>();

  for (const movement of movements) {
    const list = movementsByCard.get(movement.card_id) ?? [];
    list.push(movement);
    movementsByCard.set(movement.card_id, list);
  }

  for (const card of cards) {
    const cardMovements = (movementsByCard.get(card.id) ?? []).sort((a, b) =>
      a.moved_at.localeCompare(b.moved_at),
    );
    let currentStageId = cardMovements[0]?.from_stage_id ?? card.stage_id;
    let enteredAt = card.created_at;

    for (const movement of cardMovements) {
      const stageId = movement.from_stage_id ?? currentStageId;
      if (stageId) {
        const list = visitsByStage.get(stageId) ?? [];
        list.push({
          enteredAt,
          exitedAt: movement.moved_at,
          nextStageId: movement.to_stage_id,
        });
        visitsByStage.set(stageId, list);
      }
      currentStageId = movement.to_stage_id;
      enteredAt = movement.moved_at;
    }

    const openStageId = card.stage_id || currentStageId;
    if (openStageId) {
      const list = visitsByStage.get(openStageId) ?? [];
      list.push({ enteredAt, exitedAt: null, nextStageId: null });
      visitsByStage.set(openStageId, list);
    }
  }

  return stages.reduce<Record<string, FunnelBoardStage["metrics"]>>(
    (result, stage) => {
      const visits = visitsByStage.get(stage.id) ?? [];
      const exitedVisits = visits.filter((visit) => visit.exitedAt);
      const convertedVisits = exitedVisits.filter(
        (visit) => stageTypeById.get(visit.nextStageId ?? "") !== "failure",
      );
      const durations = exitedVisits
        .map((visit) => {
          const enteredAt = new Date(visit.enteredAt).getTime();
          const exitedAt = new Date(visit.exitedAt ?? "").getTime();
          return exitedAt > enteredAt ? exitedAt - enteredAt : 0;
        })
        .filter((value) => value > 0);

      result[stage.id] = {
        enteredCount: visits.length,
        conversionRate: visits.length
          ? Math.round((convertedVisits.length / visits.length) * 100)
          : null,
        averageDurationHours: durations.length
          ? Math.round(
              durations.reduce((sum, value) => sum + value, 0) /
                durations.length /
                36_000,
            ) / 100
          : null,
      };
      return result;
    },
    {},
  );
}
