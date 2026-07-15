import { Skeleton } from "@/components/ui/loader";

export default function ReportsLoading() {
  return (
    <div className="grid gap-6" role="status">
      <span className="sr-only">Carregando relatório</span>

      <header className="flex min-h-14 items-start justify-between gap-4">
        <div className="grid gap-2">
          <Skeleton className="h-6 w-44" />
          <Skeleton className="h-4 w-80 max-w-[70vw]" />
        </div>
        <Skeleton className="h-10 w-40" />
      </header>

      <section className="rounded-lg border border-border bg-card p-5 shadow-[var(--shadow-soft)]">
        <div className="grid gap-3 lg:grid-cols-5">
          <Skeleton className="h-16" />
          <Skeleton className="h-16 lg:col-span-2" />
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="rounded-lg border border-border bg-card p-4 shadow-[var(--shadow-soft)]"
          >
            <Skeleton className="size-10" />
            <Skeleton className="mt-4 h-4 w-24" />
            <Skeleton className="mt-2 h-7 w-20" />
          </div>
        ))}
      </section>

      <section className="grid gap-5 lg:grid-cols-2">
        <Skeleton className="h-72 rounded-lg" />
        <Skeleton className="h-72 rounded-lg" />
      </section>
    </div>
  );
}
