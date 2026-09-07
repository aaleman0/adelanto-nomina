import type {
  ContractControlMetricKey,
  ContractOperationalStatus,
} from "@/lib/backoffice/contract-control";
import type { Tone } from "@/ui/status";

/**
 * Vocabulario de Personas: cómo se NOMBRA en pantalla lo que la base guarda en
 * clave.
 *
 * Aquí solo vive lo que el sistema de diseño NO nombra ya. Los nueve estados
 * del expediente (`operational_status`) NO se traducen en este módulo: los
 * traduce `<Status>` de `@/ui/status`, que es el único diccionario de estados
 * del sistema. Tenerlos también aquí hacía que la misma columna se llamara
 * distinto según la pantalla que la mostrara.
 *
 * El módulo sigue siendo server-safe a propósito (sin "use client"): la lista y
 * el expediente lo usan durante el render del servidor.
 */

/**
 * Orden del filtro: el del AVANCE del trabajo, que es como el operador recorre
 * el embudo. No es la precedencia de estados (esa la resuelve la vista de SQL
 * al calcular `operational_status`, no la interfaz).
 */
export const ESTADOS_EN_ORDEN: ContractOperationalStatus[] = [
  "pendiente_envio",
  "mensaje_enviado",
  "solicitado",
  "contrato_en_proceso",
  "contrato_generado",
  "firmado",
  "link_expirado",
  "error",
  "no_elegible",
];

/**
 * Contadores de trabajo. Cada uno apunta al estado que filtra al pulsarlo.
 *
 * OJO con `requested`: la capa de lectura suma ahí `solicitado` +
 * `contrato_en_proceso` en un solo número, así que al filtrar por él la lista
 * puede traer menos filas que el conteo. La pantalla lo advierte en voz alta
 * en vez de disimularlo.
 */
export const CONTADOR: Record<
  ContractControlMetricKey,
  { filtro: ContractOperationalStatus; label: string; tone: Tone; nota?: string }
> = {
  pendingSend: { filtro: "pendiente_envio", label: "Sin enviar", tone: "attention" },
  messageSent: { filtro: "mensaje_enviado", label: "Con mensaje enviado", tone: "progress" },
  requested: {
    filtro: "solicitado",
    label: "Pidieron su adelanto",
    tone: "progress",
    nota: "Este número también incluye a quienes ya tienen el contrato preparándose; al filtrar verás solo a los que acaban de pedirlo.",
  },
  contractGenerated: { filtro: "contrato_generado", label: "Falta que firmen", tone: "attention" },
  signed: { filtro: "firmado", label: "Firmados", tone: "done" },
  expired: { filtro: "link_expirado", label: "Con el enlace vencido", tone: "attention" },
  errors: { filtro: "error", label: "Con una falla", tone: "failed" },
  notEligible: { filtro: "no_elegible", label: "No elegibles", tone: "wait" },
};

/**
 * Zona horaria fija: el sistema se opera desde México y el servidor puede
 * correr en UTC. Sin fijarla, el mismo dato se leería con una hora distinta en
 * el servidor y en el navegador.
 */
const FECHA_LARGA = new Intl.DateTimeFormat("es-MX", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "America/Mexico_City",
});

const MONEDA = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  minimumFractionDigits: 2,
});

export function fecha(iso: string | null | undefined, vacio = "Sin registro"): string {
  if (!iso) return vacio;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? vacio : FECHA_LARGA.format(d);
}

export function pesos(monto: number | null | undefined): string {
  return typeof monto === "number" ? MONEDA.format(monto) : "Sin monto";
}

export function nombreDe(persona: {
  empleado?: string | null;
  nombre?: string | null;
  apellidos?: string | null;
}): string {
  const compuesto = [persona.nombre, persona.apellidos].filter(Boolean).join(" ").trim();
  return persona.empleado?.trim() || compuesto || "Empleado sin nombre";
}

/**
 * Se saca del render a propósito: `react-hooks/purity` prohíbe leer el reloj
 * mientras se pinta un componente.
 */
export function enlaceSigueVigente(expiraEn: string | null | undefined): boolean {
  if (!expiraEn) return false;
  const t = new Date(expiraEn).getTime();
  return Number.isFinite(t) && t > Date.now();
}

/**
 * De dónde salió cada movimiento de la línea de tiempo.
 *
 * `source` viaja en clave ('easylex', 'backoffice', 'csv'…) y esa clave no se
 * enseña nunca: lo que el operador necesita saber es QUÉ parte del sistema
 * movió el expediente, no cómo se llama por dentro. Por eso el caso por defecto
 * tampoco devuelve la clave cruda: cualquier origen nuevo se lee como "Sistema"
 * hasta que alguien le ponga nombre aquí.
 */
export function origenDelEvento(source: string | null | undefined): string {
  switch (source) {
    // ManyChat es el proveedor por el que salen los WhatsApp; para quien opera
    // es el mismo canal.
    case "whatsapp":
    case "manychat":
      return "WhatsApp";
    case "easylex":
      return "Firma electrónica";
    case "backoffice":
      return "Operación";
    case "csv":
      return "Carga de nómina";
    // 'backend' y 'system': el propio sistema haciendo su trabajo solo.
    default:
      return "Sistema";
  }
}

/** Tipos de mensaje de WhatsApp que el sistema escribe hoy. */
export function tipoDeMensaje(tipo: string | null | undefined): string {
  switch (tipo) {
    case "bulk_contract_offer":
      return "Oferta de adelanto (envío masivo)";
    case "contract_offer":
      return "Oferta de adelanto";
    case "contract_link":
      return "Enlace para firmar";
    default:
      return tipo ? tipo.replace(/_/g, " ") : "Mensaje";
  }
}

/**
 * Motivos de inelegibilidad tal como los devuelve `validateEligibility`,
 * traducidos a "qué pasó + qué hacer". El texto crudo es correcto pero no dice
 * qué se supone que haga el operador con él.
 */
export function motivoNoElegible(motivo: string | null | undefined): string {
  if (!motivo) return "No aparece como elegible en el ciclo actual.";
  if (motivo.startsWith("Oferta ya en estado: solicitada")) {
    return "Ya pidió su adelanto: el contrato está en curso, no hace falta volver a ofrecérselo.";
  }
  if (motivo.startsWith("Oferta ya en estado: firmada")) {
    return "Ya firmó su contrato en este ciclo.";
  }
  switch (motivo) {
    case "Sin oferta vigente":
      return "No tiene oferta de adelanto en el ciclo actual. Aparecerá cuando cargues la nómina del periodo.";
    case "Oferta no elegible":
      return "El archivo de nómina lo marcó como no elegible para este ciclo.";
    case "Oferta rechazada":
      return "Rechazó el adelanto en este ciclo.";
    case "Sin cuenta bancaria activa":
      return "No tiene una cuenta bancaria activa. Corrige la CLABE en el archivo de nómina y vuelve a cargarlo.";
    default:
      return motivo;
  }
}

export type Aviso = { tono: "ok" | "atencion" | "falla"; texto: string };

/**
 * Traduce el `?action_status=` con el que vuelven las server actions. Es el
 * único canal por el que el operador se entera de si su acción funcionó, así
 * que cada caso dice qué pasó y, cuando hay algo que hacer, qué sigue.
 */
export function avisoDeAccion(status: string | undefined): Aviso | null {
  switch (status) {
    // Resultados de «Comprobar si ya firmó». Se le dice al operador qué
    // contestó EasyLex, no si la consulta "funcionó": lo que necesita saber es
    // si la persona firmó o no.
    case "comprobacion_firmado":
      return {
        tono: "ok",
        texto: "¡Confirmado! Esta persona ya firmó y el expediente quedó actualizado.",
      };
    case "comprobacion_todavia_no":
      return {
        tono: "atencion",
        texto: "EasyLex dice que todavía no firma. Si te consta que sí, avísale a soporte.",
      };
    case "comprobacion_ya_estaba":
      return { tono: "atencion", texto: "Ya aparecía como firmada: no se cambió nada." };
    case "comprobacion_sin_contrato":
      return {
        tono: "atencion",
        texto: "No hay un contrato en EasyLex que consultar todavía.",
      };
    case "comprobacion_error":
      return {
        tono: "falla",
        texto: "No se pudo consultar a EasyLex en este momento. Inténtalo de nuevo en unos minutos.",
      };
    case "contract_ready":
      return {
        tono: "ok",
        texto:
          "Contrato generado. El enlace de firma salió por WhatsApp; si no le llega, cópialo desde aquí y mándaselo por otro medio.",
      };
    case "link_regenerated":
      return {
        tono: "ok",
        texto: "Listo: hay un enlace de firma nuevo y ya quedó registrado en la línea de tiempo.",
      };
    case "contract_resent":
      return { tono: "ok", texto: "El contrato firmado se le reenvió por WhatsApp." };
    case "link_reused":
      return {
        tono: "atencion",
        texto: "El enlace anterior seguía vigente, así que se reutilizó. No se gastó otra firma.",
      };
    case "already_signed":
      return { tono: "atencion", texto: "Este contrato ya estaba firmado: no se hizo nada." };
    case "contract_link_failed":
      return {
        tono: "atencion",
        texto:
          "El contrato se generó, pero el enlace de firma no. Espera unos minutos y usa «Reintentar el contrato».",
      };
    case "no_offer":
      return {
        tono: "atencion",
        texto: "Esta persona no tiene oferta de adelanto en el ciclo actual. Carga la nómina del periodo.",
      };
    case "not_eligible":
      return {
        tono: "atencion",
        texto: "La oferta de esta persona no está disponible para adelanto en este ciclo.",
      };
    case "contract_resend_failed":
      return {
        tono: "atencion",
        texto:
          "El contrato quedó archivado, pero el reenvío por WhatsApp no se completó. Vuelve a intentarlo o entrégaselo por otro medio.",
      };
    case "invalid_request":
      return {
        tono: "falla",
        texto:
          "Faltan datos de la persona (RFC o teléfono) para pedir el contrato. Corrígelos en el archivo de nómina y vuelve a cargarlo.",
      };
    case "contract_error":
      return {
        tono: "falla",
        texto: "No se pudo generar el contrato. Revisa la línea de tiempo y vuelve a intentarlo.",
      };
    case "not_found":
      return {
        tono: "falla",
        texto: "No se encontró la solicitud de contrato sobre la que ibas a operar. Recarga el expediente.",
      };
    case "forbidden":
      return {
        tono: "falla",
        texto: "Tu rol no permite esta acción; pídesela a un administrador.",
      };
    default:
      return null;
  }
}
