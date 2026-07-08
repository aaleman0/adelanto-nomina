import { getSupabaseAdmin } from "@/lib/supabase/server";

export type CompanySettings = Record<string, string>;

export async function getCompanySettings(): Promise<CompanySettings> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("company_settings")
    .select("key, value");

  if (error) {
    throw error;
  }

  const settings: CompanySettings = {};
  for (const row of data ?? []) {
    settings[row.key] = row.value;
  }

  return settings;
}

export async function getCompanySetting(key: string): Promise<string | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("company_settings")
    .select("value")
    .eq("key", key)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data?.value ?? null;
}
