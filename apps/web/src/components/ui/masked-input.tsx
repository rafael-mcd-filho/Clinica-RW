"use client";

import { IMaskInput } from "react-imask";
import { cn } from "@/lib/utils";
import { fieldClasses } from "@/components/ui/field";

// Os tipos do react-imask ainda não acompanham o @types/react 19 mais novo;
// o componente aceita as props nativas de input em runtime.
const MaskInput = IMaskInput as unknown as React.ComponentType<
  Record<string, unknown>
>;

type MaskKind = "cep" | "cnpj" | "cpf" | "phone";

const maskByKind: Record<MaskKind, string | Array<{ mask: string }>> = {
  cep: "00000-000",
  cnpj: "00.000.000/0000-00",
  cpf: "000.000.000-00",
  phone: [{ mask: "(00) 0000-0000" }, { mask: "(00) 00000-0000" }],
};

type MaskedInputProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "defaultValue" | "onChange" | "value"
> & {
  defaultValue?: string;
  maskKind: MaskKind;
  onValueChange?: (value: string) => void;
  value?: string;
};

export function MaskedInput({
  className,
  defaultValue,
  maskKind,
  onValueChange,
  value,
  ...props
}: MaskedInputProps) {
  return (
    <MaskInput
      {...props}
      className={cn(fieldClasses, className)}
      defaultValue={defaultValue}
      mask={maskByKind[maskKind]}
      onAccept={(nextValue: unknown) => onValueChange?.(String(nextValue))}
      overwrite
      unmask={false}
      value={value}
    />
  );
}
