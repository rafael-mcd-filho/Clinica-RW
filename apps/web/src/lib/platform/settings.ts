import { cache } from "react";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type PlatformSettings = {
  id: boolean;
  app_name: string;
  primary_color: string;
  logo_url: string | null;
  support_email: string | null;
  support_phone: string | null;
  support_whatsapp: string | null;
  support_url: string | null;
};

const fallbackSettings: PlatformSettings = {
  id: true,
  app_name: "Hi Clinic",
  primary_color: "#1E4FA3",
  logo_url: null,
  support_email: null,
  support_phone: null,
  support_whatsapp: null,
  support_url: null,
};

export const getPlatformSettings = cache(async function getPlatformSettings() {
  try {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase
      .from("platform_settings")
      .select(
        "id, app_name, primary_color, logo_url, support_email, support_phone, support_whatsapp, support_url",
      )
      .eq("id", true)
      .maybeSingle<PlatformSettings>();

    return data ?? fallbackSettings;
  } catch {
    return fallbackSettings;
  }
});
