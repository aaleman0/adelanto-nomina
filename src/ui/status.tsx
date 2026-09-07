"use client";

import { motion } from "motion/react";
import { SPRING } from "./motion";

/**
 * ESTADO DEL TRABAJO — nunca del operador.
 *
 * Este componente solo describe en qué punto va una pieza de trabajo (una
 * oferta, un contrato, una carga). No mide, compara ni califica a la persona
 * que opera el sistema.
 *
 * Dos decisiones importantes:
 * 1. El estado interno de la base de datos se TRADUCE a lenguaje de operador.
 *    "link_generado" no significa nada en piso; "Falta que firme" sí.
 * 2. El tono nunca viaja solo en el color: cada estado lleva forma (punto
 *    lleno, hueco, anillo latiendo) y palabra. Legible en daltonismo y bajo
 *    luz fuerte.
 */

export type Tone = "wait" | "progress" | "done" | "attention" | "failed";

type StatusDef = { label: string; tone: Tone };

/**
 * Traducción de los estados del sistema al lenguaje del operador.
 * Las llaves son los valores EXACTOS que guarda la base de datos.
 */
const MAP: Record<string, StatusDef> = {
  // ── Estado operativo del expediente (backoffice_contract_control_v1) ──
  // Son los 9 valores que ordenan todo el trabajo del operador. Viven aquí para
  // que ninguna pantalla invente su propia traducción y los conteos se lean
  // igual en todas partes. El orden de precedencia lo define el SQL, no la UI.
  pendiente_envio: { label: "Sin enviar", tone: "wait" },
  mensaje_enviado: { label: "Mensaje enviado", tone: "progress" },
  solicitado: { label: "Pidió su adelanto", tone: "progress" },
  contrato_en_proceso: { label: "Preparando contrato", tone: "progress" },
  contrato_generado: { label: "Falta que firme", tone: "attention" },
  link_expirado: { label: "Se venció el enlace", tone: "attention" },
  no_elegible: { label: "No puede recibirlo", tone: "wait" },

  // ── Oferta de adelanto (advance_offers.status) ──
  vigente: { label: "Sin enviar", tone: "wait" },
  solicitada: { label: "Pidió su adelanto", tone: "progress" },
  firmada: { label: "Firmado", tone: "done" },
  rechazada: { label: "No lo quiso", tone: "wait" },
  reemplazada: { label: "De un ciclo anterior", tone: "wait" },

  // ── Solicitud de contrato (contract_requests.status) ──
  recibida: { label: "Recibida", tone: "progress" },
  generando: { label: "Preparando contrato", tone: "progress" },
  link_generado: { label: "Falta que firme", tone: "attention" },
  firmado: { label: "Firmado", tone: "done" },

  // ── Intento de contrato (contract_attempts.status) ──
  generado: { label: "Listo para firmar", tone: "attention" },
  expirado: { label: "Se venció el enlace", tone: "attention" },

  // ── Cargas de nómina (import_batches.status) ──
  draft: { label: "Borrador", tone: "wait" },
  uploading: { label: "Subiendo archivo", tone: "progress" },
  validating: { label: "Revisando datos", tone: "progress" },
  ready: { label: "Lista para aplicar", tone: "attention" },
  applied: { label: "Aplicada", tone: "done" },
  partial: { label: "Aplicada a medias", tone: "attention" },

  // ── Filas de una carga (raw_import_rows.status) ──
  pendiente: { label: "Pendiente", tone: "wait" },
  aplicada: { label: "Aplicada", tone: "done" },

  // ── Entrega de WhatsApp ──
  // `pending` y `queued` son estados REALES que el backend escribe mientras el
  // mensaje va en camino; sin ellos aquí, el detalle de un envío en curso
  // mostraba la palabra cruda en inglés.
  pending: { label: "Todavía no sale", tone: "wait" },
  queued: { label: "En cola", tone: "wait" },
  sent: { label: "Enviado", tone: "progress" },
  delivered: { label: "Le llegó", tone: "progress" },
  read: { label: "Lo leyó", tone: "progress" },
  failed: { label: "No se pudo enviar", tone: "failed" },

  // ── Genéricos ──
  error: { label: "Falló", tone: "failed" },
  completed: { label: "Terminado", tone: "done" },
  processing: { label: "En proceso", tone: "progress" },
};

/** Traduce un estado crudo. Si no lo conoce, lo muestra tal cual (nunca vacío). */
export function describeStatus(raw: string | null | undefined): StatusDef {
  if (!raw) return { label: "Sin estado", tone: "wait" };
  return MAP[raw] ?? { label: raw.replace(/_/g, " "), tone: "wait" };
}

const toneStyles: Record<Tone, { chip: string; dot: string }> = {
  wait: { chip: "bg-wait-soft text-ink-2 border-line", dot: "border-2 border-wait bg-transparent" },
  progress: { chip: "bg-action-soft text-action border-action-line", dot: "bg-action" },
  done: { chip: "bg-done-soft text-done border-done-line", dot: "bg-done" },
  attention: { chip: "bg-attention-soft text-attention border-attention-line", dot: "bg-attention-fill" },
  failed: { chip: "bg-failed-soft text-failed border-failed-line", dot: "bg-failed" },
};

/**
 * Etiqueta de estado. Al cambiar de estado la ficha se re-anima (key), así el
 * operador ve QUE cambió sin tener que releer la pantalla.
 */
export function Status({
  value,
  size = "md",
}: {
  /** Valor crudo de la base de datos, o un {label, tone} ya resuelto. */
  value: string | null | undefined | StatusDef;
  size?: "sm" | "md";
}) {
  const def = typeof value === "object" && value !== null ? value : describeStatus(value as string);
  const s = toneStyles[def.tone];
  const pad = size === "sm" ? "h-8 px-3 text-[14px]" : "h-10 px-4 text-[15px]";

  return (
    <motion.span
      key={def.label}
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={SPRING.snappy}
      className={`inline-flex shrink-0 items-center gap-2.5 rounded-full border font-semibold ${pad} ${s.chip}`}
    >
      <span
        aria-hidden="true"
        className={`h-2.5 w-2.5 shrink-0 rounded-full ${s.dot} ${def.tone === "progress" ? "live-dot" : ""}`}
      />
      {def.label}
    </motion.span>
  );
}

/** Conteo grande de una categoría de trabajo (cuánto falta, no qué tan rápido). */
export function CountTile({
  count,
  label,
  tone = "wait",
  onClick,
  active = false,
}: {
  count: number;
  label: string;
  tone?: Tone;
  onClick?: () => void;
  active?: boolean;
}) {
  const color = {
    wait: "text-ink-2",
    progress: "text-action",
    done: "text-done",
    attention: "text-attention",
    failed: "text-failed",
  }[tone];

  const Comp = onClick ? motion.button : motion.div;
  return (
    <Comp
      type={onClick ? "button" : undefined}
      onClick={onClick}
      whileHover={onClick ? { y: -3 } : undefined}
      whileTap={onClick ? { y: 0, scale: 0.985 } : undefined}
      transition={SPRING.snappy}
      className={
        `flex min-w-0 flex-col items-start gap-1 rounded-lg border-2 bg-surface p-5 text-left shadow-1 ` +
        (active ? "border-action" : "border-transparent") +
        (onClick ? " cursor-pointer hover:shadow-2" : "")
      }
    >
      <motion.span
        key={count}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={SPRING.soft}
        className={`text-[42px] font-bold leading-none tabular ${color}`}
      >
        {count}
      </motion.span>
      <span className="text-[15px] font-semibold text-ink-2">{label}</span>
    </Comp>
  );
}
