import { expect, test, type Page } from "@playwright/test";

// ---------------------------------------------------------------------------
// Flow E2E: Asistente de envío masivo WhatsApp (/whatsapp/send)
//
// Reescrito para la UI actual tras el rediseño por flujo. La UI vieja (tabs
// "Por Importación / Por Selección Manual", barra sticky, botón
// "Seleccionar elegibles", modal de confirmación) YA NO EXISTE. Ahora el envío
// es un asistente guiado de 4 pasos (GuidedSendFlow):
//
//   Paso 1 — Destinatarios (RecipientStep): modos "Importación" / "Manual".
//   Paso 2 — Mensaje (MessageTemplateStep): plantilla + botón de acción opcional.
//   Paso 3 — Revisión (EligibilitySummary): valida elegibilidad y selecciona.
//   Paso 4 — Confirmación (SendConfirmation): botón "Enviar mensajes".
//   Paso 5 — Resultado (SendResult): "Nuevo envío" / "Ver historial".
//
// La autenticación es automática (proyecto "setup" -> storageState admin), así
// que nunca hacemos login manual. Los selectores se apoyan en roles, encabezados
// y placeholders estables, no en datos concretos.
//
// SEGURIDAD: no confirmamos ningún envío masivo real. Los tests de estructura no
// dependen de datos; el test de extremo a extremo llega hasta el paso de
// Confirmación y verifica el botón "Enviar mensajes" SIN pulsarlo, para no
// disparar un envío con efectos (mensajes reales / registros de envío). La
// pantalla de Resultado (paso 5) solo es alcanzable tras un envío real, por lo
// que se documenta pero no se ejercita en vivo.
// ---------------------------------------------------------------------------

const DUMMY_EMPLOYEE_ID = "00000000-0000-0000-0000-000000000000";

/**
 * Avanza el asistente hasta el Paso 2 (Mensaje) por la ruta Manual con un ID
 * ficticio. No depende de datos del entorno: solo necesita que el textarea
 * acepte un ID para habilitar "Siguiente". No llega a validar elegibilidad
 * (eso ocurre en el paso 3), por lo que no produce efectos.
 */
async function irAlPaso2PorManual(page: Page): Promise<void> {
  await page.goto("/whatsapp/send");

  await page.getByRole("button", { name: "Manual", exact: true }).click();
  const textarea = page.getByPlaceholder("uuid-empleado-1, uuid-empleado-2");
  await expect(textarea).toBeVisible();
  await textarea.fill(DUMMY_EMPLOYEE_ID);

  const siguiente = page.getByRole("button", { name: "Siguiente", exact: true });
  await expect(siguiente).toBeEnabled();
  await siguiente.click();

  await expect(page.getByText(/Paso 2 de 4/)).toBeVisible();
  await expect(page.getByText("Mensaje a enviar")).toBeVisible();
}

// ── Estructura y navegación (sin dependencia de datos) ───────────────────────

test("la página /whatsapp/send carga sin errores", async ({ page }) => {
  // Señal fiable de un fallo real: una excepción JS sin capturar.
  const uncaughtErrors: string[] = [];
  page.on("pageerror", (error) => uncaughtErrors.push(error.message));

  await page.goto("/whatsapp/send");

  // El título de página lo pinta PageHeader como <h1>.
  await expect(
    page.getByRole("heading", { name: "Enviar mensajes", exact: true }),
  ).toBeVisible();

  // El error boundary de la sección (app/whatsapp/error.tsx) no debe activarse.
  await expect(
    page.getByText(/Error en la sección de WhatsApp/i),
  ).toHaveCount(0);
  expect(uncaughtErrors).toEqual([]);
});

test("muestra el indicador de 4 pasos y arranca en Destinatarios", async ({
  page,
}) => {
  await page.goto("/whatsapp/send");

  // El contador del asistente refleja los 4 pasos y arranca en el 1.
  await expect(page.getByText(/Paso 1 de 4/)).toBeVisible();
  // La cabecera de sección del paso activo.
  await expect(
    page.getByRole("heading", { name: "Destinatarios" }),
  ).toBeVisible();
});

test("paso 1 arranca en modo Importación con Siguiente deshabilitado", async ({
  page,
}) => {
  await page.goto("/whatsapp/send");

  // Ambos modos disponibles como botones.
  await expect(
    page.getByRole("button", { name: "Importación", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Manual", exact: true }),
  ).toBeVisible();

  // El modo Importación está activo por defecto: se ve su selector.
  await expect(
    page.getByRole("heading", { name: "Selecciona una importación" }),
  ).toBeVisible();

  // Sin ninguna importación seleccionada no se puede continuar.
  await expect(
    page.getByRole("button", { name: "Siguiente", exact: true }),
  ).toBeDisabled();
});

test("paso 1 (Importación): lista importaciones con fecha o estado vacío y habilita Siguiente al seleccionar", async ({
  page,
}) => {
  await page.goto("/whatsapp/send");

  await expect(
    page.getByRole("heading", { name: "Selecciona una importación" }),
  ).toBeVisible();

  // Esperamos a que resuelva el fetch de importaciones antes de contar filas.
  await page.waitForLoadState("networkidle");

  // Cada fila de importación es un <button> que muestra "N empleados".
  const importRows = page.getByRole("button").filter({ hasText: /empleados/ });
  const rowCount = await importRows.count();

  // Si no hay importaciones aplicadas se pinta el estado vacío; es un render
  // correcto, pero no podemos ejercer la selección.
  test.skip(rowCount === 0, "Sin importaciones aplicadas en el entorno");

  const siguiente = page.getByRole("button", { name: "Siguiente", exact: true });
  await expect(siguiente).toBeDisabled();

  // Cada fila incluye la fecha de aplicación (dd mmm aaaa …).
  await expect(importRows.first()).toContainText(
    /\d{1,2}\s+\w{3,}\.?\s+\d{4}|sin fecha/i,
  );

  // El buscador por nombre de archivo solo aparece con más de 4 importaciones.
  const filtro = page.getByPlaceholder("Filtrar por nombre de archivo…");
  if (await filtro.count()) {
    await filtro.fill("archivo-que-no-existe-zzz");
    await expect(
      page.getByText(/Ninguna importación coincide/i),
    ).toBeVisible();
    await filtro.fill("");
  }

  // Seleccionar una importación habilita "Siguiente".
  await importRows.first().click();
  await expect(siguiente).toBeEnabled();
});

test("paso 1 (Manual): textarea y buscador de prueba; Siguiente se habilita al ingresar IDs", async ({
  page,
}) => {
  await page.goto("/whatsapp/send");

  await page.getByRole("button", { name: "Manual", exact: true }).click();

  const textarea = page.getByPlaceholder("uuid-empleado-1, uuid-empleado-2");
  await expect(textarea).toBeVisible();

  // Sección de envío de prueba con su buscador de empleados.
  await expect(page.getByText("Envío de prueba")).toBeVisible();
  await expect(
    page.getByPlaceholder("Buscar por nombre, RFC o teléfono..."),
  ).toBeVisible();

  // Sin IDs no se puede continuar; al pegar uno, "Siguiente" se habilita.
  const siguiente = page.getByRole("button", { name: "Siguiente", exact: true });
  await expect(siguiente).toBeDisabled();
  await textarea.fill(DUMMY_EMPLOYEE_ID);
  await expect(siguiente).toBeEnabled();
});

test("paso 2 (Mensaje): muestra la plantilla y permite volver al paso 1", async ({
  page,
}) => {
  await irAlPaso2PorManual(page);

  // La plantilla activa se muestra (por defecto adelanto_nomina_v2).
  await expect(page.getByText(/Plantilla:/).first()).toBeVisible();
  await expect(page.getByText(/adelanto/i).first()).toBeVisible();

  // Navegación del paso: "Volver" regresa al paso 1.
  await page.getByRole("button", { name: "Volver", exact: true }).click();
  await expect(page.getByText(/Paso 1 de 4/)).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Destinatarios" }),
  ).toBeVisible();
});

test("paso 2 (Mensaje): permite añadir un botón de acción con URL", async ({
  page,
}) => {
  await irAlPaso2PorManual(page);

  // Activar el botón de acción revela los campos de texto y URL.
  await page.getByLabel("Incluir botón de acción").check();
  await expect(page.getByPlaceholder("https://...")).toBeVisible();

  // Desactivarlo los oculta de nuevo.
  await page.getByLabel("Incluir botón de acción").uncheck();
  await expect(page.getByPlaceholder("https://...")).toHaveCount(0);
});

// ── Flujo de extremo a extremo (depende de datos; sin envío real) ────────────

test("flujo (Importación) llega hasta Confirmación sin disparar el envío", async ({
  page,
}) => {
  await page.goto("/whatsapp/send");
  await expect(
    page.getByRole("heading", { name: "Selecciona una importación" }),
  ).toBeVisible();
  await page.waitForLoadState("networkidle");

  // Requiere al menos una importación aplicada para seleccionar destinatarios.
  const importRows = page.getByRole("button").filter({ hasText: /empleados/ });
  test.skip(
    (await importRows.count()) === 0,
    "Sin importaciones aplicadas en el entorno",
  );

  // Paso 1 -> Paso 2
  await importRows.first().click();
  await page.getByRole("button", { name: "Siguiente", exact: true }).click();
  await expect(page.getByText(/Paso 2 de 4/)).toBeVisible();
  await expect(page.getByText("Mensaje a enviar")).toBeVisible();

  // Paso 2 -> Paso 3. Si la plantilla por defecto no está aprobada, "Siguiente"
  // queda deshabilitado y no podemos avanzar.
  const siguientePaso2 = page.getByRole("button", {
    name: "Siguiente",
    exact: true,
  });
  test.skip(
    !(await siguientePaso2.isEnabled()),
    "La plantilla por defecto no está aprobada para envío",
  );
  await siguientePaso2.click();

  // Paso 3: valida elegibilidad automáticamente.
  await expect(page.getByText(/Paso 3 de 4/)).toBeVisible();
  await expect(
    page.getByText("Verificando destinatarios..."),
  ).toBeHidden({ timeout: 15_000 });

  // Si la validación falló, aparece "Reintentar" en lugar del resumen.
  test.skip(
    (await page.getByRole("button", { name: "Reintentar", exact: true }).count()) >
      0,
    "La validación de elegibilidad falló en el entorno",
  );

  // El botón "Confirmar (N)" solo se habilita con empleados elegibles.
  const confirmar = page.getByRole("button", { name: /^Confirmar \(\d+\)$/ });
  await expect(confirmar).toBeVisible();
  test.skip(
    !(await confirmar.isEnabled()),
    "La importación seleccionada no tiene empleados elegibles",
  );

  // Paso 3 -> Paso 4 (Confirmación).
  await confirmar.click();
  await expect(page.getByText(/Paso 4 de 4/)).toBeVisible();

  // Verificamos el resumen y el botón de envío, pero NO lo pulsamos: confirmarlo
  // dispararía un envío masivo real con efectos.
  await expect(page.getByText("Plantilla").first()).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Enviar mensajes" }),
  ).toBeVisible();

  // "Volver" regresa a la revisión sin enviar nada.
  await page.getByRole("button", { name: "Volver", exact: true }).click();
  await expect(page.getByText(/Paso 3 de 4/)).toBeVisible();
});
