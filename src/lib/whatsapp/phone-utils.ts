/**
 * Utilidades de validación y corrección de teléfonos para WhatsApp Cloud API.
 *
 * Meta Graph API espera el número en formato E.164 SIN el + delante.
 * Para México móvil en WhatsApp: 521 + 10 dígitos = 13 dígitos en total (ej: 5211234567890)
 *
 * Casos detectados:
 *   ok              → 521XXXXXXXXXX u otro formato internacional válido
 *   long_distance   → 52XXXXXXXXXX (12 dígitos, falta '1' móvil WhatsApp México)
 *   missing_prefix  → XXXXXXXXXX    (10 dígitos, falta el prefijo 521)
 *   has_plus        → +52XXXXXXXXXX (tiene '+' — aunque Meta lo acepta, normalizamos)
 *   too_short       → menos de 10 dígitos
 *   too_long        → más de 13 dígitos
 *   null_or_empty   → null, vacío o solo espacios
 */

export type PhoneIssue =
  | "ok"
  | "long_distance"
  | "missing_prefix"
  | "has_plus"
  | "too_short"
  | "too_long"
  | "null_or_empty";

export type PhoneClassification = {
  issue: PhoneIssue;
  /** Valor corregido listo para enviar a Meta, o null si no es reparable automáticamente */
  suggested_fix: string | null;
};

/**
 * Clasifica un teléfono normalizado y sugiere corrección si es posible.
 */
export function classifyPhone(raw: string | null | undefined): PhoneClassification {
  if (!raw || raw.trim() === "") {
    return { issue: "null_or_empty", suggested_fix: null };
  }

  const trimmed = raw.trim();

  // Si tiene +, intentar corregir quitándolo
  if (trimmed.startsWith("+")) {
    const withoutPlus = trimmed.slice(1);
    const inner = classifyPhone(withoutPlus);
    return { issue: "has_plus", suggested_fix: inner.issue === "ok" ? withoutPlus : inner.suggested_fix };
  }

  // Solo dígitos a partir de aquí
  const digits = trimmed.replace(/\D/g, "");

  if (digits.length < 10) {
    return { issue: "too_short", suggested_fix: null };
  }

  if (digits.length > 13) {
    return { issue: "too_long", suggested_fix: null };
  }

  if (digits.length === 10) {
    return { issue: "missing_prefix", suggested_fix: `521${digits}` };
  }

  if (digits.length === 12 && digits.startsWith("52")) {
    return { issue: "long_distance", suggested_fix: `521${digits.slice(2)}` };
  }

  if (digits.length === 13 && digits.startsWith("521")) {
    return { issue: "ok", suggested_fix: null };
  }

  // Cualquier otra longitud entre 10–13 que no sea el formato esperado
  if (digits.length === 11 || digits.length === 13) {
    return { issue: "too_long", suggested_fix: null };
  }

  // 12 dígitos que NO empiezan con 52 (otro país)
  return { issue: "ok", suggested_fix: null };
}

/**
 * Normaliza un teléfono para enviarlo a Meta.
 * Devuelve el valor corregido si hay una corrección automática disponible,
 * o el valor original si ya está en formato correcto.
 * Devuelve null si el teléfono no es reparable.
 */
export function normalizePhoneForMeta(raw: string | null | undefined): string | null {
  const { issue, suggested_fix } = classifyPhone(raw);
  if (issue === "ok") return raw!.trim().replace(/\D/g, "");
  return suggested_fix;
}

/**
 * Re-implementación mejorada de normalizePhone para usar en csv.ts.
 * Cubre todos los casos de teléfonos mexicanos comunes.
 */
export function normalizePhoneFromCsv(value: string | undefined): string | null {
  const digits = value?.replace(/\D/g, "") ?? "";

  if (!digits) return null;

  if (digits.length === 10) return `521${digits}`;

  if (digits.length === 12 && digits.startsWith("521")) return digits;

  if (digits.length === 12 && digits.startsWith("52")) return `521${digits.slice(2)}`;

  if (digits.length === 13 && digits.startsWith("521")) return digits;

  // Otros formatos entre 10 y 15 → pasar tal cual (otro país)
  if (digits.length >= 10 && digits.length <= 15) return digits;

  return null;
}
