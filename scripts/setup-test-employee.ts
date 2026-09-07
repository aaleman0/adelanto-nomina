/**
 * Prepara UN empleado de prueba LISTO para correr el pipeline de contrato de
 * punta a punta (tú, con tu teléfono). Deja en la base, de forma idempotente:
 *   - el empleado (datos personales completos → el contrato sale sin huecos),
 *   - una oferta vigente y ELEGIBLE (con monto),
 *   - una cuenta bancaria activa (regla del pipeline).
 *
 * PERSISTE los datos (no revierte): es un empleado real de prueba. Para borrarlo
 * después usa `--cleanup`.
 *
 *   # Crear/actualizar (tus datos reales de teléfono/nombre/RFC):
 *   pnpm dlx tsx scripts/setup-test-employee.ts \
 *     --telefono=8112345678 --rfc=XEXX010101000 --nombre="Jose Angel" \
 *     --apellido-paterno="Aleman" --apellido-materno="..." --email="tu@correo.com" --monto=1000
 *
 *   # Borrar el empleado de prueba y todo lo suyo:
 *   pnpm dlx tsx scripts/setup-test-employee.ts --cleanup --rfc=XEXX010101000
 *
 * NOTA: la firma real necesita un INE real en EasyLex (se hace al firmar, no aquí).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { normalizePhoneFromCsv } from "@/lib/whatsapp/phone-utils";

/* ─── Args ─── */
const argv = process.argv.slice(2);
const has = (k: string) => argv.includes(`--${k}`);
const arg = (k: string, def = "") => {
  for (const a of argv) {
    const m = a.match(new RegExp(`^--${k}=([\\s\\S]*)$`));
    if (m) return m[1];
  }
  return def;
};
const CLEANUP = has("cleanup");

/* ─── Env + REST (service role) ─── */
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

const get = (path: string) => fetch(`${REST}/${path}`, { headers: H }).then((r) => r.json());
const del = (path: string) => fetch(`${REST}/${path}`, { method: "DELETE", headers: H });
const post = (path: string, body: unknown, prefer?: string) =>
  fetch(`${REST}/${path}`, { method: "POST", headers: prefer ? { ...H, Prefer: prefer } : H, body: JSON.stringify(body) });
const patch = (path: string, body: unknown) =>
  fetch(`${REST}/${path}`, { method: "PATCH", headers: H, body: JSON.stringify(body) });

/* ─── RFC (requerido en ambos modos) ─── */
const rfc = arg("rfc").toUpperCase().trim();
if (!rfc || rfc.length < 12 || rfc.length > 13) {
  console.error("✗ --rfc requerido y debe tener 12–13 caracteres. Ej: --rfc=XEXX010101000");
  process.exit(1);
}

async function cleanup() {
  const emp = (await get(`employees?rfc=eq.${rfc}&select=id`))[0];
  if (!emp) {
    console.log(`No hay empleado con RFC ${rfc}. Nada que borrar.`);
    return;
  }
  const id = emp.id as string;
  const reqs: Array<{ id: string }> = await get(`contract_requests?employee_id=eq.${id}&select=id`);
  if (reqs.length) {
    const ids = reqs.map((r) => r.id).join(",");
    await del(`contract_attempts?contract_request_id=in.(${ids})`);
  }
  // Orden: hijos primero (contract_requests es on delete restrict).
  for (const path of [
    `contract_requests?employee_id=eq.${id}`,
    `whatsapp_contract_messages?employee_id=eq.${id}`,
    `advance_offers?employee_id=eq.${id}`,
    `employee_bank_accounts?employee_id=eq.${id}`,
    `whatsapp_contacts?employee_id=eq.${id}`,
  ]) {
    const r = await del(path);
    if (!r.ok && r.status !== 404) console.log(`  aviso: no se pudo limpiar ${path.split("?")[0]} (${r.status})`);
  }
  const r = await del(`employees?id=eq.${id}`);
  console.log(r.ok ? `✅ Empleado de prueba ${rfc} borrado.` : `✗ No se pudo borrar el empleado (${r.status}). Puede tener audit_events; bórralo a mano si hace falta.`);
}

async function setup() {
  const telefonoRaw = arg("telefono");
  const nombre = arg("nombre").trim();
  const telefonoNormalizado = normalizePhoneFromCsv(telefonoRaw || undefined);
  if (!telefonoNormalizado) {
    console.error(`✗ --telefono inválido ("${telefonoRaw}"). Da 10 dígitos MX. Ej: --telefono=8112345678`);
    process.exit(1);
  }
  if (!nombre) {
    console.error('✗ --nombre requerido. Ej: --nombre="Jose Angel"');
    process.exit(1);
  }
  const apellidoPaterno = arg("apellido-paterno", "Prueba").trim();
  const apellidoMaterno = arg("apellido-materno", apellidoPaterno).trim();
  const curp = arg("curp").trim() || null;
  if (curp && curp.length !== 18) {
    console.error("✗ --curp debe tener 18 caracteres si se proporciona.");
    process.exit(1);
  }
  const monto = Number(arg("monto", "1000"));
  if (!Number.isFinite(monto) || monto <= 0) {
    console.error("✗ --monto debe ser un número positivo.");
    process.exit(1);
  }

  // Datos con defaults de prueba (personales → el contrato sale completo).
  const empRow = {
    rfc,
    curp,
    nombre,
    apellido_paterno: apellidoPaterno,
    apellido_materno: apellidoMaterno,
    apellidos: `${apellidoPaterno} ${apellidoMaterno}`.trim(),
    telefono: telefonoRaw,
    telefono_normalizado: telefonoNormalizado,
    email: arg("email").trim() || null,
    empleador: arg("empleador", "Empresa Empleadora, S.A. de C.V.").trim(),
    estado_civil: arg("estado-civil", "Soltero(a)").trim(),
    nacionalidad: arg("nacionalidad", "Mexicana").trim(),
    lugar_origen: arg("lugar-origen", "Monterrey, Nuevo León").trim(),
    fecha_nacimiento: arg("fecha-nacimiento", "1990-01-01").trim(),
    domicilio: arg("domicilio", "Calle de Prueba 123, Col. Centro, C.P. 64000, Monterrey, N.L.").trim(),
  };

  // 1) Empleado (upsert por RFC).
  const empRes = await post("employees?on_conflict=rfc", [empRow], "resolution=merge-duplicates,return=representation");
  const empJson = await empRes.json();
  if (!empRes.ok) throw new Error(`employees upsert: ${empRes.status} ${JSON.stringify(empJson)}`);
  const employeeId = empJson[0].id as string;

  // 2) Oferta vigente y elegible (una por empleado: update-or-insert).
  const offerFields = { monto_prestamo_autorizado: monto, estatus_conversion: "aceptada", status: "vigente", is_current: true };
  const currentOffer = (await get(`advance_offers?employee_id=eq.${employeeId}&is_current=eq.true&select=id`))[0];
  if (currentOffer) {
    const r = await patch(`advance_offers?id=eq.${currentOffer.id}`, offerFields);
    if (!r.ok) throw new Error(`offer patch: ${r.status} ${await r.text()}`);
  } else {
    const r = await post("advance_offers", [{ employee_id: employeeId, ...offerFields }]);
    if (!r.ok) throw new Error(`offer insert: ${r.status} ${await r.text()}`);
  }

  // 3) Cuenta bancaria activa (una activa por empleado: update-or-insert).
  const bankFields = { clabe: arg("clabe", "012345678901234567").trim(), banco: arg("banco", "BBVA México").trim(), is_active: true };
  const activeBank = (await get(`employee_bank_accounts?employee_id=eq.${employeeId}&is_active=eq.true&select=id`))[0];
  if (activeBank) {
    const r = await patch(`employee_bank_accounts?id=eq.${activeBank.id}`, bankFields);
    if (!r.ok) throw new Error(`bank patch: ${r.status} ${await r.text()}`);
  } else {
    const r = await post("employee_bank_accounts", [{ employee_id: employeeId, ...bankFields }]);
    if (!r.ok) throw new Error(`bank insert: ${r.status} ${await r.text()}`);
  }

  // ── Verificación de "listo" (misma lógica que request-contract) ──
  const emp = (await get(`employees?id=eq.${employeeId}&select=*`))[0];
  const offer = (await get(`advance_offers?employee_id=eq.${employeeId}&is_current=eq.true&select=monto_prestamo_autorizado,is_eligible,status`))[0];
  const bank = (await get(`employee_bank_accounts?employee_id=eq.${employeeId}&is_active=eq.true&select=clabe,banco`))[0];

  const personalMissing = ["estado_civil", "nacionalidad", "lugar_origen", "fecha_nacimiento", "domicilio", "apellido_paterno"].filter((k) => !emp[k]);
  const offerOk = offer && offer.is_eligible && offer.status !== "rechazada";
  const listo = personalMissing.length === 0 && offerOk && !!bank;

  console.log(`\n═══ Empleado de prueba ${rfc} ═══`);
  console.log(`  Nombre:    ${emp.nombre} ${emp.apellido_paterno} ${emp.apellido_materno}`);
  console.log(`  Teléfono:  ${emp.telefono} → normalizado ${emp.telefono_normalizado}`);
  console.log(`  Email:     ${emp.email ?? "(ninguno — EasyLex usará un placeholder)"}`);
  console.log(`  Oferta:    $${offer?.monto_prestamo_autorizado} · elegible=${offer?.is_eligible} · ${offer?.status}`);
  console.log(`  Banco:     ${bank ? `${bank.banco} / ${bank.clabe}` : "SIN cuenta activa"}`);
  console.log(`  Datos personales: ${personalMissing.length ? "FALTAN: " + personalMissing.join(", ") : "completos"}`);
  console.log(`\n  ${listo ? "✅ LISTO para el pipeline." : "✗ AÚN NO listo (revisa lo de arriba)."}`);

  if (listo) {
    console.log(`\nSiguiente paso (docs/primera-prueba-e2e.md):`);
    console.log(`  1. Desde tu teléfono, MANDA "hola" al número del negocio (abre la ventana de 24 h para recibir el PDF firmado).`);
    console.log(`  2. En el portal (rol operaciones), dispara la solicitud de contrato para el RFC ${rfc}.`);
    console.log(`  3. Sigue el avance con:  node scripts/inspect-employee.mjs ${rfc}`);
    console.log(`\nPara borrarlo al terminar:  pnpm dlx tsx scripts/setup-test-employee.ts --cleanup --rfc=${rfc}`);
  }
}

(CLEANUP ? cleanup() : setup()).catch((e) => {
  console.error(e);
  process.exit(1);
});
