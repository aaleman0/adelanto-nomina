// Inspecciona el estado de un empleado de prueba (oferta, solicitudes, intentos).
// Solo lectura. NO imprime secretos.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

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
const headers = { apikey: key, Authorization: `Bearer ${key}` };

const RFC = process.argv[2] || "GHHK674551KH1";

async function q(path) {
  const res = await fetch(`${rest}/${path}`, { headers });
  return { status: res.status, body: await res.json() };
}

const emp = await q(`employees?rfc=eq.${RFC}&select=id,rfc,nombre,telefono_normalizado`);
console.log("employees:", JSON.stringify(emp.body));
const employeeId = Array.isArray(emp.body) && emp.body[0]?.id;
if (!employeeId) { console.log("Sin empleado."); process.exit(0); }

const offers = await q(`advance_offers?employee_id=eq.${employeeId}&select=id,status,is_eligible,is_current,monto_prestamo_autorizado`);
console.log("\nadvance_offers:", JSON.stringify(offers.body, null, 1));

const reqs = await q(`contract_requests?employee_id=eq.${employeeId}&select=id,offer_id,status,requested_at,error_message`);
console.log("\ncontract_requests:", JSON.stringify(reqs.body, null, 1));

const reqIds = Array.isArray(reqs.body) ? reqs.body.map((r) => r.id) : [];
if (reqIds.length) {
  const inList = `(${reqIds.join(",")})`;
  const att = await q(`contract_attempts?contract_request_id=in.${inList}&select=id,attempt_number,status,generated_at&order=attempt_number.desc`);
  console.log(`\ncontract_attempts (${Array.isArray(att.body) ? att.body.length : "?"}):`, JSON.stringify(att.body, null, 1));
}

const bank = await q(`employee_bank_accounts?employee_id=eq.${employeeId}&select=clabe,banco,is_active`);
console.log("\nemployee_bank_accounts:", JSON.stringify(bank.body));

// Qué valores de status usan las ofertas elegibles (para saber a cuál resetear).
const distinct = await q(`advance_offers?select=status&is_eligible=eq.true&is_current=eq.true&limit=200`);
const counts = {};
if (Array.isArray(distinct.body)) for (const r of distinct.body) counts[r.status] = (counts[r.status] || 0) + 1;
console.log("\nstatus de ofertas elegibles+current (conteo):", JSON.stringify(counts));
