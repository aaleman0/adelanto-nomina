"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Stack, Card, BlockTitle } from "@/ui/surface";
import { TextInput } from "@/ui/field";
import { Button } from "@/ui/button";
import { AsyncSwitch, ErrorState, LoadingRows, ProblemNote, SuccessNote } from "@/ui/states";
import { useToast } from "@/ui/toast";
import { pedirJson, cuerpoJson } from "./red";

/**
 * Datos del acreedor que salen impresos en el contrato.
 *
 * La lista de campos es EXACTAMENTE la whitelist del endpoint (9 claves): el
 * POST valida las nueve juntas, así que la pantalla siempre manda las nueve,
 * incluso las vacías. Añadir un campo aquí sin añadirlo allá solo produciría
 * un 400 silencioso.
 *
 * Los campos se agrupan por la parte del contrato donde aparecen, no por tipo
 * de dato: así se revisa el contrato "de arriba abajo" contra el papel.
 */

const CLAVES = [
  "acreedor_razon_social",
  "acreedor_rfc",
  "acreedor_representante",
  "acreedor_domicilio",
  "acreedor_banco",
  "acreedor_cuenta",
  "acreedor_clabe",
  "testigo_1_nombre",
  "testigo_2_nombre",
] as const;

type Clave = (typeof CLAVES)[number];
type Valores = Record<Clave, string>;

type Campo = {
  clave: Clave;
  etiqueta: string;
  ayuda: string;
  /** Tope del esquema del servidor: se corta aquí para no provocar un 400. */
  max: number;
  /** Datos que se leen carácter por carácter (RFC, CLABE, cuenta). */
  mono?: boolean;
};

const BLOQUES: Array<{ titulo: string; explicacion: string; campos: Campo[] }> = [
  {
    titulo: "Quién otorga el adelanto",
    explicacion: "Encabeza el contrato y aparece en las firmas.",
    campos: [
      {
        clave: "acreedor_razon_social",
        etiqueta: "Razón social",
        ayuda: "El nombre legal completo de la empresa, como está en el acta constitutiva.",
        max: 500,
      },
      {
        clave: "acreedor_rfc",
        etiqueta: "RFC",
        ayuda: "Con homoclave, sin espacios ni guiones.",
        max: 20,
        mono: true,
      },
      {
        clave: "acreedor_representante",
        etiqueta: "Quién firma por la empresa",
        ayuda: "Nombre del representante legal que aparece como firmante.",
        max: 300,
      },
      {
        clave: "acreedor_domicilio",
        etiqueta: "Domicilio fiscal",
        ayuda: "Calle, número, colonia, ciudad y estado, en una sola línea.",
        max: 500,
      },
    ],
  },
  {
    titulo: "A dónde se deposita",
    explicacion: "Es la cuenta que el empleado lee en su contrato antes de firmar.",
    campos: [
      {
        clave: "acreedor_banco",
        etiqueta: "Banco",
        ayuda: "Nombre comercial del banco.",
        max: 120,
      },
      {
        clave: "acreedor_cuenta",
        etiqueta: "Número de cuenta",
        ayuda: "Solo dígitos.",
        max: 40,
        mono: true,
      },
      {
        clave: "acreedor_clabe",
        etiqueta: "CLABE interbancaria",
        ayuda: "18 dígitos. Revísala dígito por dígito antes de guardar.",
        max: 40,
        mono: true,
      },
    ],
  },
  {
    titulo: "Testigos",
    explicacion: "Los dos nombres que firman como testigos en todos los contratos.",
    campos: [
      {
        clave: "testigo_1_nombre",
        etiqueta: "Primer testigo",
        ayuda: "Nombre completo.",
        max: 300,
      },
      {
        clave: "testigo_2_nombre",
        etiqueta: "Segundo testigo",
        ayuda: "Nombre completo.",
        max: 300,
      },
    ],
  },
];

const VACIO: Valores = Object.fromEntries(CLAVES.map((k) => [k, ""])) as Valores;

const ETIQUETAS: Record<Clave, string> = Object.fromEntries(
  BLOQUES.flatMap((b) => b.campos).map((c) => [c.clave, c.etiqueta]),
) as Record<Clave, string>;

export function FormularioAcreedor() {
  const toast = useToast();
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [valores, setValores] = useState<Valores>(VACIO);
  /**
   * Aquí los valores no sirven de señal de carga: se editan, y "todo vacío" es
   * un resultado posible del servidor. Por eso la señal es `cargado`, que se
   * enciende DESPUÉS del await, y el estado de la vista se deduce de ella y del
   * error. Guardar un "loading" que hubiera que encender dentro del efecto es
   * justo lo que encadena renders.
   */
  const [cargado, setCargado] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [guardado, setGuardado] = useState(false);
  const [problema, setProblema] = useState<{ mensaje: string; detalle?: string } | null>(null);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);

  const estado = errorCarga !== null ? "error" : cargado ? "ready" : "loading";

  /**
   * Todos los setState quedan DESPUÉS del await, nunca en el arranque síncrono.
   * `vigente` deja descartar una respuesta que llegó tarde; por defecto se
   * aplica siempre, porque un reintento del operador sí quiere su resultado.
   */
  const cargar = useCallback(async (vigente: () => boolean = () => true) => {
    const r = await pedirJson<{ config: Partial<Valores> }>("/api/settings/company", {
      cache: "no-store",
    });
    if (!vigente()) return;
    if (!r.ok) {
      setErrorCarga(r.mensaje);
      return;
    }
    setErrorCarga(null);
    setValores({ ...VACIO, ...r.datos.config });
    setCargado(true);
  }, []);

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

  // El "Listo" del botón se limpia solo; si el componente se desmonta antes,
  // el temporizador se cancela para no tocar estado de un árbol muerto.
  useEffect(() => {
    const ref = temporizador;
    return () => {
      if (ref.current) clearTimeout(ref.current);
    };
  }, []);

  const faltantes = useMemo(
    () => CLAVES.filter((k) => valores[k].trim() === ""),
    [valores],
  );

  function cambiar(clave: Clave, valor: string) {
    setValores((prev) => ({ ...prev, [clave]: valor }));
    setGuardado(false);
    setProblema(null);
  }

  async function guardar() {
    setGuardando(true);
    setProblema(null);

    // El esquema del servidor recorta espacios; se manda ya recortado para que
    // lo que quede en pantalla sea exactamente lo que se guardó.
    const limpio = Object.fromEntries(
      CLAVES.map((k) => [k, valores[k].trim()]),
    ) as Valores;

    const r = await pedirJson<{ ok: boolean }>("/api/settings/company", cuerpoJson(limpio));
    setGuardando(false);

    if (!r.ok) {
      setProblema({ mensaje: r.mensaje, detalle: r.detalle });
      toast.failed("No se guardaron los datos del acreedor.");
      return;
    }

    setValores(limpio);
    setGuardado(true);
    toast.done("Datos del acreedor guardados.");
    temporizador.current = setTimeout(() => setGuardado(false), 2600);
  }

  return (
    <AsyncSwitch
      state={estado}
      loading={<LoadingRows rows={4} />}
      empty={null}
      error={
        <ErrorState
          title="No se pudieron leer los datos del acreedor"
          hint={errorCarga ?? "Vuelve a intentarlo."}
          // Limpiar el error aquí, en el manejador del clic, es lo que devuelve
          // el esqueleto mientras se reintenta.
          onRetry={() => {
            setErrorCarga(null);
            void cargar();
          }}
        />
      }
    >
      <Stack>
        <Card>
          <BlockTitle
            title="Esto se imprime en el contrato"
            hint="Lo que escribas aquí aparece tal cual en el documento que firma cada empleado. Un dato mal escrito queda mal escrito en contratos ya firmados."
          />
          {faltantes.length > 0 ? (
            <div className="rounded-md border border-attention-line bg-attention-soft px-5 py-4">
              <p className="text-[17px] font-bold text-attention">
                {faltantes.length === 1
                  ? "Falta 1 dato de 9"
                  : `Faltan ${faltantes.length} datos de 9`}
              </p>
              <p className="mt-1 text-[15px] leading-relaxed text-ink-2">
                Mientras estén vacíos, el contrato sale con ese espacio en blanco:{" "}
                {faltantes.map((k) => ETIQUETAS[k]).join(", ")}.
              </p>
            </div>
          ) : (
            <SuccessNote>Los 9 datos están llenos. El contrato sale completo.</SuccessNote>
          )}
        </Card>

        {BLOQUES.map((bloque) => (
          <Card key={bloque.titulo}>
            <BlockTitle title={bloque.titulo} hint={bloque.explicacion} />
            <div className="flex flex-col gap-6">
              {bloque.campos.map((campo) => {
                const vacio = valores[campo.clave].trim() === "";
                return (
                  <TextInput
                    key={campo.clave}
                    label={campo.etiqueta}
                    // El hueco se avisa en el propio campo, no solo en el resumen:
                    // así se ve dónde hay que escribir sin volver a subir.
                    hint={vacio ? `Falta. Hoy sale en blanco en el contrato. ${campo.ayuda}` : campo.ayuda}
                    value={valores[campo.clave]}
                    maxLength={campo.max}
                    onChange={(e) => cambiar(campo.clave, e.target.value)}
                    className={campo.mono ? "font-mono" : undefined}
                    autoComplete="off"
                    spellCheck={false}
                  />
                );
              })}
            </div>
          </Card>
        ))}

        <Card>
          {problema ? (
            <div className="mb-5">
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

          <div className="flex flex-wrap items-center gap-4">
            <Button
              variant="primary"
              size="lg"
              onClick={() => void guardar()}
              loading={guardando}
              loadingLabel="Guardando…"
              done={guardado}
              doneLabel="Listo"
            >
              Guardar datos del acreedor
            </Button>
            <p className="text-[15px] leading-snug text-ink-3">
              Los contratos que ya se firmaron no cambian: esto aplica a los que se generen
              de aquí en adelante.
            </p>
          </div>
        </Card>
      </Stack>
    </AsyncSwitch>
  );
}
