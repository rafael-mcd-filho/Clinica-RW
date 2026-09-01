import type { Icon as PhosphorIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

/**
 * Linha do tempo de eventos (histórico de atendimento, log de acessos).
 *
 * Um nó por evento, ligados por um fio contínuo. O nó carrega um ícone quando
 * o tipo do evento tem significado próprio; sem ícone, vira um ponto neutro.
 * Ordem cronológica é responsabilidade de quem monta `items`.
 */
export type TimelineItem = {
  id: string;
  title: ReactNode;
  /** Data já formatada para leitura. */
  timestamp: string;
  /** ISO, para o `dateTime` do `<time>`. */
  dateTime?: string;
  description?: ReactNode;
  /** Bloco destacado abaixo da descrição (ex.: motivo de uma transferência). */
  detail?: ReactNode;
  icon?: PhosphorIcon;
};

export function Timeline({
  items,
  className,
}: {
  items: TimelineItem[];
  className?: string;
}) {
  return (
    <ol className={cn("relative", className)}>
      {items.map((item, index) => (
        <li key={item.id} className="relative flex gap-3 pb-5 last:pb-0">
          {index < items.length - 1 ? (
            <span
              aria-hidden="true"
              className="absolute bottom-0 left-3 top-6 w-px -translate-x-1/2 bg-border"
            />
          ) : null}
          <span className="relative flex size-6 shrink-0 items-center justify-center rounded-full border border-border bg-card text-muted-foreground">
            {item.icon ? (
              <Icon icon={item.icon} size="sm" />
            ) : (
              <span
                aria-hidden="true"
                className="size-1.5 rounded-full bg-primary"
              />
            )}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <p className="text-body-sm font-medium">{item.title}</p>
              <time
                dateTime={item.dateTime}
                className="text-caption tabular-nums text-muted-foreground"
              >
                {item.timestamp}
              </time>
            </div>
            {item.description ? (
              <p className="mt-1 text-label text-muted-foreground">
                {item.description}
              </p>
            ) : null}
            {item.detail ? (
              <div className="mt-2 rounded-md bg-muted px-2.5 py-2 text-label">
                {item.detail}
              </div>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  );
}
