import { expect, test } from "@playwright/test";
import {
  createEmployeeWithOfferFixture,
  getContractAttempts,
  getContractRequestStatus,
  getOfferStatus,
  getRequiredSupabaseTestClient,
} from "../helpers/contract-fixtures";

test("webhook mock firma contrato y el backoffice muestra firmado", async ({
  page,
  request,
}) => {
  const supabase = getRequiredSupabaseTestClient();
  const { employee, offer } = await createEmployeeWithOfferFixture(
    supabase,
    "signature",
    true,
  );
  const payload = {
    subscriber_id: `e2e_signature_${Date.now()}`,
    rfc: employee.rfc,
    telefono_normalizado: employee.telefono_normalizado,
  };

  const contractResponse = await request.post(
    "/api/manychat/request-contract",
    { data: payload },
  );
  expect(contractResponse.status()).toBe(200);
  const contractBody = await contractResponse.json();
  expect(contractBody.status).toBe("contract_ready");
  expect(contractBody.request_id).toBeTruthy();
  expect(contractBody.attempt_id).toBeTruthy();

  const signResponse = await request.post("/api/webhooks/easylex/mock-sign", {
    data: {
      attempt_id: contractBody.attempt_id,
      event_id: `e2e_sign_${Date.now()}`,
    },
  });
  expect(signResponse.status()).toBe(200);
  const signBody = await signResponse.json();
  expect(signBody).toMatchObject({
    ok: true,
    status: "signed",
    contract_request_id: contractBody.request_id,
    attempt_id: contractBody.attempt_id,
  });

  const secondSignResponse = await request.post(
    "/api/webhooks/easylex/mock-sign",
    {
      data: {
        attempt_id: contractBody.attempt_id,
      },
    },
  );
  expect(secondSignResponse.status()).toBe(200);
  const secondSignBody = await secondSignResponse.json();
  expect(secondSignBody).toMatchObject({
    ok: true,
    status: "already_signed",
    contract_request_id: contractBody.request_id,
    attempt_id: contractBody.attempt_id,
  });

  const requestStatus = await getContractRequestStatus(
    supabase,
    contractBody.request_id,
  );
  expect(requestStatus.status).toBe("firmado");
  expect(requestStatus.signed_at).toBeTruthy();

  const attempts = await getContractAttempts(supabase, contractBody.request_id);
  expect(attempts).toHaveLength(1);
  expect(attempts[0].status).toBe("firmado");

  const offerStatus = await getOfferStatus(supabase, offer.id);
  expect(offerStatus.status).toBe("firmada");

  await page.goto("/");
  const row = page.locator("tr").filter({ hasText: employee.rfc });
  await expect(row).toBeVisible();
  await expect(row).toContainText("firmado");

  await page.goto(`/contracts/${employee.id}`);
  await expect(page.getByRole("heading", { name: /E2E signature/i })).toBeVisible();
  await expect(page.getByText(employee.rfc).first()).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Timeline operativo" }),
  ).toBeVisible();
  await expect(
    page.getByText("Contrato firmado por webhook mock de EasyLex."),
  ).toBeVisible();
  await expect(page.getByText("firmado").first()).toBeVisible();
});
