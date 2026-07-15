"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input, MultiSelect, Select } from "@/components/ui/field";
import { RadioGroup } from "@/components/ui/radio-group";
import { RequiredMark } from "@/components/ui/required-mark";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import {
  normalizeClinicalTemplateSchema,
  type ClinicalField,
  type ClinicalFieldValue,
} from "@/lib/clinical/template-schema";
import { cn } from "@/lib/utils";

export type ClinicalFormMode = "edit" | "preview" | "readonly";

type ClinicalFormRendererProps = {
  schema: unknown;
  values?: Record<string, unknown>;
  mode: ClinicalFormMode;
  disabled?: boolean;
  onValueChange?: (
    fieldId: string,
    value: ClinicalFieldValue | undefined,
  ) => void;
};

export function ClinicalFormRenderer({
  schema: schemaInput,
  values = {},
  mode,
  disabled = false,
  onValueChange,
}: ClinicalFormRendererProps) {
  const schema = normalizeClinicalTemplateSchema(schemaInput);

  if (!schema.sections.length) {
    return (
      <p className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
        Adicione uma seção e ao menos um campo para visualizar o formulário.
      </p>
    );
  }

  return (
    <div className="grid gap-4">
      {schema.sections.map((section, sectionIndex) => (
        <Card key={`${section.id}:${sectionIndex}`}>
          <CardHeader>
            <h2 className="font-semibold">{section.title}</h2>
            {section.description ? (
              <p className="mt-1 text-sm text-muted-foreground">
                {section.description}
              </p>
            ) : null}
          </CardHeader>
          <CardContent className="grid gap-4">
            {section.fields.map((field, fieldIndex) => (
              <ClinicalFieldControl
                key={`${section.id}:${field.id}:${fieldIndex}`}
                field={field}
                value={values[field.id]}
                mode={mode}
                disabled={disabled}
                onValueChange={(value) => onValueChange?.(field.id, value)}
              />
            ))}
            {!section.fields.length ? (
              <p className="text-sm text-muted-foreground">
                Esta seção ainda não possui campos.
              </p>
            ) : null}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function ClinicalFieldControl({
  field,
  value,
  mode,
  disabled,
  onValueChange,
}: {
  field: ClinicalField;
  value: unknown;
  mode: ClinicalFormMode;
  disabled: boolean;
  onValueChange: (value: ClinicalFieldValue | undefined) => void;
}) {
  if (mode === "readonly") {
    return <ReadonlyClinicalField field={field} value={value} />;
  }

  const name = `${mode === "preview" ? "preview" : "field"}:${field.id}`;
  const controlDisabled = disabled || mode === "preview";

  return (
    <div className="grid gap-2 text-sm">
      <div className="font-medium">
        {field.label}
        {field.required ? <RequiredMark /> : null}
      </div>
      <EditableClinicalField
        field={field}
        name={name}
        value={value}
        disabled={controlDisabled}
        onValueChange={onValueChange}
      />
      {field.helpText ? (
        <p className="text-xs text-muted-foreground">{field.helpText}</p>
      ) : null}
    </div>
  );
}

function EditableClinicalField({
  field,
  name,
  value,
  disabled,
  onValueChange,
}: {
  field: ClinicalField;
  name: string;
  value: unknown;
  disabled: boolean;
  onValueChange: (value: ClinicalFieldValue | undefined) => void;
}) {
  switch (field.type) {
    case "text":
      return (
        <Input
          name={name}
          defaultValue={scalarValue(value)}
          placeholder={field.placeholder ?? field.label}
          required={field.required}
          disabled={disabled}
          onChange={(event) => onValueChange(event.target.value || undefined)}
        />
      );
    case "textarea":
      return (
        <RichTextEditor
          name={name}
          defaultValue={scalarValue(value)}
          placeholder={field.placeholder ?? field.label}
          required={field.required}
          disabled={disabled}
          onChange={(nextValue) => onValueChange(nextValue || undefined)}
        />
      );
    case "number":
      return (
        <div className="relative">
          <Input
            name={name}
            type="number"
            inputMode="decimal"
            defaultValue={numericValue(value)}
            placeholder={field.placeholder}
            min={field.min}
            max={field.max}
            step={field.step ?? "any"}
            required={field.required}
            disabled={disabled}
            className={field.unit ? "pr-16" : undefined}
            onChange={(event) => {
              const next = event.target.value;
              onValueChange(next === "" ? undefined : Number(next));
            }}
          />
          {field.unit ? (
            <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs font-medium text-muted-foreground">
              {field.unit}
            </span>
          ) : null}
        </div>
      );
    case "date":
    case "time":
      return (
        <Input
          name={name}
          type={field.type}
          defaultValue={scalarValue(value)}
          required={field.required}
          disabled={disabled}
          onChange={(event) => onValueChange(event.target.value || undefined)}
        />
      );
    case "boolean":
      return (
        <div
          onChange={(event) => {
            const target = event.target;
            if (!(target instanceof HTMLInputElement)) return;
            onValueChange(target.value === "true");
          }}
        >
          <RadioGroup
            name={name}
            defaultValue={booleanFormValue(value)}
            disabled={disabled}
            className="sm:grid-cols-2"
            options={[
              { value: "true", label: "Sim" },
              { value: "false", label: "Não" },
            ]}
          />
        </div>
      );
    case "select":
      return (
        <Select
          name={name}
          defaultValue={scalarValue(value)}
          placeholder={field.placeholder ?? "Selecione uma opção"}
          required={field.required}
          disabled={disabled}
          onValueChange={(nextValue) => onValueChange(nextValue || undefined)}
        >
          <option value="">{field.placeholder ?? "Selecione uma opção"}</option>
          {field.options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </Select>
      );
    case "multiselect":
      return (
        <ClinicalMultiSelect
          field={field}
          name={name}
          value={value}
          disabled={disabled}
          onValueChange={onValueChange}
        />
      );
  }
}

function ClinicalMultiSelect({
  field,
  name,
  value,
  disabled,
  onValueChange,
}: {
  field: ClinicalField & {
    type: "multiselect";
    options: Array<{ id: string; label: string }>;
  };
  name: string;
  value: unknown;
  disabled: boolean;
  onValueChange: (value: ClinicalFieldValue | undefined) => void;
}) {
  const [selected, setSelected] = useState(() => stringArrayValue(value));

  return (
    <>
      <input type="hidden" name={name} value={JSON.stringify(selected)} />
      <MultiSelect
        options={field.options.map((option) => ({
          value: option.id,
          label: option.label,
        }))}
        value={selected}
        onValueChange={(nextValue) => {
          setSelected(nextValue);
          onValueChange(nextValue.length ? nextValue : undefined);
        }}
        allLabel={field.placeholder ?? "Selecione uma ou mais opções"}
        placeholder={field.placeholder}
        disabled={disabled}
        aria-label={field.label}
      />
    </>
  );
}

function ReadonlyClinicalField({
  field,
  value,
}: {
  field: ClinicalField;
  value: unknown;
}) {
  const formatted = formatClinicalFieldValue(field, value);
  const isLongText = field.type === "textarea";

  return (
    <div className="grid gap-2 text-sm">
      <p className="font-medium">
        {field.label}
        {field.required ? <RequiredMark /> : null}
      </p>
      <div
        className={cn(
          "rounded-md border border-border bg-muted px-3 py-2 text-sm whitespace-pre-wrap",
          isLongText && "min-h-20",
        )}
      >
        {formatted || "—"}
      </div>
      {field.helpText ? (
        <p className="text-xs text-muted-foreground">{field.helpText}</p>
      ) : null}
    </div>
  );
}

function formatClinicalFieldValue(field: ClinicalField, value: unknown) {
  if (value === null || value === undefined || value === "") return "";

  if (field.type === "boolean") {
    if (value === true || value === "true") return "Sim";
    if (value === false || value === "false") return "Não";
    return "";
  }

  if (field.type === "select") {
    return (
      field.options.find((option) => option.id === String(value))?.label ??
      String(value)
    );
  }

  if (field.type === "multiselect") {
    const selected = stringArrayValue(value);
    return selected
      .map(
        (item) =>
          field.options.find((option) => option.id === item)?.label ?? item,
      )
      .join(", ");
  }

  if (field.type === "number") {
    const numeric = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(numeric)) return String(value);
    const formatted = new Intl.NumberFormat("pt-BR", {
      maximumFractionDigits: 10,
    }).format(numeric);
    return field.unit ? `${formatted} ${field.unit}` : formatted;
  }

  if (field.type === "date" && /^\d{4}-\d{2}-\d{2}$/.test(String(value))) {
    return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(
      new Date(`${String(value)}T12:00:00`),
    );
  }

  return String(value);
}

function scalarValue(value: unknown) {
  return typeof value === "string" || typeof value === "number"
    ? String(value)
    : "";
}

function numericValue(value: unknown) {
  return typeof value === "number" ||
    (typeof value === "string" &&
      value.trim() &&
      Number.isFinite(Number(value)))
    ? String(value)
    : "";
}

function booleanFormValue(value: unknown) {
  if (value === true || value === "true") return "true";
  if (value === false || value === "false") return "false";
  return undefined;
}

function stringArrayValue(value: unknown) {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string");
  }
  if (typeof value === "string" && value.trim().startsWith("[")) {
    try {
      const parsed: unknown = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed.filter(
          (item): item is string => typeof item === "string",
        );
      }
    } catch {
      return [];
    }
  }
  return [];
}
