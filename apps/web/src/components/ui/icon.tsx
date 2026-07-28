import type { Icon as PhosphorIcon, IconWeight } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

/**
 * Escala fechada de iconografia (docs/design-system.md):
 * sm = 14px — metadados, badges, células densas
 * md = 16px — botões, inputs, itens de menu
 * lg = 20px — cabeçalhos de página/painel, empty states
 * xl = 24px — ícone principal de cabeçalhos de página
 *
 * O peso é definido pelo contexto conforme o padrão do Phosphor.
 */
const sizes = {
  sm: "size-3.5",
  md: "size-4",
  lg: "size-5",
  xl: "size-6",
} as const;

type IconProps = {
  icon: PhosphorIcon;
  size?: keyof typeof sizes;
  weight?: IconWeight;
  className?: string;
  "aria-hidden"?: boolean;
  "aria-label"?: string;
};

export function Icon({
  icon: PhosphorComponent,
  size = "md",
  weight,
  className,
  ...props
}: IconProps) {
  return (
    <PhosphorComponent
      aria-hidden={props["aria-label"] ? undefined : true}
      className={cn(sizes[size], "shrink-0", className)}
      weight={weight}
      {...props}
    />
  );
}
