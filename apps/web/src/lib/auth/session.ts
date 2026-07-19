import { cache } from "react";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type CurrentAppUser = {
  id: string;
  organization_id: string | null;
  name: string;
  email: string;
  status: "invited" | "active" | "suspended";
  is_super_admin: boolean;
  organizations: {
    id: string;
    name: string;
    status: string;
    mode: string;
    plan_key: string;
    logo_url: string | null;
  } | null;
};

// getClaims verifica o JWT localmente contra o JWKS do projeto quando a
// assinatura é assimétrica (RS256/ECC), sem round-trip ao Auth server —
// ao contrário de getUser(), que sempre faz uma chamada de rede. Como
// isto roda em toda navegação (via getCurrentAppUser), o ganho é direto.
// Com segredo simétrico, getClaims cai no mesmo comportamento de getUser
// (chamada ao servidor), então continua seguro em qualquer configuração.
export const getAuthenticatedUser = cache(
  async function getAuthenticatedUser() {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.getClaims();

    if (error || !data?.claims) {
      return null;
    }

    return {
      id: data.claims.sub,
      email: typeof data.claims.email === "string" ? data.claims.email : null,
    };
  },
);

export async function requireAuthenticatedUser() {
  const user = await getAuthenticatedUser();

  if (!user) {
    redirect("/login");
  }

  return user;
}

export const getCurrentAppUser = cache(async function getCurrentAppUser() {
  const user = await getAuthenticatedUser();

  if (!user) {
    return null;
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("app_users")
    .select(
      "id, organization_id, name, email, status, is_super_admin, organizations(id, name, status, mode, plan_key, logo_url)",
    )
    .eq("auth_user_id", user.id)
    .maybeSingle<CurrentAppUser>();

  if (error) {
    throw new Error(error.message);
  }

  return data;
});
