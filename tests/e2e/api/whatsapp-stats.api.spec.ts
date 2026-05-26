import { expect, test } from "@playwright/test";

// ---------------------------------------------------------------------------
// GET /api/whatsapp/stats          — métricas de mensajería
// GET /api/whatsapp/messages/employee — mensajes por empleado
// GET /api/whatsapp/templates      — plantillas almacenadas
// GET /api/health                  — health check general
// GET /api/health/whatsapp         — health check WhatsApp
// ---------------------------------------------------------------------------

test("GET /api/whatsapp/stats devuelve estructura correcta", async ({ request }) => {
  const response = await request.get("/api/whatsapp/stats");

  expect(response.status()).toBe(200);
  const body = await response.json();

  expect(body).toMatchObject({ ok: true });
  expect(body.stats).toMatchObject({
    sentToday: expect.any(Number),
    deliveryRate: expect.any(Number),
    errorsToday: expect.any(Number),
    totalDelivered: expect.any(Number),
  });
  expect(Array.isArray(body.recent)).toBe(true);
});

test("GET /api/whatsapp/stats deliveryRate está entre 0 y 100", async ({ request }) => {
  const response = await request.get("/api/whatsapp/stats");
  expect(response.status()).toBe(200);

  const { stats } = await response.json();
  expect(stats.deliveryRate).toBeGreaterThanOrEqual(0);
  expect(stats.deliveryRate).toBeLessThanOrEqual(100);
});

test("GET /api/whatsapp/stats campos recientes tienen forma correcta", async ({ request }) => {
  const response = await request.get("/api/whatsapp/stats");
  expect(response.status()).toBe(200);

  const { recent } = await response.json();

  for (const msg of recent) {
    expect(msg).toHaveProperty("id");
    expect(msg).toHaveProperty("employee_id");
    expect(msg).toHaveProperty("delivery_status");
    expect(msg).toHaveProperty("created_at");
  }
});

test("GET /api/whatsapp/messages/employee requiere employeeId", async ({ request }) => {
  const response = await request.get("/api/whatsapp/messages/employee");

  expect(response.status()).toBe(400);
  const body = await response.json();
  expect(body.ok).toBe(false);
  expect(body.error).toMatch(/employeeId/i);
});

test("GET /api/whatsapp/messages/employee con ID inexistente devuelve lista vacía", async ({ request }) => {
  const response = await request.get(
    "/api/whatsapp/messages/employee?employeeId=00000000-0000-0000-0000-000000000000",
  );

  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(body).toMatchObject({ ok: true, messages: [] });
});

test("GET /api/whatsapp/templates devuelve estructura correcta", async ({ request }) => {
  const response = await request.get("/api/whatsapp/templates");

  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(body).toMatchObject({ ok: true });
  expect(Array.isArray(body.templates)).toBe(true);
});

test("GET /api/health devuelve status y servicios", async ({ request }) => {
  const response = await request.get("/api/health");

  // En entorno de test puede ser 200 (ok) o 503 (degraded si no hay Supabase)
  expect([200, 503]).toContain(response.status());
  const body = await response.json();

  expect(body).toHaveProperty("ok");
  expect(body).toHaveProperty("status");
  expect(body).toHaveProperty("timestamp");
  expect(body).toHaveProperty("services");
  expect(body.services).toHaveProperty("supabase");
  expect(body.services).toHaveProperty("whatsapp");
});

test("GET /api/health/whatsapp devuelve checks de tablas y env", async ({ request }) => {
  const response = await request.get("/api/health/whatsapp");

  expect([200, 503]).toContain(response.status());
  const body = await response.json();

  expect(body).toHaveProperty("ok");
  expect(body).toHaveProperty("status");
  expect(body).toHaveProperty("checks");
  expect(body.checks).toHaveProperty("supabase");
  expect(body.checks).toHaveProperty("env");
  expect(body.checks).toHaveProperty("tables");
});
