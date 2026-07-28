import Link from "next/link";
import { ArrowLeft } from "@phosphor-icons/react/dist/ssr";
import type { Icon as PhosphorIcon } from "@phosphor-icons/react";
import { Breadcrumb, type BreadcrumbItem } from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

export function PageHeader({
  actions,
  backHref,
  backLabel = "Voltar",
  breadcrumbs,
  className,
  description,
  icon,
  title,
}: {
  actions?: React.ReactNode;
  backHref?: string;
  backLabel?: string;
  breadcrumbs?: BreadcrumbItem[];
  className?: string;
  description?: React.ReactNode;
  icon?: PhosphorIcon;
  title: React.ReactNode;
}) {
  return (
    <header className={cn("grid min-w-0 gap-2", className)}>
      {breadcrumbs?.length ? <Breadcrumb items={breadcrumbs} /> : null}
      <div className="flex min-w-0 flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div className="flex min-w-0 items-center gap-3">
          {backHref ? (
            <Button asChild variant="secondary" size="icon">
              <Link href={backHref} aria-label={backLabel}>
                <ArrowLeft className="size-4" aria-hidden="true" />
              </Link>
            </Button>
          ) : icon ? (
            <div className="flex min-h-12 w-12 shrink-0 self-stretch items-center justify-center rounded-lg bg-primary-muted text-primary">
              <Icon icon={icon} size="xl" weight="duotone" />
            </div>
          ) : null}
          <div className="min-w-0">
            <h1 className="truncate text-heading-lg">{title}</h1>
            {description ? (
              <p className="mt-1 text-body-sm text-muted-foreground">
                {description}
              </p>
            ) : null}
          </div>
        </div>
        {actions ? (
          <div className="flex w-full shrink-0 flex-wrap gap-2 sm:w-auto sm:justify-end">
            {actions}
          </div>
        ) : null}
      </div>
    </header>
  );
}
