"use client";

import Link from "next/link";
import {
  Activity,
  BarChart3,
  Building2,
  CalendarDays,
  History,
  LayoutDashboard,
  LogOut,
  Menu,
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
import { useState, useSyncExternalStore } from "react";
import { signOut } from "@/app/(auth)/login/actions";
import { endImpersonation } from "@/app/(app)/suporte/actions";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { TodayAppointmentsRail } from "@/components/layout/today-appointments-rail";
import type { TodayAppointmentItem } from "@/lib/clinic/today-appointments";
import { cn, initialsFromName } from "@/lib/utils";
import { usePathname } from "next/navigation";

export type AppShellNavItem = {
  href: string;
  label: string;
  icon: AppShellIconName;
};

export type AppShellIconName =
  | "agenda"
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
  todayAppointments?: TodayAppointmentItem[] | null;
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
  todayAppointments,
  children,
}: AppShellProps) {
  const sidebarPinned = useSyncExternalStore(
    subscribeToSidebarPinned,
    getSidebarPinnedSnapshot,
    () => true,
  );
  const todayRailPinned = useSyncExternalStore(
    subscribeToTodayRailPinned,
    getTodayRailPinnedSnapshot,
    () => false,
  );
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [todayRailOpen, setTodayRailOpen] = useState(false);
  const hasTodayRail = Boolean(todayAppointments);

  function updatePinned(nextPinned: boolean) {
    window.localStorage.setItem(storageKey, String(nextPinned));
    window.dispatchEvent(new Event(storageEventKey));

    if (nextPinned) {
      setDrawerOpen(false);
    }
  }

  function updateTodayRailPinned(nextPinned: boolean) {
    window.localStorage.setItem(todayRailStorageKey, String(nextPinned));
    window.dispatchEvent(new Event(todayRailStorageEventKey));

    if (nextPinned) {
      setTodayRailOpen(true);
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
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
          "transition-[padding] duration-[var(--motion-normal)] ease-[var(--ease-out)]",
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

        <main className="mx-auto w-full max-w-7xl px-4 py-6 md:px-6">
          {children}
        </main>
      </div>

      {hasTodayRail ? (
        <TodayAppointmentsRail
          appointments={todayAppointments ?? []}
          open={todayRailOpen || todayRailPinned}
          pinned={todayRailPinned}
          onOpenChange={setTodayRailOpen}
          onPinnedChange={updateTodayRailPinned}
        />
      ) : null}
    </div>
  );
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

      <nav className="flex flex-1 flex-col gap-1 px-3 py-4">
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
  const active =
    pathname === item.href ||
    (item.href !== "/dashboard" && pathname.startsWith(`${item.href}/`));

  return (
    <Link
      href={item.href}
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
