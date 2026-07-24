import { expect, test } from "@playwright/test";
import { findEligibleContractFixture } from "../helpers/supabase";

// ---------------------------------------------------------------------------
// Flow E2E: Navegación y UI de WhatsApp (rediseño por flujo)
//
// Cubre las cuatro pantallas del área de mensajería y la navegación entre
// ellas:
//   - /whatsapp          → dashboard con actividad reciente
//   - /whatsapp/send     → asistente guiado de 4 pasos (GuidedSendFlow)
//   - /whatsapp/history  → historial de envíos masivos con filtros
//   - /settings/whatsapp → conexión (admin)
//
// La autenticación es automática: el proyecto `setup` deja el storageState y
// el fixture `page` ya viaja autenticado como admin. No se hace login manual.
//
// Los selectores se apoyan en roles/encabezados/placeholders estables, no en
// nombres de columna ni textos dependientes de datos. Los casos que requieren
// datos reales (empleados elegibles) se protegen con `test.skip`.
//
// IMPORTANTE: no se dispara ningún envío real. El asistente se recorre hasta el
// paso de Confirmación, pero nunca se pulsa "Enviar mensajes".
// ---------------------------------------------------------------------------

const DUMMY_EMPLOYEE_ID = "00000000-0000-0000-0000-000000000000";

// El asistente puede quedar bloqueado en el paso 2 si la plantilla por defecto
// (adelanto_nomina_v2) no está aprobada por Meta: MessageTemplateStep deshabilita
// "Siguiente" en ese caso. Es una dependencia de datos del entorno, así que se
// omite el resto del test en lugar de fallar en duro.
const TEMPLATE_NOT_APPROVED = "La plantilla por defecto no está aprobada para envío en este entorno.";

// ── Dashboard /whatsapp ──────────────────────────────────────────────────────

test("dashboard WhatsApp carga con encabezado y acción de nuevo envío", async ({ page }) => {
  await page.goto("/whatsapp");

  // El PageHeader del rediseño pinta el título como un <h1> escueto "WhatsApp".
  await expect(page.getByRole("heading", { name: "WhatsApp", exact: true })).toBeVisible();

  // La barra lateral y el header aportan enlaces "Nuevo envío" hacia el asistente.
  const nuevoEnvio = page.getByRole("link", { name: "Nuevo envío" }).first();
  await expect(nuevoEnvio).toBeVisible();
  await expect(nuevoEnvio).toHaveAttribute("href", "/whatsapp/send");
});

test("dashboard WhatsApp muestra la actividad reciente sin errores", async ({ page }) => {
  await page.goto("/whatsapp");

  // El límite de error del segmento (/whatsapp/error.tsx) no debe activarse.
  await expect(page.getByText("Error en la sección de WhatsApp")).not.toBeVisible();

  // Sección de actividad reciente y su enlace al historial completo.
  await expect(page.getByRole("heading", { name: "Actividad reciente" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Ver historial completo" })).toBeVisible();

  // Tolerante a datos: aparece la cabecera de la tabla o el estado vacío.
  await expect(
    page.getByText(/Todavía no hay envíos|Empleado/i).first(),
  ).toBeVisible();
});

// ── Asistente /whatsapp/send ─────────────────────────────────────────────────

test("nuevo envío muestra el asistente de 4 pasos en Destinatarios", async ({ page }) => {
  await page.goto("/whatsapp/send");

  // Encabezado de la página (ya no dice "Envío Masivo WhatsApp").
  await expect(page.getByRole("heading", { name: "Enviar mensajes", exact: true })).toBeVisible();

  // Indicador de pasos: arranca en el paso 1 "Destinatarios".
  await expect(page.getByText(/Paso 1 de 4/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Destinatarios" })).toBeVisible();

  // Los dos modos del primer paso (RecipientStep).
  await expect(page.getByRole("button", { name: "Importación", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Manual", exact: true })).toBeVisible();
});

test("el modo Manual descubre el textarea de IDs y el buscador de prueba", async ({ page }) => {
  await page.goto("/whatsapp/send");

  await page.getByRole("button", { name: "Manual", exact: true }).click();

  // Textarea para pegar UUIDs de empleados.
  await expect(page.getByPlaceholder("uuid-empleado-1, uuid-empleado-2")).toBeVisible();

  // Bloque de envío de prueba con su buscador de empleados.
  await expect(page.getByText("Envío de prueba")).toBeVisible();
  await expect(page.getByPlaceholder("Buscar por nombre, RFC o teléfono...")).toBeVisible();
});

test("el asistente avanza de Destinatarios a Mensaje y luego a Revisión", async ({ page }) => {
  await page.goto("/whatsapp/send");

  // En modo Manual basta con un ID para habilitar "Siguiente". Se usa un UUID
  // inexistente: alcanza para recorrer la estructura del asistente sin que haya
  // nadie elegible (por tanto sin posibilidad de un envío real).
  await page.getByRole("button", { name: "Manual", exact: true }).click();
  await page
    .getByPlaceholder("uuid-empleado-1, uuid-empleado-2")
    .fill(DUMMY_EMPLOYEE_ID);

  const siguientePaso1 = page.getByRole("button", { name: "Siguiente", exact: true });
  await expect(siguientePaso1).toBeEnabled();
  await siguientePaso1.click();

  // Paso 2 "Mensaje": plantilla por defecto y controles de navegación.
  await expect(page.getByText(/Paso 2 de 4/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Mensaje", exact: true })).toBeVisible();
  await expect(page.getByText(/adelanto_nomina_v2/).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Volver", exact: true })).toBeVisible();

  // Paso 2 → Paso 3. Si la plantilla por defecto no está aprobada, "Siguiente"
  // queda deshabilitado: es una dependencia de datos, así que se omite el resto.
  const siguientePaso2 = page.getByRole("button", { name: "Siguiente", exact: true });
  test.skip(!(await siguientePaso2.isEnabled()), TEMPLATE_NOT_APPROVED);
  await siguientePaso2.click();

  // Paso 3 "Revisión": corre la validación de elegibilidad. Aserción tolerante
  // a los estados posibles (cargando, resumen, vacío o error controlado).
  await expect(page.getByText(/Paso 3 de 4/)).toBeVisible();
  await expect(
    page
      .getByText(/Verificando destinatarios|Total|No hay empleados elegibles|Reintentar/i)
      .first(),
  ).toBeVisible();
});

test("el asistente permite regresar de Mensaje a Destinatarios", async ({ page }) => {
  await page.goto("/whatsapp/send");

  await page.getByRole("button", { name: "Manual", exact: true }).click();
  await page
    .getByPlaceholder("uuid-empleado-1, uuid-empleado-2")
    .fill(DUMMY_EMPLOYEE_ID);
  await page.getByRole("button", { name: "Siguiente", exact: true }).click();

  await expect(page.getByText(/Paso 2 de 4/)).toBeVisible();

  // "Volver" regresa al primer paso con los modos otra vez visibles.
  await page.getByRole("button", { name: "Volver", exact: true }).click();
  await expect(page.getByText(/Paso 1 de 4/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Manual", exact: true })).toBeVisible();
});

test("el asistente llega hasta Confirmación con un empleado elegible", async ({ page }) => {
  const fixture = await findEligibleContractFixture();

  test.skip(!fixture, "Supabase no configurado o sin contrato elegible — test omitido.");
  if (!fixture) return;

  await page.goto("/whatsapp/send");

  // Se usa el buscador de "Envío de prueba" para seleccionar a un empleado real
  // por su RFC. Al elegirlo, el asistente lo carga como destinatario.
  await page.getByRole("button", { name: "Manual", exact: true }).click();
  await page.getByPlaceholder("Buscar por nombre, RFC o teléfono...").fill(fixture.rfc);

  // Los resultados se pintan como <ul><li><button> en el dropdown del buscador.
  const primerResultado = page.locator("ul li button").first();
  try {
    await expect(primerResultado).toBeVisible({ timeout: 5_000 });
  } catch {
    test.skip(true, "El buscador de empleados no devolvió resultados para el fixture.");
    return;
  }
  await primerResultado.click();

  // Paso 1 → Paso 2.
  await page.getByRole("button", { name: "Siguiente", exact: true }).click();
  await expect(page.getByText(/Paso 2 de 4/)).toBeVisible();

  // Paso 2 → Paso 3. Depende de que la plantilla por defecto esté aprobada.
  const siguientePaso2 = page.getByRole("button", { name: "Siguiente", exact: true });
  test.skip(!(await siguientePaso2.isEnabled()), TEMPLATE_NOT_APPROVED);
  await siguientePaso2.click();
  await expect(page.getByText(/Paso 3 de 4/)).toBeVisible();

  // El botón "Confirmar (N)" solo se habilita cuando hay elegibles seleccionados.
  const confirmar = page.getByRole("button", { name: /Confirmar/ });
  try {
    await expect(confirmar).toBeEnabled({ timeout: 10_000 });
  } catch {
    test.skip(true, "El empleado del fixture no resultó elegible para envío masivo.");
    return;
  }
  await confirmar.click();

  // Paso 4 "Confirmación": se verifica la UI hasta aquí, SIN enviar.
  await expect(page.getByText(/Paso 4 de 4/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Confirmación" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Enviar mensajes" })).toBeVisible();
  await expect(page.getByText(/adelanto_nomina_v2/).first()).toBeVisible();
});

test("nuevo envío no rompe cuando WhatsApp no está configurado", async ({ page }) => {
  await page.goto("/whatsapp/send");

  // Sin credenciales de WhatsApp la página debe renderizar el asistente igual,
  // sin activar el límite de error del segmento.
  await expect(page.getByText("Error en la sección de WhatsApp")).not.toBeVisible();
  await expect(page.getByRole("heading", { name: "Enviar mensajes", exact: true })).toBeVisible();
  await expect(page.getByText(/Paso 1 de 4/)).toBeVisible();
});

// ── Historial /whatsapp/history ──────────────────────────────────────────────

test("historial de envíos carga con encabezado, filtros y listado", async ({ page }) => {
  await page.goto("/whatsapp/history");

  await expect(page.getByRole("heading", { name: "Historial" })).toBeVisible();

  // Acción hacia el asistente.
  await expect(page.getByRole("link", { name: "Nuevo envío" }).first()).toBeVisible();

  // Tarjeta del listado de envíos masivos.
  await expect(page.getByRole("heading", { name: "Envíos masivos" })).toBeVisible();
});

test("historial expone filtros de estado/modo y rango de fechas", async ({ page }) => {
  await page.goto("/whatsapp/history");

  // Dos selectores (Estado y Modo) y dos inputs de fecha (Desde y Hasta).
  await expect(page.getByRole("combobox")).toHaveCount(2);
  await expect(page.locator("input[type='date']")).toHaveCount(2);
});

test("historial muestra y limpia los filtros aplicados", async ({ page }) => {
  await page.goto("/whatsapp/history");

  // Aplicar un filtro de estado (el select Estado es el primer combobox).
  await page.getByRole("combobox").first().selectOption("completed");

  // Con un filtro activo aparece el botón "Limpiar".
  const limpiar = page.getByRole("button", { name: "Limpiar" });
  await expect(limpiar).toBeVisible();

  // Al limpiar, el control desaparece.
  await limpiar.click();
  await expect(limpiar).not.toBeVisible();
});

// ── Conexión /settings/whatsapp (admin) ──────────────────────────────────────

test("configuración de WhatsApp carga para el usuario admin", async ({ page }) => {
  await page.goto("/settings/whatsapp");

  // El usuario de pruebas es admin: la página responde 200 y renderiza el form.
  await expect(page).toHaveURL(/\/settings\/whatsapp$/);
  await expect(page.getByRole("heading", { name: "WhatsApp", exact: true })).toBeVisible();

  // Secciones y acciones del formulario de conexión (sin enviarlas).
  await expect(page.getByRole("heading", { name: "Estado de conexión" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Configuración" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Probar" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Guardar" })).toBeVisible();
});

// ── Navegación entre pantallas ───────────────────────────────────────────────

test("navegación desde el dashboard al asistente de envío", async ({ page }) => {
  await page.goto("/whatsapp");

  await page.getByRole("link", { name: "Nuevo envío" }).first().click();

  await expect(page).toHaveURL(/\/whatsapp\/send/);
  await expect(page.getByRole("heading", { name: "Enviar mensajes", exact: true })).toBeVisible();
});

test("navegación desde el historial al asistente de envío", async ({ page }) => {
  await page.goto("/whatsapp/history");

  await page.getByRole("link", { name: "Nuevo envío" }).first().click();

  await expect(page).toHaveURL(/\/whatsapp\/send/);
  await expect(page.getByRole("heading", { name: "Enviar mensajes", exact: true })).toBeVisible();
});

test("el detalle de un envío inexistente no rompe la sección", async ({ page }) => {
  await page.goto("/whatsapp/bulk/00000000-0000-0000-0000-000000000000");

  // La ruta renderiza su encabezado (no cae en el límite de error del segmento).
  await expect(page.getByRole("heading", { name: "Detalle de envío" })).toBeVisible();
  await expect(page.getByText("Error en la sección de WhatsApp")).not.toBeVisible();

  // El cuerpo tiene contenido: el estado de "no encontrado" es controlado.
  const content = await page.textContent("body");
  expect(content).toBeTruthy();
});

// ── Barra lateral ────────────────────────────────────────────────────────────

test("la barra lateral agrupa WhatsApp con sus sub-secciones", async ({ page }) => {
  await page.goto("/whatsapp");

  // El grupo de mensajería es un <button> desplegable.
  await expect(page.getByRole("button", { name: "WhatsApp" }).first()).toBeVisible();

  // Al estar dentro de /whatsapp el grupo aparece expandido con sus enlaces.
  // El sub-item de historial ahora se llama simplemente "Historial".
  await expect(page.getByRole("link", { name: "Historial", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Resumen", exact: true })).toBeVisible();
});
