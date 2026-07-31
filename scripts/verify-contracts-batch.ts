/**
 * VERIFICACIÓN DE GENERACIÓN DE CONTRATOS (para night-run / loop).
 *
 * Responde dos preguntas distintas y las reporta por separado:
 *
 *   A) ¿Qué empleados generarían un contrato COMPLETO y a cuáles les falta
 *      algún campo?  (auditoría lógica, sin llamar a Google — barata)
 *   B) Cuando los datos SÍ están, ¿el generador + la plantilla producen un PDF
 *      correcto?  (render real en Google Docs + extracción de texto, sobre los
 *      empleados ya completos + una batería sintética de casos límite)
 *
 * NO muta la base de datos: es de solo lectura sobre `employees` /
 * `advance_offers` / `company_settings`. La evidencia (PDFs + report.md +
 * results.json) queda en scripts/contract-verify-out/<runId>/ (ignorado por git).
 *
 *   pnpm dlx tsx scripts/verify-contracts-batch.ts [opciones]
 *     --audit-only       solo la parte A (sin Google, rapidísimo)
 *     --synthetic-only   solo la batería sintética (sin DB, sin auditoría)
 *     --no-synthetic     omite la batería sintética
 *     --render=N         cuántos empleados reales "listos" renderizar (def: todos)
 *     --offset=K         salta los primeros K empleados listos (rotación)
 */
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { mkdir, writeFile, appendFile, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import {
  generateContractPdf,
  buildContractPlaceholders,
  type ContractData,
} from "@/lib/easylex/contract-pdf";
import type { CompanySettings } from "@/lib/company-settings";

const require = createRequire(import.meta.url);
// pdf-parse v2 expone la clase PDFParse: new PDFParse({data}).getText() → {text}.
const { PDFParse } = require("pdf-parse") as {
  PDFParse: new (opts: { data: Buffer }) => { getText(): Promise<{ text: string }>; destroy(): Promise<void> };
};
async function extractPdfText(pdf: Buffer): Promise<string> {
  const parser = new PDFParse({ data: pdf });
  try {
    return (await parser.getText()).text;
  } finally {
    await parser.destroy().catch(() => {});
  }
}

/* ─── Args ─── */
const args = new Set(process.argv.slice(2));
const flag = (name: string) => args.has(`--${name}`);
const num = (name: string, def: number) => {
  for (const a of process.argv.slice(2)) {
    const m = a.match(new RegExp(`^--${name}=(\\d+)$`));
    if (m) return Number(m[1]);
  }
  return def;
};
const AUDIT_ONLY = flag("audit-only");
const SYNTHETIC_ONLY = flag("synthetic-only");
const NO_SYNTHETIC = flag("no-synthetic");
const RENDER_CAP = num("render", Number.MAX_SAFE_INTEGER);
const OFFSET = num("offset", 0);

/* ─── Env + REST (solo lectura) ─── */
const root = process.cwd();
const env: Record<string, string> = {};
for (const line of readFileSync(join(root, ".env.local"), "utf8").split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const eq = t.indexOf("=");
  if (eq === -1) continue;
  let v = t.slice(eq + 1).trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  env[t.slice(0, eq).trim()] = v;
}
const REST = (env.SUPABASE_URL || "").replace(/\/+$/, "").replace(/\/rest\/v1$/, "") + "/rest/v1";
const H = { apikey: env.SUPABASE_SERVICE_ROLE_KEY!, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY!}` };
const get = (path: string) => fetch(`${REST}/${path}`, { headers: H }).then((r) => r.json());

/* ─── Clasificación de placeholders ─── */
// Se llenan por empleado/oferta; vacío ⇒ contrato incompleto para esa persona.
const PER_EMPLOYEE = ["nombre_completo", "estado_civil", "nacionalidad", "lugar_origen", "fecha_nacimiento", "rfc", "domicilio", "monto_numero", "monto_letra"] as const;
// Iguales en todos; vacío ⇒ hueco de configuración (company_settings), no del empleado.
const COMPANY_CONST = ["banco_acreedor", "cuenta_acreedor", "clabe_acreedor", "testigo_1", "testigo_2"] as const;

/* ─── Utilidades de texto ─── */
const norm = (s: string) =>
  s.normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/\s+/g, " ").toLowerCase().trim();
const textHas = (haystack: string, needle: string) => norm(haystack).includes(norm(needle));

type RenderResult = {
  id: string;
  kind: "real" | "sintetico";
  ok: boolean;
  problems: string[];
  knownTemplateBugs: string[];
  pdfBytes?: number;
  error?: string;
};

/** Revisa el TEXTO extraído del PDF contra los valores esperados. */
function checkRenderedText(text: string, data: ContractData): { problems: string[]; known: string[] } {
  const problems: string[] = [];
  const known: string[] = [];
  const ph = buildContractPlaceholders(data);

  // 1) No deben quedar placeholders sin reemplazar.
  const leftover = text.match(/\{\{[^}]+\}\}/g);
  if (leftover) problems.push(`Placeholders sin reemplazar: ${[...new Set(leftover)].join(", ")}`);

  // 2) Cada valor esperado (no vacío) debe aparecer en el contrato.
  const expect: Array<[string, string]> = [
    ["nombre", ph.nombre_completo],
    ["rfc", ph.rfc],
    ["domicilio", ph.domicilio],
    ["empleador", ph.empleador],
    ["estado_civil", ph.estado_civil],
    ["nacionalidad", ph.nacionalidad],
    ["lugar_origen", ph.lugar_origen],
    ["fecha_nacimiento", ph.fecha_nacimiento],
    ["monto_numero", ph.monto_numero],
    ["monto_letra(1ª palabra)", ph.monto_letra.split(" ")[0] ?? ""],
    ["banco_acreedor", ph.banco_acreedor],
    ["cuenta_acreedor", ph.cuenta_acreedor],
    ["clabe_acreedor", ph.clabe_acreedor],
    ["razon_social_acreedor", ph.razon_social_acreedor],
    ["rfc_acreedor", ph.rfc_acreedor],
    ["representante_acreedor", ph.representante_acreedor],
    ["domicilio_acreedor", ph.domicilio_acreedor],
    ["testigo_1", ph.testigo_1],
    ["testigo_2", ph.testigo_2],
    ["dia_firma", ph.dia_firma],
    ["mes_firma", ph.mes_firma],
    ["anio_firma", ph.anio_firma],
  ];
  for (const [label, val] of expect) {
    if (val && !textHas(text, val)) problems.push(`No aparece ${label}: "${val}"`);
  }

  // 3) Bugs CONOCIDOS de la plantilla (se separan para no ensuciar la señal).
  //    La plantilla agrega ".00" tras {{monto_numero}} (que ya trae decimales)
  //    y " PESOS 00/100 MONEDA NACIONAL" tras {{monto_letra}} (que ya trae "M.N.").
  if (textHas(text, `${ph.monto_numero}.00`)) {
    known.push(`Monto en número duplica decimales: aparece "${ph.monto_numero}.00" (la plantilla agrega ".00" de más)`);
  }
  // Firma EXACTA del bug (no el "moneda nacional" del articulado legal): la cola
  // hardcodeada que la plantilla ponía tras {{monto_letra}}, que ya trae "M.N.".
  if (textHas(text, "PESOS 00/100 MONEDA NACIONAL")) {
    known.push(`Monto en letra duplicado: aparece la cola "PESOS 00/100 MONEDA NACIONAL" tras un valor que ya termina en "M.N."`);
  }

  return { problems, known };
}

async function renderAndCheck(id: string, kind: "real" | "sintetico", data: ContractData, pdfDir: string): Promise<RenderResult> {
  try {
    const pdf = await generateContractPdf(data);
    await writeFile(join(pdfDir, `${id}.pdf`), pdf);
    const text = await extractPdfText(pdf);
    const { problems, known } = checkRenderedText(text, data);
    return { id, kind, ok: problems.length === 0, problems, knownTemplateBugs: known, pdfBytes: pdf.length };
  } catch (err) {
    return { id, kind, ok: false, problems: [], knownTemplateBugs: [], error: err instanceof Error ? err.message : String(err) };
  }
}

/* ─── Batería sintética (datos conocidos → detectores fuertes) ─── */
// Identidad del acreedor con valores DISTINTOS a los de respaldo: si aparecen en
// el contrato, prueba que "Datos de empresa" (company_settings) sí manda sobre la
// plantilla (y no que se quedó el valor viejo hardcodeado).
const SAMPLE_CS: CompanySettings = {
  acreedor_razon_social: "ACME PRUEBAS, S.A. DE C.V.",
  acreedor_rfc: "APR250101AB1",
  acreedor_representante: "Persona Representante De Prueba",
  acreedor_domicilio: "Av. Siempre Viva 742, Col. Centro, Monterrey, N.L.",
  acreedor_banco: "BBVA México",
  acreedor_cuenta: "0123456789",
  acreedor_clabe: "012345678901234567",
  testigo_1_nombre: "Juan Carlos Martínez López",
  testigo_2_nombre: "María Fernanda García Hernández",
};
const FIXED_DATE = new Date("2026-07-31T12:00:00-06:00");
function synth(id: string, over: Partial<ContractData>): { id: string; data: ContractData } {
  const base: ContractData = {
    nombreCompleto: "Empleado De Prueba",
    apellidoPaterno: "De",
    apellidoMaterno: "Prueba",
    rfc: "XAXX010101000",
    curp: "XAXX010101HNLXXX09",
    email: "prueba@example.com",
    empleador: "Empresa Empleadora SA de CV",
    monto: 4000,
    clabe: null,
    banco: null,
    estadoCivil: "Soltero(a)",
    nacionalidad: "Mexicana",
    lugarOrigen: "Monterrey, Nuevo León",
    fechaNacimiento: "1990-05-15",
    domicilio: "Calle Roble 123, Col. Centro, C.P. 64000, Monterrey, N.L.",
    fechaFirma: FIXED_DATE,
    companySettings: SAMPLE_CS,
  };
  return { id, data: { ...base, ...over } };
}
const SYNTHETIC = [
  synth("acentos-ni", { nombreCompleto: "José Ángel Núñez Peña" }),
  synth("casado", { nombreCompleto: "Ana Sofía López Ruiz", estadoCivil: "Casado(a)", monto: 7500 }),
  synth("monto-centavos", { monto: 4500.5 }),
  synth("monto-grande", { monto: 125000 }),
  synth("monto-chico", { monto: 500 }),
  synth("materno-faltante", { nombreCompleto: "Carlos Ramírez Ramírez", apellidoMaterno: "Ramírez" }),
  synth("empleador-fallback", { empleador: "Empleador" }),
];

/* ─── Main ─── */
async function main() {
  const runId = new Date().toISOString().replace(/[:.]/g, "-");
  const outRoot = join(root, "scripts", "contract-verify-out");
  const outDir = join(outRoot, runId);
  const pdfDir = join(outDir, "pdfs");
  await mkdir(pdfDir, { recursive: true });

  const cs: CompanySettings = {};
  if (!SYNTHETIC_ONLY) {
    for (const r of (await get("company_settings?select=key,value")) as Array<{ key: string; value: string }>) cs[r.key] = r.value;
  }
  const now = new Date();

  /* ── Parte A: auditoría de datos (todos los empleados, sin Google) ── */
  type Audit = { rfc: string; nombre: string; ready: boolean; missing: string[] };
  const audits: Audit[] = [];
  const readyEmployees: Array<{ id: string; data: ContractData; rfc: string }> = [];
  const companyGaps = SYNTHETIC_ONLY ? [] : COMPANY_CONST.filter((k) => {
    const map: Record<string, string> = {
      banco_acreedor: "acreedor_banco", cuenta_acreedor: "acreedor_cuenta", clabe_acreedor: "acreedor_clabe",
      testigo_1: "testigo_1_nombre", testigo_2: "testigo_2_nombre",
    };
    return !cs[map[k]]?.trim();
  });

  if (!SYNTHETIC_ONLY) {
    const employees = (await get(
      "employees?select=id,rfc,curp,nombre,apellido_paterno,apellido_materno,email,empleador,estado_civil,nacionalidad,lugar_origen,fecha_nacimiento,domicilio&order=rfc",
    )) as Record<string, string | null>[];
    const offers = (await get("advance_offers?is_current=eq.true&select=employee_id,monto_prestamo_autorizado")) as Array<{ employee_id: string; monto_prestamo_autorizado: number }>;
    const offerByEmp = new Map(offers.map((o) => [o.employee_id, o.monto_prestamo_autorizado]));

    for (const e of employees) {
      const apellidoPaterno = e.apellido_paterno ?? "";
      const apellidoMaterno = e.apellido_materno ?? apellidoPaterno;
      const nombreCompleto = `${e.nombre ?? ""} ${apellidoPaterno} ${apellidoMaterno}`.trim();
      const monto = offerByEmp.get(e.id as string);
      const data: ContractData = {
        nombreCompleto, apellidoPaterno, apellidoMaterno,
        rfc: e.rfc ?? "", curp: e.curp, email: e.email,
        empleador: e.empleador ?? "Empleador",
        monto: monto ?? 0,
        clabe: null, banco: null,
        estadoCivil: e.estado_civil, nacionalidad: e.nacionalidad, lugarOrigen: e.lugar_origen,
        fechaNacimiento: e.fecha_nacimiento, domicilio: e.domicilio,
        fechaFirma: now, companySettings: cs,
      };
      const ph = buildContractPlaceholders(data);
      const missing = PER_EMPLOYEE.filter((k) => !ph[k]?.trim());
      if (monto === undefined) missing.push("oferta_vigente");
      const ready = missing.length === 0;
      audits.push({ rfc: e.rfc ?? "(sin rfc)", nombre: nombreCompleto, ready, missing });
      if (ready) readyEmployees.push({ id: `real-${e.rfc}`, data, rfc: e.rfc ?? "" });
    }
  }

  const readyCount = audits.filter((a) => a.ready).length;
  const missingByField: Record<string, number> = {};
  for (const a of audits) for (const m of a.missing) missingByField[m] = (missingByField[m] ?? 0) + 1;

  /* ── Parte B: render real (empleados listos + batería sintética) ── */
  const renders: RenderResult[] = [];
  if (!AUDIT_ONLY) {
    const realToRender = SYNTHETIC_ONLY ? [] : readyEmployees.slice(OFFSET, OFFSET + RENDER_CAP);
    for (const r of realToRender) renders.push(await renderAndCheck(r.id, "real", r.data, pdfDir));
    if (!NO_SYNTHETIC) {
      for (const s of SYNTHETIC) renders.push(await renderAndCheck(`synth-${s.id}`, "sintetico", s.data, pdfDir));
    }
  }

  /* ── Evidencia ── */
  const realProblems = renders.filter((r) => r.problems.length > 0 || r.error);
  const anyKnownBug = renders.some((r) => r.knownTemplateBugs.length > 0);
  const summary = {
    runId,
    mode: AUDIT_ONLY ? "audit-only" : SYNTHETIC_ONLY ? "synthetic-only" : "full",
    audit: { totalEmpleados: audits.length, listos: readyCount, incompletos: audits.length - readyCount, faltantesPorCampo: missingByField, huecosDeConfiguracion: companyGaps },
    render: { total: renders.length, ok: renders.filter((r) => r.ok && !r.error).length, conProblemasReales: realProblems.length, conBugConocidoDePlantilla: renders.filter((r) => r.knownTemplateBugs.length > 0).length },
    veredicto: realProblems.length > 0 ? "PROBLEMAS_REALES" : anyKnownBug ? "SOLO_BUG_CONOCIDO_PLANTILLA" : "LIMPIO",
  };

  const results = { ...summary, audits, renders };
  await writeFile(join(outDir, "results.json"), JSON.stringify(results, null, 2));

  const md: string[] = [];
  md.push(`# Verificación de contratos — ${runId}`, "");
  md.push(`**Veredicto:** ${summary.veredicto}  ·  modo: ${summary.mode}`, "");
  md.push(`## A) Datos: ¿quién genera un contrato completo?`);
  md.push(`- Empleados: **${audits.length}**  ·  listos: **${readyCount}**  ·  incompletos: **${audits.length - readyCount}**`);
  if (Object.keys(missingByField).length) {
    md.push(`- Campos faltantes (nº de empleados a los que les falta):`);
    for (const [k, v] of Object.entries(missingByField).sort((a, b) => b[1] - a[1])) md.push(`  - \`${k}\`: ${v}`);
  }
  if (companyGaps.length) md.push(`- ⚠️ Huecos de configuración (iguales para todos): ${companyGaps.join(", ")}`);
  const readyList = audits.filter((a) => a.ready).map((a) => a.rfc);
  if (readyList.length) md.push(`- Listos: ${readyList.join(", ")}`);
  md.push("");
  md.push(`## B) Render: ¿sale bien el PDF cuando hay datos?`);
  if (AUDIT_ONLY) md.push(`_(omitido: --audit-only)_`);
  for (const r of renders) {
    const tag = r.error ? "🟥 ERROR" : r.problems.length ? "🟥 PROBLEMA" : r.knownTemplateBugs.length ? "🟨 bug conocido" : "🟩 ok";
    md.push(`- ${tag} **${r.id}** (${r.kind})`);
    if (r.error) md.push(`  - error: ${r.error}`);
    for (const p of r.problems) md.push(`  - ✗ ${p}`);
    for (const k of r.knownTemplateBugs) md.push(`  - known: ${k}`);
  }
  md.push("");
  if (anyKnownBug) {
    md.push(`## Bug conocido de plantilla (pendiente de arreglar)`);
    md.push(`La plantilla de Google Docs duplica el formato del monto. Arreglo: 2 reemplazos en el Doc —`);
    md.push("- `{{monto_numero}}.00` → `{{monto_numero}}`");
    md.push("- `{{monto_letra}} PESOS 00/100 MONEDA NACIONAL` → `{{monto_letra}}`");
    md.push("");
  }
  md.push(`## Evidencia`);
  md.push(`- PDFs: \`${pdfDir}\``);
  md.push(`- JSON: \`${join(outDir, "results.json")}\``);
  await writeFile(join(outDir, "report.md"), md.join("\n"));

  await appendFile(join(outRoot, "history.jsonl"), JSON.stringify({ ...summary }) + "\n").catch(() => {});

  // Poda: conserva solo las últimas N corridas para no acumular PDFs con PII en
  // disco durante un night-run largo. El runId es ISO → orden lexicográfico = cronológico.
  try {
    const KEEP = 25;
    const dirs = (await readdir(outRoot, { withFileTypes: true }))
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort();
    for (const old of dirs.slice(0, Math.max(0, dirs.length - KEEP))) {
      await rm(join(outRoot, old), { recursive: true, force: true });
    }
  } catch {
    /* la poda es best-effort */
  }

  /* ── Consola ── */
  console.log(`\n═══ Verificación ${runId} — ${summary.veredicto} ═══`);
  console.log(`A) Datos: ${readyCount}/${audits.length} empleados listos${companyGaps.length ? `  ·  huecos config: ${companyGaps.join(", ")}` : ""}`);
  if (!AUDIT_ONLY) console.log(`B) Render: ${summary.render.ok}/${renders.length} ok  ·  problemas reales: ${realProblems.length}  ·  bug de plantilla en: ${summary.render.conBugConocidoDePlantilla}`);
  for (const r of realProblems) console.log(`   🟥 ${r.id}: ${r.error ?? r.problems.join("; ")}`);
  console.log(`Evidencia → ${outDir}`);

  process.exit(realProblems.length > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
