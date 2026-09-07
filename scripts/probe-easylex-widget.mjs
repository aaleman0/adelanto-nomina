// Consulta datos del signer/widget en EasyLex para descubrir la URL pública de
// firma canónica. Solo lectura. NO gasta firma ni manda correos. No imprime secretos.
//   node scripts/probe-easylex-widget.mjs <signerId>
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
const baseUrl = env.EASYLEX_BASE_URL;
const headers = { "access-key-id": env.EASYLEX_ACCESS_KEY_ID, "secret-access-key": env.EASYLEX_SECRET_ACCESS_KEY };
const signerId = process.argv[2] || "sig-2mSqy3Mv0rxRnZFc";

for (const path of [
  `/api/public/v2/document/signer/${signerId}`,
  `/api/public/v2/document/widget/${signerId}`,
]) {
  console.log(`\n→ GET ${baseUrl}${path}`);
  try {
    const res = await fetch(`${baseUrl}${path}`, { headers, signal: AbortSignal.timeout(20000) });
    const text = await res.text();
    let body; try { body = JSON.parse(text); } catch { body = text; }
    console.log(`HTTP ${res.status}`);
    console.dir(body, { depth: null });
  } catch (e) {
    console.log("error:", e instanceof Error ? e.message : String(e));
  }
}
