import { redirect } from "next/navigation";
import { createSessionClient } from "@/lib/supabase/session";
import { signInWithGoogle } from "./actions";
import { ProblemNote } from "@/ui/states";

type LoginPageProps = {
  searchParams?: Promise<{ next?: string; error?: string }>;
};

/**
 * Acceso al sistema. Una sola tarea, un solo botón.
 *
 * No lleva barra lateral ni marco de la app: quien llega aquí todavía no tiene
 * sesión, y cualquier otro elemento sería ruido frente a la única acción
 * posible.
 */
export default async function LoginPage({ searchParams }: LoginPageProps) {
  let errorDeConfiguracion: string | null = null;

  try {
    const supabase = await createSessionClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) redirect("/");
  } catch (err) {
    errorDeConfiguracion = err instanceof Error ? err.message : "Error de configuración.";
  }

  const params = await searchParams;
  const destino = params?.next ?? "/";
  const errorDeAcceso = params?.error ? decodeURIComponent(params.error) : null;

  return (
    <main className="flex min-h-dvh items-center justify-center bg-paper px-6 py-12">
      <div className="w-full max-w-[30rem]">
        <div className="mb-7">
          <p className="text-[13px] font-bold uppercase tracking-[0.14em] text-ink-3">Adelanto</p>
          <p className="text-[31px] font-bold leading-tight text-ink">de nómina</p>
        </div>

        <div className="rounded-xl bg-surface p-9 shadow-2">
          <h1 className="text-[31px] font-bold leading-tight text-ink">Entrar al sistema</h1>
          <p className="mt-3 text-[19px] leading-relaxed text-ink-2">
            Usa la cuenta de Google que te dio tu empresa.
          </p>

          {errorDeConfiguracion ? (
            <div className="mt-6">
              <ProblemNote>
                El sistema no está configurado por completo. Avisa a soporte antes de continuar.
              </ProblemNote>
            </div>
          ) : null}

          {errorDeAcceso ? (
            <div className="mt-6">
              <ProblemNote>{errorDeAcceso}</ProblemNote>
            </div>
          ) : null}

          <form className="mt-8">
            <input type="hidden" name="next" value={destino} />
            <button
              formAction={signInWithGoogle}
              type="submit"
              className="flex h-16 w-full items-center justify-center gap-3.5 rounded-md border-2 border-line-strong bg-surface text-[19px] font-bold text-ink transition-[background-color,border-color,transform] duration-[160ms] hover:border-action hover:bg-surface-hover active:translate-y-[2px] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-action"
            >
              <svg viewBox="0 0 24 24" className="h-6 w-6 shrink-0" aria-hidden="true">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
              </svg>
              Continuar con Google
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-[15px] text-ink-3">
          Solo entran las cuentas autorizadas por tu empresa.
        </p>
      </div>
    </main>
  );
}
