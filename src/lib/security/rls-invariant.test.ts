import { describe, it, expect } from "vitest";

/**
 * Invariante de RLS: con la anon key pública (sin sesión), NINGUNA tabla del
 * backoffice debe devolver filas. Es exactamente el control cuya ausencia causó
 * la fuga de datos que se cerró — una migración de RLS sin aplicar pasa
 * desapercibida sin una verificación automatizada.
 *
 * Golpea la base real, así que está DESACTIVADO por defecto: solo corre si están
 * presentes SUPABASE_URL, SUPABASE_ANON_KEY y RUN_RLS_CHECK=1 (p. ej. un job
 * post-deploy en CI, o localmente cargando .env.local). En la suite unitaria
 * normal se salta y no toca la red.
 *
 *   set -a; . ./.env.local; set +a
 *   RUN_RLS_CHECK=1 pnpm exec vitest run src/lib/security/rls-invariant.test.ts
 */

// Las 18 tablas del esquema public que deben quedar protegidas por RLS.
const TABLES = [
  "import_batches",
  "raw_import_rows",
  "employees",
  "employee_bank_accounts",
  "advance_offers",
  "advance_offer_revisions",
  "contract_requests",
  "contract_attempts",
  "easylex_events",
  "whatsapp_contacts",
  "whatsapp_contract_messages",
  "whatsapp_bulk_sends",
  "whatsapp_templates",
  "audit_events",
  "profiles",
  "settings",
  "company_settings",
  "integration_logs",
] as const;

const url = process.env.SUPABASE_URL ?? "";
const anon = process.env.SUPABASE_ANON_KEY ?? "";
const enabled = process.env.RUN_RLS_CHECK === "1" && url !== "" && anon !== "";

// La base REST de PostgREST siempre termina en /rest/v1.
const restBase = (() => {
  const base = url.replace(/\/+$/, "");
  return base.endsWith("/rest/v1") ? base : `${base}/rest/v1`;
})();

/**
 * Filas que la anon key logra leer de una tabla. Con RLS cerrada, PostgREST
 * responde 200 con un arreglo vacío (RLS filtra filas, no rechaza la consulta);
 * si devuelve filas, RLS no está protegiendo la tabla. `missing` = la tabla no
 * existe en este entorno (404), y se ignora.
 */
async function anonReadableRows(table: string): Promise<number | "missing"> {
  const res = await fetch(`${restBase}/${table}?select=*&limit=1`, {
    headers: { apikey: anon, Authorization: `Bearer ${anon}` },
  });
  if (res.status === 404) return "missing";
  const body: unknown = await res.json().catch(() => null);
  return Array.isArray(body) ? body.length : 0;
}

describe.skipIf(!enabled)("Invariante de RLS (anon key = 0 filas)", () => {
  it.each(TABLES)(
    "%s no expone filas a la anon key",
    async (table) => {
      const rows = await anonReadableRows(table);
      if (rows === "missing") return; // tabla ausente en este entorno
      expect(
        rows,
        `${table} expone filas a la anon key pública: RLS no está protegiéndola`,
      ).toBe(0);
    },
    15_000,
  );
});
