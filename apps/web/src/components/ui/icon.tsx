import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Escala fechada de iconografia (docs/design-system.md):
 * sm = 14px — metadados, badges, células densas
 * md = 16px — botões, inputs, itens de menu
 * lg = 20px — cabeçalhos de página/painel, empty states
 *
 * O traço 1.75 é aplicado globalmente via `svg.lucide` em globals.css.
 */
const sizes = {
  sm: "size-3.5",
  md: "size-4",
  lg: "size-5",
} as const;

type IconProps = {
  icon: LucideIcon;
  size?: keyof typeof sizes;
  className?: string;
  "aria-hidden"?: boolean;
  "aria-label"?: string;
};

export function Icon({
  icon: LucideComponent,
  size = "md",
  className,
  ...props
}: IconProps) {
  return (
    <LucideComponent
      aria-hidden={props["aria-label"] ? undefined : true}
      className={cn(sizes[size], "shrink-0", className)}
      {...props}
    />
  );
}
