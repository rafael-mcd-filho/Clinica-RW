"use client";

import { useActionState, useEffect, useState } from "react";
import {
  Image as ImageIcon,
  EnvelopeSimple as Mail,
  ChatCircle as MessageCircle,
  Palette,
  FloppyDisk as Save,
  Key as KeyRound,
  TextT as Type,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import { updatePlatformSettings, type PlatformSettingsState } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { LogoUploadField } from "@/components/ui/logo-upload-field";
import type { PlatformSettings } from "@/lib/platform/settings";

const initialState: PlatformSettingsState = {};

export function PlatformSettingsForm({
  settings,
  evolution,
}: {
  settings: PlatformSettings;
  evolution: { apiUrl: string; hasApiKey: boolean };
}) {
  const [state, action, pending] = useActionState(
    updatePlatformSettings,
    initialState,
  );
  const [primaryColor, setPrimaryColor] = useState(settings.primary_color);
  const isValidHex = /^#[0-9A-Fa-f]{6}$/.test(primaryColor.trim());

  useEffect(() => {
    if (state.success) {
      toast.success(state.success);
    }
  }, [state]);

  return (
    <form action={action} className="grid gap-5">
      <div className="grid gap-4 md:grid-cols-2">
        <label className="grid gap-2 text-sm font-medium">
          <span className="flex items-center gap-2">
            <Type className="size-4 text-muted-foreground" aria-hidden="true" />
            Nome da plataforma
          </span>
          <Input name="app_name" defaultValue={settings.app_name} />
        </label>

        <label className="grid gap-2 text-sm font-medium">
          <span className="flex items-center gap-2">
            <Palette
              className="size-4 text-muted-foreground"
              aria-hidden="true"
            />
            Cor principal
          </span>
          <div className="flex gap-2">
            <span
              className="h-10 w-10 shrink-0 rounded-md border border-border shadow-[var(--shadow-soft)]"
              style={{
                backgroundColor: isValidHex ? primaryColor : "transparent",
              }}
              aria-hidden="true"
            />
            <Input
              name="primary_color"
              value={primaryColor}
              onChange={(event) => setPrimaryColor(event.target.value)}
              aria-invalid={!isValidHex}
              className="flex-1"
            />
            <input
              aria-label="Selecionar cor principal"
              type="color"
              name="primary_color_picker"
              value={isValidHex ? primaryColor : "#000000"}
              className="h-10 w-14 rounded-md border border-border bg-card p-1 shadow-[var(--shadow-soft)]"
              onChange={(event) => setPrimaryColor(event.currentTarget.value)}
            />
          </div>
          {!isValidHex ? (
            <span className="text-xs font-normal text-destructive">
              Use uma cor hexadecimal válida, no formato #RRGGBB.
            </span>
          ) : null}
        </label>

        <div className="grid gap-4 md:col-span-2 md:grid-cols-2">
          <div className="grid content-start gap-2 text-sm font-medium">
            <span className="flex items-center gap-2">
              <ImageIcon
                className="size-4 text-muted-foreground"
                aria-hidden="true"
              />
              Logo ícone
            </span>
            <LogoUploadField
              currentUrl={settings.logo_url}
              label="logo ícone"
            />
            <p className="text-xs font-normal text-muted-foreground">
              Usada no favicon e quando só há espaço para um ícone.
            </p>
          </div>
          <div className="grid content-start gap-2 text-sm font-medium">
            <span className="flex items-center gap-2">
              <ImageIcon
                className="size-4 text-muted-foreground"
                aria-hidden="true"
              />
              Logo completa (com nome)
            </span>
            <LogoUploadField
              name="logo_full"
              currentUrl={settings.logo_full_url}
              currentFieldName="current_logo_full_url"
              removeFieldName="remove_logo_full"
              variant="wide"
              label="logo completa"
            />
            <p className="text-xs font-normal text-muted-foreground">
              Usada no login e acima dos menus. Prefira uma imagem horizontal
              com fundo transparente.
            </p>
          </div>
        </div>

        <label className="grid gap-2 text-sm font-medium">
          <span className="flex items-center gap-2">
            <Mail className="size-4 text-muted-foreground" aria-hidden="true" />
            E-mail de suporte
          </span>
          <Input
            name="support_email"
            type="email"
            defaultValue={settings.support_email ?? ""}
            placeholder="suporte@empresa.com"
          />
        </label>

        <label className="grid gap-2 text-sm font-medium">
          <span className="flex items-center gap-2">
            <MessageCircle
              className="size-4 text-muted-foreground"
              aria-hidden="true"
            />
            WhatsApp de suporte
          </span>
          <Input
            name="support_whatsapp"
            defaultValue={settings.support_whatsapp ?? ""}
            placeholder="(11) 90000-0000"
          />
        </label>
      </div>

      <div className="border-t border-border pt-5">
        <div className="mb-4 flex items-start gap-3">
          <KeyRound className="mt-0.5 size-5 text-primary" aria-hidden="true" />
          <div>
            <h3 className="font-semibold">Evolution API</h3>
            <p className="text-sm text-muted-foreground">
              Credencial global usada para criar e conectar o WhatsApp das
              empresas.
            </p>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="grid content-start gap-2 text-sm font-medium">
            URL da Evolution API
            <Input
              name="evolution_api_url"
              type="url"
              defaultValue={evolution.apiUrl}
              placeholder="https://evolution.exemplo.com"
            />
          </label>
          <label className="grid content-start gap-2 text-sm font-medium">
            API key global
            <Input
              name="evolution_api_key"
              type="password"
              autoComplete="new-password"
              placeholder={
                evolution.hasApiKey
                  ? "••••••••••••••••"
                  : "Cole a chave da Evolution"
              }
            />
            {evolution.hasApiKey ? (
              <span className="text-xs font-normal text-muted-foreground">
                Deixe em branco para manter a chave atual.
              </span>
            ) : null}
          </label>
        </div>
      </div>

      {state.error ? (
        <p className="rounded border border-destructive-muted bg-destructive-muted px-3 py-2 text-sm text-destructive-foreground">
          {state.error}
        </p>
      ) : null}

      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          <Save className="size-4" aria-hidden="true" />
          {pending ? "Salvando..." : "Salvar configurações"}
        </Button>
      </div>
    </form>
  );
}
