import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { generateContractPdf } from "@/lib/easylex/contract-pdf";

async function main() {
  const pdfBuffer = await generateContractPdf({
    nombreCompleto: "ANGEL ALEMAN GARCIA",
    apellidoPaterno: "Aleman",
    apellidoMaterno: "Garcia",
    rfc: "GHHK674551KH1",
    curp: "AEGM900515HNLLRN09",
    email: "aaleman@orbitware.com",
    empleador: "Acepte",
    monto: 4000,
    clabe: "012345678901234567",
    banco: "BBVA",
    estadoCivil: "Soltero",
    nacionalidad: "Mexicana",
    lugarOrigen: "Monterrey, Nuevo Leon",
    fechaNacimiento: "1990-05-15",
    domicilio: "Calle Roble 123, Col. Centro, C.P. 64000, Monterrey, Nuevo Leon",
    fechaFirma: new Date(),
    companySettings: {
      acreedor_razon_social: "LOZAV CONSTRUCTORES, SOCIEDAD ANONIMA DE CAPITAL VARIABLE",
      acreedor_representante: "DARA JAHDAI LOPEZ DE LOS ANGELES",
      acreedor_rfc: "LCO2105032T5",
      acreedor_domicilio: "Del Gran Parque numero 225, Interior C, colonia Cumbres, C.P. 64610, Monterrey, Nuevo Leon",
      acreedor_banco: "BBVA",
      acreedor_cuenta: "0123456789",
      acreedor_clabe: "012345678901234567",
      testigo_1_nombre: "JUAN CARLOS MARTINEZ LOPEZ",
      testigo_2_nombre: "MARIA FERNANDA GARCIA HERNANDEZ",
    },
  });

  const outputPath = join(process.cwd(), "scripts", "test-filled-contract.pdf");
  await writeFile(outputPath, pdfBuffer);
  console.log(`Filled contract saved to ${outputPath}`);
  console.log(`Size: ${pdfBuffer.length} bytes`);
}

main().catch(console.error);
