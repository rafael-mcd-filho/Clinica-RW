"use client";

import { useState } from "react";
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
  const [internalChecked, setInternalChecked] = useState(defaultChecked);
  const isChecked = checked ?? internalChecked;

  function toggle() {
    if (disabled) {
      return;
    }

    const nextChecked = !isChecked;
    setInternalChecked(nextChecked);
    onCheckedChange?.(nextChecked);
  }

  return (
    <label className="inline-flex items-center gap-2 text-sm text-secondary-foreground">
      <input type="hidden" name={name} value={isChecked ? "true" : "false"} />
      <button
        type="button"
        role="switch"
        aria-checked={isChecked}
        aria-label={label}
        disabled={disabled}
        onClick={toggle}
        className={cn(
          "relative h-5 w-9 rounded-full transition-colors duration-[var(--motion-fast)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50",
          isChecked ? "bg-primary" : "bg-border-strong",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 size-4 rounded-full bg-white shadow transition-transform duration-[var(--motion-fast)] ease-[var(--ease-out)]",
            isChecked ? "translate-x-[18px]" : "translate-x-0.5",
          )}
        />
      </button>
      <span>{label}</span>
    </label>
  );
}
