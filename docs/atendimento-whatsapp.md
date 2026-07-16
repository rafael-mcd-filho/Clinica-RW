# Módulo de Atendimento (WhatsApp via Evolution API)

Inbox de atendimento com CRM integrado ao Hi Clinic. Conversas em tempo real,
etiquetas (reuso das `tags`), vínculo com paciente, reservas do agendamento
online e rascunho de resposta por IA (Claude) no modelo híbrido (a IA sugere, o
humano aprova e envia).

## Arquitetura

```
Evolution API (instância por clínica)
   │  webhook (MESSAGES_UPSERT / MESSAGES_UPDATE / CONNECTION_UPDATE)
   ▼
POST /api/whatsapp/webhook   → lib/whatsapp/ingest.ts (service role)
   ▼
Supabase (whatsapp_*)  ── Realtime ──▶  inbox (attendance-inbox.tsx)
   ▲
   └── envio: server action sendMessageAction → Evolution /message/sendText
```

- **Multi-tenant:** cada `whatsapp_instances` aponta para uma organização; o
  webhook resolve a org pelo `evolution_instance_name` e grava com o service
  role (fora da RLS). O dashboard lê/escreve sob RLS (`atendimento.*`).
- **Realtime:** `whatsapp_messages`, `whatsapp_conversations` e
  `whatsapp_instances` estão na publication `supabase_realtime`.

## Recursos de CRM no inbox

- **Iniciar atendimento** — conversa pendente exibe um banner; o clique assume
  a conversa (RPC `claim_whatsapp_conversation`, à prova de corrida).
- **Transferência** — menu no cabeçalho da thread transfere a conversa para
  outro atendente ativo da organização.
- **Notas internas** — aba "Nota interna" no compositor grava uma
  `whatsapp_message` com `message_type = 'note'` (âmbar, nunca enviada ao
  WhatsApp, fora do preview e da sugestão de IA). Requer a migração
  `20260716000000_whatsapp_internal_notes.sql`.
- **Assinatura** — checkbox "Assinar como <nome>" prefixa `*Nome:*` na
  mensagem (preferência salva por navegador).
- **Vínculo de paciente** — o painel do contato busca pacientes
  (`/api/patients/search`) e vincula/desvincula o contato.
- **Próximos agendamentos** — o painel mostra os 3 próximos agendamentos do
  paciente vinculado, além das reservas do agendamento online.
- **Separadores de dia** — a thread agrupa mensagens por dia (Hoje/Ontem/data).

## Configuração pelo painel

Administradores com `atendimento.configurar` podem acessar
**Configurações → WhatsApp** para informar a URL da Evolution, o nome da
instância e a API key. A tela valida as credenciais, mostra o estado da conexão,
inicia o pareamento por QR Code/código e registra o webhook automaticamente.

A API key e o segredo do webhook são criptografados com AES-256-GCM antes de
serem gravados. O servidor precisa ter `WHATSAPP_CREDENTIALS_ENCRYPTION_KEY`;
essa chave mestra nunca deve ser exposta no navegador ou trocada sem um processo
de recriptografia das credenciais existentes.

Se a instância já tiver outro webhook, o painel exibe a URL atual e exige uma
confirmação explícita antes de substituí-la.

## Passo a passo manual (alternativo)

### 1. Aplicar a migração

A migração `supabase/migrations/20260714000000_phase13_whatsapp_attendance.sql`
cria as tabelas, RLS, Realtime e as permissões. Aplique no seu Supabase
(ex.: `supabase db push`, ou seu pipeline). Ela **não foi aplicada
automaticamente** — é alteração de schema no banco de produção.

### 2. Variáveis de ambiente (em `apps/web/.env.local`, nunca commite)

```
EVOLUTION_API_URL=https://sua-evolution.exemplo.com
EVOLUTION_API_KEY=<sua api key da Evolution>
EVOLUTION_INSTANCE=<nome da instância>
WHATSAPP_WEBHOOK_SECRET=<um segredo que você inventa>
ANTHROPIC_API_KEY=<sua chave da Anthropic, para a sugestão de IA>
```

> Se a API key da Evolution já circulou em algum lugar (chat, e-mail),
> rotacione-a na Evolution e use a nova aqui.

### 3. Cadastrar a instância no banco

Insira uma linha em `whatsapp_instances` com o `organization_id` da clínica e o
`evolution_instance_name` igual ao `EVOLUTION_INSTANCE`. Sem isso, o webhook
ignora os eventos (não sabe a qual org pertencem).

### 4. Registrar o webhook na Evolution

Aponte o webhook da instância para:

```
https://SEU_APP/api/whatsapp/webhook
```

com o header `apikey` (ou `x-webhook-secret`) igual ao `WHATSAPP_WEBHOOK_SECRET`.
Eventos: `MESSAGES_UPSERT`, `MESSAGES_UPDATE`, `CONNECTION_UPDATE`.
O helper `setInstanceWebhook()` em `lib/whatsapp/evolution-client.ts` faz esse
registro programaticamente se preferir.

Em desenvolvimento, exponha o app com um túnel (ngrok/cloudflared) para a
Evolution alcançar o webhook.

## Permissões

| Código                   | O que libera                                   |
| ------------------------ | ---------------------------------------------- |
| `atendimento.ver`        | Ver o inbox (leitura)                          |
| `atendimento.atender`    | Responder, atribuir, etiquetar, concluir       |
| `atendimento.configurar` | Conectar número / configurar o canal           |

## Como funciona no dia a dia

- **Abas:** Pendentes · Em atendimento · Concluídos. Uma mensagem nova reabre
  uma conversa concluída.
- **Contatos:** número novo vira um contato; se o telefone bate com um paciente
  existente, vincula automaticamente.
- **IA (híbrido):** o botão **IA** no compositor chama o Claude, que rascunha a
  resposta; o atendente revisa e clica em Enviar.
- **Reservas:** o painel direito mostra as `online_booking_requests` do contato.
- **Opt-out/LGPD:** envio bloqueado se o contato tem opt-out ativo em
  `communication_opt_outs`.

## O que ainda dá para evoluir

- Envio/recebimento de mídia (hoje mídia recebida entra como rótulo; o texto e o
  tipo são guardados, o download do arquivo é um próximo passo).
- Tela de conexão por QR dentro de Configurações (o client já tem
  `connectInstance()`).
- Confirmar/recusar reserva de dentro da conversa (a ação de revisão já existe
  no módulo de agendamento).
