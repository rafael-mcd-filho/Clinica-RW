import { CompanyConfigurationPage } from "../configuration-page";
import {
  getMessageAutomationData,
  requireCompanyConfigurationAccess,
} from "../_lib/server";
import { MessageAutomationSettings } from "./message-automation-settings";

export default async function MensagensConfiguracoesPage() {
  const access = await requireCompanyConfigurationAccess("mensagens");
  const data = await getMessageAutomationData(access.organization.id);

  return (
    <CompanyConfigurationPage access={access} route="mensagens">
      <MessageAutomationSettings
        rules={data.rules}
        templates={data.templates}
        available={data.available}
      />
    </CompanyConfigurationPage>
  );
}
