import { Skeleton } from "@/components/ui/loader";

export default function Loading() {
  return (
    <div className="grid content-start gap-5" role="status">
      <span className="sr-only">Carregando página</span>

      {/* O bloco da esquerda encolhe: com largura fixa ao lado do botão,
          no celular o esqueleto passava da tela e a página rolava de lado
          enquanto carregava. */}
      <div className="flex min-h-14 items-start justify-between gap-4">
        <div className="grid min-w-0 flex-1 gap-2">
          <Skeleton className="h-6 w-full max-w-44" />
          <Skeleton className="h-4 w-full max-w-72" />
        </div>
        <Skeleton className="h-9 w-32 shrink-0" />
      </div>

      <section className="overflow-hidden rounded-lg border border-border bg-card shadow-[var(--shadow-soft)]">
        <div className="border-b border-border px-5 py-4">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="mt-2 h-3.5 w-72 max-w-[70vw]" />
        </div>
        <div className="grid gap-4 p-5">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      </section>
    </div>
  );
}
