"use client";

import { useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useId,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { ShortcutBar, useShortcut } from "@/ui/shortcuts";

/**
 * Ámbito de atajos de la pantalla.
 *
 * Los atajos escuchan en `window`, así que siguen respondiendo aunque haya un
 * diálogo encima: con la confirmación de una tanda abierta, pulsar "o"
 * navegaba a Ofertas y abandonaba la decisión a medias. Cualquier control que
 * abra algo modal lo declara aquí, y mientras quede uno abierto los atajos de
 * navegación se apagan.
 *
 * Se lleva la cuenta por IDENTIDAD y no con un contador: un cierre repetido
 * (Escape y el botón, o cerrar tras ejecutar) no desbalancea el registro.
 */
type AmbitoAtajos = {
  hayDialogoAbierto: boolean;
  marcarDialogo: (id: string, abierto: boolean) => void;
};

const Ambito = createContext<AmbitoAtajos | null>(null);

export function AmbitoDeAtajos({ children }: { children: ReactNode }) {
  const [abiertos, setAbiertos] = useState<ReadonlySet<string>>(() => new Set());

  const marcarDialogo = useCallback((id: string, abierto: boolean) => {
    setAbiertos((previos) => {
      if (previos.has(id) === abierto) return previos;
      const siguientes = new Set(previos);
      if (abierto) siguientes.add(id);
      else siguientes.delete(id);
      return siguientes;
    });
  }, []);

  const valor = useMemo<AmbitoAtajos>(
    () => ({ hayDialogoAbierto: abiertos.size > 0, marcarDialogo }),
    [abiertos, marcarDialogo],
  );

  return <Ambito.Provider value={valor}>{children}</Ambito.Provider>;
}

/**
 * Función con la que un control avisa que abrió o cerró su diálogo. Fuera del
 * ámbito no hay atajos a los que estorbar, así que no hace nada.
 */
export function useDialogoDeAtajos() {
  const ambito = useContext(Ambito);
  const id = useId();

  return useCallback(
    (abierto: boolean) => {
      ambito?.marcarDialogo(id, abierto);
    },
    [ambito, id],
  );
}

/**
 * Atajos de la portada.
 *
 * Los tres destinos son las etapas del ciclo de trabajo (cargar → ofrecer →
 * consultar), no funciones sueltas: desde Pendientes el operador siempre sale
 * hacia una de esas tres. Van con la barra visible al pie porque un atajo que
 * no se ve en pantalla no existe para quien opera.
 */
export function AtajosPendientes() {
  const router = useRouter();
  const ambito = useContext(Ambito);
  // Con un diálogo encima la tecla es del diálogo, no de la pantalla: navegar
  // aquí dejaría la confirmación a medias, sin que el operador decidiera.
  const activos = !(ambito?.hayDialogoAbierto ?? false);

  useShortcut(
    "n",
    useCallback(() => router.push("/nomina"), [router]),
    { enabled: activos },
  );
  useShortcut(
    "o",
    useCallback(() => router.push("/ofertas"), [router]),
    { enabled: activos },
  );
  useShortcut(
    "p",
    useCallback(() => router.push("/personas"), [router]),
    { enabled: activos },
  );

  return (
    <ShortcutBar
      items={[
        { key: "n", label: "Cargar nómina" },
        { key: "o", label: "Enviar ofertas" },
        { key: "p", label: "Buscar personas" },
      ]}
    />
  );
}
