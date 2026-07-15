import { AgendaSettings } from "../agenda-settings";
import { CompanyConfigurationPage } from "../configuration-page";
import {
  getAgendaSettingsData,
  requireCompanyConfigurationAccess,
} from "../_lib/server";

export default async function AgendaConfiguracoesPage({
  searchParams,
}: {
  searchParams: Promise<{ agenda?: string }>;
}) {
  const params = await searchParams;
  const access = await requireCompanyConfigurationAccess("agenda");
  const agendaSettings = await getAgendaSettingsData(access.organization.id);

  return (
    <CompanyConfigurationPage access={access} route="agenda">
      <AgendaSettings
        data={agendaSettings}
        canConfigure={access.canConfigureAgenda}
        canBlock={access.canBlockAgenda}
        initialScheduleId={params.agenda}
      />
    </CompanyConfigurationPage>
  );
}
