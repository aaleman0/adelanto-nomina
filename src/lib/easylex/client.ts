import { easylexEnv } from "@/lib/env";
import { logger } from "@/lib/logger";

// Timeout de las llamadas a EasyLex: la creación de documento sube un PDF
// multipart, así que se da margen; sin timeout una conexión colgada bloquea
// todo el flujo de contrato.
const FETCH_TIMEOUT_MS = 20_000;

/* ─── Types ─── */

export type EasyLexSignatory = {
  firstName: string;
  lastName: string;
  motherLastName: string;
  email: string;
};

export type EasyLexValidationConfig = {
  validateId?: boolean;
  validateSms?: boolean;
  validatePicture?: boolean;
  validateEmail?: boolean;
  validateBiometric?: boolean;
  validateLiveness?: boolean;
  validateVoice?: boolean;
};

export type EasyLexCreateDocumentInput = {
  fileName: string;
  signatories: EasyLexSignatory[];
  pdfBuffer: Buffer;
  callbackUrl?: string;
  expirationDate?: string;
  validation?: EasyLexValidationConfig;
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

/**
 * Forma real del error de EasyLex: `{ error: { path, message, description, code } }`.
 * El `description` (validación de esquema) trae `dataPath` y `params.allowedValues`,
 * que es lo que hace legible un rechazo como "validateId debe ser true".
 */
export type EasyLexErrorDetail = {
  path?: string;
  message?: string;
  code?: number;
  description?: {
    keyword?: string;
    dataPath?: string;
    message?: string;
    params?: { allowedValues?: unknown[] };
  };
};

export type EasyLexError = {
  // `error` puede venir como string (formato viejo) u objeto (v2).
  error?: string | EasyLexErrorDetail;
  message?: string;
  code?: number;
  statusCode?: number;
};

/**
 * Convierte la respuesta de error de EasyLex en un mensaje legible. Antes se
 * hacía `body.message ?? body.error`, pero en v2 `body.error` es un OBJETO, así
 * que terminaba como "[object Object]" y ocultaba la causa real (p. ej. que una
 * validación exige otra). Aquí se extrae el detalle del esquema cuando existe.
 */
export function describeEasyLexError(body: unknown, status: number): string {
  const b = (body ?? {}) as EasyLexError;
  const err = b.error;

  if (err && typeof err === "object") {
    const base = err.message || "InvalidRequest";
    const d = err.description;
    if (d && (d.dataPath || d.params?.allowedValues)) {
      const field = d.dataPath ? d.dataPath.replace(/^\./, "") : "campo";
      const allowed = d.params?.allowedValues?.length
        ? ` (valor permitido: ${d.params.allowedValues.join(", ")})`
        : "";
      return `${base}: '${field}' inválido${allowed}`;
    }
    return err.code ? `${base} [code ${err.code}]` : base;
  }

  if (typeof err === "string" && err) return err;
  if (typeof b.message === "string" && b.message) return b.message;
  return `HTTP ${status}`;
}

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
    const validation = input.validation ?? {};

    const formData = new FormData();
    formData.append("fileName", input.fileName);
    formData.append("type", "DISI");
    formData.append("sendEmail", "false");
    formData.append("expirationDate", expirationDate);
    formData.append("validateId", booleanToString(validation.validateId));
    formData.append("validateSms", booleanToString(validation.validateSms));
    formData.append("validatePicture", booleanToString(validation.validatePicture));
    formData.append("validateEmail", booleanToString(validation.validateEmail));
    formData.append("validateBiometric", booleanToString(validation.validateBiometric));
    formData.append("validateLiveness", booleanToString(validation.validateLiveness));
    formData.append("validateVoice", booleanToString(validation.validateVoice));

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
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: {
          "access-key-id": this.accessKeyId,
          "secret-access-key": this.secretAccessKey,
        },
        body: formData,
      });

      const body = await response.json();

      if (!response.ok) {
        const errorMsg = describeEasyLexError(body, response.status);

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
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: {
          "access-key-id": this.accessKeyId,
          "secret-access-key": this.secretAccessKey,
        },
      });

      const body = await response.json();

      if (!response.ok) {
        const errorMsg = describeEasyLexError(body, response.status);
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

function booleanToString(value: boolean | undefined): string {
  return value === true ? "true" : "false";
}
