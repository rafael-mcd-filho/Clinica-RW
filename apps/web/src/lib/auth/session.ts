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

export async function getAuthenticatedUser() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return null;
  }

  return user;
}

export async function requireAuthenticatedUser() {
  const user = await getAuthenticatedUser();

  if (!user) {
    redirect("/login");
  }

  return user;
}

export async function getCurrentAppUser() {
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
}
