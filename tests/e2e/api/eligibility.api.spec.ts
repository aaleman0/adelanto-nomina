import { expect, test } from "@playwright/test";
import {
  countContractRequestsForOffer,
  createEmployeeFixture,
  createEmployeeWithOfferFixture,
  getRequiredSupabaseTestClient,
} from "../helpers/contract-fixtures";

test("empleado no elegible no genera contrato", async ({ request }) => {
  const supabase = getRequiredSupabaseTestClient();
  const { employee, offer } = await createEmployeeWithOfferFixture(
    supabase,
    "not eligible",
    false,
  );

  const response = await request.post("/api/manychat/request-contract", {
    data: {
      subscriber_id: `e2e_not_eligible_${Date.now()}`,
      rfc: employee.rfc,
      telefono_normalizado: employee.telefono_normalizado,
    },
  });

  expect(response.status()).toBe(200);
  await expect(response).toBeOK();
  const body = await response.json();
  expect(body).toMatchObject({
    ok: false,
    status: "not_eligible",
    estatus_contrato: "no_disponible",
  });
  await expect
    .poll(() => countContractRequestsForOffer(supabase, offer.id))
    .toBe(0);
});

test("RFC valido sin oferta vigente responde no_offer", async ({ request }) => {
  const supabase = getRequiredSupabaseTestClient();
  const employee = await createEmployeeFixture(supabase, "no offer");

  const response = await request.post("/api/manychat/request-contract", {
    data: {
      subscriber_id: `e2e_no_offer_${Date.now()}`,
      rfc: employee.rfc,
      telefono_normalizado: employee.telefono_normalizado,
    },
  });

  expect(response.status()).toBe(200);
  await expect(response).toBeOK();
  const body = await response.json();
  expect(body).toMatchObject({
    ok: false,
    status: "no_offer",
    estatus_contrato: "no_disponible",
  });
});
