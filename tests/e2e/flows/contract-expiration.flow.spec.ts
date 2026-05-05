import { expect, test } from "@playwright/test";
import {
  createEmployeeWithOfferFixture,
  expireContractAttempt,
  getContractAttempts,
  getRequiredSupabaseTestClient,
} from "../helpers/contract-fixtures";

test("link expirado genera un nuevo intento dentro de la misma solicitud", async ({
  request,
}) => {
  const supabase = getRequiredSupabaseTestClient();
  const { employee } = await createEmployeeWithOfferFixture(
    supabase,
    "expired link",
    true,
  );
  const payload = {
    subscriber_id: `e2e_expired_${Date.now()}`,
    rfc: employee.rfc,
    telefono_normalizado: employee.telefono_normalizado,
  };

  const firstResponse = await request.post("/api/manychat/request-contract", {
    data: payload,
  });
  expect(firstResponse.status()).toBe(200);
  const firstBody = await firstResponse.json();
  expect(firstBody.status).toBe("contract_ready");
  expect(firstBody.attempt_id).toBeTruthy();
  expect(firstBody.link_easylex).toBeTruthy();

  await expireContractAttempt(supabase, firstBody.attempt_id);

  const secondResponse = await request.post("/api/manychat/request-contract", {
    data: payload,
  });
  expect(secondResponse.status()).toBe(200);
  const secondBody = await secondResponse.json();
  expect(secondBody.status).toBe("contract_ready");
  expect(secondBody.request_id).toBe(firstBody.request_id);
  expect(secondBody.attempt_id).not.toBe(firstBody.attempt_id);
  expect(secondBody.link_easylex).not.toBe(firstBody.link_easylex);

  const attempts = await getContractAttempts(supabase, firstBody.request_id);
  expect(attempts).toHaveLength(2);
  expect(attempts[0].status).toBe("expirado");
  expect(attempts[1].id).toBe(secondBody.attempt_id);
});
