import "server-only";

import { z } from "zod";
import { generatePasswordRecoveryLink } from "@/lib/auth/admin-links";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createSupabaseAdminClient>;

const provisionInputSchema = z
  .object({
    organizationId: z.string().uuid(),
    actorUserId: z.string().uuid(),
    auditActorUserId: z.string().uuid().optional(),
    name: z.string().trim().min(2).max(160),
    email: z
      .string()
      .trim()
      .email()
      .transform((value) => value.toLowerCase()),
    phone: z.string().trim().max(32).optional(),
    profileId: z.string().uuid().optional(),
    professionalId: z.string().uuid().optional(),
    initialAgendaScope: z.enum(["none", "all", "own"]).optional(),
  })
  .superRefine((input, context) => {
    const initialScope =
      input.initialAgendaScope ?? (input.professionalId ? "own" : "none");
    if (input.professionalId && initialScope !== "own") {
      context.addIssue({
        code: "custom",
        path: ["initialAgendaScope"],
        message: "Um profissional vinculado começa com acesso próprio.",
      });
    }
    if (!input.professionalId && initialScope === "own") {
      context.addIssue({
        code: "custom",
        path: ["initialAgendaScope"],
        message: "O escopo próprio exige um profissional vinculado.",
      });
    }
  });

const setupLinkInputSchema = z.object({
  organizationId: z.string().uuid(),
  actorUserId: z.string().uuid(),
  auditActorUserId: z.string().uuid().optional(),
  userId: z.string().uuid(),
});

type ProvisionCompanyUserAccessInput = z.input<typeof provisionInputSchema>;
type GenerateCompanyUserSetupLinkInput = z.input<typeof setupLinkInputSchema>;

export type ProvisionCompanyUserAccessResult =
  | {
      ok: true;
      userId: string;
      authUserId: string;
      setupLink: string;
      created: true;
    }
  | { ok: false; error: string; requiresManualReview?: boolean };

export type CompanyUserSetupLinkResult =
  { ok: true; link: string } | { ok: false; error: string };

type ActorRow = {
  id: string;
  organization_id: string | null;
  status: string;
  is_super_admin: boolean;
};

/**
 * Service-role helper for a caller that has already authenticated and checked
 * `config.usuarios`. Explicit tenant and actor ids are required so every
 * privileged query can repeat ownership checks before changing Auth data.
 */
export async function provisionCompanyUserAccess(
  rawInput: ProvisionCompanyUserAccessInput,
): Promise<ProvisionCompanyUserAccessResult> {
  const parsed = provisionInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, error: "Dados do acesso são inválidos." };
  }

  const input = parsed.data;
  const initialAgendaScope =
    input.initialAgendaScope ?? (input.professionalId ? "own" : "none");
  const supabaseAdmin = createSupabaseAdminClient();
  const actorCheck = await validateActorOrganization(
    supabaseAdmin,
    input.actorUserId,
    input.organizationId,
  );
  if (actorCheck) return { ok: false, error: actorCheck };
  const auditActorCheck = await validateAuditActor(
    supabaseAdmin,
    input.actorUserId,
    input.organizationId,
    input.auditActorUserId,
  );
  if (auditActorCheck) return { ok: false, error: auditActorCheck };

  const { data: collisions, error: collisionError } = await supabaseAdmin
    .from("app_users")
    .select("id, organization_id, is_super_admin")
    .eq("email", input.email)
    .limit(2)
    .returns<
      Array<{
        id: string;
        organization_id: string | null;
        is_super_admin: boolean;
      }>
    >();

  if (collisionError) {
    return { ok: false, error: "Não foi possível validar o e-mail informado." };
  }

  const collision = collisions?.[0];
  if (collision) {
    return {
      ok: false,
      error:
        "Este e-mail já está em uso. Use outro ou solicite suporte para revisar o vínculo.",
    };
  }

  if (input.profileId) {
    const { data: profile, error } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("id", input.profileId)
      .eq("organization_id", input.organizationId)
      .maybeSingle<{ id: string }>();
    if (error || !profile) {
      return {
        ok: false,
        error: "O perfil selecionado não pertence à empresa.",
      };
    }
  }

  if (input.professionalId) {
    const { data: professional, error } = await supabaseAdmin
      .from("professionals")
      .select("id, user_id, active")
      .eq("id", input.professionalId)
      .eq("organization_id", input.organizationId)
      .maybeSingle<{ id: string; user_id: string | null; active: boolean }>();
    if (error || !professional) {
      return {
        ok: false,
        error: "O profissional selecionado não pertence à empresa.",
      };
    }
    if (professional.user_id) {
      return {
        ok: false,
        error: "Este profissional já possui um usuário vinculado.",
      };
    }
    if (!professional.active) {
      return {
        ok: false,
        error: "Reative o profissional antes de conceder acesso ao sistema.",
      };
    }
  }

  const { data: authData, error: authError } =
    await supabaseAdmin.auth.admin.createUser({
      email: input.email,
      password: `${crypto.randomUUID()}-Aa1!`,
      email_confirm: true,
      user_metadata: { name: input.name },
    });

  if (authError || !authData.user) {
    return {
      ok: false,
      error: authError?.message.toLowerCase().includes("already")
        ? "Este e-mail já está em uso. Use outro ou solicite suporte para revisar o vínculo."
        : "Não foi possível criar o acesso de autenticação.",
    };
  }

  const authUserId = authData.user.id;
  let appUserId: string | null = null;

  async function rollback() {
    const failures: string[] = [];

    if (appUserId) {
      if (input.professionalId) {
        const { error } = await supabaseAdmin
          .from("professionals")
          .update({ user_id: null })
          .eq("organization_id", input.organizationId)
          .eq("id", input.professionalId)
          .eq("user_id", appUserId);
        if (error) failures.push("vínculo profissional");
      }
      const { error } = await supabaseAdmin
        .from("app_users")
        .delete()
        .eq("id", appUserId)
        .eq("organization_id", input.organizationId);
      if (error) failures.push("usuário da empresa");
    }
    const { error: authDeleteError } =
      await supabaseAdmin.auth.admin.deleteUser(authUserId);
    if (authDeleteError) failures.push("conta de autenticação");

    return failures;
  }

  async function failAfterRollback(
    error: string,
  ): Promise<ProvisionCompanyUserAccessResult> {
    const rollbackFailures = await rollback();
    if (!rollbackFailures.length) return { ok: false, error };

    return {
      ok: false,
      error: `${error} A limpeza automática não foi concluída (${rollbackFailures.join(
        ", ",
      )}); revise este acesso antes de tentar novamente.`,
      requiresManualReview: true,
    };
  }

  const linkResult = await generatePasswordRecoveryLink(
    supabaseAdmin,
    input.email,
  );
  if (!linkResult.link) {
    return failAfterRollback(
      linkResult.error ?? "Não foi possível gerar o link de acesso.",
    );
  }

  const { data: createdUser, error: createError } = await supabaseAdmin
    .from("app_users")
    .insert({
      organization_id: input.organizationId,
      auth_user_id: authUserId,
      name: input.name,
      email: input.email,
      phone: input.phone || null,
      status: "active",
      is_super_admin: false,
    })
    .select("id")
    .single<{ id: string }>();

  if (createError || !createdUser) {
    return failAfterRollback(
      "Não foi possível cadastrar o usuário na empresa.",
    );
  }
  appUserId = createdUser.id;

  if (input.profileId) {
    const { error } = await supabaseAdmin.from("user_profiles").insert({
      user_id: appUserId,
      profile_id: input.profileId,
    });
    if (error) {
      return failAfterRollback(
        "Não foi possível atribuir o perfil ao usuário.",
      );
    }
  }

  if (initialAgendaScope === "all") {
    const { error } = await supabaseAdmin.from("resource_scopes").insert(
      (["agenda", "profissional", "unidade", "especialidade"] as const).map(
        (resourceType) => ({
          organization_id: input.organizationId,
          user_id: appUserId,
          resource_type: resourceType,
          resource_id: null,
          access_level: "full",
        }),
      ),
    );
    if (error) {
      return failAfterRollback(
        "Não foi possível atribuir o escopo inicial ao usuário.",
      );
    }
  }

  if (input.professionalId) {
    const { data: linked, error } = await supabaseAdmin
      .from("professionals")
      .update({ user_id: appUserId })
      .eq("organization_id", input.organizationId)
      .eq("id", input.professionalId)
      .is("user_id", null)
      .select("id")
      .maybeSingle<{ id: string }>();
    if (error || !linked) {
      return failAfterRollback(
        "Não foi possível vincular o profissional. O vínculo pode ter sido alterado por outra pessoa.",
      );
    }
  }

  const { error: auditError } = await supabaseAdmin.from("audit_logs").insert({
    organization_id: input.organizationId,
    actor_user_id: input.auditActorUserId ?? input.actorUserId,
    action: "user.access_created",
    resource_type: "app_user",
    resource_id: appUserId,
    metadata: {
      email: input.email,
      profile_id: input.profileId ?? null,
      professional_id: input.professionalId ?? null,
      initial_agenda_scope: initialAgendaScope,
      effective_user_id: input.actorUserId,
    },
  });

  if (auditError) {
    return failAfterRollback("Não foi possível auditar a criação do acesso.");
  }

  return {
    ok: true,
    userId: appUserId,
    authUserId,
    setupLink: linkResult.link,
    created: true,
  };
}

/** Generates a fresh setup/recovery link for a same-tenant, non-admin target. */
export async function generateCompanyUserSetupLink(
  rawInput: GenerateCompanyUserSetupLinkInput,
): Promise<CompanyUserSetupLinkResult> {
  const parsed = setupLinkInputSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, error: "Solicitação inválida." };

  const input = parsed.data;
  const supabaseAdmin = createSupabaseAdminClient();
  const actorCheck = await validateActorOrganization(
    supabaseAdmin,
    input.actorUserId,
    input.organizationId,
  );
  if (actorCheck) return { ok: false, error: actorCheck };
  const auditActorCheck = await validateAuditActor(
    supabaseAdmin,
    input.actorUserId,
    input.organizationId,
    input.auditActorUserId,
  );
  if (auditActorCheck) return { ok: false, error: auditActorCheck };

  const { data: target, error } = await supabaseAdmin
    .from("app_users")
    .select("id, email, auth_user_id, organization_id, is_super_admin")
    .eq("id", input.userId)
    .eq("organization_id", input.organizationId)
    .eq("is_super_admin", false)
    .maybeSingle<{
      id: string;
      email: string;
      auth_user_id: string | null;
      organization_id: string;
      is_super_admin: boolean;
    }>();

  if (error || !target) {
    return { ok: false, error: "Usuário não encontrado nesta empresa." };
  }
  if (!target.auth_user_id) {
    return {
      ok: false,
      error: "Este usuário ainda não possui login vinculado.",
    };
  }

  const linkResult = await generatePasswordRecoveryLink(
    supabaseAdmin,
    target.email,
  );
  if (!linkResult.link) {
    return {
      ok: false,
      error: linkResult.error ?? "Não foi possível gerar o link de acesso.",
    };
  }

  const { error: auditError } = await supabaseAdmin.from("audit_logs").insert({
    organization_id: input.organizationId,
    actor_user_id: input.auditActorUserId ?? input.actorUserId,
    action: "user.setup_link_generated",
    resource_type: "app_user",
    resource_id: input.userId,
    metadata: { effective_user_id: input.actorUserId },
  });
  if (auditError) {
    return { ok: false, error: "O link foi gerado, mas a auditoria falhou." };
  }

  return { ok: true, link: linkResult.link };
}

async function validateActorOrganization(
  supabaseAdmin: AdminClient,
  actorUserId: string,
  organizationId: string,
) {
  const { data: actor, error } = await supabaseAdmin
    .from("app_users")
    .select("id, organization_id, status, is_super_admin")
    .eq("id", actorUserId)
    .maybeSingle<ActorRow>();

  if (error || !actor || actor.status !== "active") {
    return "Responsável pela operação não foi encontrado ou está inativo.";
  }
  if (actor.is_super_admin || actor.organization_id !== organizationId) {
    return "Responsável e empresa não correspondem.";
  }
  const { data: permissionCodes, error: permissionsError } =
    await supabaseAdmin.rpc("user_permission_codes", {
      p_user_id: actor.id,
    });
  if (
    permissionsError ||
    !((permissionCodes as string[] | null) ?? []).includes("config.usuarios")
  ) {
    return "Responsável não possui permissão para gerenciar acessos.";
  }
  return null;
}

async function validateAuditActor(
  supabaseAdmin: AdminClient,
  effectiveActorUserId: string,
  organizationId: string,
  auditActorUserId?: string,
) {
  if (!auditActorUserId || auditActorUserId === effectiveActorUserId)
    return null;

  const { data: auditActor, error: auditActorError } = await supabaseAdmin
    .from("app_users")
    .select("id")
    .eq("id", auditActorUserId)
    .eq("status", "active")
    .eq("is_super_admin", true)
    .maybeSingle<{ id: string }>();
  if (auditActorError || !auditActor) {
    return "Responsável pela auditoria não corresponde à sessão de suporte.";
  }

  const now = new Date();
  const sessionWindowStart = new Date(now.getTime() - 4 * 60 * 60 * 1000);
  const { data: session, error: sessionError } = await supabaseAdmin
    .from("impersonation_sessions")
    .select("id")
    .eq("super_admin_user_id", auditActorUserId)
    .eq("organization_id", organizationId)
    .eq("target_user_id", effectiveActorUserId)
    .is("ended_at", null)
    .gte("started_at", sessionWindowStart.toISOString())
    .lte("started_at", now.toISOString())
    .limit(1)
    .maybeSingle<{ id: string }>();

  return sessionError || !session
    ? "Responsável pela auditoria não corresponde à sessão de suporte."
    : null;
}
