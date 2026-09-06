/**
 * Llamadas a la API desde las pantallas de Ajustes.
 *
 * Dos decisiones:
 *
 * 1. El mensaje que ve la persona NUNCA es el del servidor. Los endpoints
 *    devuelven texto pensado para un log ("HTTP 400", mensajes crudos de Meta);
 *    aquí se traduce a qué pasó + qué hacer.
 * 2. Aun así se conserva `detalle` con el texto del servidor. Ajustes es la
 *    única sección de admin: quien la abre es quien puede tocar las variables
 *    del despliegue, y sin el motivo real de Meta un fallo de credenciales es
 *    imposible de resolver. Se muestra aparte y en segundo plano, nunca como
 *    el mensaje principal.
 */

type SobreApi = { ok?: boolean; error?: string };

export type Resultado<T> =
  | { ok: true; datos: T }
  | { ok: false; mensaje: string; detalle?: string };

/** Traduce un fallo de transporte o de estado HTTP a lenguaje de operador. */
function mensajePorEstado(status: number): string | null {
  if (status === 401) return "Se cerró tu sesión. Vuelve a entrar para continuar.";
  if (status === 403) return "Tu rol no permite este cambio. Pídeselo a un administrador.";
  if (status === 429)
    return "Se hicieron muchos intentos seguidos. Espera un minuto y vuelve a intentarlo.";
  if (status >= 500)
    return "El sistema no pudo completar la operación. Vuelve a intentarlo; si sigue igual, avisa a soporte.";
  return null;
}

export async function pedirJson<T>(url: string, init?: RequestInit): Promise<Resultado<T>> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch {
    return {
      ok: false,
      mensaje: "No hubo respuesta del servidor. Revisa tu conexión y vuelve a intentarlo.",
    };
  }

  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }

  const sobre = json as SobreApi | null;
  const detalle = typeof sobre?.error === "string" && sobre.error ? sobre.error : undefined;

  // `ok:false` con status 200 también es fallo: varios endpoints responden así.
  if (!res.ok || sobre?.ok === false) {
    return {
      ok: false,
      mensaje:
        mensajePorEstado(res.status) ??
        "No se pudo completar la operación. Revisa los datos y vuelve a intentarlo.",
      detalle,
    };
  }

  return { ok: true, datos: json as T };
}

/** Cuerpo JSON de una escritura, con el encabezado que exigen los endpoints. */
export function cuerpoJson(datos: unknown): RequestInit {
  return {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(datos),
  };
}
