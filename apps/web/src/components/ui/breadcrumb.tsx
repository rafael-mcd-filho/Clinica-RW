import Link from "next/link";
import { CaretRight } from "@phosphor-icons/react/dist/ssr";
import { cn } from "@/lib/utils";

export type BreadcrumbItem = {
  label: React.ReactNode;
  href?: string;
};

// Trilha de navegação para páginas profundas (paciente, prontuário,
// empresa, funil). O último item é a página atual (aria-current) e nunca
// vira link. Itens intermediários sem href são permitidos (rótulos de
// agrupamento que não têm página própria).
export function Breadcrumb({
  items,
  className,
}: {
  items: BreadcrumbItem[];
  className?: string;
}) {
  if (!items.length) return null;

  return (
    <nav aria-label="Trilha de navegação" className={cn("min-w-0", className)}>
      <ol className="flex min-w-0 flex-wrap items-center gap-1 text-body-sm text-muted-foreground">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;

          return (
            <li key={index} className="flex min-w-0 items-center gap-1">
              {item.href && !isLast ? (
                <Link
                  href={item.href}
                  className="truncate rounded-sm transition-colors duration-[var(--motion-fast)] ease-[var(--ease-out)] hover:text-foreground"
                >
                  {item.label}
                </Link>
              ) : (
                <span
                  aria-current={isLast ? "page" : undefined}
                  className={cn(
                    "truncate",
                    isLast && "font-medium text-foreground",
                  )}
                >
                  {item.label}
                </span>
              )}
              {!isLast ? (
                <CaretRight
                  className="size-3.5 shrink-0 opacity-60"
                  aria-hidden="true"
                />
              ) : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
