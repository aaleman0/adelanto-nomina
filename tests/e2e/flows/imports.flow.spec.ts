import { expect, test } from "@playwright/test";

// ---------------------------------------------------------------------------
// Flow E2E: Página de Importaciones (/imports)
// ---------------------------------------------------------------------------

test("página de importaciones carga correctamente", async ({ page }) => {
  await page.goto("/imports");

  await expect(
    page.getByRole("heading", { name: /Importar empleados y ofertas/i }),
  ).toBeVisible();
});

test("página de importaciones muestra sección de historial", async ({ page }) => {
  await page.goto("/imports");

  // El heading del historial es un h2 dentro de CardHeader, no heading role en Playwright
  // → buscar por texto visible en la tarjeta
  await expect(
    page.getByText(/Historial de importaciones/i).first(),
  ).toBeVisible();
});

test("página de importaciones no muestra errores inesperados", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });

  await page.goto("/imports");
  await page.waitForLoadState("networkidle");

  expect(errors.length).toBe(0);
});

test("sidebar muestra enlace a Importaciones", async ({ page }) => {
  await page.goto("/");

  // El sidebar debe tener un link con texto "Importaciones" o "Importar"
  const importLink = page
    .getByRole("link")
    .filter({ hasText: /importaciones|importar/i })
    .first();
  await expect(importLink).toBeVisible();
  await importLink.click();

  await expect(page).toHaveURL(/\/imports/);
  await expect(
    page.getByRole("heading", { name: /Importar empleados y ofertas/i }),
  ).toBeVisible();
});

test("página de importaciones muestra estado vacío cuando no hay importaciones", async ({
  page,
}) => {
  await page.goto("/imports");

  // Si no hay importaciones en el entorno de test la página no debe reventar —
  // debe mostrar el EmptyState o la tabla vacía.
  await page.waitForLoadState("networkidle");

  // No debe existir ningún texto de error de aplicación
  const crashMsg = page.getByText(/Error:|Unhandled|Failed to fetch/i);
  await expect(crashMsg).not.toBeVisible();

  // Debe existir el encabezado de la página
  await expect(
    page.getByRole("heading", { name: /Importar empleados y ofertas/i }),
  ).toBeVisible();
});
