import { NextResponse } from "next/server";
import { getRequestContext, hasAnyPermission } from "@/lib/auth/context";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const context = await getRequestContext();
  if (
    !context.organization ||
    !hasAnyPermission(context.permissionCodes, [
      "paciente.ver",
      "clinico.ver_prontuario",
      "clinico.ver_prontuario_proprios",
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

  const canSeeSensitive = context.permissionCodes.has(
    "paciente.ver_dados_sensiveis",
  );
  const digits = query.replace(/\D/g, "");
  const filters = [
    `full_name.ilike.%${query}%`,
    `social_name.ilike.%${query}%`,
    `email.ilike.%${query}%`,
  ];
  // Telefone e CPF são gravados só com dígitos, então uma busca digitada com
  // máscara ("(84) 99646-3570", "107.035.474-02") precisa ser comparada pelos
  // dígitos — senão nunca casa.
  if (digits.length >= 3) {
    filters.push(`phone.ilike.%${digits}%`, `whatsapp.ilike.%${digits}%`);
    if (canSeeSensitive) {
      filters.push(`cpf.ilike.%${digits}%`);
    }
  } else {
    filters.push(`phone.ilike.%${query}%`, `whatsapp.ilike.%${query}%`);
  }
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("patients")
    .select(
      canSeeSensitive
        ? "id, full_name, social_name, cpf, email, phone, whatsapp"
        : "id, full_name, social_name, email, phone, whatsapp",
    )
    .eq("organization_id", context.organization.id)
    .is("deleted_at", null)
    .is("deceased_at", null)
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
