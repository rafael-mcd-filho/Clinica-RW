import {
  Buildings,
  CalendarDots,
  ChatsCircle,
  FileText,
  Globe,
  Tag,
  UserGear,
} from "@phosphor-icons/react/dist/ssr";
import type { Icon as PhosphorIcon } from "@phosphor-icons/react";
import type { CompanyConfigurationRoute } from "./server";

type ConfigurationSection = {
  title: string;
  icon: PhosphorIcon;
  pageDescription: (organizationName: string) => string;
  cardDescription: string;
};

/** Fonte única para a identidade visual das seções de Configurações. */
export const configurationSections: Record<
  CompanyConfigurationRoute,
  ConfigurationSection
> = {
  cadastros: {
    title: "Cadastros e operação",
    icon: Buildings,
    pageDescription: (name) =>
      `Dados da clínica, estrutura, equipe e serviços de ${name}.`,
    cardDescription:
      "Dados da clínica, unidades, profissionais, serviços e financeiro.",
  },
  "usuarios-acessos": {
    title: "Usuários e acessos",
    icon: UserGear,
    pageDescription: (name) =>
      `Contas, perfis, permissões e escopos de acesso de ${name}.`,
    cardDescription: "Convites, perfis de permissão e escopos de acesso.",
  },
  agenda: {
    title: "Agenda",
    icon: CalendarDots,
    pageDescription: (name) =>
      `Agendas, disponibilidades e bloqueios de ${name}.`,
    cardDescription: "Agendas, horários de atendimento e bloqueios.",
  },
  "agendamento-online": {
    title: "Agendamento online",
    icon: Globe,
    pageDescription: (name) =>
      `Regras, perfil público e disponibilidade online de ${name}.`,
    cardDescription: "Página pública de agendamento e regras de reserva.",
  },
  whatsapp: {
    title: "WhatsApp",
    icon: ChatsCircle,
    pageDescription: (name) =>
      `Conexão da Evolution API e canal de atendimento de ${name}.`,
    cardDescription: "Conexão da instância e canal de atendimento.",
  },
  "tags-automacoes": {
    title: "Tags e automações",
    icon: Tag,
    pageDescription: (name) =>
      `Tags de pacientes e regras automáticas de ${name}.`,
    cardDescription: "Etiquetas de pacientes e regras automáticas.",
  },
  "modelos-clinicos": {
    title: "Modelos clínicos",
    icon: FileText,
    pageDescription: (name) =>
      `Fichas de atendimento e documentos clínicos de ${name}.`,
    cardDescription: "Templates de prontuário e documentos.",
  },
};

export const configurationSectionRoutes = Object.keys(
  configurationSections,
) as CompanyConfigurationRoute[];
