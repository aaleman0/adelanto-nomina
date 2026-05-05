import { createHash } from "node:crypto";
import { parse } from "csv-parse/sync";

export const REQUIRED_COLUMNS = [
  "Nombre",
  "Apellidos",
  "Monto Prestamo Autorizado",
  "Empleador",
  "Clabe",
  "Banco",
  "CURP",
  "RFC",
  "CP según CSF",
  "Teléfono",
  "Email",
  "Estatus P/ esta Q",
  "Estatus Conversión",
  "Estatus de Cleinte",
] as const;

type RequiredColumn = (typeof REQUIRED_COLUMNS)[number];

type ParsedCsvRecord = Record<RequiredColumn, string> & Record<string, string>;

type RowStatus = "valida" | "invalida" | "duplicada";

const ELIGIBLE_CONVERSION_STATUSES = new Set(["aceptada", "convertido"]);

export type PreparedImportRow = {
  row_number: number;
  raw_payload: Record<string, string>;
  normalized_payload: Record<string, string | number | boolean | null>;
  row_hash: string;
  rfc: string | null;
  telefono_normalizado: string | null;
  clabe_last4: string | null;
  status: RowStatus;
  errors: string[];
  warnings: string[];
};

export type PreparedImport = {
  rows: PreparedImportRow[];
  missingColumns: string[];
  summary: {
    totalRows: number;
    validRows: number;
    invalidRows: number;
    duplicateRows: number;
  };
};

const HEADER_ALIASES = new Map<string, RequiredColumn>([
  ["nombre", "Nombre"],
  ["apellidos", "Apellidos"],
  ["monto prestamo autorizado", "Monto Prestamo Autorizado"],
  ["monto préstamo autorizado", "Monto Prestamo Autorizado"],
  ["empleador", "Empleador"],
  ["clabe", "Clabe"],
  ["banco", "Banco"],
  ["curp", "CURP"],
  ["rfc", "RFC"],
  ["cp según csf", "CP según CSF"],
  ["cp segun csf", "CP según CSF"],
  ["teléfono", "Teléfono"],
  ["telefono", "Teléfono"],
  ["email", "Email"],
  ["estatus p/ esta q", "Estatus P/ esta Q"],
  ["estatus conversión", "Estatus Conversión"],
  ["estatus conversion", "Estatus Conversión"],
  ["estatus de cleinte", "Estatus de Cleinte"],
  ["estatus de cliente", "Estatus de Cleinte"],
]);

export function prepareCsvImport(csvText: string): PreparedImport {
  const seenRfcs = new Map<string, number>();
  let normalizedHeaders: string[] = [];

  const records = parse(csvText, {
    bom: true,
    columns: (headers: string[]) => {
      normalizedHeaders = headers.map((header) => normalizeHeaderName(header));
      return normalizedHeaders;
    },
    skip_empty_lines: true,
    trim: true,
  }) as ParsedCsvRecord[];

  const missingColumns = REQUIRED_COLUMNS.filter(
    (column) => !normalizedHeaders.includes(column),
  );

  const rows = records.map((record, index) => {
    const rowNumber = index + 2;
    const normalized = normalizeRecord(record);
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!normalized.rfc) {
      errors.push("RFC requerido.");
    } else if (!/^[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3}$/.test(normalized.rfc)) {
      errors.push("RFC con formato inválido.");
    }

    if (!normalized.telefono_normalizado) {
      errors.push("Teléfono requerido o no normalizable.");
    }

    if (!normalized.clabe) {
      errors.push("CLABE requerida.");
    } else if (!/^[0-9]{18}$/.test(normalized.clabe)) {
      errors.push("CLABE debe tener 18 dígitos.");
    }

    if (!normalized.empleador) {
      errors.push("Empleador requerido.");
    }

    if (!normalized.estatus_conversion) {
      errors.push("Estatus Conversión requerido.");
    }

    if (normalized.is_eligible) {
      if (normalized.monto_prestamo_autorizado === null) {
        errors.push("Monto Prestamo Autorizado requerido para filas elegibles.");
      } else if (normalized.monto_prestamo_autorizado <= 0) {
        errors.push("Monto Prestamo Autorizado debe ser mayor a cero.");
      }
    }

    if (normalized.curp && !/^[A-Z][AEIOUX][A-Z]{2}[0-9]{6}[HM][A-Z]{5}[A-Z0-9][0-9]$/.test(normalized.curp)) {
      warnings.push("CURP con formato no esperado.");
    }

    const firstRfcRow = normalized.rfc ? seenRfcs.get(normalized.rfc) : undefined;
    if (normalized.rfc && firstRfcRow) {
      errors.push(`RFC duplicado en el archivo; primera aparición en fila ${firstRfcRow}.`);
    } else if (normalized.rfc) {
      seenRfcs.set(normalized.rfc, rowNumber);
    }

    const status: RowStatus =
      errors.some((error) => error.includes("duplicado"))
        ? "duplicada"
        : errors.length > 0
          ? "invalida"
          : "valida";

    return {
      row_number: rowNumber,
      raw_payload: record,
      normalized_payload: normalized,
      row_hash: hashJson(normalized),
      rfc: normalized.rfc,
      telefono_normalizado: normalized.telefono_normalizado,
      clabe_last4: normalized.clabe ? normalized.clabe.slice(-4) : null,
      status,
      errors,
      warnings,
    };
  });

  const validRows = rows.filter((row) => row.status === "valida").length;
  const duplicateRows = rows.filter((row) => row.status === "duplicada").length;
  const invalidRows = rows.filter((row) => row.status === "invalida").length;

  return {
    rows,
    missingColumns,
    summary: {
      totalRows: rows.length,
      validRows,
      invalidRows,
      duplicateRows,
    },
  };
}

function normalizeHeaderName(header: string) {
  const compact = header.trim().replace(/\s+/g, " ").toLowerCase();
  return HEADER_ALIASES.get(compact) ?? header.trim().replace(/\s+/g, " ");
}

function normalizeRecord(record: ParsedCsvRecord) {
  const rfc = cleanUpper(record.RFC);
  const curp = cleanUpper(record.CURP);
  const clabe = onlyDigits(record.Clabe);
  const telefono = record["Teléfono"]?.trim() ?? "";
  const estatusConversion = normalizeStatus(record["Estatus Conversión"]);
  const monto = normalizeMoney(record["Monto Prestamo Autorizado"]);

  return {
    nombre: record.Nombre?.trim() ?? "",
    apellidos: record.Apellidos?.trim() ?? "",
    monto_prestamo_autorizado: monto,
    empleador: record.Empleador?.trim() ?? "",
    clabe,
    banco: record.Banco?.trim() ?? "",
    curp,
    rfc,
    cp_csf: onlyDigits(record["CP según CSF"]),
    telefono,
    telefono_normalizado: normalizePhone(telefono),
    email: record.Email?.trim().toLowerCase() || null,
    estatus_p_esta_q: record["Estatus P/ esta Q"]?.trim() ?? "",
    estatus_conversion: estatusConversion,
    estatus_cliente: record["Estatus de Cleinte"]?.trim() ?? "",
    is_eligible: ELIGIBLE_CONVERSION_STATUSES.has(estatusConversion),
  };
}

function cleanUpper(value: string | undefined) {
  return value?.trim().toUpperCase() || null;
}

function onlyDigits(value: string | undefined) {
  const digits = value?.replace(/\D/g, "") ?? "";
  return digits || null;
}

function normalizePhone(value: string | undefined) {
  const digits = onlyDigits(value);

  if (!digits) {
    return null;
  }

  if (digits.length === 10) {
    return `52${digits}`;
  }

  if (digits.length === 12 && digits.startsWith("52")) {
    return digits;
  }

  return digits.length >= 10 && digits.length <= 15 ? digits : null;
}

function normalizeMoney(value: string | undefined) {
  if (!value?.trim()) {
    return null;
  }

  const normalized = value.replace(/[$,\s]/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? Number(parsed.toFixed(2)) : null;
}

function normalizeStatus(value: string | undefined) {
  const normalized = value
    ?.trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  if (normalized === "aceptada") {
    return "aceptada";
  }

  if (normalized === "rechazada") {
    return "rechazada";
  }

  return normalized || "";
}

function hashJson(value: unknown) {
  return createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex");
}
