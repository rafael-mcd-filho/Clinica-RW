import { NextResponse } from "next/server";
import { getRequestContext, hasAnyPermission } from "@/lib/auth/context";
import { normalizeCidQuery, type Cid10SearchItem } from "@/lib/clinical/cid10";
import { databaseErrorMessage } from "@/lib/errors/database";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Busca na tabela CID-10 por código (com ou sem ponto) ou descrição. */
export async function GET(request: Request) {
  const context = await getRequestContext();
  if (
    !context.organization ||
    !hasAnyPermission(context.permissionCodes, [
      "clinico.preencher_prontuario",
      "clinico.ver_prontuario",
      "clinico.ver_prontuario_proprios",
    ])
  ) {
    return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
  }

  const query = normalizeCidQuery(new URL(request.url).searchParams.get("q"));
  if (query.length < 2) {
    return NextResponse.json(
      { items: [] },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("search_cid10", {
    p_query: query,
    p_limit: 20,
  });
  if (error) {
    return NextResponse.json(
      {
        items: [],
        error: databaseErrorMessage(error, "Não foi possível buscar o CID."),
      },
      { status: 500 },
    );
  }

  return NextResponse.json(
    { items: (data ?? []) as Cid10SearchItem[] },
    // A tabela é referência fixa: a mesma busca pode ser reaproveitada.
    { headers: { "Cache-Control": "private, max-age=300" } },
  );
}
