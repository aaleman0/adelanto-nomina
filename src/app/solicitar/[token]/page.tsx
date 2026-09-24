import { solicitarContratoAction } from "./actions";
import { verifySolicitarToken } from "@/lib/contracts/solicitar-token";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import {
  DURACION_DE_LA_VENTANA,
  pasoAlPedir,
  ventanaDeLaPersona,
  type PasoAlPedir,
} from "@/lib/contracts/ventana-oferta";
import { DURACION_DEL_ENLACE } from "@/lib/contracts/link-ttl";
import { solicitudPrevia, type SolicitudPrevia } from "@/lib/contracts/solicitud-previa";

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
      .select("id, monto_prestamo_autorizado, is_eligible, status, contract_requests(status)")
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

  // La ventana se revisa antes de enseñar el botón, no solo al pulsarlo:
  // "Tu adelanto está listo" a quien ya no puede pedirlo sería prometerle algo
  // que la acción le va a negar.
  const paso = pasoAlPedir(
    oferta.status as string | null | undefined,
    await ventanaDeLaPersona(verificado.employeeId),
  );
  // A quien ya pidió se le dice lo que de verdad tiene: un enlace vigente se le
  // ofrece para firmar, y sin él se le explica qué pasó con su solicitud.
  const previa = paso === "ya_pidio" ? await solicitudPrevia(oferta.id as string) : null;
  const yaTieneEnlace = previa === "enlace_vigente";
  const avisoDelPaso = avisoParaPaso(paso, previa);
  if (avisoDelPaso) {
    return (
      <Marco>
        <Aviso tono={avisoDelPaso.tono} titulo={avisoDelPaso.titulo} texto={avisoDelPaso.texto} />
      </Marco>
    );
  }

  return (
    <Marco>
      <div className="rounded-xl bg-surface p-7 shadow-2">
        <p className="text-[19px] text-ink-2">{nombre ? `Hola, ${nombre}` : "Hola"}</p>
        <h1 className="mt-1 text-[27px] font-bold leading-tight text-ink">
          {yaTieneEnlace ? "Tu contrato está listo para firmar" : "Tu adelanto está listo"}
        </h1>

        <div className="mt-7 rounded-lg bg-paper-deep px-6 py-7 text-center">
          <p className="text-[13px] font-bold uppercase tracking-[0.12em] text-ink-3">Te corresponde</p>
          <p className="mt-2 text-[46px] font-bold leading-none tracking-[-0.02em] text-ink tabular">
            {money(monto)}
          </p>
        </div>

        <p className="mt-7 text-[17px] leading-relaxed text-ink-2">
          {yaTieneEnlace
            ? "Ya lo habías pedido y tu enlace para firmar sigue vigente. Fírmalo desde tu celular con tu identificación (INE)."
            : "Si lo aceptas, preparamos tu contrato y lo firmas desde tu celular con tu identificación (INE)."}{" "}
          Se descuenta de tu próximo pago de nómina.
        </p>

        <form action={solicitarContratoAction} className="mt-7">
          <input type="hidden" name="token" value={token} />
          <button
            type="submit"
            className="flex h-16 w-full items-center justify-center rounded-md border-b-[3px] border-action-press bg-action px-6 text-[19px] font-bold text-white transition-[background-color,transform] duration-[160ms] hover:bg-action-hover active:translate-y-[2px] active:border-b-0 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-action"
          >
            {yaTieneEnlace ? "Ir a firmar" : "Sí, quiero mi adelanto"}
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

type AvisoTexto = { tono: "listo" | "espera" | "alto"; titulo: string; texto: string };

/**
 * Qué decirle a quien ya no puede pedir. El mismo criterio que el chatbot:
 * nunca invita a insistir, porque el adelanto lo abre la empresa.
 */
function avisoParaPaso(paso: PasoAlPedir, previa: SolicitudPrevia | null): AvisoTexto | null {
  switch (paso) {
    case "fuera_de_plazo":
      return {
        tono: "espera",
        titulo: "El plazo para pedir este adelanto ya cerró",
        texto: `La oferta estuvo disponible por ${DURACION_DE_LA_VENTANA}. Tu empresa te avisará cuando vuelva a estar abierta.`,
      };
    case "sin_envio":
      return {
        tono: "espera",
        titulo: "Por ahora no hay un adelanto abierto",
        texto: "Tu empresa te avisará cuando esté disponible.",
      };
    case "error":
      return { tono: "alto", titulo: "No pudimos revisar tu solicitud", texto: "Vuelve a intentarlo en unos minutos." };
    case "ya_pidio":
      return avisoParaQuienYaPidio(previa);
    default:
      return null;
  }
}

/**
 * A quien ya pidió no se le genera otro contrato, pero se le dice lo cierto:
 * prometerle un enlace a quien se le cayó el contrato lo manda a buscar algo
 * que no existe. Con un enlace vigente no hay aviso: se le ofrece firmar.
 */
function avisoParaQuienYaPidio(previa: SolicitudPrevia | null): AvisoTexto | null {
  switch (previa) {
    case "enlace_vigente":
      return null;
    case "enlace_vencido":
      return {
        tono: "espera",
        titulo: "Tu enlace para firmar ya venció",
        texto: `Los enlaces duran ${DURACION_DEL_ENLACE}. Tu empresa te avisará cuando el adelanto vuelva a estar disponible.`,
      };
    case "fallo":
      return {
        tono: "alto",
        titulo: "Tu contrato no se pudo preparar",
        texto: "Tu solicitud quedó registrada, pero hubo un problema al preparar el contrato. Tu empresa lo va a revisar.",
      };
    case "sin_verificar":
      return { tono: "alto", titulo: "No pudimos revisar tu solicitud", texto: "Vuelve a intentarlo en unos minutos." };
    default:
      return {
        tono: "espera",
        titulo: "Ya pediste tu adelanto",
        texto: "Tu solicitud quedó registrada. Tu empresa te avisará si hace falta algo más.",
      };
  }
}
