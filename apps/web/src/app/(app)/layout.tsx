import { AppShell, type AppShellNavItem } from "@/components/layout/app-shell";
import { cookies } from "next/headers";
import { getRequestContext, hasAnyPermission } from "@/lib/auth/context";
import { requireAuthenticatedUser } from "@/lib/auth/session";
import { getPlatformSettings } from "@/lib/platform/settings";

const superAdminNavItems: AppShellNavItem[] = [
  { href: "/dashboard", label: "Painel", icon: "dashboard" },
  { href: "/empresas", label: "Empresas", icon: "empresas" },
  { href: "/usuarios", label: "Usuários", icon: "usuarios" },
  { href: "/financeiro", label: "Financeiro", icon: "financeiro" },
  { href: "/auditoria", label: "Auditoria", icon: "auditoria" },
  {
    href: "/configuracoes/plataforma",
    label: "Configurações",
    icon: "configuracoes",
  },
];

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [authUser, context, platformSettings, cookieStore] = await Promise.all([
    requireAuthenticatedUser(),
    getRequestContext(),
    getPlatformSettings(),
    cookies(),
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

  const todayRailEnabled = Boolean(
    !context.isSuperAdmin &&
    context.organization &&
    context.permissionCodes.has("agenda.ver"),
  );

  return (
    <AppShell
      navItems={navItems}
      brandName={platformSettings.app_name}
      brandLogoUrl={context.organization?.logo_url ?? platformSettings.logo_url}
      sidebarSubtitle={sidebarSubtitle}
      userName={userName}
      userSubtitle={userSubtitle}
      todayRailEnabled={todayRailEnabled}
      initialSidebarPinned={
        cookieStore.get("hi-clinic-sidebar-pinned")?.value !== "false"
      }
      initialTodayRailPinned={
        cookieStore.get("hi-clinic-today-rail-pinned")?.value === "true"
      }
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

  if (hasAnyPermission(permissionCodes, ["atendimento.ver"])) {
    navItems.push({
      href: "/atendimento",
      label: "Atendimento",
      icon: "atendimento",
    });
  }

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

  const canViewOperationalReports = permissionCodes.has(
    "relatorio.operacional",
  );
  const canViewFinancialReports = permissionCodes.has("relatorio.financeiro");
  const canViewClinicalReports = permissionCodes.has("relatorio.clinico");
  const canViewAnyReport =
    canViewOperationalReports ||
    canViewFinancialReports ||
    canViewClinicalReports;

  if (canViewAnyReport) {
    const reportChildren: NonNullable<AppShellNavItem["children"]> = [
      { href: "/relatorios/visao-geral", label: "Visão geral" },
    ];

    if (canViewOperationalReports) {
      reportChildren.push({
        href: "/relatorios/atendimentos",
        label: "Atendimentos",
      });
    }

    if (canViewFinancialReports) {
      reportChildren.push({
        href: "/relatorios/financeiro",
        label: "Financeiro",
      });
    }

    if (canViewClinicalReports) {
      reportChildren.push({
        href: "/relatorios/clinico",
        label: "Clínico",
      });
    }

    reportChildren.push({
      href: "/relatorios/profissionais",
      label: "Por profissional",
    });

    navItems.push({
      href: "/relatorios",
      label: "Relatórios",
      icon: "relatorios",
      children: reportChildren,
    });
  }

  const canManageCompany = permissionCodes.has("config.geral");
  const canConfigureAgenda = permissionCodes.has("agenda.configurar");
  const canBlockAgenda = permissionCodes.has("agenda.bloquear_horario");
  const canCreateClinicalTemplate = permissionCodes.has(
    "clinico.criar_template",
  );
  const configurationChildren: NonNullable<AppShellNavItem["children"]> = [];

  if (canManageCompany) {
    configurationChildren.push({
      href: "/configuracoes/cadastros",
      label: "Cadastros e operação",
    });
  }

  if (canConfigureAgenda || canBlockAgenda) {
    configurationChildren.push({
      href: "/configuracoes/agenda",
      label: "Agenda",
    });
  }

  if (canManageCompany || canConfigureAgenda) {
    configurationChildren.push({
      href: "/configuracoes/agendamento-online",
      label: "Agendamento online",
    });
  }

  if (canManageCompany) {
    configurationChildren.push({
      href: "/configuracoes/tags-automacoes",
      label: "Tags e automações",
    });
  }

  if (canCreateClinicalTemplate) {
    configurationChildren.push({
      href: "/configuracoes/modelos-clinicos",
      label: "Modelos clínicos",
    });
  }

  if (configurationChildren.length > 0) {
    navItems.push({
      href: "/configuracoes",
      label: "Configurações",
      icon: "configuracoes",
      children: configurationChildren,
    });
  }

  return navItems;
}
