import Link from "next/link";
import type { ReactNode } from "react";
import { Screen, Grid } from "@/ui/screen";
import { Card } from "@/ui/surface";

/**
 * Índice de Ajustes.
 *
 * Cada tarjeta responde dos cosas: QUÉ se configura ahí y POR QUÉ importa —
 * es decir, qué se rompe en la operación si ese dato está mal. Sin la segunda
 * línea, "Empresa" y "Plantillas" son cajones opacos que nadie abre hasta que
 * algo ya falló.
 */

const SECCIONES: Array<{
  href: string;
  titulo: string;
  que: string;
  porQue: string;
  icono: ReactNode;
}> = [
  {
    href: "/ajustes/empresa",
    titulo: "Datos del acreedor",
    que: "Razón social, RFC, domicilio, cuenta bancaria y los dos testigos.",
    porQue: "Se imprimen tal cual en cada contrato que firma un empleado.",
    icono: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-7 w-7">
        <path d="M6 21V5a1 1 0 011-1h10a1 1 0 011 1v16" strokeLinecap="round" />
        <path d="M4 21h16M9.5 8h2M9.5 12h2M14 8h.5M14 12h.5M10 21v-4h4v4" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    href: "/ajustes/whatsapp",
    titulo: "Conexión de WhatsApp",
    que: "El número desde el que salen los mensajes y el estado de la conexión con Meta.",
    porQue: "Si la conexión está caída, ninguna oferta llega y el envío falla en silencio.",
    icono: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-7 w-7">
        <path
          d="M21 11.5a8.5 8.5 0 01-12.3 7.6L4 20.5l1.5-4.5A8.5 8.5 0 1121 11.5z"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    href: "/ajustes/plantillas",
    titulo: "Plantillas de mensaje",
    que: "Los textos que Meta revisó y el estado en que quedó cada uno.",
    porQue: "Solo se puede enviar con una plantilla aprobada; con cualquier otra, el mensaje no sale.",
    icono: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-7 w-7">
        <rect x="3.5" y="5" width="17" height="14" rx="2" />
        <path d="M7 9.5h7M7 13.5h4" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    href: "/ajustes/telefonos",
    titulo: "Teléfonos mal capturados",
    que: "Revisión de todos los números de la base y corrección de los que WhatsApp rechazaría.",
    porQue: "Un número mal escrito es un empleado que nunca recibe su oferta y nadie se entera.",
    icono: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-7 w-7">
        <rect x="6.5" y="2.5" width="11" height="19" rx="2.5" />
        <path d="M10.5 18.5h3" strokeLinecap="round" />
      </svg>
    ),
  },
];

export default function PantallaAjustes() {
  return (
    <Screen
      title="Ajustes"
      lead="Lo que se configura una vez y afecta a toda la empresa. Solo lo ve y lo cambia un administrador."
    >
      <Grid cols="lg:grid-cols-2">
        {SECCIONES.map((s) => (
          <Link
            key={s.href}
            href={s.href}
            className="rounded-lg outline-none focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-action"
          >
            <Card interactive className="flex h-full flex-col gap-4">
              <div className="flex items-start gap-4">
                <span
                  aria-hidden="true"
                  className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md bg-action-soft text-action"
                >
                  {s.icono}
                </span>
                <h2 className="mt-1.5 text-[23px] font-bold leading-tight text-ink">{s.titulo}</h2>
              </div>

              <p className="text-[17px] leading-relaxed text-ink-2">{s.que}</p>

              <p className="mt-auto rounded-md bg-paper-deep px-4 py-3 text-[15px] leading-snug text-ink-2">
                <strong className="font-bold text-ink">Por qué importa: </strong>
                {s.porQue}
              </p>

              <span className="inline-flex items-center gap-2 text-[17px] font-bold text-action">
                Abrir
                <svg
                  aria-hidden="true"
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.4"
                >
                  <path d="M10 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
            </Card>
          </Link>
        ))}
      </Grid>
    </Screen>
  );
}
