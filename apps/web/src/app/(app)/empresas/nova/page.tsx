import { EmpresaForm } from "./empresa-form";
import { PageHeader } from "@/components/ui/page-header";

export default function NovaEmpresaPage() {
  return (
    <div className="grid gap-6">
      <PageHeader
        backHref="/empresas"
        backLabel="Voltar para empresas"
        breadcrumbs={[
          { label: "Empresas", href: "/empresas" },
          { label: "Nova empresa" },
        ]}
        title="Nova empresa"
        description="Cadastro inicial da empresa cliente e do admin responsável."
      />

      <section className="animate-panel-enter rounded-lg border border-border bg-card p-5 shadow-[var(--shadow-soft)]">
        <EmpresaForm />
      </section>
    </div>
  );
}
