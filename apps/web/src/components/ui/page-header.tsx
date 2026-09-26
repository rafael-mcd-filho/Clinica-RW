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
  const hasVisibleControls = Boolean(
    backHref || breadcrumbs?.length || actions,
  );

  if (!hasVisibleControls) {
    return <h1 className="sr-only">{title}</h1>;
  }

  return (
    <header className={cn("grid min-w-0 gap-2", className)}>
      <h1 className="sr-only">{title}</h1>
      {breadcrumbs?.length ? <Breadcrumb items={breadcrumbs} /> : null}
      {backHref || actions ? (
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
          {backHref ? (
            <Button asChild variant="secondary" size="icon">
              <Link href={backHref} aria-label={backLabel}>
                <ArrowLeft className="size-4" aria-hidden="true" />
              </Link>
            </Button>
          ) : null}
          {actions ? (
            <div className="flex w-full flex-wrap gap-2 sm:ml-auto sm:w-auto sm:justify-end">
              {actions}
            </div>
          ) : null}
        </div>
      ) : null}
    </header>
  );
}
