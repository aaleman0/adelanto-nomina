"use client";

import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { useCallback, useState, type ReactNode } from "react";
import { Sidebar, type Rol } from "./nav";
import { OfflineBanner } from "./states";
import { ToastProvider } from "./toast";
import { Key, useShortcut } from "./shortcuts";
import { SPRING } from "./motion";

/**
 * Marco de la aplicación: barra lateral fija + barra superior + contenido.
 *
 * La barra superior solo tiene lo que se usa desde cualquier pantalla:
 * buscar a una persona (con atajo visible) y la sesión. No lleva métricas:
 * el sistema muestra el estado del trabajo, nunca el rendimiento de quien lo hace.
 */
export function Shell({
  rol,
  usuario,
  children,
}: {
  rol: Rol;
  usuario: { nombre: string; email: string };
  children: ReactNode;
}) {
  const router = useRouter();
  const irABuscar = useCallback(() => router.push("/personas"), [router]);

  // "/" salta a la búsqueda de personas desde cualquier pantalla.
  useShortcut("/", irABuscar);

  return (
    <ToastProvider>
      <OfflineBanner />
      <div className="flex h-dvh overflow-hidden bg-paper">
        <Sidebar rol={rol} />
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar usuario={usuario} onBuscar={irABuscar} />
          <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
        </div>
      </div>
    </ToastProvider>
  );
}

function TopBar({
  usuario,
  onBuscar,
}: {
  usuario: { nombre: string; email: string };
  onBuscar: () => void;
}) {
  const [menuAbierto, setMenuAbierto] = useState(false);
  const iniciales =
    usuario.nombre
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p[0])
      .join("")
      .toUpperCase() || "OP";

  return (
    <header className="flex h-[76px] shrink-0 items-center justify-between gap-6 border-b border-line bg-surface px-8">
      <motion.button
        type="button"
        onClick={onBuscar}
        whileHover={{ y: -1 }}
        whileTap={{ y: 1, scale: 0.99 }}
        transition={SPRING.snappy}
        className="flex h-12 w-full max-w-md items-center gap-3 rounded-md border-2 border-line-strong bg-paper px-4 text-left text-[17px] text-ink-3 hover:border-action hover:bg-surface"
      >
        <svg aria-hidden="true" width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="shrink-0">
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-3.5-3.5" strokeLinecap="round" />
        </svg>
        <span className="flex-1">Buscar a un empleado</span>
        <Key>/</Key>
      </motion.button>

      <div className="relative shrink-0">
        <motion.button
          type="button"
          onClick={() => setMenuAbierto((v) => !v)}
          aria-expanded={menuAbierto}
          aria-haspopup="menu"
          whileTap={{ scale: 0.98 }}
          transition={SPRING.snappy}
          className="flex h-12 items-center gap-3 rounded-md px-2.5 hover:bg-paper-deep"
        >
          <span
            aria-hidden="true"
            className="flex h-10 w-10 items-center justify-center rounded-full bg-action text-[15px] font-bold text-white"
          >
            {iniciales}
          </span>
          <span className="hidden min-w-0 text-left sm:block">
            <span className="block max-w-[180px] truncate text-[15px] font-bold leading-tight text-ink">
              {usuario.nombre}
            </span>
            <span className="block text-[14px] leading-tight text-ink-3">Sesión activa</span>
          </span>
        </motion.button>

        {menuAbierto ? (
          <>
            <button
              type="button"
              aria-label="Cerrar menú"
              onClick={() => setMenuAbierto(false)}
              className="fixed inset-0 z-40 cursor-default"
            />
            <motion.div
              role="menu"
              initial={{ opacity: 0, y: -8, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={SPRING.snappy}
              className="absolute right-0 top-[calc(100%+10px)] z-50 w-72 rounded-lg border border-line bg-surface p-2 shadow-3"
            >
              <div className="border-b border-line px-3 pb-3 pt-2">
                <p className="text-[17px] font-bold text-ink">{usuario.nombre}</p>
                <p className="truncate text-[15px] text-ink-3">{usuario.email}</p>
              </div>
              <form action="/auth/logout" method="POST" className="pt-2">
                <button
                  type="submit"
                  className="flex h-12 w-full items-center gap-3 rounded-md px-3 text-[17px] font-semibold text-ink hover:bg-paper-deep"
                >
                  <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                    <path d="M15 17l5-5-5-5M20 12H9M12 20H6a2 2 0 01-2-2V6a2 2 0 012-2h6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  Cerrar sesión
                </button>
              </form>
            </motion.div>
          </>
        ) : null}
      </div>
    </header>
  );
}
