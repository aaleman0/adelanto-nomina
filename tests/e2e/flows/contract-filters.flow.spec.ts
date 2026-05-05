import { expect, test } from "@playwright/test";
import {
  createBackofficeStatusFixture,
  getRequiredSupabaseTestClient,
} from "../helpers/contract-fixtures";

test("busqueda por RFC y filtro de estado reducen el control de contratos", async ({
  page,
}) => {
  const supabase = getRequiredSupabaseTestClient();
  const firmado = await createBackofficeStatusFixture(supabase, "firmado");
  const pendiente = await createBackofficeStatusFixture(
    supabase,
    "pendiente_envio",
  );

  await page.goto(`/?q=${firmado.rfc}`);
  await expect(page.getByText(firmado.rfc).first()).toBeVisible();
  await expect(page.getByText(pendiente.rfc)).toHaveCount(0);
  await expect(page.getByText("Mostrando")).toContainText("de 1 resultados");

  await page.goto("/?status=firmado");
  await expect(page.getByRole("heading", { name: "Control de contratos" })).toBeVisible();
  await expect(page.getByText("firmado").first()).toBeVisible();
});
