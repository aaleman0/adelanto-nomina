import { writeFile } from "node:fs/promises";
import { existsSync, mkdirSync } from "node:fs";
import { generateContractPdfFromGoogleDocs } from "@/lib/google/contract-pdf";
import type { ContractData } from "@/lib/google/contract-pdf";
import { calculateLoanTotals } from "@/lib/contracts/loan-totals";
import { montoEnLetra } from "@/lib/easylex/monto-en-letra";

const OUTPUT_DIR = "./scripts/contratos-generados";

const today = new Date();
const dia = today.getDate().toString();
const mes = (today.getMonth() + 1).toString();
const anio = today.getFullYear().toString();

const testCases: Array<{
  nombre: string;
  apellidoPaterno: string;
  apellidoMaterno: string;
  telefono: string;
  monto: number;
}> = [
  {
    nombre: "Carlos",
    apellidoPaterno: "Garcia",
    apellidoMaterno: "Landois",
    telefono: "8118-088601",
    monto: 15250.5,
  },
  {
    nombre: "Nicolas",
    apellidoPaterno: "Palacios",
    apellidoMaterno: "",
    telefono: "81 8018 8991",
    monto: 1250000.75,
  },
  {
    nombre: "Daniel",
    apellidoPaterno: "Puente",
    apellidoMaterno: "",
    telefono: "81 2953 6934",
    monto: 5000,
  },
];

function formatMonto(monto: number): string {
  return new Intl.NumberFormat("es-MX", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(monto);
}

function buildPlaceholderData(
  nombre: string,
  apellidoPaterno: string,
  apellidoMaterno: string,
  monto: number,
): ContractData {
  const nombreCompleto = [nombre, apellidoPaterno, apellidoMaterno]
    .filter(Boolean)
    .join(" ");
  const totals = calculateLoanTotals(monto);

  return {
    nombre_completo: nombreCompleto,
    estado_civil: "Soltero(a)",
    nacionalidad: "Mexicana",
    lugar_origen: "Monterrey, Nuevo León",
    fecha_nacimiento: "01/01/1990",
    rfc: "XXXX000000XXX",
    domicilio: "Domicilio placeholder",
    monto_numero: formatMonto(totals.principal),
    monto_letra: montoEnLetra(totals.principal),
    // Datos del acreedor: en producción salen de company_settings; aquí van fijos
    // porque este script genera contratos de PRUEBA sin tocar la base.
    razon_social_acreedor: "ACREEDOR DE PRUEBA, S.A. DE C.V.",
    rfc_acreedor: "XAXX010101000",
    representante_acreedor: "Representante de Prueba",
    domicilio_acreedor: "Domicilio del acreedor placeholder",
    total_pago_numero: formatMonto(totals.total),
    total_pago_letra: montoEnLetra(totals.total),
    banco_acreedor: "BANCO PLACEHOLDER",
    cuenta_acreedor: "0000000000",
    clabe_acreedor: "000000000000000000",
    dia_firma: dia,
    mes_firma: mes,
    anio_firma: anio,
    empleador: "EMPLEADOR PLACEHOLDER",
    testigo_1: "TESTIGO 1 PLACEHOLDER",
    testigo_2: "TESTIGO 2 PLACEHOLDER",
  };
}

async function main() {
  if (!existsSync(OUTPUT_DIR)) {
    mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  for (const test of testCases) {
    const data = buildPlaceholderData(
      test.nombre,
      test.apellidoPaterno,
      test.apellidoMaterno,
      test.monto,
    );

    console.log(`Generando contrato para: ${data.nombre_completo}`);
    console.log(`  Teléfono: ${test.telefono}`);
    console.log(`  Monto: ${data.monto_numero}`);
    console.log(`  Monto en letra: ${data.monto_letra}`);

    const pdfBuffer = await generateContractPdfFromGoogleDocs(data);

    const fileName = `${OUTPUT_DIR}/contrato_${data.nombre_completo.replace(/\s+/g, "_").toLowerCase()}.pdf`;
    await writeFile(fileName, pdfBuffer);

    console.log(`  Guardado: ${fileName}\n`);
  }

  console.log("Listo. Revisa la carpeta:", OUTPUT_DIR);
}

main().catch((error) => {
  console.error("Error generando contratos:", error);
  process.exit(1);
});
