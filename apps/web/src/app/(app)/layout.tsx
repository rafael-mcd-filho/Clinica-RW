import { AppShell, type AppShellNavItem } from "@/components/layout/app-shell";
import { getRequestContext, hasAnyPermission } from "@/lib/auth/context";
import { requireAuthenticatedUser } from "@/lib/auth/session";
import { getTodayAppointmentsForRail } from "@/lib/clinic/today-appointments";
import { getPlatformSettings } from "@/lib/platform/settings";

const superAdminNavItems: AppShellNavItem[] = [
  { href: "/dashboard", label: "Painel", icon: "dashboard" },
  { href: "/empresas", label: "Empresas", icon: "empresas" },
  { href: "/usuarios", label: "Usuários", icon: "usuarios" },
  { href: "/financeiro", label: "Financeiro", icon: "financeiro" },
  { href: "/auditoria", label: "Auditoria", icon: "auditoria" },
  { href: "/configuracoes", label: "Configurações", icon: "configuracoes" },
];

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const authUser = await requireAuthenticatedUser();
  const [context, platformSettings] = await Promise.all([
    getRequestContext(),
    getPlatformSettings(),
  ]);
  const navItems = context.isSuperAdmin
    ? superAdminNavItems
    : getCompanyNavItems(context.permissionCodes);
  const sidebarSubtitle = context.isSuperAdmin
    ? "Plataforma"
    : (context.organization?.name ?? "Sem empresa");
  const userName = context.effectiveUser?.name ?? authUser.email ?? "Usuário";
  const userSubtitle = context.isSuperAdmin
    ? "Super Admin"
    : (context.organization?.name ?? "Conta sem vínculo interno");

  const todayAppointments =
    !context.isSuperAdmin &&
    context.organization &&
    context.permissionCodes.has("agenda.ver")
      ? await getTodayAppointmentsForRail(context.organization.id)
      : null;

  return (
    <AppShell
      navItems={navItems}
      brandName={platformSettings.app_name}
      brandLogoUrl={context.organization?.logo_url ?? platformSettings.logo_url}
      sidebarSubtitle={sidebarSubtitle}
      userName={userName}
      userSubtitle={userSubtitle}
      todayAppointments={todayAppointments}
      impersonation={
        context.impersonation
          ? {
              organizationName: context.impersonation.organization.name,
              targetUserName: context.impersonation.targetUser.name,
            }
          : null
      }
    >
      {children}
    </AppShell>
  );
}

function getCompanyNavItems(permissionCodes: Set<string>): AppShellNavItem[] {
  const navItems: AppShellNavItem[] = [
    { href: "/dashboard", label: "Painel", icon: "dashboard" },
  ];

  if (hasAnyPermission(permissionCodes, ["agenda.ver"])) {
    navItems.push({ href: "/agenda", label: "Agenda", icon: "agenda" });
  }

  if (
    hasAnyPermission(permissionCodes, [
      "paciente.ver",
      "clinico.ver_prontuario",
      "clinico.ver_prontuario_proprios",
    ])
  ) {
    navItems.push({
      href: "/pacientes",
      label: "Pacientes",
      icon: "pacientes",
    });
  }

  if (
    hasAnyPermission(permissionCodes, [
      "financeiro.ver_geral",
      "financeiro.ver_proprio_repasse",
      "financeiro.receber_pagamento",
    ])
  ) {
    navItems.push({
      href: "/financeiro",
      label: "Financeiro",
      icon: "financeiro",
    });
  }

  if (hasAnyPermission(permissionCodes, ["funil.ver"])) {
    navItems.push({ href: "/funis", label: "Painéis", icon: "funis" });
  }

  if (
    hasAnyPermission(permissionCodes, [
      "relatorio.operacional",
      "relatorio.financeiro",
      "relatorio.clinico",
    ])
  ) {
    navItems.push({
      href: "/relatorios",
      label: "Relatorios",
      icon: "relatorios",
    });
  }

  if (
    hasAnyPermission(permissionCodes, [
      "config.geral",
      "config.usuarios",
      "config.integracoes",
      "config.plano",
    ])
  ) {
    navItems.push({
      href: "/configuracoes",
      label: "Configurações",
      icon: "configuracoes",
    });
  }

  return navItems;
}
