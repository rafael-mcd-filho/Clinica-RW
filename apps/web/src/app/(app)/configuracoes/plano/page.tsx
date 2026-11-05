import { CompanyConfigurationPage } from "../configuration-page";
import { requireCompanyConfigurationAccess } from "../_lib/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { getPlanPrice } from "@/lib/billing/plans";
import { formatCurrency, formatNumber } from "@/lib/format";
import { getPlatformSettings } from "@/lib/platform/settings";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const planLabels: Record<string, string> = {
  starter: "Starter",
  professional: "Professional",
  clinic: "Clinic",
};

const statusLabels: Record<
  string,
  { label: string; tone: "success" | "warning" | "destructive" | "neutral" }
> = {
  active: { label: "Ativa", tone: "success" },
  trial: { label: "Em teste", tone: "warning" },
  past_due: { label: "Pagamento pendente", tone: "warning" },
  suspended: { label: "Suspensa", tone: "destructive" },
  cancelled: { label: "Cancelada", tone: "neutral" },
};

/**
 * Raio-X C5: a permissão config.plano existia sem tela. Mostra o plano
 * contratado, a situação da assinatura e o uso da clínica, com o contato
 * para mudar de plano. A cobrança recorrente automática depende de um
 * gateway (ver docs/integracoes-externas.md).
 */
export default async function PlanoConfiguracoesPage() {
  const access = await requireCompanyConfigurationAccess("plano");
  const organizationId = access.organization.id;
  const supabase = await createSupabaseServerClient();
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);

  const [organization, users, professionals, patients, appointments, settings] =
    await Promise.all([
      supabase
        .from("organizations")
        .select("plan_key, status, created_at")
        .eq("id", organizationId)
        .maybeSingle<{
          plan_key: string | null;
          status: string | null;
          created_at: string | null;
        }>(),
      supabase
        .from("app_users")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .eq("status", "active"),
      supabase
        .from("professionals")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .eq("active", true),
      supabase
        .from("patients")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .is("deleted_at", null),
      supabase
        .from("appointments")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .gte("start_at", monthStart.toISOString()),
      getPlatformSettings(),
    ]);

  const planKey = organization.data?.plan_key ?? "starter";
  const status = statusLabels[organization.data?.status ?? "active"] ?? {
    label: organization.data?.status ?? "—",
    tone: "neutral" as const,
  };
  const price = getPlanPrice(planKey);
  const supportHref = settings.support_whatsapp
    ? `https://wa.me/${settings.support_whatsapp.replace(/\D/g, "")}?text=${encodeURIComponent(`Olá! Quero falar sobre o plano da ${access.organization.name}.`)}`
    : settings.support_email
      ? `mailto:${settings.support_email}?subject=${encodeURIComponent(`Plano da ${access.organization.name}`)}`
      : settings.support_url;

  const usage = [
    { label: "Usuários ativos", value: users.count },
    { label: "Profissionais ativos", value: professionals.count },
    { label: "Pacientes cadastrados", value: patients.count },
    { label: "Agendamentos neste mês", value: appointments.count },
  ];

  return (
    <CompanyConfigurationPage access={access} route="plano">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <Card>
          <CardHeader className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold">Plano contratado</h2>
            <Badge variant={status.tone}>{status.label}</Badge>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div>
              <p className="text-heading font-semibold">
                {planLabels[planKey] ??
                  planKey.charAt(0).toUpperCase() + planKey.slice(1)}
              </p>
              {price ? (
                <p className="text-body-sm text-muted-foreground">
                  {formatCurrency(price)} por mês
                </p>
              ) : null}
            </div>
            <p className="text-body-sm text-muted-foreground">
              Para mudar de plano, incluir mais profissionais ou tirar dúvidas
              sobre a cobrança, fale com o suporte.
            </p>
            {supportHref ? (
              <Button
                asChild
                variant="secondary"
                className="justify-self-start"
              >
                <a href={supportHref} target="_blank" rel="noreferrer">
                  Falar com o suporte
                </a>
              </Button>
            ) : null}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <h2 className="font-semibold">Uso da clínica</h2>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {usage.map((item) => (
                <div
                  key={item.label}
                  className="rounded-lg border border-border p-3"
                >
                  <dt className="text-caption text-muted-foreground">
                    {item.label}
                  </dt>
                  <dd className="mt-1 text-heading font-semibold tabular-nums">
                    {item.value == null ? "—" : formatNumber(item.value)}
                  </dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>
      </div>
    </CompanyConfigurationPage>
  );
}
