import { Tray as Inbox } from "@phosphor-icons/react/dist/ssr";
import type { Icon as LucideIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function EmptyState({
  actions,
  className,
  description,
  title,
  icon: Icon = Inbox,
}: {
  actions?: ReactNode;
  className?: string;
  description?: string;
  title: string;
  icon?: LucideIcon;
}) {
  return (
    <div className={cn("px-5 py-10 text-center", className)}>
      <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Icon className="size-5" weight="duotone" aria-hidden="true" />
      </div>
      <p className="mt-3 text-sm font-medium">{title}</p>
      {description ? (
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      ) : null}
      {actions ? (
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          {actions}
        </div>
      ) : null}
    </div>
  );
}
