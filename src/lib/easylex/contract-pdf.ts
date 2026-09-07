import {
  generateContractPdfFromGoogleDocs,
  type ContractData as ContractPlaceholders,
} from "@/lib/google/contract-pdf";
import type { CompanySettings } from "@/lib/company-settings";
import { calculateLoanTotals } from "@/lib/contracts/loan-totals";
import { montoEnLetra } from "@/lib/easylex/monto-en-letra";

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

/* ─── Identidad del acreedor: respaldo ─── */

// La identidad del acreedor se edita desde "Datos de empresa" (company_settings).
// Si un campo está vacío, se usa este respaldo —el valor histórico de la plantilla—
// para que el dato NUNCA salga en blanco en el contrato. Nota: la razón social del
// bloque de firma sigue fija en la plantilla (ver scripts/add-acreedor-placeholders.ts).
const ACREEDOR_DEFAULTS = {
  razon_social: "LOZAV CONSTRUCTORES, SOCIEDAD ANÓNIMA DE CAPITAL VARIABLE",
  rfc: "LCO2105032T5",
  representante: "DARA JAHDAI LOPEZ DE LOS ANGELES",
  domicilio: "Del Gran Parque número 225, Interior C, colonia Cumbres, C.P. 64610, Monterrey, Nuevo León",
} as const;

const withDefault = (value: string | undefined, fallback: string) => value?.trim() || fallback;

/* ─── Placeholder mapping ─── */

// Mapea `ContractData` → los placeholders `{{...}}` de la plantilla. Es la ÚNICA
// fuente de verdad de qué campo llena cada hueco; `generateContractPdf` la usa
// para renderizar y las herramientas de verificación la usan para auditar sin
// llamar a Google (misma lógica, cero divergencia).
export function buildContractPlaceholders(data: ContractData): ContractPlaceholders {
  const { dia, mes, anio } = formatDate(data.fechaFirma);
  const cs = data.companySettings;
  const totals = calculateLoanTotals(data.monto);

  return {
    nombre_completo: data.nombreCompleto,
    estado_civil: data.estadoCivil ?? "",
    nacionalidad: data.nacionalidad ?? "",
    lugar_origen: data.lugarOrigen ?? "",
    fecha_nacimiento: data.fechaNacimiento ?? "",
    rfc: data.rfc,
    domicilio: data.domicilio ?? "",
    monto_numero: formatMonto(totals.principal),
    monto_letra: montoEnLetra(totals.principal),
    total_pago_numero: formatMonto(totals.total),
    total_pago_letra: montoEnLetra(totals.total),
    banco_acreedor: cs.acreedor_banco ?? "",
    cuenta_acreedor: cs.acreedor_cuenta ?? "",
    clabe_acreedor: cs.acreedor_clabe ?? "",
    razon_social_acreedor: withDefault(cs.acreedor_razon_social, ACREEDOR_DEFAULTS.razon_social),
    rfc_acreedor: withDefault(cs.acreedor_rfc, ACREEDOR_DEFAULTS.rfc),
    representante_acreedor: withDefault(cs.acreedor_representante, ACREEDOR_DEFAULTS.representante),
    domicilio_acreedor: withDefault(cs.acreedor_domicilio, ACREEDOR_DEFAULTS.domicilio),
    dia_firma: dia,
    mes_firma: mes,
    anio_firma: anio,
    empleador: data.empleador,
    testigo_1: cs.testigo_1_nombre ?? "",
    testigo_2: cs.testigo_2_nombre ?? "",
  };
}

/* ─── PDF generation ─── */

export async function generateContractPdf(data: ContractData): Promise<Buffer> {
  return generateContractPdfFromGoogleDocs(buildContractPlaceholders(data));
}
