"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getCurrentAppUser } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { uploadBrandingLogo } from "@/lib/storage/branding";
import { isValidCNPJ } from "@/lib/validation/br";

export type CreateEmpresaState = {
  error?: string;
  /** Set when the company was created and a setup link should be shown. */
  createdName?: string;
  setupLink?: string;
};

export type UpdateEmpresaState = {
  error?: string;
  success?: string;
};

export type EmpresaActionState = {
  error?: string;
  ok?: boolean;
};

const createEmpresaSchema = z
  .object({
    name: z.string().trim().min(2, "Informe o nome fantasia da empresa."),
    legal_name: z.string().trim().optional(),
    document: z.string().trim().optional(),
    email: z
      .string()
      .trim()
      .email("E-mail da empresa inválido.")
      .optional()
      .or(z.literal("")),
    phone: z.string().trim().optional(),
    owner_name: z.string().trim().min(2, "Informe o nome do responsável."),
    owner_email: z
      .string()
      .trim()
      .email("Informe um e-mail válido para o responsável.")
      .transform((email) => email.toLowerCase()),
    owner_phone: z.string().trim().optional(),
    access_method: z.enum(["password", "link"]),
    owner_password: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.document && !isValidCNPJ(data.document)) {
      ctx.addIssue({
        code: "custom",
        path: ["document"],
        message: "CNPJ inválido.",
      });
    }

    if (
      data.access_method === "password" &&
      (!data.owner_password || data.owner_password.length < 8)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["owner_password"],
        message: "A senha inicial precisa ter pelo menos 8 caracteres.",
      });
    }
  });

type SupabaseAdminClient = ReturnType<typeof createSupabaseAdminClient>;

async function findAuthUserByEmail(
  supabaseAdmin: SupabaseAdminClient,
  email: string,
) {
  const { data, error } = await supabaseAdmin.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });

  if (error) {
    return { error: error.message };
  }

  return {
    user: data.users.find(
      (user) => user.email?.toLowerCase() === email.toLowerCase(),
    ),
  };
}

async function findAppUserByAuthUserId(
  supabaseAdmin: SupabaseAdminClient,
  authUserId: string,
) {
  const { data, error } = await supabaseAdmin
    .from("app_users")
    .select("id, email, organization_id, is_super_admin")
    .eq("auth_user_id", authUserId)
    .maybeSingle();

  if (error) {
    return { error: error.message };
  }

  return { user: data };
}

async function createOrUpdateOwnerAuthUser(
  supabaseAdmin: SupabaseAdminClient,
  input: {
    name: string;
    email: string;
    password: string;
  },
) {
  const { data: createdUser, error: createError } =
    await supabaseAdmin.auth.admin.createUser({
      email: input.email,
      password: input.password,
      email_confirm: true,
      user_metadata: { name: input.name },
    });

  if (!createError && createdUser.user) {
    return { user: createdUser.user };
  }

  if (createError && !createError.message.toLowerCase().includes("already")) {
    return { error: createError.message };
  }

  const existingUser = await findAuthUserByEmail(supabaseAdmin, input.email);

  if (existingUser.error) {
    return { error: existingUser.error };
  }

  if (!existingUser.user) {
    return { error: "Usuário Auth existente não foi encontrado." };
  }

  const linkedAppUser = await findAppUserByAuthUserId(
    supabaseAdmin,
    existingUser.user.id,
  );

  if (linkedAppUser.error) {
    return { error: linkedAppUser.error };
  }

  if (linkedAppUser.user) {
    return {
      error:
        "Este e-mail já está vinculado a outro usuário da plataforma. Use outro e-mail para o admin da empresa.",
    };
  }

  const { data: updatedUser, error: updateError } =
    await supabaseAdmin.auth.admin.updateUserById(existingUser.user.id, {
      password: input.password,
      email_confirm: true,
      user_metadata: { name: input.name },
    });

  if (updateError) {
    return { error: updateError.message };
  }

  return { user: updatedUser.user ?? existingUser.user };
}

/**
 * Generates a password-setup (recovery) link via the admin API. Works without
 * SMTP: the returned link can be copied and sent to the responsible person.
 */
async function generateOwnerSetupLink(
  supabaseAdmin: SupabaseAdminClient,
  email: string,
): Promise<{ link?: string; error?: string }> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const { data, error } = await supabaseAdmin.auth.admin.generateLink({
    type: "recovery",
    email,
    options: { redirectTo: `${appUrl}/auth/callback?next=/redefinir-senha` },
  });

  if (error || !data?.properties?.action_link) {
    return {
      error:
        "Empresa criada, mas não foi possível gerar o link de acesso. Gere novamente na tela de Usuários.",
    };
  }

  return { link: data.properties.action_link };
}

export async function createEmpresa(
  _previousState: CreateEmpresaState,
  formData: FormData,
): Promise<CreateEmpresaState> {
  const appUser = await getCurrentAppUser();

  if (!appUser?.is_super_admin) {
    return { error: "Apenas Super Admin pode criar empresas." };
  }

  const parsed = createEmpresaSchema.safeParse({
    name: formData.get("name"),
    legal_name: formData.get("legal_name") || undefined,
    document: formData.get("document") || undefined,
    email: formData.get("email") ?? "",
    phone: formData.get("phone") || undefined,
    owner_name: formData.get("owner_name"),
    owner_email: formData.get("owner_email"),
    owner_phone: formData.get("owner_phone") || undefined,
    access_method: formData.get("access_method"),
    owner_password: formData.get("owner_password") || undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  // Upload the logo first so a storage failure never leaves a half-created org.
  const uploaded = await uploadBrandingLogo(formData.get("logo"), "org");

  if (uploaded.error) {
    return { error: uploaded.error };
  }

  const logoUrl = uploaded.url ?? null;
  const password =
    parsed.data.access_method === "password"
      ? (parsed.data.owner_password as string)
      : crypto.randomUUID();

  const supabaseAdmin = createSupabaseAdminClient();
  const ownerAuthUser = await createOrUpdateOwnerAuthUser(supabaseAdmin, {
    name: parsed.data.owner_name,
    email: parsed.data.owner_email,
    password,
  });

  if (ownerAuthUser.error || !ownerAuthUser.user) {
    return {
      error:
        ownerAuthUser.error ??
        "Não foi possível criar o usuário Auth do responsável.",
    };
  }

  const existingAppUser = await findAppUserByAuthUserId(
    supabaseAdmin,
    ownerAuthUser.user.id,
  );

  if (existingAppUser.error) {
    return { error: existingAppUser.error };
  }

  if (existingAppUser.user) {
    return {
      error:
        "Este e-mail já está vinculado a outro usuário da plataforma. Use outro e-mail para o responsável.",
    };
  }

  const { data: created, error } = await supabaseAdmin
    .rpc("create_organization_with_owner", {
      p_actor_user_id: appUser.id,
      p_owner_auth_user_id: ownerAuthUser.user.id,
      p_owner_name: parsed.data.owner_name,
      p_owner_email: parsed.data.owner_email,
      p_organization_name: parsed.data.name,
      p_legal_name: parsed.data.legal_name ?? null,
      p_document: parsed.data.document ?? null,
      p_plan_key: "starter",
      p_mode: "solo",
      p_status: "trial",
    })
    .single<{ organization_id: string; owner_user_id: string }>();

  if (error || !created) {
    return { error: error?.message ?? "Não foi possível criar a empresa." };
  }

  // Persist the fields the RPC does not handle (contact, logo, owner phone).
  await supabaseAdmin
    .from("organizations")
    .update({
      email: parsed.data.email ? parsed.data.email : null,
      phone: parsed.data.phone ?? null,
      logo_url: logoUrl,
    })
    .eq("id", created.organization_id);

  if (parsed.data.owner_phone) {
    await supabaseAdmin
      .from("app_users")
      .update({ phone: parsed.data.owner_phone })
      .eq("id", created.owner_user_id);
  }

  revalidatePath("/dashboard");
  revalidatePath("/empresas");

  if (parsed.data.access_method === "link") {
    const setupLink = await generateOwnerSetupLink(
      supabaseAdmin,
      parsed.data.owner_email,
    );

    return {
      createdName: parsed.data.name,
      setupLink: setupLink.link,
      error: setupLink.error,
    };
  }

  redirect("/empresas");
}

const updateEmpresaSchema = z
  .object({
    organization_id: z.string().uuid("Empresa inválida."),
    name: z.string().trim().min(2, "Informe o nome da empresa."),
    legal_name: z.string().trim().optional(),
    document: z.string().trim().optional(),
    email: z
      .string()
      .trim()
      .email("E-mail da empresa inválido.")
      .optional()
      .or(z.literal("")),
    phone: z.string().trim().optional(),
    status: z.enum(["trial", "active", "suspended", "cancelled"]),
  })
  .superRefine((data, ctx) => {
    if (data.document && !isValidCNPJ(data.document)) {
      ctx.addIssue({
        code: "custom",
        path: ["document"],
        message: "CNPJ inválido.",
      });
    }
  });

export async function updateEmpresa(
  organizationId: string,
  _previousState: UpdateEmpresaState,
  formData: FormData,
): Promise<UpdateEmpresaState> {
  const appUser = await getCurrentAppUser();

  if (!appUser?.is_super_admin) {
    return { error: "Apenas Super Admin pode alterar empresas." };
  }

  const parsed = updateEmpresaSchema.safeParse({
    organization_id: organizationId,
    name: formData.get("name"),
    legal_name: formData.get("legal_name") || undefined,
    document: formData.get("document") || undefined,
    email: formData.get("email") ?? "",
    phone: formData.get("phone") || undefined,
    status: formData.get("status"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const uploaded = await uploadBrandingLogo(formData.get("logo"), "org");

  if (uploaded.error) {
    return { error: uploaded.error };
  }

  const removeLogo = formData.get("remove_logo") === "true";
  const currentLogoUrl =
    String(formData.get("current_logo_url") ?? "").trim() || null;
  const logoUrl = uploaded.url ?? (removeLogo ? null : currentLogoUrl);

  const supabaseAdmin = createSupabaseAdminClient();
  const { error } = await supabaseAdmin.rpc(
    "update_organization_as_super_admin",
    {
      p_actor_user_id: appUser.id,
      p_organization_id: parsed.data.organization_id,
      p_name: parsed.data.name,
      p_legal_name: parsed.data.legal_name ?? null,
      p_document: parsed.data.document ?? null,
      p_status: parsed.data.status,
    },
  );

  if (error) {
    return { error: error.message };
  }

  await supabaseAdmin
    .from("organizations")
    .update({
      email: parsed.data.email ? parsed.data.email : null,
      phone: parsed.data.phone ?? null,
      logo_url: logoUrl,
    })
    .eq("id", parsed.data.organization_id);

  revalidatePath("/dashboard");
  revalidatePath("/empresas");
  revalidatePath(`/empresas/${parsed.data.organization_id}`);
  revalidatePath("/financeiro");

  return { success: "Empresa atualizada." };
}

const updateOwnerSchema = z.object({
  user_id: z.string().uuid("Responsável inválido."),
  name: z.string().trim().min(2, "Informe o nome do responsável."),
  email: z
    .string()
    .trim()
    .email("E-mail do responsável inválido.")
    .transform((email) => email.toLowerCase()),
  phone: z.string().trim().optional(),
});

export async function updateEmpresaOwner(
  organizationId: string,
  _previousState: UpdateEmpresaState,
  formData: FormData,
): Promise<UpdateEmpresaState> {
  const appUser = await getCurrentAppUser();

  if (!appUser?.is_super_admin) {
    return { error: "Apenas Super Admin pode alterar o responsável." };
  }

  const parsed = updateOwnerSchema.safeParse({
    user_id: formData.get("user_id"),
    name: formData.get("name"),
    email: formData.get("email"),
    phone: formData.get("phone") || undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const supabaseAdmin = createSupabaseAdminClient();
  const { data: target, error: fetchError } = await supabaseAdmin
    .from("app_users")
    .select("id, auth_user_id, organization_id, email")
    .eq("id", parsed.data.user_id)
    .maybeSingle<{
      id: string;
      auth_user_id: string | null;
      organization_id: string | null;
      email: string;
    }>();

  if (fetchError || !target || target.organization_id !== organizationId) {
    return { error: "Responsável não encontrado nesta empresa." };
  }

  if (target.auth_user_id && parsed.data.email !== target.email.toLowerCase()) {
    const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(
      target.auth_user_id,
      { email: parsed.data.email, email_confirm: true },
    );

    if (authError) {
      return {
        error:
          "Não foi possível atualizar o e-mail do responsável (já em uso?).",
      };
    }
  }

  const { error } = await supabaseAdmin
    .from("app_users")
    .update({
      name: parsed.data.name,
      email: parsed.data.email,
      phone: parsed.data.phone ?? null,
    })
    .eq("id", parsed.data.user_id);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/empresas");
  revalidatePath(`/empresas/${organizationId}`);

  return { success: "Responsável atualizado." };
}

const setStatusSchema = z.object({
  organization_id: z.string().uuid("Empresa inválida."),
  status: z.enum(["trial", "active", "suspended", "cancelled"]),
});

export async function setEmpresaStatus(
  organizationId: string,
  _previousState: EmpresaActionState,
  formData: FormData,
): Promise<EmpresaActionState> {
  const appUser = await getCurrentAppUser();

  if (!appUser?.is_super_admin) {
    return { error: "Apenas Super Admin pode alterar empresas." };
  }

  const parsed = setStatusSchema.safeParse({
    organization_id: organizationId,
    status: formData.get("status"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const supabaseAdmin = createSupabaseAdminClient();
  const { data: organization, error: fetchError } = await supabaseAdmin
    .from("organizations")
    .select("name, legal_name, document")
    .eq("id", parsed.data.organization_id)
    .maybeSingle<{
      name: string;
      legal_name: string | null;
      document: string | null;
    }>();

  if (fetchError || !organization) {
    return { error: fetchError?.message ?? "Empresa não encontrada." };
  }

  const { error } = await supabaseAdmin.rpc(
    "update_organization_as_super_admin",
    {
      p_actor_user_id: appUser.id,
      p_organization_id: parsed.data.organization_id,
      p_name: organization.name,
      p_legal_name: organization.legal_name,
      p_document: organization.document,
      p_status: parsed.data.status,
    },
  );

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/dashboard");
  revalidatePath("/empresas");
  revalidatePath(`/empresas/${parsed.data.organization_id}`);
  revalidatePath("/financeiro");

  return { ok: true };
}

const deleteEmpresaSchema = z.object({
  organization_id: z.string().uuid("Empresa inválida."),
  confirm_name: z.string().trim().min(1, "Confirme o nome da empresa."),
});

export async function deleteEmpresa(
  organizationId: string,
  _previousState: EmpresaActionState,
  formData: FormData,
): Promise<EmpresaActionState> {
  const appUser = await getCurrentAppUser();

  if (!appUser?.is_super_admin) {
    return { error: "Apenas Super Admin pode excluir empresas." };
  }

  const parsed = deleteEmpresaSchema.safeParse({
    organization_id: organizationId,
    confirm_name: formData.get("confirm_name"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const supabaseAdmin = createSupabaseAdminClient();

  const { data: organization, error: fetchError } = await supabaseAdmin
    .from("organizations")
    .select("name")
    .eq("id", parsed.data.organization_id)
    .maybeSingle<{ name: string }>();

  if (fetchError || !organization) {
    return { error: fetchError?.message ?? "Empresa não encontrada." };
  }

  if (
    parsed.data.confirm_name.trim().toLowerCase() !==
    organization.name.trim().toLowerCase()
  ) {
    return {
      error: "O nome digitado não confere com o nome da empresa.",
    };
  }

  const { data, error } = await supabaseAdmin.rpc(
    "delete_organization_as_super_admin",
    {
      p_actor_user_id: appUser.id,
      p_organization_id: parsed.data.organization_id,
    },
  );

  if (error) {
    return { error: error.message };
  }

  const authUserIds = (data as string[] | null) ?? [];

  // The organization is already gone at this point. Removing the orphaned
  // Supabase Auth users is best-effort and must not fail the whole action.
  for (const authUserId of authUserIds) {
    if (!authUserId) {
      continue;
    }
    try {
      await supabaseAdmin.auth.admin.deleteUser(authUserId);
    } catch {
      // Ignore: the auth user can be cleaned up later if needed.
    }
  }

  revalidatePath("/dashboard");
  revalidatePath("/empresas");
  revalidatePath("/financeiro");

  return { ok: true };
}
