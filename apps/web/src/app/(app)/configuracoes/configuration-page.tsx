import {
  Building2,
  CalendarDays,
  ClipboardList,
  Globe2,
  Settings,
  Tags,
  type LucideIcon,
} from "lucide-react";
import type {
  CompanyConfigurationAccess,
  CompanyConfigurationRoute,
} from "./_lib/server";
import { PageHeader } from "@/components/ui/page-header";

const pageMetadata: Record<
  CompanyConfigurationRoute,
  {
    title: string;
    icon: LucideIcon;
    description: (organizationName: string) => string;
  }
> = {
  cadastros: {
    title: "Cadastros e operação",
    icon: Building2,
    description: (name) =>
      `Dados da clínica, estrutura, equipe e serviços de ${name}.`,
  },
  agenda: {
    title: "Agenda",
    icon: CalendarDays,
    description: (name) => `Agendas, disponibilidades e bloqueios de ${name}.`,
  },
  "agendamento-online": {
    title: "Agendamento online",
    icon: Globe2,
    description: (name) =>
      `Regras, perfil público e disponibilidade online de ${name}.`,
  },
  "tags-automacoes": {
    title: "Tags e automações",
    icon: Tags,
    description: (name) => `Tags de pacientes e regras automáticas de ${name}.`,
  },
  "modelos-clinicos": {
    title: "Modelos clínicos",
    icon: ClipboardList,
    description: (name) =>
      `Fichas de atendimento e documentos clínicos de ${name}.`,
  },
};

export function CompanyConfigurationPage({
  access,
  children,
  route,
}: {
  access: CompanyConfigurationAccess;
  children: React.ReactNode;
  route: CompanyConfigurationRoute;
}) {
  const metadata = pageMetadata[route];

  return (
    <div className="grid min-w-0 gap-6">
      <PageHeader
        icon={metadata.icon}
        title={metadata.title}
        description={metadata.description(access.organization.name)}
      />
      {children}
    </div>
  );
}

export function UnavailableConfigurationPage() {
  return (
    <div className="grid gap-6">
      <PageHeader
        icon={Settings}
        title="Configurações"
        description="Seu perfil não permite alterar configurações disponíveis nesta tela."
      />
    </div>
  );
}
