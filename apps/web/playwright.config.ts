import { defineConfig } from "@playwright/test";

/**
 * Testes de tela e jornadas (Raio-X EN6 e B4) contra o Supabase falso de
 * e2e/fixtures. Rode `npm run test:e2e` depois de um build feito com as
 * variáveis do mock (o CI faz isso no job "e2e"):
 *
 *   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 \
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY=mock-anon npm run build
 */
const port = Number(process.env.E2E_PORT ?? 3100);
const mockPort = Number(process.env.MOCK_SUPABASE_PORT ?? 54321);
const mockUrl = `http://127.0.0.1:${mockPort}`;

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI
    ? [["github"], ["html", { open: "never" }]]
    : [["list"]],
  use: {
    baseURL: `http://localhost:${port}`,
    locale: "pt-BR",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: process.env.PW_CHROMIUM_PATH
      ? { executablePath: process.env.PW_CHROMIUM_PATH }
      : undefined,
  },
  webServer: [
    {
      command: "node e2e/fixtures/mock-supabase.mjs",
      url: `${mockUrl}/__session`,
      reuseExistingServer: !process.env.CI,
      env: { MOCK_SUPABASE_PORT: String(mockPort) },
    },
    {
      command: `npx next start -p ${port}`,
      url: `http://localhost:${port}/login`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        NEXT_TELEMETRY_DISABLED: "1",
        NEXT_PUBLIC_SUPABASE_URL: mockUrl,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "mock-anon",
        SUPABASE_SERVICE_ROLE_KEY: "mock-service",
        WHATSAPP_CREDENTIALS_ENCRYPTION_KEY: "mock-key",
        NEXT_PUBLIC_APP_URL: `http://localhost:${port}`,
      },
    },
  ],
});
