import { test, expect } from "@playwright/test";

test.describe("WhatsApp Dashboard", () => {
  test.beforeEach(async ({ page }) => {
    // Mock API de stats con delay para simular loading
    await page.route("**/api/whatsapp/stats", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          stats: {
            sentToday: 150,
            deliveryRate: 0.95,
            errorsToday: 5,
            totalDelivered: 1000,
          },
          recent: [
            {
              id: "msg-1",
              employee_id: "emp-1",
              nombre: "Juan",
              apellidos: "Pérez",
              rfc: "ABC123",
              message_type: "contract_offer",
              delivery_status: "delivered",
              created_at: new Date().toISOString(),
              error_message: null,
            },
          ],
        }),
      });
    });
  });

  test("debe mostrar métricas del dashboard", async ({ page }) => {
    await page.goto("/whatsapp");

    // Verificar que la página cargó
    await expect(page.getByText("WhatsApp · Dashboard")).toBeVisible();

    // Esperar a que carguen las métricas (no el estado de loading)
    await expect(page.getByText("150")).toBeVisible({ timeout: 5000 });

    // Botón de nuevo envío
    await expect(page.getByRole("link", { name: /Nuevo envío/i })).toBeVisible();
  });

  test("navegación a página de envío", async ({ page }) => {
    await page.goto("/whatsapp");

    // Click en "Nuevo envío"
    await page.getByRole("link", { name: /Nuevo envío/i }).click();

    // Verificar navegación
    await expect(page).toHaveURL(/.*\/whatsapp\/send/);
    await expect(page.getByText("Enviar mensajes")).toBeVisible();
  });
});
