import { describe, it, expect, vi, beforeEach } from "vitest";

// Mocks de las dependencias externas (Supabase, EasyLex, WhatsApp, auditoría).
// vi.hoisted: vi.mock se iza al inicio del archivo, así que las funciones mock
// que usa deben crearse también de forma izada, o "no están inicializadas" aún.
const {
  storageUpload,
  storageCreateSignedUrl,
  attemptsUpdateEq,
  employeesMaybeSingle,
  getSignedDocument,
  sendDocument,
  recordAuditEvent,
} = vi.hoisted(() => ({
  storageUpload: vi.fn(),
  storageCreateSignedUrl: vi.fn(),
  attemptsUpdateEq: vi.fn(),
  employeesMaybeSingle: vi.fn(),
  getSignedDocument: vi.fn(),
  sendDocument: vi.fn(),
  recordAuditEvent: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseAdmin: () => ({
    storage: {
      from: () => ({ upload: storageUpload, createSignedUrl: storageCreateSignedUrl }),
    },
    from: (table: string) => {
      if (table === "contract_attempts") {
        return { update: () => ({ eq: attemptsUpdateEq }) };
      }
      // employees
      return { select: () => ({ eq: () => ({ maybeSingle: employeesMaybeSingle }) }) };
    },
  }),
}));

vi.mock("@/lib/easylex/client", () => ({
  EasyLexClient: class {
    getSignedDocument = getSignedDocument;
  },
}));

vi.mock("@/lib/whatsapp/client", () => ({
  getWhatsAppClient: () => ({ sendDocument }),
}));

vi.mock("@/lib/whatsapp/phone-utils", () => ({
  normalizePhoneForMeta: (v: string | null) => (v ? `52${v}` : null),
}));

vi.mock("@/lib/audit", () => ({ recordAuditEvent }));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { deliverSignedContract } from "./deliver-signed-contract";

const INPUT = {
  documentId: "doc-1",
  contractRequestId: "cr-1",
  contractAttemptId: "at-1",
  employeeId: "emp-1",
  correlationId: "corr-1",
};

function happyMocks() {
  getSignedDocument.mockResolvedValue({ ok: true, pdf: Buffer.from("%PDF-1.4 firmado") });
  storageUpload.mockResolvedValue({ error: null });
  attemptsUpdateEq.mockResolvedValue({ error: null });
  employeesMaybeSingle.mockResolvedValue({ data: { nombre: "Ana", telefono_normalizado: "5511112222" } });
  storageCreateSignedUrl.mockResolvedValue({ data: { signedUrl: "https://signed/url.pdf" }, error: null });
  sendDocument.mockResolvedValue({ ok: true, messageId: "wamid.1" });
  recordAuditEvent.mockResolvedValue(undefined);
}

describe("deliverSignedContract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("happy path: descarga, archiva y envía por WhatsApp", async () => {
    happyMocks();

    const res = await deliverSignedContract(INPUT);

    expect(res).toEqual({ archived: true, sent: true, storagePath: "cr-1/doc-1.pdf" });
    expect(storageUpload).toHaveBeenCalledWith(
      "cr-1/doc-1.pdf",
      expect.any(Buffer),
      expect.objectContaining({ contentType: "application/pdf" }),
    );
    expect(sendDocument).toHaveBeenCalledWith("525511112222", "https://signed/url.pdf", "contrato-firmado.pdf", expect.any(String));
    expect(recordAuditEvent).toHaveBeenCalled();
  });

  it("si falla la descarga del PDF, no archiva ni envía (y no lanza)", async () => {
    happyMocks();
    getSignedDocument.mockResolvedValue({ ok: false, error: "documento no firmado" });

    const res = await deliverSignedContract(INPUT);

    expect(res.archived).toBe(false);
    expect(res.sent).toBe(false);
    expect(storageUpload).not.toHaveBeenCalled();
    expect(sendDocument).not.toHaveBeenCalled();
  });

  it("archiva aunque el empleado no tenga teléfono (no envía)", async () => {
    happyMocks();
    employeesMaybeSingle.mockResolvedValue({ data: { nombre: "Ana", telefono_normalizado: null } });

    const res = await deliverSignedContract(INPUT);

    expect(res.archived).toBe(true);
    expect(res.sent).toBe(false);
    expect(sendDocument).not.toHaveBeenCalled();
    expect(recordAuditEvent).toHaveBeenCalled();
  });

  it("archiva aunque el envío por WhatsApp falle (best-effort)", async () => {
    happyMocks();
    sendDocument.mockResolvedValue({ ok: false, error: "token expirado" });

    const res = await deliverSignedContract(INPUT);

    expect(res.archived).toBe(true);
    expect(res.sent).toBe(false);
  });

  it("NUNCA lanza: un error inesperado se captura y devuelve resultado", async () => {
    happyMocks();
    storageUpload.mockRejectedValue(new Error("storage caído"));

    // No debe rechazar la promesa.
    const res = await deliverSignedContract(INPUT);

    expect(res.archived).toBe(false);
    expect(res.sent).toBe(false);
    expect(res.error).toBeTruthy();
  });
});
