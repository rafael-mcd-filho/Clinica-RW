"use client";

import Link from "next/link";
import {
  ArrowSquareOut,
  Copy,
  DotsThree,
  EnvelopeSimple,
  IdentificationCard,
  Phone,
  WhatsappLogo,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

const circle =
  "inline-flex size-10 items-center justify-center rounded-full transition-[background-color,transform,opacity] duration-[var(--motion-fast)] ease-[var(--ease-out)] active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

/**
 * Atalhos de contato do cartão do paciente: ligar, WhatsApp, e-mail e mais.
 *
 * O WhatsApp abre a conversa no Atendimento quando ela já existe (é onde a
 * equipe responde); sem conversa, abre o WhatsApp Web com o número. Sem o
 * dado cadastrado, o botão fica apagado e diz o que falta.
 */
export function PatientContactActions({
  cpf,
  conversationHref,
  email,
  phone,
  phoneLabel,
  whatsapp,
}: {
  cpf: string | null;
  conversationHref: string | null;
  email: string | null;
  /** Só dígitos. */
  phone: string | null;
  phoneLabel: string | null;
  /** Só dígitos. */
  whatsapp: string | null;
}) {
  const whatsappDigits = whatsapp || phone;
  const whatsappWebHref = whatsappDigits
    ? `https://wa.me/${whatsappDigits.length <= 11 ? `55${whatsappDigits}` : whatsappDigits}`
    : null;

  async function copy(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copiado.`);
    } catch {
      toast.error("Não foi possível copiar.");
    }
  }

  return (
    <div className="flex items-center justify-center gap-3">
      <ContactButton
        href={phone ? `tel:+55${phone}` : null}
        label={phone ? `Ligar para ${phoneLabel}` : "Telefone não cadastrado"}
        className="bg-primary-muted text-primary hover:bg-primary-muted-hover"
      >
        <Phone className="size-[18px]" weight="fill" aria-hidden="true" />
      </ContactButton>
      <ContactButton
        href={conversationHref ?? whatsappWebHref}
        external={!conversationHref}
        label={
          conversationHref
            ? "Abrir conversa no Atendimento"
            : whatsappWebHref
              ? "Abrir no WhatsApp"
              : "WhatsApp não cadastrado"
        }
        className="bg-success-muted text-success-foreground hover:brightness-95"
      >
        <WhatsappLogo className="size-5" weight="fill" aria-hidden="true" />
      </ContactButton>
      <ContactButton
        href={email ? `mailto:${email}` : null}
        label={email ? `Enviar e-mail para ${email}` : "E-mail não cadastrado"}
        className="bg-primary-muted text-primary hover:bg-primary-muted-hover"
      >
        <EnvelopeSimple className="size-5" weight="fill" aria-hidden="true" />
      </ContactButton>
      <DropdownMenu
        trigger={
          <DotsThree className="size-5" weight="bold" aria-hidden="true" />
        }
        triggerLabel="Mais opções de contato"
        triggerClassName={cn(
          circle,
          "size-10 rounded-full border-transparent bg-muted text-secondary-foreground shadow-none hover:border-transparent hover:bg-border",
        )}
      >
        {(close) => (
          <>
            <DropdownMenuItem
              icon={Copy}
              onSelect={() => {
                close();
                if (phoneLabel) void copy(phoneLabel, "Telefone");
                else toast.error("Telefone não cadastrado.");
              }}
            >
              Copiar telefone
            </DropdownMenuItem>
            <DropdownMenuItem
              icon={Copy}
              onSelect={() => {
                close();
                if (email) void copy(email, "E-mail");
                else toast.error("E-mail não cadastrado.");
              }}
            >
              Copiar e-mail
            </DropdownMenuItem>
            {cpf ? (
              <DropdownMenuItem
                icon={IdentificationCard}
                onSelect={() => {
                  close();
                  void copy(cpf, "CPF");
                }}
              >
                Copiar CPF
              </DropdownMenuItem>
            ) : null}
            {conversationHref && whatsappWebHref ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  icon={ArrowSquareOut}
                  onSelect={() => {
                    close();
                    window.open(whatsappWebHref, "_blank", "noopener");
                  }}
                >
                  Abrir no WhatsApp Web
                </DropdownMenuItem>
              </>
            ) : null}
          </>
        )}
      </DropdownMenu>
    </div>
  );
}

function ContactButton({
  children,
  className,
  external = false,
  href,
  label,
}: {
  children: React.ReactNode;
  className: string;
  external?: boolean;
  href: string | null;
  label: string;
}) {
  if (!href) {
    return (
      <span
        role="img"
        aria-label={label}
        title={label}
        className={cn(circle, className, "cursor-not-allowed opacity-40")}
      >
        {children}
      </span>
    );
  }
  if (href.startsWith("/")) {
    return (
      <Link
        href={href}
        aria-label={label}
        title={label}
        className={cn(circle, className)}
      >
        {children}
      </Link>
    );
  }
  return (
    <a
      href={href}
      aria-label={label}
      title={label}
      target={external ? "_blank" : undefined}
      rel={external ? "noopener noreferrer" : undefined}
      className={cn(circle, className)}
    >
      {children}
    </a>
  );
}
