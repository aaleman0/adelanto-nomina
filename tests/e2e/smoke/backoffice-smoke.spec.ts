import { expect, test } from "@playwright/test";

/**
 * Smoke: comprueba que las pantallas principales cargan autenticadas y con su
 * estructura básica.
 *
 * Las aserciones se apoyan en el encabezado de la página y en la navegación,
 * no en nombres de columna concretos: el contenido de las tablas depende de
 * los datos y cambia con cada rediseño, lo que convertía estas pruebas en un
 * falso negativo permanente.
 */

test("backoffice carga la vista de operación", async ({ page }) => {
  await page.goto("/");

  // Si el proxy redirigiera por falta de sesión, acabaríamos en /login.
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { name: "Operación", exact: true })).toBeVisible();
  // El rediseño por flujo: embudo arriba + cola de acción abajo.
  await expect(page.getByText("Embudo de conversión")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Requieren acción" })).toBeVisible();
});

test("backoffice carga control de contratos", async ({ page }) => {
  await page.goto("/contracts");

  await expect(page).toHaveURL(/\/contracts/);
  await expect(page.getByRole("heading", { name: "Contratos", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Buscar contratos" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Expedientes" })).toBeVisible();
});

test("la navegación principal está disponible", async ({ page }) => {
  await page.goto("/");

  // Se comprueban destinos, no etiquetas: el texto de la barra lateral se
  // oculta al colapsarla, y WhatsApp es un grupo desplegable, no un enlace.
  for (const href of ["/", "/imports", "/contracts", "/settings"]) {
    await expect(page.locator(`a[href="${href}"]`).first()).toBeAttached();
  }
});
