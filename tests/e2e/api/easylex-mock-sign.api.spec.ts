import { expect, test } from "@playwright/test";

test("mock-sign rechaza payload sin identificador", async ({ request }) => {
  const response = await request.post("/api/webhooks/easylex/mock-sign", {
    data: {},
  });

  expect(response.status()).toBe(400);
  const body = await response.json();
  expect(body).toMatchObject({
    ok: false,
    status: "invalid_request",
  });
});

test("mock-sign responde not_found para intento inexistente", async ({
  request,
}) => {
  const response = await request.post("/api/webhooks/easylex/mock-sign", {
    data: {
      attempt_id: "00000000-0000-0000-0000-000000000000",
    },
  });

  expect(response.status()).toBe(404);
  const body = await response.json();
  expect(body).toMatchObject({
    ok: false,
    status: "not_found",
  });
});
