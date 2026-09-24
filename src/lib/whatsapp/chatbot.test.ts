import { describe, it, expect } from "vitest";
import {
  classifyOfferReply,
  classifyTextReply,
  FALLBACK_MESSAGE,
  UNSUPPORTED_MESSAGE,
  UNKNOWN_NUMBER_MESSAGE,
  variantesDeTelefono,
  mensajeDemasiadoViejo,
  MAX_ANTIGUEDAD_MS,
  MAX_ANTIGUEDAD_RESPUESTA_MS,
  respuestaEsDeOtraOferta,
  VENTANA_OFERTA_MS,
  VENTANA_CERRADA_MESSAGE,
  extractButtonReply,
  siSuccessMessage,
  reenvioDeEnlaceMessage,
  noMessage,
  mensajeAntesDePedir,
  momentoDeLaRespuesta,
  SIN_OFERTA_ABIERTA_MESSAGE,
  VENTANA_SIN_VERIFICAR_MESSAGE,
  mensajeParaQuienYaPidio,
  ENLACE_VENCIDO_MESSAGE,
  CONTRATO_NO_PREPARADO_MESSAGE,
  SOLICITUD_EN_PROCESO_MESSAGE,
  type InboundMessage,
} from "./chatbot";
import { DURACION_DE_LA_VENTANA } from "@/lib/contracts/ventana-oferta";

describe("classifyOfferReply", () => {
  it("reconoce los textos de botón exactos", () => {
    expect(classifyOfferReply("Sí, lo quiero")).toBe("si");
    expect(classifyOfferReply("No, gracias")).toBe("no");
  });

  it("es tolerante a acentos y mayúsculas", () => {
    expect(classifyOfferReply("SI, LO QUIERO")).toBe("si");
    expect(classifyOfferReply("no, gracias")).toBe("no");
    expect(classifyOfferReply("Sí lo quiero")).toBe("si");
  });

  it("usa el payload si viene", () => {
    expect(classifyOfferReply(null, "SI_ADELANTO")).toBe("si");
    expect(classifyOfferReply(null, "NO_ADELANTO")).toBe("no");
  });

  it("no confunde 'No, gracias' con sí", () => {
    expect(classifyOfferReply("No, gracias")).not.toBe("si");
  });

  it("devuelve null para texto no reconocido", () => {
    expect(classifyOfferReply("hola")).toBeNull();
    expect(classifyOfferReply("cuánto es?")).toBeNull();
    expect(classifyOfferReply("")).toBeNull();
    expect(classifyOfferReply(undefined, undefined)).toBeNull();
  });
});

describe("extractButtonReply", () => {
  const base = { id: "wamid.1", from: "5218713330257" };

  it("extrae de un botón de plantilla (type button)", () => {
    const msg: InboundMessage = { ...base, type: "button", button: { text: "Sí, lo quiero", payload: "SI_ADELANTO" } };
    expect(extractButtonReply(msg)).toEqual({ text: "Sí, lo quiero", payload: "SI_ADELANTO" });
  });

  it("extrae de un mensaje interactivo (button_reply)", () => {
    const msg: InboundMessage = {
      ...base,
      type: "interactive",
      interactive: { type: "button_reply", button_reply: { id: "no_id", title: "No, gracias" } },
    };
    expect(extractButtonReply(msg)).toEqual({ text: "No, gracias", payload: "no_id" });
  });

  it("devuelve null para un mensaje de texto", () => {
    const msg: InboundMessage = { ...base, type: "text", text: { body: "hola" } };
    expect(extractButtonReply(msg)).toBeNull();
  });
});

describe("mensajes", () => {
  it("el mensaje de éxito incluye monto, link y el aviso de expiración", () => {
    const m = siSuccessMessage(
      "Angel",
      "$4,000.00",
      "https://easylex.com/documento/firma/sig-abc",
      "El enlace vence el 24 de septiembre de 2026, 2:46 p.m.",
    );
    expect(m).toContain("Angel");
    expect(m).toContain("$4,000.00");
    expect(m).toContain("vence");
    expect(m).toContain("https://easylex.com/documento/firma/sig-abc");
  });

  it("el mensaje de éxito funciona sin nombre", () => {
    const m = siSuccessMessage("", "$4,000.00", "https://x/y", "El enlace vence en 24 horas.");
    expect(m).toContain("¡Listo!");
    expect(m).not.toContain(", !");
  });

  it("el mensaje de reenvío dice que es el mismo enlace, no un contrato nuevo", () => {
    const m = reenvioDeEnlaceMessage(
      "Angel",
      "$4,000.00",
      "https://easylex.com/documento/firma/sig-abc",
      "El enlace vence el 24 de septiembre de 2026, 2:46 p.m.",
    );
    expect(m).toContain("Angel");
    expect(m).toContain("$4,000.00");
    expect(m).toContain("https://easylex.com/documento/firma/sig-abc");
    expect(m).toContain("de nuevo");
    // Lo que NO debe decir: es justo la confusión que esta función evita.
    expect(m).not.toContain("Generamos");
    expect(m).not.toContain("¡Listo");
  });

  it("el mensaje de reenvío funciona sin nombre", () => {
    const m = reenvioDeEnlaceMessage("", "$4,000.00", "https://x/y", "El enlace vence en 24 horas.");
    expect(m).not.toContain(", !");
    expect(m).not.toContain(", ,");
  });

  it("el mensaje de 'No' es corto y sin la línea de reconsideración", () => {
    const m = noMessage("Angel");
    expect(m).toContain("Gracias por confirmar, Angel");
    expect(m).not.toContain("cambias de opinión");
  });
});

/**
 * Respuestas ESCRITAS. Lo crítico aquí no es que reconozca "sí": es que NO
 * reconozca de más. Clasificar mal un "no sé" como rechazo le cancelaría el
 * adelanto a alguien que solo estaba dudando.
 */
describe("classifyTextReply", () => {
  it("acepta las formas comunes de decir que sí", () => {
    ["si", "Sí", "SI", "sí, lo quiero", "Si lo quiero", "acepto", "claro", "dale", "de acuerdo"]
      .forEach((t) => expect(classifyTextReply(t), t).toBe("si"));
  });

  it("acepta las formas comunes de decir que no", () => {
    ["no", "No", "no gracias", "No, gracias", "no quiero", "no me interesa", "ahora no"]
      .forEach((t) => expect(classifyTextReply(t), t).toBe("no"));
  });

  it("NO confunde la duda con un rechazo (el caso peligroso)", () => {
    ["no sé", "no se", "no entiendo", "no me llegó", "no puedo abrir el link", "no sé qué es esto"]
      .forEach((t) => expect(classifyTextReply(t), t).toBeNull());
  });

  it("NO confunde una pregunta con una aceptación", () => {
    ["si me lo dan cuándo lo pagan", "de cuánto es", "hola", "quien habla", "?"]
      .forEach((t) => expect(classifyTextReply(t), t).toBeNull());
  });

  it("ignora signos y espacios de más", () => {
    expect(classifyTextReply("  ¡Sí!  ")).toBe("si");
    expect(classifyTextReply("No, gracias.")).toBe("no");
  });

  it("devuelve null con texto vacío", () => {
    expect(classifyTextReply("")).toBeNull();
    expect(classifyTextReply(null)).toBeNull();
    expect(classifyTextReply(undefined)).toBeNull();
  });
});

/**
 * Nadie se queda sin respuesta. El chatbot atiende a gente con prisa desde el
 * celular: si manda una nota de voz o algo que no entendemos, el silencio la
 * deja sin saber si su mensaje llegó.
 */
describe("mensajes de la conversación", () => {
  it("el mensaje de ayuda ofrece AMBAS formas de responder (botón y escrito)", () => {
    expect(FALLBACK_MESSAGE).toMatch(/bot/i);   // menciona los botones
    expect(FALLBACK_MESSAGE).toMatch(/SÍ/);     // y que puede escribir
    expect(FALLBACK_MESSAGE).toMatch(/NO/);
  });

  it("hay respuesta para lo que no es texto (nota de voz, foto…)", () => {
    expect(UNSUPPORTED_MESSAGE).toMatch(/SÍ/);
    expect(UNSUPPORTED_MESSAGE).toMatch(/NO/);
    expect(UNSUPPORTED_MESSAGE.length).toBeGreaterThan(20);
  });

  it("hay respuesta para un número que no está registrado, y dice qué hacer", () => {
    expect(UNKNOWN_NUMBER_MESSAGE).toMatch(/empresa/i);
  });

  it("ningún mensaje al empleado usa jerga técnica", () => {
    const todos = [FALLBACK_MESSAGE, UNSUPPORTED_MESSAGE, UNKNOWN_NUMBER_MESSAGE];
    for (const m of todos) {
      expect(m).not.toMatch(/webhook|payload|null|undefined|error 4\d\d|API/i);
    }
  });
});

/**
 * Uno de cada tres empleados está guardado SIN el "1" de móvil mexicano, y
 * WhatsApp siempre manda CON el "1". Buscar por igualdad exacta los dejaba
 * fuera: respondían y el sistema decía no conocerlos.
 */
describe("variantesDeTelefono", () => {
  it("desde el formato de WhatsApp busca también el guardado sin el 1", () => {
    const v = variantesDeTelefono("5218713330257");
    expect(v).toContain("5218713330257");
    expect(v).toContain("528713330257");
  });

  it("desde el formato sin el 1 busca también el de WhatsApp", () => {
    const v = variantesDeTelefono("528713330257");
    expect(v).toContain("528713330257");
    expect(v).toContain("5218713330257");
  });

  it("los dos formatos del MISMO número producen el mismo par", () => {
    expect(new Set(variantesDeTelefono("5218713330257")))
      .toEqual(new Set(variantesDeTelefono("528713330257")));
  });

  it("no inventa variantes para números que no son de México", () => {
    const v = variantesDeTelefono("14155552671"); // Estados Unidos
    expect(v).toEqual(["14155552671"]);
  });

  it("tolera el número con signos o espacios", () => {
    expect(variantesDeTelefono("+52 1 871 333 0257")).toContain("5218713330257");
  });
});

/**
 * Meta reintenta la entrega cuando el webhook no responde, y se vieron entregas
 * con 4 y 7 horas de retraso tras un redespliegue. Actuar sobre un mensaje tan
 * viejo confunde a quien ya olvidó que escribió.
 *
 * El corte vale lo que la VENTANA para pedir. Fue de media hora mientras la
 * ventana duraba dos: entonces un "Sí" con cuatro horas de retraso llegaba
 * irremediablemente tarde. Con la ventana en un día, ese mismo corte tiraría en
 * silencio solicitudes que la ventana sí acepta, y la persona se quedaría sin
 * adelanto y sin respuesta. Quien decide el plazo es la ventana; esto solo
 * atrapa lo verdaderamente antiguo.
 */
describe("mensajeDemasiadoViejo", () => {
  const ahora = new Date("2026-09-07T12:00:00Z").getTime();
  const haceMinutos = (m: number) => String(Math.floor((ahora - m * 60_000) / 1000));

  it("atiende lo reciente", () => {
    expect(mensajeDemasiadoViejo(haceMinutos(0), ahora)).toBe(false);
    expect(mensajeDemasiadoViejo(haceMinutos(15), ahora)).toBe(false);
    expect(mensajeDemasiadoViejo(haceMinutos(29), ahora)).toBe(false);
  });

  it("descarta lo que rebasa la media hora, que es el corte por omisión", () => {
    expect(mensajeDemasiadoViejo(haceMinutos(31), ahora)).toBe(true);
    expect(mensajeDemasiadoViejo(haceMinutos(90), ahora)).toBe(true);
  });

  it("con el corte de RESPUESTA, los retrasos reales de Meta ya no se tiran", () => {
    // Los dos retrasos que de verdad se vieron en producción tras un
    // redespliegue. Con media hora se descartaban en silencio; para un "Sí" que
    // la ventana sí acepta, eso es dejar a alguien sin adelanto y sin respuesta.
    expect(mensajeDemasiadoViejo(haceMinutos(60 * 4), ahora, MAX_ANTIGUEDAD_RESPUESTA_MS)).toBe(false);
    expect(mensajeDemasiadoViejo(haceMinutos(60 * 7), ahora, MAX_ANTIGUEDAD_RESPUESTA_MS)).toBe(false);
  });

  it("ni con el corte largo se atiende lo que ya no cabe en la ventana", () => {
    expect(mensajeDemasiadoViejo(haceMinutos(60 * 24 + 1), ahora, MAX_ANTIGUEDAD_RESPUESTA_MS)).toBe(true);
    expect(mensajeDemasiadoViejo(haceMinutos(60 * 48), ahora, MAX_ANTIGUEDAD_RESPUESTA_MS)).toBe(true);
  });

  it("son dos cortes distintos, y el de respuesta es exactamente la ventana", () => {
    expect(MAX_ANTIGUEDAD_MS).toBe(30 * 60 * 1000);
    expect(MAX_ANTIGUEDAD_RESPUESTA_MS).toBe(VENTANA_OFERTA_MS);
    expect(MAX_ANTIGUEDAD_MS).toBeLessThan(MAX_ANTIGUEDAD_RESPUESTA_MS);
  });

  it("ante la duda, atiende: sin marca de tiempo o con una ilegible", () => {
    expect(mensajeDemasiadoViejo(undefined, ahora)).toBe(false);
    expect(mensajeDemasiadoViejo("no-es-un-numero", ahora)).toBe(false);
    expect(mensajeDemasiadoViejo("", ahora)).toBe(false);
  });

  it("un reloj adelantado no descarta el mensaje", () => {
    expect(mensajeDemasiadoViejo(String(Math.floor((ahora + 60_000) / 1000)), ahora)).toBe(false);
  });
});

/**
 * Reimportar el ciclo inserta una oferta NUEVA, casi siempre con otro monto. Un
 * "Sí" tocado contra la oferta vieja que Meta nos entrega tarde generaría un
 * contrato por una cantidad que la persona nunca vio. Con el corte de antigüedad
 * en media hora era casi imposible; con un día de tolerancia cabe un ciclo entero.
 */
describe("respuestaEsDeOtraOferta", () => {
  const oferta = "2026-09-24T16:00:00Z";
  const enHoras = (h: number) => Date.parse(oferta) + h * 60 * 60 * 1000;

  it("lo contestado antes de que existiera esta oferta no cuenta para ella", () => {
    expect(respuestaEsDeOtraOferta(oferta, enHoras(-1))).toBe(true);
    expect(respuestaEsDeOtraOferta(oferta, enHoras(-20))).toBe(true);
  });

  it("lo contestado después sí es de esta oferta", () => {
    expect(respuestaEsDeOtraOferta(oferta, enHoras(0))).toBe(false);
    expect(respuestaEsDeOtraOferta(oferta, enHoras(3))).toBe(false);
  });

  it("sin fecha de oferta no se bloquea a nadie: el dato que falta es nuestro", () => {
    expect(respuestaEsDeOtraOferta(null, enHoras(-5))).toBe(false);
    expect(respuestaEsDeOtraOferta(undefined, enHoras(-5))).toBe(false);
    expect(respuestaEsDeOtraOferta("no-es-fecha", enHoras(-5))).toBe(false);
  });
});

/**
 * La ventana la abre la EMPRESA al enviar la oferta. Fuera de ella el empleado no
 * puede pedir el adelanto por su cuenta: la idea del cliente es ofrecerlo cuando
 * él quiere, no dejarlo disponible de forma permanente.
 */
describe("ventana para pedir el adelanto", () => {
  it("dura un día", () => {
    expect(VENTANA_OFERTA_MS).toBe(24 * 60 * 60 * 1000);
  });

  it("el aviso de ventana cerrada no invita a pedirlo por su cuenta", () => {
    expect(VENTANA_CERRADA_MESSAGE).toMatch(/empresa/i);
    expect(VENTANA_CERRADA_MESSAGE).not.toMatch(/responde|escribe|toca/i);
  });

  it("el aviso explica el plazo sin jerga", () => {
    expect(VENTANA_CERRADA_MESSAGE).toContain(DURACION_DE_LA_VENTANA);
    expect(VENTANA_CERRADA_MESSAGE).not.toMatch(/webhook|token|API|null/i);
  });
});

/**
 * Quien quiere pedir y no puede tiene que oír la verdad sobre POR QUÉ. Decirle
 * "el plazo cerró" a quien nunca recibió una oferta lo manda a reclamar un
 * envío que no existió; y una caída nuestra no es un plazo vencido.
 */
describe("mensajeAntesDePedir", () => {
  it("con la ventana abierta no se contesta nada: sigue a generar el contrato", () => {
    expect(mensajeAntesDePedir("pedir")).toBeNull();
  });

  it("cada motivo tiene su propio mensaje", () => {
    expect(mensajeAntesDePedir("fuera_de_plazo")).toBe(VENTANA_CERRADA_MESSAGE);
    expect(mensajeAntesDePedir("sin_envio")).toBe(SIN_OFERTA_ABIERTA_MESSAGE);
    expect(mensajeAntesDePedir("error")).toBe(VENTANA_SIN_VERIFICAR_MESSAGE);
  });

  it("a quien nunca recibió la oferta no le habla de un plazo ni lo invita a insistir", () => {
    expect(SIN_OFERTA_ABIERTA_MESSAGE).not.toMatch(/plazo|cerr|venc/i);
    expect(SIN_OFERTA_ABIERTA_MESSAGE).toMatch(/empresa/i);
    expect(SIN_OFERTA_ABIERTA_MESSAGE).not.toMatch(/responde|escribe|toca/i);
  });

  it("una falla nuestra no se disfraza de plazo vencido ni usa jerga", () => {
    expect(VENTANA_SIN_VERIFICAR_MESSAGE).not.toMatch(/plazo|cerr/i);
    expect(VENTANA_SIN_VERIFICAR_MESSAGE).not.toMatch(/webhook|token|API|null|error/i);
  });
});

/**
 * La ventana se mide contra el momento en que la persona contestó. Meta
 * reintenta los webhooks, y un "Sí" dado a tiempo no debe llegar tarde por eso.
 */
describe("momentoDeLaRespuesta", () => {
  const ahora = new Date("2026-09-07T12:00:00Z").getTime();

  it("usa la hora en que la persona contestó, no la de procesarlo", () => {
    const hace20 = ahora - 20 * 60_000;
    expect(momentoDeLaRespuesta(String(hace20 / 1000), ahora)).toBe(hace20);
  });

  it("nunca una hora en el futuro", () => {
    expect(momentoDeLaRespuesta(String((ahora + 60 * 60_000) / 1000), ahora)).toBe(ahora);
  });

  it("sin marca de tiempo legible, ahora", () => {
    expect(momentoDeLaRespuesta(undefined, ahora)).toBe(ahora);
    expect(momentoDeLaRespuesta("no-es-un-numero", ahora)).toBe(ahora);
    expect(momentoDeLaRespuesta("", ahora)).toBe(ahora);
  });
});

/**
 * A quien ya pidió no se le genera otro contrato fuera de plazo, pero se le dice
 * lo cierto. El caso que motivó esto: a quien se le cayó el contrato se le
 * contestaba "revisa el mensaje anterior con tu enlace", un enlace que nunca tuvo.
 */
describe("mensajeParaQuienYaPidio", () => {
  const todos = () => [
    mensajeParaQuienYaPidio("enlace_vencido", "Angel"),
    mensajeParaQuienYaPidio("fallo", "Angel"),
    mensajeParaQuienYaPidio("en_proceso", "Angel"),
    mensajeParaQuienYaPidio("sin_verificar", "Angel"),
  ];

  it("cada situación tiene su mensaje", () => {
    expect(mensajeParaQuienYaPidio("enlace_vencido", "Angel")).toBe(ENLACE_VENCIDO_MESSAGE);
    expect(mensajeParaQuienYaPidio("fallo", "Angel")).toBe(CONTRATO_NO_PREPARADO_MESSAGE);
    expect(mensajeParaQuienYaPidio("sin_verificar", "Angel")).toBe(VENTANA_SIN_VERIFICAR_MESSAGE);
    expect(mensajeParaQuienYaPidio("en_proceso", "Angel")).toBe(SOLICITUD_EN_PROCESO_MESSAGE("Angel"));
  });

  it("a quien se le cayó el contrato no le promete ningún enlace", () => {
    expect(CONTRATO_NO_PREPARADO_MESSAGE).not.toMatch(/enlace/i);
    expect(CONTRATO_NO_PREPARADO_MESSAGE).toMatch(/empresa/i);
  });

  it("ninguno manda a buscar un mensaje anterior", () => {
    for (const mensaje of todos()) expect(mensaje).not.toMatch(/mensaje anterior/i);
  });

  it("solo la falla nuestra invita a intentar de nuevo", () => {
    expect(ENLACE_VENCIDO_MESSAGE).not.toMatch(/responde|escribe|toca|intenta|inténtalo/i);
    expect(CONTRATO_NO_PREPARADO_MESSAGE).not.toMatch(/responde|escribe|toca|intenta|inténtalo/i);
    expect(SOLICITUD_EN_PROCESO_MESSAGE("Angel")).not.toMatch(/responde|escribe|toca|intenta|inténtalo/i);
  });
});
