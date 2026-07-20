import type { TemplateComponent } from "@/lib/whatsapp/client";
import { normalizePhoneForMeta } from "@/lib/whatsapp/phone-utils";

/**
 * Construcción del payload de un mensaje de plantilla.
 *
 * Se extrajo del bucle de envío masivo para que el envío inline y el worker de
 * la cola produzcan exactamente el mismo mensaje. Es una función pura: no toca
 * la base de datos ni la API de Meta, así que se puede testear directamente.
 */

export type BulkRecipient = {
  employee_id: string;
  nombre: string | null;
  empleador: string | null;
  rfc?: string | null;
  telefono_normalizado: string | null;
  monto_prestamo_autorizado: number | null;
};

export type BuiltTemplateMessage =
  | {
      ok: true;
      to: string;
      variables: Record<string, string>;
      components: TemplateComponent[];
    }
  | { ok: false; error: string };

export const DEFAULT_BULK_TEMPLATE = "adelanto_nomina_v2";

/** Plantilla legada: solo 2 variables de cuerpo (nombre y monto). */
const LEGACY_TEMPLATE = "adelanto_nomina";

function formatMonto(monto: number | null): string {
  if (monto === null || monto === undefined) return "N/A";
  return new Intl.NumberFormat("es-MX", { maximumFractionDigits: 0 }).format(monto);
}

export function buildBulkTemplateMessage(
  recipient: BulkRecipient,
  templateName: string = DEFAULT_BULK_TEMPLATE,
  options: { headerImageUrl?: string | null } = {},
): BuiltTemplateMessage {
  const to = normalizePhoneForMeta(recipient.telefono_normalizado);

  if (!to) {
    return { ok: false, error: "Sin teléfono normalizado" };
  }

  const monto = formatMonto(recipient.monto_prestamo_autorizado);
  const nombre = recipient.nombre || "Empleado";

  const variables: Record<string, string> =
    templateName === LEGACY_TEMPLATE
      ? { "1": nombre, "2": monto }
      : { "1": nombre, "2": recipient.empleador || "Tu empresa", "3": monto };

  const components: TemplateComponent[] = [
    {
      type: "body",
      parameters: Object.entries(variables).map(([, value]) => ({
        type: "text",
        text: value,
      })),
    },
  ];

  // La cabecera de imagen solo aplica a la plantilla v2, que la declara.
  // Enviarla en la legada haría que Meta rechace el mensaje.
  if (options.headerImageUrl && templateName === DEFAULT_BULK_TEMPLATE) {
    components.unshift({
      type: "header",
      parameters: [{ type: "image", image: { link: options.headerImageUrl } }],
    });
  }

  return { ok: true, to, variables, components };
}
