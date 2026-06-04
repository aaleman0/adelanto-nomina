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
    <div className="min-h-screen flex items-center justify-center bg-[var(--background)] px-4">
      <div className="w-full max-w-sm">
        {/* Logo / marca */}
        <div className="mb-8 text-center">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-600 shadow-lg shadow-indigo-200 mb-4">
            <svg
              className="h-7 w-7 text-white"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.75}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">
            Backoffice Adelantos
          </h1>
          <p className="mt-1.5 text-sm text-[var(--text-muted)]">
            Accede con tu cuenta corporativa de Google.
          </p>
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-8 shadow-sm">
          {/* Error de configuración del servidor (variables de entorno faltantes) */}
          {setupError && (
            <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
              <p className="text-sm font-semibold text-amber-800">Configuración incompleta</p>
              <p className="mt-1 text-xs text-amber-700 font-mono whitespace-pre-wrap break-all">
                {setupError}
              </p>
            </div>
          )}

          {/* Error de autenticación */}
          {errorMessage && (
            <div className="mb-6 flex items-start gap-3 rounded-xl border border-[var(--danger-border)] bg-[var(--danger-bg)] px-4 py-3">
              <svg
                className="h-4 w-4 text-[var(--danger)] mt-0.5 shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
              <p className="text-sm text-[var(--danger)]">{errorMessage}</p>
            </div>
          )}

          {/* Botón Google */}
          <form>
            {/* Pasamos el next como campo oculto para recuperarlo en el action */}
            <input type="hidden" name="next" value={nextPath} />
            <button
              formAction={signInWithGoogle}
              type="submit"
              className="flex w-full items-center justify-center gap-3 rounded-xl border border-[var(--border)] bg-white px-4 py-3 text-sm font-semibold text-[var(--text-primary)] shadow-sm transition hover:bg-[var(--surface-muted)] hover:border-[var(--border-strong)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)] active:scale-[0.98]"
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
            </button>
          </form>

          <p className="mt-5 text-center text-xs text-[var(--text-disabled)]">
            Solo cuentas autorizadas tienen acceso.
          </p>
        </div>

        <p className="mt-6 text-center text-xs text-[var(--text-disabled)]">
          Panel interno · Uso exclusivo del equipo operativo
        </p>
      </div>
    </div>
  );
}
