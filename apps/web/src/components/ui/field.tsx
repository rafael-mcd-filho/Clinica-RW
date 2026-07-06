import * as React from "react";
import { cn } from "@/lib/utils";

export { MultiSelect, Select } from "@/components/ui/select";

const fieldClassName =
  "h-10 rounded-md border border-border bg-card px-3 text-sm text-foreground shadow-[var(--shadow-soft)] outline-none transition-[border-color,box-shadow,background-color] duration-[var(--motion-fast)] ease-[var(--ease-out)] placeholder:text-placeholder focus:border-primary focus:shadow-[0_0_0_3px_rgba(79,70,229,0.1)] disabled:cursor-not-allowed disabled:opacity-60";

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
          "min-h-24 rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground shadow-[var(--shadow-soft)] outline-none transition-[border-color,box-shadow,background-color] duration-[var(--motion-fast)] ease-[var(--ease-out)] placeholder:text-placeholder focus:border-primary focus:shadow-[0_0_0_3px_rgba(79,70,229,0.1)] disabled:cursor-not-allowed disabled:opacity-60",
          className,
        )}
        {...props}
      />
    );
  },
);

export const fieldClasses = fieldClassName;
