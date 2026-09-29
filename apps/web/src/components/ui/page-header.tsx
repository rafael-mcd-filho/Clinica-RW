import Link from "next/link";
import { ArrowLeft } from "@phosphor-icons/react/dist/ssr";
import type { Icon as PhosphorIcon } from "@phosphor-icons/react";
import { Breadcrumb, type BreadcrumbItem } from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function PageHeader({
  actions,
  backHref,
  backLabel = "Voltar",
  breadcrumbs,
  className,
  description,
  icon: Icon,
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
    <header className={cn("grid min-w-0 gap-3", className)}>
      {breadcrumbs?.length ? <Breadcrumb items={breadcrumbs} /> : null}
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          {backHref ? (
            <Button
              asChild
              variant="secondary"
              size="icon"
              className="mt-0.5 shrink-0"
            >
              <Link href={backHref} aria-label={backLabel}>
                <ArrowLeft className="size-4" aria-hidden="true" />
              </Link>
            </Button>
          ) : null}
          {Icon ? (
            <span
              className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-md bg-primary-muted text-primary"
              aria-hidden="true"
            >
              <Icon className="size-5" />
            </span>
          ) : null}
          <div className="min-w-0">
            <h1 className="truncate text-display font-semibold text-foreground">
              {title}
            </h1>
            {description ? (
              <p className="mt-0.5 max-w-prose text-body-sm text-muted-foreground">
                {description}
              </p>
            ) : null}
          </div>
        </div>
        {actions ? (
          <div className="flex w-full flex-wrap gap-2 sm:ml-auto sm:w-auto sm:justify-end">
            {actions}
          </div>
        ) : null}
      </div>
    </header>
  );
}
