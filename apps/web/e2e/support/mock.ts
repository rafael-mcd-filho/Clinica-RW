import type { BrowserContext } from "@playwright/test";

export const mockUrl = `http://127.0.0.1:${process.env.MOCK_SUPABASE_PORT ?? 54321}`;

const serviceHeaders = {
  apikey: "mock-service",
  Authorization: "Bearer mock-service",
  "Content-Type": "application/json",
};

/** Entra como a usuária administradora da clínica fictícia. */
export async function signIn(context: BrowserContext) {
  const response = await fetch(`${mockUrl}/__session`);
  const { session, cookieName } = (await response.json()) as {
    session: unknown;
    cookieName: string;
  };
  const value = `base64-${Buffer.from(JSON.stringify(session)).toString("base64url")}`;
  await context.addCookies([
    { name: cookieName, value, domain: "localhost", path: "/" },
  ]);
}

/** Lê linhas do mock (como o PostgREST, com filtros na query). */
export async function selectRows<T>(table: string, query: string) {
  const response = await fetch(`${mockUrl}/rest/v1/${table}?${query}`, {
    headers: serviceHeaders,
  });
  return (await response.json()) as T[];
}

/** Altera linhas do mock para montar o cenário de uma jornada. */
export async function updateRows(
  table: string,
  filter: string,
  values: Record<string, unknown>,
) {
  await fetch(`${mockUrl}/rest/v1/${table}?${filter}`, {
    method: "PATCH",
    headers: serviceHeaders,
    body: JSON.stringify(values),
  });
}
