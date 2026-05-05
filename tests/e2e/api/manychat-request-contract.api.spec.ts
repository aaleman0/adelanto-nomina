import { expect, test } from "@playwright/test";

test("request-contract rechaza payload invalido", async ({ request }) => {
  const response = await request.post("/api/manychat/request-contract", {
    data: {},
  });

  expect(response.status()).toBe(400);
  const body = await response.json();
  expect(body).toMatchObject({
    ok: false,
    status: "invalid_request",
    estatus_contrato: "no_disponible",
  });
});

test("request-contract responde not_found para RFC inexistente", async ({
  request,
}) => {
  const response = await request.post("/api/manychat/request-contract", {
    data: {
      subscriber_id: `e2e_missing_${Date.now()}`,
      rfc: "XAXX010101000",
      telefono: "8112345678",
    },
  });

  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(body).toMatchObject({
    ok: false,
    status: "not_found",
    estatus_contrato: "no_disponible",
  });
});
