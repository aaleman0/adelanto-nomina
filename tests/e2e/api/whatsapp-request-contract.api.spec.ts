import { expect, test } from "@playwright/test";
import { LINK_TTL_MS } from "../../../src/lib/contracts/link-ttl";
import {
  createEmployeeWithOfferFixture,
  getRequiredSupabaseTestClient,
  countContractRequestsForOffer,
} from "../helpers/contract-fixtures";

// ---------------------------------------------------------------------------
// POST /api/whatsapp/request-contract
// Endpoint central del flujo WhatsApp para solicitud de contratos
// ---------------------------------------------------------------------------

test("rechaza payload sin subscriber_id", async ({ request }) => {
  const response = await request.post("/api/whatsapp/request-contract", {
    data: { rfc: "JUAP000101ABC" },
  });

  expect(response.status()).toBe(400);
  const body = await response.json();
  expect(body).toMatchObject({ ok: false, status: "invalid_request" });
  expect(body.message).toMatch(/subscriber_id/i);
});

test("rechaza payload sin RFC", async ({ request }) => {
  const response = await request.post("/api/whatsapp/request-contract", {
    data: { subscriber_id: "e2e_sub_001" },
  });

  expect(response.status()).toBe(400);
  const body = await response.json();
  expect(body).toMatchObject({ ok: false, status: "invalid_request" });
  expect(body.message).toMatch(/rfc/i);
});

test("responde not_found para RFC inexistente", async ({ request }) => {
  const response = await request.post("/api/whatsapp/request-contract", {
    data: {
      subscriber_id: "e2e_sub_notfound",
      rfc: "XXXX000000XXX",
    },
  });

  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(body).toMatchObject({ ok: false, status: "not_found" });
  expect(body.estatus_contrato).toBe("no_disponible");
});

test("responde not_eligible para empleado sin oferta vigente", async ({ request }) => {
  const supabase = getRequiredSupabaseTestClient();
  const { employee } = await createEmployeeWithOfferFixture(supabase, "ineligible", false);

  const response = await request.post("/api/whatsapp/request-contract", {
    data: {
      subscriber_id: `e2e_sub_${employee.rfc}`,
      rfc: employee.rfc,
    },
  });

  expect(response.status()).toBe(200);
  const body = await response.json();
  // La oferta fue creada con eligible=false → status="rechazada" → not_eligible o no_offer
  expect(body.ok).toBe(false);
  expect(["not_eligible", "no_offer", "not_found"]).toContain(body.status);
  expect(body.estatus_contrato).toBe("no_disponible");
});

test("genera contrato para empleado elegible", async ({ request }) => {
  const supabase = getRequiredSupabaseTestClient();
  const { employee } = await createEmployeeWithOfferFixture(supabase, "eligible", true);

  const response = await request.post("/api/whatsapp/request-contract", {
    data: {
      subscriber_id: `e2e_sub_${employee.rfc}`,
      rfc: employee.rfc,
    },
  });

  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(body).toMatchObject({
    ok: true,
    status: "contract_ready",
    estatus_contrato: "generado",
  });
  expect(body.request_id).toBeTruthy();
  expect(body.attempt_id).toBeTruthy();
  expect(body.link_easylex).toBeTruthy();
  expect(body.expires_at).toBeTruthy();
});

test("idempotencia: segunda llamada con mismo RFC reutiliza request vigente", async ({ request }) => {
  const supabase = getRequiredSupabaseTestClient();
  const { employee } = await createEmployeeWithOfferFixture(supabase, "idempotent", true);

  const payload = {
    subscriber_id: `e2e_sub_${employee.rfc}`,
    rfc: employee.rfc,
  };

  const first = await request.post("/api/whatsapp/request-contract", { data: payload });
  expect(first.status()).toBe(200);
  const firstBody = await first.json();
  expect(firstBody.status).toBe("contract_ready");
  // El primero genera de verdad: nada que reusar todavía.
  expect(firstBody.link_reusado).toBe(false);

  const second = await request.post("/api/whatsapp/request-contract", { data: payload });
  expect(second.status()).toBe(200);
  const secondBody = await second.json();

  // Segunda llamada debe devolver contract_ready con el mismo request_id
  expect(secondBody.ok).toBe(true);
  expect(["contract_ready", "already_signed"]).toContain(secondBody.status);
  expect(secondBody.request_id).toBe(firstBody.request_id);

  // Y debe DECIR que reusó. De esta bandera cuelga el texto que le llega a la
  // persona: si el pipeline deja de reportarla, el chatbot vuelve a anunciarle
  // "Generamos tu contrato" cada vez que toca el botón. Es la única prueba que
  // recorre el cableado real —las del chatbot mockean el pipeline entero—, así
  // que vive aquí aunque CI no corra la suite e2e.
  if (secondBody.status === "contract_ready") {
    expect(secondBody.link_reusado).toBe(true);
    expect(secondBody.link_easylex).toBe(firstBody.link_easylex);
  }
});

test("link generado tiene el TTL configurado", async ({ request }) => {
  const supabase = getRequiredSupabaseTestClient();
  const { employee } = await createEmployeeWithOfferFixture(supabase, "ttl", true);

  const response = await request.post("/api/whatsapp/request-contract", {
    data: {
      subscriber_id: `e2e_sub_${employee.rfc}`,
      rfc: employee.rfc,
    },
  });

  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(body.status).toBe("contract_ready");

  const expiresAt = new Date(body.expires_at).getTime();
  const now = Date.now();

  // expires_at debe caer dentro de ±5 min del TTL configurado. Se lee del propio
  // LINK_TTL_MS para que al cambiar el plazo la prueba no quede exigiendo el viejo.
  expect(expiresAt).toBeGreaterThan(now + LINK_TTL_MS - 5 * 60 * 1000);
  expect(expiresAt).toBeLessThan(now + LINK_TTL_MS + 5 * 60 * 1000);
});

test("genera contrato y queda reflejado en BD", async ({ request }) => {
  const supabase = getRequiredSupabaseTestClient();
  const { employee, offer } = await createEmployeeWithOfferFixture(supabase, "db_check", true);

  const countBefore = await countContractRequestsForOffer(supabase, offer.id);
  expect(countBefore).toBe(0);

  const response = await request.post("/api/whatsapp/request-contract", {
    data: {
      subscriber_id: `e2e_sub_${employee.rfc}`,
      rfc: employee.rfc,
    },
  });

  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(body.status).toBe("contract_ready");

  const countAfter = await countContractRequestsForOffer(supabase, offer.id);
  expect(countAfter).toBe(1);
});
