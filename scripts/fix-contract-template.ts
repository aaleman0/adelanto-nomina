/**
 * Arregla el bug de formato del monto en la PLANTILLA de Google Docs.
 *
 * La plantilla escribe ".00" tras {{monto_numero}} (que ya trae decimales) y
 * " PESOS 00/100 MONEDA NACIONAL" tras {{monto_letra}} (que ya termina en "M.N.").
 * Se quitan esos dos textos hardcodeados; los placeholders quedan intactos.
 *
 *   pnpm dlx tsx scripts/fix-contract-template.ts          # dry-run: solo inspecciona
 *   pnpm dlx tsx scripts/fix-contract-template.ts --apply  # aplica los reemplazos
 */
import { google } from "googleapis";
import { getGoogleAuthClient } from "@/lib/google/auth";

const TEMPLATE_DOC_ID = "1XCSrKrMPHDc5S2lxcR4BqsHR6HouIUW8l0_KspocHJQ";
const APPLY = process.argv.includes("--apply");

const REPLACEMENTS = [
  { old: "{{monto_numero}}.00", new: "{{monto_numero}}" },
  { old: "{{monto_letra}} PESOS 00/100 MONEDA NACIONAL", new: "{{monto_letra}}" },
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

function countOccurrences(text: string, needle: string): number {
  let count = 0;
  let i = text.indexOf(needle);
  while (i !== -1) {
    count++;
    i = text.indexOf(needle, i + needle.length);
  }
  return count;
}

async function main() {
  const auth = await getGoogleAuthClient();
  const docs = google.docs({ version: "v1", auth });

  const before = await docs.documents.get({ documentId: TEMPLATE_DOC_ID });
  const text = extractText(before.data as { body?: { content?: unknown[] } });

  console.log("── Estado ANTES ──");
  for (const r of REPLACEMENTS) {
    console.log(`  "${r.old}"  → ${countOccurrences(text, r.old)} ocurrencia(s)`);
  }
  // Contexto: qué hay alrededor de los placeholders del monto.
  for (const ph of ["{{monto_numero}}", "{{monto_letra}}"]) {
    const i = text.indexOf(ph);
    if (i !== -1) console.log(`  contexto ${ph}:  …${JSON.stringify(text.slice(i, i + 50))}…`);
  }

  if (!APPLY) {
    console.log("\n(dry-run) Nada modificado. Corre con --apply para aplicar.");
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
  REPLACEMENTS.forEach((r, idx) => {
    const changed = replies[idx]?.replaceAllText?.occurrencesChanged ?? 0;
    console.log(`  "${r.old}"  → ${changed} reemplazo(s)`);
  });

  // Confirmación: releer y verificar que ya no quedan los textos viejos.
  const after = await docs.documents.get({ documentId: TEMPLATE_DOC_ID });
  const text2 = extractText(after.data as { body?: { content?: unknown[] } });
  console.log("\n── Estado DESPUÉS ──");
  for (const r of REPLACEMENTS) {
    console.log(`  "${r.old}"  → ${countOccurrences(text2, r.old)} ocurrencia(s) (debe ser 0)`);
  }
  for (const ph of ["{{monto_numero}}", "{{monto_letra}}"]) {
    const i = text2.indexOf(ph);
    console.log(`  ${ph} presente: ${i !== -1 ? "sí (bien, el placeholder sigue)" : "NO ⚠️"}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
