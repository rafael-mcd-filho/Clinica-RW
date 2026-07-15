import { Skeleton } from "@/components/ui/loader";

function LoadingFrame({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid min-h-[calc(100vh-7rem)] gap-5" role="status">
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}

function Heading({ action = false }: { action?: boolean }) {
  return (
    <section className="flex min-h-14 items-start justify-between gap-4">
      <div className="grid gap-2">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-4 w-72 max-w-[70vw]" />
      </div>
      {action ? <Skeleton className="h-9 w-36" /> : null}
    </section>
  );
}

function CardSkeleton({ className = "" }: { className?: string }) {
  return (
    <div
      className={`rounded-lg border border-border bg-card p-4 shadow-[var(--shadow-soft)] ${className}`}
    >
      <Skeleton className="size-9" />
      <Skeleton className="mt-4 h-4 w-24" />
      <Skeleton className="mt-2 h-7 w-16" />
    </div>
  );
}

export function DashboardLoadingSkeleton() {
  return (
    <LoadingFrame label="Carregando painel">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
        <Heading />
        <div className="flex flex-wrap gap-2">
          <Skeleton className="h-10 w-36" />
          <Skeleton className="h-10 w-44" />
          <Skeleton className="h-10 w-32" />
        </div>
      </div>
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <CardSkeleton key={index} />
        ))}
      </section>
      <section className="grid items-start gap-4 md:grid-cols-2 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, index) => (
          <div
            key={index}
            className="min-h-72 rounded-lg border border-border bg-card p-4 shadow-[var(--shadow-soft)]"
          >
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="mx-auto mt-7 size-36 rounded-full" />
            <Skeleton className="mx-auto mt-6 h-3 w-4/5" />
          </div>
        ))}
      </section>
      <section className="rounded-lg border border-border bg-card p-5 shadow-[var(--shadow-soft)]">
        <Skeleton className="h-4 w-44" />
        <Skeleton className="mt-6 h-64 w-full" />
      </section>
    </LoadingFrame>
  );
}

export function AgendaLoadingSkeleton() {
  return (
    <LoadingFrame label="Carregando agenda">
      <Heading action />
      <section className="rounded-lg border border-border bg-card p-4 shadow-[var(--shadow-soft)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            <Skeleton className="h-9 w-52" />
            <Skeleton className="h-9 w-40" />
            <Skeleton className="h-9 w-44" />
          </div>
          <Skeleton className="h-7 w-40" />
        </div>
        <div className="mt-3 flex gap-3">
          <Skeleton className="h-10 flex-1" />
          <Skeleton className="h-10 w-28" />
        </div>
      </section>
      <section className="min-h-[32rem] overflow-hidden rounded-lg border border-border bg-card shadow-[var(--shadow-soft)]">
        <div className="grid grid-cols-[5rem_repeat(4,minmax(10rem,1fr))] border-b border-border bg-muted/60">
          {Array.from({ length: 5 }).map((_, index) => (
            <div
              key={index}
              className="border-r border-border p-3 last:border-r-0"
            >
              <Skeleton className="h-4 w-16" />
            </div>
          ))}
        </div>
        <div className="grid h-[29rem] grid-cols-[5rem_repeat(4,minmax(10rem,1fr))]">
          {Array.from({ length: 5 }).map((_, column) => (
            <div
              key={column}
              className="grid content-start gap-3 border-r border-border p-3 last:border-r-0"
            >
              {column ? (
                <>
                  <Skeleton className="h-20 w-full" />
                  <Skeleton className="h-28 w-full" />
                </>
              ) : (
                Array.from({ length: 7 }).map((__, row) => (
                  <Skeleton key={row} className="h-3 w-10" />
                ))
              )}
            </div>
          ))}
        </div>
      </section>
    </LoadingFrame>
  );
}

export function SettingsLoadingSkeleton() {
  return (
    <LoadingFrame label="Carregando configurações">
      <Heading />
      <Skeleton className="h-12 w-full max-w-4xl rounded-xl" />
      <section className="rounded-lg border border-border bg-card p-5 shadow-[var(--shadow-soft)]">
        <div className="flex items-center justify-between gap-4">
          <div className="grid gap-2">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-4 w-72" />
          </div>
          <Skeleton className="h-9 w-44" />
        </div>
        <div className="mt-5 grid gap-2 border-t border-border pt-5 sm:grid-cols-3 xl:grid-cols-5">
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="h-10 w-full" />
          ))}
        </div>
      </section>
      <Skeleton className="h-12 w-full max-w-2xl rounded-xl" />
      <section className="rounded-lg border border-border bg-card shadow-[var(--shadow-soft)]">
        <div className="border-b border-border p-5">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="mt-2 h-4 w-72" />
        </div>
        <div className="grid gap-4 p-5 md:grid-cols-3">
          <Skeleton className="h-16 md:col-span-2" />
          <Skeleton className="h-16" />
          {Array.from({ length: 8 }).map((_, index) => (
            <Skeleton key={index} className="h-16" />
          ))}
        </div>
      </section>
    </LoadingFrame>
  );
}

export function FinanceLoadingSkeleton() {
  return (
    <LoadingFrame label="Carregando financeiro">
      <Heading action />
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <CardSkeleton key={index} />
        ))}
      </section>
      <Skeleton className="h-12 w-full max-w-3xl rounded-xl" />
      <section className="overflow-hidden rounded-lg border border-border bg-card shadow-[var(--shadow-soft)]">
        <div className="flex items-center justify-between border-b border-border p-5">
          <Skeleton className="h-5 w-44" />
          <Skeleton className="h-9 w-32" />
        </div>
        <div className="divide-y divide-border">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="flex items-center gap-4 p-5">
              <div className="grid flex-1 gap-2">
                <Skeleton className="h-4 w-2/5" />
                <Skeleton className="h-3 w-1/3" />
              </div>
              <Skeleton className="h-5 w-24" />
              <Skeleton className="h-7 w-20" />
            </div>
          ))}
        </div>
      </section>
    </LoadingFrame>
  );
}

export function PatientLoadingSkeleton() {
  return (
    <LoadingFrame label="Carregando dados do paciente">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Skeleton className="size-9" />
          <div className="grid gap-2">
            <Skeleton className="h-6 w-56" />
            <Skeleton className="h-4 w-40" />
          </div>
        </div>
        <Skeleton className="h-9 w-32" />
      </div>
      <div className="grid items-start gap-5 lg:grid-cols-[19rem_minmax(0,1fr)]">
        <section className="rounded-lg border border-border bg-card p-5 shadow-[var(--shadow-soft)]">
          <Skeleton className="mx-auto size-24 rounded-full" />
          <Skeleton className="mx-auto mt-4 h-5 w-40" />
          <Skeleton className="mx-auto mt-2 h-4 w-24" />
          <div className="mt-6 grid gap-4 border-t border-border pt-5">
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className="flex items-center gap-3">
                <Skeleton className="size-5" />
                <Skeleton className="h-4 flex-1" />
              </div>
            ))}
          </div>
        </section>
        <div className="grid gap-5">
          {Array.from({ length: 3 }).map((_, section) => (
            <section
              key={section}
              className="rounded-lg border border-border bg-card p-5 shadow-[var(--shadow-soft)]"
            >
              <Skeleton className="h-5 w-48" />
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {Array.from({ length: 4 }).map((__, index) => (
                  <Skeleton key={index} className="h-20 w-full" />
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </LoadingFrame>
  );
}

export function ClinicalEncounterLoadingSkeleton() {
  return (
    <LoadingFrame label="Carregando prontuário">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Skeleton className="size-9" />
          <div className="grid gap-2">
            <Skeleton className="h-6 w-56 max-w-[65vw]" />
            <Skeleton className="h-4 w-44" />
          </div>
        </div>
        <Skeleton className="h-7 w-28 rounded-full" />
      </div>
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <section className="overflow-hidden rounded-lg border border-border bg-card shadow-[var(--shadow-soft)]">
          <div className="border-b border-border p-5">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="mt-2 h-4 w-72 max-w-[75vw]" />
          </div>
          <div className="grid gap-5 p-5">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="grid gap-2">
                <Skeleton className="h-4 w-36" />
                <Skeleton
                  className={index === 1 ? "h-32 w-full" : "h-20 w-full"}
                />
              </div>
            ))}
          </div>
        </section>
        <aside className="grid gap-4 rounded-lg border border-border bg-card p-5 shadow-[var(--shadow-soft)]">
          <Skeleton className="h-5 w-36" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-4/5" />
          <div className="border-t border-border pt-4">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="mt-3 h-20 w-full" />
          </div>
        </aside>
      </div>
      <div className="sticky bottom-3 flex justify-end gap-2 rounded-lg border border-border bg-card/95 p-3 shadow-[var(--shadow-lg)] backdrop-blur">
        <Skeleton className="h-9 w-28" />
        <Skeleton className="h-9 w-40" />
      </div>
    </LoadingFrame>
  );
}
