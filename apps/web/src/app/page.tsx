import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Pulse as Activity,
  ArrowRight,
  CalendarDots as CalendarDays,
  ShieldCheck,
  Stethoscope,
  Wallet as WalletCards,
} from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/button";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { getPlatformSettings } from "@/lib/platform/settings";

const highlights = [
  {
    label: "Agenda",
    description: "Organização da rotina e dos atendimentos.",
    icon: CalendarDays,
  },
  {
    label: "Prontuário",
    description: "Informação clínica centralizada e protegida.",
    icon: Stethoscope,
  },
  {
    label: "Financeiro",
    description: "Acompanhamento operacional em um único fluxo.",
    icon: WalletCards,
  },
];

export default async function Home() {
  const [authUser, settings] = await Promise.all([
    getAuthenticatedUser(),
    getPlatformSettings(),
  ]);

  if (authUser) {
    redirect("/dashboard");
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between gap-4 px-4 md:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded bg-primary text-primary-foreground">
              <Activity className="size-5" aria-hidden="true" />
            </div>
            <p className="truncate text-sm font-semibold">
              {settings.app_name}
            </p>
          </div>

          <Button asChild variant="secondary">
            <Link href="/login">Entrar</Link>
          </Button>
        </div>
      </header>

      <section className="mx-auto flex min-h-[calc(100svh-12rem)] w-full max-w-7xl items-center px-4 py-16 md:px-6">
        <div className="max-w-3xl animate-panel-enter">
          <div className="mb-5 inline-flex items-center gap-2 text-sm font-medium text-primary">
            <ShieldCheck className="size-4" aria-hidden="true" />
            Operação clínica integrada
          </div>
          <h1 className="text-4xl font-semibold leading-tight md:text-5xl">
            {settings.app_name}
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-muted-foreground">
            Um ambiente único para organizar a rotina da clínica com acesso
            seguro, informações centralizadas e fluxos de atendimento
            consistentes.
          </p>
          <div className="mt-8">
            <Button asChild>
              <Link href="/login">
                Acessar plataforma
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="border-y border-border bg-card">
        <div className="mx-auto grid w-full max-w-7xl gap-px bg-border md:grid-cols-3">
          {highlights.map((highlight) => (
            <div
              key={highlight.label}
              className="bg-card px-4 py-6 transition-colors duration-[var(--motion-fast)] hover:bg-background md:px-6"
            >
              <highlight.icon
                className="size-5 text-primary"
                aria-hidden="true"
              />
              <h2 className="mt-4 text-sm font-semibold">{highlight.label}</h2>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                {highlight.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      <footer className="mx-auto flex w-full max-w-7xl flex-col gap-2 px-4 py-6 text-xs text-muted-foreground md:flex-row md:items-center md:justify-between md:px-6">
        <p>{settings.app_name}</p>
        {settings.support_email ? (
          <a
            className="transition-colors duration-[var(--motion-fast)] hover:text-foreground"
            href={`mailto:${settings.support_email}`}
          >
            {settings.support_email}
          </a>
        ) : null}
      </footer>
    </main>
  );
}
