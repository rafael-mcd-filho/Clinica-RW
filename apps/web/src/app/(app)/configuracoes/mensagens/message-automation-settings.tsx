"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, Select, Textarea } from "@/components/ui/field";
import { FormError } from "@/components/ui/form-error";
import { Switch } from "@/components/ui/switch";
import type { MessageAutomationRule, MessageTemplateRow } from "../_lib/server";
import { updateMessageAutomation } from "./actions";

/** O que cada evento significa para quem configura. */
const eventCopy: Record<string, { title: string; description: string }> = {
  "appointment.reminder_due": {
    title: "Lembrete de consulta",
    description:
      "Enviado antes do horário para quem está agendado ou confirmado. É o que mais reduz faltas.",
  },
  "online_booking.requested": {
    title: "Pedido de horário recebido",
    description: "Quando o paciente pede um horário pelo agendamento online.",
  },
  "online_booking.confirmed": {
    title: "Pedido de horário confirmado",
    description: "Quando a clínica confirma o pedido online.",
  },
  "online_booking.rejected": {
    title: "Pedido de horário recusado",
    description: "Quando a clínica não consegue atender o pedido online.",
  },
  "online_booking.cancelled": {
    title: "Agendamento online cancelado",
    description: "Quando o pedido é cancelado pelo paciente ou pela clínica.",
  },
  "online_booking.rescheduled": {
    title: "Agendamento online remarcado",
    description: "Quando o paciente remarca pelo link de acompanhamento.",
  },
  "appointment.completed": {
    title: "Pesquisa de satisfação (NPS)",
    description: "Enviada depois do atendimento concluído.",
  },
  "finance.receivable_due": {
    title: "Lembrete de cobrança",
    description: "Para contas a receber perto do vencimento.",
  },
};

const variableLabels: Record<string, string> = {
  patient_name: "Nome do paciente",
  appointment_start_at: "Data e hora",
  procedure_name: "Procedimento",
  professional_name: "Profissional",
  clinic_name: "Clínica",
  requested_start_at: "Horário pedido",
  request_link: "Link de acompanhamento",
  review_notes: "Observação da clínica",
  nps_link: "Link da pesquisa",
  amount: "Valor",
  due_date: "Vencimento",
};

const sampleValues: Record<string, string> = {
  patient_name: "Maria",
  appointment_start_at: "06/11 às 09:30",
  procedure_name: "Consulta clínica",
  professional_name: "Dra. Helena Prado",
  clinic_name: "Clínica Aurora",
  requested_start_at: "06/11 às 09:30",
  request_link: "https://.../acompanhar",
  review_notes: "",
  nps_link: "https://.../nps",
  amount: "R$ 180,00",
  due_date: "10/11",
};

const hoursOptions = [2, 6, 12, 24, 48];

export function MessageAutomationSettings({
  rules,
  templates,
  available,
}: {
  rules: MessageAutomationRule[];
  templates: MessageTemplateRow[];
  available: boolean;
}) {
  if (!available) {
    return (
      <EmptyState
        title="Não foi possível carregar as mensagens"
        description="Tente atualizar a página em instantes."
      />
    );
  }
  if (!rules.length) {
    return (
      <EmptyState
        title="Nenhuma mensagem automática configurada"
        description="As mensagens padrão são criadas junto com a clínica."
      />
    );
  }
  const ordered = [...rules].sort(
    (a, b) =>
      Number(b.event_type === "appointment.reminder_due") -
        Number(a.event_type === "appointment.reminder_due") ||
      a.name.localeCompare(b.name, "pt-BR"),
  );

  return (
    <div className="grid gap-4">
      {ordered.map((rule) => (
        <RuleCard
          key={rule.id}
          rule={rule}
          template={templates.find(
            (template) =>
              template.template_key === rule.action_config?.template_key &&
              template.channel === "whatsapp",
          )}
        />
      ))}
    </div>
  );
}

function RuleCard({
  rule,
  template,
}: {
  rule: MessageAutomationRule;
  template?: MessageTemplateRow;
}) {
  const [state, action, pending] = useActionState(updateMessageAutomation, {});
  const [active, setActive] = useState(rule.active);
  const [body, setBody] = useState(template?.body_template ?? "");
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const copy = eventCopy[rule.event_type] ?? {
    title: rule.name,
    description: "",
  };
  const isReminder = rule.event_type === "appointment.reminder_due";
  const variables = template?.variable_keys ?? [];
  const preview = body.replace(
    /\{\{\s*([a-z_]+)\s*\}\}/g,
    (_, key: string) => sampleValues[key] ?? `{{${key}}}`,
  );

  useEffect(() => {
    if (state.success) toast.success(state.success);
  }, [state]);

  function insertVariable(key: string) {
    const element = bodyRef.current;
    const token = `{{${key}}}`;
    if (!element) {
      setBody((value) => `${value}${token}`);
      return;
    }
    const start = element.selectionStart ?? body.length;
    const end = element.selectionEnd ?? body.length;
    const next = `${body.slice(0, start)}${token}${body.slice(end)}`;
    setBody(next);
    requestAnimationFrame(() => {
      element.focus();
      element.setSelectionRange(start + token.length, start + token.length);
    });
  }

  return (
    <Card>
      <form action={action}>
        <input type="hidden" name="rule_id" value={rule.id} />
        <input type="hidden" name="template_id" value={template?.id ?? ""} />
        <input type="hidden" name="active" value={active ? "on" : "off"} />
        <CardHeader className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="font-semibold">{copy.title}</h2>
              <Badge variant={active ? "success" : "neutral"}>
                {active ? "Ligado" : "Desligado"}
              </Badge>
            </div>
            {copy.description ? (
              <p className="mt-1 text-body-sm text-muted-foreground">
                {copy.description}
              </p>
            ) : null}
          </div>
          <Switch
            checked={active}
            onCheckedChange={setActive}
            label={active ? "Ligado" : "Desligado"}
          />
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-3">
            {isReminder ? (
              <label className="grid gap-1.5 text-label font-medium">
                Enviar antes do horário
                <Select
                  name="hours_before"
                  defaultValue={String(
                    Number(rule.action_config?.hours_before ?? 24),
                  )}
                  aria-label="Antecedência do lembrete"
                >
                  {hoursOptions.map((hours) => (
                    <option key={hours} value={String(hours)}>
                      {hours} horas
                    </option>
                  ))}
                </Select>
              </label>
            ) : null}
            <label className="grid gap-1.5 text-label font-medium">
              Enviar a partir de
              <Input
                type="time"
                name="window_start"
                defaultValue={rule.send_window_start?.slice(0, 5) ?? ""}
              />
            </label>
            <label className="grid gap-1.5 text-label font-medium">
              Enviar até
              <Input
                type="time"
                name="window_end"
                defaultValue={rule.send_window_end?.slice(0, 5) ?? ""}
              />
            </label>
          </div>

          {template ? (
            <div className="grid gap-3 lg:grid-cols-2">
              <label className="grid content-start gap-1.5 text-label font-medium">
                Texto da mensagem
                <Textarea
                  ref={bodyRef}
                  name="body"
                  value={body}
                  maxLength={1000}
                  className="min-h-32"
                  onChange={(event) => setBody(event.target.value)}
                />
                {variables.length ? (
                  <span className="flex flex-wrap gap-1.5 font-normal">
                    {variables.map((key) => (
                      <Button
                        key={key}
                        type="button"
                        size="sm"
                        variant="secondary"
                        className="h-7 px-2 text-caption"
                        onClick={() => insertVariable(key)}
                      >
                        + {variableLabels[key] ?? key}
                      </Button>
                    ))}
                  </span>
                ) : null}
              </label>
              <div className="grid content-start gap-1.5">
                <span className="text-label font-medium">
                  Como o paciente vê
                </span>
                <p className="whitespace-pre-line rounded-lg border border-border bg-success-muted/40 px-3 py-2.5 text-body-sm text-foreground">
                  {preview || "—"}
                </p>
              </div>
            </div>
          ) : null}

          <FormError message={state.error} />
          <div className="flex justify-end">
            <Button type="submit" disabled={pending}>
              {pending ? "Salvando..." : "Salvar"}
            </Button>
          </div>
        </CardContent>
      </form>
    </Card>
  );
}
