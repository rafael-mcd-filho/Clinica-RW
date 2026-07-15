"use client";

import {
  useActionState,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  Boxes,
  Building2,
  CheckCircle2,
  Clock3,
  Pencil,
  Plus,
  Save,
  Stethoscope,
  Trash2,
  UsersRound,
} from "lucide-react";
import { toast } from "sonner";
import {
  completeOnboarding,
  deletePriceItem,
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
import { RequiredMark } from "@/components/ui/required-mark";
import { Switch } from "@/components/ui/switch";
import { Tabs } from "@/components/ui/tabs";
import type {
  BaseRow,
  BusinessHourRow,
  CompanySettingsData,
  PriceTableItemRow,
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
  const insuranceOptions = data.healthInsurances.map((item) => ({
    value: item.id,
    label: item.name,
  }));
  const priceTableOptions = data.priceTables.map((item) => ({
    value: item.id,
    label: item.name,
  }));
  const procedureOptions = data.procedures.map((item) => ({
    value: item.id,
    label: item.name,
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
                        "Preço base (R$)",
                        0,
                        0,
                        undefined,
                        "0.01",
                      ),
                      help: "Valor padrão usado quando nenhuma tabela de preço específica sobrescrever o procedimento.",
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
                  description="Cadastro inicial dos planos aceitos."
                  rows={data.healthInsurances as EditableRow[]}
                  fields={[
                    textField("name", "Nome", true, "Convênio"),
                    textField("document", "CNPJ"),
                  ]}
                  summary={(row) =>
                    String(row.document ?? "Sem CNPJ informado")
                  }
                />
                <RegistrationSection
                  kind="price_table"
                  title="Tabelas de preço"
                  description="Listas particulares ou vinculadas a convênios."
                  rows={data.priceTables as EditableRow[]}
                  fields={[
                    textField("name", "Nome", true, "Tabela particular"),
                    selectField(
                      "health_insurance_id",
                      "Convênio",
                      insuranceOptions,
                    ),
                  ]}
                  summary={(row) =>
                    optionLabel(
                      insuranceOptions,
                      String(row.health_insurance_id ?? ""),
                    ) || "Particular"
                  }
                />
                <PriceItemsSection
                  rows={data.priceTableItems}
                  priceTables={priceTableOptions}
                  procedures={procedureOptions}
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
}: {
  kind: Exclude<RegistrationKind, "price_item">;
  title: string;
  description: string;
  rows: EditableRow[];
  fields: FieldDefinition[];
  summary: (row: EditableRow) => string;
}) {
  const [editing, setEditing] = useState<EditableRow | null>(null);
  const finishEditing = useCallback(() => setEditing(null), []);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">{title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          </div>
          <Badge variant="neutral">{rows.length}</Badge>
        </div>
      </CardHeader>
      <CardContent className="grid gap-5">
        <RegistrationForm
          key={editing?.id ?? "new"}
          kind={kind}
          fields={fields}
          editing={editing}
          onFinished={finishEditing}
        />

        <div className="grid gap-2">
          {rows.length ? (
            rows.map((row) => (
              <div
                key={row.id}
                className="flex flex-col gap-3 rounded-md border border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
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
                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    {summary(row)}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => setEditing(row)}
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
    </Card>
  );
}

function RegistrationForm({
  kind,
  fields,
  editing,
  onFinished,
}: {
  kind: Exclude<RegistrationKind, "price_item">;
  fields: FieldDefinition[];
  editing: EditableRow | null;
  onFinished: () => void;
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
      className="rounded-md border border-border bg-background p-4"
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-sm font-semibold">
          {editing ? `Editar ${String(editing.name)}` : "Novo cadastro"}
        </p>
        {editing ? (
          <Button type="button" variant="ghost" size="sm" onClick={onFinished}>
            Cancelar edição
          </Button>
        ) : null}
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {fields.map((field) => (
          <DynamicField key={field.name} field={field} row={editing} />
        ))}
      </div>
      <FormError message={state.error} className="mt-3" />
      <div className="mt-4 flex justify-end">
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
}: {
  field: FieldDefinition;
  row: EditableRow | null;
}) {
  const value = row?.[field.name];
  const defaultValue = value == null ? "" : String(value);

  return (
    <FormField
      label={field.label}
      required={field.required}
      wide={field.wide}
      help={field.help}
    >
      {field.type === "select" ? (
        <Select
          name={field.name}
          required={field.required}
          defaultValue={defaultValue}
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
        />
      )}
    </FormField>
  );
}

function PriceItemsSection({
  rows,
  priceTables,
  procedures,
}: {
  rows: PriceTableItemRow[];
  priceTables: Option[];
  procedures: Option[];
}) {
  const [editing, setEditing] = useState<PriceTableItemRow | null>(null);
  const actionWithItem = saveRegistration.bind(
    null,
    "price_item",
    editing?.id ?? null,
  );
  const [state, action, pending] = useActionState(actionWithItem, initialState);

  useEffect(() => {
    if (state.success) {
      toast.success(state.success);
    }
  }, [state]);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">Valores por tabela</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Sobrescreva o preço base por tabela ou convênio.
            </p>
          </div>
          <Badge variant="neutral">{rows.length}</Badge>
        </div>
      </CardHeader>
      <CardContent className="grid gap-5">
        <form
          key={editing?.id ?? "new"}
          action={action}
          className="grid gap-4 rounded-md border border-border bg-background p-4 md:grid-cols-3"
        >
          <FormField
            label="Tabela"
            required
            help="A tabela define em qual contexto o valor específico será usado, como particular ou convênio."
          >
            <Select
              name="price_table_id"
              required
              defaultValue={editing?.price_table_id ?? ""}
            >
              <option value="">Selecione</option>
              {priceTables.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Procedimento" required>
            <Select
              name="procedure_id"
              required
              defaultValue={editing?.procedure_id ?? ""}
            >
              <option value="">Selecione</option>
              {procedures.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField
            label="Valor (R$)"
            required
            help="Este valor substitui o preço base apenas para a combinação de tabela e procedimento selecionada."
          >
            <Input
              name="price"
              type="number"
              min={0}
              step="0.01"
              required
              defaultValue={editing?.price ?? ""}
            />
          </FormField>
          <FormError message={state.error} className="md:col-span-3" />
          <div className="flex justify-end gap-2 md:col-span-3">
            {editing ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setEditing(null)}
              >
                Cancelar
              </Button>
            ) : null}
            <Button
              type="submit"
              size="sm"
              disabled={pending || !priceTables.length || !procedures.length}
            >
              <Plus className="size-3.5" />
              {pending
                ? "Salvando..."
                : editing
                  ? "Salvar valor"
                  : "Adicionar valor"}
            </Button>
          </div>
        </form>

        <div className="grid gap-2">
          {rows.map((row) => (
            <div
              key={row.id}
              className="flex items-center justify-between gap-3 rounded-md border border-border px-4 py-3"
            >
              <div>
                <p className="text-sm font-medium">
                  {optionLabel(procedures, row.procedure_id)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {optionLabel(priceTables, row.price_table_id)} ·{" "}
                  {formatCurrency(Number(row.price))}
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => setEditing(row)}
                >
                  <Pencil className="size-3.5" /> Editar
                </Button>
                <form action={deletePriceItem.bind(null, row.id)}>
                  <Button
                    type="submit"
                    size="sm"
                    variant="ghost"
                    aria-label="Excluir valor"
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </form>
              </div>
            </div>
          ))}
          {!rows.length ? (
            <p className="rounded-md border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
              Nenhum valor específico cadastrado.
            </p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

function FormField({
  label,
  required,
  wide,
  help,
  children,
}: {
  label: string;
  required?: boolean;
  wide?: boolean;
  help?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <label
      className={`grid gap-2 text-sm font-medium ${wide ? "lg:col-span-2" : ""}`}
    >
      <span className="inline-flex items-center gap-1">
        <span>
          {label}
          {required ? <RequiredMark /> : null}
        </span>
        {help ? <HelpTooltip>{help}</HelpTooltip> : null}
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
