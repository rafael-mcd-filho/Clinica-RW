"use client";

import { useActionState, useEffect } from "react";
import { Save } from "lucide-react";
import { toast } from "sonner";
import { updateEmpresaOwner, type UpdateEmpresaState } from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { MaskedInput } from "@/components/ui/masked-input";
import { RequiredMark } from "@/components/ui/required-mark";

const initialState: UpdateEmpresaState = {};

type OwnerDetailsFormProps = {
  organizationId: string;
  owner: {
    id: string;
    name: string;
    email: string;
    phone: string | null;
  } | null;
};

export function OwnerDetailsForm({
  organizationId,
  owner,
}: OwnerDetailsFormProps) {
  const action = updateEmpresaOwner.bind(null, organizationId);
  const [state, formAction, pending] = useActionState(action, initialState);

  useEffect(() => {
    if (state.success) {
      toast.success(state.success);
    }
  }, [state]);

  if (!owner) {
    return (
      <p className="text-sm text-muted-foreground">
        Esta empresa ainda não possui um responsável vinculado.
      </p>
    );
  }

  return (
    <form action={formAction} className="grid gap-4">
      <input type="hidden" name="user_id" value={owner.id} />

      <label className="grid gap-2 text-sm font-medium">
        <span>
          Nome
          <RequiredMark />
        </span>
        <Input
          required
          name="name"
          defaultValue={owner.name}
          autoComplete="off"
        />
      </label>

      <label className="grid gap-2 text-sm font-medium">
        <span>
          E-mail
          <RequiredMark />
        </span>
        <Input
          required
          name="email"
          type="email"
          defaultValue={owner.email}
          autoComplete="off"
        />
      </label>

      <label className="grid gap-2 text-sm font-medium">
        Telefone
        <MaskedInput
          name="phone"
          inputMode="tel"
          maskKind="phone"
          defaultValue={owner.phone ?? ""}
          placeholder="(11) 90000-0000"
        />
      </label>

      {state.error ? (
        <p className="rounded border border-destructive-muted bg-destructive-muted px-3 py-2 text-sm text-destructive-foreground">
          {state.error}
        </p>
      ) : null}

      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          <Save className="size-4" aria-hidden="true" />
          {pending ? "Salvando..." : "Salvar responsável"}
        </Button>
      </div>
    </form>
  );
}
