"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Stack, Card, BlockTitle, Datum } from "@/ui/surface";
import { TextInput } from "@/ui/field";
import { Button } from "@/ui/button";
import { ErrorState, LoadingRows, ProblemNote, SuccessNote } from "@/ui/states";
import { useToast } from "@/ui/toast";
import { pedirJson, cuerpoJson } from "./red";

/**
 * Revisar la conexión de WhatsApp.
 *
 * El semáforo describe el estado del SISTEMA (base, tablas, credenciales,
 * respuesta de Meta), nunca el de quien opera. Cada foco en rojo trae qué
 * hacer: un tablero que solo dice "error" obliga a preguntarle a alguien.
 *
 * Nota de comportamiento real del backend: `/api/health/whatsapp` guarda el
 * resultado de la prueba contra Meta durante 5 minutos. Por eso existe el botón
 * "Probar conexión", que pega a Meta en el momento sin pasar por esa caché.
 */

type Salud = {
  ok: boolean;
  checks: {
    supabase: boolean;
    env: {
      accessToken: boolean;
      phoneNumberId: boolean;
      businessAccountId: boolean;
      webhookVerifyToken: boolean;
      appSecret: boolean;
    };
    tables: Record<string, boolean>;
  };
  whatsappConfigured: boolean;
  connection: { ok: boolean };
};

type RespuestaConfig = {
  config: Record<string, string>;
  envValid: boolean;
  envErrors: string[];
};

type Formulario = {
  phone_number_id: string;
  business_number: string;
  webhook_verify_token: string;
};

const FORM_VACIO: Formulario = {
  phone_number_id: "",
  business_number: "",
  webhook_verify_token: "",
};

/** Nombre humano de cada credencial + para qué sirve si falta. */
const CREDENCIALES: Array<{ clave: keyof Salud["checks"]["env"]; variable: string; para: string }> = [
  { clave: "accessToken", variable: "WHATSAPP_ACCESS_TOKEN", para: "enviar cualquier mensaje" },
  { clave: "phoneNumberId", variable: "WHATSAPP_PHONE_NUMBER_ID", para: "saber desde qué número sale" },
  { clave: "businessAccountId", variable: "WHATSAPP_BUSINESS_ACCOUNT_ID", para: "traer las plantillas de Meta" },
  { clave: "webhookVerifyToken", variable: "WHATSAPP_WEBHOOK_VERIFY_TOKEN", para: "recibir los acuses de entrega" },
  { clave: "appSecret", variable: "WHATSAPP_APP_SECRET", para: "comprobar que los acuses vienen de Meta" },
];

export function PanelConexion() {
  const toast = useToast();

  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [salud, setSalud] = useState<Salud | null>(null);
  const [envErrors, setEnvErrors] = useState<string[]>([]);
  const [form, setForm] = useState<Formulario>(FORM_VACIO);
  /**
   * Ni `form` ni `salud` sirven de señal de carga: el primero se edita y el
   * segundo es null también cuando el chequeo de salud falla con la pantalla ya
   * cargada. Por eso la señal es `cargado`, que se enciende DESPUÉS del await, y
   * estar cargando se deduce de ella y del error. Guardar un "loading" que
   * hubiera que encender dentro del efecto es justo lo que encadena renders.
   */
  const [cargado, setCargado] = useState(false);

  const [revisando, setRevisando] = useState(false);
  const [probando, setProbando] = useState(false);
  const [prueba, setPrueba] = useState<
    { ok: true; numero?: string; nombre?: string } | { ok: false; mensaje: string; detalle?: string } | null
  >(null);

  const [revelado, setRevelado] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [guardado, setGuardado] = useState(false);
  const [problema, setProblema] = useState<{ mensaje: string; detalle?: string } | null>(null);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * La salud se lee con fetch directo (no con `pedirJson`) porque el endpoint
   * responde 503 justo cuando algo está caído, y ese es precisamente el cuerpo
   * que hay que pintar. Tratarlo como error dejaría la pantalla en blanco en el
   * único momento en que sirve.
   */
  const leerSalud = useCallback(async (): Promise<Salud | null> => {
    try {
      const res = await fetch("/api/health/whatsapp", { cache: "no-store" });
      const json = (await res.json()) as Salud;
      return json && typeof json === "object" && json.checks ? json : null;
    } catch {
      return null;
    }
  }, []);

  /**
   * Todos los setState quedan DESPUÉS del await, nunca en el arranque síncrono.
   * `vigente` deja descartar una respuesta que llegó tarde; por defecto se
   * aplica siempre, porque un reintento del operador sí quiere su resultado.
   */
  const cargar = useCallback(
    async (vigente: () => boolean = () => true) => {
      const [config, estadoSalud] = await Promise.all([
        pedirJson<RespuestaConfig>("/api/whatsapp/config", { cache: "no-store" }),
        leerSalud(),
      ]);

      if (!vigente()) return;

      if (!config.ok) {
        setErrorCarga(config.mensaje);
        return;
      }

      setErrorCarga(null);
      setForm({
        phone_number_id: config.datos.config.whatsapp_phone_number_id ?? "",
        business_number: config.datos.config.whatsapp_business_number ?? "",
        webhook_verify_token: config.datos.config.whatsapp_webhook_verify_token ?? "",
      });
      setEnvErrors(config.datos.envErrors ?? []);
      setSalud(estadoSalud);
      setCargado(true);
    },
    [leerSalud],
  );

  useEffect(() => {
    let vivo = true;
    // La petición vive en su propia función async: así el cuerpo del efecto no
    // escribe estado (eso encadena renders) y al cerrar la pantalla la
    // respuesta en camino se tira en vez de tocar un árbol ya desmontado.
    void (async () => {
      await cargar(() => vivo);
    })();
    return () => {
      vivo = false;
    };
  }, [cargar]);

  // Cancela el "Listo" pendiente si la pantalla se cierra antes de que expire.
  useEffect(() => {
    const ref = temporizador;
    return () => {
      if (ref.current) clearTimeout(ref.current);
    };
  }, []);

  async function revisarDeNuevo() {
    setRevisando(true);
    setSalud(await leerSalud());
    setRevisando(false);
  }

  async function probarConexion() {
    setProbando(true);
    setPrueba(null);

    // Sin cuerpo: el servidor usa las credenciales del despliegue. El token
    // nunca pasa por el navegador ni se escribe en un campo.
    const r = await pedirJson<{ phoneNumber?: string; displayName?: string }>(
      "/api/whatsapp/test",
      cuerpoJson({}),
    );
    setProbando(false);

    if (!r.ok) {
      setPrueba({ ok: false, mensaje: r.mensaje, detalle: r.detalle });
      toast.failed("Meta no aceptó la conexión.");
      return;
    }

    setPrueba({ ok: true, numero: r.datos.phoneNumber, nombre: r.datos.displayName });
    toast.done("Meta respondió: la conexión funciona.");
    // Refresca el semáforo con lo que se acaba de comprobar.
    setSalud(await leerSalud());
  }

  async function guardar() {
    setGuardando(true);
    setProblema(null);

    const r = await pedirJson<{ ok: boolean }>("/api/whatsapp/config", cuerpoJson(form));
    setGuardando(false);

    if (!r.ok) {
      setProblema({ mensaje: r.mensaje, detalle: r.detalle });
      toast.failed("No se guardaron los datos de la conexión.");
      return;
    }

    setGuardado(true);
    toast.done("Datos de la conexión guardados.");
    temporizador.current = setTimeout(() => setGuardado(false), 2600);
  }

  if (errorCarga === null && !cargado) return <LoadingRows rows={4} />;

  if (errorCarga !== null) {
    return (
      <ErrorState
        title="No se pudo leer la configuración de WhatsApp"
        hint={errorCarga}
        // Limpiar el error aquí, en el manejador del clic, es lo que devuelve
        // el esqueleto mientras se reintenta.
        onRetry={() => {
          setErrorCarga(null);
          void cargar();
        }}
      />
    );
  }

  const tablasOk = salud ? Object.values(salud.checks.tables).every(Boolean) : false;
  const tablasFaltantes = salud
    ? Object.entries(salud.checks.tables)
        .filter(([, ok]) => !ok)
        .map(([nombre]) => nombre)
    : [];
  const credencialesFaltantes = salud
    ? CREDENCIALES.filter((c) => !salud.checks.env[c.clave])
    : [];

  return (
    <Stack>
      <Card>
        <BlockTitle
          title="Cómo está el sistema ahora"
          hint="Cuatro comprobaciones. Si alguna está en rojo, los mensajes no salen y aquí dice qué hay que arreglar."
          action={
            <Button
              variant="secondary"
              onClick={() => void revisarDeNuevo()}
              loading={revisando}
              loadingLabel="Revisando…"
              icon={
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <path d="M20 12a8 8 0 11-2.3-5.6M20 4v4h-4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              }
            >
              Volver a revisar
            </Button>
          }
        />

        {salud === null ? (
          <ProblemNote>
            No se pudo leer el estado del sistema. Vuelve a revisar; si sigue igual, avisa a
            soporte porque el servicio podría estar caído.
          </ProblemNote>
        ) : (
          <div className="flex flex-col gap-3">
            <Foco
              ok={salud.checks.supabase}
              titulo="Base de datos"
              bien="Responde normal."
              mal="El sistema no está leyendo la base."
              remedio="Ningún envío ni acuse se está guardando. Avisa a soporte: no es algo que se arregle desde esta pantalla."
            />

            <Foco
              ok={tablasOk}
              titulo="Tablas de WhatsApp"
              bien="Las cuatro tablas del módulo existen."
              mal="Falta preparar la base para WhatsApp."
              remedio={`Avisa a soporte con este dato: no responden ${tablasFaltantes.join(", ")}.`}
            />

            <Foco
              ok={credencialesFaltantes.length === 0}
              titulo="Credenciales del despliegue"
              bien="Las cinco credenciales están puestas."
              mal={
                credencialesFaltantes.length === 1
                  ? "Falta 1 credencial."
                  : `Faltan ${credencialesFaltantes.length} credenciales.`
              }
              remedio="Se ponen como variables de entorno del despliegue, no desde esta pantalla."
            >
              {/* El nombre exacto de la variable ES la acción a ejecutar: quien
                  entra a Ajustes es quien puede tocarlas. */}
              {credencialesFaltantes.length > 0 ? (
                <ul className="mt-3 flex flex-col gap-2">
                  {credencialesFaltantes.map((c) => (
                    <li key={c.clave} className="text-[15px] leading-snug text-ink-2">
                      <code className="font-mono font-bold text-ink">{c.variable}</code>
                      <span className="text-ink-3"> — hace falta para {c.para}.</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </Foco>

            <Foco
              ok={salud.connection.ok}
              titulo="Respuesta de Meta"
              bien="Meta aceptó la llave la última vez que se comprobó."
              mal="Meta no aceptó la llave."
              remedio="Casi siempre es que el token caducó. Genera uno nuevo en Meta, actualiza WHATSAPP_ACCESS_TOKEN en el despliegue y vuelve a probar."
            />

            <p className="mt-1 text-[15px] leading-snug text-ink-3">
              La respuesta de Meta se guarda 5 minutos para no llamarla en cada carga. Usa
              &ldquo;Probar conexión&rdquo; si quieres comprobarla al momento.
            </p>
          </div>
        )}
      </Card>

      <Card>
        <BlockTitle
          title="Probar la conexión al momento"
          hint="Le pregunta a Meta ahora mismo si la llave sigue sirviendo y qué número tiene registrado. No envía ningún mensaje a nadie."
        />
        <div className="flex flex-wrap items-center gap-4">
          <Button
            variant="primary"
            size="lg"
            onClick={() => void probarConexion()}
            loading={probando}
            loadingLabel="Preguntándole a Meta…"
          >
            Probar conexión
          </Button>
        </div>

        {prueba?.ok ? (
          <div className="mt-5 flex flex-col gap-4">
            <SuccessNote>Meta respondió. La conexión funciona.</SuccessNote>
            <div className="grid gap-5 sm:grid-cols-2">
              <Datum label="Número registrado" value={prueba.numero ?? "Sin dato"} mono />
              <Datum label="Nombre que ve el empleado" value={prueba.nombre ?? "Sin dato"} />
            </div>
          </div>
        ) : null}

        {prueba && !prueba.ok ? (
          <div className="mt-5">
            <ProblemNote>
              {prueba.mensaje} Revisa arriba qué credencial falta y vuelve a probar.
              {prueba.detalle ? (
                <span className="mt-1 block text-[15px] font-normal opacity-80">
                  Lo que respondió Meta: {prueba.detalle}
                </span>
              ) : null}
            </ProblemNote>
          </div>
        ) : null}
      </Card>

      <Card>
        <BlockTitle
          title="Datos de referencia del número"
          hint="El sistema envía con las variables del despliegue, no con lo que se escriba aquí. Estos campos son la copia legible para saber con qué número se supone que se está trabajando."
        />

        {envErrors.length > 0 ? (
          <div className="mb-5 rounded-md border border-attention-line bg-attention-soft px-5 py-4">
            <p className="text-[17px] font-bold text-attention">
              El despliegue tiene la configuración incompleta
            </p>
            <ul className="mt-2 flex flex-col gap-1">
              {envErrors.map((e) => (
                <li key={e} className="font-mono text-[14px] leading-snug text-ink-2">
                  {e}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="flex flex-col gap-6">
          <TextInput
            label="Identificador del número emisor"
            hint="El Phone Number ID que Meta asignó al número desde el que salen los mensajes."
            value={form.phone_number_id}
            maxLength={64}
            onChange={(e) => {
              setForm((p) => ({ ...p, phone_number_id: e.target.value }));
              setGuardado(false);
            }}
            className="font-mono"
            autoComplete="off"
            spellCheck={false}
          />

          <TextInput
            label="Número de negocio"
            hint="Con clave de país y sin espacios, por ejemplo 5215512345678."
            value={form.business_number}
            maxLength={32}
            onChange={(e) => {
              setForm((p) => ({ ...p, business_number: e.target.value }));
              setGuardado(false);
            }}
            className="font-mono"
            autoComplete="off"
            spellCheck={false}
          />

          <div className="flex flex-col gap-3">
            <TextInput
              label="Token de verificación del webhook"
              hint="Es un secreto: se muestra oculto para que nadie lo lea por encima del hombro."
              type={revelado ? "text" : "password"}
              value={form.webhook_verify_token}
              maxLength={256}
              onChange={(e) => {
                setForm((p) => ({ ...p, webhook_verify_token: e.target.value }));
                setGuardado(false);
              }}
              className="font-mono"
              autoComplete="off"
              spellCheck={false}
            />
            <div>
              <Button variant="quiet" size="sm" onClick={() => setRevelado((v) => !v)}>
                {revelado ? "Ocultar el token" : "Revelar el token"}
              </Button>
            </div>
          </div>
        </div>

        {problema ? (
          <div className="mt-6">
            <ProblemNote>
              {problema.mensaje}
              {problema.detalle ? (
                <span className="mt-1 block text-[15px] font-normal opacity-80">
                  Detalle para soporte: {problema.detalle}
                </span>
              ) : null}
            </ProblemNote>
          </div>
        ) : null}

        <div className="mt-6">
          <Button
            variant="primary"
            size="lg"
            onClick={() => void guardar()}
            loading={guardando}
            loadingLabel="Guardando…"
            done={guardado}
            doneLabel="Listo"
          >
            Guardar datos de referencia
          </Button>
        </div>
      </Card>
    </Stack>
  );
}

/**
 * Un foco del semáforo. El color nunca viaja solo: lleva forma (punto lleno o
 * hueco) y palabra, para que se lea con daltonismo y bajo luz fuerte.
 */
function Foco({
  ok,
  titulo,
  bien,
  mal,
  remedio,
  children,
}: {
  ok: boolean;
  titulo: string;
  bien: string;
  mal: string;
  remedio: string;
  children?: ReactNode;
}) {
  return (
    <div
      className={`flex items-start gap-4 rounded-md border px-5 py-4 ${
        ok ? "border-done-line bg-done-soft" : "border-failed-line bg-failed-soft"
      }`}
    >
      <span
        aria-hidden="true"
        className={`mt-1.5 h-3.5 w-3.5 shrink-0 rounded-full ${
          ok ? "bg-done" : "border-[3px] border-failed bg-transparent"
        }`}
      />
      <div className="min-w-0">
        <p className={`text-[17px] font-bold ${ok ? "text-done" : "text-failed"}`}>
          {titulo}: {ok ? "bien" : "falla"}
        </p>
        <p className="mt-0.5 text-[17px] leading-relaxed text-ink-2">{ok ? bien : mal}</p>
        {!ok ? (
          <p className="mt-1.5 text-[15px] leading-relaxed text-ink-2">
            <strong className="font-bold text-ink">Qué hacer: </strong>
            {remedio}
          </p>
        ) : null}
        {!ok ? children : null}
      </div>
    </div>
  );
}
