import { Skeleton } from "@/components/ui/loader";

export default function Loading() {
  return (
    <div className="grid gap-6">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div className="flex items-center gap-3">
          <Skeleton className="size-9 rounded-md" />
          <div className="grid gap-2">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-64" />
          </div>
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-28" />
          <Skeleton className="h-9 w-32" />
        </div>
      </div>

      <div className="grid grid-flow-col gap-4 overflow-x-auto pb-2 [grid-auto-columns:minmax(16rem,1fr)]">
        {Array.from({ length: 4 }).map((_, columnIndex) => (
          <div
            key={columnIndex}
            className="rounded-lg border border-border bg-card p-3 shadow-[var(--shadow-soft)]"
          >
            <Skeleton className="h-4 w-28" />
            <div className="mt-3 grid gap-2">
              {Array.from({ length: 3 }).map((_, cardIndex) => (
                <div
                  key={cardIndex}
                  className="rounded-md border border-border bg-background p-3"
                >
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="mt-2 h-3 w-1/2" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
