import { expect, test } from "@playwright/test";
import { selectRows, signIn } from "./support/mock";

/**
 * Raio-X B4: nenhuma tela pode rolar na horizontal no celular (390 px) nem
 * nas larguras comuns de notebook (1280 e 1440 px).
 */
const routes = [
  "/dashboard",
  "/agenda?view=day",
  "/agenda?view=week",
  "/agenda?view=month",
  "/pacientes",
  "/pacientes/{patient}",
  "/prontuario",
  "/prontuario/{encounter}",
  "/atendimento",
  "/financeiro",
  "/financeiro/contas-a-receber",
  "/financeiro/movimentacoes",
  "/financeiro/contas-a-pagar",
  "/financeiro/repasses",
  "/financeiro/dre",
  "/relatorios",
  "/relatorios/agendamentos",
  "/relatorios/comissoes",
  "/auditoria",
  "/configuracoes",
  "/configuracoes/cadastros",
  "/configuracoes/agenda",
  "/configuracoes/agendamento-online",
  "/configuracoes/usuarios-acessos",
  "/configuracoes/mensagens",
  "/configuracoes/modelos-clinicos",
  "/perfil",
  "/agendar/clinica-aurora",
];

const viewports = [
  { name: "celular", width: 390, height: 844, isMobile: true },
  { name: "notebook", width: 1280, height: 800, isMobile: false },
  { name: "desktop", width: 1440, height: 900, isMobile: false },
];

for (const viewport of viewports) {
  test.describe(`sem rolagem horizontal (${viewport.name}, ${viewport.width}px)`, () => {
    test.use({
      viewport: { width: viewport.width, height: viewport.height },
      isMobile: viewport.isMobile,
      hasTouch: viewport.isMobile,
    });

    let ids: Record<string, string> = {};
    test.beforeAll(async () => {
      const [patient] = await selectRows<{ id: string }>(
        "patients",
        "select=id&limit=1",
      );
      const [encounter] = await selectRows<{ id: string }>(
        "encounters",
        "select=id&order=started_at.desc&limit=1",
      );
      ids = { patient: patient.id, encounter: encounter.id };
    });

    for (const route of routes) {
      test(route, async ({ context, page }) => {
        await signIn(context);
        const errors: string[] = [];
        page.on("pageerror", (error) => errors.push(error.message));
        const url = route.replace(/\{(\w+)\}/g, (_, key: string) => ids[key]);
        const response = await page.goto(url, { waitUntil: "load" });
        expect(response?.status() ?? 0).toBeLessThan(400);
        await page.waitForTimeout(500);
        // Algumas rotas redirecionam depois de carregar (ex.: /relatorios):
        // mede de novo quando a navegação troca a página no meio.
        let overflow = 0;
        for (let attempt = 0; attempt < 3; attempt += 1) {
          try {
            await page.waitForLoadState("load");
            overflow = await page.evaluate(
              () =>
                document.documentElement.scrollWidth -
                document.documentElement.clientWidth,
            );
            break;
          } catch (error) {
            if (attempt === 2) throw error;
            await page.waitForTimeout(500);
          }
        }
        expect(overflow, "a página rola na horizontal").toBeLessThanOrEqual(1);
        expect(errors, "erros de JavaScript na página").toEqual([]);
      });
    }
  });
}
