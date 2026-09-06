// Genera un link /solicitar/<token> firmado para probar el auto-servicio en el
// navegador de la laptop (sin celular, sin túnel, sin plantilla de WhatsApp).
//
//   node scripts/solicitar-link.mjs [employeeId]
//
// Sin argumento usa el empleado de prueba Angel Aleman (RFC AEEA940214H78).
// Lee SOLICITAR_TOKEN_SECRET del entorno o de .env.local. Imprime SOLO la URL
// (el token es el employeeId firmado, NO el secreto). Réplica exacta de
// signSolicitarToken en src/lib/contracts/solicitar-token.ts.
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";

function loadSecret() {
  if (process.env.SOLICITAR_TOKEN_SECRET) return process.env.SOLICITAR_TOKEN_SECRET;
  try {
    const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
    const line = env.split(/\r?\n/).find((l) => l.startsWith("SOLICITAR_TOKEN_SECRET="));
    if (line) return line.slice("SOLICITAR_TOKEN_SECRET=".length).trim().replace(/^["']|["']$/g, "");
  } catch {
    /* .env.local ausente: seguimos con env del proceso */
  }
  return "";
}

const secret = loadSecret();
if (!secret) {
  console.error("Falta SOLICITAR_TOKEN_SECRET (en el entorno o en .env.local).");
  process.exit(1);
}

const employeeId = process.argv[2] || "e9016344-4a49-41f8-b7b0-0e72b8ffcca3"; // Angel Aleman (AEEA940214H78)
const base = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/+$/, "");
const ttlMs = 30 * 24 * 60 * 60 * 1000; // 30 días, igual que DEFAULT_TTL_MS

const b64url = (s) => Buffer.from(s).toString("base64url");
const payload = b64url(JSON.stringify({ e: employeeId, exp: Date.now() + ttlMs }));
const sig = createHmac("sha256", secret).update(payload).digest("base64url");

console.log(`${base}/solicitar/${payload}.${sig}`);
