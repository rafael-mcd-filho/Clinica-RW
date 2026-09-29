"use client";

import { useId, useState, type ComponentType } from "react";
import { Button } from "@/components/ui/button";
import { FormError } from "@/components/ui/form-error";
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
  onSubmit?: React.FormEventHandler<HTMLFormElement>;
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
  onSubmit,
}: BaseProps & {
  /** Server action (or any handler) bound to the form. */
  formAction: (formData: FormData) => void | Promise<void>;
}) {
  const formId = useId();
  const footer = (
    <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      <Button
        type="button"
        variant="secondary"
        className="w-full sm:w-auto"
        onClick={onClose}
      >
        Cancelar
      </Button>
      <Button
        type="submit"
        form={formId}
        className="w-full sm:w-auto"
        disabled={pending || confirmDisabled}
      >
        {Icon ? <Icon className="size-4" aria-hidden="true" /> : null}
        {pending ? pendingLabel : confirmLabel}
      </Button>
    </div>
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      footer={footer}
    >
      <form
        id={formId}
        action={formAction}
        className="grid min-w-0 gap-4"
        onSubmit={onSubmit}
      >
        {children}
        <FormError message={error} />
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
      /**
       * Return `false` to keep the dialog open (for example, when the action
       * returns a validation error).
       */
      onConfirm: () => boolean | void | Promise<boolean | void>;
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
  const formId = useId();
  const [callbackPending, setCallbackPending] = useState(false);
  const isPending = Boolean(pending || callbackPending);

  async function handleConfirmClick() {
    if (!onConfirm) return;
    setCallbackPending(true);
    try {
      const shouldClose = await onConfirm();
      if (shouldClose !== false) onClose();
    } finally {
      setCallbackPending(false);
    }
  }

  const footer = (
    <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      <Button
        type="button"
        variant="secondary"
        className="w-full sm:w-auto"
        onClick={onClose}
        disabled={isPending}
      >
        Cancelar
      </Button>
      <Button
        type={onConfirm ? "button" : "submit"}
        form={onConfirm ? undefined : formId}
        variant={destructive ? "destructive" : "primary"}
        className="w-full sm:w-auto"
        disabled={isPending || confirmDisabled}
        onClick={onConfirm ? handleConfirmClick : undefined}
      >
        {Icon ? <Icon className="size-4" aria-hidden="true" /> : null}
        {isPending ? pendingLabel : confirmLabel}
      </Button>
    </div>
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      footer={footer}
    >
      {onConfirm ? (
        <div className="grid min-w-0 gap-4">
          {children}
          <FormError message={error} />
        </div>
      ) : (
        <form id={formId} action={formAction} className="grid min-w-0 gap-4">
          {children}
          <FormError message={error} />
        </form>
      )}
    </Modal>
  );
}
