"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import { SPRING } from "@/ui/motion";

/**
 * Barra de secciones de Ajustes.
 *
 * Cada destino se nombra por el ASUNTO que se configura, no por el sistema al
 * que pertenece ("Teléfonos", no "Auditoría de WhatsApp"): quien entra aquí
 * viene con un problema concreto, no buscando un módulo.
 *
 * El subrayado activo es un único elemento que viaja entre secciones (mismo
 * layoutId): el movimiento dice de dónde a dónde te moviste. Usa un id propio
 * para no pelearse con el indicador de la barra lateral.
 */

const SECCIONES = [
  { href: "/ajustes/empresa", label: "Empresa" },
  { href: "/ajustes/whatsapp", label: "WhatsApp" },
  { href: "/ajustes/plantillas", label: "Plantillas" },
  { href: "/ajustes/telefonos", label: "Teléfonos" },
];

export function SubNavegacionAjustes() {
  const pathname = usePathname();

  return (
    <nav aria-label="Secciones de ajustes" className="flex items-end gap-1 overflow-x-auto">
      <Link
        href="/ajustes"
        aria-current={pathname === "/ajustes" ? "page" : undefined}
        className={`relative flex h-14 shrink-0 items-center rounded-t-md px-4 text-[17px] font-bold outline-none transition-colors duration-[160ms] focus-visible:outline-3 focus-visible:outline-offset-[-3px] focus-visible:outline-action ${
          pathname === "/ajustes" ? "text-ink" : "text-ink-3 hover:text-action"
        }`}
      >
        Todo
        {pathname === "/ajustes" ? <Subrayado /> : null}
      </Link>

      {SECCIONES.map((s) => {
        const activo = pathname === s.href || pathname.startsWith(`${s.href}/`);
        return (
          <Link
            key={s.href}
            href={s.href}
            aria-current={activo ? "page" : undefined}
            className={`relative flex h-14 shrink-0 items-center rounded-t-md px-4 text-[17px] font-bold outline-none transition-colors duration-[160ms] focus-visible:outline-3 focus-visible:outline-offset-[-3px] focus-visible:outline-action ${
              activo ? "text-ink" : "text-ink-3 hover:text-action"
            }`}
          >
            {s.label}
            {activo ? <Subrayado /> : null}
          </Link>
        );
      })}
    </nav>
  );
}

function Subrayado() {
  return (
    <motion.span
      layoutId="ajustes-subrayado"
      transition={SPRING.travel}
      aria-hidden="true"
      className="absolute inset-x-2 bottom-0 h-[3px] rounded-full bg-action"
    />
  );
}
