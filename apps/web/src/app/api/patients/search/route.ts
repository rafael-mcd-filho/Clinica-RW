import { NextResponse } from "next/server";
import { getRequestContext, hasAnyPermission } from "@/lib/auth/context";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const context = await getRequestContext();
  if (
    !context.organization ||
    !hasAnyPermission(context.permissionCodes, [
      "paciente.ver",
      "agenda.criar_agendamento",
      "agenda.editar_agendamento",
      "funil.gerenciar",
    ])
  ) {
    return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
  }

  const url = new URL(request.url);
  const query = (url.searchParams.get("q") ?? "")
    .trim()
    .slice(0, 100)
    .replace(/[,()%*]/g, " ")
    .replace(/\s+/g, " ");

  if (query.length < 3) {
    return NextResponse.json(
      { patients: [] },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  }

  const filters = [
    `full_name.ilike.%${query}%`,
    `social_name.ilike.%${query}%`,
    `email.ilike.%${query}%`,
    `phone.ilike.%${query}%`,
    `whatsapp.ilike.%${query}%`,
  ];
  const canSeeSensitive = context.permissionCodes.has(
    "paciente.ver_dados_sensiveis",
  );
  const digits = query.replace(/\D/g, "");
  if (canSeeSensitive && digits.length >= 3) {
    filters.push(`cpf.ilike.%${digits}%`);
  }
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("patients")
    .select("id, full_name, social_name, email, phone, whatsapp")
    .eq("organization_id", context.organization.id)
    .is("deleted_at", null)
    .or(filters.join(","))
    .order("full_name")
    .limit(8);

  if (error) {
    return NextResponse.json(
      { error: "Não foi possível buscar pacientes." },
      { status: 500 },
    );
  }

  return NextResponse.json(
    { patients: data ?? [] },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
