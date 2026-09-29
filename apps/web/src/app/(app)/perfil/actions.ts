"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getRequestContext } from "@/lib/auth/context";
import { databaseErrorMessage } from "@/lib/errors/database";
import {
  createUserAvatarSignedUrl,
  deleteUserAvatar,
  uploadUserAvatar,
} from "@/lib/storage/user-avatars";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { onlyDigits } from "@/lib/validation/br";

export type ProfileActionState = {
  error?: string;
  success?: string;
  fieldErrors?: Record<string, string>;
};

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

/**
 * Quem está editando o próprio perfil. Durante o acesso de suporte a sessão é
 * do super admin, mas a tela é de outra pessoa: nada é alterado nesse modo,
 * para ninguém trocar senha ou e-mail da conta errada.
 */
async function requireSelfService() {
  const context = await getRequestContext();
  if (context.impersonation) {
    return {
      error:
        "Durante o acesso de suporte o perfil fica só para leitura. Encerre o suporte para editar a sua conta.",
    } as const;
  }
  if (!context.actor) {
    return { error: "Sua sessão expirou. Entre de novo." } as const;
  }
  return { user: context.actor } as const;
}

async function recordSecurityEvent(
  action:
    | "user.self_password_changed"
    | "user.self_email_change_requested"
    | "user.self_sessions_revoked",
  metadata: Record<string, unknown> = {},
) {
  // A troca já aconteceu no Supabase Auth; se o registro falhar (banco sem a
  // migração), a pessoa não deve ver erro por isso.
  const supabase = await createSupabaseServerClient();
  await supabase.rpc("record_own_security_event", {
    p_action: action,
    p_metadata: metadata,
  });
}

/** Confere a senha atual entrando de novo — o que também renova a sessão,
 * exigência do Supabase para trocar senha em sessões antigas. */
async function verifyCurrentPassword(email: string, password: string) {
  if (!password) return "Informe a sua senha atual.";
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (!error) return null;
  if (error.status === 429) {
    return "Muitas tentativas seguidas. Aguarde alguns minutos e tente de novo.";
  }
  return "Senha atual incorreta.";
}

async function currentAuthEmail() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  return data.user?.email ?? null;
}

const profileSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Informe o seu nome.")
    .max(120, "Use no máximo 120 caracteres."),
  phone: z
    .string()
    .transform((value) => onlyDigits(value))
    .refine(
      (value) => !value || (value.length >= 10 && value.length <= 11),
      "Informe o telefone com DDD.",
    ),
});

export async function updateOwnProfile(
  _previous: ProfileActionState,
  formData: FormData,
): Promise<ProfileActionState> {
  const self = await requireSelfService();
  if ("error" in self) return { error: self.error };

  const parsed = profileSchema.safeParse({
    name: formData.get("name") ?? "",
    phone: formData.get("phone") ?? "",
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      fieldErrors[key] ??= issue.message;
    }
    return { fieldErrors };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("update_own_profile", {
    p_name: parsed.data.name,
    p_phone: parsed.data.phone || null,
  });
  if (error) {
    return {
      error: databaseErrorMessage(error, "Não foi possível salvar os dados."),
    };
  }

  // O nome também fica no login (aparece nos e-mails do Supabase).
  await supabase.auth.updateUser({ data: { name: parsed.data.name } });

  revalidatePath("/", "layout");
  return { success: "Dados salvos." };
}

export async function updateOwnAvatar(
  formData: FormData,
): Promise<{ error?: string; avatarUrl?: string }> {
  const self = await requireSelfService();
  if ("error" in self) return { error: self.error };

  const upload = await uploadUserAvatar({
    file: formData.get("avatar"),
    organizationId: self.user.organization_id,
    appUserId: self.user.id,
  });
  if (!upload.path) return { error: upload.error };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("set_own_avatar", {
    p_avatar_path: upload.path,
  });
  if (error) {
    await deleteUserAvatar(upload.path);
    return {
      error: databaseErrorMessage(error, "Não foi possível salvar a foto."),
    };
  }

  await deleteUserAvatar(
    (data as { previous_path?: string | null } | null)?.previous_path,
  );
  revalidatePath("/", "layout");
  return { avatarUrl: (await createUserAvatarSignedUrl(upload.path)) ?? "" };
}

export async function removeOwnAvatar(): Promise<{ error?: string }> {
  const self = await requireSelfService();
  if ("error" in self) return { error: self.error };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("set_own_avatar", {
    p_avatar_path: null,
  });
  if (error) {
    return {
      error: databaseErrorMessage(error, "Não foi possível remover a foto."),
    };
  }

  await deleteUserAvatar(
    (data as { previous_path?: string | null } | null)?.previous_path,
  );
  revalidatePath("/", "layout");
  return {};
}

const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email("Informe um e-mail válido.")
  .max(254, "E-mail longo demais.");

export async function requestEmailChange(
  _previous: ProfileActionState,
  formData: FormData,
): Promise<ProfileActionState> {
  const self = await requireSelfService();
  if ("error" in self) return { error: self.error };

  const parsedEmail = emailSchema.safeParse(formData.get("email") ?? "");
  if (!parsedEmail.success) {
    return {
      fieldErrors: { email: parsedEmail.error.issues[0]?.message ?? "" },
    };
  }
  const nextEmail = parsedEmail.data;
  const currentEmail = await currentAuthEmail();
  if (!currentEmail) return { error: "Sua sessão expirou. Entre de novo." };
  if (nextEmail === currentEmail.toLowerCase()) {
    return { fieldErrors: { email: "Este já é o seu e-mail de login." } };
  }

  const passwordError = await verifyCurrentPassword(
    currentEmail,
    String(formData.get("current_password") ?? ""),
  );
  if (passwordError)
    return { fieldErrors: { current_password: passwordError } };

  // A ficha interna não aceita dois usuários com o mesmo e-mail na empresa:
  // barrar aqui evita a confirmação falhar depois do clique no link.
  let duplicateQuery = createSupabaseAdminClient()
    .from("app_users")
    .select("id")
    .eq("email", nextEmail)
    .neq("id", self.user.id)
    .limit(1);
  duplicateQuery = self.user.organization_id
    ? duplicateQuery.eq("organization_id", self.user.organization_id)
    : duplicateQuery.is("organization_id", null);
  const { data: duplicate } = await duplicateQuery;
  if (duplicate?.length) {
    return {
      fieldErrors: { email: "Outro usuário da empresa já usa este e-mail." },
    };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.updateUser(
    { email: nextEmail },
    {
      emailRedirectTo: `${appUrl}/auth/callback?next=/perfil?email=confirmado`,
    },
  );
  if (error) {
    if (error.code === "email_exists") {
      return {
        fieldErrors: { email: "Este e-mail já está em uso em outra conta." },
      };
    }
    if (error.status === 429 || error.code?.includes("rate_limit")) {
      return {
        error:
          "O limite de envio de e-mails foi atingido. Tente de novo em alguns minutos.",
      };
    }
    return { error: "Não foi possível enviar o link de confirmação." };
  }

  await recordSecurityEvent("user.self_email_change_requested");
  revalidatePath("/perfil");
  return {
    success: `Enviamos um link de confirmação para ${nextEmail}. O e-mail de login só muda depois do clique no link.`,
  };
}

export async function resendEmailChange(): Promise<ProfileActionState> {
  const self = await requireSelfService();
  if ("error" in self) return { error: self.error };

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  const pendingEmail = data.user?.new_email;
  if (!pendingEmail) return { error: "Não há troca de e-mail pendente." };

  const { error } = await supabase.auth.resend({
    type: "email_change",
    email: pendingEmail,
    options: {
      emailRedirectTo: `${appUrl}/auth/callback?next=/perfil?email=confirmado`,
    },
  });
  if (error) {
    return {
      error:
        error.status === 429
          ? "Aguarde um pouco antes de pedir outro link."
          : "Não foi possível reenviar o link.",
    };
  }
  return { success: `Link reenviado para ${pendingEmail}.` };
}

const passwordSchema = z
  .object({
    current_password: z.string().min(1, "Informe a sua senha atual."),
    password: z.string().min(8, "Use pelo menos 8 caracteres."),
    password_confirmation: z.string(),
    sign_out_others: z.boolean(),
  })
  .refine((data) => data.password === data.password_confirmation, {
    path: ["password_confirmation"],
    message: "A confirmação não confere com a nova senha.",
  })
  .refine((data) => data.password !== data.current_password, {
    path: ["password"],
    message: "A nova senha precisa ser diferente da atual.",
  });

export async function changeOwnPassword(
  _previous: ProfileActionState,
  formData: FormData,
): Promise<ProfileActionState> {
  const self = await requireSelfService();
  if ("error" in self) return { error: self.error };

  const parsed = passwordSchema.safeParse({
    current_password: String(formData.get("current_password") ?? ""),
    password: String(formData.get("password") ?? ""),
    password_confirmation: String(formData.get("password_confirmation") ?? ""),
    sign_out_others: formData.get("sign_out_others") === "on",
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      fieldErrors[key] ??= issue.message;
    }
    return { fieldErrors };
  }

  const email = await currentAuthEmail();
  if (!email) return { error: "Sua sessão expirou. Entre de novo." };
  const passwordError = await verifyCurrentPassword(
    email,
    parsed.data.current_password,
  );
  if (passwordError)
    return { fieldErrors: { current_password: passwordError } };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
  });
  if (error) {
    if (error.code === "same_password") {
      return {
        fieldErrors: {
          password: "A nova senha precisa ser diferente da atual.",
        },
      };
    }
    if (error.code === "weak_password") {
      return {
        fieldErrors: {
          password:
            "Senha fraca. Misture letras, números e símbolos ou use uma frase maior.",
        },
      };
    }
    return { error: "Não foi possível trocar a senha. Tente de novo." };
  }

  if (parsed.data.sign_out_others) {
    await supabase.auth.signOut({ scope: "others" });
  }
  await recordSecurityEvent("user.self_password_changed", {
    signed_out_others: parsed.data.sign_out_others,
  });
  return {
    success: parsed.data.sign_out_others
      ? "Senha alterada. Os outros dispositivos precisarão entrar de novo."
      : "Senha alterada.",
  };
}

export async function signOutOtherSessions(): Promise<{ error?: string }> {
  const self = await requireSelfService();
  if ("error" in self) return { error: self.error };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signOut({ scope: "others" });
  if (error) {
    return { error: "Não foi possível encerrar as outras sessões." };
  }
  await recordSecurityEvent("user.self_sessions_revoked");
  return {};
}
