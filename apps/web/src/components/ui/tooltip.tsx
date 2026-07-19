import { cn } from "@/lib/utils";

export function Tooltip({
  children,
  content,
  side = "top",
}: {
  children: React.ReactNode;
  content: string;
  side?: "top" | "bottom";
}) {
  return (
    <span className="group relative inline-flex">
      {children}
      <span
        role="tooltip"
        className={cn(
          // Dica curta de alto contraste (inverso do tema) — irmã do
          // HelpTooltip, que usa superfície popover para conteúdo rico.
          "pointer-events-none absolute left-1/2 z-50 -translate-x-1/2 whitespace-nowrap rounded-md bg-foreground px-2.5 py-1.5 text-caption font-medium text-background opacity-0 shadow-[var(--shadow-md)] transition-opacity delay-300 duration-[var(--motion-fast)] group-hover:opacity-100 group-focus-within:opacity-100",
          side === "top" ? "bottom-full mb-2" : "top-full mt-2",
        )}
      >
        {content}
      </span>
    </span>
  );
}
