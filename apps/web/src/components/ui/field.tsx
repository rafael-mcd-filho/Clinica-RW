import * as React from "react";
import { HelpTooltip } from "@/components/ui/help-tooltip";
import { RequiredMark } from "@/components/ui/required-mark";
import { cn } from "@/lib/utils";

export { MultiSelect, Select } from "@/components/ui/select";

const fieldClassName =
  "h-10 min-w-0 w-full rounded-md border border-border bg-card px-3 text-sm text-foreground shadow-[var(--shadow-soft)] outline-none transition-[border-color,box-shadow,background-color] duration-[var(--motion-fast)] ease-[var(--ease-out)] placeholder:text-placeholder focus:border-primary focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--ring)_15%,transparent)] aria-[invalid=true]:border-destructive aria-[invalid=true]:ring-2 aria-[invalid=true]:ring-destructive/15 user-invalid:border-destructive disabled:cursor-not-allowed disabled:opacity-60";

type InputProps = React.InputHTMLAttributes<HTMLInputElement>;
type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  function Input({ className, ...props }, ref) {
    return (
      <input ref={ref} className={cn(fieldClassName, className)} {...props} />
    );
  },
);

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  function Textarea({ className, ...props }, ref) {
    return (
      <textarea
        ref={ref}
        className={cn(
          "min-h-24 min-w-0 w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground shadow-[var(--shadow-soft)] outline-none transition-[border-color,box-shadow,background-color] duration-[var(--motion-fast)] ease-[var(--ease-out)] placeholder:text-placeholder focus:border-primary focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--ring)_15%,transparent)] aria-[invalid=true]:border-destructive aria-[invalid=true]:ring-2 aria-[invalid=true]:ring-destructive/15 user-invalid:border-destructive disabled:cursor-not-allowed disabled:opacity-60",
          className,
        )}
        {...props}
      />
    );
  },
);

export const fieldClasses = fieldClassName;

// Monta a estrutura padrão de um campo de formulário: label (+ marca de
// obrigatório + ajuda contextual), o controle e a mensagem de erro do
// campo. Com `htmlFor` a associação é explícita (passe o mesmo id no
// controle); sem, o label envolve o controle (associação implícita, o
// padrão predominante no app).
export function FormField({
  label,
  required,
  help,
  error,
  htmlFor,
  className,
  children,
}: {
  label: React.ReactNode;
  required?: boolean;
  help?: React.ReactNode;
  error?: string;
  htmlFor?: string;
  className?: string;
  children: React.ReactNode;
}) {
  const labelContent = (
    <span className="flex items-center gap-1 text-body-sm font-medium">
      {label}
      {required ? <RequiredMark /> : null}
      {help ? <HelpTooltip>{help}</HelpTooltip> : null}
    </span>
  );

  return (
    <div className={cn("grid min-w-0 content-start gap-1.5", className)}>
      {htmlFor ? (
        <>
          <label htmlFor={htmlFor}>{labelContent}</label>
          {children}
        </>
      ) : (
        <label className="grid min-w-0 gap-1.5">
          {labelContent}
          {children}
        </label>
      )}
      {error ? (
        <p role="alert" className="text-body-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
