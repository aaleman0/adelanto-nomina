// Crea UN documento con sendEmail=true para que EasyLex envíe el email con el
// link de firma REAL (canónico). Objetivo: ver el formato exacto de esa URL.
// Gasta 1 firma y manda 1 correo. NO imprime secretos.
//   node scripts/probe-easylex-sendemail.mjs <email>
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
const email = process.argv[2] || "joseangelaleman62@gmail.com";

const pdf = readFileSync(join(root, "scripts", "test-filled-contract.pdf"));
const form = new FormData();
form.append("fileName", "prueba_link_firma");
form.append("type", "DISI");
form.append("sendEmail", "true"); // ← que EasyLex mande el email con el link real
form.append("expirationDate", "2026-08-27");
for (const k of ["validateId","validateSms","validatePicture","validateEmail","validateBiometric","validateLiveness","validateVoice"]) {
  form.append(k, "false"); // combinación mínima válida
}
form.append("signatories[0][firstName]", "Jose Angel");
form.append("signatories[0][lastName]", "Aleman");
form.append("signatories[0][motherLastName]", "Aleman");
form.append("signatories[0][email]", email);
form.append("files[0]", new Blob([new Uint8Array(pdf)], { type: "application/pdf" }), "prueba_link_firma.pdf");

console.log(`→ POST ${baseUrl}/api/public/v2/document  (sendEmail=true → ${email})\n`);
const res = await fetch(`${baseUrl}/api/public/v2/document`, {
  method: "POST", headers, body: form, signal: AbortSignal.timeout(30000),
});
const text = await res.text();
let body; try { body = JSON.parse(text); } catch { body = text; }
console.log(`HTTP ${res.status}`);
console.dir(body, { depth: null });

if (res.ok) {
  const signerId = body?.data?.signatories?.[0]?.id;
  console.log(`\n✅ Documento creado. Revisa la bandeja de ${email} — abre el email de EasyLex`);
  console.log(`   y COPIA la URL exacta del botón/link de firma. Ese es el formato que buscamos.`);
  console.log(`   (signerId = ${signerId})`);
}
