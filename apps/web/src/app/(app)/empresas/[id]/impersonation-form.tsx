"use client";

import { useActionState, useEffect } from "react";
import { Headset as Headphones } from "@phosphor-icons/react";
import { toast } from "sonner";
import {
  startImpersonation,
  type ImpersonationActionState,
} from "@/app/(app)/suporte/actions";
import { Button } from "@/components/ui/button";
import { FormError } from "@/components/ui/form-error";
import { Input } from "@/components/ui/field";

const initialState: ImpersonationActionState = {};

export function ImpersonationForm({
  organizationId,
  targetUserId,
}: {
  organizationId: string;
  targetUserId: string;
}) {
  const startImpersonationWithOrg = startImpersonation.bind(
    null,
    organizationId,
  );
  const [state, action, pending] = useActionState(
    startImpersonationWithOrg,
    initialState,
  );

  useEffect(() => {
    if (state.error) toast.error(state.error);
  }, [state]);

  return (
    <form
      action={action}
      className="mt-5 grid gap-3 border-t border-border pt-4"
    >
      <input type="hidden" name="target_user_id" value={targetUserId} />
      <label className="grid gap-2 text-xs font-medium text-muted-foreground">
        Motivo do acesso de suporte
        <Input
          required
          minLength={5}
          name="reason"
          placeholder="Ex.: suporte solicitado pelo cliente"
        />
      </label>

      <FormError message={state.error} />

      <Button type="submit" variant="secondary" disabled={pending}>
        <Headphones className="size-4" aria-hidden="true" />
        {pending ? "Iniciando..." : "Acessar como admin"}
      </Button>
    </form>
  );
}
