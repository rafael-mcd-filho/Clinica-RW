"use client";

import { useActionState, useState, useTransition } from "react";
import Image from "next/image";
import { CheckCircle2, KeyRound, Loader2, Radio, Webhook } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { connectWhatsApp, registerWhatsAppWebhook, saveWhatsAppConfig, testWhatsAppConnection, type WhatsAppActionState } from "./actions";

type Props = {
  initial: { apiUrl: string; instance: string; hasApiKey: boolean; status: string; webhookUrl: string; configured: boolean };
  suggestedWebhookUrl: string;
};

const initialState: WhatsAppActionState = {};

export function WhatsAppSettings({ initial, suggestedWebhookUrl }: Props) {
  const [saveState, saveAction, saving] = useActionState(saveWhatsAppConfig, initialState);
  const [webhookState, webhookAction, registering] = useActionState(registerWhatsAppWebhook, initialState);
  const [connection, setConnection] = useState<WhatsAppActionState>({ state: initial.status });
  const [pending, startTransition] = useTransition();

  function run(action: () => Promise<WhatsAppActionState>) {
    startTransition(async () => {
      const result = await action();
      setConnection(result);
      if (result.error) toast.error(result.error);
      else if (result.success) toast.success(result.success);
    });
  }

  const qrSource = connection.qrBase64
    ? connection.qrBase64.startsWith("data:") ? connection.qrBase64 : `data:image/png;base64,${connection.qrBase64}`
    : null;

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <section className="rounded-xl border border-border bg-card p-6 shadow-sm xl:col-span-2">
        <div className="mb-5 flex items-start gap-3"><KeyRound className="mt-0.5 size-5 text-primary" /><div><h2 className="font-semibold">Credenciais da Evolution API</h2><p className="text-sm text-muted-foreground">A API key é criptografada no servidor e nunca volta a ser exibida.</p></div></div>
        <form action={saveAction} className="grid gap-4 md:grid-cols-2">
          <Field label="URL da Evolution API"><input name="api_url" type="url" required defaultValue={initial.apiUrl} placeholder="https://evolution.exemplo.com" className={inputClass} /></Field>
          <Field label="Nome da instância"><input name="instance" required defaultValue={initial.instance} placeholder="MinhaClinica" className={inputClass} /></Field>
          <Field label="API key" hint={initial.hasApiKey ? "Deixe vazio para manter a chave salva." : undefined}><input name="api_key" type="password" required={!initial.hasApiKey} autoComplete="new-password" placeholder={initial.hasApiKey ? "••••••••••••••••" : "Cole a chave da Evolution"} className={inputClass} /></Field>
          <div className="flex items-end"><Button type="submit" disabled={saving}>{saving && <Loader2 className="size-4 animate-spin" />}Validar e salvar</Button></div>
          <Feedback state={saveState} />
        </form>
      </section>

      <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <div className="mb-5 flex items-start gap-3"><Radio className="mt-0.5 size-5 text-primary" /><div><h2 className="font-semibold">Conexão do número</h2><p className="text-sm text-muted-foreground">Teste o acesso ou inicie o pareamento pelo WhatsApp.</p></div></div>
        <div className="mb-4 flex items-center gap-2 text-sm"><span className={`size-2.5 rounded-full ${connection.state === "open" || initial.status === "connected" ? "bg-emerald-500" : "bg-amber-500"}`} /><span>Estado: {connection.state ?? initial.status}</span></div>
        <div className="flex flex-wrap gap-2"><Button variant="secondary" disabled={!initial.configured || pending} onClick={() => run(testWhatsAppConnection)}>Testar conexão</Button><Button disabled={!initial.configured || pending} onClick={() => run(connectWhatsApp)}>{pending && <Loader2 className="size-4 animate-spin" />}Conectar WhatsApp</Button></div>
        {qrSource && <div className="mt-5 grid justify-items-center gap-2 rounded-lg bg-white p-4 text-slate-900"><Image unoptimized width={256} height={256} src={qrSource} alt="QR Code para conectar o WhatsApp" className="size-64" /><span className="text-sm">WhatsApp → Aparelhos conectados → Conectar aparelho</span></div>}
        {connection.pairingCode && <div className="mt-4 rounded-lg border border-border p-4 text-center"><span className="text-sm text-muted-foreground">Código de pareamento</span><div className="mt-1 text-2xl font-semibold tracking-widest">{connection.pairingCode}</div></div>}
        <Feedback state={connection} />
      </section>

      <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <div className="mb-5 flex items-start gap-3"><Webhook className="mt-0.5 size-5 text-primary" /><div><h2 className="font-semibold">Webhook</h2><p className="text-sm text-muted-foreground">Recebe mensagens e atualizações da Evolution em tempo real.</p></div></div>
        <form action={webhookAction} className="grid gap-4">
          <Field label="URL pública do webhook"><input name="webhook_url" type="url" required defaultValue={initial.webhookUrl || suggestedWebhookUrl} className={inputClass} /></Field>
          {webhookState.needsConfirmation && <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950"><strong>Webhook atual:</strong> {webhookState.existingWebhook}<label className="mt-3 flex items-center gap-2"><input type="checkbox" name="confirm_replace" value="true" required /> Confirmo que desejo substituir esse webhook.</label></div>}
          <Button type="submit" disabled={!initial.configured || registering} className="w-fit">{registering && <Loader2 className="size-4 animate-spin" />}Registrar webhook</Button>
          <Feedback state={webhookState} />
        </form>
      </section>
    </div>
  );
}

const inputClass = "h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20";
function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) { return <label className="grid gap-1.5 text-sm font-medium"><span>{label}</span>{children}{hint && <span className="text-xs font-normal text-muted-foreground">{hint}</span>}</label>; }
function Feedback({ state }: { state: WhatsAppActionState }) { if (!state.error && !state.success) return null; return <div className={`md:col-span-2 flex items-center gap-2 text-sm ${state.error ? "text-destructive" : "text-emerald-700"}`}>{!state.error && <CheckCircle2 className="size-4" />}{state.error ?? state.success}</div>; }
