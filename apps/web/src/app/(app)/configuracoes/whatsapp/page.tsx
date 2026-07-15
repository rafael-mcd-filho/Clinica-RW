import { CompanyConfigurationPage } from "../configuration-page";
import { requireCompanyConfigurationAccess } from "../_lib/server";
import { WhatsAppSettings } from "./whatsapp-settings";
import { getStoredInstanceByOrganization } from "@/lib/whatsapp/credentials";

export default async function WhatsAppConfigurationPage() {
  const access = await requireCompanyConfigurationAccess("whatsapp");
  const instance = await getStoredInstanceByOrganization(access.organization.id);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, "") ?? "";
  return (
    <CompanyConfigurationPage access={access} route="whatsapp">
      <WhatsAppSettings
        initial={{
          apiUrl: instance?.evolution_api_url ?? process.env.EVOLUTION_API_URL ?? "",
          instance: instance?.evolution_instance_name ?? process.env.EVOLUTION_INSTANCE ?? "",
          hasApiKey: Boolean(instance?.api_key_encrypted),
          status: instance?.status ?? "disconnected",
          webhookUrl: instance?.webhook_url ?? "",
          configured: Boolean(instance?.api_key_encrypted),
        }}
        suggestedWebhookUrl={appUrl ? `${appUrl}/api/whatsapp/webhook` : ""}
      />
    </CompanyConfigurationPage>
  );
}
