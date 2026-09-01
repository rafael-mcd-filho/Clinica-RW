import { Skeleton } from "@/components/ui/loader";

export default function Loading() {
  return (
    <div className="grid content-start gap-5" role="status">
      <span className="sr-only">Carregando página</span>

      <div className="flex min-h-14 items-start justify-between gap-4">
        <div className="grid gap-2">
          <Skeleton className="h-6 w-44" />
          <Skeleton className="h-4 w-72 max-w-[70vw]" />
        </div>
        <Skeleton className="h-9 w-32" />
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
