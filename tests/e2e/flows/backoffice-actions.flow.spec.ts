import { expect, test } from "@playwright/test";
import {
  createBackofficeStatusFixture,
  getRequiredSupabaseTestClient,
} from "../helpers/contract-fixtures";

// ---------------------------------------------------------------------------
// Flow E2E: Acciones operativas desde la página de detalle de contrato
// (Regenerar link / Reintentar flujo)
// ---------------------------------------------------------------------------

test("página de detalle muestra acciones operativas para contrato con link expirado", async ({
  page,
}) => {
  const supabase = getRequiredSupabaseTestClient();
  const fixture = await createBackofficeStatusFixture(supabase, "link_expirado");

  // Navegar a la lista filtrando por RFC del fixture
  await page.goto(`/contracts?q=${fixture.rfc}`);
  await expect(
    page.getByRole("heading", { name: "Control de contratos" }).first(),
  ).toBeVisible();

  // Ir al detalle
  await page.getByRole("link", { name: "Ver" }).first().click();
  await expect(page).toHaveURL(/\/contracts\/[a-f0-9-]+/);

  // El bloque "Acciones operativas" debe estar visible
  await expect(
    page.getByRole("heading", { name: "Acciones operativas" }),
  ).toBeVisible();

  // Los botones de acción deben estar presentes
  await expect(
    page.getByRole("button", { name: /Regenerar link/i }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Reintentar flujo/i }),
  ).toBeVisible();
});

test("página de detalle muestra acciones deshabilitadas para contrato firmado", async ({
  page,
}) => {
  const supabase = getRequiredSupabaseTestClient();
  const fixture = await createBackofficeStatusFixture(supabase, "firmado");

  await page.goto(`/contracts?q=${fixture.rfc}`);
  await page.getByRole("link", { name: "Ver" }).first().click();
  await expect(page).toHaveURL(/\/contracts\/[a-f0-9-]+/);

  // Los botones deben existir pero estar deshabilitados
  const regenerarBtn = page.getByRole("button", { name: /Regenerar link/i });
  const reintentarBtn = page.getByRole("button", { name: /Reintentar flujo/i });

  await expect(regenerarBtn).toBeVisible();
  await expect(reintentarBtn).toBeVisible();
  await expect(regenerarBtn).toBeDisabled();
  await expect(reintentarBtn).toBeDisabled();
});

test("acción Regenerar link en contrato expirado redirige con feedback de éxito", async ({
  page,
}) => {
  const supabase = getRequiredSupabaseTestClient();
  const fixture = await createBackofficeStatusFixture(supabase, "link_expirado");

  await page.goto(`/contracts?q=${fixture.rfc}`);
  await page.getByRole("link", { name: "Ver" }).first().click();
  await expect(page).toHaveURL(/\/contracts\/[a-f0-9-]+/);

  // Confirmar diálogo del navegador (window.confirm) y hacer clic en Regenerar
  page.on("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: /Regenerar link/i }).click();

  // Debe redirigir al mismo detalle con query param de feedback
  await page.waitForURL(/\/contracts\/[a-f0-9-]+\?action_status=/);
  const url = page.url();
  expect(url).toMatch(/action_status=(link_regenerated|link_reused)/);

  // El banner de feedback debe mostrarse
  const banner = page.locator("[class*='rounded-base']").filter({
    hasText: /link regenerado|link sigue vigente/i,
  });
  await expect(banner.first()).toBeVisible();
});

test("página de detalle tiene botón Volver a contratos funcional", async ({
  page,
}) => {
  const supabase = getRequiredSupabaseTestClient();
  const fixture = await createBackofficeStatusFixture(supabase, "contrato_generado");

  await page.goto(`/contracts?q=${fixture.rfc}`);
  await page.getByRole("link", { name: "Ver" }).first().click();
  await expect(page).toHaveURL(/\/contracts\/[a-f0-9-]+/);

  const backBtn = page.getByRole("link", { name: "Volver a contratos" });
  await expect(backBtn).toBeVisible();
  await backBtn.click();

  await expect(page).toHaveURL("/contracts");
  await expect(
    page.getByRole("heading", { name: "Control de contratos" }).first(),
  ).toBeVisible();
});
