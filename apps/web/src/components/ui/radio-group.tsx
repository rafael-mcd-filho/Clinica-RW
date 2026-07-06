import { cn } from "@/lib/utils";

type RadioOption = {
  label: string;
  value: string;
};

type RadioGroupProps = {
  name: string;
  options: RadioOption[];
  defaultValue?: string;
  disabled?: boolean;
  className?: string;
};

export function RadioGroup({
  className,
  defaultValue,
  disabled,
  name,
  options,
}: RadioGroupProps) {
  return (
    <div className={cn("grid gap-2", className)} role="radiogroup">
      {options.map((option) => (
        <label
          key={option.value}
          className="inline-flex items-center gap-2 text-sm text-secondary-foreground"
        >
          <span className="relative flex size-4 shrink-0 items-center justify-center">
            <input
              type="radio"
              name={name}
              value={option.value}
              defaultChecked={option.value === defaultValue}
              disabled={disabled}
              className="peer size-4 appearance-none rounded-full border border-border-strong bg-card transition-colors duration-[var(--motion-fast)] checked:border-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50"
            />
            <span
              className="pointer-events-none absolute size-2 rounded-full bg-primary opacity-0 transition-opacity duration-[var(--motion-fast)] peer-checked:opacity-100"
              aria-hidden="true"
            />
          </span>
          {option.label}
        </label>
      ))}
    </div>
  );
}
