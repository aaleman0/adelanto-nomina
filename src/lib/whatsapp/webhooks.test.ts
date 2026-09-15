import { beforeEach, describe, expect, it, vi } from "vitest";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";

vi.mock("@/lib/whatsapp/chatbot", () => ({
  handleInboundMessage: vi.fn(),
  quienEscribio: vi.fn(),
}));

import { handleWebhook } from "./webhooks";
import { handleInboundMessage, quienEscribio } from "@/lib/whatsapp/chatbot";

type Resultado = { data?: unknown; error: unknown };

/** Imita el constructor de consultas de Supabase y anota cada llamada. */
function consulta(resultado: Resultado) {
  const llamadas: unknown[][] = [];
  const q: Record<string, unknown> = {
    then: (ok: (v: Resultado) => unknown, mal?: (e: unknown) => unknown) =>
      Promise.resolve(resultado).then(ok, mal),
  };
  for (const metodo of ["select", "eq", "limit", "insert", "update"]) {
    q[metodo] = (...args: unknown[]) => {
      llamadas.push([metodo, ...args]);
      return q;
    };
  }
  return { q, llamadas };
}

function logsCon(...consultas: ReturnType<typeof consulta>[]) {
  vi.mocked(getSupabaseAdmin).mockReturnValue({
    from: (tabla: string) => {
      if (tabla !== "integration_logs") throw new Error(`consulta inesperada a ${tabla}`);
      const siguiente = consultas.shift();
      if (!siguiente) throw new Error("consulta de más a integration_logs");
      return siguiente.q;
    },
  } as never);
}

const MENSAJE = {
  id: "wamid.1",
  from: "5218132629745",
  timestamp: "1788803701",
  type: "text",
  text: { body: "Gracias por comunicarte ¿Cómo podemos ayudarte?" },
};

const webhook = () =>
  handleWebhook({
    object: "whatsapp_business_account",
    entry: [{ id: "waba", changes: [{ field: "messages", value: { messaging_product: "whatsapp", messages: [MENSAJE] } }] }],
  });

const nuevo = () => consulta({ data: [], error: null });
const guardado = () => consulta({ error: null });

beforeEach(() => {
  vi.mocked(handleInboundMessage).mockReset();
  vi.mocked(quienEscribio).mockReset();
  vi.mocked(logger.warn).mockClear();
});

/**
 * El texto de cada mensaje entrante se guarda, pero con el teléfono tachado:
 * sin la anotación posterior queda sin dueño y nadie lo ve en el expediente.
 * Así una respuesta automática de WhatsApp Business pareció una solicitud perdida.
 */
describe("anotación del mensaje entrante", () => {
  it("anota de quién era y qué hizo el sistema con él", async () => {
    const anotacion = consulta({ error: null });
    logsCon(nuevo(), guardado(), anotacion);
    vi.mocked(handleInboundMessage).mockResolvedValue({ handled: true, kind: "text_fallback", employeeId: "emp-2" });

    await webhook();

    expect(anotacion.llamadas).toContainEqual([
      "update",
      { entity_type: "employees", entity_id: "emp-2", response_payload: { chatbot: "text_fallback" } },
    ]);
    expect(anotacion.llamadas).toContainEqual(["eq", "correlation_id", "wamid.1"]);
    expect(anotacion.llamadas).toContainEqual(["eq", "direction", "inbound"]);
  });

  it("si el chatbot falla, igual liga el mensaje a quien escribió", async () => {
    const anotacion = consulta({ error: null });
    logsCon(nuevo(), guardado(), anotacion);
    vi.mocked(handleInboundMessage).mockRejectedValue(new Error("se cayó EasyLex"));
    vi.mocked(quienEscribio).mockResolvedValue("emp-3");

    await webhook();

    expect(quienEscribio).toHaveBeenCalledWith(MENSAJE.from);
    expect(anotacion.llamadas).toContainEqual([
      "update",
      { entity_type: "employees", entity_id: "emp-3", response_payload: { chatbot: "error" } },
    ]);
  });

  it("sin dueño conocido anota solo qué pasó, sin inventar a quién", async () => {
    const anotacion = consulta({ error: null });
    logsCon(nuevo(), guardado(), anotacion);
    vi.mocked(handleInboundMessage).mockResolvedValue({ handled: true, kind: "text_fallback", employeeId: null });

    await webhook();

    expect(anotacion.llamadas).toContainEqual(["update", { response_payload: { chatbot: "text_fallback" } }]);
  });

  it("si la anotación falla, el webhook no revienta", async () => {
    logsCon(nuevo(), guardado(), consulta({ error: { message: "caída" } }));
    vi.mocked(handleInboundMessage).mockResolvedValue({ handled: true, kind: "si", employeeId: "emp-1" });

    await expect(webhook()).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalledWith("whatsapp.chatbot.anotacion_fallida", expect.anything());
  });

  it("un mensaje repetido no se vuelve a procesar ni a anotar", async () => {
    logsCon(consulta({ data: [{ id: "log-1" }], error: null }));

    await webhook();

    expect(handleInboundMessage).not.toHaveBeenCalled();
  });
});
