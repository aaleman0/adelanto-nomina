// Sonda de createDocument de EasyLex — replica la petición real y MUESTRA la
// respuesta de error completa (el log de la app recorta `description` como
// [Object]). Un 400 de validación NO crea documento, así que no gasta firma.
//
// Lee credenciales de .env.local; NUNCA imprime la secreta.
// Uso:  node scripts/probe-easylex-create.mjs [tipoDocumento]
//   ej. node scripts/probe-easylex-create.mjs DISI

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function loadEnvLocal() {
  const env = {};
  const raw = readFileSync(join(root, ".env.local"), "utf8");
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    env[k] = v;
  }
  return env;
}

const env = loadEnvLocal();
const baseUrl = env.EASYLEX_BASE_URL;
const accessKeyId = env.EASYLEX_ACCESS_KEY_ID;
const secretAccessKey = env.EASYLEX_SECRET_ACCESS_KEY;
const docType = process.argv[2] || "DISI";
// 2º arg: validaciones a poner en true, separadas por coma (ej. "biometric,liveness").
const enabled = new Set((process.argv[3] || "").split(",").map((s) => s.trim()).filter(Boolean));

if (!baseUrl || !accessKeyId || !secretAccessKey) {
  console.error("❌ Falta EASYLEX_BASE_URL / ACCESS_KEY_ID / SECRET en .env.local.");
  process.exit(1);
}

const pdf = readFileSync(join(root, "scripts", "test-filled-contract.pdf"));
const expirationDate = "2026-08-27";

const form = new FormData();
form.append("fileName", "sonda_diagnostico");
form.append("type", docType);
form.append("sendEmail", "false");
form.append("expirationDate", expirationDate);
const flagMap = {
  validateId: "id", validateSms: "sms", validatePicture: "picture", validateEmail: "email",
  validateBiometric: "biometric", validateLiveness: "liveness", validateVoice: "voice",
};
for (const [field, name] of Object.entries(flagMap)) {
  form.append(field, enabled.has(name) ? "true" : "false");
}
form.append("signatories[0][firstName]", "Angel");
form.append("signatories[0][lastName]", "Aleman");
form.append("signatories[0][motherLastName]", "Garcia");
form.append("signatories[0][email]", "aaleman@orbitware.com");
form.append("files[0]", new Blob([new Uint8Array(pdf)], { type: "application/pdf" }), "sonda_diagnostico.pdf");

console.log(`→ POST ${baseUrl}/api/public/v2/document   (type=${docType})\n`);

const res = await fetch(`${baseUrl}/api/public/v2/document`, {
  method: "POST",
  signal: AbortSignal.timeout(30_000),
  headers: { "access-key-id": accessKeyId, "secret-access-key": secretAccessKey },
  body: form,
});

const text = await res.text();
let body;
try { body = JSON.parse(text); } catch { body = text; }

console.log(`HTTP ${res.status}\n`);
console.log("Respuesta COMPLETA:");
console.dir(body, { depth: null, colors: true });

if (res.ok) {
  console.log("\n✅ Petición aceptada — OJO: si salió 200 se creó un documento (firma gastada).");
} else {
  console.log("\n⚠️  Rechazada. Revisa arriba el campo/valores permitidos en `description`.");
}
