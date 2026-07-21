import { expect, test } from "@playwright/test";
import { createBackofficeStatusFixture } from "../helpers/contract-fixtures";
import { getSupabaseTestClient } from "../helpers/supabase";

// ---------------------------------------------------------------------------
// Flow E2E: Estados de control operativo visibles en el backoffice.
//
// El rediseño por flujo movió esta información a /contracts ("Contratos"):
//   - Un tablero resumen con los estados clave: "Requieren atención",
//     "Con error" y "Firmados".
//   - Un filtro "Estado" que acota los expedientes por estado operativo.
//   - La tabla "Expedientes", donde cada fila muestra su estado como badge
//     (p. ej. "firmado", "link expirado", "contrato generado", "error").
//
// La intención del test viejo se conserva —comprobar que los estados de
// control se ven en el backoffice— pero con selectores por rol/texto y con
// tolerancia a datos: los casos que necesitan sembrar en Supabase se saltan
// (test.skip) cuando no está configurado, en lugar de reventar.
//
// La autenticación es AUTOMÁTICA (proyecto "setup" + storageState): el fixture
// `page` ya viaja como usuario admin, así que se navega directo a /contracts
// sin pasar por /login.
// ---------------------------------------------------------------------------

// Estados operativos clave que el backoffice debe poder mostrar y filtrar.
// El valor es el que viaja en ?status=; la etiqueta es el texto del badge en
// la tabla (formatStatus reemplaza "_" por espacios).
const ESTADOS_CLAVE = [
  { value: "firmado", label: "firmado" },
  { value: "error", label: "error" },
  { value: "link_expirado", label: "link expirado" },
  { value: "contrato_generado", label: "contrato generado" },
] as const;

test("el backoffice de contratos expone el tablero y el filtro de estados operativos", async ({
  page,
}) => {
  await page.goto("/contracts");

  // Encabezado de la sección.
  await expect(
    page.getByRole("heading", { name: "Contratos", exact: true }),
  ).toBeVisible();

  // Tablero resumen: son los estados agregados de control operativo. Se
  // renderizan siempre (aunque el valor sea 0), así que no dependen de datos.
  await expect(page.getByText("Requieren atención").first()).toBeVisible();
  await expect(page.getByText("Con error").first()).toBeVisible();
  await expect(page.getByText("Firmados").first()).toBeVisible();

  // Panel de búsqueda con el filtro por estado.
  await expect(
    page.getByRole("heading", { name: "Buscar contratos" }),
  ).toBeVisible();
  await expect(
    page.getByPlaceholder("RFC, teléfono, nombre o subscriber"),
  ).toBeVisible();
  // El filtro es un <select> envuelto por su <label> "Estado"; se localiza por
  // label (mismo patrón que el resto de tests de /contracts).
  await expect(page.getByLabel("Estado")).toBeVisible();
  await expect(page.getByRole("button", { name: "Aplicar filtros" })).toBeVisible();

  // El select ofrece cada estado operativo clave como opción seleccionable.
  const estadoSelect = page.getByLabel("Estado");
  for (const estado of ESTADOS_CLAVE) {
    await expect(estadoSelect.locator(`option[value="${estado.value}"]`)).toHaveCount(1);
  }

  // La tabla de expedientes es donde se leen los estados por fila.
  await expect(
    page.getByRole("heading", { name: "Expedientes" }),
  ).toBeVisible();
});

test("filtrar por estado acota los expedientes y refleja el estado elegido", async ({
  page,
}) => {
  const tabla = page.getByRole("table");

  for (const estado of ESTADOS_CLAVE) {
    await test.step(`estado = ${estado.value}`, async () => {
      await page.goto(`/contracts?status=${estado.value}`);

      // El filtro debe quedar aplicado en el select.
      await expect(page.getByLabel("Estado")).toHaveValue(estado.value);

      // Aserción tolerante a datos: o hay expedientes con ese estado (badge
      // visible en la tabla) o la tabla muestra el vacío. Cualquiera de las dos
      // demuestra que el estado operativo es un eje de control real. El `.first()`
      // sobre la unión evita una violación de strict mode cuando hay varias filas
      // con el mismo estado (varios badges idénticos).
      const vacio = tabla.getByText("Sin contratos para mostrar.");
      const badge = tabla.getByText(estado.label, { exact: true });
      await expect(vacio.or(badge).first()).toBeVisible();
    });
  }
});

test("cada estado sembrado aparece con su etiqueta en el expediente filtrado", async ({
  page,
}) => {
  const supabase = getSupabaseTestClient();
  test.skip(!supabase, "Supabase no está configurado para pruebas E2E.");
  if (!supabase) return;

  // Se siembran los cuatro estados de control representativos.
  const fixtures = await Promise.all([
    createBackofficeStatusFixture(supabase, "contrato_generado"),
    createBackofficeStatusFixture(supabase, "link_expirado"),
    createBackofficeStatusFixture(supabase, "firmado"),
    createBackofficeStatusFixture(supabase, "error"),
  ]);

  for (const fixture of fixtures) {
    await page.goto(`/contracts?q=${fixture.rfc}`);

    // El RFC solo se renderiza en la tabla de escritorio (las tarjetas móviles
    // no lo incluyen); el viewport por defecto (Desktop Chrome, 1280px) muestra
    // esa tabla.
    const fila = page.getByRole("row").filter({ hasText: fixture.rfc });
    await expect(fila).toBeVisible();

    // La fila muestra el estado operativo como badge.
    await expect(fila).toContainText(fixture.expectedStatusText);

    // Y ofrece abrir el expediente.
    await expect(
      fila.getByRole("link", { name: "Abrir expediente" }),
    ).toBeVisible();
  }
});

test("abrir un expediente muestra su detalle de estado operativo", async ({
  page,
}) => {
  const supabase = getSupabaseTestClient();
  test.skip(!supabase, "Supabase no está configurado para pruebas E2E.");
  if (!supabase) return;

  // Se usa el estado "error" por ser el más distintivo de la cola de control.
  const fixture = await createBackofficeStatusFixture(supabase, "error");

  await page.goto(`/contracts?q=${fixture.rfc}`);

  const fila = page.getByRole("row").filter({ hasText: fixture.rfc });
  await expect(fila).toBeVisible();
  await fila.getByRole("link", { name: "Abrir expediente" }).click();

  // Estamos en el detalle del expediente.
  await expect(page).toHaveURL(/\/contracts\/[0-9a-f-]+/);

  // El detalle desglosa el estado operativo: progreso, acciones y las tarjetas
  // de estado por etapa del flujo.
  await expect(page.getByRole("heading", { name: "Progreso" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Acciones" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Contrato" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Link de firma" })).toBeVisible();

  // Las acciones operativas del expediente están siempre presentes (habilitadas
  // o no según el estado del contrato).
  await expect(
    page.getByRole("button", { name: "Regenerar link" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Reintentar flujo" }),
  ).toBeVisible();

  // La nota explicativa acompaña siempre a la tarjeta de Acciones, en alguna de
  // sus tres variantes según el estado del contrato. Este fixture "error" sí
  // tiene solicitud de contrato, por lo que NO muestra la variante de
  // "Las acciones se habilitan…"; se usa un matcher tolerante a las tres.
  await expect(
    page.getByText(
      /Las acciones se habilitan|ya está firmado|Si el link sigue vigente/i,
    ),
  ).toBeVisible();

  // Regreso a la lista de contratos.
  await expect(
    page.getByRole("link", { name: "Volver", exact: true }),
  ).toBeVisible();
});
