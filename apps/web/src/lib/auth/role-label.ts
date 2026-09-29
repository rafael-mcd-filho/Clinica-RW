import { hasAnyPermission } from "@/lib/auth/context";

/**
 * Nome curto do papel da pessoa, a partir das permissões efetivas. Aparece no
 * menu da conta e no perfil.
 */
export function resolveUserRoleLabel(permissionCodes: Set<string>) {
  if (hasAnyPermission(permissionCodes, ["config.geral", "config.usuarios"])) {
    return "Administrador";
  }
  if (
    hasAnyPermission(permissionCodes, [
      "clinico.ver_prontuario",
      "clinico.ver_prontuario_proprios",
      "clinico.preencher_prontuario",
    ])
  ) {
    return "Profissional clínico";
  }
  if (
    hasAnyPermission(permissionCodes, [
      "financeiro.ver_geral",
      "financeiro.gerenciar_contas_pagar",
    ])
  ) {
    return "Financeiro";
  }
  if (permissionCodes.has("atendimento.ver")) {
    return "Equipe de conversas";
  }
  if (permissionCodes.has("agenda.ver")) {
    return "Agenda e recepção";
  }
  return "Equipe da clínica";
}
