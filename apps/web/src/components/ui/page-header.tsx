import Link from "next/link";
import { ArrowLeft } from "@phosphor-icons/react/dist/ssr";
import type { Icon as LucideIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function PageHeader({
  actions,
  backHref,
  backLabel = "Voltar",
  className,
  description,
  icon: Icon,
  title,
}: {
  actions?: React.ReactNode;
  backHref?: string;
  backLabel?: string;
  className?: string;
  description?: React.ReactNode;
  icon?: LucideIcon;
  title: React.ReactNode;
}) {
  return (
    <header
      className={cn(
        "flex min-w-0 flex-col justify-between gap-4 sm:flex-row sm:items-center",
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        {backHref ? (
          <Button asChild variant="secondary" size="icon">
            <Link href={backHref} aria-label={backLabel}>
              <ArrowLeft className="size-4" aria-hidden="true" />
            </Link>
          </Button>
        ) : Icon ? (
          <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary-muted text-primary">
            <Icon className="size-5" weight="duotone" aria-hidden="true" />
          </div>
        ) : null}
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold">{title}</h1>
          {description ? (
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          ) : null}
        </div>
      </div>
      {actions ? (
        <div className="flex w-full shrink-0 flex-wrap gap-2 sm:w-auto sm:justify-end">
          {actions}
        </div>
      ) : null}
    </header>
  );
}
