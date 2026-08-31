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
      <div className="rounded-2xl border border-border bg-surface p-6 text-center shadow-sm">
        <p className="text-sm text-text-muted">{nombre ? `Hola, ${nombre}` : "Hola"}</p>
        <h1 className="mt-1 text-lg font-semibold text-text-primary">Tu adelanto de nómina está listo</h1>
        <div className="my-5 rounded-xl bg-surface-muted py-5">
          <p className="text-xs uppercase tracking-wide text-text-muted">Monto</p>
          <p className="mt-1 text-3xl font-bold text-text-primary">{money(monto)}</p>
        </div>
        <p className="text-sm text-text-muted">
          Al continuar, se genera tu contrato y pasarás a firmarlo con tu identificación (INE) desde tu celular.
        </p>
        <form action={solicitarContratoAction} className="mt-5">
          <input type="hidden" name="token" value={token} />
          <button
            type="submit"
            className="inline-flex h-12 w-full items-center justify-center rounded-xl bg-primary px-6 text-base font-semibold text-white transition hover:bg-primary-hover"
          >
            Solicitar y firmar
          </button>
        </form>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-surface-muted px-4 py-10">
      <div className="w-full max-w-sm">{children}</div>
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
  const ring =
    tone === "ok" ? "border-emerald-200" : tone === "warn" ? "border-amber-200" : "border-red-200";
  const dot = tone === "ok" ? "bg-emerald-500" : tone === "warn" ? "bg-amber-500" : "bg-red-500";
  return (
    <div className={["rounded-2xl border bg-surface p-6 text-center shadow-sm", ring].join(" ")}>
      <span className={["mx-auto block h-3 w-3 rounded-full", dot].join(" ")} />
      <h1 className="mt-3 text-lg font-semibold text-text-primary">{title}</h1>
      <p className="mt-2 text-sm text-text-muted">{message}</p>
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
