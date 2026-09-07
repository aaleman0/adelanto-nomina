import { describe, it, expect } from "vitest";
import { describeTemplateShape } from "./message-builder";
import { buildBulkTemplateMessage, DEFAULT_BULK_TEMPLATE } from "./message-builder";
import type { BulkRecipient } from "./message-builder";

const base: BulkRecipient = {
  employee_id: "00000000-0000-0000-0000-000000000000",
  nombre: "Juan",
  empleador: "LOZAV",
  rfc: "AAAA000000AAA",
  telefono_normalizado: "5218180188991",
  monto_prestamo_autorizado: 5000,
};

describe("buildBulkTemplateMessage", () => {
  it("construye la plantilla v2 con 3 variables", () => {
    const result = buildBulkTemplateMessage(base, DEFAULT_BULK_TEMPLATE);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.variables).toEqual({ "1": "Juan", "2": "LOZAV", "3": "5,000" });
    expect(result.to).toBe("5218180188991");
  });

  it("construye la plantilla legada con solo 2 variables", () => {
    const result = buildBulkTemplateMessage(base, "adelanto_nomina");
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.variables).toEqual({ "1": "Juan", "2": "5,000" });
  });

  it("falla cuando no hay teléfono utilizable", () => {
    const result = buildBulkTemplateMessage({ ...base, telefono_normalizado: null });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/tel/i);
  });

  it("usa valores de respaldo cuando faltan nombre y empleador", () => {
    const result = buildBulkTemplateMessage({ ...base, nombre: null, empleador: null });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.variables["1"]).toBe("Empleado");
    expect(result.variables["2"]).toBe("Tu empresa");
  });

  it("muestra N/A cuando no hay monto", () => {
    const result = buildBulkTemplateMessage({ ...base, monto_prestamo_autorizado: null });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.variables["3"]).toBe("N/A");
  });

  it("añade la cabecera de imagen en las plantillas que la declaran", () => {
    const conImagen = buildBulkTemplateMessage(base, DEFAULT_BULK_TEMPLATE, {
      headerImageUrl: "https://cdn.example.com/x.png",
    });
    expect(conImagen.ok).toBe(true);
    if (!conImagen.ok) return;
    expect(conImagen.components[0].type).toBe("header");

    const v3 = buildBulkTemplateMessage(base, "adelanto_nomina_v3", {
      headerImageUrl: "https://cdn.example.com/x.png",
    });
    expect(v3.ok).toBe(true);
    if (!v3.ok) return;
    expect(v3.components[0].type).toBe("header");

    // En la plantilla legada la cabecera no está declarada: enviarla haría que
    // Meta rechazara el mensaje.
    const legada = buildBulkTemplateMessage(base, "adelanto_nomina", {
      headerImageUrl: "https://cdn.example.com/x.png",
    });
    expect(legada.ok).toBe(true);
    if (!legada.ok) return;
    expect(legada.components.some((c) => c.type === "header")).toBe(false);
  });

  it("omite la cabecera si no hay URL configurada", () => {
    const result = buildBulkTemplateMessage(base, DEFAULT_BULK_TEMPLATE, { headerImageUrl: null });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.components).toHaveLength(1);
    expect(result.components[0].type).toBe("body");
  });

  it("añade el parámetro del botón URL usando solo el sufijo del link", () => {
    const result = buildBulkTemplateMessage(base, DEFAULT_BULK_TEMPLATE, {
      buttonUrl: "https://adelanto-nomina.com/firmar/sig-test-123",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.components.at(-1)).toEqual({
      type: "button",
      sub_type: "url",
      index: "0",
      parameters: [{ type: "text", text: "sig-test-123" }],
    });
  });

  it("produce el mismo mensaje para el envío inline y para el worker", () => {
    // Es la razón de existir del módulo: ambos caminos comparten esta función,
    // así que un cambio de formato no puede divergir entre uno y otro.
    const a = buildBulkTemplateMessage(base, DEFAULT_BULK_TEMPLATE, { headerImageUrl: "https://x/y.png" });
    const b = buildBulkTemplateMessage({ ...base }, DEFAULT_BULK_TEMPLATE, { headerImageUrl: "https://x/y.png" });
    expect(a).toEqual(b);
  });
});

/**
 * Forma de la plantilla. Meta valida el payload contra la definición aprobada,
 * así que mandar un componente de más (o de menos) tumba el mensaje entero.
 * Estas pruebas fijan el caso del chatbot: plantilla de RESPUESTA RÁPIDA, que
 * NO acepta botón de URL.
 */
describe("describeTemplateShape", () => {
  const chatbot = [
    { type: "HEADER" as const, format: "IMAGE" },
    { type: "BODY" as const, text: "Hola {{1}}, en {{2}} tienes {{3}} MXN." },
    {
      type: "BUTTONS" as const,
      buttons: [
        { type: "QUICK_REPLY", text: "Sí, lo quiero" },
        { type: "QUICK_REPLY", text: "No, gracias" },
      ],
    },
  ];

  const conBotonUrl = [
    { type: "BODY" as const, text: "Hola {{1}}, tu adelanto de {{2}}." },
    { type: "BUTTONS" as const, buttons: [{ type: "URL", text: "Ver", url: "https://x/{{1}}" }] },
  ];

  it("lee la plantilla del chatbot: imagen, 3 variables y SIN botón de URL", () => {
    const forma = describeTemplateShape(chatbot);
    expect(forma).toEqual({ hasImageHeader: true, hasUrlButton: false, bodyVariables: 3 });
  });

  it("detecta el botón de URL cuando la plantilla sí lo declara", () => {
    const forma = describeTemplateShape(conBotonUrl);
    expect(forma.hasUrlButton).toBe(true);
    expect(forma.hasImageHeader).toBe(false);
    expect(forma.bodyVariables).toBe(2);
  });

  it("sin componentes devuelve una forma vacía en vez de reventar", () => {
    expect(describeTemplateShape(null)).toEqual({
      hasImageHeader: false,
      hasUrlButton: false,
      bodyVariables: 0,
    });
  });

  it("cuenta la variable más alta, no las repeticiones", () => {
    const forma = describeTemplateShape([{ type: "BODY", text: "{{1}} y otra vez {{1}} y {{2}}" }]);
    expect(forma.bodyVariables).toBe(2);
  });
});

describe("buildBulkTemplateMessage con forma de plantilla", () => {
  const empleado = {
    employee_id: "e1",
    nombre: "Angel",
    empleador: "Orbitware",
    rfc: "AEEA940214H78",
    telefono_normalizado: "5218713330257",
    monto_prestamo_autorizado: 4000,
  };

  const formaChatbot = { hasImageHeader: true, hasUrlButton: false, bodyVariables: 3 };

  it("NO adjunta botón de URL a una plantilla de respuesta rápida, aunque le pasen un link", () => {
    const r = buildBulkTemplateMessage(empleado, "adelanto_nomina_oferta", {
      buttonUrl: "https://ejemplo.com/solicitar/token123",
      shape: formaChatbot,
    });
    if (!r.ok) throw new Error(r.error);
    expect(r.components.some((c) => c.type === "button")).toBe(false);
  });

  it("sí adjunta la cabecera de imagen si la plantilla la declara, sin importar su nombre", () => {
    const r = buildBulkTemplateMessage(empleado, "nombre_que_no_esta_en_ninguna_lista", {
      headerImageUrl: "https://ejemplo.com/portada.png",
      shape: formaChatbot,
    });
    if (!r.ok) throw new Error(r.error);
    expect(r.components[0].type).toBe("header");
  });

  it("manda exactamente las variables que declara la plantilla", () => {
    const dos = buildBulkTemplateMessage(empleado, "cualquiera", {
      shape: { hasImageHeader: false, hasUrlButton: false, bodyVariables: 2 },
    });
    if (!dos.ok) throw new Error(dos.error);
    expect(dos.variables).toEqual({ "1": "Angel", "2": "4,000" });

    const tres = buildBulkTemplateMessage(empleado, "cualquiera", { shape: formaChatbot });
    if (!tres.ok) throw new Error(tres.error);
    expect(tres.variables).toEqual({ "1": "Angel", "2": "Orbitware", "3": "4,000" });
  });
});
