import { getSupabaseAdmin } from "@/lib/supabase/server";

const BASE_URL = "https://graph.facebook.com/v18.0";

export type MetaTemplate = {
  id: string;
  name: string;
  status: "APPROVED" | "PENDING" | "REJECTED" | "DISABLED" | string;
  category: string;
  language: string;
  components: MetaTemplateComponent[];
};

export type MetaTemplateComponent = {
  type: "HEADER" | "BODY" | "FOOTER" | "BUTTONS";
  format?: string;
  text?: string;
  buttons?: Array<{ type: string; text: string; url?: string; phone_number?: string }>;
};

export type StoredTemplate = {
  id: string;
  name: string;
  status: string;
  category: string;
  language: string;
  components: MetaTemplateComponent[];
  synced_at: string;
  meta_template_id: string;
};

export type SyncResult = {
  ok: boolean;
  synced: number;
  templates?: StoredTemplate[];
  error?: string;
};

export async function syncTemplatesFromMeta(): Promise<SyncResult> {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const businessAccountId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;

  if (!accessToken || !phoneNumberId) {
    return { ok: false, synced: 0, error: "Credenciales de WhatsApp no configuradas." };
  }

  if (!businessAccountId) {
    return {
      ok: false,
      synced: 0,
      error: "Falta WHATSAPP_BUSINESS_ACCOUNT_ID para sincronizar plantillas de WhatsApp.",
    };
  }

  try {
    // Obtener el WABA ID (business account) a partir del phone number
    const phoneRes = await fetch(
      `${BASE_URL}/${phoneNumberId}?fields=id,display_phone_number,verified_name,account_mode`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    const phoneJson = await phoneRes.json();

    if (!phoneRes.ok) {
      return { ok: false, synced: 0, error: phoneJson?.error?.message ?? `HTTP ${phoneRes.status}` };
    }

    // Obtener templates desde el WhatsApp Business Account ID.
    const tmplRes = await fetch(
      `${BASE_URL}/${businessAccountId}/message_templates?fields=id,name,status,category,language,components&limit=100`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    const tmplJson = await tmplRes.json();

    if (!tmplRes.ok) {
      return { ok: false, synced: 0, error: tmplJson?.error?.message ?? `HTTP ${tmplRes.status}` };
    }

    const metaTemplates: MetaTemplate[] = tmplJson?.data ?? [];
    const supabase = getSupabaseAdmin();
    const now = new Date().toISOString();

    const rows = metaTemplates.map((t) => ({
      meta_template_id: t.id,
      name: t.name,
      status: t.status,
      category: t.category,
      language: t.language,
      components: t.components,
      synced_at: now,
    }));

    if (rows.length > 0) {
      const { error } = await supabase
        .from("whatsapp_templates")
        .upsert(rows, { onConflict: "meta_template_id" });

      if (error) {
        return { ok: false, synced: 0, error: error.message };
      }
    }

    // Retornar los templates guardados
    const stored = rows.map((r, i) => ({
      id: metaTemplates[i].id,
      ...r,
    })) as StoredTemplate[];

    return { ok: true, synced: rows.length, templates: stored };
  } catch (err) {
    return { ok: false, synced: 0, error: err instanceof Error ? err.message : "Error inesperado." };
  }
}

export async function getStoredTemplates(): Promise<StoredTemplate[]> {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("whatsapp_templates")
    .select("id, meta_template_id, name, status, category, language, components, synced_at")
    .order("name", { ascending: true });

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id,
    meta_template_id: row.meta_template_id,
    name: row.name,
    status: row.status,
    category: row.category,
    language: row.language,
    components: row.components as MetaTemplateComponent[],
    synced_at: row.synced_at,
  }));
}
