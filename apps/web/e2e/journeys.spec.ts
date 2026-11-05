import { expect, test, type Page } from "@playwright/test";
import { createDocumentVerificationCode } from "../src/lib/clinical/document-verification";
import { selectRows, signIn, updateRows } from "./support/mock";

/**
 * Raio-X EN6: as jornadas do dia a dia, ponta a ponta na interface, contra o
 * Supabase falso. Regras de permissão e do banco são cobertas pelos testes
 * SQL (supabase test db).
 */

async function nextScheduledDay() {
  const [settings] = await selectRows<{ timezone: string }>(
    "organization_settings",
    "select=timezone&limit=1",
  );
  const [appointment] = await selectRows<{ start_at: string }>(
    "appointments",
    `select=start_at&status=eq.scheduled&start_at=gte.${new Date().toISOString()}&order=start_at.asc&limit=1`,
  );
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: settings.timezone,
  }).format(new Date(appointment.start_at));
}

async function openAgendaDay(page: Page, date: string) {
  await page.goto(`/agenda?date=${date}&view=day`);
  await expect(
    page
      .getByRole("radiogroup", { name: "Organizar o dia por" })
      .or(page.getByRole("button", { name: "Hoje" }))
      .first(),
  ).toBeVisible();
}

/** Repete a ação até ela surtir efeito: o primeiro clique pode chegar antes
    de a página terminar de hidratar. */
async function untilDone(
  action: () => Promise<void>,
  done: () => Promise<void>,
) {
  await expect(async () => {
    await action();
    await done();
  }).toPass({ timeout: 20_000 });
}

test.beforeEach(async ({ context }) => {
  await signIn(context);
});

test("agenda: abre o agendamento e mostra os detalhes", async ({ page }) => {
  await openAgendaDay(page, await nextScheduledDay());
  const dialog = page.getByRole("dialog", { name: "Detalhes do agendamento" });
  await untilDone(
    () =>
      page.locator('[role="button"][aria-label*="Agendado"]').first().click(),
    () => expect(dialog).toBeVisible({ timeout: 2_000 }),
  );
  await expect(dialog.getByText("Resumo do atendimento")).toBeVisible();
});

test("agenda: envia os lembretes do dia de uma vez", async ({ page }) => {
  await openAgendaDay(page, await nextScheduledDay());
  const dialog = page.getByRole("dialog", { name: /Enviar lembretes de/ });
  await untilDone(
    () => page.getByRole("button", { name: "Enviar lembretes" }).click(),
    () => expect(dialog).toBeVisible({ timeout: 2_000 }),
  );
  const confirm = dialog.getByRole("button", { name: "Enviar lembretes" });
  if (await confirm.isEnabled()) {
    await confirm.click();
    await expect(
      page.getByText(/entr(ou|aram) na fila de envio|já receberam o lembrete/),
    ).toBeVisible();
  } else {
    await expect(dialog.getByText(/já receb/)).toBeVisible();
  }
});

test("prontuário: escreve no atendimento em andamento", async ({ page }) => {
  const [encounter] = await selectRows<{ id: string }>(
    "encounters",
    "select=id&order=started_at.desc&limit=1",
  );
  await updateRows("encounters", `id=eq.${encounter.id}`, {
    status: "draft",
    finalized_at: null,
  });
  await page.goto(`/prontuario/${encounter.id}`);
  const editor = page.locator(".ProseMirror").first();
  await expect(editor).toBeVisible();
  await untilDone(
    async () => {
      await editor.click();
      await page.keyboard.press("End");
      await page.keyboard.type(" Paciente refere melhora.");
    },
    () =>
      expect(editor).toContainText("Paciente refere melhora.", {
        timeout: 2_000,
      }),
  );
});

test("financeiro: cobra uma conta por Pix", async ({ page }) => {
  await updateRows("payment_methods", "method_type=eq.pix", {
    pix_key: "11222333000181",
    pix_key_type: "cnpj",
  });
  await page.goto("/financeiro/contas-a-receber");
  const triggers = page.locator('button[aria-label^="Ver detalhes"]');
  await untilDone(
    () => triggers.first().click(),
    () =>
      expect(page.getByRole("dialog").first()).toBeVisible({ timeout: 2_000 }),
  );
  await page.keyboard.press("Escape");
  const charge = page.getByRole("button", { name: "Cobrar por Pix" });
  for (let index = 0; index < 20; index += 1) {
    await triggers.nth(index).click();
    await expect(page.getByRole("dialog").first()).toBeVisible();
    await page.waitForTimeout(400);
    if (await charge.isVisible()) break;
    await page.keyboard.press("Escape");
  }
  await charge.click();
  const dialog = page.getByRole("dialog", { name: "Cobrar por Pix" });
  await expect(dialog.getByRole("img", { name: /QR Code Pix/ })).toBeVisible();
  await expect(
    dialog.getByRole("textbox", { name: "Pix copia e cola" }),
  ).toHaveValue(/^000201.*br\.gov\.bcb\.pix.*6304[0-9A-F]{4}$/);
});

test("documento: o QR leva à página de conferência", async ({ page }) => {
  process.env.SUPABASE_SERVICE_ROLE_KEY ??= "mock-service";
  const [document] = await selectRows<{ id: string }>(
    "clinical_documents",
    "select=id&document_type=eq.exam_request&limit=1",
  );
  await page.goto(`/validar/${createDocumentVerificationCode(document.id)}`);
  await expect(
    page.getByRole("heading", { name: "Documento emitido pela clínica" }),
  ).toBeVisible();
  await page.goto(`/validar/${createDocumentVerificationCode(document.id)}x`);
  await expect(
    page.getByRole("heading", { name: "Não encontramos este documento" }),
  ).toBeVisible();
});

test("agendamento online: a página pública abre com os profissionais", async ({
  page,
}) => {
  await page.goto("/agendar/clinica-aurora");
  await expect(page.getByText("Dra. Helena Prado").first()).toBeVisible();
});
