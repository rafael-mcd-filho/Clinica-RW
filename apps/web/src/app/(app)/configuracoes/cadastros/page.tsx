import { CompanySettings } from "../company-settings";
import { CompanyConfigurationPage } from "../configuration-page";
import { requireCompanyConfigurationAccess } from "../_lib/server";
import { getCompanySettingsData } from "@/lib/clinic/base-registrations";

export default async function CadastrosConfiguracoesPage() {
  const access = await requireCompanyConfigurationAccess("cadastros");
  const companyData = await getCompanySettingsData({
    id: access.organization.id,
    name: access.organization.name,
    mode: access.organization.mode === "clinic" ? "clinic" : "solo",
  });

  return (
    <CompanyConfigurationPage access={access} route="cadastros">
      <CompanySettings
        data={companyData}
        organizationLogoUrl={access.organization.logo_url}
      />
    </CompanyConfigurationPage>
  );
}
