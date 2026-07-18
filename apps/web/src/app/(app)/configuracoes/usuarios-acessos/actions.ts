"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { AccessActionState } from "./types";
import { getRequestContext } from "@/lib/auth/context";
import {
  generateCompanyUserSetupLink,
  provisionCompanyUserAccess,
} from "@/lib/auth/company-user-admin";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const accessPath = "/configuracoes/usuarios-acessos";
type AdminClient = ReturnType<typeof createSupabaseAdminClient>;

type ManagementContext = {
  organizationId: string;
  actorUserId: string;
  effectiveUserId: string;
};

async function requireAccessManagement(): Promise<
  { ok: true; value: ManagementContext } | { ok: false; error: string }
> {
  const context = await getRequestContext();
  if (
    context.isSuperAdmin ||
    !context.organization ||
    !context.actor ||
    !context.effectiveUser ||
    !context.permissionCodes.has("config.usuarios")
  ) {
    return {
      ok: false,
      error: "Você não possui permissão para gerenciar acessos.",
    };
  }

  return {
    ok: true,
    value: {
      organizationId: context.organization.id,
      actorUserId: context.actor.id,
      effectiveUserId: context.effectiveUser.id,
    },
  };
}

type ManageableTarget = {
  id: string;
  organization_id: string;
  auth_user_id: string | null;
  name: string;
  email: string;
  phone: string | null;
  status: "invited" | "active" | "suspended";
  is_super_admin: boolean;
};

async function loadTarget(
  admin: AdminClient,
  organizationId: string,
  userId: string,
) {
  const { data, error } = await admin
    .from("app_users")
    .select(
      "id, organization_id, auth_user_id, name, email, phone, status, is_super_admin",
    )
    .eq("id", userId)
    .eq("organization_id", organizationId)
    .eq("is_super_admin", false)
    .maybeSingle<ManageableTarget>();

  if (error || !data) return null;
  return data;
}

function accessRpcError(error: { message: string }, fallback: string) {
  const message = error.message.toLowerCase();
  if (message.includes("precisa manter ao menos um usuario ativo")) {
    return "A empresa precisa manter ao menos um usuário ativo com permissão para gerenciar acessos.";
  }
  if (message.includes("nao pode suspender o proprio acesso")) {
    return "Você não pode suspender o próprio acesso.";
  }
  if (message.includes("profissional ja esta vinculado")) {
    return "Este profissional já está vinculado a outro usuário.";
  }
  if (message.includes("reative o profissional")) {
    return "Reative o profissional antes de vinculá-lo ao usuário.";
  }
  if (message.includes("vincule um profissional")) {
    return "Vincule um profissional ao usuário antes de usar o escopo próprio.";
  }
  if (message.includes("recursos selecionados")) {
    return "Há recursos selecionados que não pertencem à empresa.";
  }
  if (message.includes("perfil esta em uso")) {
    return "Este perfil está em uso. Atribua outro perfil aos usuários antes de excluí-lo.";
  }
  if (message.includes("perfis padrao sao protegidos")) {
    return "Perfis padrão são modelos protegidos. Duplique este perfil para personalizá-lo.";
  }
  if (message.includes("perfis padrao da empresa")) {
    return "Perfis padrão da empresa não podem ser excluídos.";
  }
  if (
    message.includes("responsavel efetivo") ||
    message.includes("sessao ativa de suporte")
  ) {
    return "Sua sessão não está mais autorizada a gerenciar acessos. Recarregue a página.";
  }
  return fallback;
}

const inviteSchema = z
  .object({
    name: z.string().trim().min(2, "Informe o nome do usuário.").max(160),
    email: z
      .string()
      .trim()
      .email("Informe um e-mail válido.")
      .transform((value) => value.toLowerCase()),
    phone: z.string().trim().max(32).optional(),
    profile_id: z.string().uuid("Selecione um perfil."),
    professional_id: z.string().uuid().optional(),
    initial_agenda_scope: z.enum(["none", "all", "own"]),
  })
  .superRefine((input, context) => {
    if (input.professional_id && input.initial_agenda_scope !== "own") {
      context.addIssue({
        code: "custom",
        path: ["initial_agenda_scope"],
        message:
          "O acesso vinculado a um profissional deve iniciar na agenda própria.",
      });
    }
    if (!input.professional_id && input.initial_agenda_scope === "own") {
      context.addIssue({
        code: "custom",
        path: ["initial_agenda_scope"],
        message:
          "Vincule um profissional para usar o escopo de agenda própria.",
      });
    }
  });

export async function inviteCompanyUser(
  _previousState: AccessActionState,
  formData: FormData,
): Promise<AccessActionState> {
  const authorization = await requireAccessManagement();
  if (!authorization.ok) return { error: authorization.error };

  const parsed = inviteSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    phone: formData.get("phone") || undefined,
    profile_id: formData.get("profile_id"),
    professional_id: formData.get("professional_id") || undefined,
    initial_agenda_scope: formData.get("initial_agenda_scope"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  // The helper creates a service-role client only after this action has
  // authenticated, authorized and fixed the tenant from server-side context.
  const created = await provisionCompanyUserAccess({
    organizationId: authorization.value.organizationId,
    actorUserId: authorization.value.effectiveUserId,
    auditActorUserId: authorization.value.actorUserId,
    name: parsed.data.name,
    email: parsed.data.email,
    phone: parsed.data.phone,
    profileId: parsed.data.profile_id,
    professionalId: parsed.data.professional_id,
    initialAgendaScope: parsed.data.initial_agenda_scope,
  });

  if (!created.ok) return { error: created.error };
  revalidatePath(accessPath);
  return { ok: true, link: created.setupLink };
}

export async function createSetupLink(
  userId: string,
  _previousState: AccessActionState,
  _formData: FormData,
): Promise<AccessActionState> {
  void _previousState;
  void _formData;
  const authorization = await requireAccessManagement();
  if (!authorization.ok) return { error: authorization.error };

  const result = await generateCompanyUserSetupLink({
    organizationId: authorization.value.organizationId,
    actorUserId: authorization.value.effectiveUserId,
    auditActorUserId: authorization.value.actorUserId,
    userId,
  });
  if (!result.ok) return { error: result.error };
  revalidatePath(accessPath);
  return { ok: true, link: result.link };
}

const updateIdentitySchema = z.object({
  name: z.string().trim().min(2, "Informe o nome do usuário.").max(160),
  email: z
    .string()
    .trim()
    .email("Informe um e-mail válido.")
    .transform((value) => value.toLowerCase()),
  phone: z.string().trim().max(32).optional(),
  professional_id: z.string().uuid().optional(),
});

export async function updateCompanyUser(
  userId: string,
  _previousState: AccessActionState,
  formData: FormData,
): Promise<AccessActionState> {
  const authorization = await requireAccessManagement();
  if (!authorization.ok) return { error: authorization.error };

  const parsed = updateIdentitySchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    phone: formData.get("phone") || undefined,
    professional_id: formData.get("professional_id") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const admin = createSupabaseAdminClient();
  const context = authorization.value;
  const target = await loadTarget(admin, context.organizationId, userId);
  if (!target) return { error: "Usuário não encontrado nesta empresa." };

  const emailChanged = parsed.data.email !== target.email.toLowerCase();
  if (emailChanged) {
    const { data: collision, error } = await admin
      .from("app_users")
      .select("id")
      .eq("email", parsed.data.email)
      .neq("id", target.id)
      .limit(1)
      .maybeSingle<{ id: string }>();
    if (error) return { error: "Não foi possível validar o e-mail." };
    if (collision)
      return { error: "Este e-mail já está vinculado a outro usuário." };
  }

  const nextProfessionalId = parsed.data.professional_id ?? null;

  if (nextProfessionalId) {
    const { data: professional, error } = await admin
      .from("professionals")
      .select("id, user_id, active")
      .eq("organization_id", context.organizationId)
      .eq("id", nextProfessionalId)
      .maybeSingle<{ id: string; user_id: string | null; active: boolean }>();
    if (error || !professional) {
      return { error: "Profissional não encontrado nesta empresa." };
    }
    if (professional.user_id && professional.user_id !== target.id) {
      return { error: "Este profissional já está vinculado a outro usuário." };
    }
    if (!professional.active) {
      return {
        error: "Reative o profissional antes de vinculá-lo ao usuário.",
      };
    }
  }

  if (target.auth_user_id) {
    const { error } = await admin.auth.admin.updateUserById(
      target.auth_user_id,
      emailChanged
        ? {
            email: parsed.data.email,
            email_confirm: true,
            user_metadata: { name: parsed.data.name },
          }
        : { user_metadata: { name: parsed.data.name } },
    );
    if (error) {
      return {
        error: emailChanged
          ? "Não foi possível atualizar o e-mail de login."
          : "Não foi possível atualizar os dados do login.",
      };
    }
  }

  const { error: mutationError } = await admin.rpc(
    "manage_company_user_identity",
    {
      p_organization_id: context.organizationId,
      p_effective_actor_user_id: context.effectiveUserId,
      p_audit_actor_user_id: context.actorUserId,
      p_target_user_id: target.id,
      p_name: parsed.data.name,
      p_email: parsed.data.email,
      p_phone: parsed.data.phone ?? null,
      p_professional_id: nextProfessionalId,
    },
  );

  if (mutationError) {
    let authRollbackFailed = false;
    if (target.auth_user_id) {
      const { error: rollbackError } = await admin.auth.admin.updateUserById(
        target.auth_user_id,
        {
          ...(emailChanged ? { email: target.email, email_confirm: true } : {}),
          user_metadata: { name: target.name },
        },
      );
      authRollbackFailed = Boolean(rollbackError);
    }

    return {
      error: authRollbackFailed
        ? "A alteração foi recusada, mas o login precisa de revisão manual."
        : accessRpcError(
            mutationError,
            "Não foi possível atualizar o usuário e o vínculo profissional.",
          ),
    };
  }

  revalidatePath(accessPath);
  return { ok: true };
}

const statusSchema = z.object({ status: z.enum(["active", "suspended"]) });

export async function setCompanyUserStatus(
  userId: string,
  _previousState: AccessActionState,
  formData: FormData,
): Promise<AccessActionState> {
  const authorization = await requireAccessManagement();
  if (!authorization.ok) return { error: authorization.error };
  const parsed = statusSchema.safeParse({ status: formData.get("status") });
  if (!parsed.success) return { error: "Status inválido." };

  const context = authorization.value;
  if (
    parsed.data.status === "suspended" &&
    userId === context.effectiveUserId
  ) {
    return { error: "Você não pode suspender o próprio acesso." };
  }

  const admin = createSupabaseAdminClient();
  const { error } = await admin.rpc("manage_company_user_status", {
    p_organization_id: context.organizationId,
    p_effective_actor_user_id: context.effectiveUserId,
    p_audit_actor_user_id: context.actorUserId,
    p_target_user_id: userId,
    p_status: parsed.data.status,
  });
  if (error) {
    return {
      error: accessRpcError(error, "Não foi possível alterar o status."),
    };
  }

  revalidatePath(accessPath);
  return { ok: true };
}

const profileAssignmentSchema = z.object({ profile_id: z.string().uuid() });

export async function setCompanyUserProfile(
  userId: string,
  _previousState: AccessActionState,
  formData: FormData,
): Promise<AccessActionState> {
  const authorization = await requireAccessManagement();
  if (!authorization.ok) return { error: authorization.error };
  const parsed = profileAssignmentSchema.safeParse({
    profile_id: formData.get("profile_id"),
  });
  if (!parsed.success) return { error: "Selecione um perfil válido." };

  const context = authorization.value;
  const admin = createSupabaseAdminClient();
  const { error } = await admin.rpc("manage_company_user_profile", {
    p_organization_id: context.organizationId,
    p_effective_actor_user_id: context.effectiveUserId,
    p_audit_actor_user_id: context.actorUserId,
    p_target_user_id: userId,
    p_profile_id: parsed.data.profile_id,
  });
  if (error) {
    return {
      error: accessRpcError(error, "Não foi possível atribuir o perfil."),
    };
  }

  revalidatePath(accessPath);
  return { ok: true };
}

const overrideStateSchema = z.enum(["inherit", "grant", "deny"]);

export async function setCompanyUserPermissionOverrides(
  userId: string,
  _previousState: AccessActionState,
  formData: FormData,
): Promise<AccessActionState> {
  const authorization = await requireAccessManagement();
  if (!authorization.ok) return { error: authorization.error };
  const context = authorization.value;
  const admin = createSupabaseAdminClient();

  const { data: permissions, error: permissionsError } = await admin
    .from("permissions")
    .select("id, code")
    .order("code")
    .returns<Array<{ id: string; code: string }>>();
  if (permissionsError)
    return { error: "Não foi possível carregar as permissões." };

  const requested = new Map<string, "inherit" | "grant" | "deny">();
  for (const permission of permissions ?? []) {
    const raw = formData.get(`permission_${permission.id}`);
    const parsed = overrideStateSchema.safeParse(raw ?? "inherit");
    if (!parsed.success) return { error: "Valor de permissão inválido." };
    requested.set(permission.id, parsed.data);
  }

  const nextRows = [...requested.entries()]
    .filter(([, value]) => value !== "inherit")
    .map(([permissionId, value]) => ({
      permission_id: permissionId,
      granted: value === "grant",
    }));

  const { error } = await admin.rpc(
    "manage_company_user_permission_overrides",
    {
      p_organization_id: context.organizationId,
      p_effective_actor_user_id: context.effectiveUserId,
      p_audit_actor_user_id: context.actorUserId,
      p_target_user_id: userId,
      p_overrides: nextRows,
    },
  );
  if (error) {
    return {
      error: accessRpcError(error, "Não foi possível salvar as permissões."),
    };
  }

  revalidatePath(accessPath);
  return { ok: true };
}

const resourceTypeSchema = z.enum([
  "agenda",
  "profissional",
  "unidade",
  "especialidade",
]);
const accessLevelSchema = z.enum(["read", "write", "full"]);
const resourceScopeSchema = z.object({
  resource_type: resourceTypeSchema,
  resource_id: z.string().uuid().nullable(),
  access_level: accessLevelSchema,
});
const scopeSchema = z.object({
  mode: z.enum(["own", "all", "custom"]),
  scopes: z.array(resourceScopeSchema).max(250),
});

export async function setCompanyUserScopes(
  userId: string,
  _previousState: AccessActionState,
  formData: FormData,
): Promise<AccessActionState> {
  const authorization = await requireAccessManagement();
  if (!authorization.ok) return { error: authorization.error };

  const scopesJson = formData.get("scopes");
  if (typeof scopesJson !== "string" || scopesJson.length > 100_000) {
    return { error: "Configuração de escopo inválida." };
  }

  let submittedScopes: unknown;
  try {
    submittedScopes = JSON.parse(scopesJson);
  } catch {
    return { error: "Configuração de escopo inválida." };
  }

  const parsed = scopeSchema.safeParse({
    mode: formData.get("mode"),
    scopes: submittedScopes,
  });
  if (!parsed.success) return { error: "Configuração de escopo inválida." };

  const context = authorization.value;
  const admin = createSupabaseAdminClient();
  const target = await loadTarget(admin, context.organizationId, userId);
  if (!target) return { error: "Usuário não encontrado nesta empresa." };

  const { data: linkedProfessional, error: linkedError } = await admin
    .from("professionals")
    .select("id, active")
    .eq("organization_id", context.organizationId)
    .eq("user_id", target.id)
    .maybeSingle<{ id: string; active: boolean }>();
  if (linkedError)
    return { error: "Não foi possível validar o profissional vinculado." };
  if (parsed.data.mode === "own" && !linkedProfessional) {
    return {
      error:
        "Vincule um profissional ao usuário antes de usar o escopo próprio.",
    };
  }

  const customScopes = parsed.data.mode === "custom" ? parsed.data.scopes : [];
  const seenScopes = new Set<string>();
  for (const scope of customScopes) {
    const key = `${scope.resource_type}:${scope.resource_id ?? "*"}`;
    if (seenScopes.has(key)) {
      return { error: "Remova os escopos duplicados antes de salvar." };
    }
    seenScopes.add(key);
  }

  const idsByType = new Map<z.infer<typeof resourceTypeSchema>, string[]>();
  for (const scope of customScopes) {
    if (!scope.resource_id) continue;
    idsByType.set(scope.resource_type, [
      ...(idsByType.get(scope.resource_type) ?? []),
      scope.resource_id,
    ]);
  }

  const resourceTableByType = {
    agenda: "schedules",
    profissional: "professionals",
    unidade: "units",
    especialidade: "specialties",
  } as const;
  const resourceChecks = await Promise.all(
    [...idsByType.entries()].map(async ([resourceType, ids]) => {
      const uniqueIds = [...new Set(ids)];
      const { data, error } = await admin
        .from(resourceTableByType[resourceType])
        .select("id")
        .eq("organization_id", context.organizationId)
        .in("id", uniqueIds)
        .returns<Array<{ id: string }>>();
      return !error && (data?.length ?? 0) === uniqueIds.length;
    }),
  );
  if (resourceChecks.some((isValid) => !isValid)) {
    return { error: "Há recursos selecionados que não pertencem à empresa." };
  }

  const { error } = await admin.rpc("manage_company_user_resource_scopes", {
    p_organization_id: context.organizationId,
    p_effective_actor_user_id: context.effectiveUserId,
    p_audit_actor_user_id: context.actorUserId,
    p_target_user_id: target.id,
    p_mode: parsed.data.mode,
    p_scopes: customScopes,
  });
  if (error) {
    return {
      error: accessRpcError(error, "Não foi possível salvar o escopo."),
    };
  }

  revalidatePath(accessPath);
  return { ok: true };
}

const profileSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome do perfil.").max(100),
  description: z.string().trim().max(400).optional(),
  permission_ids: z.array(z.string().uuid()).max(250),
});

export async function createCompanyProfile(
  _previousState: AccessActionState,
  formData: FormData,
): Promise<AccessActionState> {
  const authorization = await requireAccessManagement();
  if (!authorization.ok) return { error: authorization.error };
  const parsed = profileSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description") || undefined,
    permission_ids: formData.getAll("permission_ids"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const context = authorization.value;
  const admin = createSupabaseAdminClient();
  const { error } = await admin.rpc("manage_company_profile_create", {
    p_organization_id: context.organizationId,
    p_effective_actor_user_id: context.effectiveUserId,
    p_audit_actor_user_id: context.actorUserId,
    p_name: parsed.data.name,
    p_description: parsed.data.description ?? null,
    p_permission_ids: [...new Set(parsed.data.permission_ids)],
    p_source_profile_id: null,
  });
  if (error) {
    return {
      error: accessRpcError(
        error,
        "Não foi possível criar o perfil. Verifique se o nome já existe.",
      ),
    };
  }

  revalidatePath(accessPath);
  return { ok: true };
}

const duplicateProfileSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome da cópia.").max(100),
});

export async function duplicateCompanyProfile(
  sourceProfileId: string,
  _previousState: AccessActionState,
  formData: FormData,
): Promise<AccessActionState> {
  const authorization = await requireAccessManagement();
  if (!authorization.ok) return { error: authorization.error };
  const parsed = duplicateProfileSchema.safeParse({
    name: formData.get("name"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const context = authorization.value;
  const admin = createSupabaseAdminClient();
  const { error } = await admin.rpc("manage_company_profile_create", {
    p_organization_id: context.organizationId,
    p_effective_actor_user_id: context.effectiveUserId,
    p_audit_actor_user_id: context.actorUserId,
    p_name: parsed.data.name,
    p_description: null,
    p_permission_ids: [],
    p_source_profile_id: sourceProfileId,
  });
  if (error) {
    return {
      error: accessRpcError(error, "Não foi possível criar a cópia do perfil."),
    };
  }

  revalidatePath(accessPath);
  return { ok: true };
}

export async function updateCompanyProfile(
  profileId: string,
  _previousState: AccessActionState,
  formData: FormData,
): Promise<AccessActionState> {
  const authorization = await requireAccessManagement();
  if (!authorization.ok) return { error: authorization.error };
  const parsed = profileSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description") || undefined,
    permission_ids: formData.getAll("permission_ids"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const context = authorization.value;
  const admin = createSupabaseAdminClient();
  const { error } = await admin.rpc("manage_company_profile_update", {
    p_organization_id: context.organizationId,
    p_effective_actor_user_id: context.effectiveUserId,
    p_audit_actor_user_id: context.actorUserId,
    p_profile_id: profileId,
    p_name: parsed.data.name,
    p_description: parsed.data.description ?? null,
    p_permission_ids: [...new Set(parsed.data.permission_ids)],
  });
  if (error) {
    return {
      error: accessRpcError(
        error,
        "Não foi possível atualizar o perfil. O nome pode já existir.",
      ),
    };
  }

  revalidatePath(accessPath);
  return { ok: true };
}

export async function deleteCompanyProfile(
  profileId: string,
  _previousState: AccessActionState,
  _formData: FormData,
): Promise<AccessActionState> {
  void _previousState;
  void _formData;
  const authorization = await requireAccessManagement();
  if (!authorization.ok) return { error: authorization.error };
  const context = authorization.value;
  const admin = createSupabaseAdminClient();
  const { error } = await admin.rpc("manage_company_profile_delete", {
    p_organization_id: context.organizationId,
    p_effective_actor_user_id: context.effectiveUserId,
    p_audit_actor_user_id: context.actorUserId,
    p_profile_id: profileId,
  });
  if (error) {
    return {
      error: accessRpcError(error, "Não foi possível excluir o perfil."),
    };
  }

  revalidatePath(accessPath);
  return { ok: true };
}
