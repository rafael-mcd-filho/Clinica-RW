"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import {
  ArrowsClockwise as RefreshCw,
  Check,
  Copy,
  DotsThreeVertical as MoreVertical,
  Key as KeyRound,
  Lock,
  LockOpen,
  MagnifyingGlass as Search,
  PencilSimple as Pencil,
  Plus,
  ShieldCheck,
  Trash,
  UserCircle,
  UserPlus,
  UsersThree,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import {
  createCompanyProfile,
  createSetupLink,
  deleteCompanyProfile,
  duplicateCompanyProfile,
  inviteCompanyUser,
  setCompanyUserPermissionOverrides,
  setCompanyUserProfile,
  setCompanyUserScopes,
  setCompanyUserStatus,
  updateCompanyProfile,
  updateCompanyUser,
} from "./actions";
import type {
  AccessActionState,
  AccessPermission,
  AccessProfile,
  CompanyAccessData,
  CompanyAccessUser,
  ResourceScope,
} from "./types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmDialog, FormDialog } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Input, Select, Textarea } from "@/components/ui/field";
import { MaskedInput } from "@/components/ui/masked-input";
import { Modal } from "@/components/ui/modal";
import { RequiredMark } from "@/components/ui/required-mark";
import { Tabs } from "@/components/ui/tabs";
import { formatPhoneBR } from "@/lib/validation/br";

const initialState: AccessActionState = {};

type ScopeMode = "own" | "all" | "custom";
type EditableScope = ResourceScope & { clientId: string };

type UserDialog =
  | { type: "invite" }
  | { type: "edit"; user: CompanyAccessUser }
  | { type: "profile"; user: CompanyAccessUser }
  | { type: "permissions"; user: CompanyAccessUser }
  | { type: "scope"; user: CompanyAccessUser }
  | { type: "setup"; user: CompanyAccessUser }
  | { type: "status"; user: CompanyAccessUser }
  | null;

type ProfileDialog =
  | { type: "create" }
  | { type: "edit"; profile: AccessProfile }
  | { type: "duplicate"; profile: AccessProfile }
  | { type: "delete"; profile: AccessProfile }
  | null;

const statusLabels = {
  invited: "Convidado",
  active: "Ativo",
  suspended: "Suspenso",
} as const;

const auditLabels: Record<string, string> = {
  "user.access_created": "Acesso criado",
  "user.updated": "Usuário atualizado",
  "user.access_suspended": "Acesso suspenso",
  "user.access_reactivated": "Acesso reativado",
  "user.profile_changed": "Perfil do usuário alterado",
  "user.permission_overrides_changed": "Exceções de permissão alteradas",
  "user.resource_scopes_changed": "Escopo de acesso alterado",
  "user.setup_link_generated": "Novo link de acesso gerado",
  "professional.user_link_changed": "Vínculo profissional alterado",
  "profile.created": "Perfil criado",
  "profile.updated": "Perfil atualizado",
  "profile.duplicated": "Perfil duplicado",
  "profile.deleted": "Perfil excluído",
};

export function AccessManager({ data }: { data: CompanyAccessData }) {
  const [userDialog, setUserDialog] = useState<UserDialog>(null);
  const [profileDialog, setProfileDialog] = useState<ProfileDialog>(null);

  return (
    <>
      <Tabs
        urlParam="secao"
        items={[
          {
            id: "usuarios",
            label: `Usuários (${data.users.length})`,
            icon: <UsersThree />,
            content: <UsersPanel data={data} onOpenDialog={setUserDialog} />,
          },
          {
            id: "perfis",
            label: `Perfis (${data.profiles.length})`,
            icon: <ShieldCheck />,
            content: (
              <ProfilesPanel data={data} onOpenDialog={setProfileDialog} />
            ),
          },
          {
            id: "historico",
            label: "Histórico de alterações",
            icon: <RefreshCw />,
            content: <AuditPanel data={data} />,
          },
        ]}
      />

      {userDialog?.type === "invite" ? (
        <InviteUserDialog data={data} onClose={() => setUserDialog(null)} />
      ) : userDialog?.type === "edit" ? (
        <EditUserDialog
          data={data}
          user={userDialog.user}
          onClose={() => setUserDialog(null)}
        />
      ) : userDialog?.type === "profile" ? (
        <AssignProfileDialog
          profiles={data.profiles}
          user={userDialog.user}
          onClose={() => setUserDialog(null)}
        />
      ) : userDialog?.type === "permissions" ? (
        <PermissionOverridesDialog
          data={data}
          user={userDialog.user}
          onClose={() => setUserDialog(null)}
        />
      ) : userDialog?.type === "scope" ? (
        <ScopeDialog
          data={data}
          user={userDialog.user}
          onClose={() => setUserDialog(null)}
        />
      ) : userDialog?.type === "setup" ? (
        <SetupLinkDialog
          user={userDialog.user}
          onClose={() => setUserDialog(null)}
        />
      ) : userDialog?.type === "status" ? (
        <StatusDialog
          currentUserId={data.currentUserId}
          user={userDialog.user}
          onClose={() => setUserDialog(null)}
        />
      ) : null}

      {profileDialog?.type === "create" ? (
        <ProfileEditorDialog
          permissions={data.permissions}
          onClose={() => setProfileDialog(null)}
        />
      ) : profileDialog?.type === "edit" ? (
        <ProfileEditorDialog
          permissions={data.permissions}
          profile={profileDialog.profile}
          onClose={() => setProfileDialog(null)}
        />
      ) : profileDialog?.type === "duplicate" ? (
        <DuplicateProfileDialog
          profile={profileDialog.profile}
          onClose={() => setProfileDialog(null)}
        />
      ) : profileDialog?.type === "delete" ? (
        <DeleteProfileDialog
          profile={profileDialog.profile}
          onClose={() => setProfileDialog(null)}
        />
      ) : null}
    </>
  );
}

function UsersPanel({
  data,
  onOpenDialog,
}: {
  data: CompanyAccessData;
  onOpenDialog: (dialog: UserDialog) => void;
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const normalizedQuery = query.trim().toLowerCase();
  const filtered = data.users.filter((user) => {
    if (status !== "all" && user.status !== status) return false;
    if (!normalizedQuery) return true;
    return [user.name, user.email, user.phone ?? "", ...user.profileNames]
      .join(" ")
      .toLowerCase()
      .includes(normalizedQuery);
  });

  return (
    <div className="grid gap-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar por nome, e-mail, telefone ou perfil"
            aria-label="Buscar usuários"
            className="pl-9"
          />
        </div>
        <Select
          value={status}
          onValueChange={setStatus}
          aria-label="Filtrar usuários por status"
          className="md:w-44"
        >
          <option value="all">Todos os status</option>
          <option value="active">Ativos</option>
          <option value="suspended">Suspensos</option>
          <option value="invited">Convidados</option>
        </Select>
        <Button type="button" onClick={() => onOpenDialog({ type: "invite" })}>
          <UserPlus className="size-4" aria-hidden="true" />
          Convidar usuário
        </Button>
      </div>

      <Card className="overflow-hidden">
        <div className="hidden grid-cols-[1.35fr_0.8fr_0.9fr_0.9fr_2.5rem] gap-4 border-b border-border bg-muted px-5 py-3 text-xs font-medium uppercase text-muted-foreground lg:grid">
          <span>Usuário</span>
          <span>Perfil</span>
          <span>Profissional</span>
          <span>Status e acesso</span>
          <span className="sr-only">Ações</span>
        </div>
        {filtered.length ? (
          <div className="divide-y divide-border">
            {filtered.map((user) => (
              <div
                key={user.id}
                className="grid gap-3 px-5 py-4 hover:bg-muted/40 lg:grid-cols-[1.35fr_0.8fr_0.9fr_0.9fr_2.5rem] lg:items-center lg:gap-4"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary-muted text-primary">
                    <UserCircle className="size-5" aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {user.name}
                      {user.id === data.currentUserId ? (
                        <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                          (você)
                        </span>
                      ) : null}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {user.email}
                      {user.phone ? ` · ${formatPhoneBR(user.phone)}` : ""}
                    </p>
                  </div>
                </div>
                <span className="text-sm text-secondary-foreground">
                  {user.profileNames.join(", ") || "Sem perfil"}
                </span>
                <span className="text-sm text-muted-foreground">
                  {user.professionalName ?? "Não vinculado"}
                </span>
                <div className="grid gap-1">
                  <Badge
                    variant={
                      user.status === "active"
                        ? "success"
                        : user.status === "suspended"
                          ? "destructive"
                          : "warning"
                    }
                    className="w-fit"
                  >
                    {statusLabels[user.status]}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {user.lastSignInAt
                      ? `Último acesso: ${formatDateTime(user.lastSignInAt)}`
                      : "Nunca acessou"}
                  </span>
                </div>
                <UserActions user={user} onOpenDialog={onOpenDialog} />
              </div>
            ))}
          </div>
        ) : (
          <div className="px-5 py-10 text-center text-sm text-muted-foreground">
            {data.users.length
              ? "Nenhum usuário corresponde aos filtros."
              : "Nenhum usuário cadastrado nesta empresa."}
          </div>
        )}
      </Card>
    </div>
  );
}

function UserActions({
  user,
  onOpenDialog,
}: {
  user: CompanyAccessUser;
  onOpenDialog: (dialog: UserDialog) => void;
}) {
  return (
    <div className="flex justify-end">
      <DropdownMenu
        triggerLabel={`Ações de ${user.name}`}
        trigger={<MoreVertical className="size-4" aria-hidden="true" />}
      >
        {(close) => (
          <>
            <DropdownMenuItem
              icon={Pencil}
              onSelect={() => {
                close();
                onOpenDialog({ type: "edit", user });
              }}
            >
              Dados e vínculo
            </DropdownMenuItem>
            <DropdownMenuItem
              icon={UserCircle}
              onSelect={() => {
                close();
                onOpenDialog({ type: "profile", user });
              }}
            >
              Alterar perfil
            </DropdownMenuItem>
            <DropdownMenuItem
              icon={ShieldCheck}
              onSelect={() => {
                close();
                onOpenDialog({ type: "permissions", user });
              }}
            >
              Exceções de permissão
            </DropdownMenuItem>
            <DropdownMenuItem
              icon={UsersThree}
              onSelect={() => {
                close();
                onOpenDialog({ type: "scope", user });
              }}
            >
              Escopo de dados
            </DropdownMenuItem>
            <DropdownMenuItem
              icon={KeyRound}
              onSelect={() => {
                close();
                onOpenDialog({ type: "setup", user });
              }}
            >
              Gerar link de acesso
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              icon={user.status === "suspended" ? LockOpen : Lock}
              variant={user.status === "suspended" ? "default" : "destructive"}
              onSelect={() => {
                close();
                onOpenDialog({ type: "status", user });
              }}
            >
              {user.status === "suspended"
                ? "Reativar acesso"
                : "Suspender acesso"}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenu>
    </div>
  );
}

function ProfilesPanel({
  data,
  onOpenDialog,
}: {
  data: CompanyAccessData;
  onOpenDialog: (dialog: ProfileDialog) => void;
}) {
  const permissionById = new Map(
    data.permissions.map((permission) => [permission.id, permission]),
  );

  return (
    <div className="grid gap-4">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-base font-semibold">Perfis e permissões</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Perfis padrão são protegidos. Duplique um deles para criar uma
            versão personalizada.
          </p>
        </div>
        <Button type="button" onClick={() => onOpenDialog({ type: "create" })}>
          <Plus className="size-4" aria-hidden="true" />
          Novo perfil
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {data.profiles.map((profile) => (
          <Card key={profile.id} className="flex flex-col">
            <CardHeader className="flex flex-row items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-semibold">{profile.name}</h3>
                  <Badge
                    variant={profile.isSystemDefault ? "primary" : "neutral"}
                  >
                    {profile.isSystemDefault
                      ? "Padrão protegido"
                      : "Personalizado"}
                  </Badge>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {profile.description || "Sem descrição."}
                </p>
              </div>
              <DropdownMenu
                triggerLabel={`Ações do perfil ${profile.name}`}
                trigger={<MoreVertical className="size-4" aria-hidden="true" />}
              >
                {(close) => (
                  <>
                    <DropdownMenuItem
                      icon={Copy}
                      onSelect={() => {
                        close();
                        onOpenDialog({ type: "duplicate", profile });
                      }}
                    >
                      Duplicar perfil
                    </DropdownMenuItem>
                    {!profile.isSystemDefault ? (
                      <>
                        <DropdownMenuItem
                          icon={Pencil}
                          onSelect={() => {
                            close();
                            onOpenDialog({ type: "edit", profile });
                          }}
                        >
                          Editar
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          icon={Trash}
                          variant="destructive"
                          onSelect={() => {
                            close();
                            onOpenDialog({ type: "delete", profile });
                          }}
                        >
                          Excluir
                        </DropdownMenuItem>
                      </>
                    ) : null}
                  </>
                )}
              </DropdownMenu>
            </CardHeader>
            <CardContent className="mt-auto grid gap-3 text-sm">
              <p className="text-xs text-muted-foreground">
                Áreas:{" "}
                {[
                  ...new Set(
                    profile.permissionIds
                      .map(
                        (permissionId) =>
                          permissionById.get(permissionId)?.category,
                      )
                      .filter((category): category is string =>
                        Boolean(category),
                      ),
                  ),
                ].join(", ") || "nenhuma permissão"}
              </p>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="text-muted-foreground">
                  {profile.permissionIds.length} permissões
                </span>
                <span className="text-muted-foreground">
                  {profile.userCount}{" "}
                  {profile.userCount === 1 ? "usuário" : "usuários"}
                </span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function AuditPanel({ data }: { data: CompanyAccessData }) {
  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <h2 className="font-semibold">Histórico de alterações</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Últimas mudanças em usuários, perfis, permissões e escopos desta
          empresa.
        </p>
      </CardHeader>
      {data.auditEvents.length ? (
        <div className="divide-y divide-border">
          {data.auditEvents.map((event) => (
            <div
              key={event.id}
              className="flex flex-col justify-between gap-2 px-5 py-4 sm:flex-row sm:items-center"
            >
              <div>
                <p className="text-sm font-medium">
                  {auditLabels[event.action] ?? event.action}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Por {event.actorName}
                  {event.resourceId
                    ? ` · Recurso ${event.resourceId.slice(0, 8)}`
                    : ""}
                </p>
              </div>
              <time
                dateTime={event.createdAt}
                className="shrink-0 text-xs text-muted-foreground"
              >
                {formatDateTime(event.createdAt)}
              </time>
            </div>
          ))}
        </div>
      ) : (
        <div className="px-5 py-10 text-center text-sm text-muted-foreground">
          Nenhuma alteração de acesso registrada.
        </div>
      )}
    </Card>
  );
}

function InviteUserDialog({
  data,
  onClose,
}: {
  data: CompanyAccessData;
  onClose: () => void;
}) {
  const [state, formAction, pending] = useActionState(
    inviteCompanyUser,
    initialState,
  );
  const [professionalId, setProfessionalId] = useState("");

  if (state.link) {
    return (
      <LinkResultModal
        title="Usuário criado"
        description="Envie este link para que o usuário defina a própria senha."
        link={state.link}
        onClose={onClose}
      />
    );
  }

  const availableProfessionals = data.professionals.filter(
    (professional) => professional.active && !professional.userId,
  );

  return (
    <FormDialog
      open
      onClose={onClose}
      title="Convidar usuário"
      description="Crie a conta, atribua um perfil e, se necessário, vincule um profissional."
      formAction={formAction}
      pending={pending}
      error={state.error}
      confirmLabel="Criar e gerar link"
      pendingLabel="Criando..."
      icon={UserPlus}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-2 text-sm font-medium sm:col-span-2">
          <span>
            Nome <RequiredMark />
          </span>
          <Input name="name" required autoComplete="name" />
        </label>
        <label className="grid gap-2 text-sm font-medium">
          <span>
            E-mail <RequiredMark />
          </span>
          <Input name="email" type="email" required autoComplete="email" />
        </label>
        <label className="grid gap-2 text-sm font-medium">
          Telefone
          <MaskedInput
            name="phone"
            maskKind="phone"
            inputMode="tel"
            placeholder="(85) 90000-0000"
          />
        </label>
        <label className="grid gap-2 text-sm font-medium">
          <span>
            Perfil <RequiredMark />
          </span>
          <Select name="profile_id" required defaultValue="">
            <option value="">Selecione</option>
            {data.profiles.map((profile) => (
              <option key={profile.id} value={profile.id}>
                {profile.name}
              </option>
            ))}
          </Select>
        </label>
        <label className="grid gap-2 text-sm font-medium">
          Profissional vinculado
          <Select
            name="professional_id"
            value={professionalId}
            allowEmptyOption
            onValueChange={setProfessionalId}
          >
            <option value="">Nenhum</option>
            {availableProfessionals.map((professional) => (
              <option key={professional.id} value={professional.id}>
                {professional.name}
              </option>
            ))}
          </Select>
        </label>
        <label className="grid gap-2 text-sm font-medium">
          Escopo inicial da agenda
          {professionalId ? (
            <>
              <input type="hidden" name="initial_agenda_scope" value="own" />
              <Input readOnly value="Somente o próprio profissional" />
            </>
          ) : (
            <Select name="initial_agenda_scope" defaultValue="none">
              <option value="none">Sem escopo explícito de agenda</option>
              <option value="all">Toda a empresa</option>
            </Select>
          )}
        </label>
      </div>
      <p className="rounded-md border border-border bg-muted px-3 py-2 text-xs text-muted-foreground">
        Ao vincular um profissional, o acesso fica limitado aos dados e agendas
        próprios. Sem vínculo, escolha explicitamente se a conta começa sem
        escopo ou com toda a empresa. As permissões continuam definindo as
        ações; config.geral e config.usuarios têm alcance administrativo amplo.
      </p>
    </FormDialog>
  );
}

function EditUserDialog({
  data,
  user,
  onClose,
}: {
  data: CompanyAccessData;
  user: CompanyAccessUser;
  onClose: () => void;
}) {
  const action = updateCompanyUser.bind(null, user.id);
  const [state, formAction, pending] = useActionState(action, initialState);
  useSuccessClose(state, onClose, "Usuário atualizado.");

  const professionals = data.professionals.filter(
    (professional) =>
      professional.userId === user.id ||
      (professional.active && !professional.userId),
  );

  return (
    <FormDialog
      open
      onClose={onClose}
      title="Dados e vínculo profissional"
      description={`Atualize a conta de ${user.name}.`}
      formAction={formAction}
      pending={pending}
      error={state.error}
      icon={Pencil}
    >
      <label className="grid gap-2 text-sm font-medium">
        <span>
          Nome <RequiredMark />
        </span>
        <Input name="name" required defaultValue={user.name} />
      </label>
      <label className="grid gap-2 text-sm font-medium">
        <span>
          E-mail <RequiredMark />
        </span>
        <Input name="email" type="email" required defaultValue={user.email} />
      </label>
      <label className="grid gap-2 text-sm font-medium">
        Telefone
        <MaskedInput
          name="phone"
          maskKind="phone"
          inputMode="tel"
          defaultValue={user.phone ?? ""}
        />
      </label>
      <label className="grid gap-2 text-sm font-medium">
        Profissional vinculado
        <Select
          name="professional_id"
          defaultValue={user.professionalId ?? ""}
          allowEmptyOption
        >
          <option value="">Nenhum</option>
          {professionals.map((professional) => (
            <option key={professional.id} value={professional.id}>
              {professional.name}
            </option>
          ))}
        </Select>
      </label>
    </FormDialog>
  );
}

function AssignProfileDialog({
  profiles,
  user,
  onClose,
}: {
  profiles: AccessProfile[];
  user: CompanyAccessUser;
  onClose: () => void;
}) {
  const action = setCompanyUserProfile.bind(null, user.id);
  const [state, formAction, pending] = useActionState(action, initialState);
  useSuccessClose(state, onClose, "Perfil atualizado.");

  return (
    <FormDialog
      open
      onClose={onClose}
      title="Alterar perfil"
      description={`O perfil define as permissões base de ${user.name}.`}
      formAction={formAction}
      pending={pending}
      error={state.error}
      confirmLabel="Aplicar perfil"
      icon={UserCircle}
    >
      <label className="grid gap-2 text-sm font-medium">
        <span>
          Perfil <RequiredMark />
        </span>
        <Select
          name="profile_id"
          required
          defaultValue={user.profileIds[0] ?? ""}
        >
          <option value="">Selecione</option>
          {profiles.map((profile) => (
            <option key={profile.id} value={profile.id}>
              {profile.name}
            </option>
          ))}
        </Select>
      </label>
      <p className="text-xs text-muted-foreground">
        Exceções individuais continuam valendo após a troca. Revise-as na ação
        “Exceções de permissão”.
      </p>
    </FormDialog>
  );
}

function PermissionOverridesDialog({
  data,
  user,
  onClose,
}: {
  data: CompanyAccessData;
  user: CompanyAccessUser;
  onClose: () => void;
}) {
  const action = setCompanyUserPermissionOverrides.bind(null, user.id);
  const [state, formAction, pending] = useActionState(action, initialState);
  useSuccessClose(state, onClose, "Permissões atualizadas.");

  const profilePermissionIds = new Set(
    data.profiles
      .filter((profile) => user.profileIds.includes(profile.id))
      .flatMap((profile) => profile.permissionIds),
  );
  const overrideByPermission = new Map(
    user.overrides.map((override) => [override.permissionId, override.granted]),
  );

  return (
    <Modal
      open
      onClose={onClose}
      title="Exceções de permissão"
      description={`Conceda ou negue permissões específicas para ${user.name}.`}
      className="max-w-4xl"
    >
      <form action={formAction} className="grid gap-5">
        <p className="rounded-md border border-border bg-muted px-3 py-2 text-xs text-muted-foreground">
          “Herdar” usa o perfil. Uma concessão ou negação individual sempre
          prevalece sobre ele.
        </p>
        <PermissionGroups permissions={data.permissions}>
          {(permission) => {
            const override = overrideByPermission.get(permission.id);
            const defaultValue =
              override === undefined ? "inherit" : override ? "grant" : "deny";
            return (
              <div
                key={permission.id}
                className="grid gap-2 rounded-md border border-border p-3 sm:grid-cols-[1fr_10rem] sm:items-center"
              >
                <div>
                  <p className="text-sm font-medium">
                    {permission.description}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {permission.code} · Perfil:{" "}
                    {profilePermissionIds.has(permission.id)
                      ? "permitido"
                      : "não permitido"}
                  </p>
                </div>
                <Select
                  name={`permission_${permission.id}`}
                  defaultValue={defaultValue}
                  aria-label={`Exceção para ${permission.description}`}
                >
                  <option value="inherit">Herdar perfil</option>
                  <option value="grant">Permitir</option>
                  <option value="deny">Negar</option>
                </Select>
              </div>
            );
          }}
        </PermissionGroups>
        {state.error ? (
          <p className="text-sm text-destructive">{state.error}</p>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={pending}>
            <ShieldCheck className="size-4" aria-hidden="true" />
            {pending ? "Salvando..." : "Salvar exceções"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function ScopeDialog({
  data,
  user,
  onClose,
}: {
  data: CompanyAccessData;
  user: CompanyAccessUser;
  onClose: () => void;
}) {
  const hasExplicitAll = isExplicitAllShortcut(user.scopes);
  const implicitTeamScope = getImplicitTeamScope(data, user);
  const usesImplicitTeamScope = implicitTeamScope === "always";
  const inferredMode = hasExplicitAll
    ? "all"
    : user.scopes.length === 0 && user.professionalId
      ? "own"
      : "custom";
  const [mode, setMode] = useState<ScopeMode>(inferredMode);
  const [scopes, setScopes] = useState<EditableScope[]>(() =>
    user.scopes.map((scope, index) => ({
      ...scope,
      clientId: `existing-${index}`,
    })),
  );
  const action = setCompanyUserScopes.bind(null, user.id);
  const [state, formAction, pending] = useActionState(action, initialState);
  useSuccessClose(state, onClose, "Escopo atualizado.");

  const serializedScopes = JSON.stringify(
    scopes.map((scope) => ({
      resource_type: scope.resourceType,
      resource_id: scope.resourceId,
      access_level: scope.accessLevel,
    })),
  );
  const duplicateScopeKeys = findDuplicateScopeKeys(scopes);

  function updateScope(clientId: string, patch: Partial<ResourceScope>) {
    setScopes((current) =>
      current.map((scope) =>
        scope.clientId === clientId ? { ...scope, ...patch } : scope,
      ),
    );
  }

  function addScope() {
    setScopes((current) => [
      ...current,
      {
        clientId: `new-${Date.now()}-${current.length}`,
        resourceType: "agenda",
        resourceId: null,
        accessLevel: "read",
      },
    ]);
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Escopo de dados"
      description={`Defina sobre quais agendas e profissionais ${user.name} pode atuar.`}
      className="max-w-3xl"
    >
      <form action={formAction} className="grid gap-5">
        <input type="hidden" name="scopes" value={serializedScopes} />
        <div className="grid gap-2 sm:grid-cols-3">
          <ScopeModeOption
            value="own"
            checked={mode === "own"}
            disabled={!user.professionalId}
            title="Próprio profissional"
            description="Acesso implícito somente ao profissional vinculado."
            onChange={() => setMode("own")}
          />
          <ScopeModeOption
            value="all"
            checked={mode === "all"}
            title="Toda a empresa"
            description="Acesso completo aos quatro tipos de recurso."
            onChange={() => setMode("all")}
          />
          <ScopeModeOption
            value="custom"
            checked={mode === "custom"}
            title="Personalizado"
            description="Edite cada recurso e nível de acesso."
            onChange={() => setMode("custom")}
          />
        </div>

        {mode === "own" ? (
          <p className="rounded-md border border-border bg-muted px-3 py-2 text-sm">
            Profissional vinculado: <strong>{user.professionalName}</strong>.
            Nenhum escopo explícito será gravado; a desativação do profissional
            revoga este acesso automaticamente.
          </p>
        ) : mode === "custom" ? (
          <div className="grid gap-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold">Escopos explícitos</p>
                <p className="text-xs text-muted-foreground">
                  “Todos” vale apenas para o tipo escolhido na mesma linha.
                </p>
              </div>
              <Button type="button" variant="secondary" onClick={addScope}>
                <Plus className="size-4" aria-hidden="true" />
                Adicionar escopo
              </Button>
            </div>
            <div className="grid max-h-[24rem] gap-3 overflow-y-auto pr-1">
              {scopes.length ? (
                scopes.map((scope) => (
                  <ScopeEditorRow
                    key={scope.clientId}
                    data={data}
                    scope={scope}
                    duplicate={duplicateScopeKeys.has(scope.clientId)}
                    onChange={(patch) => updateScope(scope.clientId, patch)}
                    onRemove={() =>
                      setScopes((current) =>
                        current.filter(
                          (item) => item.clientId !== scope.clientId,
                        ),
                      )
                    }
                  />
                ))
              ) : (
                <p className="rounded-md border border-dashed border-border px-3 py-4 text-center text-sm text-muted-foreground">
                  Nenhum escopo explícito. Use “Adicionar escopo” para limitar
                  ou ampliar recursos específicos.
                </p>
              )}
            </div>
            {duplicateScopeKeys.size ? (
              <p className="text-sm text-destructive">
                Há linhas duplicadas. Altere ou remova as duplicatas antes de
                salvar.
              </p>
            ) : null}
            {user.professionalId ? (
              <p className="rounded-md border border-border bg-muted px-3 py-2 text-xs text-muted-foreground">
                O acesso implícito ao próprio profissional continua ativo; as
                linhas acima são adicionais.
              </p>
            ) : null}
            {usesImplicitTeamScope ? (
              <p className="rounded-md border border-warning-muted bg-warning-muted px-3 py-2 text-xs text-warning-foreground">
                As permissões de configuração atuais também concedem acesso
                amplo. Estes escopos não restringem esse acesso administrativo.
              </p>
            ) : null}
          </div>
        ) : (
          <p className="rounded-md border border-warning-muted bg-warning-muted px-3 py-2 text-sm text-warning-foreground">
            Serão gravados quatro escopos explícitos, um para cada tipo, com
            recurso “Todos” e nível “Completo”.
          </p>
        )}

        {state.error ? (
          <p className="text-sm text-destructive">{state.error}</p>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            type="submit"
            disabled={
              pending || (mode === "custom" && duplicateScopeKeys.size > 0)
            }
          >
            {pending ? "Salvando..." : "Salvar escopo"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function SetupLinkDialog({
  user,
  onClose,
}: {
  user: CompanyAccessUser;
  onClose: () => void;
}) {
  const action = createSetupLink.bind(null, user.id);
  const [state, formAction, pending] = useActionState(action, initialState);

  if (state.link) {
    return (
      <LinkResultModal
        title="Novo link gerado"
        description={`Envie o link para ${user.name}.`}
        link={state.link}
        onClose={onClose}
      />
    );
  }

  return (
    <ConfirmDialog
      open
      onClose={onClose}
      title="Gerar novo link de acesso"
      description={`O link permitirá que ${user.name} defina uma nova senha.`}
      formAction={formAction}
      pending={pending}
      error={state.error}
      confirmLabel="Gerar link"
      pendingLabel="Gerando..."
      icon={KeyRound}
    >
      <p className="text-sm text-muted-foreground">
        O link será exibido para cópia manual. Não alteramos nem suspendemos a
        conta atual.
      </p>
    </ConfirmDialog>
  );
}

function StatusDialog({
  currentUserId,
  user,
  onClose,
}: {
  currentUserId: string;
  user: CompanyAccessUser;
  onClose: () => void;
}) {
  const reactivating = user.status === "suspended";
  const action = setCompanyUserStatus.bind(null, user.id);
  const [state, formAction, pending] = useActionState(action, initialState);
  useSuccessClose(
    state,
    onClose,
    reactivating ? "Acesso reativado." : "Acesso suspenso.",
  );
  const selfSuspension = !reactivating && user.id === currentUserId;

  return (
    <ConfirmDialog
      open
      onClose={onClose}
      title={reactivating ? "Reativar acesso" : "Suspender acesso"}
      description={
        reactivating
          ? `${user.name} voltará a entrar no sistema.`
          : `${user.name} não poderá entrar até a reativação.`
      }
      formAction={formAction}
      pending={pending}
      error={
        state.error ??
        (selfSuspension
          ? "Você não pode suspender o próprio acesso."
          : undefined)
      }
      confirmLabel={reactivating ? "Reativar" : "Suspender"}
      confirmDisabled={selfSuspension}
      destructive={!reactivating}
      icon={reactivating ? LockOpen : Lock}
    >
      <input
        type="hidden"
        name="status"
        value={reactivating ? "active" : "suspended"}
      />
      {!reactivating ? (
        <p className="text-sm text-muted-foreground">
          Os dados e vínculos serão preservados. A empresa sempre precisa manter
          ao menos um gestor de acessos ativo.
        </p>
      ) : null}
    </ConfirmDialog>
  );
}

function ProfileEditorDialog({
  permissions,
  profile,
  onClose,
}: {
  permissions: AccessPermission[];
  profile?: AccessProfile;
  onClose: () => void;
}) {
  const action = profile
    ? updateCompanyProfile.bind(null, profile.id)
    : createCompanyProfile;
  const [state, formAction, pending] = useActionState(action, initialState);
  useSuccessClose(
    state,
    onClose,
    profile ? "Perfil atualizado." : "Perfil criado.",
  );
  const selectedIds = new Set(profile?.permissionIds ?? []);

  return (
    <Modal
      open
      onClose={onClose}
      title={
        profile ? "Editar perfil personalizado" : "Novo perfil personalizado"
      }
      description="Defina o conjunto de permissões que será herdado pelos usuários."
      className="max-w-4xl"
    >
      <form action={formAction} className="grid gap-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-2 text-sm font-medium">
            <span>
              Nome <RequiredMark />
            </span>
            <Input name="name" required defaultValue={profile?.name ?? ""} />
          </label>
          <label className="grid gap-2 text-sm font-medium">
            Descrição
            <Textarea
              name="description"
              rows={2}
              className="min-h-10"
              defaultValue={profile?.description ?? ""}
            />
          </label>
        </div>

        <PermissionGroups permissions={permissions}>
          {(permission) => (
            <div
              key={permission.id}
              className="flex items-start gap-3 rounded-md border border-border p-3 hover:bg-muted/40"
            >
              <Checkbox
                name="permission_ids"
                value={permission.id}
                defaultChecked={selectedIds.has(permission.id)}
                aria-label={permission.description}
              />
              <span className="min-w-0">
                <span className="block text-sm font-medium">
                  {permission.description}
                </span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  {permission.code}
                </span>
              </span>
            </div>
          )}
        </PermissionGroups>

        {state.error ? (
          <p className="text-sm text-destructive">{state.error}</p>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={pending}>
            {pending
              ? "Salvando..."
              : profile
                ? "Salvar perfil"
                : "Criar perfil"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function DuplicateProfileDialog({
  profile,
  onClose,
}: {
  profile: AccessProfile;
  onClose: () => void;
}) {
  const action = duplicateCompanyProfile.bind(null, profile.id);
  const [state, formAction, pending] = useActionState(action, initialState);
  useSuccessClose(state, onClose, "Perfil duplicado.");

  return (
    <FormDialog
      open
      onClose={onClose}
      title="Duplicar perfil"
      description={`Crie um perfil personalizado a partir de ${profile.name}.`}
      formAction={formAction}
      pending={pending}
      error={state.error}
      confirmLabel="Duplicar"
      icon={Copy}
    >
      <label className="grid gap-2 text-sm font-medium">
        <span>
          Nome da cópia <RequiredMark />
        </span>
        <Input
          name="name"
          required
          defaultValue={`${profile.name} personalizado`}
        />
      </label>
      <p className="text-xs text-muted-foreground">
        A cópia receberá as {profile.permissionIds.length} permissões atuais e
        poderá ser editada livremente.
      </p>
    </FormDialog>
  );
}

function DeleteProfileDialog({
  profile,
  onClose,
}: {
  profile: AccessProfile;
  onClose: () => void;
}) {
  const action = deleteCompanyProfile.bind(null, profile.id);
  const [state, formAction, pending] = useActionState(action, initialState);
  useSuccessClose(state, onClose, "Perfil excluído.");

  return (
    <ConfirmDialog
      open
      onClose={onClose}
      title="Excluir perfil personalizado"
      description={`Exclua o perfil ${profile.name}.`}
      formAction={formAction}
      pending={pending}
      error={state.error}
      confirmLabel="Excluir perfil"
      confirmDisabled={profile.userCount > 0}
      destructive
      icon={Trash}
    >
      <p className="text-sm text-muted-foreground">
        {profile.userCount > 0
          ? `Este perfil está atribuído a ${profile.userCount} usuário(s). Troque esses perfis antes de excluí-lo.`
          : "A exclusão remove o perfil e suas permissões. Usuários não são excluídos."}
      </p>
    </ConfirmDialog>
  );
}

function PermissionGroups({
  permissions,
  children,
}: {
  permissions: AccessPermission[];
  children: (permission: AccessPermission) => React.ReactNode;
}) {
  const grouped = useMemo(() => {
    const groups = new Map<string, AccessPermission[]>();
    for (const permission of permissions) {
      groups.set(permission.category, [
        ...(groups.get(permission.category) ?? []),
        permission,
      ]);
    }
    return [...groups.entries()];
  }, [permissions]);

  return (
    <div className="grid gap-5">
      {grouped.map(([category, categoryPermissions]) => (
        <fieldset key={category} className="grid gap-2">
          <legend className="mb-1 text-sm font-semibold">{category}</legend>
          <div className="grid gap-2 md:grid-cols-2">
            {categoryPermissions.map((permission) => children(permission))}
          </div>
        </fieldset>
      ))}
    </div>
  );
}

function ScopeModeOption({
  value,
  checked,
  disabled,
  title,
  description,
  onChange,
}: {
  value: ScopeMode;
  checked: boolean;
  disabled?: boolean;
  title: string;
  description: string;
  onChange: () => void;
}) {
  return (
    <label
      className={`flex cursor-pointer items-start gap-2 rounded-lg border p-3 text-sm ${
        checked ? "border-primary bg-primary-muted" : "border-border"
      } ${disabled ? "cursor-not-allowed opacity-50" : "hover:bg-muted"}`}
    >
      <input
        type="radio"
        name="mode"
        value={value}
        checked={checked}
        disabled={disabled}
        onChange={onChange}
        className="mt-0.5 size-4"
      />
      <span>
        <span className="block font-medium">{title}</span>
        <span className="mt-1 block text-xs text-muted-foreground">
          {description}
        </span>
      </span>
    </label>
  );
}

function ScopeEditorRow({
  data,
  scope,
  duplicate,
  onChange,
  onRemove,
}: {
  data: CompanyAccessData;
  scope: EditableScope;
  duplicate: boolean;
  onChange: (patch: Partial<ResourceScope>) => void;
  onRemove: () => void;
}) {
  const options = getScopeResourceOptions(data, scope.resourceType);
  const selectedResourceExists =
    !scope.resourceId ||
    options.some((option) => option.id === scope.resourceId);

  return (
    <div
      className={`grid gap-3 rounded-lg border p-3 md:grid-cols-[10rem_minmax(12rem,1fr)_11rem_auto] md:items-end ${
        duplicate ? "border-destructive" : "border-border"
      }`}
    >
      <label className="grid gap-1 text-xs font-medium text-muted-foreground">
        Tipo de recurso
        <Select
          value={scope.resourceType}
          onValueChange={(value) =>
            onChange({
              resourceType: value as ResourceScope["resourceType"],
              resourceId: null,
            })
          }
          aria-label="Tipo do escopo"
        >
          <option value="agenda">Agenda</option>
          <option value="profissional">Profissional</option>
          <option value="unidade">Unidade</option>
          <option value="especialidade">Especialidade</option>
        </Select>
      </label>
      <label className="grid gap-1 text-xs font-medium text-muted-foreground">
        Recurso
        <Select
          value={scope.resourceId ?? ""}
          allowEmptyOption
          onValueChange={(value) => onChange({ resourceId: value || null })}
          aria-label="Recurso do escopo"
        >
          <option value="">Todos deste tipo</option>
          {!selectedResourceExists && scope.resourceId ? (
            <option value={scope.resourceId}>
              Recurso indisponível ({scope.resourceId.slice(0, 8)})
            </option>
          ) : null}
          {options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
              {option.active ? "" : " (inativo)"}
            </option>
          ))}
        </Select>
      </label>
      <label className="grid gap-1 text-xs font-medium text-muted-foreground">
        Nível de acesso
        <Select
          value={scope.accessLevel}
          onValueChange={(value) =>
            onChange({
              accessLevel: value as ResourceScope["accessLevel"],
            })
          }
          aria-label="Nível do escopo"
        >
          <option value="read">Leitura</option>
          <option value="write">Leitura e alteração</option>
          <option value="full">Completo</option>
        </Select>
      </label>
      <div className="flex justify-end">
        <Button
          type="button"
          variant="destructive-ghost"
          size="icon"
          aria-label="Remover escopo"
          onClick={onRemove}
        >
          <Trash className="size-4" aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}

function getScopeResourceOptions(
  data: CompanyAccessData,
  resourceType: ResourceScope["resourceType"],
) {
  if (resourceType === "agenda") {
    const professionalNameById = new Map(
      data.professionals.map((professional) => [
        professional.id,
        professional.name,
      ]),
    );
    return data.schedules.map((schedule) => ({
      id: schedule.id,
      label: `${schedule.name} · ${professionalNameById.get(schedule.professionalId) ?? "Profissional não encontrado"}`,
      active: schedule.active,
    }));
  }
  const resources =
    resourceType === "profissional"
      ? data.professionals
      : resourceType === "unidade"
        ? data.units
        : data.specialties;
  return resources.map((resource) => ({
    id: resource.id,
    label: resource.name,
    active: resource.active,
  }));
}

function findDuplicateScopeKeys(scopes: EditableScope[]) {
  const rowsByKey = new Map<string, string[]>();
  for (const scope of scopes) {
    const key = `${scope.resourceType}:${scope.resourceId ?? "*"}`;
    rowsByKey.set(key, [...(rowsByKey.get(key) ?? []), scope.clientId]);
  }
  return new Set(
    [...rowsByKey.values()].filter((clientIds) => clientIds.length > 1).flat(),
  );
}

function LinkResultModal({
  title,
  description,
  link,
  onClose,
}: {
  title: string;
  description: string;
  link: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      toast.success("Link copiado.");
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error("Não foi possível copiar automaticamente.");
    }
  }

  return (
    <Modal open onClose={onClose} title={title} description={description}>
      <div className="grid gap-4">
        <p className="text-sm text-muted-foreground">
          Por segurança, compartilhe o link diretamente com a pessoa
          responsável.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            readOnly
            value={link}
            onFocus={(event) => event.currentTarget.select()}
            className="flex-1 font-mono text-xs"
          />
          <Button type="button" variant="secondary" onClick={copyLink}>
            {copied ? (
              <Check className="size-4" />
            ) : (
              <Copy className="size-4" />
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
    </Modal>
  );
}

function useSuccessClose(
  state: AccessActionState,
  onClose: () => void,
  message: string,
) {
  useEffect(() => {
    if (!state.ok) return;
    toast.success(message);
    onClose();
  }, [state.ok, message, onClose]);
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Fortaleza",
  }).format(new Date(value));
}

function isExplicitAllShortcut(scopes: ResourceScope[]) {
  if (
    scopes.length !== 4 ||
    scopes.some(
      (scope) => scope.resourceId !== null || scope.accessLevel !== "full",
    )
  ) {
    return false;
  }
  return new Set(scopes.map((scope) => scope.resourceType)).size === 4;
}

function getImplicitTeamScope(
  data: CompanyAccessData,
  user: CompanyAccessUser,
): "always" | null {
  const permissionIdToCode = new Map(
    data.permissions.map((permission) => [permission.id, permission.code]),
  );
  const effectiveIds = new Set(
    data.profiles
      .filter((profile) => user.profileIds.includes(profile.id))
      .flatMap((profile) => profile.permissionIds),
  );
  for (const override of user.overrides) {
    if (override.granted) effectiveIds.add(override.permissionId);
    else effectiveIds.delete(override.permissionId);
  }
  const codes = new Set(
    [...effectiveIds]
      .map((permissionId) => permissionIdToCode.get(permissionId))
      .filter((code): code is string => Boolean(code)),
  );

  if (codes.has("config.geral") || codes.has("config.usuarios")) {
    return "always";
  }
  return null;
}
