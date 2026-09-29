import { AppShell, type AppShellNavItem } from "@/components/layout/app-shell";
import { cookies } from "next/headers";
import { getRequestContext, hasAnyPermission } from "@/lib/auth/context";
import { resolveUserRoleLabel } from "@/lib/auth/role-label";
import { requireAuthenticatedUser } from "@/lib/auth/session";
import { getPlatformSettings } from "@/lib/platform/settings";
import { loadUserAvatarUrls } from "@/lib/storage/user-avatars";

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
  const avatarUrls = await loadUserAvatarUrls(
    context.effectiveUser ? [context.effectiveUser.id] : [],
  );
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
  const userRole = context.isSuperAdmin
    ? "Super administrador"
    : resolveUserRoleLabel(context.permissionCodes);
  const patientSearchEnabled = Boolean(
    context.organization &&
    hasAnyPermission(context.permissionCodes, [
      "paciente.ver",
      "clinico.ver_prontuario",
      "clinico.ver_prontuario_proprios",
    ]),
  );

  const todayRailEnabled = Boolean(
    !context.isSuperAdmin &&
    context.organization &&
    context.permissionCodes.has("agenda.ver"),
  );

  return (
    <AppShell
      navItems={navItems}
      brandName={platformSettings.app_name}
      brandLogoUrl={platformSettings.logo_url}
      brandFullLogoUrl={platformSettings.logo_full_url}
      sidebarSubtitle={sidebarSubtitle}
      userName={userName}
      userSubtitle={userSubtitle}
      userRole={userRole}
      userAvatarUrl={
        context.effectiveUser
          ? (avatarUrls.get(context.effectiveUser.id) ?? null)
          : null
      }
      patientSearchEnabled={patientSearchEnabled}
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
      label: "Conversas",
      icon: "atendimento",
    });
  }

  if (hasAnyPermission(permissionCodes, ["agenda.ver"])) {
    navItems.push({
      href: "/agenda",
      label: "Agenda",
      icon: "agenda",
    });
  }

  if (
    hasAnyPermission(permissionCodes, [
      "clinico.ver_prontuario",
      "clinico.ver_prontuario_proprios",
    ])
  ) {
    navItems.push({
      href: "/prontuario",
      label: "Prontuário",
      icon: "prontuario",
    });
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
      "financeiro.gerenciar_contas_pagar",
    ])
  ) {
    const financeChildren: NonNullable<AppShellNavItem["children"]> = [];
    if (
      permissionCodes.has("financeiro.ver_geral") ||
      permissionCodes.has("financeiro.receber_pagamento") ||
      permissionCodes.has("financeiro.gerenciar_contas_pagar")
    ) {
      financeChildren.push({
        href: "/financeiro",
        label: "Visão geral",
        icon: "dashboard",
      });
    }
    if (
      permissionCodes.has("financeiro.ver_geral") ||
      permissionCodes.has("financeiro.receber_pagamento")
    ) {
      financeChildren.push(
        {
          href: "/financeiro/contas-a-receber",
          label: "Contas a receber",
          icon: "receber",
        },
        {
          href: "/financeiro/movimentacoes",
          label: "Movimentações",
          icon: "movimentacoes",
        },
      );
    }
    if (
      permissionCodes.has("financeiro.ver_geral") ||
      permissionCodes.has("financeiro.gerenciar_contas_pagar")
    ) {
      financeChildren.push({
        href: "/financeiro/contas-a-pagar",
        label: "Contas a pagar",
        icon: "pagar",
      });
    }
    if (
      permissionCodes.has("financeiro.ver_geral") ||
      permissionCodes.has("financeiro.ver_proprio_repasse") ||
      permissionCodes.has("financeiro.gerenciar_contas_pagar")
    ) {
      financeChildren.push({
        href: "/financeiro/repasses",
        label: "Repasses",
        icon: "repasses",
      });
    }
    if (permissionCodes.has("financeiro.ver_geral")) {
      financeChildren.push({
        href: "/financeiro/dre",
        label: "Resultado",
        icon: "dre",
      });
    }
    navItems.push({
      href: "/financeiro",
      label: "Financeiro",
      icon: "financeiro",
      children: financeChildren,
    });
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
      {
        href: "/relatorios/visao-geral",
        label: "Visão geral",
        icon: "dashboard",
      },
    ];

    if (canViewOperationalReports) {
      reportChildren.push({
        href: "/relatorios/atendimentos",
        label: "Atendimentos",
        icon: "atendimento",
      });
    }

    if (canViewFinancialReports) {
      reportChildren.push({
        href: "/relatorios/financeiro",
        label: "Financeiro",
        icon: "financeiro",
      });
    }

    // Comissão por profissional exige também o financeiro completo, a mesma
    // regra do cálculo no banco (commission_report).
    if (
      canViewFinancialReports &&
      permissionCodes.has("financeiro.ver_geral")
    ) {
      reportChildren.push({
        href: "/relatorios/comissoes",
        label: "Comissões",
        icon: "repasses",
      });
    }

    if (canViewClinicalReports) {
      reportChildren.push({
        href: "/relatorios/clinico",
        label: "Clínico",
        icon: "prontuario",
      });
    }

    reportChildren.push({
      href: "/relatorios/profissionais",
      label: "Por profissional",
      icon: "usuarios",
    });

    navItems.push({
      href: "/relatorios",
      label: "Relatórios",
      icon: "relatorios",
      children: reportChildren,
    });
  }

  const canManageCompany = permissionCodes.has("config.geral");
  const canManageUsers = permissionCodes.has("config.usuarios");
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
      icon: "cadastros",
    });
  }

  if (canManageUsers) {
    configurationChildren.push({
      href: "/configuracoes/usuarios-acessos",
      label: "Usuários e acessos",
      icon: "usuarios",
    });
  }

  if (canConfigureAgenda || canBlockAgenda) {
    configurationChildren.push({
      href: "/configuracoes/agenda",
      label: "Agenda",
      icon: "agenda",
    });
  }

  if (canManageCompany || canConfigureAgenda) {
    configurationChildren.push({
      href: "/configuracoes/agendamento-online",
      label: "Agendamento online",
      icon: "agendamento-online",
    });
  }

  if (canManageCompany) {
    configurationChildren.push({
      href: "/configuracoes/tags-automacoes",
      label: "Automações",
      icon: "tags",
    });
  }

  if (canCreateClinicalTemplate) {
    configurationChildren.push({
      href: "/configuracoes/modelos-clinicos",
      label: "Modelos clínicos",
      icon: "modelos-clinicos",
    });
  }

  if (permissionCodes.has("atendimento.configurar")) {
    configurationChildren.push({
      href: "/configuracoes/whatsapp",
      label: "WhatsApp",
      icon: "atendimento",
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
