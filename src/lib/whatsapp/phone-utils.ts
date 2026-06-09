/**
 * Utilidades de validación y corrección de teléfonos para WhatsApp Cloud API.
 *
 * Meta Graph API espera el número en formato E.164 SIN el + delante.
 * Para México: 52 + 10 dígitos = 12 dígitos en total (ej: 521234567890)
 *
 * Casos detectados:
 *   ok              → 52XXXXXXXXXX  (12 dígitos, formato correcto)
 *   long_distance   → 521XXXXXXXXXX (13 dígitos, incluye '1' de larga distancia viejo)
 *   missing_prefix  → XXXXXXXXXX    (10 dígitos, falta el prefijo 52)
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

  // 10 dígitos exactos → falta prefijo 52 México
  if (digits.length === 10) {
    return { issue: "missing_prefix", suggested_fix: `52${digits}` };
  }

  // 12 dígitos que empiezan con 52 → correcto
  if (digits.length === 12 && digits.startsWith("52")) {
    return { issue: "ok", suggested_fix: null };
  }

  // 13 dígitos que empiezan con 521 → larga distancia vieja (ej: 5211XXXXXXXX)
  if (digits.length === 13 && digits.startsWith("521")) {
    // Quitar el '1' de larga distancia: 521XXXXXXXXXX → 52XXXXXXXXXX
    const fixed = `52${digits.slice(3)}`;
    return { issue: "long_distance", suggested_fix: fixed };
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

  // 10 dígitos → agregar prefijo México
  if (digits.length === 10) return `52${digits}`;

  // 12 dígitos con prefijo 52 → correcto
  if (digits.length === 12 && digits.startsWith("52")) return digits;

  // 13 dígitos con larga distancia 521 → quitar el 1
  if (digits.length === 13 && digits.startsWith("521")) return `52${digits.slice(3)}`;

  // Otros formatos entre 10 y 15 → pasar tal cual (otro país)
  if (digits.length >= 10 && digits.length <= 15) return digits;

  return null;
}
