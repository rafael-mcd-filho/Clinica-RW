"use client";

import { useState } from "react";
import { fieldClasses } from "@/components/ui/field";
import { cn } from "@/lib/utils";

/** 1234.5 → "1.234,50"; vazio/inválido → "". */
export function formatCurrencyInput(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") return "";
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return "";
  return numeric.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Valor em reais, digitado como no caixa eletrônico: os dígitos entram pela
 * direita ("1", "12", "1,23"...). Antes cada tela pedia o valor de um jeito
 * (número com ponto, texto com vírgula), e o mesmo preço podia ser salvo
 * errado. O servidor recebe "1.234,56" e converte.
 */
export function CurrencyInput({
  allowEmpty = false,
  className,
  defaultValue,
  disabled,
  id,
  name,
  onValueChange,
  placeholder = "0,00",
  required,
  "aria-describedby": ariaDescribedBy,
  "aria-invalid": ariaInvalid,
  "aria-label": ariaLabel,
}: {
  /** Vazio é um valor válido (ex.: convênio que não cobre). */
  allowEmpty?: boolean;
  className?: string;
  defaultValue?: number | string | null;
  disabled?: boolean;
  id?: string;
  name: string;
  onValueChange?: (formatted: string) => void;
  placeholder?: string;
  required?: boolean;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
  "aria-label"?: string;
}) {
  const [value, setValue] = useState(() =>
    formatCurrencyInput(defaultValue ?? (allowEmpty ? "" : null)),
  );

  function update(raw: string) {
    const digits = raw.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
    const next =
      !digits && allowEmpty
        ? ""
        : formatCurrencyInput(Number(digits || "0") / 100);
    setValue(next);
    onValueChange?.(next);
  }

  return (
    <div className="relative min-w-0">
      <span
        aria-hidden="true"
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-control text-muted-foreground"
      >
        R$
      </span>
      <input
        id={id}
        name={name}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        value={value}
        disabled={disabled}
        required={required}
        placeholder={placeholder}
        aria-label={ariaLabel}
        aria-invalid={ariaInvalid}
        aria-describedby={ariaDescribedBy}
        onChange={(event) => update(event.target.value)}
        className={cn(fieldClasses, "pl-10 text-right tabular-nums", className)}
      />
    </div>
  );
}
