import { CompanyConfigurationPage } from "../configuration-page";
import { PatientTagAutomationSettings } from "../patient-tag-automation-settings";
import {
  getPatientTagAutomationData,
  requireCompanyConfigurationAccess,
} from "../_lib/server";

export default async function TagsAutomacoesConfiguracoesPage() {
  const access = await requireCompanyConfigurationAccess("tags-automacoes");
  const data = await getPatientTagAutomationData(access.organization.id);

  return (
    <CompanyConfigurationPage access={access} route="tags-automacoes">
      <PatientTagAutomationSettings data={data} />
    </CompanyConfigurationPage>
  );
}
