import type { Viewport } from "next";
import {
  CalendarBlank,
  CalendarCheck,
  ChartBar,
  Check,
  ClipboardText,
  LockKey,
  Pulse,
  ShieldCheck,
  UsersThree,
} from "@phosphor-icons/react/dist/ssr";
import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { getPlatformSettings } from "@/lib/platform/settings";
import { LoginForm } from "./login-form";
import styles from "./login.module.css";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#eef5ff",
};

export default async function LoginPage() {
  const authUser = await getAuthenticatedUser();

  if (authUser) {
    redirect("/dashboard");
  }

  const settings = await getPlatformSettings();
  const supportHref = settings.support_url
    ? settings.support_url
    : settings.support_email
      ? `mailto:${settings.support_email}`
      : settings.support_whatsapp
        ? `https://wa.me/${settings.support_whatsapp.replace(/\D/g, "")}`
        : settings.support_phone
          ? `tel:${settings.support_phone.replace(/\D/g, "")}`
          : null;

  return (
    <main className={styles.shell}>
      <section className={styles.loginPanel}>
        {supportHref ? (
          <div className={styles.supportRow}>
            <span>Não tem uma conta?</span>
            <a href={supportHref}>Fale com o suporte</a>
          </div>
        ) : null}

        <div className={styles.content}>
          <header className={styles.intro}>
            <div className={styles.brand}>
              {settings.logo_full_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={settings.logo_full_url}
                  alt={settings.app_name}
                  className={styles.fullLogo}
                />
              ) : (
                <>
                  <span className={styles.logo} aria-hidden="true">
                    {settings.logo_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={settings.logo_url}
                        alt=""
                        className={styles.iconImage}
                      />
                    ) : (
                      <Pulse weight="regular" />
                    )}
                  </span>
                  <span className={styles.brandName}>{settings.app_name}</span>
                </>
              )}
            </div>

            <h1 className={styles.title}>
              <span className={styles.mobileTitle}>
                Bem-vindo ao {settings.app_name}
              </span>
              <span className={styles.desktopTitle}>Bem-vindo de volta</span>
            </h1>
            <p className={styles.subtitle}>Acesse sua conta para continuar</p>
            <div className={styles.secureBadge}>
              <ShieldCheck weight="regular" aria-hidden="true" />
              <span>Ambiente seguro</span>
            </div>
          </header>

          <LoginForm />

          <footer className={styles.footer}>
            <ShieldCheck weight="regular" aria-hidden="true" />
            <span>{settings.app_name}</span>
            <span aria-hidden="true">·</span>
            <span>Ambiente seguro</span>
          </footer>
          <p className={styles.desktopCopyright}>
            © {new Date().getFullYear()} {settings.app_name}. Todos os direitos
            reservados.
          </p>
        </div>
      </section>

      <section className={styles.desktopPanel}>
        <div className={styles.marketingContent}>
          <div className={styles.marketingBrand}>
            {settings.logo_full_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={settings.logo_full_url}
                alt={settings.app_name}
                className={styles.marketingFullLogo}
              />
            ) : (
              <>
                <span className={styles.marketingLogo} aria-hidden="true">
                  {settings.logo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={settings.logo_url}
                      alt=""
                      className={styles.iconImage}
                    />
                  ) : (
                    <Pulse weight="regular" />
                  )}
                </span>
                <span>{settings.app_name}</span>
              </>
            )}
          </div>

          <div className={styles.marketingMessage}>
            <p className={styles.desktopEyebrow}>Sistema de gestão em saúde</p>
            <h2 className={styles.desktopHeadline}>
              Mais organização
              <br />
              para a sua clínica.
            </h2>
            <p className={styles.marketingDescription}>
              Atendimentos, prontuário, agenda e gestão
              <br />
              em um só lugar, de forma simples e segura.
            </p>
          </div>

          <div className={styles.featureList}>
            <div className={styles.feature}>
              <span className={styles.featureIcon} aria-hidden="true">
                <CalendarCheck />
              </span>
              <div>
                <strong>Agenda inteligente</strong>
                <span>Organize seus atendimentos com facilidade.</span>
              </div>
            </div>
            <div className={styles.feature}>
              <span className={styles.featureIcon} aria-hidden="true">
                <UsersThree />
              </span>
              <div>
                <strong>Prontuário completo</strong>
                <span>Tenha o histórico do paciente sempre à mão.</span>
              </div>
            </div>
            <div className={styles.feature}>
              <span className={styles.featureIcon} aria-hidden="true">
                <ChartBar />
              </span>
              <div>
                <strong>Gestão da clínica</strong>
                <span>Acompanhe resultados e tome melhores decisões.</span>
              </div>
            </div>
            <div className={styles.feature}>
              <span className={styles.featureIcon} aria-hidden="true">
                <ShieldCheck />
              </span>
              <div>
                <strong>Seguro e confiável</strong>
                <span>Seus dados protegidos e em conformidade.</span>
              </div>
            </div>
          </div>

          <div className={styles.privacyCard}>
            <span className={styles.privacyIcon} aria-hidden="true">
              <LockKey />
            </span>
            <div>
              <strong>Conformidade com a LGPD</strong>
              <span>Seus dados protegidos e com total privacidade.</span>
            </div>
          </div>
        </div>

        <div className={styles.appointmentCard} aria-hidden="true">
          <div className={styles.appointmentPatient}>
            <span className={styles.patientAvatar}>MC</span>
            <span>
              <small>Paciente</small>
              <strong>Mariana Costa</strong>
            </span>
          </div>
          <span className={styles.appointmentLine} />
          <div className={styles.appointmentDetails}>
            <span>
              Consulta de retorno
              <br />
              10:30 - 11:00
            </span>
            <Check />
          </div>
        </div>
        <div className={styles.shortcutCard} aria-hidden="true">
          <span>
            <ClipboardText /> Prontuário
          </span>
          <span>
            <CalendarBlank /> Agenda
          </span>
          <span>
            <UsersThree /> Pacientes
          </span>
        </div>
      </section>
    </main>
  );
}
