"use client";

import { useState } from "react";
import { Headphones } from "lucide-react";
import { ImpersonateDialog, type ImpersonateUser } from "../impersonate-dialog";
import { Button } from "@/components/ui/button";

export function ImpersonateButton({
  organizationId,
  organizationName,
  users,
}: {
  organizationId: string;
  organizationName: string;
  users: ImpersonateUser[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        onClick={() => setOpen(true)}
        disabled={users.length === 0}
      >
        <Headphones className="size-4" aria-hidden="true" />
        Acessar como usuário
      </Button>

      {open ? (
        <ImpersonateDialog
          organizationId={organizationId}
          organizationName={organizationName}
          users={users}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}
