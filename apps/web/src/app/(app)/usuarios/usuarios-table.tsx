"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import {
  Check,
  Copy,
  KeyRound,
  Lock,
  MoreVertical,
  Pencil,
  Search,
  Trash2,
  Unlock,
  UserRound,
  UsersRound,
} from "lucide-react";
import { toast } from "sonner";
import {
  deleteUser,
  setUserPassword,
  setUserStatus,
  updateUser,
  type UserActionState,
} from "./actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, FormDialog } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Input, Select } from "@/components/ui/field";
import { MaskedInput } from "@/components/ui/masked-input";
import { Modal } from "@/components/ui/modal";
import { RequiredMark } from "@/components/ui/required-mark";
import { formatPhoneBR } from "@/lib/validation/br";

export type UsuarioRow = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  status: string;
  organization_id: string | null;
  organizationName: string;
  profileNames: string[];
};

type OrganizationOption = { id: string; name: string };

const statusLabel: Record<string, string> = {
  invited: "Convidado",
  active: "Ativo",
  suspended: "Bloqueado",
};

const statusVariant: Record<
  string,
  "neutral" | "success" | "warning" | "destructive"
> = {
  invited: "warning",
  active: "success",
  suspended: "destructive",
};

type DialogState =
  | { type: "edit"; user: UsuarioRow }
  | { type: "password"; user: UsuarioRow }
  | { type: "status"; user: UsuarioRow }
  | { type: "delete"; user: UsuarioRow }
  | null;

const initialState: UserActionState = {};

export function UsuariosTable({
  users,
  organizations,
  roleNames,
}: {
  users: UsuarioRow[];
  organizations: OrganizationOption[];
  roleNames: string[];
}) {
  const [query, setQuery] = useState("");
  const [orgFilter, setOrgFilter] = useState("all");
  const [roleFilter, setRoleFilter] = useState("all");
  const [dialog, setDialog] = useState<DialogState>(null);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();

    return users.filter((user) => {
      if (orgFilter !== "all" && user.organization_id !== orgFilter) {
        return false;
      }
      if (roleFilter !== "all" && !user.profileNames.includes(roleFilter)) {
        return false;
      }
      if (!term) {
        return true;
      }
      return [user.name, user.email, user.phone ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(term);
    });
  }, [users, query, orgFilter, roleFilter]);

  return (
    <div className="grid gap-4">
      <section className="grid gap-3 md:grid-cols-[1fr_auto_auto]">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar por nome, e-mail ou telefone"
            aria-label="Buscar usuários"
            className="w-full pl-9"
          />
        </div>
        <Select
          value={orgFilter}
          onValueChange={setOrgFilter}
          aria-label="Filtrar por empresa"
          className="md:w-52"
        >
          <option value="all">Todas as empresas</option>
          {organizations.map((organization) => (
            <option key={organization.id} value={organization.id}>
              {organization.name}
            </option>
          ))}
        </Select>
        <Select
          value={roleFilter}
          onValueChange={setRoleFilter}
          aria-label="Filtrar por perfil"
          className="md:w-48"
        >
          <option value="all">Todos os perfis</option>
          {roleNames.map((role) => (
            <option key={role} value={role}>
              {role}
            </option>
          ))}
        </Select>
      </section>

      <section className="animate-panel-enter overflow-hidden rounded-lg border border-border bg-card shadow-[var(--shadow-soft)]">
        <div className="max-h-[calc(100vh-20rem)] overflow-y-auto">
          <div className="sticky top-0 z-10 hidden grid-cols-[1.6fr_1fr_0.9fr_0.6fr_2.25rem] items-center gap-4 border-b border-border bg-muted px-5 py-3 text-xs font-medium uppercase text-muted-foreground md:grid">
            <span>Usuário</span>
            <span>Empresa</span>
            <span>Perfil</span>
            <span className="text-center">Status</span>
            <span className="sr-only">Ações</span>
          </div>

          {filtered.length ? (
            <div className="divide-y divide-border">
              {filtered.map((user) => {
                const isBlocked = user.status === "suspended";

                return (
                  <div
                    key={user.id}
                    className="grid gap-3 px-5 py-4 transition-[background-color] duration-[var(--motion-fast)] ease-[var(--ease-out)] hover:bg-background md:grid-cols-[1.6fr_1fr_0.9fr_0.6fr_2.25rem] md:items-center md:gap-4"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex size-9 shrink-0 items-center justify-center rounded bg-muted text-primary">
                        <UserRound className="size-4" aria-hidden="true" />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {user.name}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {user.email}
                          {user.phone ? ` · ${formatPhoneBR(user.phone)}` : ""}
                        </p>
                      </div>
                    </div>
                    <span className="truncate text-sm">
                      {user.organizationName}
                    </span>
                    <span className="truncate text-sm text-muted-foreground">
                      {user.profileNames.length
                        ? user.profileNames.join(", ")
                        : "—"}
                    </span>
                    <Badge
                      variant={statusVariant[user.status] ?? "neutral"}
                      className="md:justify-self-center"
                    >
                      {statusLabel[user.status] ?? user.status}
                    </Badge>
                    <div className="flex justify-end">
                      <DropdownMenu
                        triggerLabel={`Ações de ${user.name}`}
                        trigger={
                          <MoreVertical className="size-4" aria-hidden="true" />
                        }
                      >
                        {(close) => (
                          <>
                            <DropdownMenuItem
                              icon={Pencil}
                              onSelect={() => {
                                close();
                                setDialog({ type: "edit", user });
                              }}
                            >
                              Editar
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              icon={KeyRound}
                              onSelect={() => {
                                close();
                                setDialog({ type: "password", user });
                              }}
                            >
                              Alterar senha
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              icon={isBlocked ? Unlock : Lock}
                              onSelect={() => {
                                close();
                                setDialog({ type: "status", user });
                              }}
                            >
                              {isBlocked ? "Desbloquear" : "Bloquear"}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              icon={Trash2}
                              variant="destructive"
                              onSelect={() => {
                                close();
                                setDialog({ type: "delete", user });
                              }}
                            >
                              Excluir
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenu>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="px-5 py-10 text-center">
              <UsersRound
                className="mx-auto size-8 text-muted-foreground"
                aria-hidden="true"
              />
              <p className="mt-3 text-sm font-medium">
                {users.length
                  ? "Nenhum usuário encontrado"
                  : "Nenhum usuário cadastrado"}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {users.length
                  ? "Ajuste a busca ou os filtros."
                  : "Os usuários aparecem aqui conforme as empresas são criadas."}
              </p>
            </div>
          )}
        </div>
      </section>

      {dialog?.type === "edit" ? (
        <EditUserDialog user={dialog.user} onClose={() => setDialog(null)} />
      ) : null}

      {dialog?.type === "password" ? (
        <PasswordDialog user={dialog.user} onClose={() => setDialog(null)} />
      ) : null}

      {dialog?.type === "status" ? (
        <StatusDialog user={dialog.user} onClose={() => setDialog(null)} />
      ) : null}

      {dialog?.type === "delete" ? (
        <DeleteDialog user={dialog.user} onClose={() => setDialog(null)} />
      ) : null}
    </div>
  );
}

function EditUserDialog({
  user,
  onClose,
}: {
  user: UsuarioRow;
  onClose: () => void;
}) {
  const action = updateUser.bind(null, user.id);
  const [state, formAction, pending] = useActionState(action, initialState);

  useEffect(() => {
    if (state.ok) {
      toast.success("Usuário atualizado.");
      onClose();
    }
  }, [state.ok, onClose]);

  return (
    <FormDialog
      open
      onClose={onClose}
      title="Editar usuário"
      description={`Atualize os dados de ${user.name}.`}
      formAction={formAction}
      pending={pending}
      error={state.error}
      confirmLabel="Salvar"
      icon={Pencil}
    >
      <label className="grid gap-2 text-sm font-medium">
        <span>
          Nome
          <RequiredMark />
        </span>
        <Input required name="name" defaultValue={user.name} />
      </label>

      <label className="grid gap-2 text-sm font-medium">
        <span>
          E-mail
          <RequiredMark />
        </span>
        <Input required name="email" type="email" defaultValue={user.email} />
      </label>

      <label className="grid gap-2 text-sm font-medium">
        Telefone
        <MaskedInput
          name="phone"
          inputMode="tel"
          maskKind="phone"
          defaultValue={user.phone ?? ""}
          placeholder="(11) 90000-0000"
        />
      </label>
    </FormDialog>
  );
}

function PasswordDialog({
  user,
  onClose,
}: {
  user: UsuarioRow;
  onClose: () => void;
}) {
  const action = setUserPassword.bind(null, user.id);
  const [state, formAction, pending] = useActionState(action, initialState);
  const [mode, setMode] = useState<"manual" | "link">("manual");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (state.ok && !state.link) {
      toast.success("Senha atualizada.");
      onClose();
    }
  }, [state.ok, state.link, onClose]);

  async function handleCopy() {
    if (!state.link) {
      return;
    }
    await navigator.clipboard.writeText(state.link);
    setCopied(true);
    toast.success("Link copiado.");
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Alterar senha"
      description={`Defina uma nova senha para ${user.name}.`}
    >
      {state.link ? (
        <div className="grid gap-3">
          <p className="text-sm">
            Link de redefinição gerado. Copie e envie ao usuário (o envio
            automático por e-mail depende de SMTP configurado).
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              readOnly
              value={state.link}
              onFocus={(event) => event.currentTarget.select()}
              className="flex-1 font-mono text-xs"
            />
            <Button type="button" variant="secondary" onClick={handleCopy}>
              {copied ? (
                <Check className="size-4" aria-hidden="true" />
              ) : (
                <Copy className="size-4" aria-hidden="true" />
              )}
              {copied ? "Copiado" : "Copiar"}
            </Button>
          </div>
          <div className="flex justify-end">
            <Button type="button" onClick={onClose}>
              Concluir
            </Button>
          </div>
        </div>
      ) : (
        <form action={formAction} className="grid gap-4">
          <div className="grid gap-2 sm:grid-cols-2">
            <label
              className={
                "flex cursor-pointer items-start gap-2 rounded-lg border p-3 text-sm transition-colors duration-[var(--motion-fast)] " +
                (mode === "manual"
                  ? "border-primary bg-primary-muted"
                  : "border-border hover:bg-muted")
              }
            >
              <input
                type="radio"
                name="mode"
                value="manual"
                checked={mode === "manual"}
                onChange={() => setMode("manual")}
                className="mt-0.5 size-4"
              />
              <span className="font-medium">Definir manualmente</span>
            </label>
            <label
              className={
                "flex cursor-pointer items-start gap-2 rounded-lg border p-3 text-sm transition-colors duration-[var(--motion-fast)] " +
                (mode === "link"
                  ? "border-primary bg-primary-muted"
                  : "border-border hover:bg-muted")
              }
            >
              <input
                type="radio"
                name="mode"
                value="link"
                checked={mode === "link"}
                onChange={() => setMode("link")}
                className="mt-0.5 size-4"
              />
              <span className="font-medium">Gerar link de redefinição</span>
            </label>
          </div>

          {mode === "manual" ? (
            <label className="grid gap-2 text-sm font-medium">
              <span>
                Nova senha
                <RequiredMark />
              </span>
              <Input
                name="password"
                type="password"
                minLength={8}
                autoComplete="new-password"
                placeholder="Mínimo de 8 caracteres"
              />
            </label>
          ) : (
            <p className="rounded-md border border-border bg-muted px-3 py-2 text-xs text-muted-foreground">
              Geramos um link para o usuário definir a própria senha. Ele
              aparecerá aqui para você copiar.
            </p>
          )}

          {state.error ? (
            <p className="text-sm text-destructive">{state.error}</p>
          ) : null}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              <KeyRound className="size-4" aria-hidden="true" />
              {pending
                ? "Processando..."
                : mode === "manual"
                  ? "Alterar senha"
                  : "Gerar link"}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}

function StatusDialog({
  user,
  onClose,
}: {
  user: UsuarioRow;
  onClose: () => void;
}) {
  const isBlocked = user.status === "suspended";
  const nextStatus = isBlocked ? "active" : "suspended";
  const action = setUserStatus.bind(null, user.id);
  const [state, formAction, pending] = useActionState(action, initialState);

  useEffect(() => {
    if (state.ok) {
      toast.success(isBlocked ? "Usuário desbloqueado." : "Usuário bloqueado.");
      onClose();
    }
  }, [state.ok, isBlocked, onClose]);

  return (
    <ConfirmDialog
      open
      onClose={onClose}
      title={isBlocked ? "Desbloquear usuário" : "Bloquear usuário"}
      description={
        isBlocked
          ? `${user.name} voltará a ter acesso ao sistema.`
          : `${user.name} perderá o acesso ao sistema até ser desbloqueado.`
      }
      formAction={formAction}
      pending={pending}
      error={state.error}
      confirmLabel={isBlocked ? "Desbloquear" : "Bloquear"}
      pendingLabel="Salvando..."
      icon={isBlocked ? Unlock : Lock}
    >
      <input type="hidden" name="status" value={nextStatus} />
    </ConfirmDialog>
  );
}

function DeleteDialog({
  user,
  onClose,
}: {
  user: UsuarioRow;
  onClose: () => void;
}) {
  const action = deleteUser.bind(null, user.id);
  const [state, formAction, pending] = useActionState(action, initialState);
  const [confirmEmail, setConfirmEmail] = useState("");
  const matches =
    confirmEmail.trim().toLowerCase() === user.email.toLowerCase();

  useEffect(() => {
    if (state.ok) {
      toast.success(`${user.name} foi excluído.`);
      onClose();
    }
  }, [state.ok, user.name, onClose]);

  return (
    <ConfirmDialog
      open
      onClose={onClose}
      title="Excluir usuário"
      description="Esta ação é permanente e não pode ser desfeita."
      formAction={formAction}
      pending={pending}
      error={state.error}
      confirmLabel="Excluir definitivamente"
      pendingLabel="Excluindo..."
      confirmDisabled={!matches}
      destructive
      icon={Trash2}
    >
      <div className="rounded-md border border-destructive/40 bg-destructive-muted px-3 py-2.5 text-sm text-destructive-foreground">
        O login de <strong>{user.name}</strong> deixará de funcionar e seus
        vínculos serão removidos.
      </div>

      <label className="grid gap-2 text-sm font-medium">
        <span>
          Digite <span className="font-semibold">{user.email}</span> para
          confirmar
        </span>
        <Input
          name="confirm_email"
          autoComplete="off"
          value={confirmEmail}
          onChange={(event) => setConfirmEmail(event.target.value)}
          placeholder={user.email}
        />
      </label>
    </ConfirmDialog>
  );
}
