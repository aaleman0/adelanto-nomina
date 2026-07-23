import { describe, it, expect, vi, beforeEach } from "vitest";
import { sendContractLinkWhatsApp } from "./send-contract-link";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { getWhatsAppClient } from "@/lib/whatsapp/client";

vi.mock("@/lib/whatsapp/client", () => ({
  getWhatsAppClient: vi.fn(),
}));

const sendTemplateWithButton = vi.fn();
const insert = vi.fn().mockResolvedValue({ error: null });

const BASE = {
  employeeId: "emp-1",
  offerId: "offer-1",
  contractRequestId: "req-1",
  nombre: "Juana",
  telefonoNormalizado: "5218180188991",
  monto: 12500,
  signingUrl: "https://widgetsandbox.easylex.com/firmar/signer-123",
  expiresAt: "2026-07-25T22:00:00.000Z",
  subscriberId: "sub-1",
  correlationId: "corr-1",
};

beforeEach(() => {
  vi.clearAllMocks();
  insert.mockResolvedValue({ error: null });
  // El setup global mockea getSupabaseAdmin como vi.fn() sin implementación;
  // aquí le damos un cliente falso cuyo insert registra la fila.
  vi.mocked(getSupabaseAdmin).mockReturnValue({
    from: () => ({ insert }),
  } as unknown as ReturnType<typeof getSupabaseAdmin>);
  vi.mocked(getWhatsAppClient).mockReturnValue({
    sendTemplateWithButton,
  } as unknown as ReturnType<typeof getWhatsAppClient>);
});

describe("sendContractLinkWhatsApp", () => {
  it("envía el sufijo del link en el botón y las 3 variables de cuerpo", async () => {
    sendTemplateWithButton.mockResolvedValue({ ok: true, messageId: "wamid.ABC" });

    const result = await sendContractLinkWhatsApp(BASE);

    expect(result).toEqual({ sent: true, messageId: "wamid.ABC" });
    const [, templateName, variables, urlButtonSuffix] = sendTemplateWithButton.mock.calls[0];
    // La plantilla por defecto es la UTILITY aprobada.
    expect(templateName).toBe("adelanto_contrato_listo");
    // Meta solo acepta el sufijo que rellena {{1}} del botón, no la URL completa.
    expect(urlButtonSuffix).toBe("signer-123");
    // Tres variables de cuerpo: nombre, monto y fecha límite (no vacía).
    expect(variables["1"]).toBe("Juana");
    expect(variables["2"]).toBe("12,500");
    expect(variables["3"]).toMatch(/2026/);
  });

  it("usa un texto genérico en la 3ª variable si no hay fecha límite", async () => {
    // La plantilla no admite una variable vacía; sin expiresAt debe ir un texto.
    sendTemplateWithButton.mockResolvedValue({ ok: true, messageId: "wamid.NOEXP" });

    await sendContractLinkWhatsApp({ ...BASE, expiresAt: null });

    const [, , variables] = sendTemplateWithButton.mock.calls[0];
    expect(variables["3"]).toBe("el plazo indicado");
  });

  it("registra la fila con message_type contract_link y el wa_message_id", async () => {
    sendTemplateWithButton.mockResolvedValue({ ok: true, messageId: "wamid.XYZ" });

    await sendContractLinkWhatsApp(BASE);

    const row = insert.mock.calls[0][0];
    expect(row.message_type).toBe("contract_link");
    expect(row.status).toBe("sent");
    expect(row.wa_message_id).toBe("wamid.XYZ");
  });

  it("no envía si no hay link, y lo deja registrado como fallido", async () => {
    const result = await sendContractLinkWhatsApp({ ...BASE, signingUrl: null });

    expect(result.sent).toBe(false);
    expect(sendTemplateWithButton).not.toHaveBeenCalled();
    expect(insert.mock.calls[0][0].status).toBe("failed");
  });

  it("no envía si el empleado no tiene teléfono normalizable", async () => {
    const result = await sendContractLinkWhatsApp({ ...BASE, telefonoNormalizado: null });

    expect(result.sent).toBe(false);
    expect(sendTemplateWithButton).not.toHaveBeenCalled();
  });

  it("propaga el motivo cuando Meta rechaza el envío", async () => {
    sendTemplateWithButton.mockResolvedValue({ ok: false, error: "Template no aprobado" });

    const result = await sendContractLinkWhatsApp(BASE);

    expect(result).toEqual({ sent: false, reason: "Template no aprobado" });
    expect(insert.mock.calls[0][0].error_message).toBe("Template no aprobado");
  });

  it("nunca lanza, aunque el registro en base falle", async () => {
    sendTemplateWithButton.mockResolvedValue({ ok: true, messageId: "wamid.1" });
    insert.mockRejectedValue(new Error("db caída"));

    // No debe propagar: el contrato ya está generado.
    await expect(sendContractLinkWhatsApp(BASE)).resolves.toMatchObject({ sent: false });
  });
});
