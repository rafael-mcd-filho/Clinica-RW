"use client";

import { useId, useState } from "react";
import { cn } from "@/lib/utils";

type SwitchProps = {
  checked?: boolean;
  defaultChecked?: boolean;
  disabled?: boolean;
  label: string;
  name?: string;
  onCheckedChange?: (checked: boolean) => void;
};

export function Switch({
  checked,
  defaultChecked = false,
  disabled,
  label,
  name,
  onCheckedChange,
}: SwitchProps) {
  const labelId = useId();
  const [internalChecked, setInternalChecked] = useState(defaultChecked);
  const isChecked = checked ?? internalChecked;

  function handleCheckedChange(nextChecked: boolean) {
    if (checked === undefined) {
      setInternalChecked(nextChecked);
    }
    onCheckedChange?.(nextChecked);
  }

  return (
    <label
      className={cn(
        "inline-flex min-w-0 cursor-pointer items-center gap-2 text-sm leading-5 text-secondary-foreground",
        disabled && "cursor-not-allowed opacity-50",
      )}
    >
      {name ? (
        <input
          type="hidden"
          name={name}
          value={isChecked ? "true" : "false"}
          disabled={disabled}
        />
      ) : null}
      <input
        type="checkbox"
        role="switch"
        checked={isChecked}
        aria-labelledby={labelId}
        disabled={disabled}
        onChange={(event) => handleCheckedChange(event.target.checked)}
        className="peer sr-only"
      />
      <span
        aria-hidden="true"
        className={cn(
          "relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors duration-[var(--motion-fast)] peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primary",
          isChecked ? "bg-primary" : "bg-border-strong",
        )}
      >
        <span
          className={cn(
            "absolute left-0.5 top-0.5 size-4 rounded-full bg-white shadow-sm transition-transform duration-[var(--motion-fast)] ease-[var(--ease-out)]",
            isChecked ? "translate-x-4" : "translate-x-0",
          )}
        />
      </span>
      <span id={labelId} className="min-w-0">
        {label}
      </span>
    </label>
  );
}
