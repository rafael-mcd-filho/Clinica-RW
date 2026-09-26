import { CompanySettings } from "../company-settings";
import { CompanyConfigurationPage } from "../configuration-page";
import {
  getTagSettingsData,
  requireCompanyConfigurationAccess,
} from "../_lib/server";
import { getCompanySettingsData } from "@/lib/clinic/base-registrations";

export default async function CadastrosConfiguracoesPage() {
  const access = await requireCompanyConfigurationAccess("cadastros");
  const [companyData, tags] = await Promise.all([
    getCompanySettingsData({
      id: access.organization.id,
      name: access.organization.name,
      mode: access.organization.mode === "clinic" ? "clinic" : "solo",
    }),
    getTagSettingsData(),
  ]);

  return (
    <CompanyConfigurationPage access={access} route="cadastros">
      <CompanySettings
        data={companyData}
        tags={tags}
        organizationLogoUrl={access.organization.logo_url}
        canManageUsers={access.canManageUsers}
      />
    </CompanyConfigurationPage>
  );
}
