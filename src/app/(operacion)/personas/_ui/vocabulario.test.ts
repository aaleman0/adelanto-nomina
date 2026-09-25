import { describe, expect, it } from "vitest";
import { CONTADOR, ESTADOS_EN_ORDEN, comoLoTomoElSistema, queMandoLaPersona } from "./vocabulario";
import { ACTION_REQUIRED_STATUSES, parseContractOperationalStatus } from "@/lib/backoffice/contract-control";
import { describeStatus } from "@/ui/status";

/**
 * El estado operativo se declara en cuatro sitios —la vista de SQL, el tipo, el
 * diccionario del sistema de diseño y el filtro de esta pantalla— y basta con
 * olvidar uno para que el operador vea la clave cruda de la base. Pasó al añadir
 * `rechazado`: el dato existía en `advance_offers` desde el primer "No, gracias",
 * pero el tablero mostraba `mensaje_enviado` para quien dijo que no y para quien
 * nunca abrió el mensaje, once y cinco personas en la misma fila.
 */
describe("estados del expediente", () => {
  it("todos tienen una traducción de verdad, no la clave con guiones", () => {
    for (const estado of ESTADOS_EN_ORDEN) {
      const { label } = describeStatus(estado);
      expect(label, estado).not.toBe(estado.replace(/_/g, " "));
      expect(label, estado).not.toMatch(/_/);
    }
  });

  it("todos se pueden filtrar por URL", () => {
    for (const estado of ESTADOS_EN_ORDEN) {
      expect(parseContractOperationalStatus(estado), estado).toBe(estado);
    }
  });

  it("cada contador apunta a un estado que existe en el filtro", () => {
    for (const [clave, def] of Object.entries(CONTADOR)) {
      expect(ESTADOS_EN_ORDEN, clave).toContain(def.filtro);
    }
  });

  it("quien dijo que no no es trabajo pendiente del operador", () => {
    // Si entrara en la cola, el cockpit mandaría a perseguir a quien ya contestó.
    expect(ESTADOS_EN_ORDEN).toContain("rechazado");
    expect(ACTION_REQUIRED_STATUSES).not.toContain("rechazado");
    expect(describeStatus("rechazado").label).toBe("Dijo que no");
  });
});

describe("queMandoLaPersona", () => {
  it("dice qué mandó en palabras del operador", () => {
    expect(queMandoLaPersona("text")).toBe("Escribió");
    expect(queMandoLaPersona("button")).toBe("Tocó un botón");
    expect(queMandoLaPersona("interactive")).toBe("Tocó un botón");
    expect(queMandoLaPersona("audio")).toBe("Mandó una nota de voz");
    expect(queMandoLaPersona("tipo_nuevo_de_meta")).toBe("Mandó un mensaje");
    expect(queMandoLaPersona(null)).toBe("Mandó un mensaje");
  });
});

/**
 * La lectura es lo que le dice al operador si tiene que hacer algo. Tiene que
 * existir para todo lo que el chatbot anota, y decirse sin jerga.
 */
describe("comoLoTomoElSistema", () => {
  const ANOTACIONES_DEL_CHATBOT = [
    "si",
    "si_texto",
    "no",
    "no_texto",
    "text_fallback",
    "unknown_button",
    "no_soportado:audio",
    "demasiado_viejo",
    "error",
  ];

  it("todo lo que anota el chatbot tiene lectura", () => {
    for (const anotacion of ANOTACIONES_DEL_CHATBOT) {
      expect(comoLoTomoElSistema(anotacion), anotacion).not.toBeNull();
    }
  });

  it("ninguna lectura usa jerga técnica", () => {
    for (const anotacion of ANOTACIONES_DEL_CHATBOT) {
      expect(comoLoTomoElSistema(anotacion)?.texto, anotacion).not.toMatch(
        /fallback|payload|kind|webhook|button|null|undefined/i,
      );
    }
  });

  it("lo que no se entendió pide atención; un SÍ o un NO ya se atendió solo", () => {
    expect(comoLoTomoElSistema("text_fallback")?.tono).toBe("attention");
    expect(comoLoTomoElSistema("no_soportado:image")?.tono).toBe("attention");
    expect(comoLoTomoElSistema("si")?.tono).toBe("done");
    expect(comoLoTomoElSistema("no_texto")?.tono).toBe("neutral");
  });

  it("sin anotación no inventa nada", () => {
    expect(comoLoTomoElSistema(null)).toBeNull();
    expect(comoLoTomoElSistema(undefined)).toBeNull();
    expect(comoLoTomoElSistema("algo_desconocido")).toBeNull();
  });
});
