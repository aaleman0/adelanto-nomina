import { expect, test } from "@playwright/test";
import {
  createBackofficeStatusFixture,
  getRequiredSupabaseTestClient,
} from "../helpers/contract-fixtures";

test("navegacion desde dashboard a control de contratos", async ({ page }) => {
  await page.goto("/");

  // Verificar que el dashboard carga correctamente
  await expect(page.getByRole("heading", { name: "Dashboard operativo" })).toBeVisible();

  // Verificar que las secciones del dashboard son visibles
  await expect(page.getByRole("heading", { name: "Atención requerida" })).toBeVisible();

  // Verificar que no hay errores de red
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      errors.push(msg.text());
    }
  });

  await page.waitForLoadState("networkidle");
  expect(errors.length).toBe(0);
});

test("navegacion desde control de contratos a ver detalle", async ({ page }) => {
  const supabase = getRequiredSupabaseTestClient();
  const fixture = await createBackofficeStatusFixture(supabase, "pendiente_envio");

  await page.goto(`/contracts?q=${fixture.rfc}`);

  // Verificar que la tabla de contratos carga
  await expect(page.getByRole("heading", { name: "Control de contratos" }).first()).toBeVisible();
  await expect(page.getByText(fixture.rfc).first()).toBeVisible();

  // Verificar que no hay errores de red antes de interactuar
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      errors.push(msg.text());
    }
  });

  // Localizar el primer botón "Ver"
  const detailButton = page.getByRole("link", { name: "Ver" }).first();
  await expect(detailButton).toBeVisible();

  // Hacer clic en "Ver detalle"
  await detailButton.click();

  // Verificar que navega a la página de detalle
  await expect(page).toHaveURL(/\/contracts\/[a-f0-9-]+/);
  await expect(page.getByText("Detalle operativo").first()).toBeVisible();

  // Verificar que no hay errores de red después de la navegación
  await page.waitForLoadState("networkidle");
  expect(errors.length).toBe(0);
});

test("navegacion de regreso desde detalle a contratos", async ({ page }) => {
  const supabase = getRequiredSupabaseTestClient();
  const fixture = await createBackofficeStatusFixture(supabase, "pendiente_envio");

  await page.goto(`/contracts?q=${fixture.rfc}`);

  // Navegar a la página de detalle
  const detailButton = page.getByRole("link", { name: "Ver" }).first();
  await detailButton.click();
  await expect(page.getByText("Detalle operativo").first()).toBeVisible();

  // Verificar que no hay errores de red antes de navegar de regreso
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      errors.push(msg.text());
    }
  });

  // Hacer clic en el botón "Volver a contratos"
  const backButton = page.getByRole("link", { name: "Volver a contratos" });
  await expect(backButton).toBeVisible();
  await backButton.click();

  // Verificar que navega de regreso a la lista de contratos
  await expect(page).toHaveURL("/contracts");
  await expect(page.getByRole("heading", { name: "Control de contratos" }).first()).toBeVisible();

  // Verificar que no hay errores de red después de la navegación de regreso
  await page.waitForLoadState("networkidle");
  expect(errors.length).toBe(0);
});
