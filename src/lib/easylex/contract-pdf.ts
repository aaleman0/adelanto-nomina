import { PDFDocument } from "pdf-lib";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { CompanySettings } from "@/lib/company-settings";

/* ─── Types ─── */

export type ContractData = {
  nombreCompleto: string;
  apellidoPaterno: string;
  apellidoMaterno: string;
  rfc: string;
  curp: string | null;
  email: string | null;
  empleador: string;
  monto: number;
  clabe: string | null;
  banco: string | null;
  estadoCivil: string | null;
  nacionalidad: string | null;
  lugarOrigen: string | null;
  fechaNacimiento: string | null;
  domicilio: string | null;
  fechaFirma: Date;
  companySettings: CompanySettings;
};

/* ─── Helpers ─── */

function montoEnLetra(monto: number): string {
  const unidades = ["", "UN", "DOS", "TRES", "CUATRO", "CINCO", "SEIS", "SIETE", "OCHO", "NUEVE"];
  const decenas = ["", "DIEZ", "VEINTE", "TREINTA", "CUARENTA", "CINCUENTA", "SESENTA", "SETENTA", "OCHENTA", "NOVENTA"];
  const especiales: Record<number, string> = {
    11: "ONCE", 12: "DOCE", 13: "TRECE", 14: "CATORCE", 15: "QUINCE",
    16: "DIECISÉIS", 17: "DIECISIETE", 18: "DIECIOCHO", 19: "DIECINUEVE",
    21: "VEINTIÚN", 22: "VEINTIDÓS", 23: "VEINTITRÉS", 24: "VEINTICUATRO",
    25: "VEINTICINCO", 26: "VEINTISÉIS", 27: "VEINTISIETE", 28: "VEINTIOCHO", 29: "VEINTINUEVE",
  };
  const centenas = ["", "CIENTO", "DOSCIENTOS", "TRESCIENTOS", "CUATROCIENTOS", "QUINIENTOS", "SEISCIENTOS", "SETECIENTOS", "OCHOCIENTOS", "NOVECIENTOS"];

  const n = Math.floor(monto);
  if (n === 0) return "CERO";
  if (n === 100) return "CIEN";

  function convertGroup(num: number): string {
    if (num === 0) return "";
    if (num === 100) return "CIEN";
    if (num < 10) return unidades[num];
    if (especiales[num]) return especiales[num];
    if (num < 100) {
      const d = Math.floor(num / 10);
      const u = num % 10;
      return u === 0 ? decenas[d] : `${decenas[d]} Y ${unidades[u]}`;
    }
    const c = Math.floor(num / 100);
    const rest = num % 100;
    if (rest === 0) return centenas[c];
    return `${centenas[c]} ${convertGroup(rest)}`;
  }

  if (n < 1000) return convertGroup(n);

  const miles = Math.floor(n / 1000);
  const resto = n % 1000;

  let result = "";
  if (miles === 1) {
    result = "MIL";
  } else if (miles < 1000) {
    result = `${convertGroup(miles)} MIL`;
  }

  if (resto > 0) {
    result += ` ${convertGroup(resto)}`;
  }

  return result.trim();
}

function formatDate(date: Date): { dia: string; mes: string; anio: string } {
  const meses = [
    "enero", "febrero", "marzo", "abril", "mayo", "junio",
    "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
  ];
  return {
    dia: date.getDate().toString(),
    mes: meses[date.getMonth()],
    anio: date.getFullYear().toString(),
  };
}

function formatMonto(monto: number): string {
  return new Intl.NumberFormat("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(monto);
}

/* ─── Template path ─── */

const TEMPLATE_PATH = join(
  process.cwd(),
  "src",
  "lib",
  "easylex",
  "templates",
  "contrato-prestamo.pdf",
);

/* ─── PDF generation ─── */

export async function generateContractPdf(data: ContractData): Promise<Buffer> {
  const templateBytes = await readFile(TEMPLATE_PATH);
  const pdfDoc = await PDFDocument.load(templateBytes);

  const form = pdfDoc.getForm();
  const { dia, mes, anio } = formatDate(data.fechaFirma);
  const montoNum = formatMonto(data.monto);
  const montoLetra = montoEnLetra(data.monto);
  const cs = data.companySettings;

  const fieldValues: Record<string, string> = {
    nombre_completo_1: data.nombreCompleto,
    nombre_completo_2: data.nombreCompleto,
    nombre_completo_3: data.nombreCompleto,
    nombre_completo_4: data.nombreCompleto,
    nombre_completo_5: data.nombreCompleto,
    nombre_firma: data.nombreCompleto,

    rfc_1: data.rfc,

    estado_civil: data.estadoCivil ?? "",
    nacionalidad: data.nacionalidad ?? "",
    lugar_origen: data.lugarOrigen ?? "",
    fecha_nacimiento: data.fechaNacimiento ?? "",
    domicilio_deudor: data.domicilio ?? "",

    monto_numero_1: montoNum,
    monto_numero_2: montoNum,
    monto_numero_3: montoNum,
    monto_numero_4: montoNum,

    monto_letra_1: montoLetra,
    monto_letra_2: montoLetra,

    empleador_1: data.empleador,

    dia_firma_1: dia,
    mes_firma_1: mes,
    anio_firma_1: anio,

    dia_mandato: dia,
    mes_mandato: mes,
    anio_mandato: anio,

    dia_pagare: dia,
    mes_pagare: mes,
    anio_pagare: anio,

    banco_acreedor: cs.acreedor_banco ?? "",
    cuenta_acreedor: cs.acreedor_cuenta ?? "",
    clabe_acreedor: cs.acreedor_clabe ?? "",

    cuenta_mandato: cs.acreedor_cuenta ?? "",
    clabe_mandato: cs.acreedor_clabe ?? "",
    banco_mandato: cs.acreedor_banco ?? "",

    testigo_1: cs.testigo_1_nombre ?? "",
    testigo_2: cs.testigo_2_nombre ?? "",
    testigo_3: cs.testigo_1_nombre ?? "",
    testigo_4: cs.testigo_2_nombre ?? "",
  };

  for (const [fieldName, value] of Object.entries(fieldValues)) {
    try {
      const field = form.getTextField(fieldName);
      field.setText(value);
    } catch {
      // Field not found in template — skip silently
    }
  }

  form.flatten();

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}
