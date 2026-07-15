"use client";

import Link from "next/link";
import { ArrowRight, Search, Waypoints } from "lucide-react";
import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

export type PanelRow = {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
  created_at: string;
  activeCardCount: number;
};

export function PanelsList({
  panels,
  canConfigure,
  action,
}: {
  panels: PanelRow[];
  canConfigure: boolean;
  action?: ReactNode;
}) {
  const [query, setQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const normalizedQuery = query.trim().toLowerCase();

  const visiblePanels = useMemo(
    () =>
      panels.filter((panel) => {
        if (!showArchived && !panel.active) return false;
        if (!normalizedQuery) return true;

        return [panel.name, panel.description ?? ""]
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery);
      }),
    [normalizedQuery, panels, showArchived],
  );

  return (
    <div className="grid gap-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <label className="relative w-full sm:w-[22.5rem]">
            <span className="sr-only">Pesquisar por painel</span>
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Pesquisar por painel"
              className="w-full pr-9"
            />
            <Search
              className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-placeholder"
              aria-hidden="true"
            />
          </label>
          <Switch
            checked={showArchived}
            onCheckedChange={setShowArchived}
            label="Ver painéis excluídos"
          />
        </div>
        {action && visiblePanels.length ? (
          <div className="shrink-0 lg:ml-auto">{action}</div>
        ) : null}
      </div>

      {visiblePanels.length ? (
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visiblePanels.map((panel) => (
            <PanelCard key={panel.id} panel={panel} />
          ))}
        </section>
      ) : (
        <Card>
          <EmptyState
            icon={Waypoints}
            title={
              panels.length
                ? "Nenhum painel encontrado"
                : "Nenhum painel cadastrado"
            }
            description={
              panels.length
                ? "Ajuste a busca ou habilite a visualização de painéis excluídos."
                : canConfigure
                  ? "Crie o primeiro painel para acompanhar leads ou jornadas de pacientes."
                  : "Peça a um administrador para criar o primeiro painel."
            }
            actions={
              panels.length ? (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setQuery("");
                    setShowArchived(true);
                  }}
                >
                  Mostrar todos
                </Button>
              ) : canConfigure ? (
                action
              ) : undefined
            }
          />
        </Card>
      )}
    </div>
  );
}

function PanelCard({ panel }: { panel: PanelRow }) {
  const activeCardsLabel = `${panel.activeCardCount} ${
    panel.activeCardCount === 1 ? "card ativo" : "cards ativos"
  }`;

  return (
    <Card className="group h-full overflow-hidden transition-[border-color,box-shadow] duration-[var(--motion-fast)] ease-[var(--ease-out)] hover:border-border-strong hover:shadow-[var(--shadow-hover)]">
      <CardContent className="flex h-full min-h-[12rem] flex-col p-0">
        <div className="flex flex-1 flex-col px-6 py-5">
          <div>
            <div className="flex items-start justify-between gap-3">
              <h2 className="line-clamp-1 text-heading-sm font-semibold text-foreground">
                {panel.name}
              </h2>
              {!panel.active ? (
                <Badge
                  variant="neutral"
                  className="h-5 shrink-0 px-1.5 text-caption font-semibold uppercase"
                >
                  Excluído
                </Badge>
              ) : null}
            </div>
            <p
              className={cn(
                "mt-2 min-h-10 line-clamp-2 text-sm",
                panel.description
                  ? "text-muted-foreground"
                  : "italic text-placeholder",
              )}
            >
              {panel.description || "Sem descrição"}
            </p>
          </div>
        </div>

        <div className="flex min-h-16 items-center justify-between gap-3 border-t border-border bg-muted/40 px-6 py-3">
          <span className="text-sm text-muted-foreground">
            {activeCardsLabel}
          </span>

          <Button asChild variant="secondary">
            <Link href={`/funis/${panel.id}`}>
              <ArrowRight className="size-4" aria-hidden="true" />
              Abrir
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
