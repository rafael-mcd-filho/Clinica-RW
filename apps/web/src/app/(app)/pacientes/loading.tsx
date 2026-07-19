import { Skeleton } from "@/components/ui/loader";

export default function Loading() {
  return (
    <div className="grid gap-6">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div className="flex items-center gap-3">
          <Skeleton className="size-10 rounded-md" />
          <div className="grid gap-2">
            <Skeleton className="h-6 w-36" />
            <Skeleton className="h-4 w-72" />
          </div>
        </div>
        <Skeleton className="h-9 w-40" />
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card shadow-[var(--shadow-soft)]">
        <div className="border-b border-border px-4 py-3">
          <Skeleton className="h-9 w-64" />
        </div>
        <div className="divide-y divide-border">
          {Array.from({ length: 7 }).map((_, index) => (
            <div key={index} className="flex items-center gap-4 px-5 py-4">
              <Skeleton className="size-9 rounded-full" />
              <div className="grid flex-1 gap-2">
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-3 w-1/4" />
              </div>
              <Skeleton className="h-8 w-28" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
