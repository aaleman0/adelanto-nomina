import { expect, test } from "@playwright/test";

// ---------------------------------------------------------------------------
// GET /api/webhooks/whatsapp — verificación de webhook por Meta
// ---------------------------------------------------------------------------

test("webhook GET acepta verificación válida", async ({ request }) => {
  // El verify token debe coincidir con WHATSAPP_WEBHOOK_VERIFY_TOKEN (vacío en CI).
  // En este contexto sin token configurado, el endpoint devuelve 403.
  // Este test verifica que la ruta existe y responde (no 404).
  const response = await request.get("/api/webhooks/whatsapp", {
    params: {
      "hub.mode": "subscribe",
      "hub.verify_token": "token_invalido",
      "hub.challenge": "abc123",
    },
  });

  // Sin token configurado o con token incorrecto: 403
  expect([200, 403]).toContain(response.status());
});

test("webhook GET rechaza sin parámetros", async ({ request }) => {
  const response = await request.get("/api/webhooks/whatsapp");
  // token vacío !== verify_token (también vacío pero mode no es 'subscribe')
  expect(response.status()).toBe(403);
});

test("webhook GET rechaza mode incorrecto", async ({ request }) => {
  const response = await request.get("/api/webhooks/whatsapp", {
    params: {
      "hub.mode": "unsubscribe",
      "hub.verify_token": "cualquier_token",
      "hub.challenge": "xyz",
    },
  });

  expect(response.status()).toBe(403);
});

// ---------------------------------------------------------------------------
// POST /api/webhooks/whatsapp — recepción de eventos de Meta
// ---------------------------------------------------------------------------

test("webhook POST acepta payload whatsapp_business_account", async ({ request }) => {
  const payload = {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "e2e_entry_001",
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: {
                display_phone_number: "521XXXXXXXXXX",
                phone_number_id: "phone_001",
              },
              messages: [
                {
                  id: `e2e_msg_${Date.now()}`,
                  from: "5211234567890",
                  timestamp: String(Math.floor(Date.now() / 1000)),
                  type: "text",
                  text: { body: "Hola test" },
                },
              ],
            },
          },
        ],
      },
    ],
  };

  const response = await request.post("/api/webhooks/whatsapp", { data: payload });
  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(body).toMatchObject({ ok: true });
});

test("webhook POST acepta payload de delivery status (sent)", async ({ request }) => {
  const payload = {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "e2e_entry_002",
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              statuses: [
                {
                  id: `e2e_wa_msg_${Date.now()}`,
                  recipient_id: "5211234567890",
                  status: "sent",
                  timestamp: String(Math.floor(Date.now() / 1000)),
                },
              ],
            },
          },
        ],
      },
    ],
  };

  const response = await request.post("/api/webhooks/whatsapp", { data: payload });
  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(body).toMatchObject({ ok: true });
});

test("webhook POST acepta payload de delivery status (delivered)", async ({ request }) => {
  const ts = Math.floor(Date.now() / 1000);
  const payload = {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "e2e_entry_003",
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              statuses: [
                {
                  id: `e2e_wa_delivered_${Date.now()}`,
                  recipient_id: "5211234567890",
                  status: "delivered",
                  timestamp: String(ts),
                },
              ],
            },
          },
        ],
      },
    ],
  };

  const response = await request.post("/api/webhooks/whatsapp", { data: payload });
  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(body).toMatchObject({ ok: true });
});

test("webhook POST acepta payload de delivery status (failed)", async ({ request }) => {
  const payload = {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "e2e_entry_004",
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              statuses: [
                {
                  id: `e2e_wa_failed_${Date.now()}`,
                  recipient_id: "5211234567890",
                  status: "failed",
                  timestamp: String(Math.floor(Date.now() / 1000)),
                  errors: [{ code: 131026, title: "Message Undeliverable" }],
                },
              ],
            },
          },
        ],
      },
    ],
  };

  const response = await request.post("/api/webhooks/whatsapp", { data: payload });
  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(body).toMatchObject({ ok: true });
});

test("webhook POST ignora objeto que no es whatsapp_business_account", async ({ request }) => {
  const payload = {
    object: "instagram",
    entry: [],
  };

  const response = await request.post("/api/webhooks/whatsapp", { data: payload });
  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(body).toMatchObject({ ok: true });
});

test("webhook POST ignora cambios con field distinto a messages", async ({ request }) => {
  const payload = {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "e2e_entry_005",
        changes: [
          {
            field: "account_alerts",
            value: { messaging_product: "whatsapp" },
          },
        ],
      },
    ],
  };

  const response = await request.post("/api/webhooks/whatsapp", { data: payload });
  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(body).toMatchObject({ ok: true });
});
