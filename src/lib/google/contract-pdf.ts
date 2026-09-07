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
  total_pago_numero: string;
  total_pago_letra: string;
  banco_acreedor: string;
  cuenta_acreedor: string;
  clabe_acreedor: string;
  razon_social_acreedor: string;
  rfc_acreedor: string;
  representante_acreedor: string;
  domicilio_acreedor: string;
  dia_firma: string;
  mes_firma: string;
  anio_firma: string;
  empleador: string;
  testigo_1: string;
  testigo_2: string;
}

type TextOccurrence = {
  startIndex: number;
  endIndex: number;
  text: string;
};

function collectTextOccurrences(node: unknown, needle: string, out: TextOccurrence[]) {
  if (!node || typeof node !== "object") return;

  const record = node as Record<string, unknown>;
  const startIndex = typeof record.startIndex === "number" ? record.startIndex : null;
  const textRun = record.textRun as { content?: string } | undefined;
  const content = textRun?.content;

  if (startIndex !== null && typeof content === "string") {
    let offset = content.indexOf(needle);
    while (offset !== -1) {
      out.push({
        startIndex: startIndex + offset,
        endIndex: startIndex + offset + needle.length,
        text: needle,
      });
      offset = content.indexOf(needle, offset + needle.length);
    }
  }

  for (const value of Object.values(record)) {
    if (Array.isArray(value)) {
      for (const child of value) collectTextOccurrences(child, needle, out);
    } else if (value && typeof value === "object") {
      collectTextOccurrences(value, needle, out);
    }
  }
}

type IndexedReplacement = {
  occurrence: TextOccurrence;
  replacement: string;
};

function buildIndexedReplacements(
  occurrences: TextOccurrence[],
  replacements: string[],
): IndexedReplacement[] {
  if (occurrences.length < replacements.length) {
    throw new Error(
      `No se encontraron suficientes ocurrencias del placeholder. Esperadas ${replacements.length}, encontradas ${occurrences.length}.`,
    );
  }

  return occurrences
    .slice(0, replacements.length)
    .map((occurrence, index) => ({
      occurrence,
      replacement: replacements[index],
    }));
}

function buildIndexedReplacementRequests(replacements: IndexedReplacement[]) {
  return [...replacements]
    .sort((a, b) => b.occurrence.startIndex - a.occurrence.startIndex)
    .flatMap(({ occurrence, replacement }) => [
      {
        deleteContentRange: {
          range: {
            startIndex: occurrence.startIndex,
            endIndex: occurrence.endIndex,
          },
        },
      },
      {
        insertText: {
          location: { index: occurrence.startIndex },
          text: replacement,
        },
      },
    ]);
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
      { old: "{{banco_acreedor}}", new: data.banco_acreedor },
      { old: "{{cuenta_acreedor}}", new: data.cuenta_acreedor },
      { old: "{{clabe_acreedor}}", new: data.clabe_acreedor },
      { old: "{{razon_social_acreedor}}", new: data.razon_social_acreedor },
      { old: "{{rfc_acreedor}}", new: data.rfc_acreedor },
      { old: "{{representante_acreedor}}", new: data.representante_acreedor },
      { old: "{{domicilio_acreedor}}", new: data.domicilio_acreedor },
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

    const document = await docs.documents.get({ documentId: copiedDocId });
    const amountOccurrences: TextOccurrence[] = [];
    const amountLetterOccurrences: TextOccurrence[] = [];

    collectTextOccurrences(document.data.body?.content, "{{monto_numero}}", amountOccurrences);
    collectTextOccurrences(document.data.body?.content, "{{monto_letra}}", amountLetterOccurrences);

    const indexedRequests = buildIndexedReplacementRequests([
      ...buildIndexedReplacements(amountOccurrences, [
        data.monto_numero,
        data.monto_numero,
        data.total_pago_numero,
        data.total_pago_numero,
        data.total_pago_numero,
      ]),
      ...buildIndexedReplacements(amountLetterOccurrences, [
        data.monto_letra,
        data.total_pago_letra,
      ]),
    ]);

    await docs.documents.batchUpdate({
      documentId: copiedDocId,
      requestBody: {
        requests: indexedRequests,
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
