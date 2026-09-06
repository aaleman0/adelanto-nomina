import { redirect } from "next/navigation";
import { createSessionClient } from "@/lib/supabase/session";
import { signInWithGoogle } from "./actions";

type LoginPageProps = {
  searchParams?: Promise<{ next?: string; error?: string }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  // Si ya hay sesión, mandamos directo al dashboard.
  let setupError: string | null = null;

  try {
    const supabase = await createSessionClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) redirect("/");
  } catch (err) {
    setupError = err instanceof Error ? err.message : "Error de configuración.";
  }

  const params = await searchParams;
  const nextPath = params?.next ?? "/";
  const errorMessage = params?.error ? decodeURIComponent(params.error) : null;

  return (
    <div className="flex min-h-screen flex-col bg-background text-text-primary">
      <header className="flex shrink-0 items-center justify-between border-b border-border px-5 py-4 sm:px-8 lg:px-14">
        <span className="font-display text-[15px] font-bold uppercase tracking-[0.06em]">
          Adelanto Nómina<sup className="text-[0.6em] font-semibold">®</sup>
        </span>
        <span className="text-[11px] uppercase tracking-[0.18em] text-text-muted">Acceso</span>
      </header>

      <main className="flex flex-1 items-center px-5 py-16 sm:px-8 lg:px-14">
        <div className="w-full max-w-xl">
          <p className="text-[11px] uppercase tracking-[0.18em] text-text-muted">Panel interno</p>
          <h1 className="mt-4 font-display text-5xl font-bold leading-[1.02] tracking-[-0.02em] sm:text-6xl">
            Backoffice de adelantos
          </h1>
          <p className="mt-5 max-w-md text-[15px] leading-relaxed text-text-muted">
            Accede con tu cuenta corporativa de Google. Solo las cuentas autorizadas tienen acceso al equipo operativo.
          </p>

          {/* Error de configuración del servidor (variables de entorno faltantes) */}
          {setupError ? (
            <div className="mt-8 border-l-2 border-danger pl-4">
              <p className="text-sm font-semibold text-danger">Configuración incompleta</p>
              <p className="mt-1 whitespace-pre-wrap break-all font-mono text-xs text-text-muted">{setupError}</p>
            </div>
          ) : null}

          {/* Error de autenticación */}
          {errorMessage ? (
            <div className="mt-8 border-l-2 border-danger pl-4">
              <p className="text-sm text-danger">{errorMessage}</p>
            </div>
          ) : null}

          {/* Botón Google como control editorial (subrayado, sin caja) */}
          <form className="mt-12">
            {/* Pasamos el next como campo oculto para recuperarlo en el action */}
            <input type="hidden" name="next" value={nextPath} />
            <button
              formAction={signInWithGoogle}
              type="submit"
              className="group inline-flex items-center gap-3 border-b-2 border-text-primary pb-2 text-lg font-semibold text-text-primary transition-colors hover:border-primary hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
            >
              {/* Ícono oficial de Google */}
              <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0" aria-hidden="true">
                <path
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  fill="#4285F4"
                />
                <path
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  fill="#34A853"
                />
                <path
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  fill="#FBBC05"
                />
                <path
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  fill="#EA4335"
                />
              </svg>
              Continuar con Google
              <span aria-hidden="true" className="transition-transform group-hover:translate-x-1">→</span>
            </button>
          </form>
        </div>
      </main>

      <footer className="shrink-0 border-t border-border px-5 py-4 text-[11px] uppercase tracking-[0.16em] text-text-muted sm:px-8 lg:px-14">
        Uso exclusivo del equipo operativo
      </footer>
    </div>
  );
}
