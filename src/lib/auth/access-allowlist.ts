/**
 * Allow-list de acceso al backoffice (opt-in). Decide qué correos pueden iniciar
 * sesión, ANTES de RBAC. Es defensa en profundidad frente a un OAuth de Supabase
 * permisivo: aunque Supabase acepte la cuenta, sólo entra quien esté en la lista.
 *
 * Dos formas, combinables:
 *  - `ALLOWED_EMAILS`: correos concretos, separados por coma. Es lo indicado para
 *    un equipo chico con datos sensibles (PII/nómina): NO deja entrar a todo un
 *    dominio, sólo a las personas nombradas.
 *  - `ALLOWED_EMAIL_DOMAINS`: dominios completos. Útil sólo si el dominio es
 *    exclusivo de los operadores.
 *
 * Si NINGUNA está definida, no hay restricción (comportamiento por defecto, no
 * rompe dev ni tests). Si alguna lo está, el correo debe coincidir con al menos
 * una entrada de cualquiera de las dos.
 */

function parseList(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

export function isEmailAllowed(email: string | null | undefined): boolean {
  const emails = parseList(process.env.ALLOWED_EMAILS);
  const domains = parseList(process.env.ALLOWED_EMAIL_DOMAINS).map((d) => d.replace(/^@/, ""));

  // Sin allow-lists configuradas → sin restricción.
  if (emails.length === 0 && domains.length === 0) return true;

  const normalized = (email ?? "").trim().toLowerCase();
  // Con restricción activa, un correo ausente o mal formado no pasa.
  if (!normalized.includes("@")) return false;

  const domain = normalized.slice(normalized.lastIndexOf("@") + 1);
  return emails.includes(normalized) || domains.includes(domain);
}
