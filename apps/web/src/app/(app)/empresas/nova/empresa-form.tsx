"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import {
  Buildings as Building2,
  Check,
  Copy,
  Key as KeyRound,
  LinkSimple as Link2,
  UserCircle as UserRound,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import { createEmpresa, type CreateEmpresaState } from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { LogoUploadField } from "@/components/ui/logo-upload-field";
import { MaskedInput } from "@/components/ui/masked-input";
import { RequiredMark } from "@/components/ui/required-mark";

const initialState: CreateEmpresaState = {};

export function EmpresaForm() {
  const [state, action, pending] = useActionState(createEmpresa, initialState);
  const [accessMethod, setAccessMethod] = useState<"password" | "link">(
    "password",
  );

  if (state.createdName) {
    return (
      <CreatedPanel
        name={state.createdName}
        setupLink={state.setupLink}
        error={state.error}
      />
    );
  }

  return (
    <form action={action} className="grid gap-5">
      <section className="grid animate-panel-enter gap-4">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Building2 className="size-4 text-primary" aria-hidden="true" />
          Dados da empresa
        </div>

        <LogoUploadField />

        <div className="grid gap-4 md:grid-cols-2">
          <label className="grid gap-2 text-sm font-medium md:col-span-2">
            <span>
              Nome fantasia
              <RequiredMark />
            </span>
            <Input required name="name" placeholder="Clínica Exemplo" />
          </label>

          <label className="grid gap-2 text-sm font-medium">
            Razão social
            <Input name="legal_name" placeholder="Clínica Exemplo Ltda." />
          </label>

          <label className="grid gap-2 text-sm font-medium">
            CNPJ
            <MaskedInput
              name="document"
              inputMode="numeric"
              maskKind="cnpj"
              placeholder="00.000.000/0000-00"
            />
          </label>

          <label className="grid gap-2 text-sm font-medium">
            Telefone
            <MaskedInput
              name="phone"
              inputMode="tel"
              maskKind="phone"
              placeholder="(11) 0000-0000"
            />
          </label>

          <label className="grid gap-2 text-sm font-medium">
            E-mail
            <Input
              name="email"
              type="email"
              autoComplete="off"
              placeholder="contato@empresa.com"
            />
          </label>
        </div>
      </section>

      <section className="grid animate-panel-enter gap-4 border-t border-border pt-5">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <UserRound className="size-4 text-primary" aria-hidden="true" />
          Responsável
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="grid gap-2 text-sm font-medium">
            <span>
              Nome
              <RequiredMark />
            </span>
            <Input
              required
              name="owner_name"
              autoComplete="name"
              placeholder="Nome do responsável"
            />
          </label>

          <label className="grid gap-2 text-sm font-medium">
            <span>
              E-mail
              <RequiredMark />
            </span>
            <Input
              required
              name="owner_email"
              type="email"
              autoComplete="email"
              placeholder="responsavel@empresa.com"
            />
          </label>

          <label className="grid gap-2 text-sm font-medium">
            Telefone
            <MaskedInput
              name="owner_phone"
              inputMode="tel"
              maskKind="phone"
              placeholder="(11) 90000-0000"
            />
          </label>
        </div>
      </section>

      <section className="grid animate-panel-enter gap-3 border-t border-border pt-5">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <KeyRound className="size-4 text-primary" aria-hidden="true" />
          Acesso do responsável
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <AccessOption
            checked={accessMethod === "password"}
            onSelect={() => setAccessMethod("password")}
            icon={KeyRound}
            title="Definir senha agora"
            description="Você informa a senha inicial."
            value="password"
          />
          <AccessOption
            checked={accessMethod === "link"}
            onSelect={() => setAccessMethod("link")}
            icon={Link2}
            title="Gerar link de acesso"
            description="O responsável define a própria senha."
            value="link"
          />
        </div>

        {accessMethod === "password" ? (
          <label className="grid gap-2 text-sm font-medium">
            <span>
              Senha inicial
              <RequiredMark />
            </span>
            <Input
              name="owner_password"
              type="password"
              minLength={8}
              autoComplete="new-password"
              placeholder="Mínimo de 8 caracteres"
            />
          </label>
        ) : (
          <p className="rounded-md border border-border bg-muted px-3 py-2 text-xs text-muted-foreground">
            Geramos um link de definição de senha. Como o envio automático por
            e-mail depende de SMTP configurado, o link aparecerá aqui para você
            copiar e enviar ao responsável.
          </p>
        )}
      </section>

      {state.error ? (
        <p className="rounded border border-destructive-muted bg-destructive-muted px-3 py-2 text-sm text-destructive-foreground">
          {state.error}
        </p>
      ) : null}

      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          <Building2 className="size-4" aria-hidden="true" />
          {pending ? "Criando..." : "Criar empresa"}
        </Button>
      </div>
    </form>
  );
}

function AccessOption({
  checked,
  onSelect,
  icon: Icon,
  title,
  description,
  value,
}: {
  checked: boolean;
  onSelect: () => void;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  value: string;
}) {
  return (
    <label
      className={
        "flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors duration-[var(--motion-fast)] " +
        (checked
          ? "border-primary bg-primary-muted"
          : "border-border hover:bg-muted")
      }
    >
      <input
        type="radio"
        name="access_method"
        value={value}
        checked={checked}
        onChange={onSelect}
        className="mt-0.5 size-4 accent-primary"
      />
      <span className="grid gap-0.5">
        <span className="flex items-center gap-1.5 text-sm font-medium">
          <Icon className="size-4" />
          {title}
        </span>
        <span className="text-xs text-muted-foreground">{description}</span>
      </span>
    </label>
  );
}

function CreatedPanel({
  name,
  setupLink,
  error,
}: {
  name: string;
  setupLink?: string;
  error?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    if (!setupLink) {
      return;
    }
    await navigator.clipboard.writeText(setupLink);
    setCopied(true);
    toast.success("Link copiado.");
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="grid gap-4">
      <div className="rounded-md border border-success-muted bg-success-muted px-4 py-3 text-sm text-success-foreground">
        Empresa <strong>{name}</strong> criada com sucesso.
      </div>

      {setupLink ? (
        <div className="grid gap-2">
          <p className="text-sm font-medium">
            Link de definição de senha do responsável
          </p>
          <p className="text-xs text-muted-foreground">
            Copie e envie ao responsável (o envio automático por e-mail depende
            de SMTP configurado).
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              readOnly
              value={setupLink}
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
        </div>
      ) : error ? (
        <p className="rounded border border-warning-muted bg-warning-muted px-3 py-2 text-sm text-warning-foreground">
          {error}
        </p>
      ) : null}

      <div className="flex justify-end">
        <Button asChild>
          <Link href="/empresas">Ir para empresas</Link>
        </Button>
      </div>
    </div>
  );
}
