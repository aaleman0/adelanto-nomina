/**
 * Descarga el PDF FIRMADO de un documento de EasyLex (prueba el paso 6–7:
 * recuperar el contrato firmado, sin depender del webhook/deploy).
 *
 *   pnpm dlx tsx scripts/fetch-signed-contract.ts --doc=doc-XXXXXXXX
 *   pnpm dlx tsx scripts/fetch-signed-contract.ts --rfc=XEXX010101000   (usa el último intento)
 */
import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const argv = process.argv.slice(2);
const arg = (k: string, def = "") => {
  for (const a of argv) {
    const m = a.match(new RegExp(`^--${k}=([\\s\\S]*)$`));
    if (m) return m[1];
  }
  return def;
};

// Cargar .env.local en process.env ANTES de importar el cliente de EasyLex.
for (const line of readFileSync(join(process.cwd(), ".env.local"), "utf8").split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const eq = t.indexOf("=");
  if (eq === -1) continue;
  let v = t.slice(eq + 1).trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  if (!(t.slice(0, eq).trim() in process.env)) process.env[t.slice(0, eq).trim()] = v;
}

async function resolveDocumentId(): Promise<string> {
  const direct = arg("doc").trim();
  if (direct) return direct;
  const rfc = arg("rfc").toUpperCase().trim();
  if (!rfc) throw new Error("Da --doc=doc-XXXX o --rfc=RFC.");
  const REST = (process.env.SUPABASE_URL || "").replace(/\/+$/, "").replace(/\/rest\/v1$/, "") + "/rest/v1";
  const H = { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY!}` };
  const get = (p: string) => fetch(`${REST}/${p}`, { headers: H }).then((r) => r.json());
  const emp = (await get(`employees?rfc=eq.${rfc}&select=id`))[0];
  if (!emp) throw new Error(`No hay empleado con RFC ${rfc}.`);
  const reqs = await get(`contract_requests?employee_id=eq.${emp.id}&select=id`);
  const ids = reqs.map((r: { id: string }) => r.id).join(",");
  const att = (await get(`contract_attempts?contract_request_id=in.(${ids})&easylex_contract_id=not.is.null&order=created_at.desc&limit=1&select=easylex_contract_id`))[0];
  if (!att) throw new Error(`Sin intentos con documento para RFC ${rfc}.`);
  return att.easylex_contract_id as string;
}

async function main() {
  const documentId = await resolveDocumentId();
  console.log(`Descargando documento firmado: ${documentId}…`);
  const { EasyLexClient } = await import("@/lib/easylex/client");
  const client = new EasyLexClient();
  const res = await client.getSignedDocument(documentId);
  if (!res.ok) {
    console.error(`✗ No se pudo descargar: ${res.error}`);
    console.error("  (Si dice que no está firmado, EasyLex puede tardar unos segundos en finalizar el PDF tras firmar.)");
    process.exit(1);
  }
  const dir = join(process.cwd(), "scripts", "contract-verify-out");
  await mkdir(dir, { recursive: true });
  const out = join(dir, `firmado-${documentId}.pdf`);
  await writeFile(out, res.pdf);
  console.log(`✅ PDF FIRMADO descargado (${res.pdf.length} bytes) → ${out}`);
  console.log("   → Prueba superada: la app SÍ recupera el contrato firmado de EasyLex.");
}

main().catch((e) => { console.error(e); process.exit(1); });
