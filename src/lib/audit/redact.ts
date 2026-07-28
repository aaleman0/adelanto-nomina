/**
 * Redacción de PII en payloads que se persisten en `integration_logs` (una
 * tabla consultable). Enmascara por NOMBRE DE CLAVE los identificadores
 * sensibles —RFC, CURP, CLABE, teléfono, email, nombres, domicilio— y conserva
 * la estructura para poder depurar. No toca el contenido de mensajes libres ni
 * claves neutrales como `template.name`.
 *
 * Cubre tanto la forma de Meta (from, wa_id, to) como la de EasyLex
 * (firstName, lastName, motherLastName, email) y la del propio esquema en
 * español (nombre, apellidos, telefono_normalizado, clabe...).
 */

const SENSITIVE_KEYS = new Set([
  // Identificadores fiscales/bancarios
  "rfc",
  "curp",
  "clabe",
  "banco",
  "cuenta",
  // Teléfonos (esquema propio + Meta)
  "telefono",
  "telefono_normalizado",
  "phone",
  "celular",
  "from",
  "wa_id",
  "to",
  "recipient",
  // Correo
  "email",
  "correo",
  "correo_electronico",
  // Nombres (esquema propio + EasyLex)
  "nombre",
  "nombres",
  "apellido",
  "apellidos",
  "apellido_paterno",
  "apellido_materno",
  "firstname",
  "lastname",
  "motherlastname",
  // Domicilio / nacimiento
  "domicilio",
  "direccion",
  "address",
  "fecha_nacimiento",
]);

const REDACTED = "[redacted]";

function redactValue(value: unknown): unknown {
  if (value === null || value === undefined) return value; // conservar la forma nula
  if (Array.isArray(value)) return value.map(() => REDACTED);
  return REDACTED;
}

function walk(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(walk);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      out[key] = SENSITIVE_KEYS.has(key.toLowerCase()) ? redactValue(val) : walk(val);
    }
    return out;
  }
  return value;
}

export function redactPII<T>(value: T): T {
  return walk(value) as T;
}
