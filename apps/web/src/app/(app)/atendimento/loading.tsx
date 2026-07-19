import { Skeleton } from "@/components/ui/loader";

export default function Loading() {
  return (
    <div className="grid h-[calc(100svh-var(--app-sticky-offset))] min-h-[36rem] grid-cols-1 overflow-hidden bg-card lg:grid-cols-[21rem_minmax(0,1fr)]">
      <div className="flex min-h-0 flex-col border-r border-border">
        <div className="flex h-12 items-center border-b border-border px-4">
          <Skeleton className="h-4 w-40" />
        </div>
        <div className="border-b border-border p-3">
          <Skeleton className="h-9 w-full" />
        </div>
        <div className="divide-y divide-border">
          {Array.from({ length: 7 }).map((_, index) => (
            <div key={index} className="flex items-center gap-3 p-3">
              <Skeleton className="size-10 rounded-full" />
              <div className="grid flex-1 gap-2">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="hidden min-h-0 flex-col lg:flex">
        <div className="flex min-h-16 items-center gap-3 border-b border-border px-4">
          <Skeleton className="size-10 rounded-full" />
          <div className="grid gap-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-28" />
          </div>
        </div>
        <div className="flex flex-1 flex-col justify-end gap-3 p-4">
          <Skeleton className="h-12 w-2/5" />
          <Skeleton className="ml-auto h-12 w-2/5" />
          <Skeleton className="h-12 w-1/3" />
          <Skeleton className="mt-2 h-14 w-full" />
        </div>
      </div>
    </div>
  );
}
