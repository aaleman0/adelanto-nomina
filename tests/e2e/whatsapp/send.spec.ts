import { test, expect } from "@playwright/test";

test.describe("WhatsApp Send Messages", () => {
  test.beforeEach(async ({ page }) => {
    // Mock de imports recientes
    await page.route("**/api/whatsapp/imports", (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          imports: [
            {
              id: "import-1",
              original_filename: "empleados_mayo.csv",
              row_count: 50,
              applied_at: new Date().toISOString(),
              status: "applied",
            },
          ],
        }),
      });
    });

    // Mock de templates
    await page.route("**/api/whatsapp/templates", (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          templates: [
            {
              id: "template-1",
              name: "contrato_adelanto",
              status: "APPROVED",
              language: "es_MX",
            },
          ],
        }),
      });
    });

    // Mock de validación de elegibilidad
    await page.route("**/api/whatsapp/bulk?action=validate", (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          eligible: 45,
          notEligible: 5,
          employees: [],
        }),
      });
    });
  });

  test("debe mostrar opciones de modo de envío", async ({ page }) => {
    await page.goto("/whatsapp/send");

    // Verificar título
    await expect(page.getByText("Enviar mensajes")).toBeVisible();

    // Verificar tabs de modo (usando getByRole button en lugar de label)
    await expect(page.getByRole("button", { name: /Por Importación/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Por Selección Manual/i })).toBeVisible();
  });

  test("selección de importación muestra lista de imports", async ({ page }) => {
    await page.goto("/whatsapp/send");

    // Esperar a que cargue el componente
    await expect(page.getByText("Seleccionar Importación")).toBeVisible();

    // Verificar que se muestra el select de imports con la opción
    await expect(page.getByText(/empleados_mayo\.csv.*50 filas/i)).toBeVisible();
  });
});
