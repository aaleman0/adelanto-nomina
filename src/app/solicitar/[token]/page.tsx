import { solicitarContratoAction } from "./actions";
import { verifySolicitarToken } from "@/lib/contracts/solicitar-token";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ token: string }>;
  searchParams?: Promise<{ status?: string; error?: string }>;
};

const money = (v: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 2 }).format(v);

function estadoDeSolicitud(embedded: unknown): string | null {
  if (!embedded) return null;
  const row = Array.isArray(embedded) ? embedded[0] : embedded;
  return (row as { status?: string | null } | undefined)?.status ?? null;
}

/**
 * Auto-servicio del EMPLEADO. Es la única pantalla que no usa un operador, así
 * que se diseña para teléfono: una sola columna, el monto como protagonista y
 * un único botón que ocupa todo el ancho.
 *
 * La autenticación es el token firmado del enlace (el empleado no tiene cuenta).
 */
export default async function SolicitarPage({ params, searchParams }: PageProps) {
  const { token } = await params;
  const sp = await searchParams;

  const verificado = verifySolicitarToken(token);
  if (!verificado.ok) {
    return (
      <Marco>
        <Aviso
          tono="alto"
          titulo={verificado.reason === "expired" ? "Este enlace ya venció" : "Este enlace no funciona"}
          texto={
            verificado.reason === "expired"
              ? "Pídele uno nuevo a tu empresa para poder continuar."
              : "Revisa que lo hayas abierto completo, o pídele uno nuevo a tu empresa."
          }
        />
      </Marco>
    );
  }

  const supabase = getSupabaseAdmin();
  const [{ data: emp }, { data: oferta }] = await Promise.all([
    supabase.from("employees").select("nombre").eq("id", verificado.employeeId).maybeSingle(),
    supabase
      .from("advance_offers")
      .select("monto_prestamo_autorizado, is_eligible, status, contract_requests(status)")
      .eq("employee_id", verificado.employeeId)
      .eq("is_current", true)
      .maybeSingle(),
  ]);

  const nombre = (emp?.nombre as string | undefined)?.split(" ")[0] ?? "";
  const estadoSolicitud = estadoDeSolicitud(oferta?.contract_requests);
  const yaFirmo = estadoSolicitud === "firmado" || oferta?.status === "firmada";
  const monto = Number(oferta?.monto_prestamo_autorizado ?? 0);
  const elegible = Boolean(oferta?.is_eligible) && oferta?.status !== "rechazada";

  const respuesta = leerRespuesta(sp?.status, sp?.error);
  if (respuesta) {
    return (
      <Marco>
        <Aviso tono={respuesta.tono} titulo={respuesta.titulo} texto={respuesta.texto} />
      </Marco>
    );
  }

  if (!emp) {
    return (
      <Marco>
        <Aviso tono="alto" titulo="No encontramos tu registro" texto="Contacta a tu empresa para revisarlo." />
      </Marco>
    );
  }

  if (yaFirmo) {
    return (
      <Marco>
        <Aviso tono="listo" titulo="Ya firmaste" texto="Tu contrato de adelanto está firmado. No tienes que hacer nada más." />
      </Marco>
    );
  }

  if (!oferta || !elegible || monto <= 0) {
    return (
      <Marco>
        <Aviso
          tono="espera"
          titulo="No tienes un adelanto disponible"
          texto="Si crees que es un error, contacta a tu empresa."
        />
      </Marco>
    );
  }

  return (
    <Marco>
      <div className="rounded-xl bg-surface p-7 shadow-2">
        <p className="text-[19px] text-ink-2">{nombre ? `Hola, ${nombre}` : "Hola"}</p>
        <h1 className="mt-1 text-[27px] font-bold leading-tight text-ink">Tu adelanto está listo</h1>

        <div className="mt-7 rounded-lg bg-paper-deep px-6 py-7 text-center">
          <p className="text-[13px] font-bold uppercase tracking-[0.12em] text-ink-3">Te corresponde</p>
          <p className="mt-2 text-[46px] font-bold leading-none tracking-[-0.02em] text-ink tabular">
            {money(monto)}
          </p>
        </div>

        <p className="mt-7 text-[17px] leading-relaxed text-ink-2">
          Si lo aceptas, preparamos tu contrato y lo firmas desde tu celular con tu identificación (INE).
          Se descuenta de tu próximo pago de nómina.
        </p>

        <form action={solicitarContratoAction} className="mt-7">
          <input type="hidden" name="token" value={token} />
          <button
            type="submit"
            className="flex h-16 w-full items-center justify-center rounded-md border-b-[3px] border-action-press bg-action px-6 text-[19px] font-bold text-white transition-[background-color,transform] duration-[160ms] hover:bg-action-hover active:translate-y-[2px] active:border-b-0 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-action"
          >
            Sí, quiero mi adelanto
          </button>
        </form>

        <p className="mt-4 text-center text-[15px] text-ink-3">
          Al continuar pasas directo a firmar. Puedes cerrar esta página si no lo quieres.
        </p>
      </div>
    </Marco>
  );
}

function Marco({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col bg-paper px-5 py-8">
      <header className="mx-auto w-full max-w-lg">
        <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-ink-3">Adelanto</p>
        <p className="text-[21px] font-bold leading-tight text-ink">de nómina</p>
      </header>
      <div className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center py-8">{children}</div>
      <footer className="mx-auto w-full max-w-lg text-[14px] text-ink-3">
        Firma segura con identificación oficial.
      </footer>
    </main>
  );
}

function Aviso({
  tono,
  titulo,
  texto,
}: {
  tono: "listo" | "espera" | "alto";
  titulo: string;
  texto: string;
}) {
  const estilo = {
    listo: { punto: "bg-done", borde: "border-done-line" },
    espera: { punto: "bg-attention-fill", borde: "border-attention-line" },
    alto: { punto: "bg-failed", borde: "border-failed-line" },
  }[tono];

  return (
    <div className={`rounded-xl border-2 bg-surface p-7 shadow-2 ${estilo.borde}`}>
      <span aria-hidden="true" className={`block h-4 w-4 rounded-full ${estilo.punto}`} />
      <h1 className="mt-5 text-[27px] font-bold leading-tight text-ink">{titulo}</h1>
      <p className="mt-3 text-[19px] leading-relaxed text-ink-2">{texto}</p>
    </div>
  );
}

function leerRespuesta(
  status: string | undefined,
  error: string | undefined,
): { tono: "listo" | "espera" | "alto"; titulo: string; texto: string } | null {
  if (error === "not_found") {
    return { tono: "alto", titulo: "No encontramos tu registro", texto: "Contacta a tu empresa para revisarlo." };
  }
  if (error) {
    return { tono: "alto", titulo: "Algo salió mal", texto: "Vuelve a intentarlo en unos minutos." };
  }
  if (status === "already_signed") {
    return { tono: "listo", titulo: "Ya firmaste", texto: "Tu contrato ya está firmado. No tienes que hacer nada más." };
  }
  if (status === "no_offer" || status === "not_eligible") {
    return {
      tono: "espera",
      titulo: "No tienes un adelanto disponible",
      texto: "Si crees que es un error, contacta a tu empresa.",
    };
  }
  if (status && status !== "contract_ready") {
    return {
      tono: "alto",
      titulo: "No pudimos preparar tu contrato",
      texto: "Vuelve a intentarlo en unos minutos.",
    };
  }
  return null;
}
