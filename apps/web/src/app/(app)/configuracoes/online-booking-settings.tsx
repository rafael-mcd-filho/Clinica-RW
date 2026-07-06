"use client";

import { useActionState, useEffect } from "react";
import { ExternalLink, Globe2, MessageSquare, Star } from "lucide-react";
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
import { Input, Textarea } from "@/components/ui/field";

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

const initialState: AgendaActionState = {};

export function OnlineBookingSettings({
  settings,
  healthInsurances,
  paymentMethods,
  reviews,
}: {
  settings: OnlineBookingSettingsData | null;
  healthInsurances: OnlineBookingProfileData["healthInsurances"];
  paymentMethods: OnlineBookingProfileData["paymentMethods"];
  reviews: OnlineBookingProfileData["reviews"];
}) {
  const [state, action, pending] = useActionState(
    updateOnlineBookingSettings,
    initialState,
  );

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
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Globe2 className="size-4 text-primary" aria-hidden="true" />
                <h2 className="font-semibold">Agendamento online</h2>
                <Badge variant={settings.enabled ? "success" : "neutral"}>
                  {settings.enabled ? "Ativo" : "Inativo"}
                </Badge>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                Link publico, politicas e limites para solicitacoes externas.
              </p>
            </div>
            <Button asChild variant="secondary" size="sm">
              <a href={publicPath} target="_blank" rel="noreferrer">
                <ExternalLink className="size-4" />
                Abrir link
              </a>
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <form action={action} className="grid gap-4 md:grid-cols-3">
            <div className="md:col-span-3">
              <Checkbox
                name="enabled"
                defaultChecked={settings.enabled}
                label="Permitir solicitacoes pelo link publico"
              />
            </div>
            <div className="md:col-span-3">
              <Checkbox
                name="require_contact_verification"
                defaultChecked={settings.require_contact_verification}
                label="Exigir codigo de verificacao por e-mail ou telefone"
              />
            </div>
            <label className="grid gap-2 text-sm font-medium">
              Link publico
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
              Antecedencia minima (h)
              <Input
                name="min_notice_hours"
                type="number"
                min="0"
                max="720"
                defaultValue={settings.min_notice_hours}
                required
              />
            </label>
            <label className="grid gap-2 text-sm font-medium">
              Janela maxima (dias)
              <Input
                name="max_days_ahead"
                type="number"
                min="1"
                max="365"
                defaultValue={settings.max_days_ahead}
                required
              />
            </label>
            <label className="grid gap-2 text-sm font-medium">
              Aviso para cancelar (h)
              <Input
                name="cancellation_notice_hours"
                type="number"
                min="0"
                max="720"
                defaultValue={settings.cancellation_notice_hours}
                required
              />
            </label>
            <label className="grid gap-2 text-sm font-medium">
              Solicitacoes por contato/dia
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
              Bloquear apos faltas
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
              Validade do codigo (min)
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
              Instrucoes publicas
              <Textarea
                name="public_instructions"
                defaultValue={settings.public_instructions ?? ""}
              />
            </label>
            <label className="grid gap-2 text-sm font-medium md:col-span-3">
              Politica de cancelamento
              <Textarea
                name="cancellation_policy"
                defaultValue={settings.cancellation_policy ?? ""}
              />
            </label>

            <div className="md:col-span-3">
              <SectionTitle
                title="Perfil publico"
                description="Dados exibidos na pagina de agendamento online."
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
                defaultValue={(settings.consultation_formats ?? []).join("\n")}
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
            {state.error ? (
              <p className="text-sm text-destructive md:col-span-3">
                {state.error}
              </p>
            ) : null}
            <div className="flex justify-end md:col-span-3">
              <Button type="submit" disabled={pending}>
                {pending ? "Salvando..." : "Salvar agendamento online"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <ReviewsSettings reviews={reviews} />
    </div>
  );
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
        <Input
          name="review_date"
          type="date"
          defaultValue={new Date().toISOString().slice(0, 10)}
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
              <Star className="size-3 fill-current" aria-hidden="true" />
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
