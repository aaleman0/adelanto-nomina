import type { TemplateComponent } from "@/lib/whatsapp/client";
import { normalizePhoneForMeta } from "@/lib/whatsapp/phone-utils";
import { signingUrlSuffix } from "@/lib/contracts/send-contract-link";

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
const TEMPLATES_WITH_IMAGE_HEADER = new Set(["adelanto_nomina_v2", "adelanto_nomina_v3"]);

function formatMonto(monto: number | null): string {
  if (monto === null || monto === undefined) return "N/A";
  return new Intl.NumberFormat("es-MX", { maximumFractionDigits: 0 }).format(monto);
}

export function buildBulkTemplateMessage(
  recipient: BulkRecipient,
  templateName: string = DEFAULT_BULK_TEMPLATE,
  options: { headerImageUrl?: string | null; buttonUrl?: string | null } = {},
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

  // Solo algunas plantillas declaran cabecera de imagen. Enviarla a una que no
  // la tenga haría que Meta rechace el mensaje; omitirla en una que sí la tenga
  // produce el error inverso ("expected IMAGE").
  if (options.headerImageUrl && TEMPLATES_WITH_IMAGE_HEADER.has(templateName)) {
    components.unshift({
      type: "header",
      parameters: [{ type: "image", image: { link: options.headerImageUrl } }],
    });
  }

  if (options.buttonUrl) {
    components.push({
      type: "button",
      sub_type: "url",
      index: "0",
      parameters: [{ type: "text", text: signingUrlSuffix(options.buttonUrl) }],
    });
  }

  return { ok: true, to, variables, components };
}
