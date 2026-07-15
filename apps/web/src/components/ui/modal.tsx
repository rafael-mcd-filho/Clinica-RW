"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ModalProps = {
  children: React.ReactNode;
  description?: string;
  footer?: React.ReactNode;
  onClose: () => void;
  open: boolean;
  title: string;
  className?: string;
};

/**
 * Accessible dialog built on Radix: focus trap, Escape to close, scroll lock,
 * proper ARIA wiring and animation from the centered surface. The public API is
 * kept identical to the previous hand-rolled modal.
 */
export function Modal({
  children,
  className,
  description,
  footer,
  onClose,
  open,
  title,
}: ModalProps) {
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next: boolean) => {
        if (!next) {
          onClose();
        }
      }}
    >
      <Dialog.Portal>
        <div className="fixed inset-0 z-50 grid place-items-center p-4">
          <Dialog.Overlay className="absolute inset-0 bg-slate-950/40 backdrop-blur-[2px] data-[state=open]:animate-fade-in" />
          <Dialog.Content
            data-select-portal-root
            className={cn(
              "relative z-10 flex max-h-[calc(100vh-2rem)] w-full max-w-xl flex-col overflow-hidden rounded-lg border border-border bg-popover shadow-[var(--shadow-lg)] data-[state=open]:animate-dialog-in",
              className,
            )}
          >
            <header className="flex shrink-0 items-start justify-between gap-4 border-b border-border px-5 py-4">
              <div>
                <Dialog.Title className="text-base font-semibold">
                  {title}
                </Dialog.Title>
                <Dialog.Description
                  className={cn(
                    "mt-1 text-sm text-muted-foreground",
                    description ? "" : "sr-only",
                  )}
                >
                  {description ?? title}
                </Dialog.Description>
              </div>
              <Dialog.Close asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Fechar"
                  className="shrink-0"
                >
                  <X className="size-4" aria-hidden="true" />
                </Button>
              </Dialog.Close>
            </header>
            <div className="min-w-0 overflow-y-auto p-5">{children}</div>
            {footer ? (
              <footer className="flex shrink-0 justify-end gap-2 border-t border-border px-5 py-4">
                {footer}
              </footer>
            ) : null}
          </Dialog.Content>
        </div>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
