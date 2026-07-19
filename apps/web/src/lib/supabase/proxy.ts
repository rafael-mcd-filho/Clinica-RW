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
  await supabase.auth.getClaims();

  return response;
}
