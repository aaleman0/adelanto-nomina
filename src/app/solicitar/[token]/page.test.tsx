import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";

vi.mock("./actions", () => ({ solicitarContratoAction: vi.fn() }));
vi.mock("@/lib/contracts/solicitar-token", () => ({
  verifySolicitarToken: vi.fn(() => ({ ok: true, employeeId: "emp-1" })),
}));
vi.mock("@/lib/contracts/ventana-oferta", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/contracts/ventana-oferta")>()),
  ventanaDeLaPersona: vi.fn(),
}));
vi.mock("@/lib/contracts/solicitud-previa", () => ({ solicitudPrevia: vi.fn() }));

import SolicitarPage from "./page";
import { ventanaDeLaPersona } from "@/lib/contracts/ventana-oferta";
import { solicitudPrevia } from "@/lib/contracts/solicitud-previa";

/**
 * La pantalla que ve el EMPLEADO. Se prueba porque ya se desincronizó dos veces
 * de la acción que hay detrás del botón: la página decidía por el `paso` y la
 * acción por lo que la persona tiene, y con la ventana abierta un día entero eso
 * son 24 h prometiéndole "preparamos tu contrato" a quien ya tiene el suyo.
 *
 * Es un componente de servidor sin estado: se le llama como función y se pinta el
 * árbol que devuelve, sin navegador.
 */

type Fila = { data: unknown; error: unknown };

function consulta(resultado: Fila) {
  const q: Record<string, unknown> = { maybeSingle: () => Promise.resolve(resultado) };
  for (const metodo of ["select", "eq", "in", "not", "order", "limit"]) q[metodo] = () => q;
  return q;
}

function baseCon(oferta: Record<string, unknown> | null) {
  const colas: Record<string, Fila[]> = {
    employees: [{ data: { nombre: "Angel Aleman" }, error: null }],
    advance_offers: [{ data: oferta, error: null }],
  };
  vi.mocked(getSupabaseAdmin).mockReturnValue({
    from: (tabla: string) => {
      const siguiente = colas[tabla]?.shift();
      if (!siguiente) throw new Error(`consulta inesperada a ${tabla}`);
      return consulta(siguiente);
    },
  } as never);
}

const OFERTA = {
  id: "of-1",
  monto_prestamo_autorizado: 4000,
  is_eligible: true,
  status: "vigente",
  contract_requests: null,
};

async function pintar() {
  const arbol = await SolicitarPage({
    params: Promise.resolve({ token: "tok-1" }),
    searchParams: Promise.resolve({}),
  });
  return renderToStaticMarkup(arbol);
}

beforeEach(() => {
  vi.mocked(getSupabaseAdmin).mockReset();
  vi.mocked(ventanaDeLaPersona).mockReset();
  vi.mocked(solicitudPrevia).mockReset();
});

describe("pantalla de /solicitar", () => {
  it("a quien no ha pedido le ofrece pedirlo", async () => {
    baseCon(OFERTA);
    vi.mocked(ventanaDeLaPersona).mockResolvedValue({ abierta: true, cierraEn: Date.now() + 60_000 });

    const html = await pintar();

    expect(html).toContain("Tu adelanto está listo");
    expect(html).toContain("Sí, quiero mi adelanto");
    expect(html).toContain("preparamos tu contrato");
    expect(solicitudPrevia).not.toHaveBeenCalled();
  });

  /**
   * El caso que la página se perdía. Con la ventana abierta, `pasoAlPedir`
   * devuelve "pedir" aunque la oferta ya esté `solicitada`, así que atar la
   * consulta al paso dejaba a la persona viendo "preparamos tu contrato" cuando
   * lo único que va a pasar es que se le devuelva el enlace que ya tenía.
   */
  it("con la ventana abierta y un enlace ya vivo, la manda a firmar", async () => {
    baseCon({ ...OFERTA, status: "solicitada" });
    vi.mocked(ventanaDeLaPersona).mockResolvedValue({ abierta: true, cierraEn: Date.now() + 60_000 });
    vi.mocked(solicitudPrevia).mockResolvedValue("enlace_vigente");

    const html = await pintar();

    expect(solicitudPrevia).toHaveBeenCalledWith("of-1");
    expect(html).toContain("Tu contrato está listo para firmar");
    expect(html).toContain("Ir a firmar");
    expect(html).not.toContain("preparamos tu contrato");
    expect(html).not.toContain("Sí, quiero mi adelanto");
  });

  it("con la ventana cerrada y el enlace vencido, se lo dice sin invitarla a insistir", async () => {
    baseCon({ ...OFERTA, status: "solicitada" });
    vi.mocked(ventanaDeLaPersona).mockResolvedValue({ abierta: false, motivo: "fuera_de_plazo" });
    vi.mocked(solicitudPrevia).mockResolvedValue("enlace_vencido");

    const html = await pintar();

    expect(html).toContain("Tu enlace para firmar ya venció");
    expect(html).not.toContain("Sí, quiero mi adelanto");
  });

  it("sin oferta enviada no le ofrece nada", async () => {
    baseCon(OFERTA);
    vi.mocked(ventanaDeLaPersona).mockResolvedValue({ abierta: false, motivo: "sin_envio" });

    const html = await pintar();

    expect(html).toContain("Por ahora no hay un adelanto abierto");
    expect(html).not.toContain("Sí, quiero mi adelanto");
  });

  it("quien ya firmó no vuelve a ver el botón", async () => {
    baseCon({ ...OFERTA, status: "firmada" });

    const html = await pintar();

    expect(html).toContain("Ya firmaste");
    expect(ventanaDeLaPersona).not.toHaveBeenCalled();
  });
});
