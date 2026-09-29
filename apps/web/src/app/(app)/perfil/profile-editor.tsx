"use client";

import { useActionState, useId, useRef, useState, useTransition } from "react";
import {
  Camera,
  Check,
  CheckCircle,
  Circle,
  Clock,
  Crown,
  EnvelopeSimple,
  Eye,
  EyeSlash,
  LockKey,
  Monitor,
  Phone,
  ShieldCheck,
  SignOut,
  Trash,
  User,
  Warning,
  X,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import {
  changeOwnPassword,
  removeOwnAvatar,
  requestEmailChange,
  resendEmailChange,
  signOutOtherSessions,
  updateOwnAvatar,
  updateOwnProfile,
  type ProfileActionState,
} from "./actions";
import { AvatarCropDialog } from "./avatar-crop-dialog";
import { Alert } from "@/components/ui/alert";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmDialog } from "@/components/ui/dialog";
import { FormField, Input } from "@/components/ui/field";
import { MaskedInput } from "@/components/ui/masked-input";
import { onlyDigits } from "@/lib/validation/br";
import { cn } from "@/lib/utils";
import styles from "./profile.module.css";

export type ProfileData = {
  name: string;
  phone: string;
  email: string;
  pendingEmail: string | null;
  pendingEmailSentAt: string | null;
  lastSignInAt: string | null;
  avatarUrl: string | null;
  roleLabel: string;
  organizationName: string;
  professionalName: string | null;
};

const initialState: ProfileActionState = {};

export function ProfileEditor({
  emailJustConfirmed,
  profile,
  readOnly,
  supportTargetName,
}: {
  emailJustConfirmed: boolean;
  profile: ProfileData;
  readOnly: boolean;
  supportTargetName: string | null;
}) {
  // O nome no cabeçalho acompanha o que foi salvo sem esperar a página
  // recarregar.
  const [displayName, setDisplayName] = useState(profile.name);
  const [showReadOnlyNotice, setShowReadOnlyNotice] = useState(true);

  return (
    <div className={styles.profilePage}>
      {readOnly && showReadOnlyNotice ? (
        <div className={styles.readOnlyNotice} role="alert">
          <span className={styles.noticeIcon} aria-hidden="true">
            <Warning />
          </span>
          <div>
            <strong>Perfil só para leitura</strong>
            <p>
              Você está no acesso de suporte
              {supportTargetName ? ` como ${supportTargetName}` : ""}. Esta é a
              sua conta de super admin; para editá-la, encerre o suporte.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowReadOnlyNotice(false)}
            aria-label="Dispensar aviso"
            className={styles.dismissNotice}
          >
            <X aria-hidden="true" />
          </button>
        </div>
      ) : null}
      {emailJustConfirmed ? (
        <Alert variant="success" title="E-mail de login atualizado">
          A partir de agora, entre no sistema com {profile.email}.
        </Alert>
      ) : null}

      <AccountHeader
        profile={profile}
        displayName={displayName}
        readOnly={readOnly}
      />

      <div className={styles.settingsGrid}>
        <div className={styles.gridIntro}>
          <h1>Minha conta</h1>
          <p>
            Visualize as informações da sua conta e acompanhe os dados de acesso
            à plataforma Hi Clinic.
          </p>
        </div>
        <SettingsCard
          title="Dados pessoais"
          description="Informações básicas do seu perfil no sistema."
          tone="blue"
          icon={User}
        >
          <PersonalDataForm
            profile={profile}
            readOnly={readOnly}
            onSaved={setDisplayName}
          />
        </SettingsCard>
        <SettingsCard
          title="E-mail de login"
          description="Usado para entrar no sistema e receber os avisos da conta."
          tone="green"
          icon={EnvelopeSimple}
        >
          <EmailSection profile={profile} readOnly={readOnly} />
        </SettingsCard>
        <SettingsCard
          title="Senha"
          description="Troque a senha sempre que desconfiar que outra pessoa a conhece."
          tone="purple"
          icon={LockKey}
          className={styles.passwordCard}
        >
          <PasswordSection email={profile.email} readOnly={readOnly} />
        </SettingsCard>
        <SettingsCard
          title="Sessões"
          description="Computadores e celulares em que a sua conta está aberta."
          tone="rose"
          icon={Monitor}
        >
          <SessionsSection
            lastSignInAt={profile.lastSignInAt}
            readOnly={readOnly}
          />
        </SettingsCard>
      </div>
    </div>
  );
}

function SettingsCard({
  children,
  description,
  title,
  tone,
  icon: Icon,
  className,
}: {
  children: React.ReactNode;
  description: string;
  title: string;
  tone: "blue" | "green" | "purple" | "rose";
  icon: typeof User;
  className?: string;
}) {
  const headingId = useId();
  return (
    <section
      aria-labelledby={headingId}
      className={cn(styles.settingsCard, className)}
    >
      <div className={styles.cardHeading}>
        <span className={cn(styles.cardIcon, styles[tone])} aria-hidden="true">
          <Icon />
        </span>
        <div>
          <h2 id={headingId}>{title}</h2>
          <p>{description}</p>
        </div>
      </div>
      <div className={cn(styles.cardContent, styles[`${tone}Content`])}>
        {children}
      </div>
    </section>
  );
}

// ─── Cabeçalho: foto e identificação ────────────────────────────────────────

function AccountHeader({
  displayName,
  profile,
  readOnly,
}: {
  displayName: string;
  profile: ProfileData;
  readOnly: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [avatarUrl, setAvatarUrl] = useState(profile.avatarUrl);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [confirmingRemoval, setConfirmingRemoval] = useState(false);
  const [removing, startRemoving] = useTransition();

  function pickFile() {
    inputRef.current?.click();
  }

  return (
    <header className={styles.accountHeader}>
      <div className="relative w-fit shrink-0">
        <Avatar
          name={displayName}
          photoUrl={avatarUrl}
          size="xl"
          className={styles.headerAvatar}
        />
        {!readOnly ? (
          <button
            type="button"
            onClick={pickFile}
            className="absolute -bottom-1 -right-1 inline-flex size-9 items-center justify-center rounded-full border-2 border-card bg-primary text-primary-foreground shadow-[var(--shadow-soft)] transition-[background-color,scale] duration-[var(--motion-fast)] ease-[var(--ease-out)] hover:bg-primary-hover active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            aria-label={
              avatarUrl ? "Trocar foto de perfil" : "Adicionar foto de perfil"
            }
            title={avatarUrl ? "Trocar foto" : "Adicionar foto"}
          >
            <Camera className="size-4" weight="bold" aria-hidden="true" />
          </button>
        ) : null}
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(event) => {
            const file = event.target.files?.[0] ?? null;
            // Limpa para o mesmo arquivo poder ser escolhido de novo.
            event.target.value = "";
            if (file) setCropFile(file);
          }}
        />
      </div>

      <div className={styles.accountIdentity}>
        <p className={styles.accountName}>{displayName}</p>
        <p className={styles.accountRole}>
          {profile.roleLabel} · {profile.organizationName}
        </p>
        <p className={styles.accountEmail}>
          <EnvelopeSimple className="size-4 shrink-0" aria-hidden="true" />
          <span className="truncate">{profile.email}</span>
        </p>
        <div className={styles.badges}>
          <span className={styles.roleBadge}>
            {profile.roleLabel === "Super administrador" ? (
              <Crown aria-hidden="true" />
            ) : (
              <User aria-hidden="true" />
            )}
            {profile.roleLabel}
          </span>
          {readOnly ? (
            <span className={styles.readOnlyBadge}>
              <LockKey aria-hidden="true" />
              Somente leitura
            </span>
          ) : null}
        </div>
        {!readOnly ? (
          <div className={styles.avatarActions}>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={pickFile}
            >
              <Camera className="size-4" aria-hidden="true" />
              {avatarUrl ? "Trocar foto" : "Adicionar foto"}
            </Button>
            {avatarUrl ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={removing}
                onClick={() => setConfirmingRemoval(true)}
              >
                <Trash className="size-4" aria-hidden="true" />
                Remover
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      {readOnly ? (
        <div className={styles.supportStatus}>
          <span className={styles.supportShield} aria-hidden="true">
            <ShieldCheck />
          </span>
          <strong>Acesso de suporte ativo</strong>
          <span>Algumas informações estão bloqueadas para edição.</span>
        </div>
      ) : null}

      <AvatarCropDialog
        file={cropFile}
        onClose={() => setCropFile(null)}
        onConfirm={async (blob) => {
          const formData = new FormData();
          formData.set(
            "avatar",
            new File([blob], `avatar.${blob.type.split("/")[1] ?? "webp"}`, {
              type: blob.type,
            }),
          );
          const result = await updateOwnAvatar(formData);
          if (result.error) {
            toast.error(result.error);
            return false;
          }
          setAvatarUrl(result.avatarUrl || null);
          toast.success("Foto de perfil atualizada.");
          return true;
        }}
      />

      <ConfirmDialog
        open={confirmingRemoval}
        onClose={() => setConfirmingRemoval(false)}
        title="Remover foto de perfil?"
        description="No lugar da foto, a equipe passa a ver as suas iniciais. Você pode enviar outra quando quiser."
        confirmLabel="Remover foto"
        pendingLabel="Removendo..."
        pending={removing}
        destructive
        onConfirm={() =>
          new Promise<boolean>((resolve) => {
            startRemoving(async () => {
              const result = await removeOwnAvatar();
              if (result.error) {
                toast.error(result.error);
                resolve(false);
                return;
              }
              setAvatarUrl(null);
              toast.success("Foto removida.");
              resolve(true);
            });
          })
        }
      />
    </header>
  );
}

// ─── Dados pessoais ─────────────────────────────────────────────────────────

function PersonalDataForm({
  onSaved,
  profile,
  readOnly,
}: {
  onSaved: (name: string) => void;
  profile: ProfileData;
  readOnly: boolean;
}) {
  const [name, setName] = useState(profile.name);
  const [phone, setPhone] = useState(profile.phone);
  const [saved, setSaved] = useState({
    name: profile.name,
    phone: onlyDigits(profile.phone),
  });
  const [state, formAction, pending] = useActionState(
    async (previous: ProfileActionState, formData: FormData) => {
      const result = await updateOwnProfile(previous, formData);
      if (result.success) {
        const nextName = String(formData.get("name") ?? "").trim();
        setSaved({
          name: nextName,
          phone: onlyDigits(String(formData.get("phone") ?? "")),
        });
        onSaved(nextName);
      }
      return result;
    },
    initialState,
  );
  const dirty = name.trim() !== saved.name || onlyDigits(phone) !== saved.phone;
  const nameId = useId();
  const phoneId = useId();

  if (readOnly) {
    return (
      <div className={styles.personalRows}>
        <div className={styles.personalRow}>
          <span>Nome</span>
          <span className={styles.readOnlyValue}>
            <User aria-hidden="true" />
            {profile.name}
          </span>
        </div>
        <div className={styles.personalRow}>
          <span>Telefone</span>
          <span className={styles.readOnlyValue}>
            <Phone aria-hidden="true" />
            {profile.phone || "(00) 00000-0000"}
          </span>
        </div>
      </div>
    );
  }

  return (
    <form action={formAction} className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          label="Nome"
          required
          htmlFor={nameId}
          error={state.fieldErrors?.name}
          className="sm:col-span-2"
        >
          <Input
            id={nameId}
            name="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            autoComplete="name"
            maxLength={120}
            required
            disabled={readOnly}
            aria-invalid={Boolean(state.fieldErrors?.name)}
          />
        </FormField>
        <FormField
          label="Telefone"
          htmlFor={phoneId}
          error={state.fieldErrors?.phone}
        >
          <MaskedInput
            id={phoneId}
            name="phone"
            maskKind="phone"
            value={phone}
            onValueChange={setPhone}
            inputMode="tel"
            autoComplete="tel-national"
            placeholder="(00) 00000-0000"
            disabled={readOnly}
            aria-invalid={Boolean(state.fieldErrors?.phone)}
          />
        </FormField>
      </div>

      {profile.professionalName ? (
        <p className="text-body-sm text-muted-foreground">
          Na agenda e nos documentos você aparece como{" "}
          <span className="font-medium text-foreground">
            {profile.professionalName}
          </span>
          . Esse nome é editado em Configurações › Cadastros e operação.
        </p>
      ) : null}

      {state.error ? (
        <p role="alert" className="text-body-sm text-destructive">
          {state.error}
        </p>
      ) : null}

      {!readOnly ? (
        <FormFooter
          pending={pending}
          pendingLabel="Salvando..."
          label="Salvar dados"
          disabled={!dirty}
          savedMessage={!dirty && state.success ? state.success : null}
        />
      ) : null}
    </form>
  );
}

// ─── E-mail de login ────────────────────────────────────────────────────────

function EmailSection({
  profile,
  readOnly,
}: {
  profile: ProfileData;
  readOnly: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [resending, startResending] = useTransition();
  const [state, formAction, pending] = useActionState(
    async (previous: ProfileActionState, formData: FormData) => {
      const result = await requestEmailChange(previous, formData);
      if (result.success) {
        setEditing(false);
        toast.success(result.success);
      }
      return result;
    },
    initialState,
  );
  const emailId = useId();
  const passwordId = useId();

  if (readOnly) {
    return (
      <div className={styles.readOnlyEmail}>
        <span>E-mail atual</span>
        <div className={styles.readOnlyValue}>
          <EnvelopeSimple aria-hidden="true" />
          <strong>{profile.email}</strong>
        </div>
        {profile.pendingEmail ? (
          <p>Troca pendente para {profile.pendingEmail}</p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-caption text-muted-foreground">E-mail atual</p>
          <p className="truncate font-medium">{profile.email}</p>
        </div>
        {!readOnly && !editing ? (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => setEditing(true)}
          >
            Alterar e-mail
          </Button>
        ) : null}
      </div>

      {profile.pendingEmail ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/25 bg-primary-muted/60 px-4 py-3">
          <div className="min-w-0 text-body-sm">
            <p className="font-medium text-foreground">
              Aguardando confirmação de{" "}
              <span className="break-all">{profile.pendingEmail}</span>
            </p>
            <p className="mt-0.5 text-muted-foreground">
              {profile.pendingEmailSentAt
                ? `Link enviado em ${profile.pendingEmailSentAt}. `
                : ""}
              O login só muda depois do clique no link. Se chegar um aviso
              também no e-mail atual, confirme por lá.
            </p>
          </div>
          {!readOnly ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={resending}
              onClick={() =>
                startResending(async () => {
                  const result = await resendEmailChange();
                  if (result.error) toast.error(result.error);
                  else if (result.success) toast.success(result.success);
                })
              }
            >
              {resending ? "Reenviando..." : "Reenviar link"}
            </Button>
          ) : null}
        </div>
      ) : null}

      {editing ? (
        <form
          action={formAction}
          className="grid animate-content-enter gap-4 rounded-lg border border-border bg-muted/30 p-4"
        >
          <FormField
            label="Novo e-mail"
            required
            htmlFor={emailId}
            error={state.fieldErrors?.email}
          >
            <Input
              id={emailId}
              name="email"
              type="email"
              autoComplete="email"
              required
              autoFocus
              aria-invalid={Boolean(state.fieldErrors?.email)}
            />
          </FormField>
          <FormField
            label="Senha atual"
            required
            htmlFor={passwordId}
            help="Confirmamos a senha para ninguém trocar o seu login com o computador aberto."
            error={state.fieldErrors?.current_password}
          >
            <PasswordInput
              id={passwordId}
              name="current_password"
              autoComplete="current-password"
              invalid={Boolean(state.fieldErrors?.current_password)}
            />
          </FormField>
          {state.error ? (
            <p role="alert" className="text-body-sm text-destructive">
              {state.error}
            </p>
          ) : null}
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              disabled={pending}
              onClick={() => setEditing(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Enviando..." : "Enviar link de confirmação"}
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}

// ─── Senha ──────────────────────────────────────────────────────────────────

function PasswordSection({
  email,
  readOnly,
}: {
  email: string;
  readOnly: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [state, formAction, pending] = useActionState(
    async (previous: ProfileActionState, formData: FormData) => {
      const result = await changeOwnPassword(previous, formData);
      if (result.success) {
        setEditing(false);
        setCurrent("");
        setNext("");
        setConfirmation("");
        toast.success(result.success);
      }
      return result;
    },
    initialState,
  );
  const currentId = useId();
  const nextId = useId();
  const confirmationId = useId();
  const rules = [
    { label: "Pelo menos 8 caracteres", met: next.length >= 8 },
    {
      label: "Diferente da senha atual",
      met: next.length > 0 && next !== current,
    },
    {
      label: "Confirmação igual à nova senha",
      met: confirmation.length > 0 && confirmation === next,
    },
  ];
  const ready = current.length > 0 && rules.every((rule) => rule.met);

  if (readOnly) {
    return (
      <div className={styles.readOnlyPassword}>
        <ShieldCheck aria-hidden="true" />
        <div>
          <strong>Por segurança, a senha atual é pedida antes da troca.</strong>
          <p>
            Como este perfil está em modo somente leitura, a edição não está
            disponível no momento.
          </p>
        </div>
      </div>
    );
  }

  if (!editing) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-body-sm text-muted-foreground">
          Por segurança, a senha atual é pedida antes da troca.
        </p>
        {!readOnly ? (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => setEditing(true)}
          >
            Alterar senha
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <form
      action={formAction}
      className="grid animate-content-enter gap-4 rounded-lg border border-border bg-muted/30 p-4"
    >
      {/* Ajuda gerenciadores de senha a saberem de qual conta é a senha. */}
      <input
        type="email"
        name="username"
        autoComplete="username"
        value={email}
        readOnly
        hidden
      />
      <FormField
        label="Senha atual"
        required
        htmlFor={currentId}
        error={state.fieldErrors?.current_password}
      >
        <PasswordInput
          id={currentId}
          name="current_password"
          autoComplete="current-password"
          value={current}
          onChange={setCurrent}
          invalid={Boolean(state.fieldErrors?.current_password)}
          autoFocus
        />
      </FormField>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          label="Nova senha"
          required
          htmlFor={nextId}
          error={state.fieldErrors?.password}
        >
          <PasswordInput
            id={nextId}
            name="password"
            autoComplete="new-password"
            value={next}
            onChange={setNext}
            invalid={Boolean(state.fieldErrors?.password)}
          />
        </FormField>
        <FormField
          label="Confirmar nova senha"
          required
          htmlFor={confirmationId}
          error={state.fieldErrors?.password_confirmation}
        >
          <PasswordInput
            id={confirmationId}
            name="password_confirmation"
            autoComplete="new-password"
            value={confirmation}
            onChange={setConfirmation}
            invalid={Boolean(state.fieldErrors?.password_confirmation)}
          />
        </FormField>
      </div>

      <ul aria-label="Requisitos da nova senha" className="grid gap-1.5">
        {rules.map((rule) => (
          <li
            key={rule.label}
            className={cn(
              "flex items-center gap-2 text-body-sm transition-colors duration-[var(--motion-fast)]",
              rule.met ? "text-success-foreground" : "text-muted-foreground",
            )}
          >
            {rule.met ? (
              <CheckCircle
                className="size-4 shrink-0"
                weight="fill"
                aria-hidden="true"
              />
            ) : (
              <Circle className="size-4 shrink-0" aria-hidden="true" />
            )}
            {rule.label}
            <span className="sr-only">{rule.met ? "(ok)" : "(pendente)"}</span>
          </li>
        ))}
      </ul>

      <Checkbox
        name="sign_out_others"
        defaultChecked
        label="Encerrar a sessão nos outros computadores e celulares"
      />

      {state.error ? (
        <p role="alert" className="text-body-sm text-destructive">
          {state.error}
        </p>
      ) : null}
      <div className="flex flex-wrap justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          disabled={pending}
          onClick={() => {
            // Senha digitada não fica guardada depois de cancelar.
            setEditing(false);
            setCurrent("");
            setNext("");
            setConfirmation("");
          }}
        >
          Cancelar
        </Button>
        <Button type="submit" disabled={pending || !ready}>
          {pending ? "Salvando..." : "Salvar nova senha"}
        </Button>
      </div>
    </form>
  );
}

// ─── Sessões ────────────────────────────────────────────────────────────────

function SessionsSection({
  lastSignInAt,
  readOnly,
}: {
  lastSignInAt: string | null;
  readOnly: boolean;
}) {
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  if (readOnly) {
    return (
      <div className={styles.readOnlySession}>
        <span className={styles.sessionIcon} aria-hidden="true">
          <Clock />
        </span>
        <div>
          <span>Última entrada</span>
          <strong>{lastSignInAt ?? "Não disponível"}</strong>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-caption text-muted-foreground">Última entrada</p>
        <p className="font-medium tabular-nums">
          {lastSignInAt ?? "Não disponível"}
        </p>
      </div>
      {!readOnly ? (
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={pending}
          onClick={() => setConfirming(true)}
        >
          <SignOut className="size-4" aria-hidden="true" />
          Sair dos outros dispositivos
        </Button>
      ) : null}

      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        title="Sair dos outros dispositivos?"
        description="A conta continua aberta só neste navegador. Nos outros computadores e celulares, será preciso entrar de novo."
        confirmLabel="Sair dos outros"
        pendingLabel="Encerrando..."
        pending={pending}
        onConfirm={() =>
          new Promise<boolean>((resolve) => {
            startTransition(async () => {
              const result = await signOutOtherSessions();
              if (result.error) {
                toast.error(result.error);
                resolve(false);
                return;
              }
              toast.success(
                "Pronto. Os outros dispositivos vão precisar entrar de novo.",
              );
              resolve(true);
            });
          })
        }
      />
    </div>
  );
}

// ─── Peças compartilhadas ───────────────────────────────────────────────────

function FormFooter({
  disabled,
  label,
  pending,
  pendingLabel,
  savedMessage,
}: {
  disabled: boolean;
  label: string;
  pending: boolean;
  pendingLabel: string;
  savedMessage: string | null;
}) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-3">
      <p
        role="status"
        aria-live="polite"
        className="flex min-h-5 items-center gap-1.5 text-body-sm text-success-foreground"
      >
        {savedMessage ? (
          <>
            <Check className="size-4" weight="bold" aria-hidden="true" />
            {savedMessage}
          </>
        ) : null}
      </p>
      <Button type="submit" disabled={pending || disabled}>
        {pending ? pendingLabel : label}
      </Button>
    </div>
  );
}

function PasswordInput({
  autoComplete,
  autoFocus,
  id,
  invalid,
  name,
  onChange,
  value,
}: {
  autoComplete: string;
  autoFocus?: boolean;
  id: string;
  invalid?: boolean;
  name: string;
  onChange?: (value: string) => void;
  value?: string;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <Input
        id={id}
        name={name}
        type={visible ? "text" : "password"}
        autoComplete={autoComplete}
        autoFocus={autoFocus}
        required
        value={value}
        onChange={
          onChange ? (event) => onChange(event.target.value) : undefined
        }
        className="pr-11"
        aria-invalid={invalid}
        spellCheck={false}
      />
      <button
        type="button"
        onClick={() => setVisible((current) => !current)}
        className="absolute right-1 top-1/2 inline-flex size-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors duration-[var(--motion-fast)] hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary"
        aria-label={visible ? "Ocultar senha" : "Mostrar senha"}
        aria-pressed={visible}
      >
        {visible ? (
          <EyeSlash className="size-4" aria-hidden="true" />
        ) : (
          <Eye className="size-4" aria-hidden="true" />
        )}
      </button>
    </div>
  );
}
