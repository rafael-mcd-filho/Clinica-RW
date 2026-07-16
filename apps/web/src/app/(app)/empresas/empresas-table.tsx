"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useMemo, useState } from "react";
import {
  Buildings as Building2,
  CaretDown as ChevronDown,
  CaretUpDown as ChevronsUpDown,
  CaretUp as ChevronUp,
  Headset as Headphones,
  DotsThreeVertical as MoreVertical,
  Pause,
  PencilSimple as Pencil,
  Play,
  MagnifyingGlass as Search,
  Trash as Trash2,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import {
  deleteEmpresa,
  setEmpresaStatus,
  type EmpresaActionState,
} from "./actions";
import { ImpersonateDialog } from "./impersonate-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Input, Select } from "@/components/ui/field";

export type EmpresaUser = {
  id: string;
  name: string;
  email: string;
  status: string;
};

export type EmpresaRow = {
  id: string;
  name: string;
  legal_name: string | null;
  document: string | null;
  status: string;
  created_at: string;
  users: EmpresaUser[];
};

const statusLabel: Record<string, string> = {
  trial: "Trial",
  active: "Ativa",
  suspended: "Suspensa",
  cancelled: "Cancelada",
};

const statusVariant: Record<
  string,
  "neutral" | "success" | "warning" | "destructive"
> = {
  trial: "warning",
  active: "success",
  suspended: "destructive",
  cancelled: "neutral",
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR").format(new Date(value));
}

type DialogState =
  | { type: "impersonate"; org: EmpresaRow }
  | { type: "delete"; org: EmpresaRow }
  | { type: "status"; org: EmpresaRow; nextStatus: "active" | "suspended" }
  | null;

type SortKey = "name" | "admin" | "status" | "created_at";
type SortState = { key: SortKey; dir: "asc" | "desc" };

export function EmpresasTable({
  organizations,
}: {
  organizations: EmpresaRow[];
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sort, setSort] = useState<SortState>({
    key: "created_at",
    dir: "desc",
  });
  const [dialog, setDialog] = useState<DialogState>(null);

  function toggleSort(key: SortKey) {
    setSort((current) =>
      current.key === key
        ? { key, dir: current.dir === "asc" ? "desc" : "asc" }
        : { key, dir: key === "created_at" ? "desc" : "asc" },
    );
  }

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();

    return organizations.filter((org) => {
      if (statusFilter !== "all" && org.status !== statusFilter) {
        return false;
      }

      if (!term) {
        return true;
      }

      const haystack = [
        org.name,
        org.legal_name ?? "",
        org.document ?? "",
        ...org.users.flatMap((user) => [user.name, user.email]),
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(term);
    });
  }, [organizations, query, statusFilter]);

  const sorted = useMemo(() => {
    const dir = sort.dir === "asc" ? 1 : -1;

    return [...filtered].sort((a, b) => {
      if (sort.key === "created_at") {
        return (
          (new Date(a.created_at).getTime() -
            new Date(b.created_at).getTime()) *
          dir
        );
      }

      const value = (org: EmpresaRow) =>
        sort.key === "name"
          ? org.name
          : sort.key === "admin"
            ? (org.users[0]?.name ?? "")
            : (statusLabel[org.status] ?? org.status);

      return value(a).localeCompare(value(b), "pt-BR") * dir;
    });
  }, [filtered, sort]);

  return (
    <div className="grid gap-4">
      <section className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar por empresa, responsável, e-mail ou CNPJ"
            aria-label="Buscar empresas"
            className="w-full pl-9"
          />
        </div>
        <Select
          value={statusFilter}
          onValueChange={setStatusFilter}
          aria-label="Filtrar por status"
          className="sm:w-48"
        >
          <option value="all">Todos os status</option>
          <option value="active">Ativas</option>
          <option value="suspended">Pausadas / Suspensas</option>
          <option value="trial">Trial</option>
          <option value="cancelled">Canceladas</option>
        </Select>
      </section>

      <section className="animate-panel-enter overflow-hidden rounded-lg border border-border bg-card shadow-[var(--shadow-soft)]">
        <div className="max-h-[calc(100vh-18rem)] overflow-y-auto">
          <div className="sticky top-0 z-10 hidden grid-cols-[1.45fr_1fr_0.55fr_0.55fr_2.25rem] items-center gap-4 border-b border-border bg-muted px-5 py-3 md:grid">
            <SortHeader
              label="Empresa"
              sortKey="name"
              sort={sort}
              onSort={toggleSort}
            />
            <SortHeader
              label="Responsável"
              sortKey="admin"
              sort={sort}
              onSort={toggleSort}
            />
            <SortHeader
              label="Status"
              sortKey="status"
              sort={sort}
              onSort={toggleSort}
            />
            <SortHeader
              label="Cadastro"
              sortKey="created_at"
              sort={sort}
              onSort={toggleSort}
            />
            <span className="sr-only">Ações</span>
          </div>

          {sorted.length ? (
            <div className="divide-y divide-border">
              {sorted.map((org) => {
                const admin = org.users[0];
                const isSuspended = org.status === "suspended";

                return (
                  <div
                    key={org.id}
                    className="grid gap-3 px-5 py-4 transition-[background-color] duration-[var(--motion-fast)] ease-[var(--ease-out)] hover:bg-background md:grid-cols-[1.45fr_1fr_0.55fr_0.55fr_2.25rem] md:items-center md:gap-4"
                  >
                    <div className="flex min-w-0 items-center gap-3 md:justify-center">
                      <div className="flex size-9 shrink-0 items-center justify-center rounded bg-muted text-primary">
                        <Building2 className="size-4" aria-hidden="true" />
                      </div>
                      <div className="min-w-0 md:text-center">
                        <Link
                          href={`/empresas/${org.id}`}
                          className="block truncate text-sm font-medium transition-colors duration-[var(--motion-fast)] hover:text-primary"
                        >
                          {org.name}
                        </Link>
                        <p className="truncate text-xs text-muted-foreground">
                          {org.document ?? org.legal_name ?? org.id}
                        </p>
                      </div>
                    </div>
                    <div className="min-w-0 text-sm md:text-center">
                      <p className="truncate font-medium">
                        {admin?.name ?? "Pendente"}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {admin?.email ?? "Sem admin vinculado"}
                      </p>
                    </div>
                    <Badge
                      variant={statusVariant[org.status] ?? "neutral"}
                      className="md:justify-self-center"
                    >
                      {statusLabel[org.status] ?? org.status}
                    </Badge>
                    <span className="text-sm tabular-nums md:justify-self-center">
                      {formatDate(org.created_at)}
                    </span>
                    <div className="flex justify-end">
                      <DropdownMenu
                        triggerLabel={`Ações de ${org.name}`}
                        trigger={
                          <MoreVertical className="size-4" aria-hidden="true" />
                        }
                      >
                        {(close) => (
                          <>
                            <DropdownMenuItem
                              icon={Headphones}
                              onSelect={() => {
                                close();
                                setDialog({ type: "impersonate", org });
                              }}
                            >
                              Acessar como usuário
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              icon={Pencil}
                              onSelect={() => {
                                close();
                                router.push(`/empresas/${org.id}`);
                              }}
                            >
                              Editar empresa
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              icon={isSuspended ? Play : Pause}
                              onSelect={() => {
                                close();
                                setDialog({
                                  type: "status",
                                  org,
                                  nextStatus: isSuspended
                                    ? "active"
                                    : "suspended",
                                });
                              }}
                            >
                              {isSuspended
                                ? "Reativar empresa"
                                : "Pausar empresa"}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              icon={Trash2}
                              variant="destructive"
                              onSelect={() => {
                                close();
                                setDialog({ type: "delete", org });
                              }}
                            >
                              Excluir empresa
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
              <Building2
                className="mx-auto size-8 text-muted-foreground"
                aria-hidden="true"
              />
              <p className="mt-3 text-sm font-medium">
                {organizations.length
                  ? "Nenhuma empresa encontrada"
                  : "Nenhuma empresa visível"}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {organizations.length
                  ? "Ajuste a busca ou o filtro de status."
                  : "Crie a primeira empresa cliente para iniciar o onboarding."}
              </p>
            </div>
          )}
        </div>
      </section>

      {dialog?.type === "impersonate" ? (
        <ImpersonateDialog
          organizationId={dialog.org.id}
          organizationName={dialog.org.name}
          users={dialog.org.users}
          onClose={() => setDialog(null)}
        />
      ) : null}

      {dialog?.type === "status" ? (
        <StatusDialog
          org={dialog.org}
          nextStatus={dialog.nextStatus}
          onClose={() => setDialog(null)}
        />
      ) : null}

      {dialog?.type === "delete" ? (
        <DeleteDialog org={dialog.org} onClose={() => setDialog(null)} />
      ) : null}
    </div>
  );
}

function SortHeader({
  label,
  sortKey,
  sort,
  onSort,
}: {
  label: string;
  sortKey: SortKey;
  sort: SortState;
  onSort: (key: SortKey) => void;
}) {
  const active = sort.key === sortKey;

  return (
    <Button
      type="button"
      variant="ghost"
      onClick={() => onSort(sortKey)}
      className="h-auto justify-self-center gap-1 p-0 text-label font-medium uppercase text-muted-foreground hover:bg-transparent hover:text-foreground"
    >
      {label}
      {active ? (
        sort.dir === "asc" ? (
          <ChevronUp className="size-3.5" aria-hidden="true" />
        ) : (
          <ChevronDown className="size-3.5" aria-hidden="true" />
        )
      ) : (
        <ChevronsUpDown className="size-3.5 opacity-40" aria-hidden="true" />
      )}
    </Button>
  );
}

const empresaInitialState: EmpresaActionState = {};

function StatusDialog({
  org,
  nextStatus,
  onClose,
}: {
  org: EmpresaRow;
  nextStatus: "active" | "suspended";
  onClose: () => void;
}) {
  const action = setEmpresaStatus.bind(null, org.id);
  const [state, formAction, pending] = useActionState(
    action,
    empresaInitialState,
  );
  const suspending = nextStatus === "suspended";

  useEffect(() => {
    if (state.ok) {
      toast.success(suspending ? "Empresa pausada." : "Empresa reativada.");
      onClose();
    }
  }, [state.ok, suspending, onClose]);

  return (
    <ConfirmDialog
      open
      onClose={onClose}
      title={suspending ? "Pausar empresa" : "Reativar empresa"}
      description={
        suspending
          ? `${org.name} ficará suspensa e seus usuários perderão acesso.`
          : `${org.name} voltará a ficar ativa e seus usuários recuperarão o acesso.`
      }
      formAction={formAction}
      pending={pending}
      error={state.error}
      confirmLabel={suspending ? "Pausar empresa" : "Reativar empresa"}
      pendingLabel="Salvando..."
      icon={suspending ? Pause : Play}
    >
      <input type="hidden" name="status" value={nextStatus} />
    </ConfirmDialog>
  );
}

function DeleteDialog({
  org,
  onClose,
}: {
  org: EmpresaRow;
  onClose: () => void;
}) {
  const action = deleteEmpresa.bind(null, org.id);
  const [state, formAction, pending] = useActionState(
    action,
    empresaInitialState,
  );
  const [confirmName, setConfirmName] = useState("");
  const matches =
    confirmName.trim().toLowerCase() === org.name.trim().toLowerCase();

  useEffect(() => {
    if (state.ok) {
      toast.success(`${org.name} foi excluída.`);
      onClose();
    }
  }, [state.ok, org.name, onClose]);

  return (
    <ConfirmDialog
      open
      onClose={onClose}
      title="Excluir empresa"
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
        Serão removidos a empresa <strong>{org.name}</strong>, seus{" "}
        {org.users.length} usuário(s), perfis e dados vinculados. Os logins
        deixarão de funcionar.
      </div>

      <label className="grid gap-2 text-sm font-medium">
        <span>
          Digite <span className="font-semibold">{org.name}</span> para
          confirmar
        </span>
        <Input
          name="confirm_name"
          autoComplete="off"
          value={confirmName}
          onChange={(event) => setConfirmName(event.target.value)}
          placeholder={org.name}
        />
      </label>
    </ConfirmDialog>
  );
}
