"use client";

import { useActionState, useEffect } from "react";
import { FloppyDisk as Save } from "@phosphor-icons/react";
import { toast } from "sonner";
import { updateEmpresa, type UpdateEmpresaState } from "../actions";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
import { LogoUploadField } from "@/components/ui/logo-upload-field";
import { MaskedInput } from "@/components/ui/masked-input";
import { RequiredMark } from "@/components/ui/required-mark";

const initialState: UpdateEmpresaState = {};

type EmpresaDetailsFormProps = {
  organization: {
    id: string;
    name: string;
    legal_name: string | null;
    document: string | null;
    email: string | null;
    phone: string | null;
    logo_url: string | null;
    status: string;
  };
};

export function EmpresaDetailsForm({ organization }: EmpresaDetailsFormProps) {
  const updateEmpresaWithId = updateEmpresa.bind(null, organization.id);
  const [state, action, pending] = useActionState(
    updateEmpresaWithId,
    initialState,
  );

  useEffect(() => {
    if (state.success) {
      toast.success(state.success);
    }
  }, [state]);

  return (
    <form action={action} className="grid gap-5">
      <LogoUploadField currentUrl={organization.logo_url} />

      <div className="grid gap-4 md:grid-cols-2">
        <label className="grid gap-2 text-sm font-medium md:col-span-2">
          <span>
            Nome fantasia
            <RequiredMark />
          </span>
          <Input required name="name" defaultValue={organization.name} />
        </label>

        <label className="grid gap-2 text-sm font-medium">
          Razão social
          <Input
            name="legal_name"
            defaultValue={organization.legal_name ?? ""}
          />
        </label>

        <label className="grid gap-2 text-sm font-medium">
          CNPJ
          <MaskedInput
            name="document"
            inputMode="numeric"
            maskKind="cnpj"
            defaultValue={organization.document ?? ""}
            placeholder="00.000.000/0000-00"
          />
        </label>

        <label className="grid gap-2 text-sm font-medium">
          Telefone
          <MaskedInput
            name="phone"
            inputMode="tel"
            maskKind="phone"
            defaultValue={organization.phone ?? ""}
            placeholder="(11) 0000-0000"
          />
        </label>

        <label className="grid gap-2 text-sm font-medium">
          E-mail
          <Input
            name="email"
            type="email"
            defaultValue={organization.email ?? ""}
            placeholder="contato@empresa.com"
          />
        </label>

        <label className="grid gap-2 text-sm font-medium">
          Status
          <Select name="status" defaultValue={organization.status}>
            <option value="trial">Trial</option>
            <option value="active">Ativa</option>
            <option value="suspended">Suspensa</option>
            <option value="cancelled">Cancelada</option>
          </Select>
        </label>
      </div>

      {state.error ? (
        <p className="rounded border border-destructive-muted bg-destructive-muted px-3 py-2 text-sm text-destructive-foreground">
          {state.error}
        </p>
      ) : null}

      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          <Save className="size-4" aria-hidden="true" />
          {pending ? "Salvando..." : "Salvar alterações"}
        </Button>
      </div>
    </form>
  );
}
