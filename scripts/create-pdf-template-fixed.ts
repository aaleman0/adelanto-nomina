import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { PDFDocument, rgb } from "pdf-lib";

const INPUT_PDF = "/Users/joseangel/Downloads/LOZAV Préstamo mercantil V2.pdf";
const OUTPUT_PDF = join(
  process.cwd(),
  "src",
  "lib",
  "easylex",
  "templates",
  "contrato-prestamo.pdf",
);

const PAGE_HEIGHT = 792;

function y(screenY: number) {
  return PAGE_HEIGHT - screenY;
}

const fields: Array<{
  name: string;
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
}> = [
  // Page 1
  { name: "nombre_completo_1", page: 0, x: 175, y: y(650), width: 330, height: 14 },
  { name: "estado_civil", page: 0, x: 315, y: y(440), width: 90, height: 12 },
  { name: "nacionalidad", page: 0, x: 470, y: y(440), width: 80, height: 12 },
  { name: "lugar_origen", page: 0, x: 275, y: y(425), width: 100, height: 12 },
  { name: "fecha_nacimiento", page: 0, x: 475, y: y(425), width: 90, height: 12 },
  { name: "rfc_1", page: 0, x: 420, y: y(410), width: 100, height: 12 },
  { name: "monto_numero_1", page: 0, x: 355, y: y(205), width: 80, height: 12 },

  // Page 2
  { name: "monto_letra_1", page: 1, x: 35, y: y(750), width: 450, height: 14 },

  // Page 3
  { name: "banco_acreedor", page: 2, x: 170, y: y(720), width: 120, height: 12 },
  { name: "cuenta_acreedor", page: 2, x: 115, y: y(705), width: 100, height: 12 },
  { name: "clabe_acreedor", page: 2, x: 250, y: y(705), width: 150, height: 12 },

  // Page 5
  { name: "domicilio_deudor", page: 4, x: 170, y: y(410), width: 360, height: 12 },

  // Page 6
  { name: "dia_firma_1", page: 5, x: 315, y: y(330), width: 30, height: 12 },
  { name: "mes_firma_1", page: 5, x: 375, y: y(330), width: 80, height: 12 },
  { name: "anio_firma_1", page: 5, x: 470, y: y(330), width: 45, height: 12 },
  { name: "nombre_completo_2", page: 5, x: 375, y: y(260), width: 200, height: 12 },
  { name: "nombre_firma", page: 5, x: 375, y: y(245), width: 200, height: 12 },
  { name: "testigo_1", page: 5, x: 80, y: y(155), width: 200, height: 12 },
  { name: "testigo_2", page: 5, x: 360, y: y(155), width: 200, height: 12 },

  // Page 7
  { name: "dia_mandato", page: 6, x: 120, y: y(750), width: 30, height: 12 },
  { name: "mes_mandato", page: 6, x: 230, y: y(750), width: 90, height: 12 },
  { name: "anio_mandato", page: 6, x: 390, y: y(750), width: 45, height: 12 },
  { name: "empleador_1", page: 6, x: 85, y: y(710), width: 180, height: 12 },
  { name: "banco_mandato", page: 6, x: 380, y: y(500), width: 120, height: 12 },
  { name: "cuenta_mandato", page: 6, x: 230, y: y(500), width: 100, height: 12 },
  { name: "clabe_mandato", page: 6, x: 300, y: y(500), width: 150, height: 12 },
  { name: "monto_numero_2", page: 6, x: 170, y: y(380), width: 80, height: 12 },
  { name: "monto_numero_3", page: 6, x: 395, y: y(380), width: 80, height: 12 },
  { name: "nombre_completo_3", page: 6, x: 260, y: y(230), width: 200, height: 12 },
  { name: "testigo_3", page: 6, x: 130, y: y(150), width: 180, height: 12 },
  { name: "testigo_4", page: 6, x: 380, y: y(150), width: 180, height: 12 },

  // Page 8
  { name: "monto_numero_4", page: 7, x: 370, y: y(735), width: 80, height: 12 },
  { name: "monto_letra_2", page: 7, x: 90, y: y(735), width: 350, height: 12 },
  { name: "dia_pagare", page: 7, x: 420, y: y(270), width: 30, height: 12 },
  { name: "mes_pagare", page: 7, x: 475, y: y(270), width: 80, height: 12 },
  { name: "anio_pagare", page: 7, x: 555, y: y(270), width: 45, height: 12 },
  { name: "nombre_completo_4", page: 7, x: 180, y: y(180), width: 200, height: 12 },

  // Page 9
  { name: "nombre_completo_5", page: 8, x: 210, y: y(770), width: 200, height: 12 },
];

async function main() {
  const pdfBytes = await readFile(INPUT_PDF);
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const form = pdfDoc.getForm();
  const pages = pdfDoc.getPages();

  for (const field of fields) {
    const textField = form.createTextField(field.name);
    textField.addToPage(pages[field.page], {
      x: field.x,
      y: field.y,
      width: field.width,
      height: field.height,
      borderWidth: 0,
      backgroundColor: rgb(1, 1, 1),
    });
    textField.setFontSize(8);
    textField.setText("");
  }

  const outputBytes = await pdfDoc.save();
  await writeFile(OUTPUT_PDF, outputBytes);
  console.log(`PDF template saved to ${OUTPUT_PDF}`);
  console.log(`Total fields: ${form.getFields().length}`);
}

main().catch(console.error);
