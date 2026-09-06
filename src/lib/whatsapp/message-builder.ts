import type { TemplateComponent } from "@/lib/whatsapp/client";
import type { MetaTemplateComponent } from "@/lib/whatsapp/templates";
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

/**
 * Respaldo por nombre para plantillas anteriores a la sincronización con Meta.
 * Se usa SOLO cuando no se conoce la forma real de la plantilla; en cuanto
 * `describeTemplateShape` puede leer sus componentes, manda la forma real.
 */
const TEMPLATES_WITH_IMAGE_HEADER = new Set(["adelanto_nomina_v2", "adelanto_nomina_v3"]);

/**
 * Forma de una plantilla: qué componentes acepta realmente el mensaje.
 *
 * Meta valida el payload contra la definición aprobada, y castiga los dos
 * errores simétricos: mandar una cabecera de imagen a una plantilla que no la
 * declara la rechaza, y omitirla en una que sí la declara falla con
 * "expected IMAGE". Lo mismo con los botones: una plantilla de RESPUESTA RÁPIDA
 * (la del chatbot) NO acepta el componente de botón de URL.
 *
 * Por eso la forma se DEDUCE de la plantilla sincronizada desde Meta en vez de
 * mantener listas de nombres a mano: al crear una plantilla nueva no hay que
 * tocar código.
 */
export type TemplateShape = {
  hasImageHeader: boolean;
  hasUrlButton: boolean;
  /** Cuántas variables {{n}} declara el cuerpo. */
  bodyVariables: number;
};

/** Lee la forma real de una plantilla a partir de sus componentes de Meta. */
export function describeTemplateShape(components: MetaTemplateComponent[] | null | undefined): TemplateShape {
  const lista = components ?? [];
  const header = lista.find((c) => c.type === "HEADER");
  const body = lista.find((c) => c.type === "BODY");
  const botones = lista.find((c) => c.type === "BUTTONS");

  // Las variables del cuerpo son {{1}}, {{2}}… El número más alto manda: así una
  // plantilla que repita {{1}} no infla la cuenta.
  const numeros = [...(body?.text ?? "").matchAll(/\{\{\s*(\d+)\s*\}\}/g)].map((m) => Number(m[1]));

  return {
    hasImageHeader: header?.format?.toUpperCase() === "IMAGE",
    hasUrlButton: (botones?.buttons ?? []).some((b) => b.type?.toUpperCase() === "URL"),
    bodyVariables: numeros.length > 0 ? Math.max(...numeros) : 0,
  };
}

function formatMonto(monto: number | null): string {
  if (monto === null || monto === undefined) return "N/A";
  return new Intl.NumberFormat("es-MX", { maximumFractionDigits: 0 }).format(monto);
}

export function buildBulkTemplateMessage(
  recipient: BulkRecipient,
  templateName: string = DEFAULT_BULK_TEMPLATE,
  options: {
    headerImageUrl?: string | null;
    buttonUrl?: string | null;
    /** Forma real de la plantilla. Si viene, manda sobre las reglas por nombre. */
    shape?: TemplateShape | null;
  } = {},
): BuiltTemplateMessage {
  const to = normalizePhoneForMeta(recipient.telefono_normalizado);

  if (!to) {
    return { ok: false, error: "Sin teléfono normalizado" };
  }

  const monto = formatMonto(recipient.monto_prestamo_autorizado);
  const nombre = recipient.nombre || "Empleado";
  const shape = options.shape ?? null;

  // Cuántas variables mandar: lo dice la plantilla si la conocemos. Mandar de
  // más o de menos hace que Meta rechace el mensaje entero.
  const cuantasVariables =
    shape && shape.bodyVariables > 0
      ? shape.bodyVariables
      : templateName === LEGACY_TEMPLATE
        ? 2
        : 3;

  // Orden fijo por convención de las plantillas de oferta: nombre, empleador, monto.
  // La legada (2 variables) omite el empleador.
  const todas = cuantasVariables === 2
    ? [nombre, monto]
    : [nombre, recipient.empleador || "Tu empresa", monto];
  const usadas = todas.slice(0, cuantasVariables);

  const variables: Record<string, string> = Object.fromEntries(
    usadas.map((valor, i) => [String(i + 1), valor]),
  );

  const components: TemplateComponent[] = [
    {
      type: "body",
      parameters: usadas.map((value) => ({ type: "text", text: value })),
    },
  ];

  // Cabecera de imagen: solo si la plantilla la declara.
  const llevaImagen = shape ? shape.hasImageHeader : TEMPLATES_WITH_IMAGE_HEADER.has(templateName);
  if (options.headerImageUrl && llevaImagen) {
    components.unshift({
      type: "header",
      parameters: [{ type: "image", image: { link: options.headerImageUrl } }],
    });
  }

  // Botón de URL: solo si la plantilla lo declara. Una plantilla de respuesta
  // rápida (la del chatbot) no lo acepta, y mandárselo tumba el envío completo.
  const llevaBotonUrl = shape ? shape.hasUrlButton : true;
  if (options.buttonUrl && llevaBotonUrl) {
    components.push({
      type: "button",
      sub_type: "url",
      index: "0",
      parameters: [{ type: "text", text: signingUrlSuffix(options.buttonUrl) }],
    });
  }

  return { ok: true, to, variables, components };
}
