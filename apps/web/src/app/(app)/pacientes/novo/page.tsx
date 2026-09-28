import { PatientForm } from "../patient-form";
import { PageHeader } from "@/components/ui/page-header";
import { requireCompanyPermission } from "@/lib/authz/guards";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadPatientInsuranceOptions } from "../insurance-options";

export default async function NovoPacientePage() {
  const context = await requireCompanyPermission(["paciente.criar"]);
  const { options: insurances } = await loadPatientInsuranceOptions(
    await createSupabaseServerClient(),
    context.organization.id,
  );

  return (
    <div className="grid gap-6">
      <PageHeader
        backHref="/pacientes"
        backLabel="Voltar para pacientes"
        breadcrumbs={[
          { label: "Pacientes", href: "/pacientes" },
          { label: "Novo paciente" },
        ]}
        title="Novo paciente"
        description="Cadastre os dados necessários para agenda e atendimento."
      />

      <PatientForm
        canSeeSensitive={context.permissionCodes.has(
          "paciente.ver_dados_sensiveis",
        )}
        insurances={insurances}
      />
    </div>
  );
}
