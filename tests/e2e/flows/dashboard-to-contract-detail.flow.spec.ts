import { expect, test } from "@playwright/test";
import { findEligibleContractFixture } from "../helpers/supabase";

// ---------------------------------------------------------------------------
// Flow E2E: Operación → Contratos → Expediente → Volver
//
// Cubre la navegación principal del backoffice tras el rediseño por flujo:
//   1. La vista de Operación (cockpit) carga y ofrece el salto al archivo
//      completo de contratos.
//   2. Desde el archivo de contratos se abre el expediente de un empleado.
//   3. Desde el expediente se regresa al archivo de contratos.
//
// La autenticación es automática (proyecto "setup" deja el storageState), así
// que aquí nunca se hace login manual.
//
// Los selectores se apoyan en roles/textos estables (headings, nombres de
// enlace) y no en nombres de columna ni en datos concretos. Los tests que
// necesitan una fila real de contrato se saltan con test.skip cuando no hay
// Supabase o no existe un contrato elegible.
// ---------------------------------------------------------------------------

test("desde Operación se navega al archivo de contratos", async ({ page }) => {
  await page.goto("/");

  // Si faltara la sesión, el middleware nos mandaría a /login; comprobamos que
  // seguimos en la raíz y que el cockpit por flujo renderiza sus piezas.
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { name: "Operación", exact: true })).toBeVisible();
  await expect(page.getByText("Embudo de conversión")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Requieren acción" })).toBeVisible();
  await expect(page.getByText("Inspector", { exact: true })).toBeVisible();

  // El cockpit enlaza al archivo completo; ese es el puente a /contracts.
  await page.getByRole("link", { name: "Ver archivo completo" }).first().click();

  await expect(page).toHaveURL(/\/contracts/);
  await expect(page.getByRole("heading", { name: "Contratos", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Expedientes" })).toBeVisible();
});

test("desde el archivo de contratos se abre el expediente del empleado", async ({
  page,
}) => {
  const fixture = await findEligibleContractFixture();
  test.skip(!fixture, "Requiere Supabase con un contrato elegible — test omitido.");
  if (!fixture) return; // Narrowing para TS; inalcanzable tras el skip.

  // Buscamos por RFC para acotar el archivo a la fila del empleado.
  await page.goto(`/contracts?q=${encodeURIComponent(fixture.rfc)}`);

  await expect(page.getByRole("heading", { name: "Contratos", exact: true })).toBeVisible();
  await expect(page.getByText(fixture.rfc).first()).toBeVisible();

  const abrirExpediente = page.getByRole("link", { name: "Abrir expediente" }).first();
  await expect(abrirExpediente).toBeVisible();
  await abrirExpediente.click();

  // Navega al expediente /contracts/[employeeId] y muestra sus secciones.
  await expect(page).toHaveURL(/\/contracts\/[0-9a-f-]+/i);
  await expect(page.getByRole("heading", { name: "Progreso" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Acciones" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Timeline" })).toBeVisible();
});

test("desde el expediente se regresa al archivo de contratos", async ({ page }) => {
  const fixture = await findEligibleContractFixture();
  test.skip(!fixture, "Requiere Supabase con un contrato elegible — test omitido.");
  if (!fixture) return; // Narrowing para TS; inalcanzable tras el skip.

  await page.goto(`/contracts?q=${encodeURIComponent(fixture.rfc)}`);
  await page.getByRole("link", { name: "Abrir expediente" }).first().click();

  await expect(page).toHaveURL(/\/contracts\/[0-9a-f-]+/i);
  await expect(page.getByRole("heading", { name: "Progreso" })).toBeVisible();

  // El expediente ofrece un enlace "Volver" que apunta a /contracts.
  const volver = page.getByRole("link", { name: "Volver", exact: true });
  await expect(volver).toBeVisible();
  await volver.click();

  await expect(page).toHaveURL(/\/contracts(\?|$)/);
  await expect(page.getByRole("heading", { name: "Contratos", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Expedientes" })).toBeVisible();
});
