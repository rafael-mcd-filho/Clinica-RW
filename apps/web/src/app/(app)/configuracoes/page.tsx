import { Settings } from "lucide-react";
import { redirect } from "next/navigation";
import { AgendaSettings, type AgendaSettingsData } from "./agenda-settings";
import { CompanySettings } from "./company-settings";
import {
  OnlineBookingSettings,
  type OnlineBookingSettingsData,
  type OnlineBookingProfileData,
} from "./online-booking-settings";
import {
  PatientTagAutomationSettings,
  type PatientTagAutomationData,
} from "./patient-tag-automation-settings";
import { PlatformSettingsForm } from "./platform-settings-form";
import { TemplateBuilderForm } from "../prontuario/template-builder-form";
import { Tabs } from "@/components/ui/tabs";
import { getRequestContext, hasAnyPermission } from "@/lib/auth/context";
import { getCompanySettingsData } from "@/lib/clinic/base-registrations";
import { getPlatformSettings } from "@/lib/platform/settings";
import { createSupabaseServerClient } from "@/lib/supabase/server";

async function getPatientTagAutomationData(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  organizationId: string,
): Promise<PatientTagAutomationData> {
  const [tagsResult, rulesResult] = await Promise.all([
    supabase
      .from("tags")
      .select("id, name, color")
      .eq("organization_id", organizationId)
      .order("name")
      .returns<PatientTagAutomationData["tags"]>(),
    supabase
      .from("patient_tag_rules")
      .select("id, tag_id, name, trigger_type, active, duration_days, config")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .returns<PatientTagAutomationData["rules"]>(),
  ]);

  return {
    tags: tagsResult.data ?? [],
    rules: rulesResult.data ?? [],
  };
}

async function getOnlineBookingProfileData(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  organizationId: string,
): Promise<OnlineBookingProfileData> {
  const [healthInsurances, paymentMethods, reviews] = await Promise.all([
    supabase
      .from("health_insurances")
      .select("id, name")
      .eq("organization_id", organizationId)
      .eq("active", true)
      .order("name")
      .returns<OnlineBookingProfileData["healthInsurances"]>(),
    supabase
      .from("payment_methods")
      .select("id, name")
      .eq("organization_id", organizationId)
      .eq("active", true)
      .order("name")
      .returns<OnlineBookingProfileData["paymentMethods"]>(),
    supabase
      .from("online_booking_reviews")
      .select(
        "id, patient_display_name, rating, title, body, tags, source_label, verified, highlighted, active, review_date, professional_response",
      )
      .eq("organization_id", organizationId)
      .order("review_date", { ascending: false })
      .limit(20)
      .returns<OnlineBookingProfileData["reviews"]>(),
  ]);

  return {
    healthInsurances: healthInsurances.data ?? [],
    paymentMethods: paymentMethods.data ?? [],
    reviews: reviews.data ?? [],
  };
}

export default async function ConfiguracoesPage() {
  const context = await getRequestContext();

  if (!context.isSuperAdmin) {
    const canManageCompany = context.permissionCodes.has("config.geral");
    const canConfigureAgenda = context.permissionCodes.has("agenda.configurar");
    const canBlockAgenda = context.permissionCodes.has(
      "agenda.bloquear_horario",
    );
    const canCreateClinicalTemplate = context.permissionCodes.has(
      "clinico.criar_template",
    );
    const canManageOnlineBooking = canManageCompany || canConfigureAgenda;

    if (
      !context.organization ||
      !hasAnyPermission(context.permissionCodes, [
        "config.geral",
        "config.usuarios",
        "config.integracoes",
        "config.plano",
        "agenda.configurar",
        "agenda.bloquear_horario",
        "clinico.criar_template",
      ])
    ) {
      redirect("/dashboard");
    }

    if (
      !canManageCompany &&
      !canConfigureAgenda &&
      !canBlockAgenda &&
      !canCreateClinicalTemplate
    ) {
      return (
        <div className="grid gap-6">
          <section>
            <h1 className="text-xl font-semibold">Configurações</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Seu perfil não permite alterar configurações disponíveis nesta
              tela.
            </p>
          </section>
        </div>
      );
    }

    const supabase = await createSupabaseServerClient();
    const companyData = canManageCompany
      ? await getCompanySettingsData({
          id: context.organization.id,
          name: context.organization.name,
          mode: context.organization.mode === "clinic" ? "clinic" : "solo",
        })
      : null;
    const onlineSettings = canManageOnlineBooking
      ? await supabase
          .from("online_booking_settings")
          .select(
            "id, public_slug, enabled, min_notice_hours, max_days_ahead, cancellation_notice_hours, max_requests_per_contact_day, max_no_shows_180_days, require_contact_verification, contact_verification_ttl_minutes, public_instructions, cancellation_policy, profile_headline, profile_summary, experience_text, education_count, accepted_plan_count, excellence_badge_year, treated_conditions, patient_groups, consultation_formats, profile_highlights, accepted_health_insurance_ids, accepted_payment_method_ids, accepted_plan_notes",
          )
          .eq("organization_id", context.organization.id)
          .maybeSingle<OnlineBookingSettingsData>()
      : null;
    const onlineBookingProfileData = canManageOnlineBooking
      ? await getOnlineBookingProfileData(supabase, context.organization.id)
      : null;
    const tagAutomationData = canManageCompany
      ? await getPatientTagAutomationData(supabase, context.organization.id)
      : null;
    let agendaSettings: AgendaSettingsData | null = null;

    if (canConfigureAgenda || canBlockAgenda) {
      const [schedules, professionals, units] = await Promise.all([
        supabase
          .from("schedules")
          .select("id, professional_id, unit_id, name, color, active")
          .eq("organization_id", context.organization.id)
          .eq("active", true)
          .order("name")
          .returns<AgendaSettingsData["schedules"]>(),
        supabase
          .from("professionals")
          .select("id, name")
          .eq("organization_id", context.organization.id)
          .eq("active", true)
          .order("name")
          .returns<AgendaSettingsData["professionals"]>(),
        supabase
          .from("units")
          .select("id, name")
          .eq("organization_id", context.organization.id)
          .eq("active", true)
          .order("name")
          .returns<AgendaSettingsData["units"]>(),
      ]);

      agendaSettings = {
        schedules: schedules.data ?? [],
        professionals: professionals.data ?? [],
        units: units.data ?? [],
      };
    }

    const tabs = [
      companyData
        ? {
            id: "cadastros",
            label: "Cadastros e operação",
            content: <CompanySettings data={companyData} />,
          }
        : null,
      agendaSettings
        ? {
            id: "agenda",
            label: "Agenda",
            content: (
              <AgendaSettings
                data={agendaSettings}
                canConfigure={canConfigureAgenda}
                canBlock={canBlockAgenda}
              />
            ),
          }
        : null,
      canManageOnlineBooking
        ? {
            id: "agendamento-online",
            label: "Agendamento online",
            content: (
              <OnlineBookingSettings
                settings={onlineSettings?.data ?? null}
                healthInsurances={
                  onlineBookingProfileData?.healthInsurances ?? []
                }
                paymentMethods={onlineBookingProfileData?.paymentMethods ?? []}
                reviews={onlineBookingProfileData?.reviews ?? []}
              />
            ),
          }
        : null,
      tagAutomationData
        ? {
            id: "tags",
            label: "Tags e automações",
            content: <PatientTagAutomationSettings data={tagAutomationData} />,
          }
        : null,
      canCreateClinicalTemplate
        ? {
            id: "modelos-clinicos",
            label: "Modelos clínicos",
            content: <TemplateBuilderForm />,
          }
        : null,
    ].filter((item): item is NonNullable<typeof item> => Boolean(item));

    return (
      <div className="grid gap-6">
        <section>
          <h1 className="text-xl font-semibold">Configurações</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Administração da operação de {context.organization.name}.
          </p>
        </section>
        <Tabs items={tabs} />
      </div>
    );
  }

  const settings = await getPlatformSettings();

  return (
    <div className="grid gap-6">
      <section>
        <h1 className="text-xl font-semibold">Configurações</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Marca, cores e canais de suporte da plataforma.
        </p>
      </section>

      <section className="rounded-lg border border-border bg-card">
        <div className="flex items-center gap-3 border-b border-border px-5 py-4">
          <Settings className="size-5 text-primary" aria-hidden="true" />
          <div>
            <h2 className="text-base font-semibold">Aparência e suporte</h2>
            <p className="text-sm text-muted-foreground">
              Estes dados serão usados nas páginas das empresas.
            </p>
          </div>
        </div>
        <div className="p-5">
          <PlatformSettingsForm settings={settings} />
        </div>
      </section>
    </div>
  );
}
