import { NextResponse } from "next/server";
import type { ZodError, ZodType } from "zod";

/**
 * Validación de entrada en el borde de la API.
 *
 * Antes de esto, cada route handler parseaba a mano con `as` y `if` sueltos:
 * el tipo era una promesa del desarrollador, no una garantía. Estos helpers
 * hacen que el tipo devuelto esté realmente validado en runtime.
 *
 * Uso:
 *
 *   const parsed = await parseJsonBody(request, MiSchema);
 *   if (!parsed.success) return parsed.response;
 *   const { campo } = parsed.data;  // tipado y validado
 */

export type ParseResult<T> =
  | { success: true; data: T }
  | { success: false; response: NextResponse };

export type ValidationIssue = {
  path: string;
  message: string;
};

function toIssues(error: ZodError): ValidationIssue[] {
  return error.issues.map((issue) => ({
    path: issue.path.join(".") || "(raíz)",
    message: issue.message,
  }));
}

/**
 * Construye la respuesta 400 estándar.
 *
 * `error` es una cadena legible que incluye el nombre del campo, para que los
 * consumidores existentes (y los tests E2E, que buscan el nombre del campo con
 * expresiones regulares) sigan funcionando. `issues` da el detalle estructurado.
 */
export function validationErrorResponse(error: ZodError): NextResponse {
  const issues = toIssues(error);

  return NextResponse.json(
    {
      ok: false,
      error: issues.map((i) => `${i.path}: ${i.message}`).join("; "),
      issues,
    },
    { status: 400 },
  );
}

export async function parseJsonBody<T>(
  request: Request,
  schema: ZodType<T>,
): Promise<ParseResult<T>> {
  let raw: unknown;

  try {
    raw = await request.json();
  } catch {
    return {
      success: false,
      response: NextResponse.json(
        { ok: false, error: "El cuerpo de la petición debe ser JSON válido.", issues: [] },
        { status: 400 },
      ),
    };
  }

  const result = schema.safeParse(raw);
  if (!result.success) {
    return { success: false, response: validationErrorResponse(result.error) };
  }

  return { success: true, data: result.data };
}

/**
 * Valida los query params de una petición.
 *
 * Los valores llegan siempre como cadenas, así que los esquemas deben usar
 * `z.coerce` para los tipos numéricos y de fecha.
 */
export function parseQuery<T>(request: Request, schema: ZodType<T>): ParseResult<T> {
  const { searchParams } = new URL(request.url);
  const raw: Record<string, string> = {};

  for (const [key, value] of searchParams.entries()) {
    raw[key] = value;
  }

  const result = schema.safeParse(raw);
  if (!result.success) {
    return { success: false, response: validationErrorResponse(result.error) };
  }

  return { success: true, data: result.data };
}

/**
 * Escapa un valor para usarlo dentro de un filtro `.or()` de PostgREST.
 *
 * PostgREST separa condiciones con comas y partes con puntos, así que un
 * término de búsqueda con `,` `.` o `()` altera la estructura del filtro.
 * Entrecomillar el valor y escapar comillas y barras lo neutraliza.
 *
 * No es inyección SQL —PostgREST parametriza contra la base— pero sí permite
 * manipular la consulta, y produce errores 500 con términos legítimos como
 * "Pérez, Juan".
 */
export function escapePostgrestValue(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}
