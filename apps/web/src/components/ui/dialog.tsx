"use client";

import { useState, type ComponentType } from "react";
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
}: BaseProps & {
  /** Server action (or any handler) bound to the form. */
  formAction: (formData: FormData) => void | Promise<void>;
}) {
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

type ConfirmActionProps =
  | {
      /** Server action (or any handler) bound to the form. */
      formAction: (formData: FormData) => void | Promise<void>;
      onConfirm?: never;
    }
  | {
      formAction?: never;
      /**
       * Client-side confirmation handler (for flows that are not a server
       * action form, e.g. handlers that already do their own toast). The
       * dialog manages its own pending state and closes when it resolves.
       */
      onConfirm: () => void | Promise<void>;
    };

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
  onConfirm,
  confirmLabel = "Confirmar",
  pendingLabel = "Processando...",
  confirmDisabled,
  destructive,
  icon: Icon,
}: BaseProps & ConfirmActionProps & { destructive?: boolean }) {
  const [callbackPending, setCallbackPending] = useState(false);
  const isPending = Boolean(pending || callbackPending);

  async function handleConfirmClick() {
    if (!onConfirm) return;
    setCallbackPending(true);
    try {
      await onConfirm();
      onClose();
    } finally {
      setCallbackPending(false);
    }
  }

  const footer = (
    <div className="flex justify-end gap-2">
      <Button
        type="button"
        variant="secondary"
        onClick={onClose}
        disabled={isPending}
      >
        Cancelar
      </Button>
      <Button
        type={onConfirm ? "button" : "submit"}
        variant={destructive ? "destructive" : "primary"}
        disabled={isPending || confirmDisabled}
        onClick={onConfirm ? handleConfirmClick : undefined}
      >
        {Icon ? <Icon className="size-4" /> : null}
        {isPending ? pendingLabel : confirmLabel}
      </Button>
    </div>
  );

  const body = (
    <>
      {children}

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {footer}
    </>
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={description}
    >
      {onConfirm ? (
        <div className="grid min-w-0 gap-4">{body}</div>
      ) : (
        <form action={formAction} className="grid min-w-0 gap-4">
          {body}
        </form>
      )}
    </Modal>
  );
}
