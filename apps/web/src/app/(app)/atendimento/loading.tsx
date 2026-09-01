import { Skeleton } from "@/components/ui/loader";

export default function Loading() {
  return (
    <div
      className="grid h-full min-h-0 grid-cols-1 overflow-hidden bg-card lg:grid-cols-[21rem_minmax(0,1fr)]"
      role="status"
    >
      <span className="sr-only">Carregando atendimentos</span>

      <aside className="flex h-full min-h-0 flex-col overflow-hidden border-r border-border">
        <div className="flex h-12 shrink-0 items-center justify-between border-b border-border px-4">
          <Skeleton className="h-3.5 w-40" />
          <Skeleton className="size-8 rounded-md" />
        </div>

        <div className="shrink-0 border-b border-border p-3">
          <div className="flex h-8 items-center gap-2">
            <Skeleton className="h-8 w-24 rounded-full" />
            <Skeleton className="h-8 w-20 rounded-full" />
            <Skeleton className="h-8 w-20 rounded-full" />
          </div>
          <div className="mt-2 flex h-9 items-center justify-between border-t border-border/70 pt-2">
            <div className="flex gap-2">
              <Skeleton className="h-8 w-16 rounded-full" />
              <Skeleton className="h-8 w-28 rounded-full" />
            </div>
            <div className="flex gap-1">
              <Skeleton className="size-8 rounded-md" />
              <Skeleton className="size-8 rounded-md" />
            </div>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-hidden">
          {Array.from({ length: 7 }).map((_, index) => (
            <div
              key={index}
              className="grid h-24 grid-cols-[2.5rem_minmax(0,1fr)_2rem] gap-x-2 border-b border-border px-3 py-2"
            >
              <Skeleton className="size-10 self-center rounded-full" />
              <div className="grid content-center gap-2">
                <Skeleton className="h-4 w-3/5" />
                <Skeleton className="h-3 w-4/5" />
                <div className="flex gap-1.5">
                  <Skeleton className="h-4 w-16 rounded-full" />
                  <Skeleton className="h-4 w-20 rounded-full" />
                </div>
              </div>
              <div className="grid content-center justify-items-end gap-2">
                <Skeleton className="h-3 w-8" />
                <Skeleton className="size-5 rounded-full" />
              </div>
            </div>
          ))}
        </div>
      </aside>

      <section className="hidden h-full min-h-0 flex-col overflow-hidden lg:flex">
        <header className="flex h-16 min-h-16 shrink-0 items-center justify-between border-b border-border bg-muted px-4">
          <div className="flex items-center gap-3">
            <Skeleton className="size-10 rounded-full" />
            <div className="grid gap-2">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-28" />
            </div>
          </div>
          <Skeleton className="h-8 w-24" />
        </header>

        <div className="flex min-h-16 shrink-0 items-center justify-between border-b border-border px-5">
          <div className="grid gap-2">
            <Skeleton className="h-3.5 w-56" />
            <Skeleton className="h-3 w-72" />
          </div>
          <Skeleton className="h-8 w-24" />
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden bg-[#efeae2] px-8 py-5">
          <Skeleton className="mx-auto h-6 w-16 rounded-lg" />
          <Skeleton className="h-14 w-[38%] rounded-lg" />
          <Skeleton className="h-20 w-[52%] rounded-lg" />
          <Skeleton className="ml-auto h-16 w-[42%] rounded-lg" />
          <Skeleton className="h-12 w-[30%] rounded-lg" />
        </div>

        <div className="flex h-16 shrink-0 items-center gap-3 border-t border-border bg-muted px-4">
          <Skeleton className="size-8 rounded-full" />
          <Skeleton className="size-8 rounded-full" />
          <Skeleton className="h-10 flex-1 rounded-full" />
          <Skeleton className="size-9 rounded-full" />
        </div>
      </section>
    </div>
  );
}
