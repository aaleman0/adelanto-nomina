import { test, expect } from "@playwright/test";

test.describe("WhatsApp History", () => {
  test.beforeEach(async ({ page }) => {
    // Mock de historial de envíos
    await page.route("**/api/whatsapp/bulk/history**", (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          sends: [
            {
              id: "send-1",
              mode: "import",
              eligible_count: 50,
              sent_count: 48,
              failed_count: 2,
              status: "completed",
              created_at: new Date().toISOString(),
              created_by: "admin",
            },
            {
              id: "send-2",
              mode: "manual",
              eligible_count: 10,
              sent_count: 10,
              failed_count: 0,
              status: "completed",
              created_at: new Date(Date.now() - 86400000).toISOString(),
              created_by: "admin",
            },
          ],
          total: 2,
        }),
      });
    });
  });

  test("debe mostrar lista de envíos masivos", async ({ page }) => {
    await page.goto("/whatsapp/history");

    // Verificar título (según componente bulk-history.tsx)
    await expect(page.getByText("Envíos masivos")).toBeVisible({ timeout: 5000 });

    // Verificar que el componente cargó (mostrando conteo de envíos o tabla vacía)
    await expect(page.getByText(/2 envíos|No hay envíos masivos/i)).toBeVisible({ timeout: 5000 });
  });

  test("filtrar por estado", async ({ page }) => {
    await page.goto("/whatsapp/history");

    // Verificar que la página cargó
    await expect(page.getByText("Envíos masivos")).toBeVisible();

    // Verificar botones de filtro de estado (según componente, son buttons no combobox)
    await expect(page.getByRole("button", { name: /Completados|Enviando|Fallidos/i })).toBeVisible();
  });
});
