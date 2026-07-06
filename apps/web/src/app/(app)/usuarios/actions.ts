"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { generatePasswordRecoveryLink } from "@/lib/auth/admin-links";
import { getCurrentAppUser } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type UserActionState = {
  error?: string;
  ok?: boolean;
  /** Recovery link returned by the "generate link" password flow. */
  link?: string;
};

type AdminClient = ReturnType<typeof createSupabaseAdminClient>;

type ManageableUser = {
  id: string;
  auth_user_id: string | null;
  email: string;
  is_super_admin: boolean;
};

/** Loads the target user and refuses to manage the Super Admin. */
async function loadManageableUser(
  supabaseAdmin: AdminClient,
  userId: string,
): Promise<{ user?: ManageableUser; error?: string }> {
  const { data, error } = await supabaseAdmin
    .from("app_users")
    .select("id, auth_user_id, email, is_super_admin")
    .eq("id", userId)
    .maybeSingle<ManageableUser>();

  if (error || !data) {
    return { error: "Usuário não encontrado." };
  }

  if (data.is_super_admin) {
    return { error: "Não é possível gerenciar o Super Admin por aqui." };
  }

  return { user: data };
}

async function requireSuperAdmin() {
  const appUser = await getCurrentAppUser();
  return appUser?.is_super_admin ? appUser : null;
}

const statusSchema = z.object({
  status: z.enum(["active", "suspended"]),
});

export async function setUserStatus(
  userId: string,
  _previousState: UserActionState,
  formData: FormData,
): Promise<UserActionState> {
  if (!(await requireSuperAdmin())) {
    return { error: "Apenas Super Admin pode alterar usuários." };
  }

  const parsed = statusSchema.safeParse({ status: formData.get("status") });

  if (!parsed.success) {
    return { error: "Status inválido." };
  }

  const supabaseAdmin = createSupabaseAdminClient();
  const target = await loadManageableUser(supabaseAdmin, userId);

  if (target.error || !target.user) {
    return { error: target.error };
  }

  const { error } = await supabaseAdmin
    .from("app_users")
    .update({ status: parsed.data.status })
    .eq("id", target.user.id);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/usuarios");
  return { ok: true };
}

const updateUserSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome do usuário."),
  email: z
    .string()
    .trim()
    .email("E-mail inválido.")
    .transform((email) => email.toLowerCase()),
  phone: z.string().trim().optional(),
});

export async function updateUser(
  userId: string,
  _previousState: UserActionState,
  formData: FormData,
): Promise<UserActionState> {
  if (!(await requireSuperAdmin())) {
    return { error: "Apenas Super Admin pode alterar usuários." };
  }

  const parsed = updateUserSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    phone: formData.get("phone") || undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const supabaseAdmin = createSupabaseAdminClient();
  const target = await loadManageableUser(supabaseAdmin, userId);

  if (target.error || !target.user) {
    return { error: target.error };
  }

  if (
    target.user.auth_user_id &&
    parsed.data.email !== target.user.email.toLowerCase()
  ) {
    const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(
      target.user.auth_user_id,
      { email: parsed.data.email, email_confirm: true },
    );

    if (authError) {
      return { error: "Não foi possível atualizar o e-mail (já em uso?)." };
    }
  }

  const { error } = await supabaseAdmin
    .from("app_users")
    .update({
      name: parsed.data.name,
      email: parsed.data.email,
      phone: parsed.data.phone ?? null,
    })
    .eq("id", target.user.id);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/usuarios");
  return { ok: true };
}

const passwordSchema = z
  .object({
    mode: z.enum(["manual", "link"]),
    password: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (
      data.mode === "manual" &&
      (!data.password || data.password.length < 8)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["password"],
        message: "A senha precisa ter pelo menos 8 caracteres.",
      });
    }
  });

export async function setUserPassword(
  userId: string,
  _previousState: UserActionState,
  formData: FormData,
): Promise<UserActionState> {
  if (!(await requireSuperAdmin())) {
    return { error: "Apenas Super Admin pode alterar senhas." };
  }

  const parsed = passwordSchema.safeParse({
    mode: formData.get("mode"),
    password: formData.get("password") || undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const supabaseAdmin = createSupabaseAdminClient();
  const target = await loadManageableUser(supabaseAdmin, userId);

  if (target.error || !target.user) {
    return { error: target.error };
  }

  if (!target.user.auth_user_id) {
    return { error: "Usuário sem login vinculado." };
  }

  if (parsed.data.mode === "manual") {
    const { error } = await supabaseAdmin.auth.admin.updateUserById(
      target.user.auth_user_id,
      { password: parsed.data.password },
    );

    if (error) {
      return { error: "Não foi possível alterar a senha." };
    }

    return { ok: true };
  }

  const link = await generatePasswordRecoveryLink(
    supabaseAdmin,
    target.user.email,
  );

  if (link.error) {
    return { error: link.error };
  }

  return { ok: true, link: link.link };
}

const deleteUserSchema = z.object({
  confirm_email: z.string().trim().min(1, "Confirme o e-mail do usuário."),
});

export async function deleteUser(
  userId: string,
  _previousState: UserActionState,
  formData: FormData,
): Promise<UserActionState> {
  if (!(await requireSuperAdmin())) {
    return { error: "Apenas Super Admin pode excluir usuários." };
  }

  const parsed = deleteUserSchema.safeParse({
    confirm_email: formData.get("confirm_email"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const supabaseAdmin = createSupabaseAdminClient();
  const target = await loadManageableUser(supabaseAdmin, userId);

  if (target.error || !target.user) {
    return { error: target.error };
  }

  if (
    parsed.data.confirm_email.trim().toLowerCase() !==
    target.user.email.toLowerCase()
  ) {
    return { error: "O e-mail digitado não confere com o do usuário." };
  }

  const { error } = await supabaseAdmin
    .from("app_users")
    .delete()
    .eq("id", target.user.id);

  if (error) {
    return { error: error.message };
  }

  // Best-effort removal of the orphaned Supabase Auth user.
  if (target.user.auth_user_id) {
    try {
      await supabaseAdmin.auth.admin.deleteUser(target.user.auth_user_id);
    } catch {
      // Ignore: can be cleaned up later if needed.
    }
  }

  revalidatePath("/usuarios");
  return { ok: true };
}
