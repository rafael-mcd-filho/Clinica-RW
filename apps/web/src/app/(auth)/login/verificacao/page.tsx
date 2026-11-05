import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { MfaVerifyForm } from "./mfa-verify-form";

export const metadata = { title: "Verificação em duas etapas" };

export default async function MfaVerificationPage() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (!data || data.currentLevel === null) redirect("/login");
  if (data.currentLevel === "aal2" || data.nextLevel !== "aal2") {
    redirect("/dashboard");
  }

  return (
    <main className="grid min-h-svh place-items-center bg-background p-4">
      <MfaVerifyForm />
    </main>
  );
}
