import { CompanyConfigurationPage } from "../configuration-page";
import { requireCompanyConfigurationAccess } from "../_lib/server";
import { WhatsAppSettings } from "./whatsapp-settings";
import {
  getPlatformEvolutionConfig,
  getStoredInstanceByOrganization,
} from "@/lib/whatsapp/credentials";

export default async function WhatsAppConfigurationPage() {
  const access = await requireCompanyConfigurationAccess("whatsapp");
  const [instance, platformConfig] = await Promise.all([
    getStoredInstanceByOrganization(access.organization.id),
    getPlatformEvolutionConfig(),
  ]);
  return (
    <CompanyConfigurationPage access={access} route="whatsapp">
      <WhatsAppSettings
        initial={{
          status: instance?.status ?? "disconnected",
          phoneNumber: instance?.phone_number ?? null,
          displayName: instance?.display_name ?? null,
          profilePictureUrl: instance?.profile_picture_url ?? null,
          platformConfigured: Boolean(platformConfig),
        }}
      />
    </CompanyConfigurationPage>
  );
}
