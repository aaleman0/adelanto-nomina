/**
 * Correcciones puntuales de TEXTO en la plantilla de Google Docs (typos, redacción).
 * Dry-run por defecto; `--apply` para aplicar. Cada corrección verifica que
 * aparezca el número esperado de veces antes de tocar nada.
 *
 *   pnpm dlx tsx scripts/fix-template-text.ts          # dry-run
 *   pnpm dlx tsx scripts/fix-template-text.ts --apply  # aplica
 */
import { google } from "googleapis";
import { getGoogleAuthClient } from "@/lib/google/auth";

const TEMPLATE_DOC_ID = "1XCSrKrMPHDc5S2lxcR4BqsHR6HouIUW8l0_KspocHJQ";
const APPLY = process.argv.includes("--apply");

const CORRECTIONS = [
  // "donde nación el día" → "donde nació el día" (typo: nación → nació)
  { old: "nación el día", new: "nació el día", expect: 1 },
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

  console.log("── ANTES ──");
  let mismatch = false;
  for (const c of CORRECTIONS) {
    const got = count(before, c.old);
    const ok = got === c.expect;
    if (!ok) mismatch = true;
    console.log(`  ${ok ? "✓" : "✗"} "${c.old}" → ${got} (esperado ${c.expect})`);
  }
  if (mismatch) { console.log("\n⚠️  Cuenta no coincide: no se aplica nada."); process.exit(1); }
  if (!APPLY) { console.log("\n(dry-run) Todo cuadra. Corre con --apply."); return; }

  const res = await docs.documents.batchUpdate({
    documentId: TEMPLATE_DOC_ID,
    requestBody: {
      requests: CORRECTIONS.map((c) => ({
        replaceAllText: { containsText: { text: c.old, matchCase: true }, replaceText: c.new },
      })),
    },
  });
  console.log("\n── APLICADO ──");
  const replies = res.data.replies ?? [];
  CORRECTIONS.forEach((c, i) => console.log(`  "${c.old}" → "${c.new}": ${replies[i]?.replaceAllText?.occurrencesChanged ?? 0} cambio(s)`));
}

main().catch((e) => { console.error(e); process.exit(1); });
