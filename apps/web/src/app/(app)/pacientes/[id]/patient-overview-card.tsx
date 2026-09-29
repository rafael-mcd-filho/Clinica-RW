import { ArrowRight } from "@phosphor-icons/react/dist/ssr";
import { TabSelectionButton } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

type IconComponent = React.ComponentType<{
  className?: string;
  weight?: "thin" | "light" | "regular" | "bold" | "fill" | "duotone";
}>;

/**
 * Moldura dos cartões do Resumo da ficha: ícone azul e título à esquerda,
 * ação ("Ver todos", "Adicionar") à direita. Serve tanto para as partes do
 * servidor quanto para as interativas.
 */
export function OverviewCard({
  action,
  bodyClassName,
  children,
  className,
  icon: Icon,
  title,
}: {
  action?: React.ReactNode;
  bodyClassName?: string;
  children: React.ReactNode;
  className?: string;
  icon: IconComponent;
  title: string;
}) {
  return (
    <section
      className={cn(
        "min-w-0 rounded-lg border border-border bg-card shadow-[var(--shadow-soft)]",
        className,
      )}
    >
      <header className="flex min-h-14 items-center justify-between gap-3 px-4 pt-3">
        <h2 className="flex min-w-0 items-center gap-2.5 text-body font-semibold text-foreground">
          <Icon className="size-5 shrink-0 text-primary" weight="duotone" />
          <span className="truncate">{title}</span>
        </h2>
        {action ? (
          <div className="flex shrink-0 items-center">{action}</div>
        ) : null}
      </header>
      <div className={cn("px-4 pb-4 pt-2", bodyClassName)}>{children}</div>
    </section>
  );
}

/** "Ver todos →": troca para a aba do módulo, sem sair da ficha. */
export function ViewAllTab({
  label = "Ver todos",
  tab,
}: {
  label?: string;
  tab: string;
}) {
  return (
    <TabSelectionButton
      value={tab}
      scrollToTop
      className="group inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-body-sm font-medium text-primary transition-colors duration-[var(--motion-fast)] hover:bg-primary-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
    >
      {label}
      <ArrowRight
        className="size-4 transition-transform duration-[var(--motion-fast)] ease-[var(--ease-out)] group-hover:translate-x-0.5"
        aria-hidden="true"
      />
    </TabSelectionButton>
  );
}
