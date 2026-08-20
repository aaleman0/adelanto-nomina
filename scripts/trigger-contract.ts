/**
 * Dispara el pipeline de contrato para un empleado, desde la terminal (sin
 * navegador ni sesión). Llama directo a `requestContractFromWhatsApp`: genera el
 * contrato, crea el documento en EasyLex y envía el link por WhatsApp.
 *
 * ⚠️ EFECTOS REALES: crea un documento en EasyLex (gasta una firma) y manda un
 * WhatsApp. Úsalo solo para la prueba end-to-end.
 *
 *   pnpm dlx tsx scripts/trigger-contract.ts --rfc=XEXX010101000 \
 *     --callback=https://TU-DOMINIO-PUBLICO/api/webhooks/easylex/sign
 *
 * El --callback es lo que EasyLex usa para avisar la firma. Sin él (ni
 * EASYLEX_CALLBACK_URL en el entorno) el contrato firmado NO regresa; para
 * probar solo los pasos 1–5 aun así, pasa --allow-no-callback.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const argv = process.argv.slice(2);
const has = (k: string) => argv.includes(`--${k}`);
const arg = (k: string, def = "") => {
  for (const a of argv) {
    const m = a.match(new RegExp(`^--${k}=([\\s\\S]*)$`));
    if (m) return m[1];
  }
  return def;
};

// Cargar .env.local en process.env ANTES de importar la lib (sus módulos leen
// process.env al cargarse; un tsx pelón no lo hace solo como Next).
for (const line of readFileSync(join(process.cwd(), ".env.local"), "utf8").split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const eq = t.indexOf("=");
  if (eq === -1) continue;
  let v = t.slice(eq + 1).trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  if (!(t.slice(0, eq).trim() in process.env)) process.env[t.slice(0, eq).trim()] = v;
}

const rfc = arg("rfc").toUpperCase().trim();
const callback = arg("callback").trim();
if (callback) process.env.EASYLEX_CALLBACK_URL = callback;

if (!rfc) {
  console.error("✗ --rfc requerido. Ej: --rfc=XEXX010101000");
  process.exit(1);
}
if (!process.env.EASYLEX_CALLBACK_URL && !has("allow-no-callback")) {
  console.error(
    "✗ Falta el callback. EasyLex no podría avisar la firma → el contrato firmado no regresaría.\n" +
      "  Pasa --callback=https://TU-DOMINIO/api/webhooks/easylex/sign\n" +
      "  (o --allow-no-callback para probar solo pasos 1–5, gastando una firma).",
  );
  process.exit(1);
}

async function main() {
  // Import dinámico: hasta aquí ya está el entorno cargado.
  const { requestContractFromWhatsApp, parseRequestContractPayload } = await import(
    "@/lib/contracts/request-contract"
  );

  const phone = arg("phone", "").trim() || undefined;
  const subscriber = arg("subscriber", "").trim() || phone || rfc;

  const input = parseRequestContractPayload({
    subscriber_id: subscriber,
    rfc,
    phone,
  });

  console.log(`Disparando contrato para RFC ${rfc}…`);
  console.log(`  callback EasyLex: ${process.env.EASYLEX_CALLBACK_URL ?? "(ninguno)"}`);
  const result = await requestContractFromWhatsApp(input);
  console.log("\n── Resultado ──");
  console.log(JSON.stringify(result, null, 2));

  if (result.ok && result.status === "contract_ready") {
    console.log(`\n✅ Contrato listo. Link: ${result.link_easylex}`);
    console.log(`   WhatsApp enviado: ${result.link_enviado}`);
    console.log(`   Sigue con:  node scripts/inspect-employee.mjs ${rfc}`);
  } else {
    console.log(`\n⚠️  status=${result.status}: ${result.message}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
