import Link from "next/link";
import { ArrowLeft } from "@phosphor-icons/react/dist/ssr";
import { PatientForm } from "../patient-form";
import { Button } from "@/components/ui/button";
import { requireCompanyPermission } from "@/lib/authz/guards";

export default async function NovoPacientePage() {
  const context = await requireCompanyPermission(["paciente.criar"]);

  return (
    <div className="grid gap-6">
      <section className="flex items-center gap-3">
        <Button asChild variant="secondary" size="icon">
          <Link href="/pacientes" aria-label="Voltar para pacientes">
            <ArrowLeft className="size-4" aria-hidden="true" />
          </Link>
        </Button>
        <div>
          <h1 className="text-xl font-semibold">Novo paciente</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Cadastre os dados necessários para agenda e atendimento.
          </p>
        </div>
      </section>

      <PatientForm
        canSeeSensitive={context.permissionCodes.has(
          "paciente.ver_dados_sensiveis",
        )}
      />
    </div>
  );
}
