import { beforeEach, describe, expect, it, vi } from "vitest";
import { getSupabaseAdmin } from "@/lib/supabase/server";

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT ${url}`);
  }),
}));
vi.mock("@/lib/contracts/solicitar-token", () => ({
  verifySolicitarToken: vi.fn(() => ({ ok: true, employeeId: "emp-1" })),
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

import { solicitarContratoAction } from "./actions";
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
  for (const metodo of ["select", "eq", "in", "not", "order", "limit"]) {
    q[metodo] = () => q;
  }
  return q;
}

function baseCon(estadoOferta: string | null) {
  const colas: Record<string, Record<string, unknown>[]> = {
    employees: [consulta({ data: { rfc: "AEEA940214H78", telefono_normalizado: "5218713330257" }, error: null })],
    advance_offers: [consulta({ data: estadoOferta ? { id: "of-1", status: estadoOferta } : null, error: null })],
  };
  vi.mocked(getSupabaseAdmin).mockReturnValue({
    from: (tabla: string) => {
      const siguiente = colas[tabla]?.shift();
      if (!siguiente) throw new Error(`consulta inesperada a ${tabla}`);
      return siguiente;
    },
  } as never);
}

function formulario() {
  const datos = new FormData();
  datos.set("token", "tok-1");
  return datos;
}

/** Vuelve a la página sin generar nada: la página recalcula y explica qué pasó. */
const DE_VUELTA_A_LA_PAGINA = /^REDIRECT \/solicitar\/tok-1$/;

beforeEach(() => {
  vi.mocked(requestContractFromWhatsApp).mockReset();
  vi.mocked(ventanaDeLaPersona).mockReset();
  vi.mocked(solicitudPrevia).mockReset();
});

/**
 * Esta acción es la puerta que genera el contrato desde /solicitar, y no tiene
 * sesión: basta el enlace. La página esconde el botón fuera de plazo, pero un
 * POST no necesita pasar por la página, así que la barrera real está aquí.
 */
describe("solicitarContratoAction", () => {
  it("fuera de plazo no genera contrato", async () => {
    baseCon("vigente");
    vi.mocked(ventanaDeLaPersona).mockResolvedValue({ abierta: false, motivo: "fuera_de_plazo" });

    await expect(solicitarContratoAction(formulario())).rejects.toThrow(DE_VUELTA_A_LA_PAGINA);
    expect(requestContractFromWhatsApp).not.toHaveBeenCalled();
    expect(ventanaDeLaPersona).toHaveBeenCalledWith("emp-1");
  });

  it("si no se pudo revisar la ventana, no genera nada", async () => {
    baseCon("vigente");
    vi.mocked(ventanaDeLaPersona).mockResolvedValue({ abierta: false, motivo: "error" });

    await expect(solicitarContratoAction(formulario())).rejects.toThrow(DE_VUELTA_A_LA_PAGINA);
    expect(requestContractFromWhatsApp).not.toHaveBeenCalled();
  });

  it("sin oferta en su fila igual pasa por la ventana antes del pipeline", async () => {
    baseCon(null);
    vi.mocked(ventanaDeLaPersona).mockResolvedValue({ abierta: false, motivo: "sin_envio" });

    await expect(solicitarContratoAction(formulario())).rejects.toThrow(DE_VUELTA_A_LA_PAGINA);
    expect(requestContractFromWhatsApp).not.toHaveBeenCalled();
    expect(solicitudPrevia).not.toHaveBeenCalled();
  });

  it("dentro de la ventana genera el contrato y lo manda a firmar", async () => {
    baseCon("vigente");
    vi.mocked(ventanaDeLaPersona).mockResolvedValue({ abierta: true, cierraEn: Date.now() + 60_000 });
    vi.mocked(requestContractFromWhatsApp).mockResolvedValue({
      ok: true,
      status: "contract_ready",
      link_easylex: "https://easylex.test/firma/abc",
    } as never);

    await expect(solicitarContratoAction(formulario())).rejects.toThrow("REDIRECT https://easylex.test/firma/abc");
    expect(requestContractFromWhatsApp).toHaveBeenCalledTimes(1);
    // Es su primer pedido: el enlace sí se le manda por WhatsApp, para que le
    // quede una copia aunque cierre la pestaña.
    expect(requestContractFromWhatsApp).toHaveBeenCalledWith(expect.anything(), { skipSend: false });
  });

  /**
   * El caso que rompió al alargar la ventana. Con la ventana abierta un día
   * entero, el segundo clic de quien YA pidió sigue cayendo en "pedir" —la
   * ventana manda sobre el estado de la oferta—, así que atar el `skipSend` al
   * paso dejaba de funcionar y la plantilla de pago se reenviaba en cada toque
   * durante veinticuatro horas. Lo que decide es lo que la persona TIENE.
   */
  it("con la ventana abierta y un enlace ya vivo, no reenvía la plantilla", async () => {
    baseCon("solicitada");
    vi.mocked(ventanaDeLaPersona).mockResolvedValue({ abierta: true, cierraEn: Date.now() + 60_000 });
    vi.mocked(solicitudPrevia).mockResolvedValue("enlace_vigente");
    vi.mocked(requestContractFromWhatsApp).mockResolvedValue({
      ok: true,
      status: "contract_ready",
      link_easylex: "https://easylex.test/firma/abc",
    } as never);

    await expect(solicitarContratoAction(formulario())).rejects.toThrow("REDIRECT https://easylex.test/firma/abc");
    expect(requestContractFromWhatsApp).toHaveBeenCalledWith(expect.anything(), { skipSend: true });
  });

  /**
   * El otro lado de la misma condición: solo un enlace VIGENTE apaga el envío.
   * Sin esto, `skipSend: previa !== null` pasaría la suite igual y le negaría su
   * copia del enlace a quien está reintentando porque el contrato se le cayó.
   */
  it("con la ventana abierta y la solicitud en mal estado, sí le manda su copia", async () => {
    for (const previa of ["fallo", "en_proceso", "enlace_vencido", "sin_verificar"] as const) {
      baseCon("solicitada");
      vi.mocked(requestContractFromWhatsApp).mockReset();
      vi.mocked(ventanaDeLaPersona).mockResolvedValue({ abierta: true, cierraEn: Date.now() + 60_000 });
      vi.mocked(solicitudPrevia).mockResolvedValue(previa);
      vi.mocked(requestContractFromWhatsApp).mockResolvedValue({
        ok: true,
        status: "contract_ready",
        link_easylex: "https://easylex.test/firma/nuevo",
      } as never);

      await expect(solicitarContratoAction(formulario()), previa).rejects.toThrow(
        "REDIRECT https://easylex.test/firma/nuevo",
      );
      expect(requestContractFromWhatsApp, previa).toHaveBeenCalledWith(expect.anything(), { skipSend: false });
    }
  });

  it("quien ya firmó pasa aunque haya cerrado: el sistema solo se lo confirma", async () => {
    baseCon("firmada");
    vi.mocked(ventanaDeLaPersona).mockResolvedValue({ abierta: false, motivo: "fuera_de_plazo" });
    vi.mocked(requestContractFromWhatsApp).mockResolvedValue({ ok: true, status: "already_signed" } as never);

    await expect(solicitarContratoAction(formulario())).rejects.toThrow("?status=already_signed");
  });
});

describe("solicitarContratoAction: quien ya pidió con la ventana cerrada", () => {
  it("sin enlace vigente no genera otro contrato", async () => {
    for (const previa of ["en_proceso", "fallo", "enlace_vencido", "sin_verificar"] as const) {
      baseCon("solicitada");
      vi.mocked(ventanaDeLaPersona).mockResolvedValue({ abierta: false, motivo: "fuera_de_plazo" });
      vi.mocked(solicitudPrevia).mockResolvedValue(previa);

      await expect(solicitarContratoAction(formulario()), previa).rejects.toThrow(DE_VUELTA_A_LA_PAGINA);
    }
    expect(requestContractFromWhatsApp).not.toHaveBeenCalled();
  });

  it("con un enlace vigente va directo a firmar: el pipeline lo reusa", async () => {
    baseCon("solicitada");
    vi.mocked(ventanaDeLaPersona).mockResolvedValue({ abierta: false, motivo: "fuera_de_plazo" });
    vi.mocked(solicitudPrevia).mockResolvedValue("enlace_vigente");
    vi.mocked(requestContractFromWhatsApp).mockResolvedValue({
      ok: true,
      status: "contract_ready",
      link_easylex: "https://easylex.test/firma/regenerado",
    } as never);

    await expect(solicitarContratoAction(formulario())).rejects.toThrow("REDIRECT https://easylex.test/firma/regenerado");
    expect(solicitudPrevia).toHaveBeenCalledWith("of-1");
    expect(requestContractFromWhatsApp).toHaveBeenCalledTimes(1);
    // No se le reenvía la plantilla: ya tiene el enlace y en este mismo clic se
    // va a firmar. Sin esto, cada toque le costaba un mensaje de pago a la
    // empresa, y con enlaces de un día el botón sigue ahí toda la tarde.
    expect(requestContractFromWhatsApp).toHaveBeenCalledWith(expect.anything(), { skipSend: true });
  });
});
