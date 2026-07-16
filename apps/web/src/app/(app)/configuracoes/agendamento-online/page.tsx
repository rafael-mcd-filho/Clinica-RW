import { CompanyConfigurationPage } from "../configuration-page";
import { OnlineBookingSettings } from "../online-booking-settings";
import {
  getOnlineBookingSettingsData,
  requireCompanyConfigurationAccess,
} from "../_lib/server";

export default async function AgendamentoOnlineConfiguracoesPage() {
  const access = await requireCompanyConfigurationAccess("agendamento-online");
  const data = await getOnlineBookingSettingsData(access.organization.id);

  return (
    <CompanyConfigurationPage access={access} route="agendamento-online">
      <OnlineBookingSettings
        settings={data.settings}
        healthInsurances={data.healthInsurances}
        paymentMethods={data.paymentMethods}
        reviews={data.reviews}
      />
    </CompanyConfigurationPage>
  );
}
