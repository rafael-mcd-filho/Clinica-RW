import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

type CheckboxProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "type"
> & {
  label?: string;
};

export function Checkbox({ className, label, ...props }: CheckboxProps) {
  return (
    <label className="inline-flex items-center gap-2 text-sm text-secondary-foreground">
      <span className="relative flex size-4 shrink-0 items-center justify-center">
        <input
          type="checkbox"
          className={cn(
            "peer size-4 appearance-none rounded border border-border-strong bg-card transition-colors duration-[var(--motion-fast)] checked:border-primary checked:bg-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50",
            className,
          )}
          {...props}
        />
        <Check
          className="pointer-events-none absolute size-3 text-white opacity-0 transition-opacity duration-[var(--motion-fast)] peer-checked:opacity-100"
          aria-hidden="true"
        />
      </span>
      {label ? <span>{label}</span> : null}
    </label>
  );
}
