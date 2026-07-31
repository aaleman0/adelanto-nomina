// Ajusta company_settings a la combinación de validación VÁLIDA de EasyLex:
// biométrico/prueba de vida exigen id + picture en true. NO imprime secretos.
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

const base = (env.SUPABASE_URL || "").replace(/\/+$/, "");
const rest = base.replace(/\/rest\/v1$/, "") + "/rest/v1";
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!env.SUPABASE_URL || !key) { console.error("Falta SUPABASE_URL / SERVICE_ROLE_KEY"); process.exit(1); }
const headers = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "return=representation" };

const updates = { easylex_validate_id: "true", easylex_validate_picture: "true" };

for (const [k, value] of Object.entries(updates)) {
  const res = await fetch(`${rest}/company_settings?key=eq.${k}`, {
    method: "PATCH", headers, body: JSON.stringify({ value }),
  });
  const rows = await res.json();
  console.log(`PATCH ${k}=${value} → HTTP ${res.status} · ${JSON.stringify(rows)}`);
}

const res = await fetch(`${rest}/company_settings?select=key,value`, { headers });
const all = await res.json();
console.log("\nEstado final easylex_validate_*:");
for (const r of all.filter((r) => r.key.startsWith("easylex_validate")).sort((a, b) => a.key.localeCompare(b.key))) {
  console.log(`  ${r.key} = ${r.value}`);
}
