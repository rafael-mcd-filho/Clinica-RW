"use client";

import Link, { useLinkStatus } from "next/link";
import {
  Pulse as Activity,
  ChartBar as BarChart3,
  Buildings as Building2,
  CalendarBlank as CalendarDays,
  CaretDown as ChevronDown,
  ClockCounterClockwise as History,
  CurrencyCircleDollar as WalletCards,
  SquaresFour as LayoutDashboard,
  ListBullets as MessagesSquare,
  SidebarSimple as PanelLeftClose,
  Sidebar as PanelLeftOpen,
  Gear as Settings,
  ShieldWarning as ShieldAlert,
  Stethoscope,
  type Icon as LucideIcon,
  UserGear as UserCog,
  Users as UsersRound,
  FlowArrow as Waypoints,
} from "@phosphor-icons/react";
import { useId, useState, useSyncExternalStore } from "react";
import { endImpersonation } from "@/app/(app)/suporte/actions";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { NavigationProgress } from "@/components/layout/navigation-progress";
import { TodayAppointmentsRail } from "@/components/layout/today-appointments-rail";
import {
  GlobalHeader,
  type GlobalSearchPage,
} from "@/components/layout/global-header";
import { cn } from "@/lib/utils";
import { usePathname } from "next/navigation";

export type AppShellNavItem = {
  href: string;
  label: string;
  icon: AppShellIconName;
  children?: AppShellNavChild[];
};

export type AppShellNavChild = {
  href: string;
  label: string;
};

export type AppShellIconName =
  | "agenda"
  | "atendimento"
  | "dashboard"
  | "empresas"
  | "usuarios"
  | "financeiro"
  | "funis"
  | "relatorios"
  | "auditoria"
  | "configuracoes"
  | "pacientes"
  | "prontuario";

const iconMap: Record<AppShellIconName, LucideIcon> = {
  agenda: CalendarDays,
  atendimento: MessagesSquare,
  dashboard: LayoutDashboard,
  empresas: Building2,
  usuarios: UserCog,
  financeiro: WalletCards,
  funis: Waypoints,
  relatorios: BarChart3,
  auditoria: History,
  configuracoes: Settings,
  pacientes: UsersRound,
  prontuario: Stethoscope,
};

type AppShellProps = {
  navItems: AppShellNavItem[];
  brandName: string;
  brandLogoUrl: string | null;
  sidebarSubtitle: string;
  userName: string;
  userSubtitle: string;
  userRole: string;
  impersonation: {
    organizationName: string;
    targetUserName: string;
  } | null;
  patientSearchEnabled?: boolean;
  todayRailEnabled?: boolean;
  initialSidebarPinned?: boolean;
  initialTodayRailPinned?: boolean;
  children: React.ReactNode;
};

const storageKey = "hi-clinic-sidebar-pinned";
const storageEventKey = "hi-clinic-sidebar-pinned-changed";
const todayRailStorageKey = "hi-clinic-today-rail-pinned";
const todayRailStorageEventKey = "hi-clinic-today-rail-pinned-changed";

function getSidebarPinnedSnapshot() {
  if (typeof window === "undefined") {
    return true;
  }

  return window.localStorage.getItem(storageKey) !== "false";
}

function subscribeToSidebarPinned(callback: () => void) {
  if (typeof window === "undefined") {
    return () => {};
  }

  window.addEventListener("storage", callback);
  window.addEventListener(storageEventKey, callback);

  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(storageEventKey, callback);
  };
}

function getTodayRailPinnedSnapshot() {
  if (typeof window === "undefined") {
    return false;
  }

  return window.localStorage.getItem(todayRailStorageKey) === "true";
}

function subscribeToTodayRailPinned(callback: () => void) {
  if (typeof window === "undefined") {
    return () => {};
  }

  window.addEventListener("storage", callback);
  window.addEventListener(todayRailStorageEventKey, callback);

  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(todayRailStorageEventKey, callback);
  };
}

export function AppShell({
  navItems,
  brandName,
  brandLogoUrl,
  sidebarSubtitle,
  userName,
  userSubtitle,
  userRole,
  impersonation,
  patientSearchEnabled = false,
  todayRailEnabled = false,
  initialSidebarPinned = true,
  initialTodayRailPinned = false,
  children,
}: AppShellProps) {
  const pathname = usePathname();
  const sidebarPinned = useSyncExternalStore(
    subscribeToSidebarPinned,
    getSidebarPinnedSnapshot,
    () => initialSidebarPinned,
  );
  const todayRailPinned = useSyncExternalStore(
    subscribeToTodayRailPinned,
    getTodayRailPinnedSnapshot,
    () => initialTodayRailPinned,
  );
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [todayRailOpen, setTodayRailOpen] = useState(false);
  const [todayAppointmentCount, setTodayAppointmentCount] = useState<
    number | null
  >(null);
  const hasTodayRail = todayRailEnabled;
  const searchPages = navigationSearchPages(navItems);

  function updatePinned(nextPinned: boolean) {
    window.localStorage.setItem(storageKey, String(nextPinned));
    document.cookie = `${storageKey}=${String(nextPinned)}; Path=/; Max-Age=31536000; SameSite=Lax`;
    window.dispatchEvent(new Event(storageEventKey));

    if (nextPinned) {
      setDrawerOpen(false);
    }
  }

  function updateTodayRailPinned(nextPinned: boolean) {
    window.localStorage.setItem(todayRailStorageKey, String(nextPinned));
    document.cookie = `${todayRailStorageKey}=${String(nextPinned)}; Path=/; Max-Age=31536000; SameSite=Lax`;
    window.dispatchEvent(new Event(todayRailStorageEventKey));

    if (nextPinned) {
      setTodayRailOpen(true);
    }
  }

  return (
    <div
      className={cn(
        "min-w-0 w-full bg-background text-foreground",
        pathname.startsWith("/atendimento")
          ? "h-dvh overflow-hidden"
          : "min-h-screen",
      )}
    >
      <NavigationProgress />

      {sidebarPinned ? (
        <Sidebar
          navItems={navItems}
          brandName={brandName}
          brandLogoUrl={brandLogoUrl}
          subtitle={sidebarSubtitle}
          impersonation={impersonation}
          pinned={sidebarPinned}
          onTogglePinned={() => updatePinned(false)}
          className="hidden lg:flex"
        />
      ) : null}

      {drawerOpen ? (
        <button
          aria-label="Fechar menu"
          className="fixed inset-0 z-30 bg-black/20"
          onClick={() => setDrawerOpen(false)}
          type="button"
        />
      ) : null}

      <Sidebar
        navItems={navItems}
        brandName={brandName}
        brandLogoUrl={brandLogoUrl}
        subtitle={sidebarSubtitle}
        impersonation={impersonation}
        pinned={sidebarPinned}
        onNavigate={() => {
          if (!sidebarPinned) {
            setDrawerOpen(false);
          }
        }}
        onTogglePinned={() => updatePinned(!sidebarPinned)}
        className={cn(
          "z-40 transition-transform duration-[var(--motion-drawer)] ease-[var(--ease-out)]",
          drawerOpen ? "translate-x-0" : "-translate-x-full",
          sidebarPinned ? "flex lg:hidden" : "flex",
        )}
      />

      <div
        className={cn(
          "min-w-0 w-full [--app-sticky-offset:4rem] [--today-rail-offset:0rem]",
          pathname.startsWith("/atendimento") ? "h-full overflow-hidden" : "",
          sidebarPinned ? "lg:pl-64" : "lg:pl-0",
          hasTodayRail && todayRailPinned ? "xl:pr-[21rem]" : "",
          hasTodayRail && (todayRailOpen || todayRailPinned)
            ? "[--today-rail-offset:21rem]"
            : "",
        )}
      >
        <GlobalHeader
          pages={searchPages}
          patientSearchEnabled={patientSearchEnabled}
          userName={userName}
          userSubtitle={userRole}
          userOrganization={userSubtitle}
          sidebarPinned={sidebarPinned}
          onOpenMenu={() => setDrawerOpen(true)}
          todayRailEnabled={hasTodayRail}
          todayRailOpen={todayRailOpen || todayRailPinned}
          todayAppointmentCount={todayAppointmentCount}
          onToggleTodayRail={() => {
            if (todayRailOpen || todayRailPinned) {
              if (todayRailPinned) updateTodayRailPinned(false);
              setTodayRailOpen(false);
            } else {
              setTodayRailOpen(true);
            }
          }}
        />

        <main
          className={cn(
            "mx-auto min-w-0 w-full",
            pathname.startsWith("/atendimento")
              ? "h-[calc(100dvh-var(--app-sticky-offset))] min-h-0 overflow-hidden p-0"
              : "min-h-[calc(100svh-var(--app-sticky-offset))] px-4 py-6 md:px-6",
            contentWidthClass(pathname),
          )}
        >
          {children}
        </main>
      </div>

      {hasTodayRail ? (
        <TodayAppointmentsRail
          open={todayRailOpen || todayRailPinned}
          pinned={todayRailPinned}
          onOpenChange={setTodayRailOpen}
          onPinnedChange={updateTodayRailPinned}
          onAppointmentCountChange={setTodayAppointmentCount}
          preload
          showTrigger={false}
        />
      ) : null}
    </div>
  );
}

function navigationSearchPages(
  navItems: AppShellNavItem[],
): GlobalSearchPage[] {
  const pages = navItems.flatMap((item) => [
    {
      href: item.href,
      label: item.label,
      section: "Navegação",
    },
    ...(item.children ?? []).map((child) => ({
      href: child.href,
      label: child.label,
      section: item.label,
    })),
  ]);
  return pages.filter(
    (page, index) =>
      pages.findIndex((candidate) => candidate.href === page.href) === index,
  );
}

function contentWidthClass(pathname: string) {
  if (pathname.startsWith("/atendimento")) {
    return "max-w-none";
  }
  if (pathname.startsWith("/agenda") || /^\/funis\/[^/]+/.test(pathname)) {
    return "max-w-[112rem]";
  }

  if (
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/financeiro") ||
    pathname.startsWith("/relatorios") ||
    /^\/pacientes\/[^/]+/.test(pathname)
  ) {
    return "max-w-[90rem]";
  }

  return "max-w-7xl";
}

function Sidebar({
  navItems,
  brandName,
  brandLogoUrl,
  subtitle,
  impersonation,
  pinned,
  onNavigate,
  onTogglePinned,
  className,
}: {
  navItems: AppShellNavItem[];
  brandName: string;
  brandLogoUrl: string | null;
  subtitle: string;
  impersonation: AppShellProps["impersonation"];
  pinned: boolean;
  onNavigate?: () => void;
  onTogglePinned: () => void;
  className?: string;
}) {
  return (
    <aside
      className={cn(
        "fixed inset-y-0 left-0 w-64 flex-col border-r border-sidebar-border bg-sidebar shadow-[var(--shadow-soft)]",
        className,
      )}
    >
      <div className="flex h-16 items-center justify-between gap-3 border-b border-sidebar-border px-5">
        <div className="flex min-w-0 items-center gap-3">
          <div
            className={cn(
              "flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-md",
              brandLogoUrl
                ? "border border-sidebar-border bg-white"
                : "bg-primary text-primary-foreground",
            )}
          >
            {brandLogoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={brandLogoUrl}
                alt={`Logo ${brandName}`}
                className="size-full object-contain"
              />
            ) : (
              <Activity className="size-5" aria-hidden="true" />
            )}
          </div>
          <div className="min-w-0">
            <p className="truncate text-heading-sm font-semibold text-sidebar-foreground">
              {brandName}
            </p>
            <p className="truncate text-xs text-sidebar-muted-foreground">
              {subtitle}
            </p>
          </div>
        </div>

        <Tooltip
          content={pinned ? "Desfixar menu" : "Fixar menu"}
          side="bottom"
        >
          <Button
            variant="secondary"
            size="icon"
            type="button"
            aria-label={pinned ? "Desfixar menu" : "Fixar menu"}
            onClick={onTogglePinned}
            className="border-sidebar-border bg-transparent text-sidebar-muted-foreground shadow-none hover:border-sidebar-border hover:bg-sidebar-hover hover:text-sidebar-foreground"
          >
            {pinned ? (
              <PanelLeftClose className="size-4" aria-hidden="true" />
            ) : (
              <PanelLeftOpen className="size-4" aria-hidden="true" />
            )}
          </Button>
        </Tooltip>
      </div>

      <nav className="flex flex-1 flex-col gap-1.5 overflow-y-auto px-4 py-5 [scrollbar-gutter:stable]">
        {navItems.map((item) => (
          <SidebarLink key={item.href} item={item} onNavigate={onNavigate} />
        ))}
      </nav>

      <SidebarSupport impersonation={impersonation} />
    </aside>
  );
}

// Indicador de "clique recebido" para links do menu. useLinkStatus fica
// pending assim que o Link é clicado — antes de a navegação completar —,
// então o item reage na hora em vez de esperar o usePathname mudar.
// Espaço reservado (size-4 + ml-auto) para não gerar layout shift.
function NavLinkPending() {
  const { pending } = useLinkStatus();

  return (
    <span
      aria-hidden="true"
      className="ml-auto flex size-4 shrink-0 items-center justify-center"
    >
      {pending ? (
        <span className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent opacity-60" />
      ) : null}
    </span>
  );
}

function SidebarLink({
  item,
  onNavigate,
}: {
  item: AppShellNavItem;
  onNavigate?: () => void;
}) {
  const Icon = iconMap[item.icon];
  const pathname = usePathname();
  const childrenId = useId();
  const hasChildren = Boolean(item.children?.length);
  const active = isNavRouteActive(pathname, item.href);
  const activeChild = item.children?.some((child) =>
    child.href === item.href
      ? pathname === child.href
      : isNavRouteActive(pathname, child.href),
  );
  const routeInGroup = active || Boolean(activeChild);
  const [expansionOverride, setExpansionOverride] = useState<{
    pathname: string;
    expanded: boolean;
  } | null>(null);
  const expanded =
    expansionOverride?.pathname === pathname
      ? expansionOverride.expanded
      : routeInGroup;

  if (hasChildren) {
    return (
      <div className="grid gap-1">
        <button
          type="button"
          aria-controls={childrenId}
          aria-expanded={expanded}
          onClick={() =>
            setExpansionOverride({ pathname, expanded: !expanded })
          }
          className={cn(
            "relative flex min-h-11 w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-[15px] font-medium transition-colors duration-[var(--motion-fast)] ease-[var(--ease-out)]",
            routeInGroup
              ? "font-semibold text-sidebar-foreground"
              : "text-sidebar-muted-foreground hover:bg-sidebar-hover hover:text-sidebar-foreground",
          )}
        >
          <Icon
            className="size-5 shrink-0"
            weight="regular"
            aria-hidden="true"
          />
          <span className="min-w-0 flex-1 truncate">{item.label}</span>
          <ChevronDown
            className={cn(
              "size-4 shrink-0 transition-transform duration-[var(--motion-fast)] ease-[var(--ease-out)]",
              expanded ? "rotate-180" : "",
            )}
            aria-hidden="true"
          />
        </button>

        <div
          id={childrenId}
          aria-hidden={!expanded}
          className={cn(
            "grid transition-[grid-template-rows,opacity] duration-[var(--motion-normal)] ease-[var(--ease-out)]",
            expanded
              ? "grid-rows-[1fr] opacity-100"
              : "grid-rows-[0fr] opacity-0",
          )}
        >
          <div className="min-h-0 overflow-hidden">
            <div
              className={cn(
                "ml-5 grid gap-0.5 border-l border-sidebar-border pl-3 transition-transform duration-[var(--motion-normal)] ease-[var(--ease-out)]",
                expanded ? "translate-y-0" : "-translate-y-1",
              )}
            >
              {item.children?.map((child) => {
                const childIsActive =
                  child.href === item.href
                    ? pathname === child.href
                    : isNavRouteActive(pathname, child.href);

                return (
                  <Link
                    key={child.href}
                    href={child.href}
                    prefetch={true}
                    aria-current={childIsActive ? "page" : undefined}
                    tabIndex={expanded ? undefined : -1}
                    onClick={onNavigate}
                    className={cn(
                      "relative flex min-h-10 items-center rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-[var(--motion-fast)] ease-[var(--ease-out)]",
                      childIsActive
                        ? "bg-sidebar-active font-semibold text-sidebar-active-foreground"
                        : "text-sidebar-muted-foreground hover:bg-sidebar-hover hover:text-sidebar-foreground",
                    )}
                  >
                    {child.label}
                    <NavLinkPending />
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    // prefetch={true} busca a rota completa (dados incluídos) quando o link
    // entra no viewport — como a sidebar é fixa, as telas do menu chegam
    // prontas e o clique navega sem esperar o servidor. Só atua em produção
    // (prefetch é desabilitado no dev) e o frescor é limitado pelo
    // staleTimes.static (60s) no next.config.ts; hover re-prefetcha quando
    // expirado.
    <Link
      href={item.href}
      prefetch={true}
      aria-current={active ? "page" : undefined}
      onClick={onNavigate}
      className={cn(
        "relative flex min-h-11 items-center gap-3 rounded-lg px-3 py-2.5 text-[15px] font-medium transition-colors duration-[var(--motion-fast)] ease-[var(--ease-out)]",
        active
          ? "bg-sidebar-active font-semibold text-sidebar-active-foreground"
          : "text-sidebar-muted-foreground hover:bg-sidebar-hover hover:text-sidebar-foreground",
      )}
    >
      <Icon className="size-5" weight="regular" aria-hidden="true" />
      {item.label}
      <NavLinkPending />
    </Link>
  );
}

function isNavRouteActive(pathname: string, href: string) {
  return (
    pathname === href ||
    (href !== "/dashboard" && pathname.startsWith(`${href}/`))
  );
}

function SidebarSupport({
  impersonation,
}: {
  impersonation: AppShellProps["impersonation"];
}) {
  if (!impersonation) {
    return null;
  }

  return (
    <div className="border-t border-sidebar-border p-3">
      <div className="rounded-lg border border-primary/15 bg-primary-muted/60 p-2 text-sidebar-foreground">
        <div className="flex min-w-0 items-start gap-2">
          <ShieldAlert
            className="mt-0.5 size-3.5 shrink-0 text-primary"
            aria-hidden="true"
          />
          <div className="min-w-0">
            <p className="text-[11px] font-semibold leading-4">Suporte ativo</p>
            <p
              className="truncate text-[10px] leading-4 text-sidebar-muted-foreground"
              title={`${impersonation.organizationName} como ${impersonation.targetUserName}`}
            >
              {impersonation.organizationName} · {impersonation.targetUserName}
            </p>
          </div>
        </div>
        <form action={endImpersonation} className="mt-1">
          <button
            type="submit"
            className="flex h-7 w-full items-center justify-center rounded px-2 text-[11px] font-medium text-primary transition-colors hover:bg-primary-muted-hover"
          >
            Encerrar suporte
          </button>
        </form>
      </div>
    </div>
  );
}
