import { Skeleton } from "@/components/ui/loader";

export default function Loading() {
  return (
    <div className="grid gap-6">
      <div className="flex items-center gap-3">
        <Skeleton className="size-10 rounded-md" />
        <div className="grid gap-2">
          <Skeleton className="h-6 w-36" />
          <Skeleton className="h-4 w-80" />
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card p-4 shadow-[var(--shadow-soft)]">
        <div className="grid gap-3 md:grid-cols-[1fr_18rem_auto]">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-24" />
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card shadow-[var(--shadow-soft)]">
        <div className="divide-y divide-border">
          {Array.from({ length: 8 }).map((_, index) => (
            <div key={index} className="grid gap-2 px-5 py-4">
              <Skeleton className="h-4 w-2/5" />
              <Skeleton className="h-3 w-3/5" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
