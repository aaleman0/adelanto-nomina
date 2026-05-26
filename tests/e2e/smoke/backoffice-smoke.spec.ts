import { expect, test } from "@playwright/test";

test("backoffice carga dashboard operativo", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Dashboard operativo" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Atención requerida" })).toBeVisible();
});

test("backoffice carga control de contratos", async ({ page }) => {
  await page.goto("/contracts");

  await expect(
    page.getByRole("heading", { name: "Control de contratos" }).first(),
  ).toBeVisible();

  await expect(
    page.getByRole("columnheader", { name: "Empleado", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByPlaceholder("RFC, teléfono, nombre o subscriber"),
  ).toBeVisible();
  await expect(page.getByLabel("Estado")).toBeVisible();
  await expect(page.getByLabel("Empleador")).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Mensaje" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Contrato" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Firmado" })).toBeVisible();
});
