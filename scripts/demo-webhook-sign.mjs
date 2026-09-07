// DEMO end-to-end del Hueco 1 (paso 7): prueba el handler REAL del webhook de
// firma (/api/webhooks/easylex/sign, handleDocumentSigned) sin gastar firma.
//   1. Crea un contract_request + contract_attempt de prueba (id EasyLex mock).
//   2. Dispara un evento DOCUMENT_SIGNED al endpoint real (dev fail-open).
//   3. Verifica: attempt→firmado, request→firmado, oferta→firmada, audit_event.
//   4. Limpia todo y deja al empleado elegible otra vez.
// NO imprime secretos.  node scripts/demo-webhook-sign.mjs
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createHmac } from "node:crypto";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const env = {};
for (const line of readFileSync(join(root, ".env.local"), "utf8").split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const eq = t.indexOf("=");
  if (eq === -1) continue;
  let v = t.slice(eq + 1).trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  env[t.slice(0, eq).trim()] = v;
}
const rest = (env.SUPABASE_URL || "").replace(/\/+$/, "").replace(/\/rest\/v1$/, "") + "/rest/v1";
const key = env.SUPABASE_SERVICE_ROLE_KEY;
const H = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
const APP = env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

const EMPLOYEE = "0f2d3b3c-514a-4fc6-bbff-59d581df4386";
const OFFER = "6a429ad8-2341-45eb-9a8c-c86c10a4efc9";
const contractId = `mock_demo_${Date.now()}`;
const now = new Date().toISOString();

const post = (path, body) => fetch(`${rest}/${path}`, { method: "POST", headers: { ...H, Prefer: "return=representation" }, body: JSON.stringify(body) }).then(async r => ({ s: r.status, b: await r.json() }));
const get = (path) => fetch(`${rest}/${path}`, { headers: H }).then(r => r.json());
const del = (path) => fetch(`${rest}/${path}`, { method: "DELETE", headers: H }).then(r => r.status);
const patch = (path, body) => fetch(`${rest}/${path}`, { method: "PATCH", headers: H, body: JSON.stringify(body) }).then(r => r.status);

console.log("① Creando contrato de prueba (sin gastar firma)…");
const cr = await post("contract_requests", { employee_id: EMPLOYEE, offer_id: OFFER, status: "link_generado", requested_from: "whatsapp" });
if (cr.s >= 300) { console.error("  ✗ error creando request:", JSON.stringify(cr.b)); process.exit(1); }
const requestId = cr.b[0].id;
const at = await post("contract_attempts", {
  contract_request_id: requestId, attempt_number: 1, easylex_contract_id: contractId,
  signing_url: `https://easylex.com/documento/firma/sig-demo`, status: "generado",
  expires_at: new Date(Date.now() + 2 * 3600e3).toISOString(), generated_at: now,
});
if (at.s >= 300) { console.error("  ✗ error creando attempt:", JSON.stringify(at.b)); await del(`contract_requests?id=eq.${requestId}`); process.exit(1); }
const attemptId = at.b[0].id;
await patch(`advance_offers?id=eq.${OFFER}`, { status: "solicitada" });
console.log(`  request=${requestId}  attempt=${attemptId}  easylex_id=${contractId}`);

const snap = async (label) => {
  const [a] = await get(`contract_attempts?id=eq.${attemptId}&select=status,signed_at`);
  const [r] = await get(`contract_requests?id=eq.${requestId}&select=status,signed_at`);
  const [o] = await get(`advance_offers?id=eq.${OFFER}&select=status`);
  console.log(`  ${label}: attempt=${a?.status}  request=${r?.status}  offer=${o?.status}`);
};
console.log("\n② Estado ANTES del webhook:");
await snap("ANTES");

const bodyStr = JSON.stringify({ eventType: "DOCUMENT_SIGNED", webhookId: `demo_${Date.now()}`, data: { id: contractId, signatories: [{ id: "sig-demo", hasSigned: true, signedAt: now }] } });
const hookHeaders = { "Content-Type": "application/json" };
// Si hay secreto configurado, el webhook exige firma: mandamos un HMAC-SHA256
// del cuerpo (el esquema que ahora soporta verifyEasylexWebhook). Sin secreto,
// el dev usa fail-open y no hace falta.
if (env.EASYLEX_WEBHOOK_SECRET) {
  const sig = createHmac("sha256", env.EASYLEX_WEBHOOK_SECRET).update(bodyStr, "utf8").digest("hex");
  hookHeaders["x-easylex-signature"] = `sha256=${sig}`;
}
console.log(`\n③ Disparando POST ${APP}/api/webhooks/easylex/sign  (DOCUMENT_SIGNED, firma HMAC: ${hookHeaders["x-easylex-signature"] ? "sí" : "no (fail-open)"})…`);
let hook;
try {
  hook = await fetch(`${APP}/api/webhooks/easylex/sign`, {
    method: "POST", headers: hookHeaders, body: bodyStr, signal: AbortSignal.timeout(20000),
  });
  console.log(`  → HTTP ${hook.status} ${JSON.stringify(await hook.json())}`);
} catch (e) {
  console.error(`  ✗ no se pudo llamar al server (¿dev en ${APP}?):`, e.message);
}

console.log("\n④ Estado DESPUÉS del webhook:");
await snap("DESPUÉS");
const audit = await get(`audit_events?entity_id=eq.${requestId}&event_name=eq.contract.signed&select=event_name,new_state,source`);
const events = await get(`easylex_events?contract_request_id=eq.${requestId}&select=event_type,status`);
console.log(`  audit_events(contract.signed): ${JSON.stringify(audit)}`);
console.log(`  easylex_events: ${JSON.stringify(events)}`);

console.log("\n⑤ Limpiando (borra el contrato de prueba y deja al empleado elegible)…");
await del(`easylex_events?contract_request_id=eq.${requestId}`);
await del(`audit_events?entity_id=eq.${requestId}`);
await del(`integration_logs?entity_id=eq.${attemptId}`);
await del(`contract_attempts?id=eq.${attemptId}`);
await del(`contract_requests?id=eq.${requestId}`);
await patch(`advance_offers?id=eq.${OFFER}`, { status: "vigente" });
console.log("  ✓ limpio. Oferta de vuelta en 'vigente' (elegible).");
