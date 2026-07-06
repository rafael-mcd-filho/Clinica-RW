"use client";

import Link from "next/link";
import {
  ArrowRight,
  Building2,
  Pin,
  Search,
  Settings,
  Waypoints,
} from "lucide-react";
import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";

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
              className="h-11 w-full pr-11"
            />
            <Search
              className="pointer-events-none absolute right-3 top-1/2 size-5 -translate-y-1/2 text-placeholder"
              aria-hidden="true"
            />
          </label>
          <Switch
            checked={showArchived}
            onCheckedChange={setShowArchived}
            label="Ver painéis excluídos"
          />
        </div>
        {action ? <div className="shrink-0 lg:ml-auto">{action}</div> : null}
      </div>

      {visiblePanels.length ? (
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visiblePanels.map((panel) => (
            <PanelCard
              key={panel.id}
              panel={panel}
              canConfigure={canConfigure}
            />
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
                ? "Ajuste a busca ou habilite a visualizacao de paineis excluidos."
                : canConfigure
                  ? "Crie o primeiro painel para acompanhar leads ou jornadas de pacientes."
                  : "Peca a um administrador para criar o primeiro painel."
            }
          />
        </Card>
      )}
    </div>
  );
}

function PanelCard({
  panel,
  canConfigure,
}: {
  panel: PanelRow;
  canConfigure: boolean;
}) {
  return (
    <Card className="group overflow-hidden transition-[border-color,box-shadow] duration-[var(--motion-fast)] ease-[var(--ease-out)] hover:border-border-strong hover:shadow-[var(--shadow-hover)]">
      <CardContent className="grid min-h-[13.25rem] grid-rows-[1fr_auto] p-0">
        <div className="grid gap-4 px-6 py-6">
          <div>
            <div className="flex items-start justify-between gap-3">
              <h2 className="truncate text-heading-sm font-semibold text-foreground">
                {panel.name}
              </h2>
              {!panel.active ? (
                <Badge variant="neutral" className="h-5 px-1.5 text-caption font-semibold uppercase">
                  Excluído
                </Badge>
              ) : null}
            </div>
            {panel.description ? (
              <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
                {panel.description}
              </p>
            ) : null}
          </div>

          <div className="h-px bg-border" />

          <div className="flex min-w-0 items-center gap-2 text-body text-foreground">
            <Building2
              className="size-4 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
            <span className="truncate">Para toda a empresa</span>
          </div>
        </div>

        <div className="grid grid-cols-[1fr_auto] items-center gap-3 border-t border-border bg-muted/40 px-6 py-4">
          <div className="flex items-center gap-4 text-muted-foreground">
            {canConfigure ? (
              <Link
                href={`/funis/${panel.id}`}
                className="inline-flex size-9 items-center justify-center rounded-md transition-colors hover:bg-white hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                aria-label={`Configurar ${panel.name}`}
                title="Configurar"
              >
                <Settings className="size-5" aria-hidden="true" />
              </Link>
            ) : null}
            <span
              className="inline-flex size-9 items-center justify-center rounded-md text-muted-foreground"
              title={`${panel.activeCardCount} cards ativos`}
            >
              <Pin className="size-5" aria-hidden="true" />
            </span>
          </div>

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
