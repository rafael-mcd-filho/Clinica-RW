"use client";

import {
  useActionState,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { CheckCircle2, Clock3, Pencil, Plus, Save, Trash2 } from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input, Select, Textarea } from "@/components/ui/field";
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

export function CompanySettings({ data }: { data: CompanySettingsData }) {
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
      <OnboardingCard
        checklist={checklist}
        completedAt={data.settings.onboarding_completed_at}
        mode={data.organization.mode}
      />

      <Tabs
        items={[
          {
            id: "clinica",
            label: "Clínica e horários",
            content: (
              <div className="grid gap-5">
                <ClinicForm data={data} />
                <BusinessHoursForm hours={data.businessHours} />
              </div>
            ),
          },
          {
            id: "estrutura",
            label: "Estrutura",
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
            content: (
              <div className="grid gap-5">
                <RegistrationSection
                  kind="specialty"
                  title="Especialidades"
                  description="Especialidades usadas na equipe e no prontuário."
                  rows={data.specialties as EditableRow[]}
                  fields={[
                    textField("name", "Nome", true, "Clínica geral"),
                    textField("cbo_code", "Código CBO"),
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
                    selectField("user_id", "Usuário vinculado", userOptions),
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
            label: "Serviços e preços",
            content: (
              <div className="grid gap-5">
                <RegistrationSection
                  kind="procedure"
                  title="Procedimentos"
                  description="Serviços que poderão ser agendados e cobrados."
                  rows={data.procedures as EditableRow[]}
                  fields={[
                    textField("name", "Nome", true, "Consulta"),
                    textField("code", "Código interno"),
                    numberField(
                      "duration_minutes",
                      "Duração (min)",
                      30,
                      5,
                      1440,
                    ),
                    numberField(
                      "base_price",
                      "Preço base (R$)",
                      0,
                      0,
                      undefined,
                      "0.01",
                    ),
                  ]}
                  summary={(row) =>
                    `${row.duration_minutes} min · ${formatCurrency(Number(row.base_price))}`
                  }
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
  completedAt,
  mode,
}: {
  checklist: Array<{ label: string; done: boolean }>;
  completedAt: string | null;
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
            <Badge variant={completedAt ? "success" : "primary"}>
              {completedAt ? "Concluída" : `${doneCount}/${checklist.length}`}
            </Badge>
            <Badge variant="neutral">
              {mode === "solo" ? "Modo solo" : "Modo clínica"}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Complete estes dados para liberar pacientes e agenda.
          </p>
        </div>
        {!completedAt ? (
          <form action={action}>
            <Button
              type="submit"
              disabled={pending || doneCount < checklist.length}
            >
              <CheckCircle2 className="size-4" aria-hidden="true" />
              {pending ? "Concluindo..." : "Concluir configuração"}
            </Button>
          </form>
        ) : null}
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
        {state.error ? (
          <p className="mt-3 text-sm text-destructive">{state.error}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function ClinicForm({ data }: { data: CompanySettingsData }) {
  const [state, action, pending] = useActionState(
    saveClinicSettings,
    initialState,
  );
  const [automaticMode, setAutomaticMode] = useState(
    data.settings.automatic_mode,
  );

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
              <Input
                name="document"
                defaultValue={data.clinic.document ?? ""}
              />
            </FormField>
            <FormField label="Telefone">
              <Input name="phone" defaultValue={data.clinic.phone ?? ""} />
            </FormField>
            <FormField label="E-mail">
              <Input
                name="email"
                type="email"
                defaultValue={data.clinic.email ?? ""}
              />
            </FormField>
            <FormField label="CEP">
              <Input
                name="postal_code"
                defaultValue={data.clinic.postal_code ?? ""}
              />
            </FormField>
            <FormField label="Endereço" wide>
              <Input
                name="address_line"
                defaultValue={data.clinic.address_line ?? ""}
              />
            </FormField>
            <FormField label="Número">
              <Input
                name="address_number"
                defaultValue={data.clinic.address_number ?? ""}
              />
            </FormField>
            <FormField label="Complemento">
              <Input
                name="address_complement"
                defaultValue={data.clinic.address_complement ?? ""}
              />
            </FormField>
            <FormField label="Bairro">
              <Input
                name="district"
                defaultValue={data.clinic.district ?? ""}
              />
            </FormField>
            <FormField label="Cidade">
              <Input name="city" defaultValue={data.clinic.city ?? ""} />
            </FormField>
            <FormField label="UF">
              <Input
                name="state"
                maxLength={2}
                defaultValue={data.clinic.state ?? ""}
              />
            </FormField>
            <FormField label="Fuso horário" required>
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

          <div className="rounded-md border border-border bg-background p-4">
            <Switch
              name="automatic_mode"
              label="Definir modo automaticamente pela quantidade de profissionais"
              checked={automaticMode}
              onCheckedChange={setAutomaticMode}
            />
            <div className="mt-3 max-w-xs">
              <FormField label="Modo manual">
                <Select
                  name="manual_mode"
                  defaultValue={data.organization.mode}
                >
                  <option value="solo">Profissional solo</option>
                  <option value="clinic">Clínica multiprofissional</option>
                </Select>
              </FormField>
            </div>
          </div>

          {state.error ? (
            <p className="text-sm text-destructive">{state.error}</p>
          ) : null}
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
          Horário geral da clínica; agendas específicas serão configuradas na
          Fase 6.
        </p>
      </CardHeader>
      <CardContent>
        <form action={action} className="grid gap-4">
          <div className="grid gap-2">
            {weekdays.map((label, weekday) => {
              const hour = clinicHours.get(weekday);
              return (
                <div
                  key={label}
                  className="grid items-center gap-3 rounded-md border border-border px-3 py-2 sm:grid-cols-[11rem_1fr_1fr]"
                >
                  <Checkbox
                    name={`enabled_${weekday}`}
                    defaultChecked={Boolean(hour?.active)}
                    label={label}
                  />
                  <Input
                    aria-label={`Abertura de ${label}`}
                    name={`start_${weekday}`}
                    type="time"
                    defaultValue={hour?.start_time.slice(0, 5) ?? "08:00"}
                  />
                  <Input
                    aria-label={`Fechamento de ${label}`}
                    name={`end_${weekday}`}
                    type="time"
                    defaultValue={hour?.end_time.slice(0, 5) ?? "18:00"}
                  />
                </div>
              );
            })}
          </div>
          {state.error ? (
            <p className="text-sm text-destructive">{state.error}</p>
          ) : null}
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
      {state.error ? (
        <p className="mt-3 text-sm text-destructive">{state.error}</p>
      ) : null}
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
    <FormField label={field.label} required={field.required} wide={field.wide}>
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
          <FormField label="Tabela" required>
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
          <FormField label="Valor (R$)" required>
            <Input
              name="price"
              type="number"
              min={0}
              step="0.01"
              required
              defaultValue={editing?.price ?? ""}
            />
          </FormField>
          {state.error ? (
            <p className="text-sm text-destructive md:col-span-3">
              {state.error}
            </p>
          ) : null}
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
  children,
}: {
  label: string;
  required?: boolean;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label
      className={`grid gap-2 text-sm font-medium ${wide ? "lg:col-span-2" : ""}`}
    >
      <span>
        {label}
        {required ? <RequiredMark /> : null}
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
