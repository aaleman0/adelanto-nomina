/**
 * TTL del link de firma, en horas. Único lugar de verdad.
 *
 * Antes estaba declarado por separado en `request-contract.ts`,
 * `backoffice-actions.ts` y `create-easylex-attempt.ts`, con riesgo de que al
 * cambiar el TTL en un sitio los otros quedaran desincronizados.
 */
export const LINK_TTL_HOURS = 2;
