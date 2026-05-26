import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { getSupabaseTestClient } from "../helpers/supabase";

// ---------------------------------------------------------------------------
// Flow E2E: Flujo completo de envío masivo WhatsApp
//
// Cubre el rediseño de BulkSendForm:
//   1. Página carga correctamente
//   2. Selector de importación y validación de elegibilidad
//   3. Tabla de empleados con checkboxes y controles de selección
//   4. Barra de acción sticky (siempre visible, botón "Enviar N mensajes")
//   5. Modal de confirmación con wording correcto
//   6. Pantalla de éxito/resultado tras el envío
//   7. Flujo de "Nuevo envío" desde la pantalla de éxito
//
// Tests que no requieren Supabase: comprueban estructura DOM estática.
// Tests que requieren Supabase: crean un import_batch real y empleados elegibles,
// luego ejercen el flujo completo de UI.
// ---------------------------------------------------------------------------

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Crea un import_batch aplicado con un empleado elegible vinculado vía
 * advance_offers.source_batch_id. Retorna el importId o null si Supabase
 * no está disponible.
 *
 * Orden de creación necesario para respetar FK:
 *   1. import_batch (status = 'aplicada')
 *   2. employee
 *   3. advance_offer con source_batch_id = batch.id
 */
async function createImportFixture(): Promise<{
  importId: string;
  employeeId: string;
} | null> {
  const supabase = getSupabaseTestClient();
  if (!supabase) return null;

  const unique = randomUUID().replace(/-/g, "");
  // RFC formato estándar: 4 letras + 6 dígitos fecha + 3 alfanuméricos = 13 chars
  const letters = unique.replace(/[^a-f]/g, "").padEnd(4, "a").slice(0, 4).toUpperCase();
  const suffix = unique.replace(/[^a-z0-9]/gi, "").padEnd(3, "0").slice(-3).toUpperCase();
  const rfc = `${letters}010101${suffix}`;
  const telefono = `52${unique.replace(/\D/g, "").padEnd(10, "1").slice(0, 10)}`;

  // 1. Crear import_batch en estado 'aplicada' (valor exacto del enum import_status)
  const { data: batch, error: batchErr } = await supabase
    .from("import_batches")
    .insert({
      filename: "e2e-send-flow-test.csv",
      total_rows: 1,
      valid_rows: 1,
      invalid_rows: 0,
      duplicate_rows: 0,
      status: "aplicada",
      applied_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (batchErr || !batch) {
    console.error("createImportFixture: batch insert error", batchErr?.message);
    return null;
  }

  // 2. Crear empleado elegible
  const { data: emp, error: empErr } = await supabase
    .from("employees")
    .insert({
      rfc,
      nombre: "E2E Send",
      apellidos: "Flow Test",
      cp_csf: "64000",
      telefono,
      telefono_normalizado: telefono,
      email: `e2e-send-${unique.slice(0, 8)}@example.test`,
      empleador: "E2E Empleador",
    })
    .select("id")
    .single();

  if (empErr || !emp) {
    console.error("createImportFixture: employee insert error", empErr?.message);
    return null;
  }

  // 3. Crear cuenta bancaria activa (requerida por getEmployeesEligibility)
  //    CLABE debe ser exactamente 18 dígitos numéricos
  const clabeDigits = unique.replace(/\D/g, "").padEnd(18, "0").slice(0, 18);
  const { error: bankErr } = await supabase.from("employee_bank_accounts").insert({
    employee_id: emp.id,
    clabe: clabeDigits,
    banco: "E2E Banco",
    is_active: true,
  });

  if (bankErr) {
    console.error("createImportFixture: bank account insert error", bankErr?.message);
    return null;
  }

  // 4. Crear oferta elegible vinculada al batch (source_batch_id es el vínculo
  //    que usa getEmployeesFromImport para asociar employees con una importación)
  const { error: offerErr } = await supabase.from("advance_offers").insert({
    employee_id: emp.id,
    monto_prestamo_autorizado: 3000,
    estatus_p_esta_q: "E2E",
    estatus_conversion: "aceptada",
    estatus_cliente: "E2E",
    is_current: true,
    status: "vigente",
    source_hash: `e2e-send-${randomUUID()}`,
    source_batch_id: batch.id,
  });

  if (offerErr) {
    console.error("createImportFixture: offer insert error", offerErr?.message);
    return null;
  }

  return { importId: batch.id, employeeId: emp.id };
}

// ── Tests de estructura estática (sin Supabase) ──────────────────────────────

test("página /whatsapp/send carga sin errores de React", async ({ page }) => {
  await page.goto("/whatsapp/send");

  // No debe activar el ErrorBoundary
  await expect(page.getByText(/algo salió mal/i)).not.toBeVisible();

  // Heading principal
  await expect(
    page.getByRole("heading", { name: /Envío Masivo WhatsApp/i }),
  ).toBeVisible();
});

test("formulario muestra tabs Por Importación y Por Selección Manual", async ({
  page,
}) => {
  await page.goto("/whatsapp/send");

  await expect(
    page.getByRole("button", { name: /Por Importación/i }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Por Selección Manual/i }),
  ).toBeVisible();
});

test("formulario muestra card de template con campo editable", async ({
  page,
}) => {
  await page.goto("/whatsapp/send");

  const templateInput = page.locator("#templateName");
  await expect(templateInput).toBeVisible();
  await expect(templateInput).toHaveValue("adelanto_contrato");
});

test("tab Por Importación muestra selector de importación", async ({ page }) => {
  await page.goto("/whatsapp/send");

  // El tab está activo por defecto
  await expect(
    page.getByRole("button", { name: /Por Importación/i }),
  ).toBeVisible();

  // Debe haber un <select> para elegir la importación
  const importSelect = page.locator("select");
  await expect(importSelect.first()).toBeVisible();
  const firstOption = importSelect.locator("option").first();
  await expect(firstOption).toHaveText(/Selecciona una importación/i);
});

test("tab Por Selección Manual muestra textarea para IDs", async ({ page }) => {
  await page.goto("/whatsapp/send");

  await page.getByRole("button", { name: /Por Selección Manual/i }).click();

  // Debe aparecer el textarea para pegar IDs
  const textarea = page.locator("textarea");
  await expect(textarea).toBeVisible();

  // Y el botón de validar elegibilidad
  await expect(
    page.getByRole("button", { name: /Validar elegibilidad/i }),
  ).toBeVisible();
});

test("barra de acción sticky NO aparece en estado idle (sin importación)", async ({
  page,
}) => {
  await page.goto("/whatsapp/send");

  // La barra sticky solo aparece cuando sendState === 'ready' | 'sending'
  // En estado idle (sin selección) no debe mostrar el botón de enviar
  const sendBtn = page.getByRole("button", { name: /Enviar \d+ mensaje/i });
  await expect(sendBtn).not.toBeVisible();
});

test("cambiar el nombre del template actualiza el valor del campo", async ({
  page,
}) => {
  await page.goto("/whatsapp/send");

  const templateInput = page.locator("#templateName");
  await templateInput.clear();
  await templateInput.fill("mi_template_custom");
  await expect(templateInput).toHaveValue("mi_template_custom");
});

// ── Tests con Supabase (requieren credenciales en .env.local) ────────────────

test("al seleccionar importación válida aparece tabla de empleados", async ({
  page,
}) => {
  const fixture = await createImportFixture();

  if (!fixture) {
    test.skip(true, "Supabase no configurado para E2E — test omitido.");
    return;
  }

  await page.goto("/whatsapp/send");

  // Seleccionar la importación creada
  const importSelect = page.locator("select").first();
  await importSelect.selectOption(fixture.importId);

  // Esperar a que cargue la tabla de empleados
  await expect(
    page.getByRole("heading", { name: /Empleados/i }),
  ).toBeVisible({ timeout: 10_000 });

  // Debe aparecer al menos 1 fila en la tabla
  const rows = page.locator("tbody tr");
  await expect(rows).toHaveCount(1);
});

test("al cargar empleados elegibles aparece la barra sticky con botón Enviar", async ({
  page,
}) => {
  const fixture = await createImportFixture();

  if (!fixture) {
    test.skip(true, "Supabase no configurado para E2E — test omitido.");
    return;
  }

  await page.goto("/whatsapp/send");

  const importSelect = page.locator("select").first();
  await importSelect.selectOption(fixture.importId);

  // Esperar a que cargue la lista
  await expect(
    page.getByRole("heading", { name: /Empleados/i }),
  ).toBeVisible({ timeout: 10_000 });

  // La barra sticky debe mostrar el botón de enviar
  const sendBtn = page.getByRole("button", { name: /Enviar \d+ mensaje/i });
  await expect(sendBtn).toBeVisible();
  await expect(sendBtn).toBeEnabled();
});

test("barra sticky muestra resumen: nombre del template y cuenta de seleccionados", async ({
  page,
}) => {
  const fixture = await createImportFixture();

  if (!fixture) {
    test.skip(true, "Supabase no configurado para E2E — test omitido.");
    return;
  }

  await page.goto("/whatsapp/send");

  const importSelect = page.locator("select").first();
  await importSelect.selectOption(fixture.importId);

  await expect(
    page.getByRole("heading", { name: /Empleados/i }),
  ).toBeVisible({ timeout: 10_000 });

  // El resumen en la barra debe mencionar el template y la cuenta
  // La barra es el contenedor sticky al fondo (z-30)
  const stickyBar = page.locator(".sticky.bottom-6");
  await expect(stickyBar).toBeVisible();
  await expect(stickyBar).toContainText(/adelanto_contrato/i);
  await expect(stickyBar).toContainText(/seleccionado/i);
});

test("botón Limpiar deselecciona todos los empleados y deshabilita el botón Enviar", async ({
  page,
}) => {
  const fixture = await createImportFixture();

  if (!fixture) {
    test.skip(true, "Supabase no configurado para E2E — test omitido.");
    return;
  }

  await page.goto("/whatsapp/send");

  const importSelect = page.locator("select").first();
  await importSelect.selectOption(fixture.importId);

  await expect(
    page.getByRole("heading", { name: /Empleados/i }),
  ).toBeVisible({ timeout: 10_000 });

  // Clic en "Limpiar" para deseleccionar
  await page.getByRole("button", { name: /Limpiar/i }).click();

  // El botón enviar debe quedar deshabilitado
  const sendBtn = page.getByRole("button", { name: /Selecciona empleados/i });
  await expect(sendBtn).toBeVisible();
  await expect(sendBtn).toBeDisabled();
});

test("botón Seleccionar elegibles reactiva el botón Enviar", async ({
  page,
}) => {
  const fixture = await createImportFixture();

  if (!fixture) {
    test.skip(true, "Supabase no configurado para E2E — test omitido.");
    return;
  }

  await page.goto("/whatsapp/send");

  const importSelect = page.locator("select").first();
  await importSelect.selectOption(fixture.importId);

  await expect(
    page.getByRole("heading", { name: /Empleados/i }),
  ).toBeVisible({ timeout: 10_000 });

  // Primero limpiar
  await page.getByRole("button", { name: /Limpiar/i }).click();

  // Luego seleccionar elegibles
  await page.getByRole("button", { name: /Seleccionar elegibles/i }).click();

  // El botón enviar debe volver a estar habilitado
  const sendBtn = page.getByRole("button", { name: /Enviar \d+ mensaje/i });
  await expect(sendBtn).toBeEnabled();
});

test("clic en Enviar abre el modal de confirmación con datos correctos", async ({
  page,
}) => {
  const fixture = await createImportFixture();

  if (!fixture) {
    test.skip(true, "Supabase no configurado para E2E — test omitido.");
    return;
  }

  await page.goto("/whatsapp/send");

  const importSelect = page.locator("select").first();
  await importSelect.selectOption(fixture.importId);

  await expect(
    page.getByRole("heading", { name: /Empleados/i }),
  ).toBeVisible({ timeout: 10_000 });

  // Clic en el botón de la barra sticky (el primero, no el del modal)
  await page.getByRole("button", { name: /Enviar \d+ mensaje/i }).first().click();

  // El modal debe aparecer
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(/Confirmar envío masivo/i);
  await expect(dialog).toContainText(/adelanto_contrato/i);

  // Debe tener el botón de confirmar (dentro del dialog) y cancelar
  await expect(
    dialog.getByRole("button", { name: /Cancelar/i }),
  ).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: /Enviar \d+ mensaje/i }),
  ).toBeVisible();
});

test("cancelar el modal cierra el diálogo sin enviar", async ({ page }) => {
  const fixture = await createImportFixture();

  if (!fixture) {
    test.skip(true, "Supabase no configurado para E2E — test omitido.");
    return;
  }

  await page.goto("/whatsapp/send");

  const importSelect = page.locator("select").first();
  await importSelect.selectOption(fixture.importId);

  await expect(
    page.getByRole("heading", { name: /Empleados/i }),
  ).toBeVisible({ timeout: 10_000 });

  await page.getByRole("button", { name: /Enviar \d+ mensaje/i }).click();
  await expect(page.getByRole("dialog")).toBeVisible();

  await page.getByRole("button", { name: /Cancelar/i }).click();

  // El modal cierra y el formulario sigue en estado ready
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(
    page.getByRole("heading", { name: /Empleados/i }),
  ).toBeVisible();
});

test("confirmar envío muestra pantalla de éxito o resultado con los contadores", async ({
  page,
}) => {
  const fixture = await createImportFixture();

  if (!fixture) {
    test.skip(true, "Supabase no configurado para E2E — test omitido.");
    return;
  }

  await page.goto("/whatsapp/send");

  const importSelect = page.locator("select").first();
  await importSelect.selectOption(fixture.importId);

  await expect(
    page.getByRole("heading", { name: /Empleados/i }),
  ).toBeVisible({ timeout: 10_000 });

  // Abrir modal y confirmar
  await page.getByRole("button", { name: /Enviar \d+ mensaje/i }).click();
  await expect(page.getByRole("dialog")).toBeVisible();

  // Confirmar — puede fallar si no hay WHATSAPP_ACCESS_TOKEN, pero la
  // pantalla de resultado siempre debe aparecer (con 0 enviados si no hay token)
  const confirmBtn = page.getByRole("dialog").getByRole("button", {
    name: /Enviar \d+ mensaje/i,
  });
  await confirmBtn.click();

  // Esperar a que desaparezca el modal y aparezca el resultado
  await expect(page.getByRole("dialog")).not.toBeVisible({ timeout: 15_000 });

  // La pantalla de éxito/resultado debe estar visible
  // Puede ser "¡Mensajes enviados!" o "Envío completado con errores"
  const successOrError = page.locator("h2").filter({
    hasText: /mensajes enviados|envío completado/i,
  });
  await expect(successOrError).toBeVisible({ timeout: 15_000 });

  // Los contadores deben estar presentes
  await expect(page.getByText(/Enviados/i).first()).toBeVisible();
  await expect(page.getByText(/Elegibles/i).first()).toBeVisible();
  await expect(page.getByText(/Errores/i).first()).toBeVisible();
});

test("pantalla de resultado muestra template utilizado", async ({ page }) => {
  const fixture = await createImportFixture();

  if (!fixture) {
    test.skip(true, "Supabase no configurado para E2E — test omitido.");
    return;
  }

  await page.goto("/whatsapp/send");

  const importSelect = page.locator("select").first();
  await importSelect.selectOption(fixture.importId);

  await expect(
    page.getByRole("heading", { name: /Empleados/i }),
  ).toBeVisible({ timeout: 10_000 });

  await page.getByRole("button", { name: /Enviar \d+ mensaje/i }).click();
  const confirmBtn = page.getByRole("dialog").getByRole("button", {
    name: /Enviar \d+ mensaje/i,
  });
  await confirmBtn.click();

  await expect(page.getByRole("dialog")).not.toBeVisible({ timeout: 15_000 });

  // El nombre del template debe aparecer en la pantalla de resultado
  const successOrError = page.locator("h2").filter({
    hasText: /mensajes enviados|envío completado/i,
  });
  await expect(successOrError).toBeVisible({ timeout: 15_000 });

  await expect(page.getByText(/adelanto_contrato/i).first()).toBeVisible();
});

test("pantalla de resultado tiene botón Nuevo envío que regresa al formulario", async ({
  page,
}) => {
  const fixture = await createImportFixture();

  if (!fixture) {
    test.skip(true, "Supabase no configurado para E2E — test omitido.");
    return;
  }

  await page.goto("/whatsapp/send");

  const importSelect = page.locator("select").first();
  await importSelect.selectOption(fixture.importId);

  await expect(
    page.getByRole("heading", { name: /Empleados/i }),
  ).toBeVisible({ timeout: 10_000 });

  await page.getByRole("button", { name: /Enviar \d+ mensaje/i }).click();
  const confirmBtn = page.getByRole("dialog").getByRole("button", {
    name: /Enviar \d+ mensaje/i,
  });
  await confirmBtn.click();

  await expect(page.getByRole("dialog")).not.toBeVisible({ timeout: 15_000 });

  const successOrError = page.locator("h2").filter({
    hasText: /mensajes enviados|envío completado/i,
  });
  await expect(successOrError).toBeVisible({ timeout: 15_000 });

  // El botón "Nuevo envío" debe estar presente
  const nuevoEnvioBtn = page.getByRole("button", { name: /Nuevo envío/i });
  await expect(nuevoEnvioBtn).toBeVisible();

  // Al hacer clic, debe regresar al formulario con la tabla de empleados
  await nuevoEnvioBtn.click();
  await expect(
    page.getByRole("heading", { name: /Empleados/i }),
  ).toBeVisible();
});

test("pantalla de resultado tiene enlace al historial de envíos", async ({
  page,
}) => {
  const fixture = await createImportFixture();

  if (!fixture) {
    test.skip(true, "Supabase no configurado para E2E — test omitido.");
    return;
  }

  await page.goto("/whatsapp/send");

  const importSelect = page.locator("select").first();
  await importSelect.selectOption(fixture.importId);

  await expect(
    page.getByRole("heading", { name: /Empleados/i }),
  ).toBeVisible({ timeout: 10_000 });

  await page.getByRole("button", { name: /Enviar \d+ mensaje/i }).click();
  const confirmBtn = page.getByRole("dialog").getByRole("button", {
    name: /Enviar \d+ mensaje/i,
  });
  await confirmBtn.click();

  await expect(page.getByRole("dialog")).not.toBeVisible({ timeout: 15_000 });

  const successOrError = page.locator("h2").filter({
    hasText: /mensajes enviados|envío completado/i,
  });
  await expect(successOrError).toBeVisible({ timeout: 15_000 });

  // Debe haber un enlace al historial
  const historialLink = page.getByRole("button", { name: /Ver historial/i });
  await expect(historialLink).toBeVisible();
});
