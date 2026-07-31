import { z } from "zod";

/**
 * Esquemas de validación de las peticiones del módulo WhatsApp.
 *
 * Se definen aquí, y no dentro de cada route handler, para poder testearlos
 * de forma aislada sin levantar el servidor.
 */

export const BULK_SEND_MODES = ["import", "manual", "status"] as const;

// Estados operativos a los que se puede enviar en bloque desde una etapa del
// embudo. Hoy solo "pendiente_envio" (el primer contacto); ampliar con cuidado,
// porque reenviar la plantilla inicial a otras etapas sería incorrecto.
export const BULK_SEND_TARGET_STATUSES = ["pendiente_envio"] as const;
export const BULK_SEND_STATUSES = ["pending", "sending", "completed", "failed"] as const;
export const DELIVERY_STATUSES = ["sent", "delivered", "read", "failed"] as const;

/**
 * Paginación que **acota** en vez de rechazar.
 *
 * Un `pageSize=999` se recorta a 100, no cae al valor por defecto: es el
 * comportamiento que tenía el código original con `Math.min(100, ...)` y del
 * que dependen los consumidores. Un valor no numérico sí cae al default,
 * porque no hay nada que acotar.
 */
function paginationParam(fallback: number, max: number) {
  return z.coerce
    .number()
    .catch(fallback)
    .transform((value) => {
      if (!Number.isFinite(value)) return fallback;
      return Math.min(max, Math.max(1, Math.trunc(value)));
    });
}

/** Número de página: sin tope superior, pero nunca menor que 1. */
const pageParam = z.coerce
  .number()
  .catch(1)
  .transform((value) => (Number.isFinite(value) ? Math.max(1, Math.trunc(value)) : 1));

/**
 * UUID con la misma permisividad que el tipo `uuid` de Postgres.
 *
 * `z.string().uuid()` de Zod 4 valida además el nibble de versión según la RFC,
 * así que rechaza identificadores como `00000000-...-0001` (versión 0) que
 * Postgres acepta sin problema. Validar más estricto que la base de datos hace
 * que la API rechace ids que sí existirían, así que aquí solo se comprueba la
 * forma hexadecimal.
 */
export const uuidParam = (message = "Debe ser un UUID válido.") =>
  z
    .string()
    .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, message);

// ---------------------------------------------------------------------------
// POST /api/whatsapp/bulk
// ---------------------------------------------------------------------------

export const BulkSendBodySchema = z
  .object({
    mode: z.enum(BULK_SEND_MODES, {
      message: "Es requerido y debe ser 'import', 'manual' o 'status'.",
    }),
    importId: uuidParam().optional(),
    // Tope de abuso, alineado con PhoneAuditFixBodySchema. El envío corre inline,
    // así que un arreglo absurdo no debe siquiera entrar al bucle.
    employeeIds: z.array(uuidParam()).max(5000).optional(),
    status: z.enum(BULK_SEND_TARGET_STATUSES).optional(),
    templateName: z.string().trim().min(1).max(512).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.mode === "import" && !value.importId) {
      ctx.addIssue({
        code: "custom",
        path: ["importId"],
        message: "Es requerido cuando mode=import.",
      });
    }

    if (value.mode === "manual" && (!value.employeeIds || value.employeeIds.length === 0)) {
      ctx.addIssue({
        code: "custom",
        path: ["employeeIds"],
        message: "Debe incluir al menos un empleado cuando mode=manual.",
      });
    }

    if (value.mode === "status" && !value.status) {
      ctx.addIssue({
        code: "custom",
        path: ["status"],
        message: "Es requerido cuando mode=status.",
      });
    }
  });

export type BulkSendBody = z.infer<typeof BulkSendBodySchema>;

export const BulkSendActionSchema = z.object({
  // Un `action` desconocido cae a "send", que era el comportamiento previo.
  action: z.enum(["send", "validate"]).catch("send").default("send"),
});

// ---------------------------------------------------------------------------
// GET /api/whatsapp/bulk/history
// ---------------------------------------------------------------------------

export const BulkHistoryQuerySchema = z.object({
  page: pageParam,
  pageSize: paginationParam(20, 100),
  status: z.enum(BULK_SEND_STATUSES).optional(),
  mode: z.enum(BULK_SEND_MODES).optional(),
  // z.coerce.date() rechaza fechas no parseables, que antes provocaban un 500
  // al llamar .toISOString() sobre un Invalid Date.
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
});

export type BulkHistoryQuery = z.infer<typeof BulkHistoryQuerySchema>;

// ---------------------------------------------------------------------------
// GET /api/whatsapp/bulk/detail
// ---------------------------------------------------------------------------

export const BulkDetailQuerySchema = z.object({
  id: uuidParam("id es requerido y debe ser un UUID válido."),
  page: pageParam,
  pageSize: paginationParam(50, 200),
  status: z.enum(DELIVERY_STATUSES).optional(),
  q: z.string().trim().max(120).optional(),
});

export type BulkDetailQuery = z.infer<typeof BulkDetailQuerySchema>;

// ---------------------------------------------------------------------------
// GET /api/whatsapp/employees/search
// ---------------------------------------------------------------------------

export const EmployeeSearchQuerySchema = z.object({
  q: z.string().trim().max(120).default(""),
  limit: paginationParam(10, 25),
});

export type EmployeeSearchQuery = z.infer<typeof EmployeeSearchQuerySchema>;

// ---------------------------------------------------------------------------
// POST /api/whatsapp/config
// ---------------------------------------------------------------------------

export const WhatsAppConfigBodySchema = z.object({
  access_token: z.string().trim().max(1024).optional(),
  phone_number_id: z.string().trim().max(64).optional(),
  business_number: z.string().trim().max(32).optional(),
  webhook_verify_token: z.string().trim().max(256).optional(),
  app_secret: z.string().trim().max(256).optional(),
});

export type WhatsAppConfigBody = z.infer<typeof WhatsAppConfigBodySchema>;

// ---------------------------------------------------------------------------
// POST /api/whatsapp/test
// ---------------------------------------------------------------------------

export const WhatsAppTestBodySchema = z.object({
  access_token: z.string().trim().max(1024).optional(),
  phone_number_id: z.string().trim().max(64).optional(),
});

export type WhatsAppTestBody = z.infer<typeof WhatsAppTestBodySchema>;

// ---------------------------------------------------------------------------
// POST /api/whatsapp/phone-audit/fix
// ---------------------------------------------------------------------------

/**
 * Una corrección individual. El teléfono se normaliza a solo dígitos como parte
 * de la validación, así que el handler recibe el valor ya limpio.
 */
export const PhoneFixEntrySchema = z.object({
  employee_id: uuidParam(),
  telefono_normalizado: z
    .string()
    .transform((value) => value.replace(/\D/g, ""))
    .refine((digits) => digits.length >= 10 && digits.length <= 15, {
      message: "Debe tener entre 10 y 15 dígitos.",
    }),
});

export type PhoneFixEntry = z.infer<typeof PhoneFixEntrySchema>;

/**
 * El sobre se valida de forma laxa (solo que `fixes` sea un array no vacío de
 * objetos) y cada entrada se valida individualmente en el handler. Así una
 * corrección inválida no tumba el lote entero, que era el comportamiento previo.
 */
export const PhoneAuditFixBodySchema = z.object({
  fixes: z
    .array(z.unknown())
    .min(1, "No se enviaron correcciones.")
    .max(5000, "Máximo 5000 correcciones por petición."),
});

export type PhoneAuditFixBody = z.infer<typeof PhoneAuditFixBodySchema>;
