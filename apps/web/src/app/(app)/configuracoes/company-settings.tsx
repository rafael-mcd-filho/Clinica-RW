"use client";

import {
  useActionState,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  Package as Boxes,
  Buildings as Building2,
  CheckCircle as CheckCircle2,
  Clock as Clock3,
  PencilSimple as Pencil,
  Plus,
  FloppyDisk as Save,
  Stethoscope,
  UsersThree as UsersRound,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import {
  completeOnboarding,
  saveBusinessHours,
  saveClinicSettings,
  saveRegistration,
  setRegistrationActive,
  type CompanyActionState,
  type RegistrationKind,
} from "./company-actions";
import {
  PaymentMethodsSettings,
  ProcedureCostsSection,
} from "./financial-catalog-settings";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input, Select, Textarea } from "@/components/ui/field";
import { MaskedInput } from "@/components/ui/masked-input";
import { FormError } from "@/components/ui/form-error";
import { HelpTooltip } from "@/components/ui/help-tooltip";
import { LogoUploadField } from "@/components/ui/logo-upload-field";
import { Modal } from "@/components/ui/modal";
import { RequiredMark } from "@/components/ui/required-mark";
import { Switch } from "@/components/ui/switch";
import { Tabs } from "@/components/ui/tabs";
import type {
  BaseRow,
  BusinessHourRow,
  CompanySettingsData,
} from "@/lib/clinic/base-registrations";

const initialState: CompanyActionState = {};

type EditableRow = BaseRow & Record<string, string | number | boolean | null>;
type Option = { value: string; label: string };
type FieldDefinition = {
  name: string;
  label: string;
  type?: "text" | "email" | "number" | "textarea" | "select";
  required?: boolean;
  placeholder?: string;
  options?: Option[];
  min?: number;
  max?: number;
  step?: string;
  wide?: boolean;
  help?: React.ReactNode;
};

const weekdays = [
  "Domingo",
  "Segunda-feira",
  "Terça-feira",
  "Quarta-feira",
  "Quinta-feira",
  "Sexta-feira",
  "Sábado",
];

const brazilianStates = [
  ["AC", "Acre"],
  ["AL", "Alagoas"],
  ["AP", "Amapá"],
  ["AM", "Amazonas"],
  ["BA", "Bahia"],
  ["CE", "Ceará"],
  ["DF", "Distrito Federal"],
  ["ES", "Espírito Santo"],
  ["GO", "Goiás"],
  ["MA", "Maranhão"],
  ["MT", "Mato Grosso"],
  ["MS", "Mato Grosso do Sul"],
  ["MG", "Minas Gerais"],
  ["PA", "Pará"],
  ["PB", "Paraíba"],
  ["PR", "Paraná"],
  ["PE", "Pernambuco"],
  ["PI", "Piauí"],
  ["RJ", "Rio de Janeiro"],
  ["RN", "Rio Grande do Norte"],
  ["RS", "Rio Grande do Sul"],
  ["RO", "Rondônia"],
  ["RR", "Roraima"],
  ["SC", "Santa Catarina"],
  ["SP", "São Paulo"],
  ["SE", "Sergipe"],
  ["TO", "Tocantins"],
] as const;

export function CompanySettings({
  data,
  organizationLogoUrl,
}: {
  data: CompanySettingsData;
  organizationLogoUrl: string | null;
}) {
  const checklist = [
    { label: "Dados da clínica", done: Boolean(data.clinic.trade_name) },
    { label: "Unidade ativa", done: data.units.some((item) => item.active) },
    {
      label: "Profissional ativo",
      done: data.professionals.some((item) => item.active),
    },
    {
      label: "Procedimento ativo",
      done: data.procedures.some((item) => item.active),
    },
    {
      label: "Horário configurado",
      done: data.businessHours.some(
        (item) => !item.unit_id && !item.professional_id && item.active,
      ),
    },
  ];

  const unitOptions = data.units.map((item) => ({
    value: item.id,
    label: item.name,
  }));
  const specialtyOptions = data.specialties.map((item) => ({
    value: item.id,
    label: item.name,
  }));
  const userOptions = data.users.map((item) => ({
    value: item.id,
    label: `${item.name} · ${item.email}`,
  }));
  return (
    <div className="grid gap-6">
      {!data.settings.onboarding_completed_at ? (
        <OnboardingCard checklist={checklist} mode={data.organization.mode} />
      ) : null}

      <Tabs
        ariaLabel="Cadastros da clínica"
        urlParam="section"
        items={[
          {
            id: "clinica",
            label: "Clínica e horários",
            icon: <Building2 />,
            content: (
              <div className="grid gap-5">
                <ClinicForm
                  data={data}
                  organizationLogoUrl={organizationLogoUrl}
                />
                <BusinessHoursForm hours={data.businessHours} />
              </div>
            ),
          },
          {
            id: "estrutura",
            label: "Estrutura",
            icon: <Boxes />,
            content: (
              <div className="grid gap-5">
                <RegistrationSection
                  kind="unit"
                  title="Unidades"
                  itemLabel="Unidade"
                  modalForm
                  description="Endereços físicos onde a clínica atende."
                  rows={data.units as EditableRow[]}
                  fields={unitFields}
                  summary={(row) =>
                    [row.code, row.city, row.state]
                      .filter(Boolean)
                      .join(" · ") || "Unidade de atendimento"
                  }
                />
                <RegistrationSection
                  kind="room"
                  title="Salas"
                  itemLabel="Sala"
                  modalForm
                  description="Consultórios e ambientes vinculados a uma unidade."
                  rows={data.rooms as EditableRow[]}
                  fields={[
                    selectField("unit_id", "Unidade", unitOptions, true),
                    textField("name", "Nome", true, "Consultório 1"),
                    textareaField("description", "Descrição"),
                  ]}
                  summary={(row) =>
                    optionLabel(unitOptions, String(row.unit_id ?? ""))
                  }
                />
                <RegistrationSection
                  kind="equipment"
                  title="Equipamentos"
                  itemLabel="Equipamento"
                  itemGender="masculine"
                  modalForm
                  description="Recursos compartilhados usados nos atendimentos."
                  rows={data.equipment as EditableRow[]}
                  fields={[
                    selectField("unit_id", "Unidade", unitOptions),
                    textField("name", "Nome", true, "Ultrassom"),
                    textareaField("description", "Descrição"),
                  ]}
                  summary={(row) =>
                    optionLabel(unitOptions, String(row.unit_id ?? "")) ||
                    "Disponível em qualquer unidade"
                  }
                />
              </div>
            ),
          },
          {
            id: "equipe",
            label: "Equipe",
            icon: <UsersRound />,
            content: (
              <div className="grid gap-5">
                <RegistrationSection
                  kind="specialty"
                  title="Especialidades"
                  itemLabel="Especialidade"
                  modalForm
                  description="Especialidades usadas na equipe e no prontuário."
                  rows={data.specialties as EditableRow[]}
                  fields={[
                    textField("name", "Nome", true, "Clínica geral"),
                    {
                      ...textField("cbo_code", "Código CBO"),
                      help: "Código da ocupação na Classificação Brasileira de Ocupações, usado em integrações e documentos assistenciais.",
                    },
                  ]}
                  summary={(row) =>
                    row.cbo_code ? `CBO ${row.cbo_code}` : "Sem CBO informado"
                  }
                />
                <RegistrationSection
                  kind="professional"
                  title="Profissionais"
                  itemLabel="Profissional"
                  itemGender="masculine"
                  modalForm
                  description="Profissionais assistenciais que terão agenda e atendimentos."
                  rows={data.professionals as EditableRow[]}
                  fields={[
                    {
                      ...selectField(
                        "user_id",
                        "Usuário vinculado",
                        userOptions,
                      ),
                      help: "Permite que este usuário acesse a própria agenda e seja identificado nas ações do profissional.",
                    },
                    textField("name", "Nome", true, "Nome do profissional"),
                    selectField(
                      "specialty_id",
                      "Especialidade principal",
                      specialtyOptions,
                    ),
                    textField("council_type", "Conselho", false, "CRM"),
                    textField("council_number", "Número do conselho"),
                    textField("council_state", "UF do conselho", false, "CE"),
                  ]}
                  summary={(row) => {
                    const specialty = optionLabel(
                      specialtyOptions,
                      String(row.specialty_id ?? ""),
                    );
                    const council = [row.council_type, row.council_number]
                      .filter(Boolean)
                      .join(" ");
                    return (
                      [specialty, council].filter(Boolean).join(" · ") ||
                      "Profissional"
                    );
                  }}
                />
              </div>
            ),
          },
          {
            id: "servicos",
            label: "Procedimentos e serviços",
            icon: <Stethoscope />,
            content: (
              <div className="grid gap-5">
                <RegistrationSection
                  kind="procedure"
                  title="Procedimentos e serviços"
                  itemLabel="Procedimento ou serviço"
                  itemGender="masculine"
                  modalForm
                  description="Itens que poderão ser agendados e cobrados."
                  rows={data.procedures as EditableRow[]}
                  fields={[
                    textField("name", "Nome", true, "Consulta"),
                    textField("code", "Código interno"),
                    {
                      ...numberField(
                        "duration_minutes",
                        "Duração (min)",
                        30,
                        5,
                        1440,
                      ),
                      help: "Tempo reservado na agenda ao selecionar este procedimento.",
                    },
                    {
                      ...numberField(
                        "base_price",
                        "Preço padrão particular (R$)",
                        0,
                        0,
                        undefined,
                        "0.01",
                      ),
                      help: "Valor padrão do procedimento para atendimentos particulares.",
                    },
                  ]}
                  summary={(row) =>
                    `${row.duration_minutes} min · ${formatCurrency(Number(row.base_price))}`
                  }
                />
                <ProcedureCostsSection
                  procedures={data.procedures}
                  costs={data.procedureCosts}
                />
                <PaymentMethodsSettings
                  methods={data.paymentMethods}
                  fees={data.paymentMethodFees}
                />
                <RegistrationSection
                  kind="health_insurance"
                  title="Convênios"
                  itemLabel="Convênio"
                  itemGender="masculine"
                  modalForm
                  description="Planos de saúde aceitos pela clínica. Atendimento particular não precisa ser cadastrado como convênio."
                  rows={data.healthInsurances as EditableRow[]}
                  fields={[
                    textField("name", "Nome", true, "Convênio"),
                    textField("document", "CNPJ"),
                  ]}
                  summary={(row) =>
                    String(row.document ?? "Sem CNPJ informado")
                  }
                />
              </div>
            ),
          },
        ]}
      />
    </div>
  );
}

function OnboardingCard({
  checklist,
  mode,
}: {
  checklist: Array<{ label: string; done: boolean }>;
  mode: "solo" | "clinic";
}) {
  const [state, action, pending] = useActionState(
    completeOnboarding,
    initialState,
  );
  const doneCount = checklist.filter((item) => item.done).length;

  useEffect(() => {
    if (state.success) toast.success(state.success);
  }, [state]);

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-semibold">Configuração inicial</h2>
            <Badge variant="primary">{`${doneCount}/${checklist.length}`}</Badge>
            <Badge variant="neutral">
              {mode === "solo" ? "Modo solo" : "Modo clínica"}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Complete estes dados para liberar pacientes e agenda.
          </p>
        </div>
        <form action={action}>
          <Button
            type="submit"
            disabled={pending || doneCount < checklist.length}
          >
            <CheckCircle2 className="size-4" aria-hidden="true" />
            {pending ? "Concluindo..." : "Concluir configuração"}
          </Button>
        </form>
      </CardHeader>
      <CardContent>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          {checklist.map((item) => (
            <div
              key={item.label}
              className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm"
            >
              <span
                className={`size-2 rounded-full ${item.done ? "bg-success" : "bg-border-strong"}`}
              />
              {item.label}
            </div>
          ))}
        </div>
        <FormError message={state.error} className="mt-3" />
      </CardContent>
    </Card>
  );
}

function ClinicForm({
  data,
  organizationLogoUrl,
}: {
  data: CompanySettingsData;
  organizationLogoUrl: string | null;
}) {
  const [state, action, pending] = useActionState(
    saveClinicSettings,
    initialState,
  );
  const [automaticMode, setAutomaticMode] = useState(
    data.settings.automatic_mode,
  );
  const [manualMode, setManualMode] = useState<"solo" | "clinic">(
    data.organization.mode,
  );
  const activeProfessionalCount = data.professionals.filter(
    (professional) => professional.active,
  ).length;
  const automaticallyDetectedMode =
    activeProfessionalCount > 1 ? "clinic" : "solo";
  const effectiveMode = automaticMode ? automaticallyDetectedMode : manualMode;

  useEffect(() => {
    if (state.success) toast.success(state.success);
  }, [state]);

  return (
    <Card>
      <CardHeader>
        <h2 className="font-semibold">Dados da clínica</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Identificação, contato, endereço e modo de operação.
        </p>
      </CardHeader>
      <CardContent>
        <form action={action} className="grid gap-5">
          <div className="grid gap-2">
            <span className="text-sm font-medium">Logo da clínica</span>
            <LogoUploadField currentUrl={organizationLogoUrl} />
            <p className="text-xs text-muted-foreground">
              A logo será usada na identificação da empresa, nos documentos e
              nas páginas públicas da clínica.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <FormField label="Nome fantasia" required wide>
              <Input
                name="trade_name"
                required
                defaultValue={data.clinic.trade_name}
              />
            </FormField>
            <FormField label="Razão social" wide>
              <Input
                name="legal_name"
                defaultValue={data.clinic.legal_name ?? ""}
              />
            </FormField>
            <FormField label="CNPJ">
              <MaskedInput
                name="document"
                maskKind="cnpj"
                inputMode="numeric"
                placeholder="00.000.000/0000-00"
                autoComplete="off"
                defaultValue={data.clinic.document ?? ""}
              />
            </FormField>
            <FormField label="Telefone">
              <MaskedInput
                name="phone"
                maskKind="phone"
                inputMode="tel"
                placeholder="(85) 90000-0000"
                autoComplete="tel"
                defaultValue={data.clinic.phone ?? ""}
              />
            </FormField>
            <FormField label="E-mail">
              <Input
                name="email"
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder="contato@clinica.com.br"
                defaultValue={data.clinic.email ?? ""}
              />
            </FormField>
            <FormField label="CEP">
              <MaskedInput
                name="postal_code"
                maskKind="cep"
                inputMode="numeric"
                autoComplete="postal-code"
                placeholder="00000-000"
                defaultValue={data.clinic.postal_code ?? ""}
              />
            </FormField>
            <FormField label="Endereço" wide>
              <Input
                name="address_line"
                autoComplete="address-line1"
                defaultValue={data.clinic.address_line ?? ""}
              />
            </FormField>
            <FormField label="Número">
              <Input
                name="address_number"
                inputMode="numeric"
                defaultValue={data.clinic.address_number ?? ""}
              />
            </FormField>
            <FormField label="Complemento">
              <Input
                name="address_complement"
                autoComplete="address-line2"
                defaultValue={data.clinic.address_complement ?? ""}
              />
            </FormField>
            <FormField label="Bairro">
              <Input
                name="district"
                autoComplete="address-level3"
                defaultValue={data.clinic.district ?? ""}
              />
            </FormField>
            <FormField label="Cidade">
              <Input
                name="city"
                autoComplete="address-level2"
                defaultValue={data.clinic.city ?? ""}
              />
            </FormField>
            <FormField label="UF">
              <Select name="state" defaultValue={data.clinic.state ?? ""}>
                <option value="">Selecione a UF</option>
                {brazilianStates.map(([code, name]) => (
                  <option key={code} value={code}>
                    {code} — {name}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField
              label="Fuso horário"
              required
              help="Define a data e o horário usados na agenda, nos filtros, nos relatórios e nos comparativos do painel."
            >
              <Select name="timezone" defaultValue={data.settings.timezone}>
                <option value="America/Fortaleza">Fortaleza</option>
                <option value="America/Sao_Paulo">São Paulo</option>
                <option value="America/Manaus">Manaus</option>
                <option value="America/Rio_Branco">Rio Branco</option>
              </Select>
            </FormField>
            <FormField label="Idioma" required>
              <Select name="locale" defaultValue={data.settings.locale}>
                <option value="pt-BR">Português (Brasil)</option>
              </Select>
            </FormField>
          </div>

          <section className="grid gap-4 rounded-md border border-border bg-background p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-semibold">Modo de operação</h3>
                  <Badge variant="primary">
                    {effectiveMode === "solo"
                      ? "Profissional solo"
                      : "Clínica multiprofissional"}
                  </Badge>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  Classifica a estrutura da operação; não substitui perfis,
                  permissões ou escopos de acesso.
                </p>
              </div>
              <Switch
                name="automatic_mode"
                label="Detectar automaticamente"
                checked={automaticMode}
                onCheckedChange={setAutomaticMode}
              />
            </div>

            <div className="rounded-md bg-muted/35 px-3 py-2 text-sm text-muted-foreground">
              {automaticMode ? (
                <p>
                  <strong className="font-medium text-foreground">
                    Detecção automática ativa:
                  </strong>{" "}
                  {activeProfessionalCount} profissional
                  {activeProfessionalCount === 1 ? " ativo" : "ais ativos"}. Até
                  1 resulta em Solo; a partir de 2, em Clínica.
                </p>
              ) : (
                <p>
                  <strong className="font-medium text-foreground">
                    Definição manual ativa:
                  </strong>{" "}
                  o modo escolhido permanecerá fixo mesmo se a quantidade de
                  profissionais mudar.
                </p>
              )}
            </div>

            {automaticMode ? (
              <input
                type="hidden"
                name="manual_mode"
                value={data.organization.mode}
                readOnly
              />
            ) : null}

            <div className="grid gap-3 md:grid-cols-2">
              <OperationModeOption
                mode="solo"
                selected={effectiveMode === "solo"}
                disabled={automaticMode}
                name={automaticMode ? undefined : "manual_mode"}
                checked={!automaticMode && manualMode === "solo"}
                onChange={() => setManualMode("solo")}
                icon={Stethoscope}
                title="Profissional solo"
                description="Para uma operação centrada em um único profissional, mesmo que exista secretária ou equipe de apoio."
                rule="No automático: até 1 profissional ativo."
              />
              <OperationModeOption
                mode="clinic"
                selected={effectiveMode === "clinic"}
                disabled={automaticMode}
                name={automaticMode ? undefined : "manual_mode"}
                checked={!automaticMode && manualMode === "clinic"}
                onChange={() => setManualMode("clinic")}
                icon={UsersRound}
                title="Clínica multiprofissional"
                description="Para operações com vários profissionais, agendas e análises organizadas por responsável."
                rule="No automático: 2 ou mais profissionais ativos."
              />
            </div>

            <p className="rounded-md border border-primary/20 bg-primary-muted/35 px-3 py-2 text-xs text-muted-foreground">
              <strong className="font-semibold text-foreground">
                Implicação atual:
              </strong>{" "}
              trocar o modo não altera o plano, não concede permissões e não
              exclui pacientes, agendas ou cadastros. Os mesmos recursos
              continuam disponíveis; a segurança permanece definida pelos perfis
              e escopos dos usuários.
            </p>
          </section>

          <FormError message={state.error} />
          <div className="flex justify-end">
            <Button type="submit" disabled={pending}>
              <Save className="size-4" aria-hidden="true" />
              {pending ? "Salvando..." : "Salvar clínica"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function BusinessHoursForm({ hours }: { hours: BusinessHourRow[] }) {
  const [state, action, pending] = useActionState(
    saveBusinessHours,
    initialState,
  );
  const clinicHours = useMemo(
    () =>
      new Map(
        hours
          .filter((item) => !item.unit_id && !item.professional_id)
          .map((item) => [item.weekday, item]),
      ),
    [hours],
  );

  useEffect(() => {
    if (state.success) toast.success(state.success);
  }, [state]);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Clock3 className="size-4 text-primary" aria-hidden="true" />
          <h2 className="font-semibold">Horários de funcionamento</h2>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Referência geral da clínica. Não abre nem bloqueia horários; cada
          agenda possui sua própria disponibilidade e regras online.
        </p>
      </CardHeader>
      <CardContent>
        <form action={action} className="grid gap-4">
          <div className="grid gap-2">
            <div className="hidden grid-cols-[10.5rem_minmax(16rem,0.9fr)_minmax(19rem,1.1fr)] gap-3 px-3 text-xs font-medium text-muted-foreground lg:grid">
              <span>Dia</span>
              <span>Funcionamento</span>
              <span>Intervalo</span>
            </div>
            {weekdays.map((label, weekday) => {
              const hour = clinicHours.get(weekday);
              return (
                <BusinessHourDay
                  key={label}
                  weekday={weekday}
                  label={label}
                  hour={hour}
                />
              );
            })}
          </div>
          <FormError message={state.error} />
          <div className="flex justify-end">
            <Button type="submit" disabled={pending}>
              <Save className="size-4" aria-hidden="true" />
              {pending ? "Salvando..." : "Salvar horários"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function BusinessHourDay({
  weekday,
  label,
  hour,
}: {
  weekday: number;
  label: string;
  hour?: BusinessHourRow;
}) {
  const [enabled, setEnabled] = useState(Boolean(hour?.active));
  const [lunchEnabled, setLunchEnabled] = useState(
    Boolean(hour?.lunch_start_time && hour?.lunch_end_time),
  );

  return (
    <section className="rounded-md border border-border px-3 py-2.5">
      <div className="grid min-w-0 gap-2.5 lg:grid-cols-[10.5rem_minmax(16rem,0.9fr)_minmax(19rem,1.1fr)] lg:items-center lg:gap-3">
        <Checkbox
          name={`enabled_${weekday}`}
          checked={enabled}
          onChange={(event) => setEnabled(event.target.checked)}
          label={label}
        />
        {enabled ? (
          <>
            <div className="flex min-w-0 items-center gap-2">
              <Input
                aria-label={`Abertura de ${label}`}
                name={`start_${weekday}`}
                type="time"
                defaultValue={hour?.start_time.slice(0, 5) ?? "08:00"}
                className="min-w-0 flex-1"
                required
              />
              <span className="shrink-0 text-xs text-muted-foreground">às</span>
              <Input
                aria-label={`Fechamento de ${label}`}
                name={`end_${weekday}`}
                type="time"
                defaultValue={hour?.end_time.slice(0, 5) ?? "18:00"}
                className="min-w-0 flex-1"
                required
              />
            </div>

            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <Switch
                checked={lunchEnabled}
                label="Almoço"
                onCheckedChange={setLunchEnabled}
              />
              <input
                type="hidden"
                name={`lunch_enabled_${weekday}`}
                value={lunchEnabled ? "on" : "off"}
              />
              {lunchEnabled ? (
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <Input
                    aria-label={`Início da pausa de ${label}`}
                    name={`lunch_start_${weekday}`}
                    type="time"
                    defaultValue={
                      hour?.lunch_start_time?.slice(0, 5) ?? "12:00"
                    }
                    className="min-w-0 flex-1"
                    required
                  />
                  <span className="shrink-0 text-xs text-muted-foreground">
                    às
                  </span>
                  <Input
                    aria-label={`Fim da pausa de ${label}`}
                    name={`lunch_end_${weekday}`}
                    type="time"
                    defaultValue={hour?.lunch_end_time?.slice(0, 5) ?? "13:00"}
                    className="min-w-0 flex-1"
                    required
                  />
                </div>
              ) : (
                <span className="text-xs text-muted-foreground">Sem pausa</span>
              )}
            </div>
          </>
        ) : (
          <p className="text-sm text-muted-foreground lg:col-span-2">Fechado</p>
        )}
      </div>
    </section>
  );
}

function OperationModeOption({
  mode,
  selected,
  disabled,
  name,
  checked,
  onChange,
  icon: Icon,
  title,
  description,
  rule,
}: {
  mode: "solo" | "clinic";
  selected: boolean;
  disabled: boolean;
  name?: string;
  checked: boolean;
  onChange: () => void;
  icon: typeof Stethoscope;
  title: string;
  description: string;
  rule: string;
}) {
  return (
    <label
      className={`relative flex min-w-0 gap-3 rounded-md border p-3 transition-colors ${
        selected
          ? "border-primary bg-primary-muted/35"
          : "border-border bg-card"
      } ${disabled ? "cursor-default" : "cursor-pointer hover:border-primary/50"}`}
    >
      <input
        type="radio"
        name={name}
        value={mode}
        checked={checked}
        disabled={disabled}
        onChange={onChange}
        className="sr-only"
      />
      <span
        className={`grid size-9 shrink-0 place-items-center rounded-md ${
          selected
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-muted-foreground"
        }`}
      >
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold">{title}</span>
        <span className="mt-1 block text-xs leading-5 text-muted-foreground">
          {description}
        </span>
        <span className="mt-2 block text-xs font-medium text-foreground">
          {rule}
        </span>
      </span>
    </label>
  );
}

function RegistrationSection({
  kind,
  title,
  description,
  rows,
  fields,
  summary,
  modalForm = false,
  itemLabel = "Cadastro",
  itemGender = "feminine",
}: {
  kind: Exclude<RegistrationKind, "price_item">;
  title: string;
  description: string;
  rows: EditableRow[];
  fields: FieldDefinition[];
  summary: (row: EditableRow) => string;
  modalForm?: boolean;
  itemLabel?: string;
  itemGender?: "feminine" | "masculine";
}) {
  const [editing, setEditing] = useState<EditableRow | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const itemLabelLower = itemLabel.toLowerCase();
  const feminineItem = itemGender === "feminine";
  const finishEditing = useCallback(() => {
    setEditing(null);
    setFormOpen(false);
  }, []);

  function openNewRegistration() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEditRegistration(row: EditableRow) {
    setEditing(row);
    setFormOpen(true);
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">{title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Badge variant="neutral">{rows.length}</Badge>
            {modalForm ? (
              <Button type="button" size="sm" onClick={openNewRegistration}>
                <Plus className="size-3.5" aria-hidden="true" />
                Adicionar
              </Button>
            ) : null}
          </div>
        </div>
      </CardHeader>
      <CardContent className={modalForm ? "grid gap-3 py-3" : "grid gap-5"}>
        {!modalForm ? (
          <RegistrationForm
            key={editing?.id ?? "new"}
            kind={kind}
            fields={fields}
            editing={editing}
            onFinished={finishEditing}
          />
        ) : null}

        <div
          className={
            rows.length && modalForm
              ? "divide-y divide-border overflow-hidden rounded-md border border-border"
              : "grid gap-2"
          }
        >
          {rows.length ? (
            rows.map((row) => (
              <div
                key={row.id}
                className={
                  modalForm
                    ? "flex min-h-12 flex-col gap-2 px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
                    : "flex flex-col gap-3 rounded-md border border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                }
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-medium">
                      {String(row.name)}
                    </p>
                    <Badge variant={row.active ? "success" : "neutral"}>
                      {row.active ? "Ativo" : "Inativo"}
                    </Badge>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {summary(row)}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() =>
                      modalForm ? openEditRegistration(row) : setEditing(row)
                    }
                  >
                    <Pencil className="size-3.5" aria-hidden="true" />
                    Editar
                  </Button>
                  <form
                    action={setRegistrationActive.bind(
                      null,
                      kind,
                      row.id,
                      !row.active,
                    )}
                  >
                    <Button type="submit" size="sm" variant="ghost">
                      {row.active ? "Desativar" : "Ativar"}
                    </Button>
                  </form>
                </div>
              </div>
            ))
          ) : (
            <p className="rounded-md border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
              Nenhum cadastro nesta seção.
            </p>
          )}
        </div>
      </CardContent>

      {modalForm ? (
        <Modal
          open={formOpen}
          onClose={finishEditing}
          title={
            editing
              ? `Editar ${itemLabelLower}`
              : `${feminineItem ? "Nova" : "Novo"} ${itemLabelLower}`
          }
          description={
            editing
              ? `Atualize os dados de ${String(editing.name)}.`
              : `Cadastre ${feminineItem ? "uma nova" : "um novo"} ${itemLabelLower} na estrutura da clínica.`
          }
          className={
            kind === "unit"
              ? "max-w-3xl"
              : kind === "professional"
                ? "max-w-2xl"
                : kind === "specialty"
                  ? "max-w-lg"
                  : "max-w-xl"
          }
        >
          <RegistrationForm
            key={editing?.id ?? "new"}
            kind={kind}
            fields={fields}
            editing={editing}
            onFinished={finishEditing}
            modal
          />
        </Modal>
      ) : null}
    </Card>
  );
}

function RegistrationForm({
  kind,
  fields,
  editing,
  onFinished,
  modal = false,
}: {
  kind: Exclude<RegistrationKind, "price_item">;
  fields: FieldDefinition[];
  editing: EditableRow | null;
  onFinished: () => void;
  modal?: boolean;
}) {
  const boundAction = saveRegistration.bind(null, kind, editing?.id ?? null);
  const [state, action, pending] = useActionState(boundAction, initialState);

  useEffect(() => {
    if (state.success) {
      toast.success(state.success);
      onFinished();
    }
  }, [state, onFinished]);

  return (
    <form
      action={action}
      className={
        modal
          ? "grid gap-4"
          : "rounded-md border border-border bg-background p-4"
      }
    >
      {!modal ? (
        <div className="mb-4 flex items-center justify-between gap-3">
          <p className="text-sm font-semibold">
            {editing ? `Editar ${String(editing.name)}` : "Novo cadastro"}
          </p>
          {editing ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onFinished}
            >
              Cancelar edição
            </Button>
          ) : null}
        </div>
      ) : null}
      <div
        className={
          modal
            ? "grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]"
            : "grid gap-4 md:grid-cols-2 lg:grid-cols-3"
        }
      >
        {fields.map((field, index) => (
          <DynamicField
            key={field.name}
            field={field}
            row={editing}
            compact={modal}
            helpAlign={modal && index % 2 === 1 ? "end" : "start"}
          />
        ))}
      </div>
      <FormError message={state.error} className="mt-3" />
      <div className="mt-2 flex justify-end gap-2 border-t border-border pt-4">
        {modal ? (
          <Button type="button" variant="secondary" onClick={onFinished}>
            Cancelar
          </Button>
        ) : null}
        <Button type="submit" size="sm" disabled={pending}>
          {editing ? (
            <Save className="size-3.5" />
          ) : (
            <Plus className="size-3.5" />
          )}
          {pending
            ? "Salvando..."
            : editing
              ? "Salvar alterações"
              : "Adicionar"}
        </Button>
      </div>
    </form>
  );
}

function DynamicField({
  field,
  row,
  compact = false,
  helpAlign = "start",
}: {
  field: FieldDefinition;
  row: EditableRow | null;
  compact?: boolean;
  helpAlign?: "start" | "end";
}) {
  const value = row?.[field.name];
  const defaultValue = value == null ? "" : String(value);

  return (
    <FormField
      label={field.label}
      required={field.required}
      wide={field.wide}
      help={field.help}
      helpAlign={helpAlign}
    >
      {field.type === "select" ? (
        <Select
          name={field.name}
          required={field.required}
          defaultValue={defaultValue}
          className="min-w-0 w-full"
        >
          <option value="">Selecione</option>
          {field.options?.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      ) : field.type === "textarea" ? (
        <Textarea
          name={field.name}
          required={field.required}
          defaultValue={defaultValue}
          placeholder={field.placeholder}
          className={compact ? "min-h-20 min-w-0 w-full" : "min-w-0 w-full"}
        />
      ) : (
        <Input
          name={field.name}
          type={field.type ?? "text"}
          required={field.required}
          defaultValue={
            defaultValue || (field.type === "number" ? field.placeholder : "")
          }
          placeholder={field.type === "number" ? undefined : field.placeholder}
          min={field.min}
          max={field.max}
          step={field.step}
          className="min-w-0 w-full"
        />
      )}
    </FormField>
  );
}

function FormField({
  label,
  required,
  wide,
  help,
  helpAlign = "start",
  children,
}: {
  label: string;
  required?: boolean;
  wide?: boolean;
  help?: React.ReactNode;
  helpAlign?: "start" | "end";
  children: React.ReactNode;
}) {
  return (
    <label
      className={`grid min-w-0 gap-2 text-sm font-medium ${wide ? "md:col-span-2 lg:col-span-2" : ""}`}
    >
      <span className="inline-flex items-center gap-1">
        <span>
          {label}
          {required ? <RequiredMark /> : null}
        </span>
        {help ? <HelpTooltip align={helpAlign}>{help}</HelpTooltip> : null}
      </span>
      {children}
    </label>
  );
}

const unitFields: FieldDefinition[] = [
  textField("name", "Nome", true, "Unidade Centro"),
  textField("code", "Código interno"),
  textField("phone", "Telefone"),
  { ...textField("email", "E-mail"), type: "email" },
  textField("postal_code", "CEP"),
  { ...textField("address_line", "Endereço"), wide: true },
  textField("address_number", "Número"),
  textField("address_complement", "Complemento"),
  textField("district", "Bairro"),
  textField("city", "Cidade"),
  textField("state", "UF"),
];

function textField(
  name: string,
  label: string,
  required = false,
  placeholder?: string,
): FieldDefinition {
  return { name, label, type: "text", required, placeholder };
}

function textareaField(name: string, label: string): FieldDefinition {
  return { name, label, type: "textarea", wide: true };
}

function selectField(
  name: string,
  label: string,
  options: Option[],
  required = false,
): FieldDefinition {
  return { name, label, type: "select", options, required };
}

function numberField(
  name: string,
  label: string,
  initialValue: number,
  min?: number,
  max?: number,
  step = "1",
): FieldDefinition {
  return {
    name,
    label,
    type: "number",
    required: true,
    placeholder: String(initialValue),
    min,
    max,
    step,
  };
}

function optionLabel(options: Option[], value: string) {
  return options.find((option) => option.value === value)?.label ?? "";
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}
