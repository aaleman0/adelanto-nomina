/**
 * Convierte los datos de identidad del acreedor (razón social, RFC, representante,
 * domicilio) —hoy escritos FIJOS en la plantilla— en placeholders {{...}}, para que
 * "Datos de empresa" los controle desde el portal. El generador usa un valor de
 * respaldo (el actual) si el ajuste está vacío, así nunca salen en blanco.
 *
 * Nota: la razón social del BLOQUE DE FIRMA está partida en dos líneas y NO se
 * convierte (para no romper el formato de la firma); queda fija como LOZAV.
 *
 *   pnpm dlx tsx scripts/add-acreedor-placeholders.ts          # dry-run
 *   pnpm dlx tsx scripts/add-acreedor-placeholders.ts --apply  # aplica
 */
import { google } from "googleapis";
import { getGoogleAuthClient } from "@/lib/google/auth";

const TEMPLATE_DOC_ID = "1XCSrKrMPHDc5S2lxcR4BqsHR6HouIUW8l0_KspocHJQ";
const APPLY = process.argv.includes("--apply");

// old = texto fijo actual · new = placeholder · expect = ocurrencias esperadas
const REPLACEMENTS = [
  { old: "LOZAV CONSTRUCTORES, SOCIEDAD ANÓNIMA DE CAPITAL VARIABLE", new: "{{razon_social_acreedor}}", expect: 5 },
  { old: "LCO2105032T5", new: "{{rfc_acreedor}}", expect: 1 },
  { old: "DARA JAHDAI LOPEZ DE LOS ANGELES", new: "{{representante_acreedor}}", expect: 2 },
  { old: "Del Gran Parque número 225, Interior C, colonia Cumbres, C.P. 64610, Monterrey, Nuevo León", new: "{{domicilio_acreedor}}", expect: 1 },
  { old: "calle Del Gran Parque número 225 interior C, colonia Cumbres, C.P. 64610, Monterrey, Nuevo León", new: "{{domicilio_acreedor}}", expect: 1 },
];

function extractText(doc: { body?: { content?: unknown[] } }): string {
  let out = "";
  const walk = (nodes: unknown[] | undefined) => {
    for (const n of nodes ?? []) {
      const node = n as Record<string, unknown>;
      const para = node.paragraph as { elements?: Array<{ textRun?: { content?: string } }> } | undefined;
      if (para?.elements) for (const el of para.elements) out += el.textRun?.content ?? "";
      const table = node.table as { tableRows?: Array<{ tableCells?: Array<{ content?: unknown[] }> }> } | undefined;
      if (table?.tableRows) for (const row of table.tableRows) for (const cell of row.tableCells ?? []) walk(cell.content);
    }
  };
  walk(doc.body?.content);
  return out;
}
function count(text: string, needle: string): number {
  let c = 0, i = text.indexOf(needle);
  while (i !== -1) { c++; i = text.indexOf(needle, i + needle.length); }
  return c;
}

async function main() {
  const auth = await getGoogleAuthClient();
  const docs = google.docs({ version: "v1", auth });
  const before = extractText((await docs.documents.get({ documentId: TEMPLATE_DOC_ID })).data as { body?: { content?: unknown[] } });

  console.log("── Verificación ANTES (ocurrencias esperadas) ──");
  let mismatch = false;
  for (const r of REPLACEMENTS) {
    const got = count(before, r.old);
    const ok = got === r.expect;
    if (!ok) mismatch = true;
    console.log(`  ${ok ? "✓" : "✗"} "${r.old.slice(0, 45)}${r.old.length > 45 ? "…" : ""}" → ${got} (esperado ${r.expect})`);
  }
  if (mismatch) {
    console.log("\n⚠️  Alguna cuenta no coincide: NO se aplica nada. Revisa las cadenas exactas.");
    process.exit(1);
  }

  if (!APPLY) {
    console.log("\n(dry-run) Todo cuadra. Corre con --apply para convertir.");
    return;
  }

  const res = await docs.documents.batchUpdate({
    documentId: TEMPLATE_DOC_ID,
    requestBody: {
      requests: REPLACEMENTS.map((r) => ({
        replaceAllText: { containsText: { text: r.old, matchCase: true }, replaceText: r.new },
      })),
    },
  });
  console.log("\n── APLICADO ──");
  const replies = res.data.replies ?? [];
  REPLACEMENTS.forEach((r, idx) => console.log(`  "${r.new}" ← ${replies[idx]?.replaceAllText?.occurrencesChanged ?? 0} reemplazo(s)`));

  const after = extractText((await docs.documents.get({ documentId: TEMPLATE_DOC_ID })).data as { body?: { content?: unknown[] } });
  console.log("\n── DESPUÉS ──");
  for (const ph of ["{{razon_social_acreedor}}", "{{rfc_acreedor}}", "{{representante_acreedor}}", "{{domicilio_acreedor}}"]) {
    console.log(`  ${ph}: ${count(after, ph)} aparición(es)`);
  }
  console.log(`  (queda fija en firma) "LOZAV CONSTRUCTORES,": ${count(after, "LOZAV CONSTRUCTORES,")} — esperado 1 (el bloque de firma)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
