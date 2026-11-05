import { redirect } from "next/navigation";
import { UploadSimple } from "@phosphor-icons/react/dist/ssr";
import { PageHeader } from "@/components/ui/page-header";
import { getRequestContext } from "@/lib/auth/context";
import { PatientImport } from "./patient-import";

export const metadata = { title: "Importar pacientes" };

export default async function ImportPatientsPage() {
  const context = await getRequestContext();
  if (!context.organization || !context.permissionCodes.has("paciente.criar")) {
    redirect("/pacientes");
  }
  return (
    <div className="grid gap-5">
      <PageHeader
        icon={UploadSimple}
        title="Importar pacientes"
        description="Traga a base de outro sistema ou planilha (CSV)."
        breadcrumbs={[
          { label: "Pacientes", href: "/pacientes" },
          { label: "Importar" },
        ]}
      />
      <PatientImport />
    </div>
  );
}
