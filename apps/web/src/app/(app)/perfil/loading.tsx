import { Skeleton } from "@/components/ui/loader";

export default function Loading() {
  return (
    <div className="grid gap-6">
      <div className="flex items-center gap-3">
        <Skeleton className="size-10 rounded-md" />
        <div className="grid gap-2">
          <Skeleton className="h-6 w-36" />
          <Skeleton className="h-4 w-64" />
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card shadow-[var(--shadow-soft)]">
        <div className="flex items-center gap-3 border-b border-border px-5 py-4">
          <Skeleton className="size-10 rounded" />
          <div className="grid gap-2">
            <Skeleton className="h-4 w-44" />
            <Skeleton className="h-3 w-32" />
          </div>
        </div>
        <div className="grid gap-3 p-5 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <div
              key={index}
              className="rounded-lg border border-border bg-background p-4"
            >
              <Skeleton className="h-3 w-20" />
              <Skeleton className="mt-2 h-4 w-40" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
