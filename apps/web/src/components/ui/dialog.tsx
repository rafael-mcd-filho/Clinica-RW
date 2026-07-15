"use client";

import type { ComponentType } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";

type BaseProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children?: React.ReactNode;
  error?: string;
  pending?: boolean;
  /** Server action (or any handler) bound to the form. */
  formAction: (formData: FormData) => void | Promise<void>;
  confirmLabel?: string;
  pendingLabel?: string;
  confirmDisabled?: boolean;
  icon?: ComponentType<{ className?: string }>;
};

/**
 * Standard modal for forms (create / edit / quick actions): titled dialog with
 * a body and a Cancel / Confirm footer wired to a server action.
 */
export function FormDialog({
  open,
  onClose,
  title,
  description,
  children,
  error,
  pending,
  formAction,
  confirmLabel = "Salvar",
  pendingLabel = "Salvando...",
  confirmDisabled,
  icon: Icon,
}: BaseProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={description}
    >
      <form action={formAction} className="grid min-w-0 gap-4">
        {children}

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={pending || confirmDisabled}>
            {Icon ? <Icon className="size-4" /> : null}
            {pending ? pendingLabel : confirmLabel}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/**
 * Standard modal for confirmations and destructive actions. Same shape as
 * FormDialog but the confirm button adopts the danger styling when destructive.
 */
export function ConfirmDialog({
  open,
  onClose,
  title,
  description,
  children,
  error,
  pending,
  formAction,
  confirmLabel = "Confirmar",
  pendingLabel = "Processando...",
  confirmDisabled,
  destructive,
  icon: Icon,
}: BaseProps & { destructive?: boolean }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={description}
    >
      <form action={formAction} className="grid min-w-0 gap-4">
        {children}

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            type="submit"
            disabled={pending || confirmDisabled}
            className={
              destructive
                ? "bg-destructive text-white hover:bg-destructive hover:shadow-[var(--shadow-hover)]"
                : undefined
            }
          >
            {Icon ? <Icon className="size-4" /> : null}
            {pending ? pendingLabel : confirmLabel}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
