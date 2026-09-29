import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  // Evita open redirect: `new URL(next, origin)` seguiria uma URL absoluta
  // externa (?next=https://evil.com) ou protocol-relative (//evil.com).
  // Só aceitamos caminho interno começando com "/" e não "//".
  const nextParam = searchParams.get("next") ?? "/dashboard";
  const nextUrl = new URL(nextParam, origin);
  const next =
    nextParam.startsWith("/") &&
    !nextParam.startsWith("//") &&
    nextUrl.origin === origin
      ? nextParam
      : "/dashboard";

  if (code) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      return NextResponse.redirect(
        new URL(
          next === "/redefinir-senha"
            ? "/esqueci-senha?erro=link-invalido"
            : "/login",
          origin,
        ),
      );
    }
  } else if (next === "/redefinir-senha") {
    return NextResponse.redirect(
      new URL("/esqueci-senha?erro=link-invalido", origin),
    );
  }

  return NextResponse.redirect(new URL(next, origin));
}
