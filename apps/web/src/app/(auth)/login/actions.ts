"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type LoginState = {
  error?: string;
};

export type PasswordResetRequestState = {
  error?: string;
  success?: string;
};

export type PasswordUpdateState = {
  error?: string;
  success?: string;
};

export async function signInWithPassword(
  _previousState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Informe e-mail e senha." };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    // Raio-X PF2: bloqueio por excesso de tentativas com mensagem clara, em
    // vez do mesmo "credenciais inválidas" que fazia a pessoa insistir.
    if (
      error.status === 429 ||
      error.code === "over_request_rate_limit" ||
      error.code === "too_many_requests"
    ) {
      return {
        error:
          'Muitas tentativas seguidas. Por segurança, o acesso foi pausado por alguns minutos. Aguarde e tente de novo, ou use "Esqueci minha senha".',
      };
    }
    if (error.code === "user_banned") {
      return {
        error:
          "Este acesso está bloqueado. Fale com o administrador da clínica.",
      };
    }
    if (error.code === "email_not_confirmed") {
      return {
        error: "Confirme seu e-mail pelo link que enviamos antes de entrar.",
      };
    }
    return { error: "E-mail ou senha incorretos." };
  }

  // Quem ativou a verificação em duas etapas confirma o código do aplicativo
  // antes de entrar (Raio-X S9).
  const { data: assurance } =
    await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (assurance?.nextLevel === "aal2" && assurance.currentLevel !== "aal2") {
    redirect("/login/verificacao");
  }

  redirect("/dashboard");
}

export type MfaVerifyState = { error?: string };

export async function verifyMfaCode(
  _previousState: MfaVerifyState,
  formData: FormData,
): Promise<MfaVerifyState> {
  const code = String(formData.get("code") ?? "").replace(/\D/g, "");
  if (code.length !== 6) {
    return { error: "Informe os 6 dígitos do aplicativo autenticador." };
  }
  const supabase = await createSupabaseServerClient();
  const { data: factors, error: factorsError } =
    await supabase.auth.mfa.listFactors();
  const factor = factors?.totp.find((item) => item.status === "verified");
  if (factorsError || !factor) {
    return { error: "Sessão expirada. Entre de novo com e-mail e senha." };
  }
  const { error } = await supabase.auth.mfa.challengeAndVerify({
    factorId: factor.id,
    code,
  });
  if (error) {
    return { error: "Código inválido ou expirado. Tente o código atual." };
  }
  redirect("/dashboard");
}

export async function signOut() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/login");
}

const passwordResetRequestSchema = z.object({
  email: z.string().trim().email("Informe um e-mail válido."),
});

export async function requestPasswordReset(
  _previousState: PasswordResetRequestState,
  formData: FormData,
): Promise<PasswordResetRequestState> {
  const parsed = passwordResetRequestSchema.safeParse({
    email: formData.get("email"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "E-mail inválido." };
  }

  const supabase = await createSupabaseServerClient();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const { error } = await supabase.auth.resetPasswordForEmail(
    parsed.data.email,
    {
      redirectTo: `${appUrl}/auth/callback?next=/redefinir-senha`,
    },
  );

  if (error) {
    return { error: "Não foi possível solicitar a redefinição agora." };
  }

  return {
    success:
      "Se o e-mail estiver cadastrado, enviaremos as instruções de redefinição.",
  };
}

const passwordUpdateSchema = z
  .object({
    password: z.string().min(10, "Use uma senha com pelo menos 10 caracteres."),
    password_confirmation: z.string(),
  })
  .refine((data) => data.password === data.password_confirmation, {
    message: "As senhas não conferem.",
    path: ["password_confirmation"],
  });

export async function updatePassword(
  _previousState: PasswordUpdateState,
  formData: FormData,
): Promise<PasswordUpdateState> {
  const parsed = passwordUpdateSchema.safeParse({
    password: formData.get("password"),
    password_confirmation: formData.get("password_confirmation"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Senha inválida." };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Link expirado. Solicite uma nova redefinição de senha." };
  }

  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
  });

  if (error) {
    return { error: "Não foi possível atualizar a senha." };
  }

  await supabase.auth.signOut();

  return { success: "Senha atualizada. Volte ao login para entrar." };
}
