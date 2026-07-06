"use client";

import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  rectIntersection,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Archive,
  ArrowUpFromLine,
  CalendarDays,
  Columns3,
  Filter,
  GripVertical,
  Inbox,
  List,
  MessageCircle,
  MoreVertical,
  Search,
  User,
} from "lucide-react";
import { toast } from "sonner";
import { moveCard } from "../actions";
import { CardPanel } from "./card-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { cn } from "@/lib/utils";

export type FunnelBoardStage = {
  id: string;
  name: string;
  color: string;
  position: number;
  stage_type: "initial" | "intermediate" | "success" | "failure";
  wip_limit: number | null;
  metrics?: {
    enteredCount: number;
    conversionRate: number | null;
    averageDurationHours: number | null;
  };
};

export type FunnelBoardCard = {
  id: string;
  stage_id: string;
  patient_id: string;
  patient_name: string;
  assigned_professional_name: string | null;
  next_action: string | null;
  next_action_date: string | null;
  value: number | null;
  archived_at: string | null;
  last_moved_at: string;
  is_stagnant: boolean;
};

type BoardFilters = {
  query: string;
  professional: string;
  onlyStagnant: boolean;
  onlyWithValue: boolean;
  showArchived: boolean;
};

export const stagnationDays = 7;

const boardCollisionDetection: CollisionDetection = (args) => {
  const pointerCollisions = pointerWithin(args);
  return pointerCollisions.length ? pointerCollisions : rectIntersection(args);
};

const initialFilters: BoardFilters = {
  query: "",
  professional: "all",
  onlyStagnant: false,
  onlyWithValue: false,
  showArchived: false,
};

export function FunnelBoard({
  organizationId,
  funnelId,
  stages,
  cards,
  stageMetrics,
  canManage,
}: {
  organizationId: string;
  funnelId: string;
  stages: FunnelBoardStage[];
  cards: FunnelBoardCard[];
  stageMetrics: Record<string, FunnelBoardStage["metrics"]>;
  canManage: boolean;
}) {
  const router = useRouter();
  const [cardsByStage, setCardsByStage] = useState(() =>
    groupByStage(stages, cards),
  );
  const [syncedCards, setSyncedCards] = useState(cards);
  const [syncedStages, setSyncedStages] = useState(stages);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  const [view, setView] = useState<"kanban" | "list">("kanban");
  const [filters, setFilters] = useState<BoardFilters>(initialFilters);
  const dragOriginStageRef = useRef<string | null>(null);
  const dragSnapshotRef = useRef<Record<string, FunnelBoardCard[]> | null>(
    null,
  );
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  if (cards !== syncedCards || stages !== syncedStages) {
    setSyncedCards(cards);
    setSyncedStages(stages);
    setCardsByStage(groupByStage(stages, cards));
  }

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    const channel = supabase
      .channel(`funil:${funnelId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "funnel_cards",
          filter: `organization_id=eq.${organizationId}`,
        },
        () => router.refresh(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [funnelId, organizationId, router]);

  const allCards = useMemo(
    () => Object.values(cardsByStage).flat(),
    [cardsByStage],
  );
  const selectedCard =
    allCards.find((card) => card.id === selectedCardId) ?? null;
  const activeCard = allCards.find((card) => card.id === activeCardId) ?? null;

  const professionalOptions = useMemo(
    () =>
      Array.from(
        new Set(
          allCards
            .map((card) => card.assigned_professional_name)
            .filter((value): value is string => Boolean(value)),
        ),
      ).sort((a, b) => a.localeCompare(b)),
    [allCards],
  );

  const visibleCardsByStage = useMemo(() => {
    const next: Record<string, FunnelBoardCard[]> = {};
    for (const stage of stages) {
      next[stage.id] = (cardsByStage[stage.id] ?? []).filter((card) =>
        cardMatchesFilters(card, filters),
      );
    }
    return next;
  }, [cardsByStage, filters, stages]);

  const visibleCards = useMemo(
    () => Object.values(visibleCardsByStage).flat(),
    [visibleCardsByStage],
  );

  function updateFilters(patch: Partial<BoardFilters>) {
    setFilters((current) => ({ ...current, ...patch }));
  }

  function handleDragStart(event: DragStartEvent) {
    if (!canManage) return;
    const cardId = String(event.active.id);
    const originStageId = findStageIdForCard(cardsByStage, cardId);
    dragOriginStageRef.current = originStageId ?? null;
    dragSnapshotRef.current = cardsByStage;
    setActiveCardId(cardId);
  }

  function handleDragOver(event: DragOverEvent) {
    if (!canManage || !event.over) return;
    const cardId = String(event.active.id);
    const targetStageId = findTargetStageId(
      String(event.over.id),
      cardsByStage,
      stages,
    );
    if (!targetStageId) return;

    setCardsByStage((current) => {
      const sourceStageId = findStageIdForCard(current, cardId);
      if (!sourceStageId || sourceStageId === targetStageId) return current;
      const targetStage = stages.find((stage) => stage.id === targetStageId);
      const targetCount = (current[targetStageId] ?? []).filter(
        (card) => card.id !== cardId,
      ).length;
      if (
        targetStage?.wip_limit != null &&
        targetCount >= targetStage.wip_limit
      ) {
        return current;
      }
      return moveCardBetweenStages(current, cardId, targetStageId);
    });
  }

  async function handleDragEnd(event: DragEndEvent) {
    if (!canManage) return resetDragState();

    const cardId = String(event.active.id);
    const originStageId = dragOriginStageRef.current;
    const dropStageId = event.over
      ? findTargetStageId(String(event.over.id), cardsByStage, stages)
      : null;
    const finalStageId =
      dropStageId ?? findStageIdForCard(cardsByStage, cardId);
    const snapshot = dragSnapshotRef.current;

    if (!event.over || !originStageId || !finalStageId) {
      if (snapshot) setCardsByStage(snapshot);
      return resetDragState();
    }

    if (originStageId === finalStageId) {
      return resetDragState();
    }

    const targetStage = stages.find((stage) => stage.id === finalStageId);
    const targetCount =
      (cardsByStage[finalStageId] ?? []).filter((card) => card.id !== cardId)
        .length + 1;
    if (targetStage?.wip_limit != null && targetCount > targetStage.wip_limit) {
      toast.error("Esta etapa atingiu o limite de cards.");
      if (snapshot) setCardsByStage(snapshot);
      return resetDragState();
    }

    setCardsByStage((current) =>
      moveCardBetweenStages(current, cardId, finalStageId),
    );

    const result = await moveCard(cardId, finalStageId);
    if (result.error) {
      toast.error(result.error);
      if (snapshot) setCardsByStage(snapshot);
      return resetDragState();
    }

    resetDragState();
    router.refresh();
  }

  function resetDragState() {
    setActiveCardId(null);
    dragOriginStageRef.current = null;
    dragSnapshotRef.current = null;
  }

  function exportVisibleCards() {
    const rows = visibleCards.map((card) => ({
      codigo: formatCardCode(card.id),
      paciente: card.patient_name,
      responsavel: card.assigned_professional_name ?? "",
      etapa:
        stages.find((stage) => stage.id === card.stage_id)?.name ?? "Etapa",
      proxima_acao: card.next_action ?? "",
      data_acao: card.next_action_date ?? "",
      valor: card.value ?? "",
      arquivado: card.archived_at ? "sim" : "nao",
    }));
    const csv = [
      Object.keys(rows[0] ?? { codigo: "" }).join(";"),
      ...rows.map((row) =>
        Object.values(row)
          .map((value) => `"${String(value).replace(/"/g, '""')}"`)
          .join(";"),
      ),
    ].join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `painel-${funnelId}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="grid gap-4">
      <BoardToolbar
        view={view}
        onViewChange={setView}
        filters={filters}
        professionalOptions={professionalOptions}
        visibleCount={visibleCards.length}
        onFiltersChange={updateFilters}
        onClearFilters={() => setFilters(initialFilters)}
        onExport={exportVisibleCards}
      />

      {view === "list" ? (
        <CardsListView
          cards={visibleCards}
          stages={stages}
          onCardClick={setSelectedCardId}
        />
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={boardCollisionDetection}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
          onDragCancel={() => {
            if (dragSnapshotRef.current) {
              setCardsByStage(dragSnapshotRef.current);
            }
            resetDragState();
          }}
        >
          <div className="flex gap-3 overflow-x-auto pb-4">
            {stages.map((stage) => (
              <StageColumn
                key={stage.id}
                stage={{ ...stage, metrics: stageMetrics[stage.id] }}
                cards={visibleCardsByStage[stage.id] ?? []}
                allStageCards={cardsByStage[stage.id] ?? []}
                activeCardId={activeCardId}
                canManage={canManage}
                onCardClick={setSelectedCardId}
              />
            ))}
          </div>
          <DragOverlay dropAnimation={null}>
            {activeCard ? <CardPreview card={activeCard} dragging /> : null}
          </DragOverlay>
        </DndContext>
      )}

      {selectedCard ? (
        <CardPanel
          funnelId={funnelId}
          card={selectedCard}
          canManage={canManage}
          onClose={() => setSelectedCardId(null)}
        />
      ) : null}
    </div>
  );
}

function BoardToolbar({
  view,
  onViewChange,
  filters,
  professionalOptions,
  visibleCount,
  onFiltersChange,
  onClearFilters,
  onExport,
}: {
  view: "kanban" | "list";
  onViewChange: (view: "kanban" | "list") => void;
  filters: BoardFilters;
  professionalOptions: string[];
  visibleCount: number;
  onFiltersChange: (patch: Partial<BoardFilters>) => void;
  onClearFilters: () => void;
  onExport: () => void;
}) {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const activeFilterCount = [
    filters.professional !== "all",
    filters.onlyStagnant,
    filters.onlyWithValue,
    filters.showArchived,
  ].filter(Boolean).length;

  return (
    <div className="sticky top-0 z-20 -mx-1 border-y border-border bg-background/95 px-1 py-3 backdrop-blur">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="inline-flex w-fit rounded-md bg-muted p-0.5">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onViewChange("kanban")}
            className={cn(
              view === "kanban"
                ? "bg-card text-foreground shadow-[var(--shadow-soft)] hover:bg-card"
                : "",
            )}
          >
            <Columns3 className="size-4" aria-hidden="true" />
            Kanban
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onViewChange("list")}
            className={cn(
              view === "list"
                ? "bg-card text-foreground shadow-[var(--shadow-soft)] hover:bg-card"
                : "",
            )}
          >
            <List className="size-4" aria-hidden="true" />
            Lista
          </Button>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <label className="relative sm:w-72">
            <span className="sr-only">Pesquisar cards</span>
            <Input
              value={filters.query}
              onChange={(event) =>
                onFiltersChange({ query: event.target.value })
              }
              placeholder="Pesquisar"
              className="w-full pl-9"
            />
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-placeholder"
              aria-hidden="true"
            />
          </label>

          <div className="relative">
            <Button
              type="button"
              variant="secondary"
              size="icon"
              aria-label="Filtros"
              onClick={() => setFiltersOpen((current) => !current)}
            >
              <Filter className="size-4" aria-hidden="true" />
            </Button>
            {activeFilterCount ? (
              <span className="absolute -right-1 -top-1 flex size-5 items-center justify-center rounded-full bg-destructive text-caption font-semibold text-white">
                {activeFilterCount}
              </span>
            ) : null}
            {filtersOpen ? (
              <FilterPanel
                filters={filters}
                professionalOptions={professionalOptions}
                onFiltersChange={onFiltersChange}
                onClearFilters={onClearFilters}
                onClose={() => setFiltersOpen(false)}
              />
            ) : null}
          </div>

          <Button
            type="button"
            variant={filters.showArchived ? "primary" : "secondary"}
            size="icon"
            aria-label="Mostrar arquivados"
            title="Mostrar arquivados"
            onClick={() =>
              onFiltersChange({ showArchived: !filters.showArchived })
            }
          >
            <Archive className="size-4" aria-hidden="true" />
          </Button>

          <div className="hidden h-8 w-px bg-border sm:block" />

          <Button type="button" variant="secondary" onClick={onExport}>
            <ArrowUpFromLine className="size-4" aria-hidden="true" />
            Exportar
          </Button>

          <Badge variant="neutral" className="h-8">
            {visibleCount} cards
          </Badge>
        </div>
      </div>
    </div>
  );
}

function FilterPanel({
  filters,
  professionalOptions,
  onFiltersChange,
  onClearFilters,
  onClose,
}: {
  filters: BoardFilters;
  professionalOptions: string[];
  onFiltersChange: (patch: Partial<BoardFilters>) => void;
  onClearFilters: () => void;
  onClose: () => void;
}) {
  return (
    <div className="absolute right-0 top-12 z-40 w-[min(30rem,calc(100vw-2rem))] rounded-lg border border-border bg-popover shadow-[var(--shadow-lg)]">
      <div className="grid grid-cols-2 rounded-t-lg bg-muted p-1">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="bg-primary-muted text-primary hover:bg-primary-muted hover:text-primary"
        >
          Principais
        </Button>
        <Button type="button" variant="ghost" size="sm">
          Personalizados
        </Button>
      </div>

      <div className="grid max-h-[70vh] gap-4 overflow-y-auto p-4">
        <label className="grid gap-2 text-sm font-medium">
          Responsáveis
          <Select
            value={filters.professional}
            onValueChange={(value) => onFiltersChange({ professional: value })}
          >
            <option value="all">Todos os responsáveis</option>
            <option value="none">Sem responsável</option>
            {professionalOptions.map((professional) => (
              <option key={professional} value={professional}>
                {professional}
              </option>
            ))}
          </Select>
        </label>

        <label className="inline-flex items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={filters.onlyStagnant}
            onChange={(event) =>
              onFiltersChange({ onlyStagnant: event.target.checked })
            }
            className="size-4 rounded border-border"
          />
          Apenas cards parados
        </label>

        <label className="inline-flex items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={filters.onlyWithValue}
            onChange={(event) =>
              onFiltersChange({ onlyWithValue: event.target.checked })
            }
            className="size-4 rounded border-border"
          />
          Apenas cards com valor
        </label>

        <label className="inline-flex items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={filters.showArchived}
            onChange={(event) =>
              onFiltersChange({ showArchived: event.target.checked })
            }
            className="size-4 rounded border-border"
          />
          Exibir cards arquivados
        </label>

        <div className="rounded-md border border-border bg-muted/30 p-3">
          <p className="text-sm font-medium">Contato</p>
          <Input
            disabled
            placeholder="Nome do contato"
            className="mt-2 bg-card/70"
          />
          <label className="mt-3 inline-flex items-center gap-2 text-sm text-muted-foreground">
            <input type="checkbox" disabled className="size-4" />
            Exibir somente cards sem contato
          </label>
        </div>
      </div>

      <div className="flex items-center justify-end gap-3 border-t border-border px-4 py-3">
        <Button type="button" variant="ghost" onClick={onClearFilters}>
          Limpar filtro
        </Button>
        <Button type="button" onClick={onClose}>
          Aplicar filtro
        </Button>
      </div>
    </div>
  );
}

function StageColumn({
  stage,
  cards,
  allStageCards,
  activeCardId,
  canManage,
  onCardClick,
}: {
  stage: FunnelBoardStage;
  cards: FunnelBoardCard[];
  allStageCards: FunnelBoardCard[];
  activeCardId: string | null;
  canManage: boolean;
  onCardClick: (cardId: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });
  const cardIds = useMemo(() => cards.map((card) => card.id), [cards]);
  const activeCards = allStageCards.filter((card) => !card.archived_at);
  const stageTotal = activeCards.reduce(
    (sum, card) => sum + Number(card.value ?? 0),
    0,
  );
  const overWip =
    stage.wip_limit != null && activeCards.length > stage.wip_limit;

  return (
    <section className="grid w-[23.5rem] shrink-0 grid-rows-[auto_minmax(0,1fr)] gap-3">
      <div className="flex items-center justify-between gap-2 px-3">
        <div className="flex min-w-0 items-baseline gap-2">
          <h2 className="truncate text-body-sm font-semibold text-foreground">
            {stage.name}
          </h2>
          <span className="text-label tabular-nums text-muted-foreground">
            ({cards.length})
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={overWip ? "warning" : "neutral"} className="h-7">
            {formatCompactCurrency(stageTotal)}
          </Badge>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Opções da etapa ${stage.name}`}
          >
            <MoreVertical className="size-4" aria-hidden="true" />
          </Button>
        </div>
      </div>

      <div
        ref={setNodeRef}
        className={cn(
          "grid min-h-[30rem] content-start gap-3 overflow-y-auto rounded-lg bg-surface-sunken p-3 transition-colors duration-[var(--motion-fast)]",
          isOver ? "bg-primary-muted" : "",
        )}
      >
        <SortableContext items={cardIds} strategy={verticalListSortingStrategy}>
          {cards.map((card) => (
            <FunnelCardItem
              key={card.id}
              card={card}
              canManage={canManage && !card.archived_at}
              dragging={activeCardId === card.id}
              onClick={onCardClick}
            />
          ))}
        </SortableContext>

        {!cards.length ? (
          <div className="rounded-lg border border-dashed border-border bg-card/70 px-4 py-8 text-center text-sm text-muted-foreground">
            Solte cards aqui.
          </div>
        ) : null}
      </div>
    </section>
  );
}

function FunnelCardItem({
  card,
  canManage,
  dragging,
  onClick,
}: {
  card: FunnelBoardCard;
  canManage: boolean;
  dragging: boolean;
  onClick: (cardId: string) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: card.id, disabled: !canManage });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn((isDragging || dragging) && "opacity-30")}
    >
      <CardPreview
        card={card}
        onClick={() => onClick(card.id)}
        dragHandle={
          canManage ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="cursor-grab active:cursor-grabbing"
              aria-label={`Mover ${card.patient_name}`}
              onClick={(event) => event.stopPropagation()}
              {...attributes}
              {...listeners}
            >
              <GripVertical className="size-4" aria-hidden="true" />
            </Button>
          ) : null
        }
      />
    </div>
  );
}

function CardPreview({
  card,
  onClick,
  dragHandle,
  dragging,
}: {
  card: FunnelBoardCard;
  onClick?: () => void;
  dragHandle?: React.ReactNode;
  dragging?: boolean;
}) {
  return (
    <article
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={(event) => {
        if (!onClick) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onClick();
        }
      }}
      className={cn(
        "grid min-h-[8.25rem] gap-2 rounded-lg border border-border bg-card p-4 text-left shadow-[var(--shadow-soft)] transition-[border-color,box-shadow,transform] duration-[var(--motion-fast)] ease-[var(--ease-out)] hover:border-border-strong hover:shadow-[var(--shadow-hover)]",
        onClick ? "cursor-pointer" : "",
        dragging ? "w-[22rem] scale-[1.02] opacity-95 shadow-[var(--shadow-lg)]" : "",
        card.archived_at ? "opacity-70" : "",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-caption font-medium tracking-wide uppercase text-placeholder">
            {formatCardCode(card.id)}
          </p>
          <h3 className="mt-1 truncate text-body-sm font-semibold text-foreground">
            {card.patient_name}
          </h3>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {card.assigned_professional_name ? (
            <span className="inline-flex max-w-28 items-center gap-1 rounded-md bg-muted px-2 py-1 text-label font-medium text-secondary-foreground">
              <User className="size-3.5" aria-hidden="true" />
              <span className="truncate">
                {card.assigned_professional_name}
              </span>
            </span>
          ) : null}
          {dragHandle}
        </div>
      </div>

      {card.next_action ? (
        <p className="line-clamp-2 text-label text-muted-foreground">
          {card.next_action}
        </p>
      ) : (
        <p className="text-label text-placeholder">Sem próxima ação.</p>
      )}

      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {card.next_action_date ? (
            <span className="inline-flex items-center gap-1 text-label tabular-nums text-muted-foreground">
              <CalendarDays className="size-3.5" aria-hidden="true" />
              {formatShortDate(card.next_action_date)}
            </span>
          ) : null}
          {card.is_stagnant ? (
            <Badge
              variant="destructive"
              className="h-5 px-1.5 text-caption font-semibold uppercase"
            >
              Sem retorno
            </Badge>
          ) : null}
          {card.archived_at ? (
            <Badge
              variant="neutral"
              className="h-5 px-1.5 text-caption font-semibold uppercase"
            >
              Arquivado
            </Badge>
          ) : null}
        </div>
        <MessageCircle
          className="size-5 rounded-full bg-muted p-1 text-muted-foreground"
          aria-hidden="true"
        />
      </div>

      {card.value != null ? (
        <p className="text-body-sm font-semibold tabular-nums text-foreground">
          {formatCurrency(card.value)}
        </p>
      ) : null}
    </article>
  );
}

function CardsListView({
  cards,
  stages,
  onCardClick,
}: {
  cards: FunnelBoardCard[];
  stages: FunnelBoardStage[];
  onCardClick: (cardId: string) => void;
}) {
  if (!cards.length) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-card p-10 text-center">
        <Inbox className="mx-auto size-8 text-muted-foreground" />
        <p className="mt-3 text-sm font-medium">Nenhum card encontrado</p>
      </div>
    );
  }

  const stageName = new Map(stages.map((stage) => [stage.id, stage.name]));

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="grid grid-cols-[minmax(12rem,1.3fr)_12rem_10rem_8rem] border-b border-border bg-muted px-4 py-3 text-label font-medium tracking-wide uppercase text-muted-foreground">
        <span>Contato</span>
        <span>Etapa</span>
        <span>Responsável</span>
        <span className="text-right">Valor</span>
      </div>
      {cards.map((card) => (
        <Button
          key={card.id}
          type="button"
          variant="ghost"
          onClick={() => onCardClick(card.id)}
          className="grid h-auto w-full grid-cols-[minmax(12rem,1.3fr)_12rem_10rem_8rem] items-center gap-3 rounded-none border-b border-border px-4 py-3 text-left text-body font-normal text-foreground last:border-b-0 hover:bg-muted/40"
        >
          <span className="min-w-0">
            <span className="block truncate font-semibold">
              {card.patient_name}
            </span>
            <span className="text-label text-muted-foreground">
              {card.next_action ?? formatCardCode(card.id)}
            </span>
          </span>
          <span className="truncate">{stageName.get(card.stage_id)}</span>
          <span className="truncate text-muted-foreground">
            {card.assigned_professional_name ?? "-"}
          </span>
          <span className="text-right font-medium tabular-nums">
            {card.value != null ? formatCurrency(card.value) : "-"}
          </span>
        </Button>
      ))}
    </div>
  );
}

function groupByStage(stages: FunnelBoardStage[], cards: FunnelBoardCard[]) {
  const grouped: Record<string, FunnelBoardCard[]> = {};
  for (const stage of stages) grouped[stage.id] = [];
  for (const card of cards) {
    (grouped[card.stage_id] ??= []).push(card);
  }
  return grouped;
}

function cardMatchesFilters(card: FunnelBoardCard, filters: BoardFilters) {
  if (!filters.showArchived && card.archived_at) return false;
  if (filters.onlyStagnant && !card.is_stagnant) return false;
  if (filters.onlyWithValue && card.value == null) return false;
  if (
    filters.professional !== "all" &&
    (filters.professional === "none"
      ? card.assigned_professional_name
      : card.assigned_professional_name !== filters.professional)
  ) {
    return false;
  }

  const query = filters.query.trim().toLowerCase();
  if (!query) return true;
  return [
    formatCardCode(card.id),
    card.patient_name,
    card.assigned_professional_name ?? "",
    card.next_action ?? "",
    card.value != null ? String(card.value) : "",
  ]
    .join(" ")
    .toLowerCase()
    .includes(query);
}

function findStageIdForCard(
  cardsByStage: Record<string, FunnelBoardCard[]>,
  cardId: string,
) {
  return Object.keys(cardsByStage).find((stageId) =>
    cardsByStage[stageId]?.some((card) => card.id === cardId),
  );
}

function findTargetStageId(
  overId: string,
  cardsByStage: Record<string, FunnelBoardCard[]>,
  stages: FunnelBoardStage[],
) {
  if (stages.some((stage) => stage.id === overId)) return overId;
  return findStageIdForCard(cardsByStage, overId) ?? null;
}

function moveCardBetweenStages(
  current: Record<string, FunnelBoardCard[]>,
  cardId: string,
  targetStageId: string,
) {
  const sourceStageId = findStageIdForCard(current, cardId);
  if (!sourceStageId || sourceStageId === targetStageId) return current;
  const movingCard = current[sourceStageId]?.find((card) => card.id === cardId);
  if (!movingCard) return current;

  return {
    ...current,
    [sourceStageId]: (current[sourceStageId] ?? []).filter(
      (card) => card.id !== cardId,
    ),
    [targetStageId]: [
      ...(current[targetStageId] ?? []),
      { ...movingCard, stage_id: targetStageId },
    ],
  };
}

function formatCardCode(id: string) {
  return `CONS-${id.slice(0, 4).toUpperCase()}`;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

function formatCompactCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatShortDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
  }).format(new Date(`${value}T00:00:00`));
}
