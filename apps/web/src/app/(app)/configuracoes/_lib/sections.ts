import {
  Buildings,
  CalendarDots,
  ChatsCircle,
  FileText,
  Globe,
  Lightning,
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
      `Dados da clínica, estrutura, equipe, serviços e tags de ${name}.`,
    cardDescription:
      "Dados da clínica, unidades, profissionais, serviços, financeiro e tags.",
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
  // A rota continua `tags-automacoes` para não quebrar links; as tags em si
  // agora são geridas em Cadastros > Tags.
  "tags-automacoes": {
    title: "Automações",
    icon: Lightning,
    pageDescription: (name) =>
      `Regras que põem e tiram tags dos pacientes de ${name} a partir de eventos da clínica.`,
    cardDescription: "Regras que põem e tiram tags a partir de eventos.",
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
