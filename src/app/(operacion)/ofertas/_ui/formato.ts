import { describeStatus, type Tone } from "@/ui/status";

/**
 * Piezas compartidas por las tres pantallas de Ofertas.
 *
 * Aquí vive la traducción de lo que devuelve el backend al lenguaje del
 * operador. Se concentra en un solo módulo a propósito: los motivos de
 * inelegibilidad están fijados por pruebas del backend y si alguno cambia hay
 * un único lugar que tocar.
 *
 * Los tipos declarados abajo son deliberadamente MÁS ESTRECHOS que el payload
 * real (`select("*")` de whatsapp_bulk_sends): omiten `created_by` para que sea
 * imposible pintarlo por descuido. La UI muestra el estado del trabajo, nunca
 * quién lo hizo.
 */

export type EstadoResuelto = { label: string; tone: Tone };

export type EmpleadoBase = {
  employee_id: string;
  nombre: string | null;
  apellidos: string | null;
  rfc: string | null;
  telefono_normalizado: string | null;
  empleador: string | null;
  monto_prestamo_autorizado: number | null;
};

export type EmpleadoElegibilidad = EmpleadoBase & {
  eligible: boolean;
  reason?: string;
};

export type LoteAplicado = {
  id: string;
  filename: string | null;
  total_rows: number | null;
  applied_at: string | null;
  status: string | null;
};

export type ComponentePlantilla = {
  type: string;
  format?: string;
  text?: string;
  buttons?: Array<{ type: string; text: string; url?: string; phone_number?: string }>;
};

export type PlantillaGuardada = {
  id: string;
  meta_template_id: string;
  name: string;
  status: string;
  category: string;
  language: string;
  components: ComponentePlantilla[];
  synced_at: string;
};

/** Fila del historial. Sin `created_by` y sin `employee_ids` a propósito. */
export type EnvioResumen = {
  id: string;
  mode: string | null;
  status: string | null;
  import_id: string | null;
  eligible_count: number | null;
  sent_count: number | null;
  failed_count: number | null;
  delivered_count: number | null;
  read_count: number | null;
  error_summary: string | null;
  created_at: string | null;
};

export type MensajeEnviado = {
  id: string;
  employee_id: string;
  nombre: string | null;
  apellidos: string | null;
  rfc: string | null;
  /** El endpoint lo llama `telefono` pero contiene `telefono_normalizado`. */
  telefono: string | null;
  delivery_status: string | null;
  status: string | null;
  error_message: string | null;
  created_at: string | null;
  wa_message_id: string | null;
};

export type ResultadoEnvio = {
  bulkSendId: string;
  /** `queued` = se encoló en segundo plano; sent/failed vienen en 0. */
  status: "completed" | "failed" | "queued";
  total: number;
  eligible: number;
  sent: number;
  failed: number;
  /**
   * Elegibles a los que NO se les volvió a mandar porque ya se les había
   * mandado esa misma plantilla en los últimos minutos (dedup del backend,
   * `bulk-send.ts`). Solo lo reporta el envío inmediato; en el encolado se
   * deduce (ver `omitidosPorRepetido`).
   */
  skipped?: number;
  queued?: number;
  errors: Array<{ employeeId: string; rfc?: string; error: string }>;
};

/**
 * Cuántos quedaron fuera por repetido.
 *
 * El envío inmediato lo cuenta y lo devuelve en `skipped`. El encolado no: ahí
 * los duplicados se PRE-FILTRAN antes de crear las tareas, así que lo que no se
 * encoló ni falló es exactamente lo que se omitió por repetido. Sin esta cuenta,
 * un segundo clic sobre 50 personas responde `sent: 0` y la pantalla parecería
 * decir que no pasó nada.
 */
export function omitidosPorRepetido(r: ResultadoEnvio): number {
  if (typeof r.skipped === "number") return r.skipped;
  // Sin `queued` no hay resta posible: mejor no decir nada que inventar que a
  // todos se les omitió el mensaje.
  if (r.status !== "queued" || typeof r.queued !== "number") return 0;
  return Math.max(0, r.eligible - r.queued - r.failed);
}

/* ── Traducciones ────────────────────────────────────────────────────── */

/**
 * Motivos EXACTOS que devuelve `src/lib/whatsapp/eligibility.ts`, en el orden
 * en que los evalúa la cascada. La clave es literal: no normalizar ni recortar.
 */
const MOTIVOS: Array<[string, string]> = [
  ["Sin oferta vigente", "No trae oferta en el ciclo actual. Vuelve a cargar la nómina para incluirlo."],
  ["Oferta no elegible", "El archivo de nómina lo marcó como no elegible en este periodo."],
  ["Oferta rechazada", "Ya respondió que no quiere el adelanto."],
  ["Oferta ya en estado: solicitada", "Ya pidió su adelanto: su contrato va en camino."],
  ["Oferta ya en estado: firmada", "Ya firmó su contrato de este ciclo."],
  ["Sin cuenta bancaria activa", "No tiene cuenta bancaria activa donde depositarle."],
];

/** Convierte el motivo técnico en una frase que explica qué pasa y qué sigue. */
export function explicarMotivo(reason?: string | null): string {
  if (!reason) return "No se le puede enviar en este momento.";
  const exacto = MOTIVOS.find(([clave]) => clave === reason);
  if (exacto) return exacto[1];
  // La cascada interpola el estado, así que puede llegar uno no previsto aquí.
  if (reason.startsWith("Oferta ya en estado:")) {
    return "Su oferta ya avanzó de etapa; no procede volver a enviarle.";
  }
  return reason;
}

/** Estado de un envío masivo completo (whatsapp_bulk_sends.status). */
export function estadoDeEnvio(status: string | null | undefined): EstadoResuelto {
  switch (status) {
    case "pending":
      return { label: "En espera", tone: "wait" };
    case "sending":
      return { label: "Enviando", tone: "progress" };
    case "completed":
      return { label: "Terminado", tone: "done" };
    case "failed":
      return { label: "Falló el envío", tone: "failed" };
    default:
      return { label: "Sin estado", tone: "wait" };
  }
}

/** Cómo se eligió a quién enviarle (whatsapp_bulk_sends.mode). */
export function modoDeEnvio(mode: string | null | undefined): string {
  switch (mode) {
    case "import":
      return "Ciclo completo";
    case "manual":
      return "Personas sueltas";
    case "status":
      return "Por etapa del trabajo";
    default:
      return "Sin modo";
  }
}

/** Estado de aprobación de la plantilla en Meta. */
export function estadoDePlantilla(status: string | null | undefined): EstadoResuelto {
  switch ((status ?? "").toUpperCase()) {
    case "APPROVED":
      return { label: "Aprobada por WhatsApp", tone: "done" };
    case "PENDING":
    case "IN_APPEAL":
    case "PENDING_DELETION":
      return { label: "En revisión de WhatsApp", tone: "attention" };
    case "REJECTED":
    case "DISABLED":
    case "PAUSED":
      return { label: "Rechazada por WhatsApp", tone: "failed" };
    default:
      return { label: "Estado desconocido", tone: "wait" };
  }
}

/**
 * Idioma de la plantilla.
 *
 * Meta lo guarda como código (`es_MX`), que en pantalla no le dice nada a quien
 * opera. `Intl.DisplayNames` resuelve cualquier código dado de alta hoy o
 * mañana, así que no hay una tabla que se quede corta al sincronizar plantillas
 * nuevas. Si el código no se reconoce, se muestra tal cual: es preferible a
 * inventar un idioma.
 */
export function idiomaDePlantilla(code: string | null | undefined): string {
  if (!code?.trim()) return "Idioma sin especificar";
  const etiqueta = code.trim().replace(/_/g, "-");
  try {
    const nombre = new Intl.DisplayNames(["es-MX"], { type: "language" }).of(etiqueta);
    // ICU devuelve el propio código cuando no lo conoce.
    if (!nombre || nombre === etiqueta) return etiqueta;
    return nombre.charAt(0).toUpperCase() + nombre.slice(1);
  } catch {
    return etiqueta;
  }
}

export type CategoriaPlantilla = {
  etiqueta: string;
  /** Qué implica la categoría para que el mensaje llegue. Vacío si no se sabe. */
  entrega: string;
};

/**
 * Categoría de la plantilla en Meta.
 *
 * No es un adorno: la categoría decide la ENTREGA. Una `utility` le llega a un
 * número que nunca nos ha escrito; una `marketing` puede quedarse sin entregar
 * hasta que Meta verifique el negocio. Es la diferencia entre un envío que
 * funciona y uno que sale "enviado" y no lo recibe nadie, así que se dice al
 * lado de la plantilla y no en un manual.
 */
export function categoriaDePlantilla(category: string | null | undefined): CategoriaPlantilla {
  switch ((category ?? "").trim().toUpperCase()) {
    case "UTILITY":
      return {
        etiqueta: "Aviso de servicio",
        entrega: "WhatsApp la entrega aunque la persona nunca nos haya escrito.",
      };
    case "MARKETING":
      return {
        etiqueta: "Promoción",
        entrega:
          "WhatsApp puede no entregarla a quien nunca nos ha escrito, mientras Meta no tenga verificado el negocio.",
      };
    case "AUTHENTICATION":
      return {
        etiqueta: "Código de verificación",
        entrega: "Es la categoría de los códigos de un solo uso, no la de una oferta.",
      };
    default:
      return {
        etiqueta: category?.trim() ? category.trim().toLowerCase() : "Categoría sin especificar",
        entrega: "",
      };
  }
}

/**
 * Cómo va la entrega de UN mensaje (whatsapp_contract_messages.delivery_status).
 *
 * `null` no es "sin estado": es un mensaje recién encolado que el trabajador de
 * fondo todavía no toma (`bulk-send.ts` lo escribe así al encolar). Decirle
 * "Sin estado" al operador lo deja sin saber si espera o si algo se rompió.
 */
export function estadoDeEntrega(delivery: string | null | undefined): EstadoResuelto {
  if (!delivery) return { label: "En cola", tone: "wait" };
  return describeStatus(delivery);
}

export function estaAprobada(plantilla: PlantillaGuardada | null): boolean {
  return (plantilla?.status ?? "").toUpperCase() === "APPROVED";
}

/** Texto del cuerpo de la plantilla, con las variables ya legibles. */
export function vistaPreviaPlantilla(plantilla: PlantillaGuardada | null): string | null {
  const cuerpo = plantilla?.components?.find((c) => c.type?.toUpperCase() === "BODY")?.text;
  if (!cuerpo) return null;
  // El backend rellena {{1}} nombre, {{2}} empleador, {{3}} monto.
  return cuerpo
    .replace(/\{\{\s*1\s*\}\}/g, "[nombre]")
    .replace(/\{\{\s*2\s*\}\}/g, "[empleador]")
    .replace(/\{\{\s*3\s*\}\}/g, "[monto]");
}

/* ── Formatos ────────────────────────────────────────────────────────── */

const PESOS = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  maximumFractionDigits: 2,
});

const FECHA_HORA = new Intl.DateTimeFormat("es-MX", {
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const FECHA = new Intl.DateTimeFormat("es-MX", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

export function montoMXN(valor: number | null | undefined): string {
  if (valor === null || valor === undefined || !Number.isFinite(valor)) return "Sin monto";
  return PESOS.format(valor);
}

export function fechaHora(iso: string | null | undefined): string {
  if (!iso) return "Sin fecha";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "Sin fecha" : FECHA_HORA.format(d);
}

export function fecha(iso: string | null | undefined): string {
  if (!iso) return "Sin fecha";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "Sin fecha" : FECHA.format(d);
}

export function nombreCompleto(
  persona: { nombre: string | null; apellidos: string | null },
): string {
  const partes = [persona.nombre, persona.apellidos].filter(Boolean).join(" ").trim();
  return partes.length > 0 ? partes : "Sin nombre registrado";
}

/** Plural sin trucos: "1 persona" / "12 personas". */
export function personas(n: number): string {
  return n === 1 ? "1 persona" : `${n} personas`;
}

/* ── Acceso a los endpoints ──────────────────────────────────────────── */

/**
 * Traduce el fallo HTTP a algo accionable. El mensaje crudo del servidor NO se
 * enseña: puede traer nombres de tabla o de proveedor, que no le dicen nada a
 * quien opera y sí lo asustan.
 */
function mensajeDeFallo(status: number): string {
  if (status === 401) return "Se cerró tu sesión. Vuelve a entrar y repite la operación.";
  if (status === 403) return "Tu rol no permite esta acción; pídeselo a un administrador.";
  if (status === 404) return "Ese envío ya no existe o el enlace está mal.";
  if (status === 429) return "Se hicieron demasiados envíos seguidos. Espera un minuto y vuelve a intentarlo.";
  if (status >= 500) return "El sistema no respondió. Vuelve a intentarlo; si sigue igual, avisa a soporte.";
  return "No se pudo completar la operación. Revisa los datos y vuelve a intentarlo.";
}

/** `fetch` con el contrato `{ok:...}` del backend ya resuelto. */
export async function pedirJson<T>(url: string, init?: RequestInit): Promise<T> {
  let respuesta: Response;
  try {
    respuesta = await fetch(url, { cache: "no-store", ...init });
  } catch {
    throw new Error("No hay conexión con el servidor. Revisa tu internet y vuelve a intentarlo.");
  }

  const cuerpo = (await respuesta.json().catch(() => null)) as (T & { ok?: boolean }) | null;

  if (!respuesta.ok || !cuerpo || cuerpo.ok === false) {
    throw new Error(mensajeDeFallo(respuesta.status));
  }

  return cuerpo;
}

/**
 * ¿Esta plantilla sirve con el flujo actual?
 *
 * Las plantillas con BOTÓN DE ENLACE quedaron obsoletas: su enlace se arma con
 * una base fija guardada en Meta, y el sistema ya no manda eso —ahora el
 * empleado responde con los botones Sí/No y el enlace de firma se le manda
 * después—. Si se elige una de esas, el mensaje sale, pero el botón lleva a un
 * enlace roto y el empleado se queda sin poder firmar.
 *
 * Se detecta leyendo la definición que Meta devolvió, no por nombre: así una
 * plantilla nueva con botón de enlace también queda avisada.
 */
export function plantillaLlevaBotonDeEnlace(components: ComponentePlantilla[] | null | undefined): boolean {
  const botones = (components ?? []).find((c) => c.type?.toUpperCase() === "BUTTONS");
  return (botones?.buttons ?? []).some((b) => b.type?.toUpperCase() === "URL");
}

export const AVISO_PLANTILLA_OBSOLETA =
  "Esta plantilla lleva un botón de enlace y ya no funciona con el flujo actual: " +
  "el empleado recibiría un enlace roto. Usa la plantilla con los botones Sí / No.";
