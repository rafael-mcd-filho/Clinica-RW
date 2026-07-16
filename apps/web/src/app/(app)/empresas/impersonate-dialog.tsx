"use client";

import { useActionState } from "react";
import { Headset as Headphones } from "@phosphor-icons/react";
import {
  startImpersonation,
  type ImpersonationActionState,
} from "@/app/(app)/suporte/actions";
import { FormDialog } from "@/components/ui/dialog";
import { Input, Select } from "@/components/ui/field";
import { RequiredMark } from "@/components/ui/required-mark";

export type ImpersonateUser = {
  id: string;
  name: string;
  email: string;
  status: string;
};

const initialState: ImpersonationActionState = {};

export function ImpersonateDialog({
  organizationId,
  organizationName,
  users,
  onClose,
}: {
  organizationId: string;
  organizationName: string;
  users: ImpersonateUser[];
  onClose: () => void;
}) {
  const action = startImpersonation.bind(null, organizationId);
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <FormDialog
      open
      onClose={onClose}
      title="Acessar como usuário"
      description={`Inicie um acesso de suporte em ${organizationName}.`}
      formAction={formAction}
      pending={pending}
      error={state.error}
      confirmLabel="Iniciar acesso"
      pendingLabel="Iniciando..."
      confirmDisabled={users.length === 0}
      icon={Headphones}
    >
      <label className="grid gap-2 text-sm font-medium">
        <span>
          Usuário
          <RequiredMark />
        </span>
        <Select
          name="target_user_id"
          required
          defaultValue=""
          placeholder="Selecione um usuário"
        >
          <option value="" disabled>
            Selecione um usuário
          </option>
          {users.map((user) => (
            <option
              key={user.id}
              value={user.id}
              disabled={user.status !== "active"}
            >
              {user.name} ({user.email})
              {user.status !== "active" ? " - inativo" : ""}
            </option>
          ))}
        </Select>
      </label>

      <label className="grid gap-2 text-sm font-medium">
        Motivo do acesso de suporte{" "}
        <span className="font-normal text-muted-foreground">(opcional)</span>
        <Input
          name="reason"
          placeholder="Ex.: suporte solicitado pelo cliente"
        />
      </label>

      {users.length === 0 ? (
        <p className="text-xs text-destructive">
          Esta empresa ainda não possui usuários para acessar.
        </p>
      ) : null}
    </FormDialog>
  );
}
