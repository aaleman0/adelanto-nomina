import { easylexEnv } from "@/lib/env";
import { logger } from "@/lib/logger";

/* ─── Types ─── */

export type EasyLexSignatory = {
  firstName: string;
  lastName: string;
  motherLastName: string;
  email: string;
};

export type EasyLexCreateDocumentInput = {
  fileName: string;
  signatories: EasyLexSignatory[];
  pdfBuffer: Buffer;
  callbackUrl?: string;
  expirationDate?: string;
};

export type EasyLexSignatoryResponse = {
  id: string;
  firstName: string;
  lastName: string;
  motherLastName: string;
  email: string;
  hasSigned: boolean;
};

export type EasyLexCreateDocumentResponse = {
  data: {
    id: string;
    status: "SIGNED" | "UNSIGNED";
    signatories: EasyLexSignatoryResponse[];
    name: string;
    callbackUrl?: string;
    expirationDate?: string;
    createdAt: string;
    validateId: boolean;
    validatePicture: boolean;
    validateSms: boolean;
    validateEmail: boolean;
    validateBiometric: boolean;
    validateVoice: boolean;
  };
  meta: { fieldNotes: unknown[] };
  references: unknown[];
};

export type EasyLexDocumentStatusResponse = {
  data: { status: "SIGNED" | "UNSIGNED" };
  meta: { fieldNotes: unknown[] };
  references: unknown[];
};

export type EasyLexError = {
  error?: string;
  message?: string;
  code?: number;
  statusCode?: number;
};

export type CreateDocumentResult =
  | { ok: true; documentId: string; signerId: string; signingUrl: string; rawResponse: EasyLexCreateDocumentResponse }
  | { ok: false; error: string; rawResponse?: unknown };

export type GetDocumentStatusResult =
  | { ok: true; status: "SIGNED" | "UNSIGNED" }
  | { ok: false; error: string };

/* ─── Client ─── */

export class EasyLexClient {
  private accessKeyId: string;
  private secretAccessKey: string;
  private baseUrl: string;
  private signingLinkBaseUrl: string;

  constructor(config?: {
    accessKeyId?: string;
    secretAccessKey?: string;
    baseUrl?: string;
    signingLinkBaseUrl?: string;
  }) {
    this.accessKeyId = config?.accessKeyId ?? easylexEnv.accessKeyId;
    this.secretAccessKey = config?.secretAccessKey ?? easylexEnv.secretAccessKey;
    this.baseUrl = config?.baseUrl ?? easylexEnv.baseUrl;
    this.signingLinkBaseUrl = config?.signingLinkBaseUrl ?? easylexEnv.signingLinkBaseUrl;
  }

  async createDocument(input: EasyLexCreateDocumentInput): Promise<CreateDocumentResult> {
    if (!this.accessKeyId || !this.secretAccessKey) {
      return { ok: false, error: "EasyLex no configurado (access-key-id o secret-access-key faltante)." };
    }

    const url = `${this.baseUrl}/api/public/v2/document`;

    const expirationDate = input.expirationDate ?? getDefaultExpiration();

    const formData = new FormData();
    formData.append("fileName", input.fileName);
    formData.append("type", "DISI");
    formData.append("sendEmail", "false");
    formData.append("expirationDate", expirationDate);
    formData.append("validateId", "false");
    formData.append("validateSms", "false");
    formData.append("validatePicture", "false");
    formData.append("validateEmail", "false");
    formData.append("validateBiometric", "false");
    formData.append("validateLiveness", "false");

    for (let i = 0; i < input.signatories.length; i++) {
      const sig = input.signatories[i];
      formData.append(`signatories[${i}][firstName]`, sig.firstName);
      formData.append(`signatories[${i}][lastName]`, sig.lastName);
      formData.append(`signatories[${i}][motherLastName]`, sig.motherLastName);
      formData.append(`signatories[${i}][email]`, sig.email);
    }

    if (input.callbackUrl) {
      formData.append("callbackUrl", input.callbackUrl);
    }

    const blob = new Blob([new Uint8Array(input.pdfBuffer)], { type: "application/pdf" });
    formData.append("files[0]", blob, `${input.fileName}.pdf`);

    try {
      logger.info("easylex.create_document.started", {
        fileName: input.fileName,
        signatoryCount: input.signatories.length,
        expirationDate,
      });

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "access-key-id": this.accessKeyId,
          "secret-access-key": this.secretAccessKey,
        },
        body: formData,
      });

      const body = await response.json();

      if (!response.ok) {
        const errorMsg = (body as EasyLexError).message
          ?? (body as EasyLexError).error
          ?? `HTTP ${response.status}`;

        logger.error("easylex.create_document.failed", new Error(errorMsg), {
          status: response.status,
          body,
        });

        return { ok: false, error: errorMsg, rawResponse: body };
      }

      const data = body as EasyLexCreateDocumentResponse;
      const documentId = data.data.id;
      const signer = data.data.signatories[0];

      if (!signer) {
        return { ok: false, error: "EasyLex no devolvió firmante en la respuesta.", rawResponse: body };
      }

      const signerId = signer.id;
      const signingUrl = this.buildSigningUrl(signerId);

      logger.info("easylex.create_document.success", {
        documentId,
        signerId,
        signingUrl,
      });

      return {
        ok: true,
        documentId,
        signerId,
        signingUrl,
        rawResponse: data,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Error desconocido al crear documento en EasyLex.";
      logger.error("easylex.create_document.error", error, { fileName: input.fileName });
      return { ok: false, error: msg };
    }
  }

  async getDocumentStatus(documentId: string): Promise<GetDocumentStatusResult> {
    const url = `${this.baseUrl}/api/public/v2/document/status/${documentId}`;

    try {
      const response = await fetch(url, {
        method: "GET",
        headers: {
          "access-key-id": this.accessKeyId,
          "secret-access-key": this.secretAccessKey,
        },
      });

      const body = await response.json();

      if (!response.ok) {
        const errorMsg = (body as EasyLexError).message ?? `HTTP ${response.status}`;
        return { ok: false, error: errorMsg };
      }

      const data = body as EasyLexDocumentStatusResponse;
      return { ok: true, status: data.data.status };
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Error al consultar status de documento.";
      logger.error("easylex.get_status.error", error, { documentId });
      return { ok: false, error: msg };
    }
  }

  private buildSigningUrl(signerId: string): string {
    if (this.signingLinkBaseUrl) {
      return `${this.signingLinkBaseUrl}/${signerId}`;
    }
    return `${this.baseUrl.replace("api.", "widget.")}/firmar/${signerId}`;
  }
}

function getDefaultExpiration(): string {
  const date = new Date();
  date.setDate(date.getDate() + 30);
  return date.toISOString().split("T")[0];
}
