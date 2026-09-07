"use client";

import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { Sunken } from "@/ui/surface";
import { Status } from "@/ui/status";
import { Button } from "@/ui/button";
import { CheckField } from "@/ui/field";
import { Empty, ErrorState, LoadingRows, ProblemNote } from "@/ui/states";
import { staggerChild, staggerParent } from "@/ui/motion";
import { EnlaceAccion, FilaElegible, Paso } from "./paso";
import {
  categoriaDePlantilla,
  estaAprobada,
  estadoDePlantilla,
  idiomaDePlantilla,
  pedirJson,
  vistaPreviaPlantilla,
  type PlantillaGuardada,
} from "./formato";

/** La que usa el backend cuando no se le manda ninguna (schemas.ts). */
const PLANTILLA_POR_OMISION = "adelanto_nomina_v2";

/**
 * Qué mensaje reciben.
 *
 * WhatsApp no deja escribir texto libre a alguien que no te ha escrito: solo
 * plantillas que Meta aprobó de antemano. Por eso este paso no es un editor,
 * es una ELECCIÓN, y lo importante que hay que ver es si la plantilla está
 * aprobada — una sin aprobar no la entrega Meta y el envío falla completo.
 */
export function PasoPlantilla({
  plantilla,
  onSeleccionar,
  aceptaRiesgo,
  onAceptarRiesgo,
}: {
  plantilla: PlantillaGuardada | null;
  onSeleccionar: (p: PlantillaGuardada | null) => void;
  aceptaRiesgo: boolean;
  onAceptarRiesgo: (v: boolean) => void;
}) {
  const [intento, setIntento] = useState(0);
  const [verTodas, setVerTodas] = useState(false);

  // La carga guarda A QUÉ intento pertenece. Así el "volver a intentar" muestra
  // el esqueleto por comparación (la carga en memoria ya no es del intento
  // vigente) en vez de limpiar estado dentro del efecto, que es lo que dispara
  // renders en cascada.
  const [carga, setCarga] = useState<{
    intento: number;
    lista: PlantillaGuardada[] | null;
    fallo: string | null;
  } | null>(null);

  const vigente = carga?.intento === intento ? carga : null;
  const plantillas = vigente?.lista ?? null;
  const fallo = vigente?.fallo ?? null;

  useEffect(() => {
    let activo = true;

    pedirJson<{ templates: PlantillaGuardada[] }>("/api/whatsapp/templates")
      .then((r) => {
        if (!activo) return;
        const lista = r.templates ?? [];
        setCarga({ intento, lista, fallo: null });
        // Preselección: la de siempre si existe, si no la primera aprobada.
        // Ahorra el clic del caso normal sin esconder que se puede cambiar.
        const preferida =
          lista.find((t) => t.name === PLANTILLA_POR_OMISION) ??
          lista.find((t) => estaAprobada(t)) ??
          lista[0] ??
          null;
        onSeleccionar(preferida);
      })
      .catch((e: Error) => {
        if (activo) setCarga({ intento, lista: null, fallo: e.message });
      });

    return () => {
      activo = false;
    };
    // onSeleccionar es estable (useCallback en el orquestador).
  }, [intento, onSeleccionar]);

  const aprobada = estaAprobada(plantilla);
  const listo = plantilla !== null && (aprobada || aceptaRiesgo);
  const previa = vistaPreviaPlantilla(plantilla);
  const categoria = plantilla ? categoriaDePlantilla(plantilla.category) : null;

  return (
    <Paso
      numero={2}
      titulo="Qué mensaje reciben"
      proposito="Elige la plantilla aprobada por WhatsApp con la que sale la oferta."
      listo={listo}
      resumen={plantilla ? `${plantilla.name} · ${estadoDePlantilla(plantilla.status).label}` : undefined}
    >
      {fallo ? (
        <ErrorState
          title="No se pudieron cargar las plantillas"
          hint={fallo}
          onRetry={() => setIntento((n) => n + 1)}
          retryLabel="Volver a cargar las plantillas"
        />
      ) : plantillas === null ? (
        <LoadingRows rows={2} />
      ) : plantillas.length === 0 ? (
        <Empty
          title="No hay plantillas sincronizadas"
          hint="Los mensajes salen de plantillas que Meta aprueba. Un administrador tiene que traerlas desde Ajustes antes de poder enviar."
          action={
            <EnlaceAccion href="/ajustes/plantillas" tono="primary">
              Abrir plantillas de mensaje
            </EnlaceAccion>
          }
        />
      ) : (
        <div className="flex flex-col gap-5">
          {plantilla ? (
            <div className="flex flex-wrap items-start justify-between gap-4 rounded-md border-2 border-line bg-surface px-4 py-4">
              <div className="min-w-0">
                <p className="truncate text-[19px] font-bold text-ink">{plantilla.name}</p>
                <p className="mt-0.5 text-[15px] text-ink-3">
                  {idiomaDePlantilla(plantilla.language)} · {categoria?.etiqueta}
                </p>
                {/* La categoría manda en la ENTREGA, no es un dato de catálogo:
                    decirlo aquí evita el envío que sale "enviado" y no recibe nadie. */}
                {categoria?.entrega ? (
                  <p className="mt-1.5 max-w-prose text-[15px] leading-snug text-ink-3">
                    {categoria.entrega}
                  </p>
                ) : null}
              </div>
              <Status value={estadoDePlantilla(plantilla.status)} />
            </div>
          ) : null}

          {previa ? (
            <Sunken>
              <p className="mb-2 text-[13px] font-bold uppercase tracking-[0.07em] text-ink-3">
                Así lo va a leer la persona
              </p>
              <p className="whitespace-pre-line text-[17px] leading-relaxed text-ink">{previa}</p>
              <p className="mt-3 text-[15px] leading-snug text-ink-3">
                Lo que va entre corchetes lo rellena el sistema con los datos de cada quien. El botón
                del mensaje lleva a su página para pedir el adelanto: abrirlo no genera contrato
                todavía.
              </p>
            </Sunken>
          ) : null}

          {plantilla && !aprobada ? (
            <div className="flex flex-col gap-3">
              <ProblemNote>
                WhatsApp no ha aprobado esta plantilla. Si la usas, es muy probable que el mensaje no
                le llegue a nadie y el envío quede marcado como fallido.
              </ProblemNote>
              <CheckField
                checked={aceptaRiesgo}
                onChange={onAceptarRiesgo}
                label="Entiendo el riesgo y quiero usarla de todos modos"
                hint="Elige otra plantilla aprobada si no estás seguro."
              />
            </div>
          ) : null}

          {plantillas.length > 1 ? (
            <div className="flex flex-col gap-3">
              <Button
                variant="quiet"
                size="sm"
                onClick={() => setVerTodas((v) => !v)}
                className="self-start"
              >
                {verTodas
                  ? "Ocultar las otras plantillas"
                  : `Usar otra plantilla (${plantillas.length - 1} más)`}
              </Button>

              {verTodas ? (
                <motion.div
                  variants={staggerParent}
                  initial="initial"
                  animate="animate"
                  className="flex flex-col gap-3"
                >
                  {plantillas.map((t) => (
                    <motion.div key={t.id} variants={staggerChild}>
                      <FilaElegible
                        seleccionada={t.id === plantilla?.id}
                        onSeleccionar={() => {
                          onSeleccionar(t);
                          onAceptarRiesgo(false);
                        }}
                        titulo={t.name}
                        detalle={`${idiomaDePlantilla(t.language)} · ${categoriaDePlantilla(t.category).etiqueta}`}
                        extra={<Status value={estadoDePlantilla(t.status)} size="sm" />}
                      />
                    </motion.div>
                  ))}
                </motion.div>
              ) : null}
            </div>
          ) : null}
        </div>
      )}
    </Paso>
  );
}
