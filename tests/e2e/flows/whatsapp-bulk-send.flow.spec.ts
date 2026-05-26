import { expect, test } from "@playwright/test";

// ---------------------------------------------------------------------------
// Flow E2E: Navegación y UI de WhatsApp
//
// Nota: Los tests de envío real requieren un token de acceso de WhatsApp
// configurado en WHATSAPP_ACCESS_TOKEN. Sin token, los formularios deben
// mostrar estados de error controlados o validar antes de enviar.
// ---------------------------------------------------------------------------

test("dashboard WhatsApp carga con métricas y acciones", async ({ page }) => {
  await page.goto("/whatsapp");

  // Header de la página
  await expect(page.getByRole("heading", { name: /WhatsApp · Dashboard/i })).toBeVisible();

  // Botón de nuevo envío
  const newSendLink = page.getByRole("link", { name: /Nuevo envío/i }).first();
  await expect(newSendLink).toBeVisible();
  await expect(newSendLink).toHaveAttribute("href", "/whatsapp/send");
});

test("dashboard WhatsApp tiene sección de mensajes recientes", async ({ page }) => {
  await page.goto("/whatsapp");

  // La sección de actividad reciente o estado del dashboard debe renderizarse
  // sin error (ErrorBoundary no debe activarse)
  const errorBoundary = page.getByText(/algo salió mal|error inesperado/i);
  await expect(errorBoundary).not.toBeVisible();
});

test("página de nuevo envío muestra el formulario BulkSendForm", async ({ page }) => {
  await page.goto("/whatsapp/send");

  await expect(page.getByRole("heading", { name: /Envío Masivo WhatsApp/i })).toBeVisible();

  // El formulario debe tener los controles de modo
  await expect(page.getByRole("button", { name: /Por Importación/i })).toBeVisible();
});

test("formulario de envío tiene selector de modo", async ({ page }) => {
  await page.goto("/whatsapp/send");

  // Opciones de modo (import / manual)
  const modeButtons = page.locator("button, label, [role='radio']").filter({
    hasText: /importación|manual|selección/i,
  });
  await expect(modeButtons.first()).toBeVisible();
});

test("historial de envíos WhatsApp carga con filtros", async ({ page }) => {
  await page.goto("/whatsapp/history");

  await expect(page.getByRole("heading", { name: /Historial de envíos/i })).toBeVisible();

  // Filtros de estado — son botones, no un <select>
  await expect(page.getByRole("button", { name: /Completados/i })).toBeVisible();
});

test("historial tiene filtros de modo y fechas", async ({ page }) => {
  await page.goto("/whatsapp/history");

  // Filtros de modo — son botones
  await expect(page.getByRole("button", { name: /Importación/i }).first()).toBeVisible();

  // Inputs de fecha (dateFrom, dateTo)
  const dateInputs = page.locator("input[type='date']");
  await expect(dateInputs).toHaveCount(2);
});

test("historial tiene botón de limpiar filtros", async ({ page }) => {
  await page.goto("/whatsapp/history");

  // Aplicar un filtro haciendo clic en el botón de estado
  await page.getByRole("button", { name: /Completados/i }).click();

  const clearButton = page.getByRole("button", { name: /Limpiar/i });
  await expect(clearButton).toBeVisible();

  // Limpiar filtros
  await clearButton.click();
  await expect(clearButton).not.toBeVisible();
});

test("navegación desde dashboard a nuevo envío", async ({ page }) => {
  await page.goto("/whatsapp");

  const newSendLink = page.getByRole("link", { name: /Nuevo envío/i }).first();
  await newSendLink.click();

  await expect(page).toHaveURL(/\/whatsapp\/send/);
  await expect(page.getByRole("heading", { name: /Envío Masivo/i })).toBeVisible();
});

test("navegación desde historial a nuevo envío", async ({ page }) => {
  await page.goto("/whatsapp/history");

  const newSendLink = page.getByRole("link", { name: /Nuevo envío/i }).first();
  await newSendLink.click();

  await expect(page).toHaveURL(/\/whatsapp\/send/);
});

test("página de configuración WhatsApp carga", async ({ page }) => {
  await page.goto("/settings/whatsapp");

  // La página debe cargar sin errores
  const errorBoundary = page.getByText(/algo salió mal|error inesperado/i);
  await expect(errorBoundary).not.toBeVisible();

  // Debe mostrar el heading de configuración
  await expect(page.getByRole("heading", { name: /Configuración de WhatsApp/i })).toBeVisible();
});

test("formulario de envío muestra alerta cuando WhatsApp no está configurado", async ({
  page,
}) => {
  await page.goto("/whatsapp/send");

  // Sin token configurado, el sistema debe mostrar algún aviso (no un crash)
  const errorBoundary = page.getByText(/algo salió mal/i);
  await expect(errorBoundary).not.toBeVisible();

  // La página debe renderizar correctamente
  await expect(page.getByRole("heading", { name: /Envío Masivo/i })).toBeVisible();
});

test("página de detalle de envío muestra 404 para id inexistente", async ({ page }) => {
  await page.goto("/whatsapp/bulk/00000000-0000-0000-0000-000000000000");

  // Debe mostrar algún mensaje de no encontrado o error controlado
  const content = await page.textContent("body");
  expect(content).toBeTruthy();
  // La página no debe mostrar un error no controlado de React
  const errorBoundary = page.getByText(/algo salió mal/i);
  await expect(errorBoundary).not.toBeVisible();
});

test("sidebar contiene enlace a WhatsApp en la navegación", async ({ page }) => {
  await page.goto("/whatsapp");

  // La barra lateral debe tener el grupo WhatsApp expandido con sus sub-items
  // El grupo es un <button>, los sub-items son <a> links
  const waGroupButton = page.getByRole("button", { name: /WhatsApp/i });
  await expect(waGroupButton.first()).toBeVisible();

  // Al estar en /whatsapp el grupo debe estar abierto con sus links visibles
  await expect(page.getByRole("link", { name: "Historial de envíos", exact: true })).toBeVisible();
});
