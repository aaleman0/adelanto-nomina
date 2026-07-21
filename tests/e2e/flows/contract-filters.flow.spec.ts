import { expect, test } from "@playwright/test";
import { getSupabaseTestClient } from "../helpers/supabase";
import { createBackofficeStatusFixture } from "../helpers/contract-fixtures";

/**
 * Búsqueda por RFC y filtro de estado en /contracts.
 *
 * La autenticación es automática (proyecto "setup" + storageState): el fixture
 * `page` ya viaja como usuario admin, así que se navega directo a /contracts sin
 * pasar por /login.
 *
 * Tras el rediseño por flujo la UI cambió:
 *  - El encabezado ya no es "Control de contratos", ahora es "Contratos" y la
 *    tarjeta de filtros se titula "Buscar contratos"; la tabla, "Expedientes".
 *  - El buscador es un input con placeholder
 *    "RFC, teléfono, nombre o subscriber" (name="q").
 *  - El filtro de estado es un <select> etiquetado "Estado".
 *  - El contador de la paginación dice "Mostrando X–Y de N" (ya no
 *    "de N resultados"), por lo que la señal fuerte de "1 resultado" es que solo
 *    aparezca un enlace "Abrir expediente".
 *
 * Los tests que dependen de datos crean sus propias filas vía fixtures de
 * Supabase y se saltan (`test.skip`) cuando Supabase no está configurado. Los
 * tests de estructura del formulario no dependen de datos y siempre corren.
 */

test("la búsqueda por RFC deja solo el contrato coincidente", async ({ page }) => {
  const supabase = getSupabaseTestClient();
  test.skip(!supabase, "Supabase no está configurado para las pruebas E2E.");
  if (!supabase) return; // Narrowing para TS; inalcanzable tras el skip.

  // Dos expedientes con RFC distinto para comprobar que la búsqueda descarta el
  // que no coincide.
  const firmado = await createBackofficeStatusFixture(supabase, "firmado");
  const pendiente = await createBackofficeStatusFixture(supabase, "pendiente_envio");

  await page.goto(`/contracts?q=${firmado.rfc}`);

  await expect(page.getByRole("heading", { name: "Contratos", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Expedientes" })).toBeVisible();

  // El RFC buscado aparece en la tabla; el otro queda fuera del resultado.
  await expect(page.getByText(firmado.rfc).first()).toBeVisible();
  await expect(page.getByText(pendiente.rfc)).toHaveCount(0);

  // Un único expediente coincide: un solo enlace "Abrir expediente" y el
  // contador de la paginación refleja "de 1".
  await expect(page.getByRole("link", { name: "Abrir expediente" })).toHaveCount(1);
  await expect(page.getByText(/Mostrando/)).toContainText(/\bde 1\b/);
});

test("el filtro de estado compone con la búsqueda por RFC", async ({ page }) => {
  const supabase = getSupabaseTestClient();
  test.skip(!supabase, "Supabase no está configurado para las pruebas E2E.");
  if (!supabase) return;

  const pendiente = await createBackofficeStatusFixture(supabase, "pendiente_envio");

  // Con el estado que sí corresponde al expediente, la fila aparece y el select
  // conserva el valor seleccionado.
  await page.goto(`/contracts?status=pendiente_envio&q=${pendiente.rfc}`);
  await expect(page.getByText(pendiente.rfc).first()).toBeVisible();
  await expect(page.getByLabel("Estado")).toHaveValue("pendiente_envio");

  // Con un estado que NO corresponde, el mismo RFC deja de aparecer: la
  // combinación estado + búsqueda filtra de verdad.
  await page.goto(`/contracts?status=firmado&q=${pendiente.rfc}`);
  await expect(page.getByLabel("Estado")).toHaveValue("firmado");
  await expect(page.getByText(pendiente.rfc)).toHaveCount(0);
  await expect(page.getByText("Sin contratos para mostrar.").first()).toBeVisible();
});

test("la vista de contratos muestra el formulario de búsqueda y filtros", async ({ page }) => {
  // Estructura del panel de búsqueda: no depende de datos, siempre corre.
  await page.goto("/contracts");

  await expect(page.getByRole("heading", { name: "Contratos", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Buscar contratos" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Expedientes" })).toBeVisible();

  // Buscador por RFC/teléfono/nombre/subscriber.
  await expect(
    page.getByPlaceholder("RFC, teléfono, nombre o subscriber"),
  ).toBeVisible();

  // Filtro de estado con sus opciones y filtro de empleador.
  const estado = page.getByLabel("Estado");
  await expect(estado).toBeVisible();
  await expect(estado.getByRole("option", { name: "Firmado" })).toBeAttached();
  await expect(page.getByLabel("Empleador")).toBeVisible();

  // Acciones del formulario.
  await expect(page.getByRole("button", { name: "Aplicar filtros" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Restablecer" })).toBeVisible();
});

test("aplicar el filtro de estado desde el formulario actualiza la URL", async ({ page }) => {
  await page.goto("/contracts");

  await page.getByLabel("Estado").selectOption("firmado");
  await page.getByRole("button", { name: "Aplicar filtros" }).click();

  // El formulario envía por GET a /contracts, así que el estado viaja en la URL
  // y el select lo conserva tras el re-render del servidor.
  await expect(page).toHaveURL(/[?&]status=firmado(?:&|$)/);
  await expect(page.getByLabel("Estado")).toHaveValue("firmado");
});

test("Restablecer limpia los filtros activos", async ({ page }) => {
  await page.goto("/contracts?status=firmado");

  // Con un filtro activo aparece el atajo "Quitar filtros" y el select refleja
  // el estado elegido.
  await expect(page.getByRole("link", { name: "Quitar filtros" })).toBeVisible();
  await expect(page.getByLabel("Estado")).toHaveValue("firmado");

  await page.getByRole("link", { name: "Restablecer" }).click();

  // Al restablecer se vuelve a /contracts sin parámetros y el estado regresa a
  // "Todos" (valor "all").
  await expect(page).toHaveURL(/\/contracts$/);
  await expect(page.getByLabel("Estado")).toHaveValue("all");
});
