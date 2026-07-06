"use client";

import { useActionState, useEffect } from "react";
import { Save, UserPlus } from "lucide-react";
import { toast } from "sonner";
import {
  createPatient,
  updatePatient,
  type PatientActionState,
} from "./actions";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { DatePickerInput } from "@/components/ui/date-picker-input";
import { Input, Select } from "@/components/ui/field";
import { MaskedInput } from "@/components/ui/masked-input";
import { RequiredMark } from "@/components/ui/required-mark";

export type PatientFormValues = {
  id: string;
  full_name: string;
  social_name: string | null;
  birth_date: string | null;
  sex_at_birth: string | null;
  cpf: string | null;
  rg: string | null;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  preferred_contact: string;
  allow_whatsapp: boolean;
  allow_email: boolean;
  allow_sms: boolean;
  source: string | null;
  address: {
    postal_code: string | null;
    address_line: string | null;
    address_number: string | null;
    address_complement: string | null;
    district: string | null;
    city: string | null;
    state: string | null;
  } | null;
};

const initialState: PatientActionState = {};

export function PatientForm({
  patient,
  canSeeSensitive,
}: {
  patient?: PatientFormValues;
  canSeeSensitive: boolean;
}) {
  const editing = Boolean(patient);
  const action = patient ? updatePatient.bind(null, patient.id) : createPatient;
  const [state, formAction, pending] = useActionState(action, initialState);

  useEffect(() => {
    if (state.success) toast.success(state.success);
  }, [state]);

  return (
    <form action={formAction} className="grid gap-5">
      <Card>
        <CardHeader>
          <h2 className="font-semibold">Dados pessoais</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Identificação principal usada na agenda e no atendimento.
          </p>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <Field label="Nome completo" required wide>
            <Input
              name="full_name"
              required
              defaultValue={patient?.full_name ?? ""}
              autoComplete="name"
            />
          </Field>
          <Field label="Nome social" wide>
            <Input
              name="social_name"
              defaultValue={patient?.social_name ?? ""}
            />
          </Field>
          <Field label="Data de nascimento">
            <DatePickerInput
              name="birth_date"
              defaultValue={patient?.birth_date ?? ""}
            />
          </Field>
          <Field label="Sexo ao nascer">
            <Select
              name="sex_at_birth"
              defaultValue={patient?.sex_at_birth ?? ""}
              allowEmptyOption
            >
              <option value="">Não informado</option>
              <option value="female">Feminino</option>
              <option value="male">Masculino</option>
              <option value="intersex">Intersexo</option>
              <option value="not_informed">Prefere não informar</option>
            </Select>
          </Field>
          <Field label="CPF">
            <MaskedInput
              name="cpf"
              inputMode="numeric"
              maskKind="cpf"
              defaultValue={patient?.cpf ?? ""}
              placeholder="000.000.000-00"
            />
          </Field>
          <Field label="RG">
            <Input name="rg" defaultValue={patient?.rg ?? ""} />
          </Field>
          <Field label="Origem do paciente">
            <Input
              name="source"
              defaultValue={patient?.source ?? ""}
              placeholder="Indicação, Instagram, site..."
            />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="font-semibold">Contato e comunicação</h2>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <Field label="E-mail">
            <Input
              name="email"
              type="email"
              defaultValue={patient?.email ?? ""}
              autoComplete="email"
            />
          </Field>
          <Field label="Telefone">
            <MaskedInput
              name="phone"
              inputMode="tel"
              maskKind="phone"
              defaultValue={patient?.phone ?? ""}
            />
          </Field>
          <Field label="WhatsApp">
            <MaskedInput
              name="whatsapp"
              inputMode="tel"
              maskKind="phone"
              defaultValue={patient?.whatsapp ?? ""}
            />
          </Field>
          <Field label="Canal preferido">
            <Select
              name="preferred_contact"
              defaultValue={patient?.preferred_contact ?? "whatsapp"}
            >
              <option value="whatsapp">WhatsApp</option>
              <option value="phone">Telefone</option>
              <option value="email">E-mail</option>
              <option value="none">Não contatar</option>
            </Select>
          </Field>
          <div className="grid gap-2 md:col-span-2 lg:col-span-2">
            <span className="text-sm font-medium">Autorizações de contato</span>
            <div className="flex flex-wrap gap-4 rounded-md border border-border bg-background px-3 py-2.5">
              <Checkbox
                name="allow_whatsapp"
                defaultChecked={patient?.allow_whatsapp}
                label="WhatsApp"
              />
              <Checkbox
                name="allow_email"
                defaultChecked={patient?.allow_email}
                label="E-mail"
              />
              <Checkbox
                name="allow_sms"
                defaultChecked={patient?.allow_sms}
                label="SMS"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {canSeeSensitive ? (
        <Card>
          <CardHeader>
            <h2 className="font-semibold">Endereço</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Visível apenas para perfis com acesso a dados sensíveis.
            </p>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <Field label="CEP">
              <MaskedInput
                name="postal_code"
                maskKind="cep"
                defaultValue={patient?.address?.postal_code ?? ""}
              />
            </Field>
            <Field label="Endereço" wide>
              <Input
                name="address_line"
                defaultValue={patient?.address?.address_line ?? ""}
              />
            </Field>
            <Field label="Número">
              <Input
                name="address_number"
                defaultValue={patient?.address?.address_number ?? ""}
              />
            </Field>
            <Field label="Complemento">
              <Input
                name="address_complement"
                defaultValue={patient?.address?.address_complement ?? ""}
              />
            </Field>
            <Field label="Bairro">
              <Input
                name="district"
                defaultValue={patient?.address?.district ?? ""}
              />
            </Field>
            <Field label="Cidade">
              <Input name="city" defaultValue={patient?.address?.city ?? ""} />
            </Field>
            <Field label="UF">
              <Input
                name="state"
                maxLength={2}
                defaultValue={patient?.address?.state ?? ""}
              />
            </Field>
          </CardContent>
        </Card>
      ) : null}

      {!editing ? (
        <Card>
          <CardContent className="pt-5">
            <Checkbox
              name="lgpd_consent"
              label="Paciente aceitou o aviso de privacidade LGPD (versão 1.0)"
            />
          </CardContent>
        </Card>
      ) : null}

      {state.error ? (
        <p className="rounded-md border border-destructive-muted bg-destructive-muted px-3 py-2 text-sm text-destructive-foreground">
          {state.error}
        </p>
      ) : null}

      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {editing ? (
            <Save className="size-4" />
          ) : (
            <UserPlus className="size-4" />
          )}
          {pending
            ? "Salvando..."
            : editing
              ? "Salvar dados pessoais"
              : "Cadastrar paciente"}
        </Button>
      </div>
    </form>
  );
}

function Field({
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
