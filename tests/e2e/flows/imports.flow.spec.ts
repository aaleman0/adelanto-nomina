import { expect, test } from "@playwright/test";

// ---------------------------------------------------------------------------
// Flow E2E: Página de Importaciones (/imports)
//
// Refleja la UI actual tras el rediseño por flujo:
//   - PageHeader con título "Importaciones" (antes "Importar empleados y ofertas").
//   - Formulario de subida (ImportUploadForm): paso "Selecciona el archivo",
//     dropzone de CSV y botón "Subir y validar" (habilitado para admin/operaciones).
//   - Sección "Historial de importaciones" con tabla o estado vacío.
//   - Enlace de navegación etiquetado "Importar" que apunta a /imports.
//
// La autenticación es automática (proyecto "setup" -> storageState admin), así
// que nunca hacemos login manual. Las aserciones se apoyan en encabezados,
// roles y textos estables, no en datos concretos de la tabla.
// ---------------------------------------------------------------------------

test("la página de importaciones carga con su encabezado", async ({ page }) => {
  await page.goto("/imports");

  // El título de página lo pinta PageHeader como <h1>. Usamos exact para no
  // colisionar con el encabezado "Historial de importaciones".
  await expect(
    page.getByRole("heading", { name: "Importaciones", exact: true }),
  ).toBeVisible();
});

test("el formulario de subida muestra el selector de archivo y el botón habilitado", async ({
  page,
}) => {
  await page.goto("/imports");

  // Primer paso del formulario: elegir el CSV.
  await expect(
    page.getByRole("heading", { name: "Selecciona el archivo" }),
  ).toBeVisible();
  await expect(page.getByText("Selecciona tu archivo CSV")).toBeVisible();

  // El usuario de test es admin (>= operaciones), así que el botón de subir
  // está habilitado y no aparece el aviso de rol insuficiente.
  const submit = page.getByRole("button", { name: "Subir y validar" });
  await expect(submit).toBeVisible();
  await expect(submit).toBeEnabled();
  await expect(
    page.getByText(/Tu rol no permite importar/i),
  ).toHaveCount(0);
});

test("la página de importaciones muestra la sección de historial", async ({
  page,
}) => {
  await page.goto("/imports");

  await expect(
    page.getByRole("heading", { name: "Historial de importaciones" }),
  ).toBeVisible();
});

test("el historial muestra la tabla o su estado vacío", async ({ page }) => {
  await page.goto("/imports");
  await page.waitForLoadState("networkidle");

  // El contenido del historial depende de los datos del entorno: si hay
  // importaciones se pinta la tabla (encabezado "Archivo"); si no, el estado
  // vacío. Cualquiera de los dos es un render correcto.
  const estadoVacio = page.getByText("Sin importaciones todavía");
  const encabezadoTabla = page.getByRole("columnheader", { name: "Archivo" });
  await expect(estadoVacio.or(encabezadoTabla).first()).toBeVisible();
});

test("la página de importaciones no lanza excepciones no controladas", async ({
  page,
}) => {
  // Señal fiable de un fallo real de la app: una excepción JS sin capturar.
  const uncaughtErrors: string[] = [];
  page.on("pageerror", (error) => uncaughtErrors.push(error.message));

  await page.goto("/imports");
  await page.waitForLoadState("networkidle");

  // La página debe renderizar su encabezado y no mostrar un mensaje de crash.
  await expect(
    page.getByRole("heading", { name: "Importaciones", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(/Unhandled|Failed to fetch|Application error/i),
  ).toHaveCount(0);
  expect(uncaughtErrors).toEqual([]);
});

test("la navegación principal enlaza a Importar y lleva a /imports", async ({
  page,
}) => {
  await page.goto("/");

  // La barra lateral organiza el flujo del empleado; el enlace de importación
  // se etiqueta "Importar" y apunta a /imports. Localizamos por destino para
  // ser resistentes a que el texto se oculte con la barra colapsada.
  const importLink = page.locator('a[href="/imports"]').first();
  await expect(importLink).toBeVisible();
  await expect(importLink).toHaveAccessibleName(/importar/i);

  await importLink.click();

  await expect(page).toHaveURL(/\/imports/);
  await expect(
    page.getByRole("heading", { name: "Importaciones", exact: true }),
  ).toBeVisible();
});
