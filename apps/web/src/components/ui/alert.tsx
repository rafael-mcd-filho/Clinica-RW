import {
  CheckCircle,
  Info,
  Warning,
  WarningCircle,
} from "@phosphor-icons/react/dist/ssr";
import { cn } from "@/lib/utils";

type AlertVariant = "info" | "success" | "warning" | "destructive";

const variantStyles: Record<
  AlertVariant,
  { icon: typeof Info; className: string }
> = {
  info: {
    icon: Info,
    className: "border-primary/30 bg-primary-muted text-primary-strong",
  },
  success: {
    icon: CheckCircle,
    className: "border-success/30 bg-success-muted text-success-foreground",
  },
  warning: {
    icon: Warning,
    className: "border-warning/30 bg-warning-muted text-warning-foreground",
  },
  destructive: {
    icon: WarningCircle,
    className:
      "border-destructive/30 bg-destructive-muted text-destructive-foreground",
  },
};

// Mensagem inline persistente (aviso em formulário, contexto de seção,
// erro que não deve sumir como toast). Para feedback transitório de ação,
// continue usando toast (sonner); para erro de formulário anunciado por
// leitor de tela com foco, use FormError.
export function Alert({
  variant = "info",
  title,
  children,
  className,
}: {
  variant?: AlertVariant;
  title?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
  const { icon: IconComponent, className: variantClassName } =
    variantStyles[variant];

  return (
    <div
      role={variant === "destructive" || variant === "warning" ? "alert" : "status"}
      className={cn(
        "flex items-start gap-3 rounded-lg border px-4 py-3 text-body-sm leading-5",
        variantClassName,
        className,
      )}
    >
      <IconComponent
        weight="duotone"
        className="mt-0.5 size-4 shrink-0"
        aria-hidden="true"
      />
      <div className="min-w-0">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? (
          <div className={cn(title && "mt-0.5")}>{children}</div>
        ) : null}
      </div>
    </div>
  );
}
