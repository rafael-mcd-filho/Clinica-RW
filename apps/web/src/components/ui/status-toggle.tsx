import { cn } from "@/lib/utils";

type StatusToggleProps = Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  "aria-label"
> & {
  active: boolean;
  label: string;
};

export function StatusToggle({
  active,
  className,
  label,
  type = "button",
  ...props
}: StatusToggleProps) {
  return (
    <button
      type={type}
      role="switch"
      aria-checked={active}
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-[var(--motion-fast)] focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
        active ? "bg-success-foreground" : "bg-border-strong",
        className,
      )}
      {...props}
    >
      <span
        className={cn(
          "size-4 rounded-full bg-card shadow-[var(--shadow-soft)] transition-transform duration-[var(--motion-fast)]",
          active ? "translate-x-[18px]" : "translate-x-0.5",
        )}
        aria-hidden="true"
      />
    </button>
  );
}
