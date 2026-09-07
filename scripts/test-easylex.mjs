// Smoke test de credenciales de EasyLex — NO crea documentos ni gasta firmas.
//
// Consulta el estado de un documento que no existe. La API autentica ANTES de
// buscar el documento, así que la respuesta nos dice si las llaves sirven:
//   - code 106 / "key doesn't match"  -> llaves aún incorrectas.
//   - "no existe" / 404 / cualquier otra cosa -> autenticó bien (llaves OK).
//
// Lee las variables desde .env.local; NUNCA imprime la llave secreta.
//
//   node scripts/test-easylex.mjs

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function loadEnvLocal() {
  const env = {};
  let raw;
  try {
    raw = readFileSync(join(root, ".env.local"), "utf8");
  } catch {
    console.error("❌ No se encontró .env.local en la raíz del repo.");
    process.exit(1);
  }
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

const env = loadEnvLocal();
const baseUrl = env.EASYLEX_BASE_URL;
const accessKeyId = env.EASYLEX_ACCESS_KEY_ID;
const secretAccessKey = env.EASYLEX_SECRET_ACCESS_KEY;

console.log("Config leída de .env.local:");
console.log(`  EASYLEX_BASE_URL        = ${baseUrl || "(vacío)"}`);
console.log(`  EASYLEX_ACCESS_KEY_ID   = ${accessKeyId || "(vacío)"}`);
console.log(`  EASYLEX_SECRET_ACCESS_KEY = ${secretAccessKey ? `(definida, ${secretAccessKey.length} chars)` : "(vacío)"}`);
console.log("");

if (!baseUrl || !accessKeyId || !secretAccessKey) {
  console.error("❌ Falta configuración. Revisa las tres variables en .env.local.");
  process.exit(1);
}

const url = `${baseUrl}/api/public/v2/document/status/credential-smoke-test-0000`;

console.log(`→ GET ${url}\n`);

let response;
try {
  response = await fetch(url, {
    method: "GET",
    signal: AbortSignal.timeout(20_000),
    headers: {
      "access-key-id": accessKeyId,
      "secret-access-key": secretAccessKey,
    },
  });
} catch (err) {
  console.error(`⚠️  No se pudo conectar con ${baseUrl}. ¿El EASYLEX_BASE_URL es correcto?`);
  console.error(`    Detalle: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(2);
}

let body;
const text = await response.text();
try {
  body = JSON.parse(text);
} catch {
  body = text;
}

const asString = JSON.stringify(body).toLowerCase();
const isKeyError =
  asString.includes("106") ||
  asString.includes("key doesn't match") ||
  asString.includes("public or secret");

console.log(`HTTP ${response.status}`);
console.log(`Respuesta: ${JSON.stringify(body)}\n`);

if (isKeyError) {
  console.log("❌ LLAVES INCORRECTAS (code 106). El par public/secret no corresponde a la cuenta");
  console.log("   en este ambiente. Verifica EASYLEX_ACCESS_KEY_ID / SECRET / BASE_URL.");
  process.exit(3);
} else {
  console.log("✅ AUTENTICACIÓN OK — las llaves sirven contra este ambiente.");
  console.log("   (El documento de prueba no existe, por eso el 'no encontrado'; es lo esperado.)");
  process.exit(0);
}
