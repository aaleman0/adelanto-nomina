"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import type { ReactNode } from "react";
import { SPRING, SHARED, staggerChild, staggerParent } from "./motion";

/**
 * NAVEGACIÓN — derivada del ciclo real de trabajo, no de las herramientas.
 *
 * El operador hace siempre la misma secuencia: carga la nómina del periodo,
 * ofrece el adelanto, da seguimiento a quién firmó y entrega el resultado.
 * Por eso los destinos son etapas de ese ciclo (Nómina → Ofertas → Personas)
 * con una bandeja de Pendientes al frente, en vez de un menú por módulos.
 *
 * Barra lateral siempre visible (no un menú que hay que abrir): en piso, cada
 * clic extra para navegar es tiempo perdido y una oportunidad de perderse.
 */

export type Rol = "admin" | "operaciones" | "solo_lectura";

type Destino = {
  href: string;
  label: string;
  /** Qué se hace aquí, en lenguaje de operador. La interfaz enseña. */
  hint: string;
  icon: ReactNode;
  soloAdmin?: boolean;
};

const DESTINOS: Destino[] = [
  {
    href: "/",
    label: "Pendientes",
    hint: "Lo que necesita tu atención",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-6 w-6">
        <path d="M4 6h16M4 12h16M4 18h9" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    href: "/nomina",
    label: "Nómina",
    hint: "Cargar el archivo del periodo",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-6 w-6">
        <path d="M12 4v11m0 0l-4-4m4 4l4-4" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M4 17v2a1 1 0 001 1h14a1 1 0 001-1v-2" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    href: "/ofertas",
    label: "Ofertas",
    hint: "Enviar el adelanto por WhatsApp",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-6 w-6">
        <path d="M21 11.5a8.5 8.5 0 01-12.3 7.6L4 20.5l1.5-4.5A8.5 8.5 0 1121 11.5z" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    href: "/personas",
    label: "Personas",
    hint: "Buscar a un empleado y su contrato",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-6 w-6">
        <circle cx="12" cy="8" r="3.5" />
        <path d="M5 20c0-3.6 3.1-6 7-6s7 2.4 7 6" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    href: "/ajustes",
    label: "Ajustes",
    hint: "Datos de la empresa y WhatsApp",
    soloAdmin: true,
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-6 w-6">
        <circle cx="12" cy="12" r="3.2" />
        <path d="M12 3v2.2M12 18.8V21M21 12h-2.2M5.2 12H3M18.4 5.6l-1.6 1.6M7.2 16.8l-1.6 1.6M18.4 18.4l-1.6-1.6M7.2 7.2L5.6 5.6" strokeLinecap="round" />
      </svg>
    ),
  },
];

function esActivo(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Sidebar({ rol }: { rol: Rol }) {
  const pathname = usePathname();
  const visibles = DESTINOS.filter((d) => !d.soloAdmin || rol === "admin");

  return (
    <nav
      aria-label="Secciones"
      className="flex h-full w-[268px] shrink-0 flex-col gap-2 border-r border-line bg-surface px-4 py-6"
    >
      <div className="mb-4 px-3">
        <p className="text-[13px] font-bold uppercase tracking-[0.14em] text-ink-3">Adelanto</p>
        <p className="text-[23px] font-bold leading-tight text-ink">de nómina</p>
      </div>

      <motion.ul variants={staggerParent} initial="initial" animate="animate" className="flex flex-col gap-1.5">
        {visibles.map((d) => {
          const activo = esActivo(pathname, d.href);
          return (
            <motion.li key={d.href} variants={staggerChild}>
              <Link
                href={d.href}
                aria-current={activo ? "page" : undefined}
                className="group relative flex items-center gap-3.5 rounded-md px-3 py-3.5 outline-none focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-action"
              >
                {/* Indicador que VIAJA entre destinos (mismo layoutId): el
                    movimiento explica de dónde a dónde se movió el foco. */}
                {activo ? (
                  <motion.span
                    layoutId={SHARED.navIndicator}
                    transition={SPRING.travel}
                    className="absolute inset-0 -z-10 rounded-md bg-action"
                  />
                ) : null}
                <span
                  aria-hidden="true"
                  className={`shrink-0 transition-colors duration-[160ms] ${
                    activo ? "text-white" : "text-ink-3 group-hover:text-action"
                  }`}
                >
                  {d.icon}
                </span>
                <span className="min-w-0">
                  <span
                    className={`block text-[17px] font-bold leading-tight transition-colors duration-[160ms] ${
                      activo ? "text-white" : "text-ink group-hover:text-action"
                    }`}
                  >
                    {d.label}
                  </span>
                  <span
                    className={`block truncate text-[14px] leading-snug transition-colors duration-[160ms] ${
                      activo ? "text-white/80" : "text-ink-3"
                    }`}
                  >
                    {d.hint}
                  </span>
                </span>
              </Link>
            </motion.li>
          );
        })}
      </motion.ul>

      <div className="mt-auto rounded-md bg-paper-deep px-4 py-3.5 text-[14px] leading-snug text-ink-2">
        <p className="font-bold text-ink">¿Primera vez aquí?</p>
        <p className="mt-0.5">Empieza en <strong>Pendientes</strong>: ahí sale lo que hay que hacer hoy.</p>
      </div>
    </nav>
  );
}
