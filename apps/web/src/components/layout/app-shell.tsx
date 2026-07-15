"use client";

import Link from "next/link";
import {
  Activity,
  BarChart3,
  Building2,
  CalendarDays,
  ChevronDown,
  History,
  LayoutDashboard,
  LogOut,
  Menu,
  MessagesSquare,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  ShieldAlert,
  Stethoscope,
  type LucideIcon,
  UserCog,
  UserRound,
  UsersRound,
  WalletCards,
  Waypoints,
} from "lucide-react";
import { useId, useState, useSyncExternalStore } from "react";
import { signOut } from "@/app/(auth)/login/actions";
import { endImpersonation } from "@/app/(app)/suporte/actions";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { TodayAppointmentsRail } from "@/components/layout/today-appointments-rail";
import { cn, initialsFromName } from "@/lib/utils";
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
  impersonation: {
    organizationName: string;
    targetUserName: string;
  } | null;
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
  impersonation,
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
  const hasTodayRail = todayRailEnabled;

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
    <div className="min-h-screen min-w-0 w-full bg-background text-foreground">
      {sidebarPinned ? (
        <Sidebar
          navItems={navItems}
          brandName={brandName}
          brandLogoUrl={brandLogoUrl}
          subtitle={sidebarSubtitle}
          userName={userName}
          userSubtitle={userSubtitle}
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
        userName={userName}
        userSubtitle={userSubtitle}
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
          "min-w-0 w-full",
          impersonation
            ? "[--app-sticky-offset:6.5rem]"
            : "[--app-sticky-offset:3.5rem]",
          sidebarPinned
            ? impersonation
              ? "lg:[--app-sticky-offset:3rem]"
              : "lg:[--app-sticky-offset:0rem]"
            : impersonation
              ? "lg:[--app-sticky-offset:6.5rem]"
              : "lg:[--app-sticky-offset:3.5rem]",
          sidebarPinned ? "lg:pl-64" : "lg:pl-0",
          hasTodayRail && todayRailPinned ? "xl:pr-[21rem]" : "",
        )}
      >
        {impersonation ? (
          <div className="sticky top-0 z-30 flex min-h-12 flex-wrap items-center justify-between gap-3 border-b border-blue-200 bg-blue-50 px-4 py-2 text-blue-900 md:px-6">
            <div className="flex min-w-0 items-center gap-2">
              <ShieldAlert className="size-4 shrink-0" aria-hidden="true" />
              <p className="truncate text-sm font-medium">
                Suporte ativo em {impersonation.organizationName} como{" "}
                {impersonation.targetUserName}
              </p>
            </div>
            <form action={endImpersonation}>
              <Button
                type="submit"
                variant="secondary"
                size="sm"
                className="border-blue-300 bg-transparent text-blue-700 shadow-none hover:border-blue-400 hover:bg-blue-100"
              >
                Encerrar suporte
              </Button>
            </form>
          </div>
        ) : null}

        <header
          className={cn(
            "sticky z-20 flex h-14 items-center gap-3 border-b border-border bg-card/95 px-4 backdrop-blur md:px-6",
            impersonation ? "top-12" : "top-0",
            sidebarPinned ? "lg:hidden" : "",
          )}
        >
          <Tooltip content="Abrir menu" side="bottom">
            <Button
              variant="secondary"
              size="icon"
              type="button"
              aria-label="Abrir menu"
              onClick={() => setDrawerOpen(true)}
            >
              <Menu className="size-4" aria-hidden="true" />
            </Button>
          </Tooltip>
        </header>

        <main
          className={cn(
            "mx-auto min-h-[calc(100svh-3.5rem)] min-w-0 w-full",
            pathname.startsWith("/atendimento")
              ? "p-0"
              : "px-4 py-6 md:px-6",
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
        />
      ) : null}
    </div>
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
  userName,
  userSubtitle,
  pinned,
  onNavigate,
  onTogglePinned,
  className,
}: {
  navItems: AppShellNavItem[];
  brandName: string;
  brandLogoUrl: string | null;
  subtitle: string;
  userName: string;
  userSubtitle: string;
  pinned: boolean;
  onNavigate?: () => void;
  onTogglePinned: () => void;
  className?: string;
}) {
  return (
    <aside
      className={cn(
        "fixed inset-y-0 left-0 w-64 flex-col border-r border-sidebar-border bg-sidebar shadow-[var(--shadow-md)]",
        className,
      )}
    >
      <div className="flex h-[4.5rem] items-center justify-between gap-3 border-b border-sidebar-border px-5">
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

      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 py-4">
        {navItems.map((item) => (
          <SidebarLink key={item.href} item={item} onNavigate={onNavigate} />
        ))}
      </nav>

      <SidebarAccount
        userName={userName}
        userSubtitle={userSubtitle}
        onNavigate={onNavigate}
      />
    </aside>
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
    isNavRouteActive(pathname, child.href),
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
            "relative flex w-full items-center gap-3 rounded-md px-3 py-3 text-left text-sm font-medium transition-colors duration-[var(--motion-fast)] ease-[var(--ease-out)]",
            routeInGroup
              ? "bg-sidebar-active text-sidebar-active-foreground before:absolute before:inset-y-2 before:left-0 before:w-0.5 before:rounded-full before:bg-primary"
              : "text-sidebar-muted-foreground hover:bg-sidebar-hover hover:text-sidebar-foreground",
          )}
        >
          <Icon className="size-4 shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate">{item.label}</span>
          <ChevronDown
            className={cn(
              "size-4 shrink-0 transition-transform duration-[var(--motion-fast)] ease-[var(--ease-out)]",
              expanded ? "rotate-180" : "",
            )}
            aria-hidden="true"
          />
        </button>

        {expanded ? (
          <div
            id={childrenId}
            className="ml-5 grid gap-0.5 border-l border-sidebar-border pl-3"
          >
            {item.children?.map((child) => {
              const childIsActive = isNavRouteActive(pathname, child.href);

              return (
                <Link
                  key={child.href}
                  href={child.href}
                  aria-current={childIsActive ? "page" : undefined}
                  onClick={onNavigate}
                  className={cn(
                    "relative flex min-h-9 items-center rounded-md px-3 py-2 text-sm font-medium transition-colors duration-[var(--motion-fast)] ease-[var(--ease-out)]",
                    childIsActive
                      ? "bg-sidebar-active text-sidebar-active-foreground"
                      : "text-sidebar-muted-foreground hover:bg-sidebar-hover hover:text-sidebar-foreground",
                  )}
                >
                  {child.label}
                </Link>
              );
            })}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      onClick={onNavigate}
      className={cn(
        "relative flex items-center gap-3 rounded-md px-3 py-3 text-sm font-medium transition-colors duration-[var(--motion-fast)] ease-[var(--ease-out)]",
        active
          ? "bg-sidebar-active text-sidebar-active-foreground before:absolute before:inset-y-2 before:left-0 before:w-0.5 before:rounded-full before:bg-primary"
          : "text-sidebar-muted-foreground hover:bg-sidebar-hover hover:text-sidebar-foreground",
      )}
    >
      <Icon className="size-4" aria-hidden="true" />
      {item.label}
    </Link>
  );
}

function isNavRouteActive(pathname: string, href: string) {
  return (
    pathname === href ||
    (href !== "/dashboard" && pathname.startsWith(`${href}/`))
  );
}

function SidebarAccount({
  userName,
  userSubtitle,
  onNavigate,
}: {
  userName: string;
  userSubtitle: string;
  onNavigate?: () => void;
}) {
  return (
    <div className="border-t border-sidebar-border p-3">
      <div className="flex min-w-0 items-center gap-3 px-2 py-2">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-sidebar-active text-xs font-semibold text-sidebar-active-foreground">
          {initialsFromName(userName)}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-sidebar-foreground">
            {userName}
          </p>
          <p className="truncate text-xs text-sidebar-muted-foreground">
            {userSubtitle}
          </p>
        </div>
      </div>

      <div className="mt-1 grid gap-0.5">
        <Link
          href="/perfil"
          onClick={onNavigate}
          className="flex h-9 items-center gap-2 rounded-md px-2 text-sm font-medium text-sidebar-muted-foreground transition-colors duration-[var(--motion-fast)] ease-[var(--ease-out)] hover:bg-sidebar-hover hover:text-sidebar-foreground"
        >
          <UserRound className="size-4" aria-hidden="true" />
          Meu perfil
        </Link>

        <form action={signOut}>
          <button
            className="flex h-9 w-full items-center gap-2 rounded-md px-2 text-sm font-medium text-sidebar-muted-foreground transition-colors duration-[var(--motion-fast)] ease-[var(--ease-out)] hover:bg-sidebar-hover hover:text-sidebar-foreground"
            type="submit"
          >
            <LogOut className="size-4" aria-hidden="true" />
            Sair
          </button>
        </form>
      </div>
    </div>
  );
}
