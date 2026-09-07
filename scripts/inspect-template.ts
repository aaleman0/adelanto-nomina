/**
 * Inspecciona (solo lectura) el texto REAL de la plantilla de Google Docs:
 * vuelca todo el texto a un archivo y muestra dónde aparece cada dato de
 * identidad del acreedor y qué placeholders {{...}} ya existen. Sirve para
 * planear reemplazos exactos antes de mutar la plantilla.
 *
 *   pnpm dlx tsx scripts/inspect-template.ts [rutaSalida.txt]
 */
import { writeFileSync } from "node:fs";
import { google } from "googleapis";
import { getGoogleAuthClient } from "@/lib/google/auth";

const TEMPLATE_DOC_ID = "1XCSrKrMPHDc5S2lxcR4BqsHR6HouIUW8l0_KspocHJQ";
const OUT = process.argv[2] || "/tmp/template-text.txt";

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

function occurrences(text: string, needle: string): number {
  let c = 0, i = text.indexOf(needle);
  while (i !== -1) { c++; i = text.indexOf(needle, i + needle.length); }
  return c;
}

async function main() {
  const auth = await getGoogleAuthClient();
  const docs = google.docs({ version: "v1", auth });
  const doc = await docs.documents.get({ documentId: TEMPLATE_DOC_ID });
  const text = extractText(doc.data as { body?: { content?: unknown[] } });
  writeFileSync(OUT, text);
  console.log(`Texto completo (${text.length} chars) → ${OUT}\n`);

  console.log("── Placeholders {{...}} existentes ──");
  const phs = [...new Set(text.match(/\{\{[^}]+\}\}/g) ?? [])].sort();
  console.log(phs.join("  ") || "(ninguno)");

  console.log("\n── Datos de identidad del acreedor (ocurrencias) ──");
  for (const s of ["LOZAV CONSTRUCTORES", "SOCIEDAD ANÓNIMA DE CAPITAL VARIABLE", "LCO2105032T5", "DARA JAHDAI", "Gran Parque"]) {
    console.log(`  "${s}": ${occurrences(text, s)}`);
  }

  console.log("\n── Contexto de cada aparición de 'Gran Parque' (domicilio) ──");
  let i = text.indexOf("Gran Parque");
  while (i !== -1) {
    console.log(`  …${JSON.stringify(text.slice(Math.max(0, i - 25), i + 80))}`);
    i = text.indexOf("Gran Parque", i + 1);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
