/**
 * DEMO: prueba que, con los datos EN LA DB, el contrato sale completo.
 *
 *   1. Llena los campos personales de un empleado de prueba EN `employees`.
 *   2. Llena el acreedor/testigos EN `company_settings`.
 *   3. LEE todo de la DB y genera el PDF del contrato (Google Docs).
 *   4. REVIERTE ambos a su estado original (no deja datos de prueba).
 *
 *   pnpm dlx tsx scripts/demo-contract-from-db.ts [RFC]
 */
import { readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { generateContractPdf } from "@/lib/easylex/contract-pdf";

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
const KEY = env.SUPABASE_SERVICE_ROLE_KEY!;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
const RFC = process.argv[2] || "GHHK674551KH1";

const get = (path: string) => fetch(`${REST}/${path}`, { headers: H }).then((r) => r.json());
const patch = (path: string, body: unknown) =>
  fetch(`${REST}/${path}`, { method: "PATCH", headers: H, body: JSON.stringify(body) });
const upsertSetting = (key: string, value: string) =>
  fetch(`${REST}/company_settings?on_conflict=key`, {
    method: "POST",
    headers: { ...H, Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify([{ key, value }]),
  });

async function main() {
  const PERSONAL = ["estado_civil", "nacionalidad", "lugar_origen", "fecha_nacimiento", "domicilio", "curp"] as const;
  const ACREEDOR = ["acreedor_banco", "acreedor_cuenta", "acreedor_clabe", "testigo_1_nombre", "testigo_2_nombre"] as const;

  // ── Leer estado original (para revertir) ──
  const emp = (await get(`employees?rfc=eq.${RFC}&select=id,nombre,apellido_paterno,apellido_materno,rfc,curp,email,empleador,estado_civil,nacionalidad,lugar_origen,fecha_nacimiento,domicilio`))[0];
  if (!emp) throw new Error(`No hay empleado con RFC ${RFC}`);
  const empOrig: Record<string, unknown> = {};
  for (const k of PERSONAL) empOrig[k] = emp[k];

  const csRows: Array<{ key: string; value: string }> = await get(`company_settings?select=key,value`);
  const csOrig: Record<string, string> = {};
  for (const r of csRows) csOrig[r.key] = r.value;

  console.log(`Empleado de prueba: ${emp.nombre} (${RFC}). Datos personales ANTES: ${PERSONAL.filter((k) => emp[k]).length}/6 llenos.`);

  // ── 1+2. LLENAR en la DB ──
  await patch(`employees?id=eq.${emp.id}`, {
    estado_civil: "Soltero(a)",
    nacionalidad: "Mexicana",
    lugar_origen: "Monterrey, Nuevo León",
    fecha_nacimiento: "1990-05-15",
    domicilio: "Calle Roble 123, Col. Centro, C.P. 64000, Monterrey, N.L.",
    curp: emp.curp ?? "AEGM900515HNLLRN09",
  });
  const acreedorSample: Record<string, string> = {
    acreedor_banco: "BBVA México",
    acreedor_cuenta: "0123456789",
    acreedor_clabe: "012345678901234567",
    testigo_1_nombre: "Juan Carlos Martínez López",
    testigo_2_nombre: "María Fernanda García Hernández",
  };
  for (const k of ACREEDOR) await upsertSetting(k, acreedorSample[k]);
  console.log("✅ Datos escritos en la DB (empleado + acreedor).");

  // ── 3. LEER de la DB y generar ──
  const emp2 = (await get(`employees?id=eq.${emp.id}&select=*`))[0];
  const cs2Rows: Array<{ key: string; value: string }> = await get(`company_settings?select=key,value`);
  const cs2: Record<string, string> = {};
  for (const r of cs2Rows) cs2[r.key] = r.value;
  const offer = (await get(`advance_offers?employee_id=eq.${emp.id}&is_current=eq.true&select=monto_prestamo_autorizado`))[0];

  const ap = emp2.apellido_paterno ?? "";
  const am = emp2.apellido_materno ?? ap;
  const pdf = await generateContractPdf({
    nombreCompleto: `${emp2.nombre ?? ""} ${ap} ${am}`.trim(),
    apellidoPaterno: ap,
    apellidoMaterno: am,
    rfc: emp2.rfc,
    curp: emp2.curp,
    email: emp2.email,
    empleador: emp2.empleador ?? "Empleador",
    monto: offer?.monto_prestamo_autorizado ?? 4000,
    clabe: null,
    banco: null,
    estadoCivil: emp2.estado_civil,
    nacionalidad: emp2.nacionalidad,
    lugarOrigen: emp2.lugar_origen,
    fechaNacimiento: emp2.fecha_nacimiento,
    domicilio: emp2.domicilio,
    fechaFirma: new Date(),
    companySettings: cs2,
  });
  const out = join(root, "scripts", "demo-contrato-lleno.pdf");
  await writeFile(out, pdf);
  console.log(`✅ PDF generado desde los datos de la DB (${pdf.length} bytes) → ${out}`);

  // ── 4. REVERTIR ──
  await patch(`employees?id=eq.${emp.id}`, empOrig);
  for (const k of ACREEDOR) await upsertSetting(k, csOrig[k] ?? "");
  console.log("↩︎  Revertido: empleado y company_settings de vuelta a su estado original.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
