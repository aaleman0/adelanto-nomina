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

function embeddedRequestStatus(embedded: unknown): string | null {
  if (!embedded) return null;
  const row = Array.isArray(embedded) ? embedded[0] : embedded;
  return (row as { status?: string | null } | undefined)?.status ?? null;
}

export default async function SolicitarPage({ params, searchParams }: PageProps) {
  const { token } = await params;
  const sp = await searchParams;

  const verified = verifySolicitarToken(token);
  if (!verified.ok) {
    return (
      <Shell>
        <StateCard
          tone="error"
          title="Link no válido"
          message={
            verified.reason === "expired"
              ? "Este link ya venció. Pídele uno nuevo a tu empresa."
              : "Este link no es válido. Revisa que lo hayas abierto completo, o pídele uno nuevo a tu empresa."
          }
        />
      </Shell>
    );
  }

  const supabase = getSupabaseAdmin();
  const [{ data: emp }, { data: offer }] = await Promise.all([
    supabase.from("employees").select("nombre").eq("id", verified.employeeId).maybeSingle(),
    supabase
      .from("advance_offers")
      .select("monto_prestamo_autorizado, is_eligible, status, contract_requests(status)")
      .eq("employee_id", verified.employeeId)
      .eq("is_current", true)
      .maybeSingle(),
  ]);

  const nombre = (emp?.nombre as string | undefined)?.split(" ")[0] ?? "";
  const reqStatus = embeddedRequestStatus(offer?.contract_requests);
  const yaFirmado = reqStatus === "firmado" || offer?.status === "firmada";
  const monto = Number(offer?.monto_prestamo_autorizado ?? 0);
  const elegible = Boolean(offer?.is_eligible) && offer?.status !== "rechazada";

  // Mensaje de vuelta tras intentar (redirección de la server action).
  const feedback = getFeedback(sp?.status, sp?.error);
  if (feedback) {
    return (
      <Shell>
        <StateCard tone={feedback.tone} title={feedback.title} message={feedback.message} />
      </Shell>
    );
  }

  if (!emp) {
    return (
      <Shell>
        <StateCard tone="error" title="No te encontramos" message="No encontramos tu registro. Contacta a tu empresa." />
      </Shell>
    );
  }
  if (yaFirmado) {
    return (
      <Shell>
        <StateCard tone="ok" title="¡Ya firmaste!" message="Tu contrato de adelanto ya está firmado. No necesitas hacer nada más." />
      </Shell>
    );
  }
  if (!offer || !elegible || monto <= 0) {
    return (
      <Shell>
        <StateCard
          tone="warn"
          title="Sin adelanto disponible"
          message="Por ahora no tienes un adelanto disponible para solicitar. Si crees que es un error, contacta a tu empresa."
        />
      </Shell>
    );
  }

  return (
    <Shell>
      <p className="text-sm tracking-wide text-white/55">{nombre ? `Hola, ${nombre}` : "Hola"}</p>
      <h1 className="mt-3 font-display text-3xl font-bold leading-[1.05] tracking-[-0.02em] text-white sm:text-4xl">
        Tu adelanto de nómina está listo
      </h1>

      <div className="mt-10 border-t border-white/15 pt-8">
        <p className="text-[11px] uppercase tracking-[0.18em] text-white/45">Monto autorizado</p>
        <p className="mt-3 font-display text-5xl font-bold leading-none tracking-[-0.03em] tabular-nums text-white sm:text-7xl">
          {money(monto)}
        </p>
      </div>

      <p className="mt-8 max-w-sm text-[15px] leading-relaxed text-white/60">
        Al continuar se genera tu contrato y pasas a firmarlo con tu identificación (INE) desde tu celular.
      </p>

      <form action={solicitarContratoAction} className="mt-10">
        <input type="hidden" name="token" value={token} />
        <button
          type="submit"
          className="group inline-flex h-14 w-full items-center justify-center gap-3 bg-[#159f6d] px-6 text-base font-semibold text-white transition-colors hover:bg-[#0f7f58] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white sm:w-auto sm:px-12"
        >
          Solicitar y firmar
          <span aria-hidden="true" className="transition-transform group-hover:translate-x-1">→</span>
        </button>
      </form>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen flex-col bg-[#0c0c0b] px-6 py-8 text-white sm:px-10">
      <header className="flex shrink-0 items-center justify-between">
        <span className="font-display text-[13px] font-bold uppercase tracking-[0.06em] text-white/80">
          Adelanto Nómina<sup className="text-[0.6em] font-semibold">®</sup>
        </span>
        <span className="text-[11px] uppercase tracking-[0.18em] text-white/35">Auto-servicio</span>
      </header>
      <div className="flex flex-1 flex-col justify-center py-12">
        <div className="mx-auto w-full max-w-lg">{children}</div>
      </div>
      <footer className="shrink-0 text-[11px] uppercase tracking-[0.16em] text-white/35">
        Proceso seguro · Firma con INE
      </footer>
    </main>
  );
}

function StateCard({
  tone,
  title,
  message,
}: {
  tone: "ok" | "warn" | "error";
  title: string;
  message: string;
}) {
  const dot = tone === "ok" ? "bg-[#159f6d]" : tone === "warn" ? "bg-[#d8a72a]" : "bg-[#d9584a]";
  return (
    <div>
      <span className={["block h-3 w-3 rounded-full", dot].join(" ")} aria-hidden="true" />
      <h1 className="mt-5 font-display text-3xl font-bold leading-[1.05] tracking-[-0.02em] text-white sm:text-4xl">
        {title}
      </h1>
      <p className="mt-4 max-w-md text-[15px] leading-relaxed text-white/60">{message}</p>
    </div>
  );
}

function getFeedback(
  status: string | undefined,
  error: string | undefined,
): { tone: "ok" | "warn" | "error"; title: string; message: string } | null {
  if (error === "not_found") {
    return { tone: "error", title: "No te encontramos", message: "No encontramos tu registro. Contacta a tu empresa." };
  }
  if (error) {
    return { tone: "error", title: "Algo salió mal", message: "Vuelve a intentarlo en un momento." };
  }
  if (status === "already_signed") {
    return { tone: "ok", title: "¡Ya firmaste!", message: "Tu contrato ya está firmado. No necesitas hacer nada más." };
  }
  if (status === "no_offer" || status === "not_eligible") {
    return {
      tone: "warn",
      title: "Sin adelanto disponible",
      message: "Por ahora no tienes un adelanto disponible. Si crees que es un error, contacta a tu empresa.",
    };
  }
  if (status && status !== "contract_ready") {
    return {
      tone: "error",
      title: "No se pudo generar tu contrato",
      message: "Hubo un problema al preparar tu contrato. Vuelve a intentarlo en un momento.",
    };
  }
  return null;
}
