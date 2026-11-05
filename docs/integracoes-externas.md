# Integrações que dependem de contrato com terceiros

Itens do Raio-X que só fecham com conta em um provedor externo. Para cada um:
o que já está pronto no sistema, o que falta contratar e onde a integração
entra no código.

## E5. Assinatura digital ICP-Brasil

**Pronto:** todo PDF de receita, atestado, pedido de exame e declaração sai
com QR Code e endereço `/validar/<código>`. Quem recebe o papel confere tipo,
data, profissional com registro no conselho, clínica e iniciais do paciente
(`src/app/validar/[code]/page.tsx`, `src/lib/clinical/document-verification.ts`).
Isso barra documento inventado, mas não prova que o conteúdo não foi alterado.

**Falta:** assinatura com certificado ICP-Brasil em nuvem, que é o que
farmácia e empregador aceitam no validador do ITI (validar.iti.gov.br).

- Provedores de certificado em nuvem (PSC): BirdID (Soluti), VIDaaS (Valid),
  SafeID (Safeweb), NeoID (Serpro), RemoteID (Certisign). Todos usam OAuth do
  médico + API de assinatura de hash (PAdES).
- Contrato: credenciais de aplicação no PSC escolhido; cada médico usa o
  próprio certificado em nuvem.
- Onde entra: depois de `renderClinicalDocumentPdf`
  (`src/lib/pdf/render-clinical-document.ts`), gerar o hash do PDF, pedir a
  assinatura ao PSC com o token do médico e embutir a assinatura PAdES
  (pdf-lib não assina; usar `@signpdf/signpdf` ou o SDK do provedor). Guardar
  o PDF assinado no Storage e servir esse arquivo nas rotas
  `documentos/[id]/pdf` e `d/[token]`.
- Receita de controle especial (RDC Anvisa 1.000/2025) só vale emitida por
  plataforma integrada ao SNCR: ver E6.

## E6. Prescrição com base de medicamentos

**Pronto:** alerta de alergia ao emitir documento (o texto da prescrição é
comparado com as alergias do resumo clínico, `src/lib/clinical/allergy-check.ts`).

**Falta:** base de medicamentos com posologia, interações e receita de
controle especial.

- Caminho recomendado: Memed (gratuita para o médico; a integração exige
  cadastro como parceiro). O widget da Memed abre dentro do prontuário,
  devolve a prescrição pronta e já resolve assinatura ICP e controle
  especial integrado ao SNCR.
- Contrato: chave de parceiro (api-key e secret-key) da Memed; cada médico
  é cadastrado na Memed pelo CPF e CRM.
- Onde entra: botão "Prescrever com Memed" no painel de documentos do
  prontuário (`src/app/(app)/prontuario/[id]/document-panel.tsx`). O token
  do médico é obtido no servidor (server action) e o widget é carregado só
  na página do prontuário. O PDF devolvido vira um `clinical_documents` do
  tipo `prescription` com o arquivo anexado.

## FI3. NFS-e no padrão nacional

**Pronto:** recibo em PDF de cada recebimento
(`src/app/(app)/financeiro/recibos/[id]/pdf/route.ts`) e a permissão
`financeiro.emitir_nf` no catálogo.

**Falta:** emissão da nota a partir do recebimento.

- Desde 1º/01/2026 a NFS-e no padrão nacional é obrigatória para prestador
  pessoa jurídica. Profissional pessoa física usa o Receita Saúde
  (aplicativo da Receita Federal), que não tem API pública.
- Provedores: Focus NFe, NFE.io, PlugNotas (Tecnospeed), eNotas. Todos
  emitem pelo emissor nacional e pelos municípios que ainda não migraram.
- Contrato: conta no provedor, certificado digital A1 da clínica (CNPJ),
  inscrição municipal e regime tributário cadastrados no provedor.
- Onde entra: ação "Emitir NFS-e" no detalhe do recebimento
  (`src/components/finance/financial-record-details.tsx`), restrita a
  `financeiro.emitir_nf`, chamando o provedor numa server action e
  guardando número, link do PDF/XML e situação num registro ligado ao
  pagamento (tabela nova `service_invoices`). O retorno assíncrono do
  provedor chega por webhook (`/api/nfse/webhook`, com segredo próprio).

## FI4. Pix com baixa automática e link de cartão

**Pronto:** chave Pix na forma de pagamento e "Cobrar por Pix" em cada conta
a receber, com QR Code e Pix copia e cola no valor exato (BR Code estático,
`src/lib/finance/pix.ts`). O dinheiro cai direto na conta da chave; a baixa
é manual. Migração `20261105180000_payment_method_pix_key.sql`.

**Falta:** Pix dinâmico com baixa automática, link de cartão e sinal no
agendamento online.

- Provedores: Asaas, Mercado Pago, Pagar.me, Efí (Gerencianet), Stripe.
  Asaas e Efí são os mais simples para Pix com webhook.
- Contrato: conta PJ no provedor, chave de API e segredo do webhook.
- Onde entra: trocar o BR Code estático pela cobrança do provedor em
  `src/app/(app)/financeiro/pix-actions.ts` (mesma tela), e criar
  `/api/payments/webhook` que, ao receber "pago", chama a mesma função de
  baixa usada em "Registrar recebimento". O sinal do agendamento online
  entra no fluxo de `src/app/agendar/[slug]`.

## C5. Cobrança recorrente das clínicas (plano e assinatura)

**Pronto:** tela Configurações > Plano e assinatura (permissão
`config.plano`) com o plano contratado, a situação da assinatura, o uso da
clínica (usuários, profissionais, pacientes, agendamentos do mês) e o
contato do suporte para mudar de plano.

**Falta:** cobrança automática da mensalidade e limites por plano.

- Provedores: os mesmos do FI4 (Asaas, Pagar.me, Stripe, Efí), usando a
  assinatura recorrente deles (cartão, Pix automático ou boleto).
- Contrato: conta da plataforma (não da clínica) no provedor.
- Onde entra: ao criar a empresa (`src/app/(app)/empresas/actions.ts`),
  criar o cliente e a assinatura no provedor; um webhook
  (`/api/billing/webhook`) atualiza `organizations.status` (ativa, pagamento
  pendente, suspensa). Os limites por plano (ex.: número de profissionais)
  entram como checagem nas funções do banco que criam esses cadastros.

