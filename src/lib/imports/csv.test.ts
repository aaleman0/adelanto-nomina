import { describe, it, expect } from "vitest";
import { prepareCsvImport, REQUIRED_COLUMNS } from "./csv";

/**
 * Una fila válida de referencia. Cada test parte de esto y cambia solo lo que
 * quiere ejercitar, para que el caso se lea de un vistazo.
 */
const VALID_ROW: Record<string, string> = {
  Nombre: "Juana",
  "Apellido Paterno": "Pérez",
  "Apellido Materno": "López",
  "Monto Prestamo Autorizado": "$12,500.50",
  Empleador: "ACME SA",
  Clabe: "012345678901234567",
  Banco: "BBVA",
  CURP: "PELJ900101MDFRPN08",
  RFC: "PELJ900101AB1",
  "CP según CSF": "01000",
  "Teléfono": "8180188991",
  Email: "Juana@Example.com",
  "Estado Civil": "Soltera",
  Nacionalidad: "Mexicana",
  "Lugar de Origen": "CDMX",
  "Fecha de Nacimiento": "01/01/1990",
  Domicilio: "Calle Falsa 123",
  "Estatus Conversión": "Aceptada",
};

/**
 * Serializa filas a CSV. Los valores se leen siempre por la clave canónica
 * (`dataKeys`), mientras que la línea de encabezado puede usar etiquetas
 * distintas (`headerLabels`) para ejercitar los alias sin perder los datos.
 */
function toCsv(
  rows: Array<Record<string, string>>,
  headerLabels: string[] = [...REQUIRED_COLUMNS],
  dataKeys: string[] = [...REQUIRED_COLUMNS],
): string {
  const escape = (value: string) => (/[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);
  const headerLine = headerLabels.map(escape).join(",");
  const dataLines = rows.map((row) => dataKeys.map((k) => escape(row[k] ?? "")).join(","));
  return [headerLine, ...dataLines].join("\n");
}

/** Atajo para preparar un CSV de una sola fila y devolver esa fila. */
function prepareOne(overrides: Record<string, string>) {
  const result = prepareCsvImport(toCsv([{ ...VALID_ROW, ...overrides }]));
  return result.rows[0];
}

describe("prepareCsvImport — fila válida de referencia", () => {
  it("marca la fila como válida sin errores", () => {
    const row = prepareOne({});
    expect(row.status).toBe("valida");
    expect(row.errors).toEqual([]);
  });

  it("numera las filas empezando en 2 (la 1 es el encabezado)", () => {
    const row = prepareOne({});
    expect(row.row_number).toBe(2);
  });

  it("resume el conteo", () => {
    const result = prepareCsvImport(toCsv([VALID_ROW, VALID_ROW]));
    // La segunda es RFC duplicado, así que 1 válida + 1 duplicada.
    expect(result.summary.totalRows).toBe(2);
    expect(result.summary.validRows).toBe(1);
    expect(result.summary.duplicateRows).toBe(1);
  });
});

describe("prepareCsvImport — encabezados", () => {
  it("reporta las columnas requeridas ausentes", () => {
    const present = REQUIRED_COLUMNS.filter((c) => c !== "RFC" && c !== "Clabe");
    // Encabezados y datos comparten la misma lista recortada, para no desalinear.
    const result = prepareCsvImport(toCsv([VALID_ROW], [...present], [...present]));
    expect(result.missingColumns).toContain("RFC");
    expect(result.missingColumns).toContain("Clabe");
  });

  it("acepta alias de encabezado sin acentos y en minúsculas", () => {
    const labels = [...REQUIRED_COLUMNS].map((h) =>
      h === "Teléfono" ? "telefono" : h === "Estatus Conversión" ? "estatus conversion" : h,
    );
    const result = prepareCsvImport(toCsv([VALID_ROW], labels));
    // Si los alias no resolvieran, faltarían columnas y la fila sería inválida.
    expect(result.missingColumns).toEqual([]);
    expect(result.rows[0].status).toBe("valida");
  });

  it("no marca ausente una columna presente por su alias", () => {
    const labels = [...REQUIRED_COLUMNS].map((h) => (h === "CP según CSF" ? "cp segun csf" : h));
    const result = prepareCsvImport(toCsv([VALID_ROW], labels));
    expect(result.missingColumns).not.toContain("CP según CSF");
  });
});

describe("prepareCsvImport — validación de RFC", () => {
  it("marca inválida la fila sin RFC", () => {
    const row = prepareOne({ RFC: "" });
    expect(row.status).toBe("invalida");
    expect(row.errors).toContain("RFC requerido.");
  });

  it("rechaza un RFC con formato incorrecto", () => {
    const row = prepareOne({ RFC: "NO-ES-RFC" });
    expect(row.errors).toContain("RFC con formato inválido.");
  });

  it("normaliza el RFC a mayúsculas", () => {
    const row = prepareOne({ RFC: "pelj900101ab1" });
    expect(row.rfc).toBe("PELJ900101AB1");
    expect(row.status).toBe("valida");
  });
});

describe("prepareCsvImport — teléfono", () => {
  it("normaliza un teléfono de 10 dígitos al formato mexicano", () => {
    const row = prepareOne({ "Teléfono": "8180188991" });
    expect(row.telefono_normalizado).toBe("5218180188991");
  });

  it("marca inválida la fila sin teléfono", () => {
    const row = prepareOne({ "Teléfono": "" });
    expect(row.errors).toContain("Teléfono requerido o no normalizable.");
  });
});

describe("prepareCsvImport — CLABE", () => {
  it("exige CLABE", () => {
    const row = prepareOne({ Clabe: "" });
    expect(row.errors).toContain("CLABE requerida.");
  });

  it("exige exactamente 18 dígitos", () => {
    const row = prepareOne({ Clabe: "12345" });
    expect(row.errors).toContain("CLABE debe tener 18 dígitos.");
  });

  it("extrae los últimos 4 dígitos", () => {
    const row = prepareOne({ Clabe: "012345678901234567" });
    expect(row.clabe_last4).toBe("4567");
  });

  it("limpia separadores no numéricos antes de validar", () => {
    const row = prepareOne({ Clabe: "0123 4567 8901 2345 67" });
    expect(row.status).toBe("valida");
    expect(row.clabe_last4).toBe("4567");
  });
});

describe("prepareCsvImport — monto y elegibilidad", () => {
  it("deriva is_eligible del estatus de conversión", () => {
    expect(prepareOne({ "Estatus Conversión": "Aceptada" }).normalized_payload.is_eligible).toBe(true);
    expect(prepareOne({ "Estatus Conversión": "convertido" }).normalized_payload.is_eligible).toBe(true);
    expect(prepareOne({ "Estatus Conversión": "Rechazada" }).normalized_payload.is_eligible).toBe(false);
  });

  it("normaliza el monto quitando símbolo y comas", () => {
    const row = prepareOne({ "Monto Prestamo Autorizado": "$12,500.50" });
    expect(row.normalized_payload.monto_prestamo_autorizado).toBe(12500.5);
  });

  it("exige monto positivo solo en filas elegibles", () => {
    // Elegible sin monto → error.
    const eligible = prepareOne({ "Estatus Conversión": "Aceptada", "Monto Prestamo Autorizado": "" });
    expect(eligible.errors).toContain("Monto Prestamo Autorizado requerido para filas elegibles.");

    // No elegible sin monto → sin ese error.
    const notEligible = prepareOne({ "Estatus Conversión": "Rechazada", "Monto Prestamo Autorizado": "" });
    expect(notEligible.errors).not.toContain("Monto Prestamo Autorizado requerido para filas elegibles.");
  });

  it("rechaza un monto de cero o negativo en filas elegibles", () => {
    expect(prepareOne({ "Monto Prestamo Autorizado": "0" }).errors)
      .toContain("Monto Prestamo Autorizado debe ser mayor a cero.");
  });
});

describe("prepareCsvImport — duplicados dentro del archivo", () => {
  it("marca como duplicada la segunda aparición del mismo RFC", () => {
    const result = prepareCsvImport(toCsv([VALID_ROW, VALID_ROW]));
    expect(result.rows[0].status).toBe("valida");
    expect(result.rows[1].status).toBe("duplicada");
    expect(result.rows[1].errors[0]).toContain("primera aparición en fila 2");
  });

  it("un RFC duplicado prevalece como estado 'duplicada' aunque haya otros errores", () => {
    // La segunda fila es duplicada y además tiene CLABE inválida: debe quedar
    // clasificada como duplicada, no como inválida.
    const result = prepareCsvImport(toCsv([VALID_ROW, { ...VALID_ROW, Clabe: "123" }]));
    expect(result.rows[1].status).toBe("duplicada");
  });
});

describe("prepareCsvImport — CURP", () => {
  it("avisa pero no invalida por una CURP con formato inesperado", () => {
    const row = prepareOne({ CURP: "FORMATO-RARO" });
    expect(row.warnings).toContain("CURP con formato no esperado.");
    // El warning no cambia el estado.
    expect(row.status).toBe("valida");
  });
});

describe("prepareCsvImport — fechas", () => {
  it("convierte DD/MM/YYYY a ISO", () => {
    expect(prepareOne({ "Fecha de Nacimiento": "05/03/1990" }).normalized_payload.fecha_nacimiento).toBe("1990-03-05");
  });

  it("deja intacta una fecha ya en ISO", () => {
    expect(prepareOne({ "Fecha de Nacimiento": "1990-03-05" }).normalized_payload.fecha_nacimiento).toBe("1990-03-05");
  });

  it("deja pasar sin romper una fecha con mes fuera de rango", () => {
    // No convierte, pero tampoco lanza: devuelve el valor original.
    expect(prepareOne({ "Fecha de Nacimiento": "05/13/1990" }).normalized_payload.fecha_nacimiento).toBe("05/13/1990");
  });
});

describe("prepareCsvImport — hash y normalizaciones varias", () => {
  it("normaliza el email a minúsculas", () => {
    expect(prepareOne({ Email: "Juana@Example.com" }).normalized_payload.email).toBe("juana@example.com");
  });

  it("dos filas con datos idénticos producen el mismo row_hash", () => {
    const a = prepareCsvImport(toCsv([VALID_ROW])).rows[0];
    const b = prepareCsvImport(toCsv([VALID_ROW])).rows[0];
    expect(a.row_hash).toBe(b.row_hash);
  });

  it("un cambio en cualquier campo cambia el row_hash", () => {
    const a = prepareCsvImport(toCsv([VALID_ROW])).rows[0];
    const b = prepareOne({ Nombre: "Otra" });
    expect(a.row_hash).not.toBe(b.row_hash);
  });
});

describe("prepareCsvImport — archivo vacío", () => {
  it("devuelve cero filas cuando solo hay encabezado", () => {
    const result = prepareCsvImport(toCsv([]));
    expect(result.rows).toEqual([]);
    expect(result.summary.totalRows).toBe(0);
  });
});
