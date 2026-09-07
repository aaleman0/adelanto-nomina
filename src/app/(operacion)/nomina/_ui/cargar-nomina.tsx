"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useRef, useState, type DragEvent } from "react";
import { Button } from "@/ui/button";
import { BlockTitle, Card, Datum, Sunken } from "@/ui/surface";
import { ConfirmDialog } from "@/ui/overlay";
import { ProblemNote, SuccessNote } from "@/ui/states";
import { Key, useShortcut } from "@/ui/shortcuts";
import { useToast } from "@/ui/toast";
import { T } from "@/ui/motion";
import { ENLACE_COMO_BOTON, formatearEntero } from "./comun";

/**
 * CARGAR LA NÓMINA DEL PERIODO.
 *
 * Dos pasos que el sistema NO puede fusionar: primero se sube el archivo (solo
 * se lee y se valida, no toca a nadie) y después se APLICA (esa sí es la
 * escritura pesada: crea/actualiza ofertas y cancela los contratos sin firmar
 * del ciclo anterior). Por eso subir no pregunta nada y aplicar sí confirma.
 */

type ResumenValidacion = {
  totalRows: number;
  validRows: number;
  invalidRows: number;
  duplicateRows: number;
};

type LoteSubido = {
  batch?: {
    id: string;
    filename: string;
    /** `validando` = limpio y aplicable. `aplicada_con_errores`/`fallida` = no. */
    status: string;
    total_rows: number;
    valid_rows: number;
    invalid_rows: number;
    duplicate_rows: number;
    created_at: string;
  };
  missingColumns?: string[];
  summary?: ResumenValidacion;
  error?: string;
};

type ResultadoAplicar = {
  batchId?: string;
  status?: string;
  appliedRows?: number;
  changedRows?: number;
  unchangedRows?: number;
  createdEmployees?: number;
  updatedEmployees?: number;
  createdOffers?: number;
  replacedOffers?: number;
  error?: string;
};

const MOTIVO_SIN_ROL = "Requiere rol operaciones. Pídeselo a un administrador.";

/**
 * Los endpoints de importación devuelven el mensaje crudo del error (incluye
 * texto de librería y nombres de campo). El operador nunca ve eso: se traduce
 * por código HTTP y el detalle técnico se queda en la consola.
 */
function mensajeAlSubir(status: number, crudo?: string): string {
  if (crudo) console.error("POST /api/imports:", crudo);
  if (status === 400) {
    return "Ese archivo no se pudo leer como nómina. Debe ser un .csv exportado del sistema de nómina.";
  }
  if (status === 401 || status === 403) return MOTIVO_SIN_ROL;
  if (status === 429) {
    return "Se cargaron muchos archivos seguidos. Espera un minuto y vuelve a intentarlo.";
  }
  return "No se pudo leer el archivo. Vuelve a intentarlo; si sigue igual, avisa a soporte.";
}

function mensajeAlAplicar(status: number, crudo?: string): string {
  if (crudo) console.error("POST /api/imports/[batchId]/apply:", crudo);
  if (status === 401 || status === 403) return MOTIVO_SIN_ROL;
  if (status === 429) {
    return "Se hicieron muchas operaciones seguidas. Espera un minuto y vuelve a intentarlo.";
  }
  if (crudo?.includes("validando")) {
    return "Este archivo ya se aplicó antes. Carga el archivo del periodo que quieres abrir.";
  }
  if (crudo?.includes("validas") || crudo?.includes("válidas")) {
    return "El archivo no trae ninguna fila utilizable. Revisa que traiga empleados y vuelve a cargarlo.";
  }
  return "No se pudo aplicar el archivo. Vuelve a intentarlo; si sigue igual, avisa a soporte.";
}

export function CargarNomina({ puedeOperar }: { puedeOperar: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);

  const [arrastrando, setArrastrando] = useState(false);
  const [subiendo, setSubiendo] = useState(false);
  const [aplicando, setAplicando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [lote, setLote] = useState<LoteSubido | null>(null);
  const [aplicado, setAplicado] = useState<ResultadoAplicar | null>(null);
  const [problema, setProblema] = useState<string | null>(null);

  const abrirSelector = useCallback(() => {
    if (!puedeOperar || subiendo || aplicando) return;
    inputRef.current?.click();
  }, [puedeOperar, subiendo, aplicando]);

  // "c" de cargar: el atajo se anuncia en el propio botón, nunca escondido.
  useShortcut("c", abrirSelector, { enabled: puedeOperar });

  async function subir(archivo: File) {
    setProblema(null);
    setLote(null);
    setAplicado(null);

    // Se avisa antes de gastar la subida: el servidor rechaza igual, pero el
    // operador merece saberlo al instante.
    if (!archivo.name.toLowerCase().endsWith(".csv")) {
      setProblema("Solo se puede cargar un archivo .csv. Exporta la nómina en ese formato y vuelve a intentarlo.");
      return;
    }

    setSubiendo(true);
    try {
      const cuerpo = new FormData();
      // El endpoint espera exactamente este nombre de campo.
      cuerpo.append("file", archivo);
      const respuesta = await fetch("/api/imports", { method: "POST", body: cuerpo });
      const datos = (await respuesta.json().catch(() => ({}))) as LoteSubido;

      if (!respuesta.ok || !datos.batch) {
        setProblema(mensajeAlSubir(respuesta.status, datos.error));
        return;
      }
      setLote(datos);
    } catch (error) {
      console.error(error);
      setProblema("No se pudo enviar el archivo. Revisa tu conexión y vuelve a intentarlo.");
    } finally {
      setSubiendo(false);
    }
  }

  async function aplicar() {
    const batchId = lote?.batch?.id;
    if (!batchId) return;

    setAplicando(true);
    setProblema(null);
    try {
      const respuesta = await fetch(`/api/imports/${batchId}/apply`, { method: "POST" });
      const datos = (await respuesta.json().catch(() => ({}))) as ResultadoAplicar;

      if (!respuesta.ok || datos.error) {
        // Se cierra el diálogo: el aviso vive en la pantalla, detrás de él.
        setConfirmando(false);
        setProblema(mensajeAlAplicar(respuesta.status, datos.error));
        return;
      }

      setConfirmando(false);
      setAplicado(datos);
      setLote(null);
      toast.done("Ciclo abierto. Los empleados del archivo ya pueden recibir su oferta.");
      // La lista de ciclos vive en el servidor: hay que pedirla de nuevo.
      router.refresh();
    } catch (error) {
      console.error(error);
      setConfirmando(false);
      setProblema("No se pudo aplicar el archivo. Revisa tu conexión y vuelve a intentarlo.");
    } finally {
      setAplicando(false);
    }
  }

  function alSoltar(evento: DragEvent<HTMLDivElement>) {
    evento.preventDefault();
    setArrastrando(false);
    if (!puedeOperar || subiendo || aplicando) return;
    const archivo = evento.dataTransfer.files?.[0];
    if (archivo) void subir(archivo);
  }

  const resumen = lote?.summary;
  const faltanColumnas = (lote?.missingColumns ?? []).length > 0;
  // El backend solo deja aplicar un lote impecable: si trae filas inválidas o
  // repetidas lo marca `aplicada_con_errores` y el apply lo rechaza.
  const sePuedeAplicar = lote?.batch?.status === "validando" && (resumen?.validRows ?? 0) > 0;

  return (
    <Card>
      <BlockTitle
        title="Cargar el archivo del periodo"
        hint="Primero se revisa el archivo. Nada cambia hasta que lo apliques."
      />

      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (puedeOperar) setArrastrando(true);
        }}
        onDragLeave={() => setArrastrando(false)}
        onDrop={alSoltar}
        className={
          "flex flex-col items-center justify-center gap-5 rounded-lg border-2 border-dashed px-8 py-14 text-center transition-colors duration-[160ms] " +
          (arrastrando ? "border-action bg-action-soft" : "border-line-strong bg-paper-deep")
        }
      >
        <IconoArchivo />
        <div>
          <p className="text-[23px] font-bold text-ink">
            {arrastrando ? "Suelta aquí el archivo" : "Arrastra aquí el archivo de nómina"}
          </p>
          <p className="mt-1.5 text-[17px] text-ink-2">
            Un archivo .csv con los empleados y el monto autorizado del periodo.
          </p>
        </div>

        {/* El control accesible es el botón de abajo, que abre este selector;
            por eso el input sale del orden de tabulación en vez de duplicarlo. */}
        <input
          ref={inputRef}
          className="sr-only"
          type="file"
          name="file"
          accept=".csv,text/csv"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(e) => {
            const archivo = e.target.files?.[0];
            // Se limpia el input para poder volver a elegir el MISMO archivo.
            e.target.value = "";
            if (archivo) void subir(archivo);
          }}
        />

        <Button
          size="lg"
          variant="primary"
          onClick={abrirSelector}
          loading={subiendo}
          loadingLabel="Revisando el archivo…"
          disabled={!puedeOperar || aplicando}
          icon={<IconoSubir />}
        >
          Cargar archivo de nómina
          {puedeOperar ? <Key tone="dark">c</Key> : null}
        </Button>

        {!puedeOperar ? (
          <p className="max-w-md text-[17px] font-semibold text-attention">
            Tu rol no permite cargar la nómina. {MOTIVO_SIN_ROL}
          </p>
        ) : null}
      </div>

      <AnimatePresence mode="wait" initial={false}>
        {problema ? (
          <motion.div
            key="problema"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={T.base}
            className="mt-6"
          >
            <ProblemNote>{problema}</ProblemNote>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {aplicado ? <ResumenAplicado resultado={aplicado} onLimpiar={() => setAplicado(null)} /> : null}

      {lote?.batch && resumen ? (
        <div className="mt-6">
          <Sunken>
            <p className="text-[19px] font-bold text-ink">{lote.batch.filename}</p>
            <p className="mt-1 text-[15px] text-ink-3">
              Así quedó la revisión. Revisa los números antes de aplicar.
            </p>

            <div className="mt-5 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
              <Datum label="Filas en el archivo" value={formatearEntero(resumen.totalRows)} />
              <Datum label="Listas para aplicar" value={formatearEntero(resumen.validRows)} />
              <Datum
                label="Con datos incompletos"
                value={formatearEntero(resumen.invalidRows)}
                tone={resumen.invalidRows > 0 ? "normal" : "muted"}
              />
              <Datum
                label="Repetidas"
                value={formatearEntero(resumen.duplicateRows)}
                tone={resumen.duplicateRows > 0 ? "normal" : "muted"}
              />
            </div>
          </Sunken>

          <div className="mt-5">
            {faltanColumnas ? (
              <ProblemNote>
                Al archivo le faltan columnas: {lote.missingColumns?.join(", ")}. Agrégalas al CSV y
                vuelve a cargarlo.
              </ProblemNote>
            ) : resumen.validRows === 0 ? (
              <ProblemNote>
                Este archivo no trae ninguna fila utilizable. Revisa que sea la nómina del periodo y
                vuelve a cargarlo.
              </ProblemNote>
            ) : !sePuedeAplicar ? (
              <ProblemNote>
                Este archivo tiene {formatearEntero(resumen.invalidRows)} filas con datos incompletos y{" "}
                {formatearEntero(resumen.duplicateRows)} repetidas. Solo se aplica un archivo sin
                errores: corrígelo y vuelve a cargarlo.
              </ProblemNote>
            ) : (
              <div className="flex flex-wrap items-center gap-4">
                <Button
                  size="lg"
                  variant="primary"
                  onClick={() => setConfirmando(true)}
                  disabled={!puedeOperar}
                  icon={<IconoAplicar />}
                >
                  Aplicar y abrir el ciclo
                </Button>
                <p className="text-[15px] text-ink-2">
                  Se crearán {formatearEntero(resumen.validRows)} ofertas de adelanto.
                </p>
              </div>
            )}
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        open={confirmando}
        onClose={() => setConfirmando(false)}
        onConfirm={() => void aplicar()}
        tone="primary"
        loading={aplicando}
        title="¿Abrir el ciclo con este archivo?"
        consequence={
          `Se crearán o actualizarán ${formatearEntero(resumen?.validRows ?? 0)} ofertas de adelanto. ` +
          "Los empleados que ya estaban vuelven a quedar habilitados y su contrato anterior sin firmar se cancela. " +
          "Los contratos ya firmados no se tocan."
        }
        confirmLabel="Aplicar la nómina"
      />
    </Card>
  );
}

/** Confirmación de que el ciclo quedó abierto, con la puerta a verlo. */
function ResumenAplicado({
  resultado,
  onLimpiar,
}: {
  resultado: ResultadoAplicar;
  onLimpiar: () => void;
}) {
  return (
    <div className="mt-6 flex flex-col gap-5">
      <SuccessNote>El ciclo quedó abierto con este archivo.</SuccessNote>

      <Sunken>
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
          <Datum label="Filas aplicadas" value={formatearEntero(resultado.appliedRows ?? 0)} />
          <Datum label="Empleados nuevos" value={formatearEntero(resultado.createdEmployees ?? 0)} />
          <Datum
            label="Empleados actualizados"
            value={formatearEntero(resultado.updatedEmployees ?? 0)}
          />
          <Datum label="Ofertas creadas" value={formatearEntero(resultado.createdOffers ?? 0)} />
        </div>
        {(resultado.replacedOffers ?? 0) > 0 ? (
          <p className="mt-5 text-[17px] text-ink-2">
            {formatearEntero(resultado.replacedOffers ?? 0)} empleados venían de un ciclo anterior:
            su oferta vieja se reemplazó y vuelven a estar habilitados.
          </p>
        ) : null}
      </Sunken>

      <div className="flex flex-wrap items-center gap-4">
        {resultado.batchId ? (
          <Link href={`/nomina/${resultado.batchId}`} className={ENLACE_COMO_BOTON}>
            <IconoVer />
            Ver el ciclo
          </Link>
        ) : null}
        <Button variant="quiet" size="lg" onClick={onLimpiar}>
          Cargar otro archivo
        </Button>
      </div>
    </div>
  );
}

/* ── Iconos: siempre acompañando texto, nunca solos ────────────────────── */

function IconoArchivo() {
  return (
    <span
      aria-hidden="true"
      className="flex h-16 w-16 items-center justify-center rounded-full bg-surface shadow-1"
    >
      <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-ink-3">
        <path d="M14 3v5h5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M9 13h6M9 17h4" strokeLinecap="round" />
      </svg>
    </span>
  );
}

function IconoSubir() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
      <path d="M12 17V5M7 10l5-5 5 5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 19h16" strokeLinecap="round" />
    </svg>
  );
}

function IconoAplicar() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
      <path d="M4 12.5L9 17.5L20 6.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconoVer() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
      <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
