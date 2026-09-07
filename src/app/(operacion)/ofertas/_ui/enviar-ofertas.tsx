"use client";

import { AnimatePresence, motion } from "motion/react";
import { useCallback, useMemo, useState } from "react";
import { Screen, Grid } from "@/ui/screen";
import { Card, Stack, Sunken } from "@/ui/surface";
import { Button } from "@/ui/button";
import { CountTile } from "@/ui/status";
import { ConfirmDialog } from "@/ui/overlay";
import { ProblemNote, SuccessNote } from "@/ui/states";
import { ShortcutBar, useShortcut } from "@/ui/shortcuts";
import { useToast } from "@/ui/toast";
import { successVariants } from "@/ui/motion";
import { hasRole, type UserRole } from "@/lib/auth/roles-shared";
import { EnlaceAccion } from "./paso";
import { PasoDestinatarios, resumirDestino, type Destino } from "./paso-destinatarios";
import { PasoPlantilla } from "./paso-plantilla";
import { PasoRevision, type Revision } from "./paso-revision";
import {
  estaAprobada,
  omitidosPorRepetido,
  pedirJson,
  personas,
  type PlantillaGuardada,
  type ResultadoEnvio,
} from "./formato";

/** Tope del backend para `employeeIds` (BulkSendBodySchema). */
const TOPE_MANUAL = 5000;

/**
 * ENVIAR OFERTAS — el punto donde el sistema le habla a gente real.
 *
 * Los cuatro pasos ocurren en UNA pantalla y ninguno se esconde: el operador ve
 * siempre lo que ya decidió y lo que le falta. El paso 4 vive en una columna
 * fija a la derecha, así que el botón de enviar —y el motivo por el que todavía
 * no se puede pulsar— están a la vista sin importar por dónde vaya leyendo.
 *
 * Nada de esto se puede deshacer: por eso revisar es un paso propio, la
 * confirmación dice el número exacto de personas, y el resultado distingue el
 * envío inmediato del encolado (que reporta 0 enviados por diseño).
 */
export function EnviarOfertas({ rol }: { rol: UserRole }) {
  const puedeEnviar = hasRole(rol, "operaciones");
  const toast = useToast();

  const [destino, setDestino] = useState<Destino | null>(null);
  const [plantilla, setPlantilla] = useState<PlantillaGuardada | null>(null);
  const [aceptaRiesgo, setAceptaRiesgo] = useState(false);

  const [revision, setRevision] = useState<Revision | null>(null);
  const [revisando, setRevisando] = useState(false);
  const [falloRevision, setFalloRevision] = useState<string | null>(null);
  const [excluidos, setExcluidos] = useState<Set<string>>(() => new Set());

  const [confirmando, setConfirmando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [falloEnvio, setFalloEnvio] = useState<string | null>(null);
  const [resultado, setResultado] = useState<ResultadoEnvio | null>(null);

  const plantillaLista = plantilla !== null && (estaAprobada(plantilla) || aceptaRiesgo);

  const marcados = useMemo(
    () => (revision?.employees ?? []).filter((e) => e.eligible && !excluidos.has(e.employee_id)),
    [revision, excluidos],
  );

  /** Cambiar destinatarios invalida la revisión: quedaría contando a otra gente. */
  const cambiarDestino = useCallback((nuevo: Destino | null) => {
    setDestino(nuevo);
    setRevision(null);
    setFalloRevision(null);
    setExcluidos(new Set());
    setFalloEnvio(null);
  }, []);

  const revisar = useCallback(async () => {
    if (!destino) return;
    setRevisando(true);
    setFalloRevision(null);
    try {
      const cuerpo =
        destino.tipo === "ciclo"
          ? { mode: "import", importId: destino.lote.id }
          : { mode: "manual", employeeIds: destino.empleados.map((e) => e.employee_id) };

      const r = await pedirJson<Revision>("/api/whatsapp/bulk?action=validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cuerpo),
      });

      setRevision({ total: r.total, eligible: r.eligible, employees: r.employees ?? [] });
      setExcluidos(new Set());
    } catch (e) {
      setFalloRevision((e as Error).message);
    } finally {
      setRevisando(false);
    }
  }, [destino]);

  useShortcut("r", revisar, { enabled: destino !== null && !revisando && !enviando });

  const alternarExcluido = useCallback((employeeId: string) => {
    setExcluidos((prev) => {
      const siguiente = new Set(prev);
      if (siguiente.has(employeeId)) siguiente.delete(employeeId);
      else siguiente.add(employeeId);
      return siguiente;
    });
  }, []);

  /** Por qué todavía no se puede enviar. Se muestra siempre, nunca se esconde el botón. */
  const impedimento = (() => {
    if (!puedeEnviar) return "Tu rol no permite enviar; pídeselo a un administrador.";
    // Tras un envío el botón NO se queda armado. Volver a pulsarlo con la misma
    // lista no manda nada —el backend no repite la misma plantilla a la misma
    // persona en los minutos siguientes— y dejaría al operador creyendo que
    // reenvió. Para otra tanda hay que empezar de nuevo, a la vista.
    if (resultado) return "Este envío ya salió. Pulsa «Preparar otro envío» para mandar otra tanda.";
    if (!destino) return "Falta elegir a quién le llega (paso 1).";
    if (!plantillaLista) {
      return plantilla === null
        ? "Falta elegir el mensaje (paso 2)."
        : "Confirma que quieres usar una plantilla sin aprobar (paso 2).";
    }
    if (!revision) return "Falta revisar la lista (paso 3).";
    if (marcados.length === 0) return "No hay nadie que pueda recibir la oferta.";
    const mandaCicloCompleto = destino.tipo === "ciclo" && excluidos.size === 0;
    if (!mandaCicloCompleto && marcados.length > TOPE_MANUAL) {
      return `Son demasiadas personas para mandarlas una por una (máximo ${TOPE_MANUAL}). Vuelve a marcar a todos para enviar el ciclo completo.`;
    }
    return null;
  })();

  const enviar = useCallback(async () => {
    if (!destino || !plantilla) return;
    setEnviando(true);
    setFalloEnvio(null);
    try {
      // El backend IGNORA `employeeIds` cuando el modo es "import" y le manda al
      // lote entero. Por eso, en cuanto el operador quita a alguien, el envío
      // cambia a modo manual con la lista exacta que dejó marcada: lo que se ve
      // en pantalla es lo que sale.
      const cuerpo =
        destino.tipo === "ciclo" && excluidos.size === 0
          ? { mode: "import", importId: destino.lote.id, templateName: plantilla.name }
          : {
              mode: "manual",
              employeeIds: marcados.map((e) => e.employee_id),
              templateName: plantilla.name,
            };

      const r = await pedirJson<ResultadoEnvio>("/api/whatsapp/bulk?action=send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cuerpo),
      });

      setResultado(r);
      setConfirmando(false);

      // El aviso tiene que coincidir con lo que pasó. Que el servidor conteste
      // bien no significa que el envío saliera: una tanda donde NADA salió y
      // hubo fallos es un error, y pintarla de verde con palomita hace que el
      // operador la dé por buena y siga adelante.
      const omitidos = omitidosPorRepetido(r);
      const salieron = r.status === "queued" ? (r.queued ?? r.eligible) : r.sent;
      const fallaron = r.failed ?? 0;

      if (salieron === 0 && fallaron > 0) {
        toast.failed(
          fallaron === 1
            ? "No salió el mensaje. Abajo está el motivo."
            : `No salió ninguno de los ${fallaron} mensajes. Abajo está el motivo de cada uno.`,
        );
      } else if (salieron === 0 && omitidos > 0) {
        // Ni éxito ni fallo: no se repitió lo que ya se había mandado.
        toast.info("No salió nada nuevo: ya se les había mandado hace unos minutos.");
      } else if (fallaron > 0) {
        toast.info(
          `Salieron ${salieron}, pero ${fallaron} no se pudieron enviar. Revisa el motivo abajo.`,
        );
      } else {
        toast.done(
          r.status === "queued"
            ? `Se encolaron ${salieron} mensajes.`
            : `Salieron ${salieron} mensajes.`,
        );
      }
    } catch (e) {
      setFalloEnvio((e as Error).message);
      setConfirmando(false);
      toast.failed("No se pudo completar el envío.");
    } finally {
      setEnviando(false);
    }
  }, [destino, plantilla, excluidos, marcados, toast]);

  const empezarDeNuevo = useCallback(() => {
    setResultado(null);
    setFalloEnvio(null);
    cambiarDestino(null);
  }, [cambiarDestino]);

  return (
    <Screen
      title="Enviar ofertas"
      lead="Les llega un WhatsApp con su adelanto y un botón para pedirlo. Una vez que sale, no se puede cancelar."
      action={<EnlaceAccion href="/ofertas/historial">Ver envíos anteriores</EnlaceAccion>}
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <Stack gap="gap-5">
          <AnimatePresence initial={false}>
            {resultado ? (
              <motion.div key="resultado" variants={successVariants} initial="initial" animate="animate" exit="exit">
                <ResultadoDelEnvio resultado={resultado} onOtroEnvio={empezarDeNuevo} />
              </motion.div>
            ) : null}
          </AnimatePresence>

          <PasoDestinatarios
            destino={destino}
            onCambiar={cambiarDestino}
            puedeBuscarPersonas={puedeEnviar}
          />

          <PasoPlantilla
            plantilla={plantilla}
            onSeleccionar={setPlantilla}
            aceptaRiesgo={aceptaRiesgo}
            onAceptarRiesgo={setAceptaRiesgo}
          />

          <PasoRevision
            hayDestino={destino !== null}
            revision={revision}
            cargando={revisando}
            fallo={falloRevision}
            onRevisar={revisar}
            excluidos={excluidos}
            onAlternar={alternarExcluido}
            onMarcarTodos={() => setExcluidos(new Set())}
            esCicloCompleto={destino?.tipo === "ciclo"}
          />

          <ShortcutBar items={[{ key: "r", label: "Revisar quién puede recibirlo" }]} />
        </Stack>

        {/* El paso 4 queda fijo mientras se recorren los otros tres: el botón de
            enviar y el motivo por el que aún no se puede pulsar nunca se pierden. */}
        <div className="lg:sticky lg:top-6 lg:self-start">
          <Stack gap="gap-5">
            <Card>
              <p className="text-[13px] font-bold uppercase tracking-[0.07em] text-ink-3">Paso 4 de 4</p>
              <h2 className="mt-0.5 text-[23px] font-bold leading-tight text-ink">Enviar</h2>
              <p className="mt-1 text-[15px] leading-snug text-ink-3">
                Esto le manda el mensaje a gente real y no se puede deshacer.
              </p>

              <ul className="mt-5 flex flex-col gap-3 border-y border-line py-5">
                <Pendiente
                  numero={1}
                  listo={destino !== null}
                  titulo="A quién le llega"
                  valor={destino ? resumirDestino(destino) : "Sin elegir"}
                />
                <Pendiente
                  numero={2}
                  listo={plantillaLista}
                  titulo="Qué mensaje reciben"
                  valor={plantilla ? plantilla.name : "Sin elegir"}
                />
                <Pendiente
                  numero={3}
                  listo={revision !== null && marcados.length > 0}
                  titulo="Revisado"
                  valor={revision ? `${personas(marcados.length)} lo van a recibir` : "Sin revisar"}
                />
              </ul>

              <div className="mt-5 flex flex-col gap-3">
                <Button
                  variant="primary"
                  size="lg"
                  full
                  disabled={impedimento !== null}
                  onClick={() => setConfirmando(true)}
                >
                  {marcados.length > 0 && impedimento === null
                    ? `Enviar a ${personas(marcados.length)}`
                    : "Enviar las ofertas"}
                </Button>

                {impedimento ? (
                  <p className="text-[15px] leading-snug text-ink-3">{impedimento}</p>
                ) : (
                  <p className="text-[15px] leading-snug text-ink-3">
                    Te vamos a pedir una confirmación más antes de mandarlo.
                  </p>
                )}

                {falloEnvio ? <ProblemNote>{falloEnvio}</ProblemNote> : null}
              </div>
            </Card>
          </Stack>
        </div>
      </div>

      <ConfirmDialog
        open={confirmando}
        onClose={() => setConfirmando(false)}
        onConfirm={enviar}
        loading={enviando}
        tone="primary"
        title={`Enviar la oferta a ${personas(marcados.length)}`}
        consequence={`Se manda un WhatsApp real a ${personas(marcados.length)} con la plantilla ${plantilla?.name ?? ""}. No se puede cancelar ni deshacer una vez que sale.`}
        confirmLabel={`Sí, enviar a ${personas(marcados.length)}`}
      />
    </Screen>
  );
}

/** Renglón del acuse: qué falta y qué ya quedó. */
function Pendiente({
  numero,
  listo,
  titulo,
  valor,
}: {
  numero: number;
  listo: boolean;
  titulo: string;
  valor: string;
}) {
  return (
    <li className="flex items-start gap-3">
      <span
        aria-hidden="true"
        className={
          "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[14px] font-bold " +
          (listo ? "bg-done-soft text-done" : "bg-paper-deep text-ink-3")
        }
      >
        {listo ? (
          <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="3">
            <path d="M4 10.5l4 4 8-9" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : (
          numero
        )}
      </span>
      <span className="min-w-0">
        <span className="block text-[15px] font-bold text-ink">{titulo}</span>
        <span className={`block text-[15px] leading-snug ${listo ? "text-ink-2" : "text-ink-3"}`}>
          {valor}
        </span>
      </span>
    </li>
  );
}

/**
 * Resultado del envío.
 *
 * Cuatro desenlaces, y los dos que más se malinterpretan no son fallos:
 *
 * · Encolado: el backend responde sent=0 porque las tareas se procesan en
 *   segundo plano. Decir ahí "salieron 0 mensajes" sería mentir.
 * · Repetido: si se vuelve a pulsar Enviar sobre la misma gente a los pocos
 *   minutos, el backend no repite el mensaje y responde sent=0. Ese cero
 *   necesita SU PROPIO número en pantalla y una frase que lo explique, o el
 *   operador lee un envío fallido donde el sistema en realidad lo protegió de
 *   mandarle dos veces lo mismo a la misma persona.
 */
function ResultadoDelEnvio({
  resultado,
  onOtroEnvio,
}: {
  resultado: ResultadoEnvio;
  onOtroEnvio: () => void;
}) {
  const encolado = resultado.status === "queued";
  const conFallos = !encolado && resultado.failed > 0;
  const omitidos = omitidosPorRepetido(resultado);
  const salieron = encolado ? (resultado.queued ?? resultado.eligible) : resultado.sent;
  /** Nada nuevo salió y sí hubo repetidos: el desenlace que hay que explicar. */
  const todoRepetido = salieron === 0 && resultado.failed === 0 && omitidos > 0;

  return (
    <Card>
      {todoRepetido ? (
        <SuccessNote>
          No salió ningún mensaje nuevo: a {personas(omitidos)} ya se les había mandado este mismo
          mensaje hace unos minutos, así que no se les repitió.
        </SuccessNote>
      ) : encolado ? (
        <SuccessNote>
          Se pusieron en cola {salieron} mensajes. Salen en segundo plano; entra al detalle para ver
          cómo va cada uno.
        </SuccessNote>
      ) : conFallos ? (
        <ProblemNote>
          Salieron {resultado.sent} mensajes y {resultado.failed} no se pudieron enviar. Abajo está el
          motivo de cada fallo.
        </ProblemNote>
      ) : (
        <SuccessNote>Salieron {resultado.sent} mensajes. Ya está hecho.</SuccessNote>
      )}

      <div className="mt-5">
        <Grid cols={omitidos > 0 ? "sm:grid-cols-2 xl:grid-cols-4" : "sm:grid-cols-3"}>
          <CountTile count={resultado.eligible} label="Podían recibirlo" tone="wait" />
          <CountTile
            count={salieron}
            label={encolado ? "En cola" : "Mensajes que salieron"}
            tone={encolado ? "progress" : "done"}
          />
          {/* Los omitidos NO son fallos ni envíos: sin su propio conteo, la suma
              de las otras fichas no cuadra con "podían recibirlo". */}
          {omitidos > 0 ? (
            <CountTile count={omitidos} label="Ya lo habían recibido" tone="wait" />
          ) : null}
          <CountTile count={resultado.failed} label="No se pudieron enviar" tone="failed" />
        </Grid>
      </div>

      {omitidos > 0 ? (
        <p className="mt-4 max-w-prose text-[15px] leading-snug text-ink-3">
          A {personas(omitidos)} no se les volvió a mandar porque ya les había salido este mismo
          mensaje hace unos minutos: el sistema no repite la misma oferta a la misma persona tan
          seguido. Si de verdad hay que reenviárselo, espera unos minutos y vuelve a intentarlo.
        </p>
      ) : null}

      {resultado.errors.length > 0 ? (
        <Sunken className="mt-5">
          <p className="mb-3 text-[15px] font-bold text-ink">Qué pasó con los que fallaron</p>
          <ul className="flex max-h-64 flex-col divide-y divide-line overflow-y-auto">
            {resultado.errors.map((e) => (
              <li key={e.employeeId} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 py-2.5">
                <span className="font-mono text-[15px] font-semibold text-ink">
                  {e.rfc ?? "Sin RFC"}
                </span>
                <span className="min-w-0 flex-1 text-[15px] text-ink-2">{e.error}</span>
              </li>
            ))}
          </ul>
        </Sunken>
      ) : null}

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <EnlaceAccion href={`/ofertas/${resultado.bulkSendId}`} tono="primary">
          Ver el detalle de este envío
        </EnlaceAccion>
        <Button variant="secondary" size="lg" onClick={onOtroEnvio}>
          Preparar otro envío
        </Button>
      </div>
    </Card>
  );
}
