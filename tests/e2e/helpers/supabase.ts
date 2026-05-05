import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export type EligibleContractFixture = {
  rfc: string;
  telefono_normalizado: string | null;
  empleado: string | null;
};

export function getSupabaseTestClient() {
  loadLocalEnv();

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return null;
  }

  return createClient(new URL(supabaseUrl).origin, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

function loadLocalEnv() {
  const envPath = resolve(process.cwd(), ".env.local");

  if (!existsSync(envPath)) {
    return;
  }

  const envText = readFileSync(envPath, "utf8");

  for (const line of envText.split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
      continue;
    }

    const [key, ...valueParts] = trimmed.split("=");
    const value = valueParts.join("=").trim().replace(/^["']|["']$/g, "");

    if (key && !process.env[key]) {
      process.env[key] = value;
    }
  }
}

export async function findEligibleContractFixture() {
  const supabase = getSupabaseTestClient();

  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase
    .from("backoffice_contract_control_v1")
    .select("rfc, telefono_normalizado, empleado, is_eligible, offer_id")
    .eq("is_eligible", true)
    .not("offer_id", "is", null)
    .order("last_movement_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  if (error || !data?.rfc) {
    return null;
  }

  return {
    rfc: data.rfc,
    telefono_normalizado: data.telefono_normalizado ?? null,
    empleado: data.empleado ?? null,
  } satisfies EligibleContractFixture;
}
