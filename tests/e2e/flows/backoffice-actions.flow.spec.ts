import { expect, test, type Page } from "@playwright/test";
import { findEligibleContractFixture } from "../helpers/supabase";

// ---------------------------------------------------------------------------
// Flow E2E: Acciones operativas en el expediente de contrato
// Ruta: /contracts/[employeeId]  (rediseño por flujo)
//
// Intención heredada del test anterior: verificar que el detalle expone las
// acciones "Regenerar link" y "Reintentar flujo", que su estado
// habilitado/deshabilitado es coherente con el estado del contrato, y que el
// enlace "Volver" regresa a la lista de contratos.
//
// El helper de fixtures por estado (createBackofficeStatusFixture) ya no se
// usa: ahora se obtiene un empleado real cualquiera con
// findEligibleContractFixture, que NO controla el estado del contrato. Por eso
// las aserciones sobre habilitado/deshabilitado son TOLERANTES a los datos: se
// comprueba la coherencia interna (botones vs. nota explicativa) sin asumir un
// estado concreto. Si no hay Supabase o no hay contrato elegible, el test se
// omite con test.skip.
// ---------------------------------------------------------------------------

/**
 * Abre el expediente del primer contrato que coincide con el RFC dado,
 * navegando desde la lista /contracts como haría un operador. Deja la página
 * en /contracts/[employeeId].
 */
async function abrirExpediente(page: Page, rfc: string) {
  await page.goto(`/contracts?q=${encodeURIComponent(rfc)}`);

  // La tabla "Expedientes" siempre se renderiza (incluso vacía).
  await expect(page.getByRole("heading", { name: "Expedientes" })).toBeVisible();

  // Cada fila del escritorio enlaza al expediente con "Abrir expediente".
  const abrir = page.getByRole("link", { name: "Abrir expediente" }).first();
  await expect(abrir).toBeVisible();
  await abrir.click();

  await expect(page).toHaveURL(/\/contracts\/[0-9a-f-]+/);
}

test("el expediente muestra Progreso, Acciones (ambos botones) y Timeline", async ({
  page,
}) => {
  const fixture = await findEligibleContractFixture();
  if (!fixture) {
    test.skip(true, "Sin Supabase o sin contrato elegible — test omitido.");
    return;
  }

  await abrirExpediente(page, fixture.rfc);

  // Secciones estructurales del detalle.
  await expect(page.getByRole("heading", { name: "Progreso" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Acciones" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Timeline" })).toBeVisible();

  // Ambos botones de acción deben existir (habilitados o no según el estado).
  await expect(
    page.getByRole("button", { name: "Regenerar link" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Reintentar flujo" }),
  ).toBeVisible();

  // La nota explicativa acompaña siempre a la tarjeta de Acciones, en alguna
  // de sus tres variantes según el estado del contrato.
  await expect(
    page.getByText(
      /Las acciones se habilitan|ya está firmado|Si el link sigue vigente/i,
    ),
  ).toBeVisible();
});

test("el estado habilitado/deshabilitado de las acciones es coherente con la nota", async ({
  page,
}) => {
  const fixture = await findEligibleContractFixture();
  if (!fixture) {
    test.skip(true, "Sin Supabase o sin contrato elegible — test omitido.");
    return;
  }

  await abrirExpediente(page, fixture.rfc);

  const regenerar = page.getByRole("button", { name: "Regenerar link" });
  const reintentar = page.getByRole("button", { name: "Reintentar flujo" });

  await expect(regenerar).toBeVisible();
  await expect(reintentar).toBeVisible();

  // Ambos botones comparten SIEMPRE el mismo estado (actionsDisabled en la UI).
  const deshabilitado = await regenerar.isDisabled();
  expect(await reintentar.isDisabled()).toBe(deshabilitado);

  if (deshabilitado) {
    // Deshabilitado ⟺ aún no hay solicitud o el contrato ya está firmado.
    await expect(
      page.getByText(/Las acciones se habilitan|ya está firmado/i),
    ).toBeVisible();
  } else {
    // Habilitado ⟺ hay una solicitud viva sobre la que operar.
    await expect(page.getByText(/Si el link sigue vigente/i)).toBeVisible();
  }
});

test("Regenerar link pide confirmación y al descartarla no ejecuta la acción", async ({
  page,
}) => {
  const fixture = await findEligibleContractFixture();
  if (!fixture) {
    test.skip(true, "Sin Supabase o sin contrato elegible — test omitido.");
    return;
  }

  await abrirExpediente(page, fixture.rfc);

  const regenerar = page.getByRole("button", { name: "Regenerar link" });
  await expect(regenerar).toBeVisible();

  // Si el estado no permite operar, el botón está deshabilitado y no hay
  // confirmación que probar: basta con verificar que no se puede ejecutar.
  if (await regenerar.isDisabled()) {
    await expect(regenerar).toBeDisabled();
    return;
  }

  // Capturamos el window.confirm y lo DESCARTAMOS para no disparar el efecto
  // real (regenerar el link crea un intento y llama a servicios externos).
  let mensajeConfirm = "";
  page.on("dialog", (dialog) => {
    mensajeConfirm = dialog.message();
    void dialog.dismiss();
  });

  const urlAntes = page.url();
  await regenerar.click();

  // Debió mostrarse el diálogo de confirmación...
  await expect.poll(() => mensajeConfirm).toMatch(/link/i);
  // ...y al descartarlo NO se navega ni se registra feedback de acción.
  expect(page.url()).toBe(urlAntes);
  await expect(page).not.toHaveURL(/action_status=/);
});

test("el enlace Volver regresa a la lista de Contratos", async ({ page }) => {
  const fixture = await findEligibleContractFixture();
  if (!fixture) {
    test.skip(true, "Sin Supabase o sin contrato elegible — test omitido.");
    return;
  }

  await abrirExpediente(page, fixture.rfc);

  const volver = page.getByRole("link", { name: "Volver", exact: true });
  await expect(volver).toBeVisible();
  await volver.click();

  await expect(page).toHaveURL(/\/contracts(\?.*)?$/);
  await expect(
    page.getByRole("heading", { name: "Contratos", exact: true, level: 1 }),
  ).toBeVisible();
});
