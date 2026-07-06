"use client";

import { useActionState } from "react";
import { Headphones } from "lucide-react";
import {
  startImpersonation,
  type ImpersonationActionState,
} from "@/app/(app)/suporte/actions";
import { Button } from "@/components/ui/button";
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

      {state.error ? (
        <p className="text-xs text-destructive">{state.error}</p>
      ) : null}

      <Button type="submit" variant="secondary" disabled={pending}>
        <Headphones className="size-4" aria-hidden="true" />
        {pending ? "Iniciando..." : "Acessar como admin"}
      </Button>
    </form>
  );
}
