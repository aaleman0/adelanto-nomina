import { expect, test } from "@playwright/test";

// ---------------------------------------------------------------------------
// POST /api/whatsapp/bulk — validación y envío masivo
// ---------------------------------------------------------------------------

test("bulk POST rechaza payload sin mode", async ({ request }) => {
  const response = await request.post("/api/whatsapp/bulk", {
    data: { templateName: "adelanto_nomina" },
  });

  expect(response.status()).toBe(400);
  const body = await response.json();
  expect(body).toMatchObject({ ok: false });
  expect(body.error).toMatch(/mode/i);
});

test("bulk POST rechaza mode inválido", async ({ request }) => {
  const response = await request.post("/api/whatsapp/bulk", {
    data: { mode: "broadcast" },
  });

  expect(response.status()).toBe(400);
  const body = await response.json();
  expect(body).toMatchObject({ ok: false });
});

test("bulk POST rechaza mode=import sin importId", async ({ request }) => {
  const response = await request.post("/api/whatsapp/bulk", {
    data: { mode: "import" },
  });

  expect(response.status()).toBe(400);
  const body = await response.json();
  expect(body).toMatchObject({ ok: false });
  expect(body.error).toMatch(/importId/i);
});

test("bulk POST rechaza mode=manual sin employeeIds", async ({ request }) => {
  const response = await request.post("/api/whatsapp/bulk", {
    data: { mode: "manual", employeeIds: [] },
  });

  expect(response.status()).toBe(400);
  const body = await response.json();
  expect(body).toMatchObject({ ok: false });
  expect(body.error).toMatch(/employeeIds/i);
});

test("bulk POST validate con importId inexistente devuelve resultado de elegibilidad", async ({ request }) => {
  const fakeImportId = "00000000-0000-0000-0000-000000000000";
  const response = await request.post("/api/whatsapp/bulk?action=validate", {
    data: { mode: "import", importId: fakeImportId },
  });

  // Puede ser 200 con elegibles=0 o 500 si importId no existe en DB.
  // Lo importante es que no sea 400 (validación de payload pasada).
  expect([200, 500]).toContain(response.status());
  const body = await response.json();
  // Si es 200, debe tener estructura de elegibilidad
  if (response.status() === 200) {
    expect(body).toMatchObject({ ok: true });
    expect(typeof body.eligible).toBe("number");
    expect(typeof body.total).toBe("number");
  }
});

test("bulk POST send con importId inexistente devuelve error controlado", async ({ request }) => {
  const fakeImportId = "00000000-0000-0000-0000-000000000001";
  const response = await request.post("/api/whatsapp/bulk", {
    data: { mode: "import", importId: fakeImportId },
  });

  // Sin empleados elegibles o sin token configurado: error controlado (no 400)
  expect([200, 500]).toContain(response.status());
  const body = await response.json();
  // No debe crashear sin manejar el error
  expect(body).toHaveProperty("ok");
});

// ---------------------------------------------------------------------------
// GET /api/whatsapp/bulk/history — listado paginado
// ---------------------------------------------------------------------------

test("bulk/history GET devuelve estructura paginada", async ({ request }) => {
  const response = await request.get("/api/whatsapp/bulk/history");

  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(body).toMatchObject({ ok: true });
  expect(Array.isArray(body.data)).toBe(true);
  expect(typeof body.total).toBe("number");
  expect(typeof body.page).toBe("number");
  expect(typeof body.pageSize).toBe("number");
  expect(typeof body.totalPages).toBe("number");
});

test("bulk/history GET respeta paginación", async ({ request }) => {
  const response = await request.get("/api/whatsapp/bulk/history", {
    params: { page: "2", pageSize: "5" },
  });

  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(body.page).toBe(2);
  expect(body.pageSize).toBe(5);
  expect(body.data.length).toBeLessThanOrEqual(5);
});

test("bulk/history GET acepta filtro por status", async ({ request }) => {
  const response = await request.get("/api/whatsapp/bulk/history", {
    params: { status: "completed" },
  });

  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(body).toMatchObject({ ok: true });
  // Todos los registros devueltos deben tener status=completed (si existen)
  for (const item of body.data) {
    expect(item.status).toBe("completed");
  }
});

test("bulk/history GET acepta filtro por mode", async ({ request }) => {
  const response = await request.get("/api/whatsapp/bulk/history", {
    params: { mode: "import" },
  });

  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(body).toMatchObject({ ok: true });
  for (const item of body.data) {
    expect(item.mode).toBe("import");
  }
});

test("bulk/history GET acepta filtro por rango de fechas", async ({ request }) => {
  const dateFrom = "2024-01-01";
  const dateTo = "2024-12-31";
  const response = await request.get("/api/whatsapp/bulk/history", {
    params: { dateFrom, dateTo },
  });

  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(body).toMatchObject({ ok: true });
});

test("bulk/history GET pageSize máximo de 100", async ({ request }) => {
  const response = await request.get("/api/whatsapp/bulk/history", {
    params: { pageSize: "999" },
  });

  expect(response.status()).toBe(200);
  const body = await response.json();
  // El endpoint limita a 100
  expect(body.pageSize).toBe(100);
});

// ---------------------------------------------------------------------------
// GET /api/whatsapp/bulk/detail — detalle de un envío masivo
// ---------------------------------------------------------------------------

test("bulk/detail GET rechaza sin id", async ({ request }) => {
  const response = await request.get("/api/whatsapp/bulk/detail");

  expect(response.status()).toBe(400);
  const body = await response.json();
  expect(body).toMatchObject({ ok: false });
  expect(body.error).toMatch(/id/i);
});

test("bulk/detail GET devuelve 404 para id inexistente", async ({ request }) => {
  const response = await request.get("/api/whatsapp/bulk/detail", {
    params: { id: "00000000-0000-0000-0000-000000000000" },
  });

  expect(response.status()).toBe(404);
  const body = await response.json();
  expect(body).toMatchObject({ ok: false });
});

// ---------------------------------------------------------------------------
// GET /api/whatsapp/config — configuración de WhatsApp
// ---------------------------------------------------------------------------

test("whatsapp/config GET devuelve estructura de configuración", async ({ request }) => {
  const response = await request.get("/api/whatsapp/config");

  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(body).toMatchObject({ ok: true });
  expect(typeof body.config).toBe("object");
  expect(typeof body.envValid).toBe("boolean");
  expect(Array.isArray(body.envErrors)).toBe(true);
});
