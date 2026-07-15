"use client";

import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Archive,
  ArchiveRestore,
  ClipboardList,
  Copy,
  FilePlus2,
  GripVertical,
  MoreHorizontal,
  Pencil,
  Plus,
  Save,
  Star,
  Trash2,
} from "lucide-react";
import {
  useActionState,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { toast } from "sonner";
import {
  saveClinicalTemplate,
  setClinicalTemplateStatus,
  setDefaultClinicalTemplate,
  type ModelActionState,
} from "@/app/(app)/configuracoes/modelos-clinicos/actions";
import { ClinicalFormRenderer } from "@/components/clinical/clinical-form-renderer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, Select, Textarea } from "@/components/ui/field";
import { FormError } from "@/components/ui/form-error";
import { HelpTooltip } from "@/components/ui/help-tooltip";
import { Switch } from "@/components/ui/switch";
import {
  clinicalFieldTypes,
  cloneClinicalTemplateSchema,
  createClinicalField,
  createClinicalId,
  createClinicalSection,
  createDefaultClinicalTemplateSchema,
  createSoapClinicalTemplateSchema,
  prepareClinicalTemplateSchemaForEditing,
  type ClinicalField,
  type ClinicalFieldType,
  type ClinicalOption,
  type ClinicalSection,
  type ClinicalTemplateSchema,
} from "@/lib/clinical/template-schema";

export type ClinicalTemplateSummary = {
  id: string;
  name: string;
  description: string | null;
  status: "active" | "archived";
  is_default: boolean;
  versions: Array<{
    id: string;
    version_number: number;
    schema: unknown;
    published_at: string;
  }>;
};

type TemplateDraft = {
  sessionId: string;
  templateId: string;
  expectedVersionNumber: number;
  name: string;
  description: string;
  schema: ClinicalTemplateSchema;
};

const initialActionState: ModelActionState = {};

const fieldTypeLabels: Record<ClinicalFieldType, string> = {
  text: "Texto curto",
  textarea: "Texto longo",
  number: "Número",
  date: "Data",
  time: "Hora",
  boolean: "Sim ou não",
  select: "Lista de opções",
  multiselect: "Seleção múltipla",
};

export function TemplateBuilderForm({
  templates,
}: {
  templates: ClinicalTemplateSummary[];
}) {
  const [draft, setDraft] = useState<TemplateDraft | null>(null);
  const closeEditor = useCallback(() => setDraft(null), []);

  function createTemplate() {
    setDraft({
      sessionId: createClinicalId(),
      templateId: "",
      expectedVersionNumber: 0,
      name: "",
      description: "",
      schema: createDefaultClinicalTemplateSchema(),
    });
  }

  function createSoapTemplate() {
    setDraft({
      sessionId: createClinicalId(),
      templateId: "",
      expectedVersionNumber: 0,
      name: "Evolução clínica — SOAP",
      description:
        "Ficha estruturada em Subjetivo, Objetivo, Avaliação e Plano para organizar a evolução clínica.",
      schema: createSoapClinicalTemplateSchema(),
    });
  }

  function editTemplate(template: ClinicalTemplateSummary) {
    const latestVersion = template.versions[0];
    setDraft({
      sessionId: createClinicalId(),
      templateId: template.id,
      expectedVersionNumber: latestVersion?.version_number ?? 0,
      name: template.name,
      description: template.description ?? "",
      schema: latestVersion
        ? prepareClinicalTemplateSchemaForEditing(latestVersion.schema)
        : createDefaultClinicalTemplateSchema(),
    });
  }

  function duplicateTemplate(template: ClinicalTemplateSummary) {
    const latestVersion = template.versions[0];
    setDraft({
      sessionId: createClinicalId(),
      templateId: "",
      expectedVersionNumber: 0,
      name: `${template.name} — cópia`,
      description: template.description ?? "",
      schema: cloneClinicalTemplateSchema(
        latestVersion?.schema ?? createDefaultClinicalTemplateSchema(),
      ),
    });
  }

  if (draft) {
    return (
      <TemplateEditor
        key={draft.sessionId}
        initialDraft={draft}
        onCancel={closeEditor}
        onSaved={closeEditor}
      />
    );
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h2 className="font-semibold">Modelos para episódios clínicos</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Organize as fichas utilizadas durante o atendimento. Alterações
            estruturais sempre geram uma nova versão.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={createSoapTemplate}
          >
            <ClipboardList className="size-4" />
            Usar modelo SOAP
          </Button>
          <Button type="button" onClick={createTemplate}>
            <FilePlus2 className="size-4" />
            Criar modelo
          </Button>
        </div>
      </div>

      {templates.length ? (
        <div className="grid gap-3">
          {templates.map((template) => (
            <TemplateListItem
              key={template.id}
              template={template}
              onEdit={() => editTemplate(template)}
              onDuplicate={() => duplicateTemplate(template)}
            />
          ))}
        </div>
      ) : (
        <Card>
          <EmptyState
            icon={ClipboardList}
            title="Nenhum modelo clínico cadastrado"
            description="Crie a primeira ficha estruturada para começar."
            actions={
              <div className="flex flex-wrap justify-center gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={createSoapTemplate}
                >
                  <ClipboardList className="size-4" /> Usar modelo SOAP
                </Button>
                <Button type="button" onClick={createTemplate}>
                  <Plus className="size-4" /> Criar modelo
                </Button>
              </div>
            }
          />
        </Card>
      )}
    </div>
  );
}

function TemplateListItem({
  template,
  onEdit,
  onDuplicate,
}: {
  template: ClinicalTemplateSummary;
  onEdit: () => void;
  onDuplicate: () => void;
}) {
  const [statusState, statusAction, statusPending] = useActionState(
    setClinicalTemplateStatus,
    initialActionState,
  );
  const [defaultState, defaultAction, defaultPending] = useActionState(
    setDefaultClinicalTemplate,
    initialActionState,
  );
  const latestVersion = template.versions[0];

  useActionToast(statusState);
  useActionToast(defaultState);

  return (
    <Card className={template.status === "archived" ? "opacity-75" : undefined}>
      <CardContent className="flex flex-col justify-between gap-4 p-4 sm:flex-row sm:items-center">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold">{template.name}</p>
            <Badge
              variant={template.status === "active" ? "success" : "neutral"}
            >
              {template.status === "active" ? "Ativo" : "Arquivado"}
            </Badge>
            {template.is_default ? (
              <Badge variant="primary">
                <Star className="mr-1 size-3 fill-current" /> Padrão
              </Badge>
            ) : null}
          </div>
          {template.description ? (
            <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
              {template.description}
            </p>
          ) : null}
          <p className="mt-2 text-xs text-muted-foreground">
            {latestVersion
              ? `Versão ${latestVersion.version_number} · publicada em ${formatDateTime(latestVersion.published_at)}`
              : "Sem versão publicada"}
            {template.versions.length > 1
              ? ` · ${template.versions.length} versões preservadas`
              : ""}
          </p>
        </div>

        <div className="flex shrink-0 items-center justify-end gap-2">
          <Button
            type="button"
            variant="secondary"
            disabled={template.status === "archived"}
            onClick={onEdit}
          >
            <Pencil className="size-4" /> Editar
          </Button>
          <DropdownMenu
            trigger={<MoreHorizontal className="size-4" />}
            triggerLabel={`Ações de ${template.name}`}
          >
            {(close) => (
              <>
                <DropdownMenuItem
                  icon={Copy}
                  onSelect={() => {
                    close();
                    onDuplicate();
                  }}
                >
                  Duplicar
                </DropdownMenuItem>
                {template.status === "active" && !template.is_default ? (
                  <form
                    action={defaultAction}
                    onSubmit={close}
                    className="contents"
                  >
                    <input
                      type="hidden"
                      name="template_id"
                      value={template.id}
                    />
                    <DropdownSubmitItem
                      icon={Star}
                      disabled={defaultPending}
                      label="Definir como padrão"
                    />
                  </form>
                ) : null}
                <DropdownMenuSeparator />
                <form
                  action={statusAction}
                  onSubmit={close}
                  className="contents"
                >
                  <input type="hidden" name="template_id" value={template.id} />
                  <input
                    type="hidden"
                    name="status"
                    value={template.status === "active" ? "archived" : "active"}
                  />
                  <DropdownSubmitItem
                    icon={
                      template.status === "active" ? Archive : ArchiveRestore
                    }
                    disabled={statusPending}
                    label={
                      template.status === "active" ? "Arquivar" : "Reativar"
                    }
                    destructive={template.status === "active"}
                  />
                </form>
              </>
            )}
          </DropdownMenu>
        </div>
      </CardContent>
    </Card>
  );
}

function DropdownSubmitItem({
  icon: Icon,
  label,
  disabled,
  destructive = false,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  disabled: boolean;
  destructive?: boolean;
}) {
  return (
    <button
      type="submit"
      role="menuitem"
      disabled={disabled}
      className={
        destructive
          ? "flex w-full items-center gap-2.5 rounded px-2.5 py-2 text-left text-sm font-medium text-destructive transition-colors hover:bg-destructive-muted disabled:opacity-50"
          : "flex w-full items-center gap-2.5 rounded px-2.5 py-2 text-left text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50"
      }
    >
      <Icon className="size-4 shrink-0" />
      {label}
    </button>
  );
}

function TemplateEditor({
  initialDraft,
  onCancel,
  onSaved,
}: {
  initialDraft: TemplateDraft;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState(initialDraft);
  const [state, action, pending] = useActionState(
    saveClinicalTemplate,
    initialActionState,
  );
  const isEditing = Boolean(draft.templateId);

  useEffect(() => {
    if (state.success) {
      toast.success(state.success);
      onSaved();
    }
  }, [state, onSaved]);

  useEffect(() => {
    if (state.error) toast.error(state.error);
  }, [state]);

  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="template_id" value={draft.templateId} />
      <input
        type="hidden"
        name="expected_version_number"
        value={draft.expectedVersionNumber}
      />
      <input
        type="hidden"
        name="schema_json"
        value={JSON.stringify(draft.schema)}
      />

      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-semibold">
              {isEditing ? "Editar modelo" : "Novo modelo"}
            </h2>
            <HelpTooltip label="Como funciona o versionamento">
              Atendimentos antigos continuam vinculados à versão usada na época.
              Ao salvar uma alteração, o sistema publica uma nova versão sem
              modificar o histórico.
            </HelpTooltip>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {isEditing
              ? `A próxima publicação será a versão ${draft.expectedVersionNumber + 1}.`
              : "O modelo será criado na versão 1."}
          </p>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onCancel}>
            Cancelar
          </Button>
          <Button type="submit" disabled={pending}>
            <Save className="size-4" />
            {pending
              ? "Publicando..."
              : isEditing
                ? `Publicar versão ${draft.expectedVersionNumber + 1}`
                : "Criar modelo"}
          </Button>
        </div>
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(22rem,0.72fr)]">
        <div className="grid gap-4">
          <Card>
            <CardHeader>
              <h3 className="font-semibold">Identificação</h3>
            </CardHeader>
            <CardContent className="grid gap-4">
              <label className="grid gap-2 text-sm font-medium">
                Nome
                <Input
                  name="name"
                  value={draft.name}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                  placeholder="Consulta dermatológica"
                  required
                />
              </label>
              <label className="grid gap-2 text-sm font-medium">
                Descrição
                <Textarea
                  name="description"
                  value={draft.description}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      description: event.target.value,
                    }))
                  }
                  placeholder="Explique quando este modelo deve ser utilizado."
                />
              </label>
            </CardContent>
          </Card>

          <SchemaBuilder
            schema={draft.schema}
            onChange={(schema) =>
              setDraft((current) => ({ ...current, schema }))
            }
          />
          <FormError message={state.error} />
        </div>

        <div className="grid gap-3 xl:sticky xl:top-4">
          <div>
            <h3 className="font-semibold">Prévia do atendimento</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Usa os mesmos componentes exibidos ao profissional.
            </p>
          </div>
          <ClinicalFormRenderer schema={draft.schema} mode="preview" />
        </div>
      </div>
    </form>
  );
}

function SchemaBuilder({
  schema,
  onChange,
}: {
  schema: ClinicalTemplateSchema;
  onChange: (schema: ClinicalTemplateSchema) => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
  const sectionIds = useMemo(
    () => schema.sections.map((section) => section.id),
    [schema.sections],
  );

  function updateSection(
    sectionId: string,
    update: (section: ClinicalSection) => ClinicalSection,
  ) {
    onChange({
      ...schema,
      sections: schema.sections.map((section) =>
        section.id === sectionId ? update(section) : section,
      ),
    });
  }

  function handleSectionDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = schema.sections.findIndex(
      (section) => section.id === active.id,
    );
    const newIndex = schema.sections.findIndex(
      (section) => section.id === over.id,
    );
    if (oldIndex < 0 || newIndex < 0) return;
    onChange({
      ...schema,
      sections: arrayMove(schema.sections, oldIndex, newIndex),
    });
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold">Seções e campos</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Arraste para definir a ordem que aparecerá no prontuário.
          </p>
        </div>
        <Button
          type="button"
          variant="secondary"
          onClick={() =>
            onChange({
              ...schema,
              sections: [...schema.sections, createClinicalSection()],
            })
          }
        >
          <Plus className="size-4" /> Seção
        </Button>
      </CardHeader>
      <CardContent>
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleSectionDragEnd}
        >
          <SortableContext
            items={sectionIds}
            strategy={verticalListSortingStrategy}
          >
            <div className="grid gap-4">
              {schema.sections.map((section) => (
                <SortableSectionEditor
                  key={section.id}
                  section={section}
                  canRemove={schema.sections.length > 1}
                  onChange={(nextSection) =>
                    updateSection(section.id, () => nextSection)
                  }
                  onRemove={() =>
                    onChange({
                      ...schema,
                      sections: schema.sections.filter(
                        (item) => item.id !== section.id,
                      ),
                    })
                  }
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      </CardContent>
    </Card>
  );
}

function SortableSectionEditor({
  section,
  canRemove,
  onChange,
  onRemove,
}: {
  section: ClinicalSection;
  canRemove: boolean;
  onChange: (section: ClinicalSection) => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id: section.id });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className="rounded-lg border border-border bg-muted/20 p-3"
    >
      <div className="grid grid-cols-[2.25rem_minmax(0,1fr)_2.25rem] items-start gap-2">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={`Reordenar seção ${section.title}`}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-4" />
        </Button>
        <div className="grid min-w-0 gap-2 sm:grid-cols-2">
          <label className="grid min-w-0 gap-1.5 text-xs font-medium">
            Título da seção
            <Input
              value={section.title}
              onChange={(event) =>
                onChange({ ...section, title: event.target.value })
              }
              placeholder="Anamnese"
              required
            />
          </label>
          <label className="grid min-w-0 gap-1.5 text-xs font-medium">
            Descrição opcional
            <Input
              value={section.description ?? ""}
              onChange={(event) =>
                onChange({
                  ...section,
                  description: event.target.value || undefined,
                })
              }
              placeholder="Orientação para o preenchimento"
            />
          </label>
        </div>
        <Button
          type="button"
          variant="destructive-ghost"
          size="icon"
          aria-label={`Remover seção ${section.title}`}
          disabled={!canRemove}
          onClick={onRemove}
        >
          <Trash2 className="size-4" />
        </Button>
      </div>

      <div className="ml-0 mt-3 grid min-w-0 gap-3 sm:ml-10">
        <FieldList
          fields={section.fields}
          onChange={(fields) => onChange({ ...section, fields })}
        />
      </div>
    </div>
  );
}

function FieldList({
  fields,
  onChange,
}: {
  fields: ClinicalField[];
  onChange: (fields: ClinicalField[]) => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
  const fieldIds = useMemo(() => fields.map((field) => field.id), [fields]);

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = fields.findIndex((field) => field.id === active.id);
    const newIndex = fields.findIndex((field) => field.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    onChange(arrayMove(fields, oldIndex, newIndex));
  }

  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={fieldIds}
          strategy={verticalListSortingStrategy}
        >
          <div className="grid gap-2">
            {fields.map((field) => (
              <SortableFieldEditor
                key={field.id}
                field={field}
                canRemove={fields.length > 1}
                onChange={(nextField) =>
                  onChange(
                    fields.map((item) =>
                      item.id === field.id ? nextField : item,
                    ),
                  )
                }
                onRemove={() =>
                  onChange(fields.filter((item) => item.id !== field.id))
                }
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
      <Button
        type="button"
        variant="secondary"
        className="w-fit"
        onClick={() => onChange([...fields, createClinicalField()])}
      >
        <Plus className="size-4" /> Adicionar campo
      </Button>
    </>
  );
}

function SortableFieldEditor({
  field,
  canRemove,
  onChange,
  onRemove,
}: {
  field: ClinicalField;
  canRemove: boolean;
  onChange: (field: ClinicalField) => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id: field.id });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className="rounded-md border border-border bg-card p-3"
    >
      <div className="grid grid-cols-[2.25rem_minmax(0,1fr)_2.25rem] items-start gap-2">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={`Reordenar campo ${field.label}`}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-4" />
        </Button>
        <div className="grid min-w-0 gap-3">
          <div className="grid min-w-0 gap-3 sm:grid-cols-2 sm:items-end">
            <label className="grid min-w-0 gap-1.5 text-xs font-medium">
              Nome do campo
              <Input
                className="min-w-0 w-full"
                value={field.label}
                onChange={(event) =>
                  onChange({ ...field, label: event.target.value })
                }
                required
              />
            </label>
            <label className="grid min-w-0 gap-1.5 text-xs font-medium">
              Tipo
              <Select
                className="min-w-0"
                value={field.type}
                onValueChange={(value) =>
                  onChange(changeFieldType(field, value as ClinicalFieldType))
                }
              >
                {clinicalFieldTypes.map((type) => (
                  <option key={type} value={type}>
                    {fieldTypeLabels[type]}
                  </option>
                ))}
              </Select>
            </label>
            <div className="min-w-0 pb-2 sm:col-span-2">
              <Switch
                label="Obrigatório"
                checked={field.required}
                onCheckedChange={(required) => onChange({ ...field, required })}
              />
            </div>
          </div>
          <FieldSettings field={field} onChange={onChange} />
        </div>
        <Button
          type="button"
          variant="destructive-ghost"
          size="icon"
          aria-label={`Remover campo ${field.label}`}
          disabled={!canRemove}
          onClick={onRemove}
        >
          <Trash2 className="size-4" />
        </Button>
      </div>
    </div>
  );
}

function FieldSettings({
  field,
  onChange,
}: {
  field: ClinicalField;
  onChange: (field: ClinicalField) => void;
}) {
  const supportsPlaceholder = field.type !== "boolean";

  return (
    <div className="grid gap-3">
      <div className="grid min-w-0 gap-3 sm:grid-cols-2">
        {supportsPlaceholder ? (
          <label className="grid min-w-0 gap-1.5 text-xs font-medium">
            Placeholder
            <Input
              className="min-w-0 w-full"
              value={field.placeholder ?? ""}
              onChange={(event) =>
                onChange({
                  ...field,
                  placeholder: event.target.value || undefined,
                })
              }
              placeholder="Exemplo ou orientação curta"
            />
          </label>
        ) : null}
        <label className="grid min-w-0 gap-1.5 text-xs font-medium">
          Texto de ajuda
          <Input
            className="min-w-0 w-full"
            value={field.helpText ?? ""}
            onChange={(event) =>
              onChange({
                ...field,
                helpText: event.target.value || undefined,
              })
            }
            placeholder="Orientação exibida abaixo do campo"
          />
        </label>
      </div>

      {field.type === "number" ? (
        <NumberFieldSettings field={field} onChange={onChange} />
      ) : null}
      {field.type === "select" || field.type === "multiselect" ? (
        <ChoiceFieldSettings field={field} onChange={onChange} />
      ) : null}
    </div>
  );
}

function NumberFieldSettings({
  field,
  onChange,
}: {
  field: Extract<ClinicalField, { type: "number" }>;
  onChange: (field: ClinicalField) => void;
}) {
  return (
    <div className="grid min-w-0 gap-3 sm:grid-cols-2">
      <label className="grid min-w-0 gap-1.5 text-xs font-medium">
        Unidade
        <Input
          className="min-w-0 w-full"
          value={field.unit ?? ""}
          onChange={(event) =>
            onChange({ ...field, unit: event.target.value || undefined })
          }
          placeholder="kg"
        />
      </label>
      <NumericSetting
        label="Mínimo"
        value={field.min}
        onChange={(min) => onChange({ ...field, min })}
      />
      <NumericSetting
        label="Máximo"
        value={field.max}
        onChange={(max) => onChange({ ...field, max })}
      />
      <NumericSetting
        label="Incremento"
        value={field.step}
        min={0}
        onChange={(step) => onChange({ ...field, step })}
      />
    </div>
  );
}

function NumericSetting({
  label,
  value,
  min,
  onChange,
}: {
  label: string;
  value: number | undefined;
  min?: number;
  onChange: (value: number | undefined) => void;
}) {
  return (
    <label className="grid min-w-0 gap-1.5 text-xs font-medium">
      {label}
      <Input
        className="min-w-0 w-full"
        type="number"
        inputMode="decimal"
        value={value ?? ""}
        min={min}
        step="any"
        onChange={(event) => {
          if (!event.target.value) return onChange(undefined);
          const parsed = Number(event.target.value);
          onChange(Number.isFinite(parsed) ? parsed : undefined);
        }}
      />
    </label>
  );
}

function ChoiceFieldSettings({
  field,
  onChange,
}: {
  field: Extract<ClinicalField, { type: "select" | "multiselect" }>;
  onChange: (field: ClinicalField) => void;
}) {
  function updateOption(optionId: string, update: Partial<ClinicalOption>) {
    onChange({
      ...field,
      options: field.options.map((option) =>
        option.id === optionId ? { ...option, ...update } : option,
      ),
    });
  }

  return (
    <div className="grid gap-2 rounded-md bg-muted/40 p-3">
      <p className="text-xs font-semibold">Opções disponíveis</p>
      {field.options.map((option, index) => (
        <div
          key={option.id}
          className="grid min-w-0 grid-cols-[minmax(0,1fr)_2.25rem] gap-2"
        >
          <Input
            className="min-w-0 w-full"
            value={option.label}
            aria-label={`Opção ${index + 1}`}
            onChange={(event) =>
              updateOption(option.id, { label: event.target.value })
            }
            required
          />
          <Button
            type="button"
            variant="destructive-ghost"
            size="icon"
            aria-label={`Remover opção ${option.label}`}
            disabled={field.options.length <= 1}
            onClick={() =>
              onChange({
                ...field,
                options: field.options.filter((item) => item.id !== option.id),
              })
            }
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="secondary"
        className="w-fit"
        onClick={() =>
          onChange({
            ...field,
            options: [
              ...field.options,
              {
                id: createClinicalId(),
                label: `Opção ${field.options.length + 1}`,
              },
            ],
          })
        }
      >
        <Plus className="size-4" /> Opção
      </Button>
    </div>
  );
}

function changeFieldType(
  field: ClinicalField,
  type: ClinicalFieldType,
): ClinicalField {
  if (field.type === type) return field;
  const base = {
    id: field.id,
    label: field.label,
    required: field.required,
    ...(field.helpText ? { helpText: field.helpText } : {}),
  };
  const placeholder = "placeholder" in field ? field.placeholder : undefined;

  if (type === "number") {
    return {
      ...base,
      type,
      step: 0.01,
      ...(placeholder ? { placeholder } : {}),
    };
  }
  if (type === "select" || type === "multiselect") {
    return {
      ...base,
      type,
      ...(placeholder ? { placeholder } : {}),
      options: [
        { id: createClinicalId(), label: "Opção 1" },
        { id: createClinicalId(), label: "Opção 2" },
      ],
    };
  }
  if (type === "boolean") return { ...base, type };
  return { ...base, type, ...(placeholder ? { placeholder } : {}) };
}

function useActionToast(state: ModelActionState) {
  useEffect(() => {
    if (state.success) toast.success(state.success);
    if (state.error) toast.error(state.error);
  }, [state]);
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}
