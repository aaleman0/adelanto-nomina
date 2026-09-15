import { beforeEach, describe, expect, it, vi } from "vitest";
import { getSupabaseAdmin } from "@/lib/supabase/server";

const { enviar } = vi.hoisted(() => ({ enviar: vi.fn() }));

vi.mock("@/lib/whatsapp/client", () => ({
  getWhatsAppClient: () => ({ sendTextMessage: enviar }),
}));
vi.mock("@/lib/contracts/request-contract", () => ({
  parseRequestContractPayload: (x: unknown) => x,
  requestContractFromWhatsApp: vi.fn(),
}));
vi.mock("@/lib/contracts/ventana-oferta", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/contracts/ventana-oferta")>()),
  ventanaDeLaPersona: vi.fn(),
}));
vi.mock("@/lib/contracts/solicitud-previa", () => ({ solicitudPrevia: vi.fn() }));

import {
  handleInboundMessage,
  CONTRATO_NO_PREPARADO_MESSAGE,
  NO_OFFER_MESSAGE,
  SIN_OFERTA_ABIERTA_MESSAGE,
  VENTANA_CERRADA_MESSAGE,
  type InboundMessage,
} from "./chatbot";
import { requestContractFromWhatsApp } from "@/lib/contracts/request-contract";
import { ventanaDeLaPersona } from "@/lib/contracts/ventana-oferta";
import { solicitudPrevia } from "@/lib/contracts/solicitud-previa";

type Resultado = { data: unknown; error: unknown };

/** Imita el constructor de consultas de Supabase: encadenable, y se resuelve con `await`. */
function consulta(resultado: Resultado) {
  const q: Record<string, unknown> = {
    then: (ok: (v: Resultado) => unknown, mal?: (e: unknown) => unknown) =>
      Promise.resolve(resultado).then(ok, mal),
    maybeSingle: () => Promise.resolve(resultado),
  };
  for (const metodo of ["select", "eq", "in", "not", "order", "limit", "update"]) {
    q[metodo] = () => q;
  }
  return q;
}

const TELEFONO = "5218713330257";
const EMPLEADO = { id: "emp-1", rfc: "AEEA940214H78", nombre: "Angel Aleman", telefono_normalizado: TELEFONO };
const OFERTA_VIGENTE = { id: "of-1", status: "vigente", is_eligible: true, monto_prestamo_autorizado: 4000 };

function baseCon(colas: Record<string, Resultado[]>) {
  const pendientes = Object.fromEntries(Object.entries(colas).map(([t, rs]) => [t, rs.map(consulta)]));
  vi.mocked(getSupabaseAdmin).mockReturnValue({
    from: (tabla: string) => {
      const siguiente = pendientes[tabla]?.shift();
      if (!siguiente) throw new Error(`consulta inesperada a ${tabla}`);
      return siguiente;
    },
  } as never);
}

const haceMinutos = (m: number) => String(Math.floor((Date.now() - m * 60_000) / 1000));

function boton(texto: string, minutos = 1): InboundMessage {
  return { id: `wamid.${texto}`, from: TELEFONO, timestamp: haceMinutos(minutos), type: "button", button: { text: texto } };
}

beforeEach(() => {
  enviar.mockReset();
  vi.mocked(requestContractFromWhatsApp).mockReset();
  vi.mocked(ventanaDeLaPersona).mockReset();
  vi.mocked(solicitudPrevia).mockReset();
});

/**
 * El "Sí" es la única respuesta que genera un contrato legalmente vinculante,
 * y llega desde una superficie sin sesión. Estas pruebas recorren el camino
 * real del chatbot con la ventana simulada: lo que cuidan es que ningún "Sí"
 * llegue al pipeline sin haber pasado por ella.
 */
describe("el Sí pasa por la ventana antes de generar el contrato", () => {
  it("fuera de plazo le dice que cerró y no genera contrato", async () => {
    baseCon({ employees: [{ data: [EMPLEADO], error: null }], advance_offers: [{ data: OFERTA_VIGENTE, error: null }] });
    vi.mocked(ventanaDeLaPersona).mockResolvedValue({ abierta: false, motivo: "fuera_de_plazo" });

    const resultado = await handleInboundMessage(boton("Sí, lo quiero"));

    expect(enviar).toHaveBeenCalledWith(TELEFONO, VENTANA_CERRADA_MESSAGE);
    expect(requestContractFromWhatsApp).not.toHaveBeenCalled();
    expect(resultado).toEqual({ handled: true, kind: "si", employeeId: "emp-1" });
  });

  it("a quien nunca se le envió la oferta no le habla de un plazo vencido", async () => {
    baseCon({ employees: [{ data: [EMPLEADO], error: null }], advance_offers: [{ data: OFERTA_VIGENTE, error: null }] });
    vi.mocked(ventanaDeLaPersona).mockResolvedValue({ abierta: false, motivo: "sin_envio" });

    await handleInboundMessage(boton("Sí, lo quiero"));

    expect(enviar).toHaveBeenCalledWith(TELEFONO, SIN_OFERTA_ABIERTA_MESSAGE);
    expect(requestContractFromWhatsApp).not.toHaveBeenCalled();
  });

  it("un sí escrito pasa por la misma ventana", async () => {
    baseCon({ employees: [{ data: [EMPLEADO], error: null }], advance_offers: [{ data: OFERTA_VIGENTE, error: null }] });
    vi.mocked(ventanaDeLaPersona).mockResolvedValue({ abierta: false, motivo: "fuera_de_plazo" });

    const resultado = await handleInboundMessage({
      id: "wamid.texto",
      from: TELEFONO,
      timestamp: haceMinutos(1),
      type: "text",
      text: { body: "Sí" },
    });

    expect(resultado.kind).toBe("si_texto");
    expect(requestContractFromWhatsApp).not.toHaveBeenCalled();
  });

  it("dentro de la ventana genera el contrato y le manda el enlace", async () => {
    baseCon({ employees: [{ data: [EMPLEADO], error: null }], advance_offers: [{ data: OFERTA_VIGENTE, error: null }] });
    vi.mocked(ventanaDeLaPersona).mockResolvedValue({ abierta: true, cierraEn: Date.now() + 60_000 });
    vi.mocked(requestContractFromWhatsApp).mockResolvedValue({
      ok: true,
      status: "contract_ready",
      link_easylex: "https://easylex.test/firma/abc",
      expires_at_formatted: "7 sep, 2:00 p.m.",
    } as never);

    await handleInboundMessage(boton("Sí, lo quiero"));

    expect(requestContractFromWhatsApp).toHaveBeenCalledTimes(1);
    expect(enviar).toHaveBeenCalledWith(TELEFONO, expect.stringContaining("https://easylex.test/firma/abc"));
  });

  it("mide la ventana con la hora en que la persona contestó, no con la de procesarlo", async () => {
    baseCon({ employees: [{ data: [EMPLEADO], error: null }], advance_offers: [{ data: OFERTA_VIGENTE, error: null }] });
    vi.mocked(ventanaDeLaPersona).mockResolvedValue({ abierta: false, motivo: "fuera_de_plazo" });
    const mensaje = boton("Sí, lo quiero", 20);

    await handleInboundMessage(mensaje);

    expect(ventanaDeLaPersona).toHaveBeenCalledWith("emp-1", Number(mensaje.timestamp) * 1000);
  });

  it("sin oferta vigente no consulta la ventana ni genera nada", async () => {
    baseCon({ employees: [{ data: [EMPLEADO], error: null }], advance_offers: [{ data: null, error: null }] });

    await handleInboundMessage(boton("Sí, lo quiero"));

    expect(enviar).toHaveBeenCalledWith(TELEFONO, NO_OFFER_MESSAGE);
    expect(ventanaDeLaPersona).not.toHaveBeenCalled();
    expect(requestContractFromWhatsApp).not.toHaveBeenCalled();
  });

  it("el No no pasa por la ventana: rechazar fuera de plazo es inofensivo", async () => {
    baseCon({
      employees: [{ data: [EMPLEADO], error: null }],
      advance_offers: [
        { data: OFERTA_VIGENTE, error: null },
        { data: [{ id: "of-1" }], error: null },
      ],
    });

    await handleInboundMessage(boton("No, gracias"));

    expect(ventanaDeLaPersona).not.toHaveBeenCalled();
    expect(enviar).toHaveBeenCalledWith(TELEFONO, expect.stringContaining("Gracias por confirmar"));
  });
});

const OFERTA_SOLICITADA = { ...OFERTA_VIGENTE, status: "solicitada" };

/**
 * Quien ya pidió dentro del plazo no genera otro contrato cuando la ventana
 * cerró, pero recibe lo que de verdad tiene.
 */
describe("quien ya pidió", () => {
  it("con el contrato caído oye la verdad, sin enlace ni contrato nuevo", async () => {
    baseCon({ employees: [{ data: [EMPLEADO], error: null }], advance_offers: [{ data: OFERTA_SOLICITADA, error: null }] });
    vi.mocked(ventanaDeLaPersona).mockResolvedValue({ abierta: false, motivo: "fuera_de_plazo" });
    vi.mocked(solicitudPrevia).mockResolvedValue("fallo");

    await handleInboundMessage(boton("Sí, lo quiero"));

    expect(solicitudPrevia).toHaveBeenCalledWith("of-1");
    expect(enviar).toHaveBeenCalledWith(TELEFONO, CONTRATO_NO_PREPARADO_MESSAGE);
    expect(requestContractFromWhatsApp).not.toHaveBeenCalled();
  });

  it("con un enlace vigente lo recibe: el pipeline lo reusa", async () => {
    baseCon({ employees: [{ data: [EMPLEADO], error: null }], advance_offers: [{ data: OFERTA_SOLICITADA, error: null }] });
    vi.mocked(ventanaDeLaPersona).mockResolvedValue({ abierta: false, motivo: "fuera_de_plazo" });
    vi.mocked(solicitudPrevia).mockResolvedValue("enlace_vigente");
    vi.mocked(requestContractFromWhatsApp).mockResolvedValue({
      ok: true,
      status: "contract_ready",
      link_easylex: "https://easylex.test/firma/regenerado",
      expires_at_formatted: "7 sep, 4:00 p.m.",
    } as never);

    await handleInboundMessage(boton("Sí, lo quiero"));

    expect(requestContractFromWhatsApp).toHaveBeenCalledTimes(1);
    expect(enviar).toHaveBeenCalledWith(TELEFONO, expect.stringContaining("https://easylex.test/firma/regenerado"));
  });

  it("con la ventana abierta va directo al pipeline, sin revisar su solicitud", async () => {
    baseCon({ employees: [{ data: [EMPLEADO], error: null }], advance_offers: [{ data: OFERTA_SOLICITADA, error: null }] });
    vi.mocked(ventanaDeLaPersona).mockResolvedValue({ abierta: true, cierraEn: Date.now() + 60_000 });
    vi.mocked(requestContractFromWhatsApp).mockResolvedValue({ ok: true, status: "contract_ready", link_easylex: "https://x" } as never);

    await handleInboundMessage(boton("Sí, lo quiero"));

    expect(solicitudPrevia).not.toHaveBeenCalled();
    expect(requestContractFromWhatsApp).toHaveBeenCalledTimes(1);
  });
});
