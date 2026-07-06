import { cn } from "@/lib/utils";

const variants = {
  neutral: "border-border bg-muted text-secondary-foreground",
  primary: "border-primary-muted-hover bg-primary-muted text-primary-hover",
  success: "border-success-muted bg-success-muted text-success-foreground",
  warning: "border-warning-muted bg-warning-muted text-warning-foreground",
  destructive:
    "border-destructive-muted bg-destructive-muted text-destructive-foreground",
};

type BadgeProps = React.HTMLAttributes<HTMLSpanElement> & {
  variant?: keyof typeof variants;
};

export function Badge({
  className,
  variant = "neutral",
  ...props
}: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex h-6 shrink-0 items-center rounded-md border px-2 text-xs font-medium",
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}
