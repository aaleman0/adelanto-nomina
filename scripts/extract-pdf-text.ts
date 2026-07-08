import { readFile, writeFile } from "node:fs/promises";
import { PDFDocument, PDFName, decodePDFRawStream, PDFRawStream } from "pdf-lib";

async function main() {
  const pdfBytes = await readFile("/Users/joseangel/Downloads/LOZAV Préstamo mercantil V2.pdf");
  const pdfDoc = await PDFDocument.load(pdfBytes);
  
  const lines: string[] = [];
  
  for (let i = 0; i < pdfDoc.getPageCount(); i++) {
    const page = pdfDoc.getPage(i);
    lines.push(`\n=== PAGE ${i + 1} ===`);
    
    const contentRef = page.node.get(PDFName.of("Contents"));
    if (!contentRef) continue;
    
    // Get raw content stream as string
    const rawContents = page.node.Contents();
    if (!rawContents) continue;
    
    let streamText = "";
    try {
      // Try to decode the stream
      if (Array.isArray(rawContents)) {
        for (const stream of rawContents) {
          const decoded = decodePDFRawStream(stream);
          streamText += Buffer.from(decoded.decode()).toString("latin1");
        }
      } else {
        const decoded = decodePDFRawStream(rawContents as PDFRawStream);
        streamText += Buffer.from(decoded.decode()).toString("latin1");
      }
    } catch (e) {
      lines.push(`  Error decoding: ${e}`);
      continue;
    }
    
    // Extract text operators (Tj, TJ, ')
    const tjRegex = /\(([^)]*)\)\s*Tj/g;
    const tjArrayRegex = /\[([^\]]*)\]\s*TJ/g;
    
    let match;
    while ((match = tjRegex.exec(streamText)) !== null) {
      const text = match[1].trim();
      if (text) lines.push(`  Tj: "${text}"`);
    }
    
    while ((match = tjArrayRegex.exec(streamText)) !== null) {
      const parts = match[1];
      const textParts = [...parts.matchAll(/\(([^)]*)\)/g)].map(m => m[1]);
      const combined = textParts.join("").trim();
      if (combined) lines.push(`  TJ: "${combined}"`);
    }
  }

  const output = lines.join("\n");
  console.log(output);
  await writeFile("/Users/joseangel/Desktop/adelanto-nomina/scripts/pdf-text-output.txt", output);
}

main().catch(console.error);
