"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import {
  CalendarDays,
  Check,
  Copy,
  ExternalLink,
  Globe2,
  Link2,
  MessageSquare,
  Settings2,
  Star,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";
import {
  createOnlineBookingReview,
  updateOnlineBookingSettings,
  updateOnlineBookingReview,
  type AgendaActionState,
} from "@/app/(app)/agenda/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { DatePickerInput } from "@/components/ui/date-picker-input";
import { Input, Textarea } from "@/components/ui/field";
import { FormError } from "@/components/ui/form-error";
import { HelpTooltip } from "@/components/ui/help-tooltip";
import { Tabs } from "@/components/ui/tabs";

export type OnlineBookingSettingsData = {
  id: string;
  public_slug: string;
  enabled: boolean;
  min_notice_hours: number;
  max_days_ahead: number;
  cancellation_notice_hours: number;
  max_requests_per_contact_day: number;
  max_no_shows_180_days: number;
  require_contact_verification: boolean;
  contact_verification_ttl_minutes: number;
  public_instructions: string | null;
  cancellation_policy: string | null;
  profile_headline: string | null;
  profile_summary: string | null;
  experience_text: string | null;
  education_count: number;
  accepted_plan_count: number;
  excellence_badge_year: number | null;
  treated_conditions: string[];
  patient_groups: string[];
  consultation_formats: string[];
  profile_highlights: string[];
  accepted_health_insurance_ids: string[];
  accepted_payment_method_ids: string[];
  accepted_plan_notes: string | null;
};

export type OnlineBookingProfileData = {
  healthInsurances: Array<{ id: string; name: string }>;
  paymentMethods: Array<{ id: string; name: string }>;
  reviews: Array<{
    id: string;
    patient_display_name: string;
    rating: number;
    title: string | null;
    body: string;
    tags: string[];
    source_label: string | null;
    verified: boolean;
    highlighted: boolean;
    active: boolean;
    review_date: string;
    professional_response: string | null;
  }>;
};

export type OnlineBookingScheduleSummary = {
  id: string;
  name: string;
  active: boolean;
  onlineEnabled: boolean;
};

const initialState: AgendaActionState = {};
type BookingSettingsSection = "publication" | "rules" | "profile" | "reviews";

export function OnlineBookingSettings({
  settings,
  healthInsurances,
  paymentMethods,
  reviews,
  schedules,
}: {
  settings: OnlineBookingSettingsData | null;
  healthInsurances: OnlineBookingProfileData["healthInsurances"];
  paymentMethods: OnlineBookingProfileData["paymentMethods"];
  reviews: OnlineBookingProfileData["reviews"];
  schedules: OnlineBookingScheduleSummary[];
}) {
  const [state, action, pending] = useActionState(
    updateOnlineBookingSettings,
    initialState,
  );
  const [activeSection, setActiveSection] =
    useState<BookingSettingsSection>("publication");

  useEffect(() => {
    if (state.success) toast.success(state.success);
  }, [state]);

  if (!settings) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          As configuracoes de agendamento online ainda nao foram criadas para
          esta empresa.
        </CardContent>
      </Card>
    );
  }

  const publicPath = `/agendar/${settings.public_slug}`;

  return (
    <div className="grid gap-5">
      <Tabs
        ariaLabel="Seções do agendamento online"
        value={activeSection}
        onValueChange={(value) =>
          setActiveSection(value as BookingSettingsSection)
        }
        items={[
          {
            id: "publication",
            label: "Publicação e agendas",
            icon: <CalendarDays />,
          },
          { id: "rules", label: "Regras do portal", icon: <Settings2 /> },
          { id: "profile", label: "Perfil público", icon: <UserRound /> },
          {
            id: "reviews",
            label: `Avaliações (${reviews.length})`,
            icon: <MessageSquare />,
          },
        ]}
      />

      <section
        hidden={activeSection !== "publication"}
        className="grid gap-5"
        aria-label="Publicação e agendas"
      >
        <PublicBookingAccessCard
          publicPath={publicPath}
          enabled={settings.enabled}
        />
        <SchedulePublicationSummary schedules={schedules} />
      </section>

      <Card hidden={activeSection !== "rules" && activeSection !== "profile"}>
        <CardHeader>
          <div>
            <div className="flex items-center gap-2">
              <Globe2 className="size-4 text-primary" aria-hidden="true" />
              <h2 className="font-semibold">
                {activeSection === "rules"
                  ? "Regras do portal"
                  : "Perfil público"}
              </h2>
              <HelpTooltip label="Como funciona o agendamento online">
                As solicitações entram para revisão da equipe e só ocupam a
                agenda depois de confirmadas.
              </HelpTooltip>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {activeSection === "rules"
                ? "Publicação, segurança e regras aplicadas a todas as agendas."
                : "Informações profissionais, planos e pagamentos exibidos aos pacientes."}
            </p>
          </div>
        </CardHeader>
        <CardContent>
          <form action={action} className="grid gap-4">
            <div
              hidden={activeSection !== "rules"}
              className="grid gap-4 md:grid-cols-3"
            >
              <div className="md:col-span-3">
                <Checkbox
                  name="enabled"
                  defaultChecked={settings.enabled}
                  label="Permitir solicitações pelo link público"
                />
              </div>
              <div className="md:col-span-3">
                <Checkbox
                  name="require_contact_verification"
                  defaultChecked={settings.require_contact_verification}
                  label="Exigir código de verificação por e-mail ou telefone"
                />
              </div>
              <label className="grid gap-2 text-sm font-medium">
                <span className="inline-flex items-center gap-1">
                  Link público
                  <HelpTooltip>
                    Endereço curto compartilhado com pacientes. Alterá-lo
                    invalida o link anterior.
                  </HelpTooltip>
                </span>
                <div className="flex items-center rounded-md border border-border bg-card shadow-[var(--shadow-soft)]">
                  <span className="px-3 text-sm text-muted-foreground">
                    /agendar/
                  </span>
                  <input
                    name="public_slug"
                    defaultValue={settings.public_slug}
                    className="h-10 min-w-0 flex-1 bg-transparent pr-3 text-sm outline-none"
                    required
                  />
                </div>
              </label>
              <label className="grid gap-2 text-sm font-medium">
                <span className="inline-flex items-center gap-1">
                  Solicitações por contato/dia
                  <HelpTooltip>
                    Protege a agenda contra repetição excessiva de solicitações
                    pelo mesmo contato.
                  </HelpTooltip>
                </span>
                <Input
                  name="max_requests_per_contact_day"
                  type="number"
                  min="1"
                  max="20"
                  defaultValue={settings.max_requests_per_contact_day}
                  required
                />
              </label>
              <label className="grid gap-2 text-sm font-medium">
                <span className="inline-flex items-center gap-1">
                  Bloquear após faltas
                  <HelpTooltip>
                    Quantidade de faltas nos últimos 180 dias que impede novas
                    solicitações online. Use zero para não aplicar o bloqueio.
                  </HelpTooltip>
                </span>
                <Input
                  name="max_no_shows_180_days"
                  type="number"
                  min="0"
                  max="20"
                  defaultValue={settings.max_no_shows_180_days}
                  required
                />
              </label>
              <label className="grid gap-2 text-sm font-medium">
                <span className="inline-flex items-center gap-1">
                  Validade do código (min)
                  <HelpTooltip>
                    Tempo disponível para o paciente concluir a verificação do
                    contato.
                  </HelpTooltip>
                </span>
                <Input
                  name="contact_verification_ttl_minutes"
                  type="number"
                  min="5"
                  max="120"
                  defaultValue={settings.contact_verification_ttl_minutes}
                  required
                />
              </label>
              <label className="grid gap-2 text-sm font-medium md:col-span-3">
                Instruções públicas
                <Textarea
                  name="public_instructions"
                  defaultValue={settings.public_instructions ?? ""}
                />
              </label>
              <label className="grid gap-2 text-sm font-medium md:col-span-3">
                Política de cancelamento
                <Textarea
                  name="cancellation_policy"
                  defaultValue={settings.cancellation_policy ?? ""}
                />
              </label>
            </div>

            <div
              hidden={activeSection !== "profile"}
              className="grid gap-4 md:grid-cols-3"
            >
              <div className="md:col-span-3">
                <SectionTitle
                  title="Perfil público"
                  description="Dados exibidos na página de agendamento online."
                />
              </div>
              <label className="grid gap-2 text-sm font-medium">
                Frase de destaque
                <Input
                  name="profile_headline"
                  defaultValue={settings.profile_headline ?? ""}
                  placeholder="Cirurgia toracica, pneumologia, estetica..."
                />
              </label>
              <label className="grid gap-2 text-sm font-medium">
                Formacoes
                <Input
                  name="education_count"
                  type="number"
                  min="0"
                  defaultValue={settings.education_count ?? 0}
                />
              </label>
              <label className="grid gap-2 text-sm font-medium">
                Ano do certificado
                <Input
                  name="excellence_badge_year"
                  type="number"
                  min="1900"
                  max="3000"
                  defaultValue={settings.excellence_badge_year ?? ""}
                />
              </label>
              <label className="grid gap-2 text-sm font-medium md:col-span-3">
                Resumo curto
                <Textarea
                  name="profile_summary"
                  defaultValue={settings.profile_summary ?? ""}
                  placeholder="Texto curto exibido no topo do perfil."
                />
              </label>
              <label className="grid gap-2 text-sm font-medium md:col-span-3">
                Experiencia
                <Textarea
                  name="experience_text"
                  defaultValue={settings.experience_text ?? ""}
                  placeholder="Formacao, residencia, areas de atuacao e diferenciais."
                  className="min-h-32"
                />
              </label>
              <label className="grid gap-2 text-sm font-medium">
                Principais doencas tratadas
                <Textarea
                  name="treated_conditions"
                  defaultValue={(settings.treated_conditions ?? []).join("\n")}
                  placeholder="Uma por linha ou separadas por virgula"
                />
              </label>
              <label className="grid gap-2 text-sm font-medium">
                Pacientes que atende
                <Textarea
                  name="patient_groups"
                  defaultValue={(settings.patient_groups ?? []).join("\n")}
                  placeholder={"Adultos\nCriancas"}
                />
              </label>
              <label className="grid gap-2 text-sm font-medium">
                Formatos de consulta
                <Textarea
                  name="consultation_formats"
                  defaultValue={(settings.consultation_formats ?? []).join(
                    "\n",
                  )}
                  placeholder={"Presencial\nTeleconsulta"}
                />
              </label>
              <label className="grid gap-2 text-sm font-medium md:col-span-3">
                Destaques
                <Textarea
                  name="profile_highlights"
                  defaultValue={(settings.profile_highlights ?? []).join("\n")}
                  placeholder="Um destaque por linha"
                />
              </label>

              <div className="md:col-span-3">
                <SectionTitle
                  title="Planos e pagamentos"
                  description="Defina o que aparece como aceito no perfil publico."
                />
              </div>
              <label className="grid gap-2 text-sm font-medium">
                Numero publico de planos aceitos
                <Input
                  name="accepted_plan_count"
                  type="number"
                  min="0"
                  defaultValue={settings.accepted_plan_count ?? 0}
                />
              </label>
              <label className="grid gap-2 text-sm font-medium md:col-span-2">
                Observacao sobre planos
                <Input
                  name="accepted_plan_notes"
                  defaultValue={settings.accepted_plan_notes ?? ""}
                  placeholder="A cobertura varia por local e servico."
                />
              </label>
              <CheckboxGrid
                title="Planos aceitos"
                name="accepted_health_insurance_ids"
                options={healthInsurances}
                selected={settings.accepted_health_insurance_ids ?? []}
              />
              <CheckboxGrid
                title="Modalidades de pagamento"
                name="accepted_payment_method_ids"
                options={paymentMethods}
                selected={settings.accepted_payment_method_ids ?? []}
              />
            </div>
            <FormError message={state.error} />
            <div className="flex justify-end">
              <Button type="submit" disabled={pending}>
                {pending ? "Salvando..." : "Salvar agendamento online"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <section hidden={activeSection !== "reviews"} aria-label="Avaliações">
        <ReviewsSettings reviews={reviews} />
      </section>
    </div>
  );
}

function SchedulePublicationSummary({
  schedules,
}: {
  schedules: OnlineBookingScheduleSummary[];
}) {
  const activeSchedules = schedules.filter((schedule) => schedule.active);
  const enabledCount = activeSchedules.filter(
    (schedule) => schedule.onlineEnabled,
  ).length;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <CalendarDays className="size-5 shrink-0 text-primary" aria-hidden />
          <div className="min-w-0">
            <h2 className="font-semibold">Agendas publicadas</h2>
            <p className="text-sm text-muted-foreground">
              Disponibilidade, serviços e prazos são definidos em cada agenda.
            </p>
          </div>
        </div>
        <Badge variant={enabledCount ? "success" : "neutral"}>
          {enabledCount} de {activeSchedules.length}
        </Badge>
      </CardHeader>
      <CardContent className="py-4">
        {activeSchedules.length ? (
          <div className="divide-y divide-border rounded-lg border border-border">
            {activeSchedules.map((schedule) => (
              <div
                key={schedule.id}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {schedule.name}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {schedule.onlineEnabled
                      ? "Disponível no portal público"
                      : "Não publicada no portal"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge
                    variant={schedule.onlineEnabled ? "success" : "neutral"}
                  >
                    {schedule.onlineEnabled ? "Publicada" : "Desativada"}
                  </Badge>
                  <Button asChild variant="secondary" size="sm">
                    <Link href={`/configuracoes/agenda?agenda=${schedule.id}`}>
                      Configurar
                    </Link>
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="rounded-md border border-dashed border-border px-4 py-5 text-center text-sm text-muted-foreground">
            Nenhuma agenda ativa foi cadastrada.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function PublicBookingAccessCard({
  publicPath,
  enabled,
}: {
  publicPath: string;
  enabled: boolean;
}) {
  const [copied, setCopied] = useState(false);

  async function copyPublicLink() {
    const absoluteUrl = new URL(publicPath, window.location.origin).toString();
    try {
      await copyText(absoluteUrl);
      setCopied(true);
      toast.success("Link público copiado.");
      window.setTimeout(() => setCopied(false), 2_000);
    } catch {
      toast.error("Não foi possível copiar o link neste navegador.");
    }
  }

  return (
    <Card className="border-primary/25 bg-primary-muted/30">
      <CardContent className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-md bg-primary text-primary-foreground shadow-[var(--shadow-soft)]">
            <Link2 className="size-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-semibold">Página pública de agendamento</h2>
              <Badge variant={enabled ? "success" : "neutral"}>
                {enabled ? "Publicada" : "Desativada"}
              </Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Compartilhe este endereço para pacientes solicitarem horários.
            </p>
            <code className="mt-2 block max-w-full break-all rounded-md border border-border bg-card px-3 py-2 text-sm text-secondary-foreground">
              {publicPath}
            </code>
            {!enabled ? (
              <p className="mt-2 text-xs text-muted-foreground">
                Ative e salve o agendamento online antes de compartilhar o link.
              </p>
            ) : null}
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2 sm:pl-[3.25rem] lg:pl-0">
          <Button type="button" variant="secondary" onClick={copyPublicLink}>
            {copied ? (
              <Check className="size-4" aria-hidden="true" />
            ) : (
              <Copy className="size-4" aria-hidden="true" />
            )}
            {copied ? "Copiado" : "Copiar link"}
          </Button>
          {enabled ? (
            <Button asChild>
              <a href={publicPath} target="_blank" rel="noreferrer">
                <ExternalLink className="size-4" aria-hidden="true" />
                Abrir página
              </a>
            </Button>
          ) : (
            <Button type="button" disabled>
              <ExternalLink className="size-4" aria-hidden="true" />
              Abrir página
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

async function copyText(value: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  if (!copied) throw new Error("copy_failed");
}

function SectionTitle({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="border-t border-border pt-4">
      <h3 className="text-sm font-semibold">{title}</h3>
      <p className="mt-1 text-xs text-muted-foreground">{description}</p>
    </div>
  );
}

function CheckboxGrid({
  title,
  name,
  options,
  selected,
}: {
  title: string;
  name: string;
  options: Array<{ id: string; name: string }>;
  selected: string[];
}) {
  return (
    <fieldset className="grid gap-2 rounded-md border border-border bg-muted/20 p-3 md:col-span-3">
      <legend className="px-1 text-sm font-semibold">{title}</legend>
      {options.length ? (
        <div className="grid gap-2 md:grid-cols-2">
          {options.map((option) => (
            <label
              key={option.id}
              className="flex items-center gap-2 text-sm text-secondary-foreground"
            >
              <input
                type="checkbox"
                name={name}
                value={option.id}
                defaultChecked={selected.includes(option.id)}
                className="size-4 rounded border-border accent-primary"
              />
              <span>{option.name}</span>
            </label>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Nenhum cadastro ativo encontrado.
        </p>
      )}
    </fieldset>
  );
}

function ReviewsSettings({
  reviews,
}: {
  reviews: OnlineBookingProfileData["reviews"];
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <MessageSquare className="size-4 text-primary" aria-hidden="true" />
          <h2 className="font-semibold">Avaliacoes publicas</h2>
          <Badge variant="neutral">{reviews.length}</Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          Cadastre depoimentos verificados e responda como clinica/profissional.
        </p>
      </CardHeader>
      <CardContent className="grid gap-5">
        <CreateReviewForm />
        <div className="grid gap-3">
          {reviews.length ? (
            reviews.map((review) => (
              <ReviewResponseForm key={review.id} review={review} />
            ))
          ) : (
            <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
              Nenhuma avaliacao cadastrada ainda.
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function CreateReviewForm() {
  const [state, action, pending] = useActionState(
    createOnlineBookingReview,
    initialState,
  );

  useEffect(() => {
    if (state.success) toast.success(state.success);
    if (state.error) toast.error(state.error);
  }, [state]);

  return (
    <form
      action={action}
      className="grid gap-3 rounded-md border border-border bg-muted/20 p-4 md:grid-cols-3"
    >
      <label className="grid gap-2 text-sm font-medium">
        Nome exibido
        <Input name="patient_display_name" required />
      </label>
      <label className="grid gap-2 text-sm font-medium">
        Nota
        <Input name="rating" type="number" min="1" max="5" defaultValue={5} />
      </label>
      <label className="grid gap-2 text-sm font-medium">
        Data
        <DatePickerInput
          name="review_date"
          defaultValue={new Date().toISOString().slice(0, 10)}
          ariaLabel="Data da avaliação"
          panelAlign="end"
          required
        />
      </label>
      <label className="grid gap-2 text-sm font-medium">
        Titulo
        <Input name="title" placeholder="Destaque, atendimento..." />
      </label>
      <label className="grid gap-2 text-sm font-medium">
        Origem
        <Input name="source_label" placeholder="Consulta verificada" />
      </label>
      <label className="grid gap-2 text-sm font-medium">
        Tags mencionadas
        <Input name="tags" placeholder="Atencioso, explicacoes detalhadas" />
      </label>
      <label className="grid gap-2 text-sm font-medium md:col-span-3">
        Depoimento
        <Textarea name="body" className="min-h-28" required />
      </label>
      <label className="grid gap-2 text-sm font-medium md:col-span-3">
        Resposta publica
        <Textarea name="professional_response" />
      </label>
      <div className="flex flex-wrap items-center gap-4 md:col-span-2">
        <Checkbox name="highlighted" label="Marcar como destaque" />
        <input type="hidden" name="active" value="on" />
      </div>
      <div className="flex justify-end md:col-span-1">
        <Button type="submit" disabled={pending}>
          {pending ? "Salvando..." : "Cadastrar avaliacao"}
        </Button>
      </div>
    </form>
  );
}

function ReviewResponseForm({
  review,
}: {
  review: OnlineBookingProfileData["reviews"][number];
}) {
  const [state, action, pending] = useActionState(
    updateOnlineBookingReview.bind(null, review.id),
    initialState,
  );

  useEffect(() => {
    if (state.success) toast.success(state.success);
    if (state.error) toast.error(state.error);
  }, [state]);

  return (
    <form
      action={action}
      className="grid gap-3 rounded-md border border-border bg-card p-4"
    >
      <div className="flex flex-col justify-between gap-2 md:flex-row md:items-start">
        <div>
          <div className="flex items-center gap-2">
            <p className="font-semibold">{review.patient_display_name}</p>
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-primary">
              <Star className="size-3.5 fill-current" aria-hidden="true" />
              {review.rating}
            </span>
            {review.highlighted ? (
              <Badge variant="primary">Destaque</Badge>
            ) : null}
            {!review.active ? <Badge variant="neutral">Oculta</Badge> : null}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {review.review_date}
            {review.source_label ? ` - ${review.source_label}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Checkbox
            name="highlighted"
            label="Destaque"
            defaultChecked={review.highlighted}
          />
          <Checkbox
            name="active"
            label="Publicar"
            defaultChecked={review.active}
          />
        </div>
      </div>
      {review.title ? (
        <p className="text-sm font-semibold">{review.title}</p>
      ) : null}
      <p className="whitespace-pre-wrap text-sm text-secondary-foreground">
        {review.body}
      </p>
      {review.tags.length ? (
        <div className="flex flex-wrap gap-2">
          {review.tags.map((tag) => (
            <Badge key={tag} variant="success">
              {tag}
            </Badge>
          ))}
        </div>
      ) : null}
      <label className="grid gap-2 text-sm font-medium">
        Resposta publica
        <Textarea
          name="professional_response"
          defaultValue={review.professional_response ?? ""}
        />
      </label>
      <div className="flex justify-end">
        <Button type="submit" variant="secondary" disabled={pending}>
          {pending ? "Salvando..." : "Salvar resposta"}
        </Button>
      </div>
    </form>
  );
}
