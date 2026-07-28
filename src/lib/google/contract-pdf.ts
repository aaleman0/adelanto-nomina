import { google } from "googleapis";
import { getGoogleAuthClient } from "./auth";
import { logger } from "@/lib/logger";

const TEMPLATE_DOC_ID = "1XCSrKrMPHDc5S2lxcR4BqsHR6HouIUW8l0_KspocHJQ";

export interface ContractData {
  nombre_completo: string;
  estado_civil: string;
  nacionalidad: string;
  lugar_origen: string;
  fecha_nacimiento: string;
  rfc: string;
  domicilio: string;
  monto_numero: string;
  monto_letra: string;
  banco_acreedor: string;
  cuenta_acreedor: string;
  clabe_acreedor: string;
  dia_firma: string;
  mes_firma: string;
  anio_firma: string;
  empleador: string;
  testigo_1: string;
  testigo_2: string;
}

export async function generateContractPdfFromGoogleDocs(
  data: ContractData
): Promise<Buffer> {
  const auth = await getGoogleAuthClient();
  const drive = google.drive({ version: "v3", auth });
  const docs = google.docs({ version: "v1", auth });

  const copyResponse = await drive.files.copy({
    fileId: TEMPLATE_DOC_ID,
    requestBody: {
      name: `Contrato - ${data.nombre_completo} - ${new Date().toISOString().slice(0, 10)}`,
    },
  });

  const copiedDocId = copyResponse.data.id!;

  try {
    const replacements: Array<{ old: string; new: string }> = [
      { old: "{{nombre_completo}}", new: data.nombre_completo },
      { old: "{{estado_civil}}", new: data.estado_civil },
      { old: "{{nacionalidad}}", new: data.nacionalidad },
      { old: "{{lugar_origen}}", new: data.lugar_origen },
      { old: "{{fecha_nacimiento}}", new: data.fecha_nacimiento },
      { old: "{{rfc}}", new: data.rfc },
      { old: "{{domicilio}}", new: data.domicilio },
      { old: "{{monto_numero}}", new: data.monto_numero },
      { old: "{{monto_letra}}", new: data.monto_letra },
      { old: "{{banco_acreedor}}", new: data.banco_acreedor },
      { old: "{{cuenta_acreedor}}", new: data.cuenta_acreedor },
      { old: "{{clabe_acreedor}}", new: data.clabe_acreedor },
      { old: "{{dia_firma}}", new: data.dia_firma },
      { old: "{{mes_firma}}", new: data.mes_firma },
      { old: "{{anio_firma}}", new: data.anio_firma },
      { old: "{{empleador}}", new: data.empleador },
      { old: "{{testigo_1}}", new: data.testigo_1 },
      { old: "{{testigo_2}}", new: data.testigo_2 },
    ];

    await docs.documents.batchUpdate({
      documentId: copiedDocId,
      requestBody: {
        requests: replacements.map((r) => ({
          replaceAllText: {
            containsText: { text: r.old, matchCase: true },
            replaceText: r.new,
          },
        })),
      },
    });

    const pdfResponse = await drive.files.export(
      { fileId: copiedDocId, mimeType: "application/pdf" },
      { responseType: "arraybuffer" }
    );

    return Buffer.from(pdfResponse.data as ArrayBuffer);
  } finally {
    // La copia contiene PII completa (RFC, CURP, CLABE, domicilio). Si el borrado
    // falla, queda huérfana en Drive: NO tragar el error, registrarlo para poder
    // limpiarla a mano y detectar el patrón.
    try {
      await drive.files.delete({ fileId: copiedDocId });
    } catch (error) {
      logger.error(
        "google.contract_pdf.cleanup_failed",
        error instanceof Error ? error : new Error(String(error)),
        { copiedDocId },
      );
    }
  }
}
