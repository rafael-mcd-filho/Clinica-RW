"use server";

import { createClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Confere a senha de quem está logado para desbloquear a tela parada
 * (Raio-X S9). Usa um cliente sem sessão persistida: a conferência não troca
 * os cookies nem derruba a verificação em duas etapas da sessão atual.
 */
export async function verifyOwnPassword(
  password: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!password) return { ok: false, error: "Informe a sua senha." };
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  const email = data.user?.email;
  if (!email) return { ok: false, error: "Sessão encerrada. Entre de novo." };

  const verifier = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { error } = await verifier.auth.signInWithPassword({
    email,
    password,
  });
  if (error) return { ok: false, error: "Senha incorreta." };
  // A sessão de conferência não é usada para nada: encerra só ela.
  await verifier.auth.signOut({ scope: "local" });
  return { ok: true };
}
