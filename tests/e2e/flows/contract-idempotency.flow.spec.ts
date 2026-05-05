import { expect, test } from "@playwright/test";
import {
  countContractRequestsForOffer,
  createEmployeeWithOfferFixture,
  getContractAttempts,
  getRequiredSupabaseTestClient,
} from "../helpers/contract-fixtures";

test("dos clics con el mismo RFC no duplican contrato y reutilizan link vigente", async ({
  request,
}) => {
  const supabase = getRequiredSupabaseTestClient();
  const { employee, offer } = await createEmployeeWithOfferFixture(
    supabase,
    "idempotency",
    true,
  );
  const payload = {
    subscriber_id: `e2e_idempotency_${Date.now()}`,
    rfc: employee.rfc,
    telefono_normalizado: employee.telefono_normalizado,
  };

  const firstResponse = await request.post("/api/manychat/request-contract", {
    data: payload,
  });
  expect(firstResponse.status()).toBe(200);
  const firstBody = await firstResponse.json();
  expect(firstBody.status).toBe("contract_ready");
  expect(firstBody.request_id).toBeTruthy();
  expect(firstBody.link_easylex).toBeTruthy();

  const secondResponse = await request.post("/api/manychat/request-contract", {
    data: payload,
  });
  expect(secondResponse.status()).toBe(200);
  const secondBody = await secondResponse.json();
  expect(secondBody.status).toBe("contract_ready");
  expect(secondBody.request_id).toBe(firstBody.request_id);
  expect(secondBody.link_easylex).toBe(firstBody.link_easylex);
  expect(secondBody.expires_at).toBe(firstBody.expires_at);

  await expect
    .poll(() => countContractRequestsForOffer(supabase, offer.id))
    .toBe(1);

  const attempts = await getContractAttempts(supabase, firstBody.request_id);
  expect(attempts).toHaveLength(1);
});
