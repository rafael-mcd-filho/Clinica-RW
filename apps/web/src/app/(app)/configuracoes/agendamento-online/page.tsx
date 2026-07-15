import { CompanyConfigurationPage } from "../configuration-page";
import { OnlineBookingSettings } from "../online-booking-settings";
import {
  getOnlineBookingSettingsData,
  requireCompanyConfigurationAccess,
} from "../_lib/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function AgendamentoOnlineConfiguracoesPage() {
  const access = await requireCompanyConfigurationAccess("agendamento-online");
  const organizationId = access.organization.id;
  const supabase = await createSupabaseServerClient();
  const [data, schedules, onlineSchedules] = await Promise.all([
    getOnlineBookingSettingsData(organizationId),
    supabase
      .from("schedules")
      .select("id, name, active")
      .eq("organization_id", organizationId)
      .order("active", { ascending: false })
      .order("name")
      .returns<Array<{ id: string; name: string; active: boolean }>>(),
    supabase
      .from("schedule_online_booking_settings")
      .select("schedule_id, enabled")
      .eq("organization_id", organizationId)
      .returns<Array<{ schedule_id: string; enabled: boolean }>>(),
  ]);
  const enabledScheduleIds = new Set(
    (onlineSchedules.data ?? [])
      .filter((schedule) => schedule.enabled)
      .map((schedule) => schedule.schedule_id),
  );

  return (
    <CompanyConfigurationPage access={access} route="agendamento-online">
      <OnlineBookingSettings
        settings={data.settings}
        healthInsurances={data.healthInsurances}
        paymentMethods={data.paymentMethods}
        reviews={data.reviews}
        schedules={(schedules.data ?? []).map((schedule) => ({
          id: schedule.id,
          name: schedule.name,
          active: schedule.active,
          onlineEnabled: schedule.active && enabledScheduleIds.has(schedule.id),
        }))}
      />
    </CompanyConfigurationPage>
  );
}
