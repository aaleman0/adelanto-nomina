// Lee company_settings de EasyLex (banderas de validación) para diagnosticar.
// NO imprime el service-role key.
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

const url = (env.SUPABASE_URL || "").replace(/\/+$/, "");
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error("Falta SUPABASE_URL / SERVICE_ROLE_KEY"); process.exit(1); }

// El SUPABASE_URL de .env.local ya incluye /rest/v1; usar tal cual.
const rest = url.replace(/\/rest\/v1$/, "") + "/rest/v1";
const headers = { apikey: key, Authorization: `Bearer ${key}` };

const target = `${rest}/company_settings?select=key,value`;
console.log(`GET ${target}`);
const res = await fetch(target, { headers });
const rows = await res.json();
console.log(`HTTP ${res.status}`);
if (!Array.isArray(rows)) { console.dir(rows, { depth: null }); process.exit(1); }

const easylex = rows.filter((r) => String(r.key).startsWith("easylex"));
console.log(`Total ajustes: ${rows.length}. Ajustes easylex_*:`);
if (easylex.length) {
  for (const r of easylex) console.log(`  ${r.key} = ${r.value}`);
} else {
  console.log("  (ninguno — todas las validaciones toman su default = false)");
}
