import { expect, test } from "@playwright/test";
import {
  createEmployeeWithOfferFixture,
  expireContractAttempt,
  getContractAttempts,
  getContractRequestStatus,
  getRequiredSupabaseTestClient,
} from "../helpers/contract-fixtures";

test("backoffice regenera un link expirado desde el detalle", async ({
  page,
  request,
}) => {
  const supabase = getRequiredSupabaseTestClient();
  const { employee } = await createEmployeeWithOfferFixture(
    supabase,
    "backoffice regenerate",
    true,
  );
  const payload = {
    subscriber_id: `e2e_backoffice_regen_${Date.now()}`,
    rfc: employee.rfc,
    telefono_normalizado: employee.telefono_normalizado,
  };

  const contractResponse = await request.post("/api/manychat/request-contract", {
    data: payload,
  });
  expect(contractResponse.status()).toBe(200);
  const contractBody = await contractResponse.json();
  expect(contractBody.status).toBe("contract_ready");

  await expireContractAttempt(supabase, contractBody.attempt_id);

  await page.goto(`/contracts/${employee.id}`);
  await expect(
    page.getByRole("heading", { name: "Acciones operativas" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Regenerar link" }).click();

  await expect(page).toHaveURL(/action_status=link_regenerated/);
  await expect(page.getByText("Link regenerado correctamente")).toBeVisible();
  await expect(
    page.getByText("Link mock regenerado desde backoffice."),
  ).toBeVisible();

  const attempts = await getContractAttempts(supabase, contractBody.request_id);
  expect(attempts).toHaveLength(2);
  expect(attempts[0].status).toBe("expirado");
  expect(attempts[1].status).toBe("generado");
  expect(attempts[1].id).not.toBe(contractBody.attempt_id);
});

test("backoffice reintenta un contrato en error y crea nuevo intento", async ({
  request,
}) => {
  const supabase = getRequiredSupabaseTestClient();
  const { employee } = await createEmployeeWithOfferFixture(
    supabase,
    "backoffice retry",
    true,
  );
  const payload = {
    subscriber_id: `e2e_backoffice_retry_${Date.now()}`,
    rfc: employee.rfc,
    telefono_normalizado: employee.telefono_normalizado,
  };

  const contractResponse = await request.post("/api/manychat/request-contract", {
    data: payload,
  });
  expect(contractResponse.status()).toBe(200);
  const contractBody = await contractResponse.json();
  expect(contractBody.status).toBe("contract_ready");

  const { error: attemptError } = await supabase
    .from("contract_attempts")
    .update({
      status: "error",
      error_message: "E2E error para reintento",
    })
    .eq("id", contractBody.attempt_id);
  expect(attemptError).toBeNull();

  const { error: requestError } = await supabase
    .from("contract_requests")
    .update({
      status: "error",
      error_message: "E2E error para reintento",
    })
    .eq("id", contractBody.request_id);
  expect(requestError).toBeNull();

  const retryResponse = await request.post(
    `/api/backoffice/contracts/${contractBody.request_id}/retry`,
  );
  expect(retryResponse.status()).toBe(200);
  const retryBody = await retryResponse.json();
  expect(retryBody).toMatchObject({
    ok: true,
    status: "link_regenerated",
    request_id: contractBody.request_id,
  });
  expect(retryBody.attempt_id).not.toBe(contractBody.attempt_id);
  expect(retryBody.link_easylex).toBeTruthy();

  const requestStatus = await getContractRequestStatus(
    supabase,
    contractBody.request_id,
  );
  expect(requestStatus.status).toBe("link_generado");

  const attempts = await getContractAttempts(supabase, contractBody.request_id);
  expect(attempts).toHaveLength(2);
  expect(attempts[0].status).toBe("error");
  expect(attempts[1].status).toBe("generado");
  expect(attempts[1].id).toBe(retryBody.attempt_id);
});
