/**
 * TTL del link de firma, en horas. Único lugar de verdad.
 *
 * Antes estaba declarado por separado en `request-contract.ts`,
 * `backoffice-actions.ts` y `create-easylex-attempt.ts`, con riesgo de que al
 * cambiar el TTL en un sitio los otros quedaran desincronizados.
 *
 * Un día entero, no dos horas: quien contesta "Sí" en su turno no siempre tiene
 * la INE a mano ni un rato tranquilo para firmar desde el celular, y un enlace
 * que muere en dos horas lo obliga a resolverlo ahí mismo o perder el adelanto.
 *
 * Este plazo NO es el de la ventana para PEDIR el adelanto, que vive en
 * `ventana-oferta.ts` y desde el 2026-09-24 también vale 24 h. Que coincidan en
 * el número es casualidad de los dos valores, no una relación: son reglas con
 * dueños distintos —cuánto tiempo la empresa acepta solicitudes, y cuánto tiempo
 * tiene para firmar quien ya pidió— y se miden desde momentos distintos: este
 * desde que se generó el contrato, aquel desde que salió la oferta. Estuvieron
 * atadas a este mismo número y no se podía mover una sin la otra. No volver a
 * derivarlas: hay pruebas en los dos sentidos que lo impiden.
 */
export const LINK_TTL_HOURS = 24;

/** El mismo plazo en milisegundos, para no repetir la multiplicación. */
export const LINK_TTL_MS = LINK_TTL_HOURS * 60 * 60 * 1000;

/**
 * Cómo se le nombra el plazo a la persona. Se deriva del número a propósito:
 * las "2 horas" vivían escritas a mano en seis pantallas y un cambio de plazo
 * las habría dejado prometiendo algo que ya no era cierto.
 */
export const DURACION_DEL_ENLACE = `${LINK_TTL_HOURS} horas`;
