import { expect, test } from "@playwright/test";
import {
  createEmployeeWithOfferFixture,
  getRequiredSupabaseTestClient,
} from "../helpers/contract-fixtures";

test("request-contract genera o reutiliza contrato mock y se refleja en backoffice", async ({
  page,
  request,
}) => {
  const supabase = getRequiredSupabaseTestClient();
  const { employee } = await createEmployeeWithOfferFixture(
    supabase,
    "mock flow",
    true,
  );

  const subscriberId = `e2e_contract_${Date.now()}`;
  const payload = {
    subscriber_id: subscriberId,
    rfc: employee.rfc,
    telefono_normalizado: employee.telefono_normalizado,
  };

  const firstResponse = await request.post("/api/manychat/request-contract", {
    data: payload,
  });
  expect(firstResponse.status()).toBe(200);
  const firstBody = await firstResponse.json();
  expect(["contract_ready", "already_signed"]).toContain(firstBody.status);
  expect(firstBody.ok).toBe(true);
  expect(firstBody.request_id).toBeTruthy();

  const secondResponse = await request.post("/api/manychat/request-contract", {
    data: payload,
  });
  expect(secondResponse.status()).toBe(200);
  const secondBody = await secondResponse.json();
  expect(secondBody.request_id).toBe(firstBody.request_id);

  if (firstBody.link_easylex && secondBody.link_easylex) {
    expect(secondBody.link_easylex).toBe(firstBody.link_easylex);
    expect(secondBody.expires_at).toBe(firstBody.expires_at);
  }

  await page.goto("/");
  await expect(page.getByText(employee.rfc).first()).toBeVisible();
  await expect(
    page.getByText(/contrato generado|firmado|link expirado/i).first(),
  ).toBeVisible();
});
