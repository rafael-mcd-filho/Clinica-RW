import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value);
          });

          response = NextResponse.next({
            request,
          });

          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    },
  );

  // getClaims valida o JWT localmente (o projeto usa chave assimétrica
  // ES256) e refresca a sessão quando o token está perto de expirar. É
  // aqui, no proxy, que os cookies rotacionados conseguem ser persistidos
  // — Server Components não podem escrever cookies. Evita o round-trip que
  // getUser() faria a cada request.
  const { data: claims } = await supabase.auth.getClaims();

  // Verificação em duas etapas (Raio-X S9): com o fator ativado, a sessão só
  // vale para o sistema depois do código do aplicativo (AAL2). As páginas de
  // entrada, o agendamento público e as APIs com segredo próprio ficam de fora.
  if (claims?.claims && !isMfaExemptPath(request.nextUrl.pathname)) {
    const { data: assurance } =
      await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (assurance?.nextLevel === "aal2" && assurance.currentLevel !== "aal2") {
      const url = request.nextUrl.clone();
      url.pathname = "/login/verificacao";
      url.search = "";
      const redirectResponse = NextResponse.redirect(url);
      response.cookies
        .getAll()
        .forEach((cookie) => redirectResponse.cookies.set(cookie));
      return redirectResponse;
    }
  }

  return response;
}

const mfaExemptPrefixes = [
  "/login",
  "/auth",
  "/esqueci-senha",
  "/redefinir-senha",
  "/agendar",
  "/d",
  "/validar",
  "/api/whatsapp/webhook",
  "/api/jobs",
  "/api/public-booking",
];

function isMfaExemptPath(pathname: string) {
  return mfaExemptPrefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}
