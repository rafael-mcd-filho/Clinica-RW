import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { EmpresaForm } from "./empresa-form";
import { Button } from "@/components/ui/button";

export default function NovaEmpresaPage() {
  return (
    <div className="grid gap-6">
      <div className="flex items-center gap-3">
        <Button asChild variant="secondary" size="icon" aria-label="Voltar">
          <Link href="/empresas">
            <ArrowLeft className="size-4" aria-hidden="true" />
          </Link>
        </Button>
        <div>
          <h1 className="text-xl font-semibold">Nova empresa</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Cadastro inicial da empresa cliente e do admin responsável.
          </p>
        </div>
      </div>

      <section className="animate-panel-enter rounded-lg border border-border bg-card p-5 shadow-[var(--shadow-soft)]">
        <EmpresaForm />
      </section>
    </div>
  );
}
