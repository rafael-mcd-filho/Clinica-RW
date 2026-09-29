"use client";

import Link, { useLinkStatus } from "next/link";
import {
  Pulse as Activity,
  ArrowCircleDown,
  ArrowCircleUp,
  ArrowsLeftRight,
  ChartBar as BarChart3,
  ChartLineUp,
  Buildings as Building2,
  CalendarBlank as CalendarDays,
  CaretDown as ChevronDown,
  ClockCounterClockwise as History,
  CurrencyCircleDollar as WalletCards,
  FileText,
  GlobeHemisphereWest,
  HandCoins,
  SquaresFour as LayoutDashboard,
  ListDashes,
  ListBullets as MessagesSquare,
  SidebarSimple as PanelLeftClose,
  Sidebar as PanelLeftOpen,
  Gear as Settings,
  ShieldWarning as ShieldAlert,
  Stethoscope,
  Lightning,
  type Icon as LucideIcon,
  UserGear as UserCog,
  Users as UsersRound,
} from "@phosphor-icons/react";
import { useId, useState, useSyncExternalStore } from "react";
import { endImpersonation } from "@/app/(app)/suporte/actions";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { NavigationProgress } from "@/components/layout/navigation-progress";
import { SidebarAccountMenu } from "@/components/layout/sidebar-account-menu";
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
  icon: AppShellIconName;
};

export type AppShellIconName =
  | "agenda"
  | "atendimento"
  | "dashboard"
  | "empresas"
  | "usuarios"
  | "financeiro"
  | "relatorios"
  | "auditoria"
  | "configuracoes"
  | "pacientes"
  | "prontuario"
  | "receber"
  | "pagar"
  | "movimentacoes"
  | "repasses"
  | "dre"
  | "cadastros"
  | "agendamento-online"
  | "tags"
  | "modelos-clinicos";

const iconMap: Record<AppShellIconName, LucideIcon> = {
  agenda: CalendarDays,
  atendimento: MessagesSquare,
  dashboard: LayoutDashboard,
  empresas: Building2,
  usuarios: UserCog,
  financeiro: WalletCards,
  relatorios: BarChart3,
  auditoria: History,
  configuracoes: Settings,
  pacientes: UsersRound,
  prontuario: Stethoscope,
  receber: ArrowCircleDown,
  pagar: ArrowCircleUp,
  movimentacoes: ArrowsLeftRight,
  repasses: HandCoins,
  dre: ChartLineUp,
  cadastros: ListDashes,
  "agendamento-online": GlobeHemisphereWest,
  tags: Lightning,
  "modelos-clinicos": FileText,
};

const iconToneMap: Record<AppShellIconName, string> = {
  dashboard: "indigo",
  atendimento: "teal",
  agenda: "blue",
  pacientes: "rose",
  prontuario: "violet",
  financeiro: "green",
  relatorios: "indigo",
  auditoria: "slate",
  configuracoes: "slate",
  empresas: "blue",
  usuarios: "violet",
  receber: "green",
  pagar: "amber",
  movimentacoes: "blue",
  repasses: "teal",
  dre: "indigo",
  cadastros: "blue",
  "agendamento-online": "teal",
  tags: "rose",
  "modelos-clinicos": "violet",
};

type AppShellProps = {
  navItems: AppShellNavItem[];
  brandName: string;
  brandLogoUrl: string | null;
  brandFullLogoUrl: string | null;
  sidebarSubtitle: string;
  userName: string;
  userSubtitle: string;
  userRole: string;
  userAvatarUrl?: string | null;
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
  brandFullLogoUrl,
  sidebarSubtitle,
  userName,
  userSubtitle,
  userRole,
  userAvatarUrl = null,
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
  const account = {
    userName,
    userRole,
    userOrganization: userSubtitle,
    userAvatarUrl,
  };

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
          brandFullLogoUrl={brandFullLogoUrl}
          subtitle={sidebarSubtitle}
          impersonation={impersonation}
          account={account}
          pinned={sidebarPinned}
          onTogglePinned={() => updatePinned(false)}
          className="hidden lg:flex"
        />
      ) : null}

      {/* Sempre montado, com o mesmo tempo e curva da gaveta: antes ele
          aparecia e sumia de uma vez enquanto o menu deslizava. Fechado,
          fica inerte (sem foco e sem clique). */}
      <button
        aria-label="Fechar menu"
        className={cn(
          "fixed inset-0 z-30 bg-black/20 transition-opacity duration-[var(--motion-drawer)] ease-[var(--ease-out)]",
          drawerOpen ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        inert={!drawerOpen}
        onClick={() => setDrawerOpen(false)}
        type="button"
      />

      <Sidebar
        navItems={navItems}
        brandName={brandName}
        brandLogoUrl={brandLogoUrl}
        brandFullLogoUrl={brandFullLogoUrl}
        subtitle={sidebarSubtitle}
        impersonation={impersonation}
        account={account}
        pinned={sidebarPinned}
        onNavigate={() => {
          if (!sidebarPinned) {
            setDrawerOpen(false);
          }
        }}
        onTogglePinned={() => updatePinned(!sidebarPinned)}
        className={cn(
          "z-40 transition-transform duration-[var(--motion-drawer)] ease-[var(--ease-out)] motion-reduce:transition-none",
          drawerOpen ? "translate-x-0" : "-translate-x-full",
          sidebarPinned ? "flex lg:hidden" : "flex",
        )}
      />

      <div
        className={cn(
          "min-w-0 w-full [--app-sticky-offset:4rem] [--today-rail-offset:0rem]",
          pathname.startsWith("/atendimento") ? "h-full overflow-hidden" : "",
          sidebarPinned ? "lg:pl-72" : "lg:pl-0",
          hasTodayRail && todayRailPinned ? "xl:pr-[21rem]" : "",
          hasTodayRail && (todayRailOpen || todayRailPinned)
            ? "[--today-rail-offset:21rem]"
            : "",
        )}
      >
        <GlobalHeader
          pages={searchPages}
          patientSearchEnabled={patientSearchEnabled}
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
  if (pathname.startsWith("/atendimento") || pathname.startsWith("/agenda")) {
    return "max-w-none";
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
  brandFullLogoUrl,
  subtitle,
  impersonation,
  account,
  pinned,
  onNavigate,
  onTogglePinned,
  className,
}: {
  navItems: AppShellNavItem[];
  brandName: string;
  brandLogoUrl: string | null;
  brandFullLogoUrl: string | null;
  subtitle: string;
  impersonation: AppShellProps["impersonation"];
  account: {
    userName: string;
    userRole: string;
    userOrganization: string;
    userAvatarUrl: string | null;
  };
  pinned: boolean;
  onNavigate?: () => void;
  onTogglePinned: () => void;
  className?: string;
}) {
  return (
    <aside
      className={cn(
        "fixed inset-y-0 left-0 w-72 flex-col border-r border-sidebar-border bg-sidebar shadow-[var(--shadow-soft)]",
        className,
      )}
    >
      <div className="flex h-16 items-center justify-between gap-3 border-b border-sidebar-border px-5">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          {brandFullLogoUrl ? (
            <div className="min-w-0 flex-1">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={brandFullLogoUrl}
                alt={brandName}
                className="h-10 w-full max-w-[170px] object-contain object-left"
              />
            </div>
          ) : (
            <>
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
                    alt=""
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
            </>
          )}
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
            className="shrink-0 border-sidebar-border bg-transparent text-sidebar-muted-foreground shadow-none hover:border-sidebar-border hover:bg-sidebar-hover hover:text-sidebar-foreground"
          >
            {pinned ? (
              <PanelLeftClose className="size-4" aria-hidden="true" />
            ) : (
              <PanelLeftOpen className="size-4" aria-hidden="true" />
            )}
          </Button>
        </Tooltip>
      </div>

      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 py-4 [scrollbar-gutter:stable]">
        {navItems.map((item) => (
          <SidebarLink key={item.href} item={item} onNavigate={onNavigate} />
        ))}
      </nav>

      <SidebarSupport impersonation={impersonation} />
      <SidebarAccountMenu {...account} onNavigate={onNavigate} />
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
  // Abrir ou fechar um grupo à mão vale só até a próxima navegação. Antes a
  // escolha ficava guardada com a rota em que foi feita e voltava a valer ao
  // retornar a ela: abrir Configurações no Prontuário, ir a Modelos clínicos
  // e voltar deixava Configurações aberto sem motivo. Zerar ao mudar de rota
  // durante a renderização é o padrão do React para ajustar estado a props.
  const [expansionOverride, setExpansionOverride] = useState<boolean | null>(
    null,
  );
  const [overridePathname, setOverridePathname] = useState(pathname);
  if (overridePathname !== pathname) {
    setOverridePathname(pathname);
    setExpansionOverride(null);
  }
  const expanded = expansionOverride ?? routeInGroup;

  if (hasChildren) {
    return (
      <div
        className="sidebar-nav-item grid gap-0.5"
        data-nav-tone={iconToneMap[item.icon]}
      >
        <button
          type="button"
          aria-controls={childrenId}
          aria-expanded={expanded}
          onClick={() => setExpansionOverride(!expanded)}
          className={cn(
            "relative flex min-h-10 w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-control font-medium transition-colors duration-[var(--motion-fast)] ease-[var(--ease-out)]",
            routeInGroup
              ? "bg-sidebar-active font-semibold text-sidebar-foreground"
              : "text-sidebar-muted-foreground hover:bg-sidebar-hover hover:text-sidebar-foreground",
          )}
        >
          <span className="sidebar-nav-icon flex size-7 shrink-0 items-center justify-center rounded-md">
            <Icon
              className="size-4"
              weight={routeInGroup ? "fill" : "duotone"}
              aria-hidden="true"
            />
          </span>
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
                "ml-5 grid gap-0.5 border-l border-sidebar-border pl-2 transition-transform duration-[var(--motion-normal)] ease-[var(--ease-out)]",
                expanded ? "translate-y-0" : "-translate-y-1",
              )}
            >
              {item.children?.map((child) => {
                const ChildIcon = iconMap[child.icon];
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
                    data-nav-tone={iconToneMap[child.icon]}
                    className={cn(
                      "sidebar-nav-item relative flex min-h-9 items-center gap-2 rounded-md px-2 py-1.5 text-body-sm font-medium transition-colors duration-[var(--motion-fast)] ease-[var(--ease-out)]",
                      childIsActive
                        ? "bg-sidebar-active font-semibold text-sidebar-active-foreground"
                        : "text-sidebar-muted-foreground hover:bg-sidebar-hover hover:text-sidebar-foreground",
                    )}
                  >
                    <ChildIcon
                      className="sidebar-nav-child-icon size-4 shrink-0"
                      weight={childIsActive ? "fill" : "duotone"}
                      aria-hidden="true"
                    />
                    <span
                      className="min-w-0 flex-1 break-words"
                      title={child.label}
                    >
                      {child.label}
                    </span>
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
      data-nav-tone={iconToneMap[item.icon]}
      className={cn(
        "sidebar-nav-item relative flex min-h-10 items-center gap-2.5 rounded-md px-2 py-1.5 text-body-sm font-medium transition-colors duration-[var(--motion-fast)] ease-[var(--ease-out)]",
        active
          ? "bg-sidebar-active font-semibold text-sidebar-active-foreground"
          : "text-sidebar-muted-foreground hover:bg-sidebar-hover hover:text-sidebar-foreground",
      )}
    >
      <span className="sidebar-nav-icon flex size-7 shrink-0 items-center justify-center rounded-md">
        <Icon
          className="size-4"
          weight={active ? "fill" : "duotone"}
          aria-hidden="true"
        />
      </span>
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
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
            <p className="text-caption font-semibold leading-4">
              Suporte ativo
            </p>
            <p
              className="truncate text-caption leading-4 text-sidebar-muted-foreground"
              title={`${impersonation.organizationName} como ${impersonation.targetUserName}`}
            >
              {impersonation.organizationName} · {impersonation.targetUserName}
            </p>
          </div>
        </div>
        <form action={endImpersonation} className="mt-1">
          <button
            type="submit"
            className="flex h-7 w-full items-center justify-center rounded px-2 text-control font-medium text-primary transition-colors hover:bg-primary-muted-hover"
          >
            Encerrar suporte
          </button>
        </form>
      </div>
    </div>
  );
}
