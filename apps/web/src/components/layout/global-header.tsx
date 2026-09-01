"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CalendarCheck,
  CaretRight,
  List as Menu,
  MagnifyingGlass,
  SignOut as LogOut,
  SpinnerGap,
  User,
  UserCircle,
} from "@phosphor-icons/react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { signOut } from "@/app/(auth)/login/actions";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export type GlobalSearchPage = {
  href: string;
  label: string;
  section: string;
};

type PatientSearchResult = {
  id: string;
  full_name: string;
  social_name: string | null;
  email?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
};

export function GlobalHeader({
  pages,
  patientSearchEnabled,
  userName,
  userSubtitle,
  userOrganization,
  sidebarPinned,
  onOpenMenu,
  todayRailEnabled,
  todayRailOpen,
  todayAppointmentCount,
  onToggleTodayRail,
}: {
  pages: GlobalSearchPage[];
  patientSearchEnabled: boolean;
  userName: string;
  userSubtitle: string;
  userOrganization: string;
  sidebarPinned: boolean;
  onOpenMenu: () => void;
  todayRailEnabled: boolean;
  todayRailOpen: boolean;
  todayAppointmentCount: number | null;
  onToggleTodayRail: () => void;
}) {
  const appointmentsLabel =
    todayAppointmentCount && todayAppointmentCount > 0
      ? `Abrir atendimentos do dia: ${todayAppointmentCount} agendamentos`
      : "Abrir atendimentos do dia";

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-border bg-card/95 px-3 backdrop-blur sm:px-5">
      <Button
        variant="ghost"
        size="icon"
        type="button"
        aria-label="Abrir menu"
        onClick={onOpenMenu}
        className={cn("shrink-0", sidebarPinned ? "lg:hidden" : "")}
      >
        <Menu className="size-5" aria-hidden="true" />
      </Button>

      <GlobalSearch pages={pages} patientSearchEnabled={patientSearchEnabled} />

      <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2">
        {todayRailEnabled ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={appointmentsLabel}
            title={appointmentsLabel}
            onClick={onToggleTodayRail}
            className={cn(
              "relative rounded-full",
              todayRailOpen && "bg-muted text-foreground",
            )}
          >
            <CalendarCheck className="size-5" aria-hidden="true" />
            {todayAppointmentCount && todayAppointmentCount > 0 ? (
              <span className="absolute -right-0.5 -top-0.5 flex min-w-4 items-center justify-center rounded-full border-2 border-card bg-primary px-1 text-[9px] font-bold leading-3 text-primary-foreground">
                {todayAppointmentCount > 99 ? "99+" : todayAppointmentCount}
              </span>
            ) : null}
          </Button>
        ) : null}

        <span
          className="mx-1 hidden h-8 w-px bg-border sm:block"
          aria-hidden="true"
        />

        <DropdownMenu
          align="end"
          triggerLabel="Abrir menu da conta"
          triggerClassName="group !h-auto !w-auto min-w-0 gap-2.5 rounded-lg px-1 py-1 text-foreground sm:px-2"
          trigger={
            <>
              <span className="hidden min-w-0 text-right md:block">
                <span className="block max-w-44 truncate text-sm font-semibold text-foreground">
                  {userName}
                </span>
                <span className="block max-w-44 truncate text-xs text-muted-foreground">
                  {userSubtitle}
                </span>
              </span>
              <Avatar
                name={userName}
                size="sm"
                tone="solid"
                className="shadow-[var(--shadow-soft)] transition-transform group-hover:scale-[1.03]"
              />
            </>
          }
        >
          {(close) => (
            <>
              <div className="flex min-w-0 items-center gap-3 px-2.5 py-2.5">
                <Avatar name={userName} />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-foreground">
                    {userName}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {userOrganization}
                  </span>
                </span>
              </div>

              <DropdownMenuSeparator />

              <Link
                href="/perfil"
                prefetch={true}
                role="menuitem"
                onClick={close}
                className="flex w-full items-center gap-2.5 rounded px-2.5 py-2 text-sm font-medium text-foreground transition-colors duration-[var(--motion-fast)] hover:bg-muted"
              >
                <UserCircle className="size-4 shrink-0" aria-hidden="true" />
                Meu perfil
              </Link>

              <form action={signOut}>
                <button
                  type="submit"
                  role="menuitem"
                  className="flex w-full items-center gap-2.5 rounded px-2.5 py-2 text-left text-sm font-medium text-foreground transition-colors duration-[var(--motion-fast)] hover:bg-muted"
                >
                  <LogOut className="size-4 shrink-0" aria-hidden="true" />
                  Sair
                </button>
              </form>
            </>
          )}
        </DropdownMenu>
      </div>
    </header>
  );
}

function GlobalSearch({
  pages,
  patientSearchEnabled,
}: {
  pages: GlobalSearchPage[];
  patientSearchEnabled: boolean;
}) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const resultsId = useId();
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const [patientSearch, setPatientSearch] = useState<{
    query: string;
    patients: PatientSearchResult[];
    status: "loading" | "ready" | "error";
  } | null>(null);
  const normalizedQuery = normalizeSearchText(query);
  const activePatientSearch =
    patientSearch?.query === normalizedQuery ? patientSearch : null;
  const patients = activePatientSearch?.patients ?? [];
  const searchStatus = activePatientSearch?.status ?? "idle";
  const pageMatches = useMemo(() => {
    if (normalizedQuery.length < 2) return [];
    return pages
      .filter((page) =>
        normalizeSearchText(`${page.label} ${page.section}`).includes(
          normalizedQuery,
        ),
      )
      .slice(0, 5);
  }, [normalizedQuery, pages]);
  const showResults = focused && normalizedQuery.length >= 2;

  useEffect(() => {
    function closeOnOutsidePointer(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setFocused(false);
      }
    }

    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () =>
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, []);

  useEffect(() => {
    const requestedQuery = query.trim();
    if (!patientSearchEnabled || normalizedQuery.length < 3) {
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setPatientSearch({
        query: normalizedQuery,
        patients: [],
        status: "loading",
      });
      try {
        const response = await fetch(
          `/api/patients/search?q=${encodeURIComponent(requestedQuery)}`,
          { cache: "no-store", signal: controller.signal },
        );
        if (!response.ok) throw new Error("search_failed");
        const payload = (await response.json()) as {
          patients?: PatientSearchResult[];
        };
        setPatientSearch({
          query: normalizedQuery,
          patients: payload.patients ?? [],
          status: "ready",
        });
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        setPatientSearch({
          query: normalizedQuery,
          patients: [],
          status: "error",
        });
      }
    }, 250);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [normalizedQuery, patientSearchEnabled, query]);

  function navigate(href: string) {
    setFocused(false);
    setQuery("");
    router.push(href);
  }

  function submitSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const patient = patients[0];
    const page = pageMatches[0];
    if (patient) {
      navigate(`/pacientes/${patient.id}`);
    } else if (page) {
      navigate(page.href);
    } else if (patientSearchEnabled && query.trim().length >= 2) {
      navigate(`/pacientes?q=${encodeURIComponent(query.trim())}`);
    }
  }

  const noResults =
    searchStatus !== "loading" &&
    pageMatches.length === 0 &&
    patients.length === 0;

  return (
    <div ref={containerRef} className="relative min-w-0 w-full max-w-[36rem]">
      <form onSubmit={submitSearch} role="search">
        <MagnifyingGlass
          className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onFocus={() => setFocused(true)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setFocused(false);
              event.currentTarget.blur();
            }
          }}
          placeholder="Pesquisar pacientes, atendimentos ou páginas…"
          aria-label="Pesquisa global"
          aria-expanded={showResults}
          aria-controls={showResults ? resultsId : undefined}
          className="h-10 w-full rounded-full border border-transparent bg-muted/70 pl-10 pr-4 text-sm text-foreground outline-none transition-[background-color,border-color,box-shadow] placeholder:text-muted-foreground focus:border-primary/20 focus:bg-card focus:shadow-[0_0_0_3px_var(--primary-muted)]"
          role="combobox"
          aria-autocomplete="list"
        />
      </form>

      {showResults ? (
        <div
          id={resultsId}
          role="listbox"
          aria-label="Resultados da pesquisa global"
          className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-50 max-h-[min(28rem,calc(100vh-6rem))] overflow-y-auto rounded-xl border border-border bg-popover p-2 shadow-[var(--shadow-md)]"
        >
          {pageMatches.length ? (
            <SearchSection title="Páginas">
              {pageMatches.map((page) => (
                <SearchResultLink
                  key={`${page.section}-${page.href}`}
                  href={page.href}
                  onClick={() => {
                    setFocused(false);
                    setQuery("");
                  }}
                  icon={<CaretRight className="size-4" aria-hidden="true" />}
                  title={page.label}
                  description={page.section}
                />
              ))}
            </SearchSection>
          ) : null}

          {patientSearchEnabled && normalizedQuery.length >= 3 ? (
            <SearchSection title="Pacientes">
              {searchStatus === "loading" ? (
                <div className="flex items-center gap-2 px-3 py-3 text-sm text-muted-foreground">
                  <SpinnerGap
                    className="size-4 animate-spin"
                    aria-hidden="true"
                  />
                  Buscando pacientes…
                </div>
              ) : patients.length ? (
                patients.map((patient) => (
                  <SearchResultLink
                    key={patient.id}
                    href={`/pacientes/${patient.id}`}
                    onClick={() => {
                      setFocused(false);
                      setQuery("");
                    }}
                    icon={<User className="size-4" aria-hidden="true" />}
                    title={patient.social_name || patient.full_name}
                    description={
                      patient.whatsapp ||
                      patient.phone ||
                      patient.email ||
                      "Cadastro de paciente"
                    }
                  />
                ))
              ) : searchStatus === "error" ? (
                <p className="px-3 py-3 text-sm text-destructive">
                  Não foi possível pesquisar pacientes agora.
                </p>
              ) : null}
            </SearchSection>
          ) : null}

          {noResults ? (
            <p className="px-3 py-4 text-center text-sm text-muted-foreground">
              Nenhum resultado encontrado.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function SearchSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="py-1 first:pt-0 last:pb-0">
      <p className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        {title}
      </p>
      <div className="grid gap-0.5">{children}</div>
    </section>
  );
}

function SearchResultLink({
  href,
  onClick,
  icon,
  title,
  description,
}: {
  href: string;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      prefetch={true}
      role="option"
      aria-selected="false"
      onClick={onClick}
      className="flex min-w-0 items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary-muted text-primary">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium text-foreground">
          {title}
        </span>
        <span className="block truncate text-xs text-muted-foreground">
          {description}
        </span>
      </span>
    </Link>
  );
}

function normalizeSearchText(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase("pt-BR")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}
