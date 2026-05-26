import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import {
  createBackofficeStatusFixture,
  createEmployeeWithOfferFixture,
  getRequiredSupabaseTestClient,
} from "../helpers/contract-fixtures";

// ---------------------------------------------------------------------------
// POST /api/backoffice/contracts/[contractRequestId]/regenerate-link
// POST /api/backoffice/contracts/[contractRequestId]/retry
// ---------------------------------------------------------------------------

test("regenerate-link devuelve 404 para ID inexistente", async ({ request }) => {
  const fakeId = randomUUID();
  const response = await request.post(
    `/api/backoffice/contracts/${fakeId}/regenerate-link`,
  );

  expect(response.status()).toBe(404);
  const body = await response.json();
  expect(body).toMatchObject({ ok: false, status: "not_found" });
});

test("retry devuelve 404 para ID inexistente", async ({ request }) => {
  const fakeId = randomUUID();
  const response = await request.post(
    `/api/backoffice/contracts/${fakeId}/retry`,
  );

  expect(response.status()).toBe(404);
  const body = await response.json();
  expect(body).toMatchObject({ ok: false, status: "not_found" });
});

test("regenerate-link sobre contrato con link expirado genera nuevo link", async ({ request }) => {
  const supabase = getRequiredSupabaseTestClient();
  const fixture = await createBackofficeStatusFixture(supabase, "link_expirado");

  // Obtener el contract_request_id que fue creado para este RFC
  const { data: contractRequests } = await supabase
    .from("contract_requests")
    .select("id")
    .eq("status", "link_generado")
    .order("created_at", { ascending: false })
    .limit(1);

  // Buscar por RFC via employee
  const { data: employee } = await supabase
    .from("employees")
    .select("id")
    .eq("rfc", fixture.rfc)
    .single();

  const { data: contractReq } = await supabase
    .from("contract_requests")
    .select("id")
    .eq("employee_id", employee!.id)
    .single();

  expect(contractReq).toBeTruthy();

  const response = await request.post(
    `/api/backoffice/contracts/${contractReq!.id}/regenerate-link`,
  );

  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(body.ok).toBe(true);
  expect(["link_regenerated", "link_reused"]).toContain(body.status);
  expect(body.request_id).toBe(contractReq!.id);
  expect(body.link_easylex).toBeTruthy();
  expect(body.expires_at).toBeTruthy();
});

test("regenerate-link sobre contrato ya firmado devuelve already_signed", async ({ request }) => {
  const supabase = getRequiredSupabaseTestClient();
  const fixture = await createBackofficeStatusFixture(supabase, "firmado");

  const { data: employee } = await supabase
    .from("employees")
    .select("id")
    .eq("rfc", fixture.rfc)
    .single();

  const { data: contractReq } = await supabase
    .from("contract_requests")
    .select("id")
    .eq("employee_id", employee!.id)
    .single();

  const response = await request.post(
    `/api/backoffice/contracts/${contractReq!.id}/regenerate-link`,
  );

  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(body).toMatchObject({ ok: true, status: "already_signed" });
});

test("retry sobre contrato con error genera nuevo intento", async ({ request }) => {
  const supabase = getRequiredSupabaseTestClient();
  const fixture = await createBackofficeStatusFixture(supabase, "error");

  const { data: employee } = await supabase
    .from("employees")
    .select("id")
    .eq("rfc", fixture.rfc)
    .single();

  const { data: contractReq } = await supabase
    .from("contract_requests")
    .select("id")
    .eq("employee_id", employee!.id)
    .single();

  const response = await request.post(
    `/api/backoffice/contracts/${contractReq!.id}/retry`,
  );

  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(body.ok).toBe(true);
  expect(["link_regenerated", "link_reused"]).toContain(body.status);
  expect(body.link_easylex).toBeTruthy();
});

test("regenerate-link sobre contrato con link vigente reutiliza link (link_reused)", async ({ request }) => {
  const supabase = getRequiredSupabaseTestClient();
  const fixture = await createBackofficeStatusFixture(supabase, "contrato_generado");

  const { data: employee } = await supabase
    .from("employees")
    .select("id")
    .eq("rfc", fixture.rfc)
    .single();

  const { data: contractReq } = await supabase
    .from("contract_requests")
    .select("id")
    .eq("employee_id", employee!.id)
    .single();

  const response = await request.post(
    `/api/backoffice/contracts/${contractReq!.id}/regenerate-link`,
  );

  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(body.ok).toBe(true);
  // Link vigente → se reutiliza sin crear uno nuevo
  expect(body.status).toBe("link_reused");
  expect(body.link_easylex).toBeTruthy();
});
