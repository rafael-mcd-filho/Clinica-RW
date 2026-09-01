"use client";

import Image from "next/image";
import { useState } from "react";
import { cn, initialsFromName } from "@/lib/utils";

/**
 * Avatar de pessoa (contato, paciente, usuário).
 *
 * Avatares não seguem a escala de ícones (docs/design-system.md § Ícones) —
 * a escala fechada abaixo é a única fonte de tamanho:
 * sm = 36px — listas densas, células de tabela, header
 * md = 40px — item de conversa, cabeçalho de painel
 * lg = 64px — identificação principal de um contato/paciente
 *
 * Sem foto (ou com foto quebrada) cai para as iniciais. As iniciais são
 * `aria-hidden` porque o nome sempre aparece ao lado nos usos reais.
 */
const sizes = {
  sm: { box: "size-9", text: "text-label", pixels: 36 },
  md: { box: "size-10", text: "text-body-sm", pixels: 40 },
  lg: { box: "size-16", text: "text-heading", pixels: 64 },
} as const;

const tones = {
  /** Padrão: círculo suave sobre card. */
  muted: "bg-primary-muted text-primary",
  /** Usuário autenticado no header — precisa de contraste sobre a barra. */
  solid: "bg-primary text-primary-foreground",
} as const;

type AvatarProps = {
  name: string;
  photoUrl?: string | null;
  size?: keyof typeof sizes;
  tone?: keyof typeof tones;
  /** Avisa o pai quando a foto falhou (ex.: para esconder o "ampliar"). */
  onPhotoError?: () => void;
  className?: string;
};

export function Avatar({
  name,
  photoUrl,
  size = "md",
  tone = "muted",
  onPhotoError,
  className,
}: AvatarProps) {
  const [failedPhotoUrl, setFailedPhotoUrl] = useState<string | null>(null);
  const { box, text, pixels } = sizes[size];

  if (photoUrl && failedPhotoUrl !== photoUrl) {
    return (
      <Image
        unoptimized
        src={photoUrl}
        alt={`Foto de ${name}`}
        width={pixels}
        height={pixels}
        loading="lazy"
        onError={() => {
          setFailedPhotoUrl(photoUrl);
          onPhotoError?.();
        }}
        className={cn("shrink-0 rounded-full object-cover", box, className)}
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full font-semibold",
        box,
        text,
        tones[tone],
        className,
      )}
    >
      {initialsFromName(name)}
    </span>
  );
}
