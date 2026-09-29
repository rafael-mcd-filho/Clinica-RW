import { cn } from "@/lib/utils";

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      aria-label="Carregando"
      role="status"
      className={cn(
        "inline-block size-4 animate-spin rounded-full border-2 border-border border-t-primary",
        className,
      )}
    />
  );
}

export function Skeleton({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        // linear: movimento contínuo em velocidade constante. Com movimento
        // reduzido o brilho some e fica só o bloco cinza.
        "relative block overflow-hidden rounded bg-muted before:absolute before:inset-0 before:animate-[shimmer_1.4s_linear_infinite] before:bg-gradient-to-r before:from-transparent before:via-white/70 before:to-transparent motion-reduce:before:hidden",
        className,
      )}
    />
  );
}
