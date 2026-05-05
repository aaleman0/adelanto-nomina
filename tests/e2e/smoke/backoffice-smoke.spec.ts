import { expect, test } from "@playwright/test";

test("backoffice carga control de contratos e importaciones", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Adelantos" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Control de contratos" }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Evidencia operativa de mensaje, solicitud, link, firma y tiempos.",
    ),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Importar CSV" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Importaciones recientes" }),
  ).toBeVisible();

  await expect(
    page.getByRole("columnheader", { name: "Empleado", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByPlaceholder("RFC, telefono, nombre o subscriber"),
  ).toBeVisible();
  await expect(page.getByLabel("Estado")).toBeVisible();
  await expect(page.getByLabel("Empleador")).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Mensaje" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Contrato" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Firmado" })).toBeVisible();
});
