import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { syncTemplatesFromMeta } from "./templates";

const upsert = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseAdmin: () => ({
    from: () => ({
      upsert,
    }),
  }),
}));

describe("syncTemplatesFromMeta", () => {
  const originalEnv = {
    WHATSAPP_ACCESS_TOKEN: process.env.WHATSAPP_ACCESS_TOKEN,
    WHATSAPP_PHONE_NUMBER_ID: process.env.WHATSAPP_PHONE_NUMBER_ID,
    WHATSAPP_BUSINESS_ACCOUNT_ID: process.env.WHATSAPP_BUSINESS_ACCOUNT_ID,
  };
  const fetchMock = vi.fn();

  beforeEach(() => {
    upsert.mockReset().mockResolvedValue({ error: null });
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    process.env.WHATSAPP_ACCESS_TOKEN = "token";
    process.env.WHATSAPP_PHONE_NUMBER_ID = "phone-1";
    process.env.WHATSAPP_BUSINESS_ACCOUNT_ID = "waba-1";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    process.env.WHATSAPP_ACCESS_TOKEN = originalEnv.WHATSAPP_ACCESS_TOKEN;
    process.env.WHATSAPP_PHONE_NUMBER_ID = originalEnv.WHATSAPP_PHONE_NUMBER_ID;
    process.env.WHATSAPP_BUSINESS_ACCOUNT_ID = originalEnv.WHATSAPP_BUSINESS_ACCOUNT_ID;
  });

  it("pagina todas las templates de Meta antes de guardarlas", async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: "phone-1", display_phone_number: "5210000000000" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [
            { id: "t-1", name: "tpl_1", status: "APPROVED", category: "UTILITY", language: "es_MX", components: [] },
          ],
          paging: { next: "https://graph.facebook.com/v21.0/waba-1/message_templates?after=cursor-2" },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [
            { id: "t-2", name: "tpl_2", status: "APPROVED", category: "MARKETING", language: "es_MX", components: [] },
          ],
        }),
      });

    const result = await syncTemplatesFromMeta();

    expect(result.ok).toBe(true);
    expect(result.synced).toBe(2);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(upsert).toHaveBeenCalledOnce();
    expect(upsert.mock.calls[0][0]).toHaveLength(2);
  });
});
