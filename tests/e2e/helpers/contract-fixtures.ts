import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseTestClient } from "./supabase";

export type TestEmployee = {
  id: string;
  rfc: string;
  telefono_normalizado: string;
};

export type TestOffer = {
  id: string;
  employee_id: string;
};

export type TestContractRequest = {
  id: string;
  employee_id: string;
  offer_id: string;
};

export type TestContractAttempt = {
  id: string;
  contract_request_id: string;
  attempt_number: number;
  signing_url: string | null;
  expires_at: string | null;
};

export type TestEmployeeWithOffer = {
  employee: TestEmployee;
  offer: TestOffer;
};

export type BackofficeStatusFixture = {
  rfc: string;
  expectedStatusText: string;
};

type ContractState =
  | "pendiente_envio"
  | "contrato_generado"
  | "link_expirado"
  | "firmado"
  | "error";

export function getRequiredSupabaseTestClient() {
  const supabase = getSupabaseTestClient();

  if (!supabase) {
    throw new Error("Supabase no esta configurado para pruebas E2E.");
  }

  return supabase;
}

export async function createEmployeeFixture(
  supabase: SupabaseClient,
  label: string,
) {
  const unique = randomUUID().replace(/-/g, "");
  const rfc = buildRfc(unique);
  const telefonoNormalizado = buildPhone(unique);

  const { data, error } = await supabase
    .from("employees")
    .insert({
      rfc,
      curp: null,
      nombre: `E2E ${label}`,
      apellidos: unique.slice(0, 8).toUpperCase(),
      cp_csf: "64000",
      telefono: telefonoNormalizado,
      telefono_normalizado: telefonoNormalizado,
      email: `e2e-${unique.slice(0, 12)}@example.test`,
      empleador: "E2E Testing",
    })
    .select("id, rfc, telefono_normalizado")
    .single();

  if (error) {
    throw error;
  }

  return data as TestEmployee;
}

export async function createOfferFixture(
  supabase: SupabaseClient,
  employeeId: string,
  eligible: boolean,
) {
  const { data, error } = await supabase
    .from("advance_offers")
    .insert({
      employee_id: employeeId,
      monto_prestamo_autorizado: eligible ? 2500 : 0,
      estatus_p_esta_q: "E2E",
      estatus_conversion: eligible ? "aceptada" : "rechazada",
      estatus_cliente: "E2E",
      is_current: true,
      status: eligible ? "vigente" : "rechazada",
      source_hash: `e2e-${randomUUID()}`,
    })
    .select("id, employee_id")
    .single();

  if (error) {
    throw error;
  }

  return data as TestOffer;
}

export async function createEmployeeWithOfferFixture(
  supabase: SupabaseClient,
  label: string,
  eligible: boolean,
) {
  const employee = await createEmployeeFixture(supabase, label);
  const offer = await createOfferFixture(supabase, employee.id, eligible);

  return { employee, offer } satisfies TestEmployeeWithOffer;
}

export async function countContractRequestsForOffer(
  supabase: SupabaseClient,
  offerId: string,
) {
  const { count, error } = await supabase
    .from("contract_requests")
    .select("id", { count: "exact", head: true })
    .eq("offer_id", offerId);

  if (error) {
    throw error;
  }

  return count ?? 0;
}

export async function getContractAttempts(
  supabase: SupabaseClient,
  contractRequestId: string,
) {
  const { data, error } = await supabase
    .from("contract_attempts")
    .select("id, contract_request_id, attempt_number, signing_url, expires_at, status")
    .eq("contract_request_id", contractRequestId)
    .order("attempt_number", { ascending: true });

  if (error) {
    throw error;
  }

  return data ?? [];
}

export async function getContractRequestStatus(
  supabase: SupabaseClient,
  contractRequestId: string,
) {
  const { data, error } = await supabase
    .from("contract_requests")
    .select("status, signed_at")
    .eq("id", contractRequestId)
    .single();

  if (error) {
    throw error;
  }

  return data as { status: string; signed_at: string | null };
}

export async function getOfferStatus(
  supabase: SupabaseClient,
  offerId: string,
) {
  const { data, error } = await supabase
    .from("advance_offers")
    .select("status")
    .eq("id", offerId)
    .single();

  if (error) {
    throw error;
  }

  return data as { status: string };
}

export async function expireContractAttempt(
  supabase: SupabaseClient,
  attemptId: string,
) {
  const expiredAt = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const { error } = await supabase
    .from("contract_attempts")
    .update({ expires_at: expiredAt })
    .eq("id", attemptId);

  if (error) {
    throw error;
  }
}

export async function createBackofficeStatusFixture(
  supabase: SupabaseClient,
  state: ContractState,
) {
  const { employee, offer } = await createEmployeeWithOfferFixture(
    supabase,
    state,
    true,
  );

  if (state === "pendiente_envio") {
    return {
      rfc: employee.rfc,
      expectedStatusText: "pendiente envio",
    } satisfies BackofficeStatusFixture;
  }

  const contractRequest = await createContractRequestFixture(
    supabase,
    employee,
    offer,
    state,
  );

  await createContractAttemptFixture(supabase, contractRequest, state);

  return {
    rfc: employee.rfc,
    expectedStatusText: state.replaceAll("_", " "),
  } satisfies BackofficeStatusFixture;
}

async function createContractRequestFixture(
  supabase: SupabaseClient,
  employee: TestEmployee,
  offer: TestOffer,
  state: ContractState,
) {
  const signedAt =
    state === "firmado" ? new Date().toISOString() : null;
  const status =
    state === "firmado"
      ? "firmado"
      : state === "error"
        ? "error"
        : "link_generado";

  const { data, error } = await supabase
    .from("contract_requests")
    .insert({
      employee_id: employee.id,
      offer_id: offer.id,
      status,
      requested_from: "e2e",
      manychat_subscriber_id: `e2e_${randomUUID()}`,
      contract_snapshot: {
        rfc: employee.rfc,
        telefono_normalizado: employee.telefono_normalizado,
        source: "e2e_status_fixture",
      },
      signed_at: signedAt,
      error_message: state === "error" ? "E2E error controlado" : null,
    })
    .select("id, employee_id, offer_id")
    .single();

  if (error) {
    throw error;
  }

  return data as TestContractRequest;
}

async function createContractAttemptFixture(
  supabase: SupabaseClient,
  contractRequest: TestContractRequest,
  state: ContractState,
) {
  const now = new Date();
  const expiresAt =
    state === "link_expirado"
      ? new Date(Date.now() - 5 * 60 * 1000)
      : new Date(Date.now() + 2 * 60 * 60 * 1000);
  const signedAt = state === "firmado" ? now.toISOString() : null;
  const status =
    state === "firmado"
      ? "firmado"
      : state === "error"
        ? "error"
        : "generado";
  const attemptId = randomUUID();

  const { data, error } = await supabase
    .from("contract_attempts")
    .insert({
      id: attemptId,
      contract_request_id: contractRequest.id,
      attempt_number: 1,
      easylex_contract_id: `e2e_${attemptId}`,
      signing_url: `https://mock.easylex.local/firmar/${attemptId}`,
      status,
      expires_at: expiresAt.toISOString(),
      generated_at: now.toISOString(),
      signed_at: signedAt,
      error_message: state === "error" ? "E2E error controlado" : null,
      raw_response: {
        source: "e2e_status_fixture",
        state,
      },
    })
    .select("id, contract_request_id, attempt_number, signing_url, expires_at")
    .single();

  if (error) {
    throw error;
  }

  return data as TestContractAttempt;
}

function buildRfc(seed: string) {
  const letters = seed
    .replace(/[^a-f]/g, "")
    .padEnd(4, "a")
    .slice(0, 4)
    .toUpperCase();
  const suffix = seed
    .replace(/[^a-z0-9]/gi, "")
    .padEnd(3, "0")
    .slice(-3)
    .toUpperCase();

  return `${letters}010101${suffix}`;
}

function buildPhone(seed: string) {
  const digits = seed.replace(/\D/g, "").padEnd(10, "7").slice(0, 10);
  return `52${digits}`;
}
