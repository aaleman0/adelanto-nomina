import { readFile } from "node:fs/promises";
import { PDFDocument } from "pdf-lib";

async function main() {
  const pdfBytes = await readFile("/Users/joseangel/Downloads/LOZAV Préstamo mercantil V2.pdf");
  const pdfDoc = await PDFDocument.load(pdfBytes);

  console.log("Pages:", pdfDoc.getPageCount());
  for (let i = 0; i < pdfDoc.getPageCount(); i++) {
    const page = pdfDoc.getPage(i);
    const { width, height } = page.getSize();
    console.log(`  Page ${i + 1}: ${width} x ${height}`);
  }

  // Check if form already exists
  try {
    const form = pdfDoc.getForm();
    const fields = form.getFields();
    console.log("Existing form fields:", fields.length);
    for (const field of fields) {
      console.log(`  - ${field.getName()} (${field.constructor.name})`);
    }
  } catch {
    console.log("No existing form fields");
  }
}

main().catch(console.error);
