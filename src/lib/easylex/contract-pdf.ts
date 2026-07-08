import { generateContractPdfFromGoogleDocs } from "@/lib/google/contract-pdf";
import type { CompanySettings } from "@/lib/company-settings";
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

/* ─── PDF generation ─── */

export async function generateContractPdf(data: ContractData): Promise<Buffer> {
  const { dia, mes, anio } = formatDate(data.fechaFirma);
  const montoNum = formatMonto(data.monto);
  const montoLetra = montoEnLetra(data.monto);
  const cs = data.companySettings;

  return generateContractPdfFromGoogleDocs({
    nombre_completo: data.nombreCompleto,
    estado_civil: data.estadoCivil ?? "",
    nacionalidad: data.nacionalidad ?? "",
    lugar_origen: data.lugarOrigen ?? "",
    fecha_nacimiento: data.fechaNacimiento ?? "",
    rfc: data.rfc,
    domicilio: data.domicilio ?? "",
    monto_numero: montoNum,
    monto_letra: montoLetra,
    banco_acreedor: cs.acreedor_banco ?? "",
    cuenta_acreedor: cs.acreedor_cuenta ?? "",
    clabe_acreedor: cs.acreedor_clabe ?? "",
    dia_firma: dia,
    mes_firma: mes,
    anio_firma: anio,
    empleador: data.empleador,
    testigo_1: cs.testigo_1_nombre ?? "",
    testigo_2: cs.testigo_2_nombre ?? "",
  });
}
