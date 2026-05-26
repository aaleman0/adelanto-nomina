import { expect, test } from "@playwright/test";
import {
  createBackofficeStatusFixture,
  getRequiredSupabaseTestClient,
} from "../helpers/contract-fixtures";

test("backoffice muestra estados clave de control operativo", async ({
  page,
}) => {
  const supabase = getRequiredSupabaseTestClient();
  const fixtures = await Promise.all([
    createBackofficeStatusFixture(supabase, "contrato_generado"),
    createBackofficeStatusFixture(supabase, "link_expirado"),
    createBackofficeStatusFixture(supabase, "firmado"),
    createBackofficeStatusFixture(supabase, "error"),
  ]);

  for (const fixture of fixtures) {
    await page.goto(`/contracts?q=${fixture.rfc}`);
    const row = page.locator("tr").filter({ hasText: fixture.rfc });
    await expect(row).toBeVisible();
    await expect(row).toContainText(fixture.expectedStatusText);
  }
});
