import { Inbox, type LucideIcon } from "lucide-react";

export function EmptyState({
  description,
  title,
  icon: Icon = Inbox,
}: {
  description?: string;
  title: string;
  icon?: LucideIcon;
}) {
  return (
    <div className="px-5 py-10 text-center">
      <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Icon className="size-5" aria-hidden="true" />
      </div>
      <p className="mt-3 text-sm font-medium">{title}</p>
      {description ? (
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      ) : null}
    </div>
  );
}
