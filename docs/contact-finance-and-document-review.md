# Contatos, detalhes financeiros e documentos

Revisão de código em 27/09/2026, orientada pela skill `emil-design-eng`.

## Implementado: conversas e financeiro

| Antes                                                                          | Depois                                                                                                         | Motivo                                                                                       |
| ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Estado vazio da conversa com cartão arredondado junto da fila reta             | Superfície contínua, igual à conversa aberta                                                                   | Evitar bordas sobrepostas e recortes inconsistentes                                          |
| Abas do contato com rótulos e rolagem horizontal                               | Quatro ícones distribuídos na largura disponível, com nomes acessíveis, tooltip nativo e navegação por teclado | Manter todas as abas disponíveis no painel estreito                                          |
| Contato permitia somente vincular paciente existente                           | Ação “Criar paciente com este contato”, com nome e telefone preenchidos e e-mail opcional                      | Cadastrar e seguir para agendamento sem abandonar a conversa                                 |
| Vínculo automático comparava apenas os últimos oito dígitos                    | Comparação preserva DDD; normaliza DDI brasileiro e variação do nono dígito; exige candidato único na clínica  | Evitar associação entre números de regiões diferentes e cadastros com telefone compartilhado |
| Contatos antigos sem vínculo não eram reavaliados no upsert com mesmo telefone | Próxima mensagem tenta novamente; desvínculo manual é preservado                                               | Corrigir lacunas sem desfazer decisão explícita do usuário                                   |
| Lançamentos no paciente apenas exibiam valores                                 | Clicar abre detalhes atualizados, recebimentos, saldo e ações permitidas                                       | Consultar e registrar recebimento no contexto do paciente                                    |
| Listas financeiras sem abertura de detalhes                                    | Mesmo componente nas contas a receber, pagamentos, contas a pagar e repasses                                   | Compartilhar comportamento e formulários de baixa                                            |

### Banco e operação

- Aplicar `supabase/migrations/20260927120000_contact_patient_identity.sql` antes de usar o novo cadastro/vínculo em um ambiente publicado.
- A migration foi testada em PostgreSQL isolado (PGlite), com as funções e políticas das migrations e fixtures mínimas. Não foi aplicada ao banco da clínica nesta revisão.
- Ela recria os índices de expressão porque a normalização de telefone mudou, e reavalia contatos sem vínculo. Vínculos já existentes são preservados.
- Nome e telefone são aproveitados do contato; as autorizações de comunicação do paciente continuam com seus valores padrão. Cadastrar um paciente não registra consentimento automaticamente.
- A criação usa transação, bloqueio por número e contato, e retorno idempotente para o mesmo contato. Havendo paciente com o número, exige vínculo explícito em vez de duplicar.
- Detalhes financeiros carregam no servidor com escopo de organização e permissões, além de RLS. Acesso a repasse próprio também filtra o profissional efetivo em sessões de suporte.
- Os recebimentos exibem até 100 registros recentes, com indicação do total se houver mais. A baixa atualiza também o perfil do paciente.
- Esta etapa não converteu indicadores agregados de gráficos em lançamentos individuais: os modais abrem registros identificáveis por ID.

### Verificação

- `npm run test`: 144 testes passaram, incluindo dez novos cenários de autorização e detalhes financeiros.
- `scripts/test-contact-patient-identity.mjs`: 20 verificações PostgreSQL passaram (DDD, nono dígito, ambiguidade, organização, RLS, desvínculo, nova tentativa, duplicidade, permissões e idempotência).
- Nenhuma validação visual no navegador foi realizada nesta etapa.

Para executar novamente os testes PostgreSQL sem acessar dados reais, instale `@electric-sql/pglite` em um diretório temporário e defina `PGLITE_MODULE_PATH` com o caminho absoluto de `node_modules/@electric-sql/pglite/dist/index.js`. Depois execute `node scripts/test-contact-patient-identity.mjs`.

## Avaliação dos tipos de documento

### Situação inicial

Antes desta implementação, havia quatro tipos: prescrição, solicitação de exame, atestado e declaração de comparecimento, repetidos nos seletores, validações das ações e restrições no banco.

Os modelos permitem personalizar título, texto, variáveis e layout, com versionamento. A emissão está associada a um atendimento e usa as permissões de prescrever, solicitar exame ou emitir atestado. A declaração de comparecimento atualmente compartilha a permissão de atestado.

O PDF possui uma área gráfica para assinatura, nome e registro profissional. O gerador revisado não executa assinatura criptográfica. Esses recursos não equivalem a um fluxo de assinatura eletrônica.

Os quatro tipos atendem um núcleo inicial, mas não representam todas as necessidades de uma clínica. O CFM também distingue relatórios, laudos e sumário de alta, entre outros documentos: [resumo oficial da Resolução CFM 2.381/2024](https://portal.cfm.org.br/noticias/cfm-atualiza-resolucao-que-regulamenta-emissao-de-atestado-medico).

### Implementado: novos documentos e consentimento

| Antes                                  | Depois                                                                                                       |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Quatro tipos de documento              | Oito tipos em catálogo compartilhado entre emissão, modelos, histórico e PDF                                 |
| Encaminhamento sem fluxo próprio       | Destino/especialidade e motivo obrigatórios, conteúdo editável e PDF                                         |
| Relatório sem classificação própria    | Finalidade obrigatória e modelo de conteúdo para histórico, avaliação e conclusão                            |
| Orientações apenas como texto genérico | Tipo próprio, identificação do cuidado e modelos de instruções                                               |
| Consentimento apenas recomendado       | Preparação, apresentação do texto integral, identificação e assinatura presencial de paciente ou responsável |
| Sem situação do consentimento          | Aguardando assinatura, assinado, cancelado ou revogado, consultáveis no prontuário e perfil do paciente      |

- A emissão permanece associada ao atendimento e congela a versão do modelo e os dados usados na apresentação. Os campos específicos são obrigatórios tanto no servidor quanto no banco.
- Consentimentos exigem documento de identificação, confirmação explícita de leitura e assinatura desenhada ou nome digitado. Responsáveis informam o vínculo com o paciente. O nome de quem assina como paciente precisa corresponder ao nome preservado no termo.
- O desenho mantém a proporção entre coleta, consulta e PDF. Existe alternativa por nome digitado para uso por teclado.
- O banco controla as transições, registra data, usuário efetivo, ator de suporte e hash do conteúdo. Assinatura repetida é bloqueada; cancelamento e revogação exigem motivo e preservam o histórico.
- O PDF indica o estado atual e inclui uma folha com a evidência da assinatura. É coleta presencial no dispositivo, sem certificado digital e sem envio de link remoto para assinatura.
- Permissões: `clinico.emitir_documento` e `clinico.gerenciar_consentimento`, respeitando o escopo de prontuário próprio, organização e usuário efetivo em suporte. Perfis que já emitem atestados recebem as novas permissões na migration e podem ser ajustados na configuração de acessos.
- Para disponibilizar em um ambiente publicado, aplicar `supabase/migrations/20260927160000_extended_documents_and_consent.sql` junto desta versão da aplicação. A migration foi executada apenas em PostgreSQL isolado; o banco da clínica não foi alterado nesta etapa.

Verificação: 159 testes da aplicação e 26 verificações PostgreSQL passaram, além de lint, TypeScript e build. Os testes de banco usam as funções de emissão, versionamento e contexto efetivo das migrations existentes, junto da nova migration. Com `PGLITE_MODULE_PATH` configurado, execute `node scripts/test-clinical-documents.mjs`.

Os PDFs dos quatro novos tipos foram gerados com dados fictícios e renderizados para inspeção. A paginação de motivos extensos e as duas formas de assinatura têm testes. A interface não foi validada no navegador nesta etapa.

### Implementado: espaço de texto e paginação

- Decisão do produto: permitir várias páginas, com aviso no editor, sem bloquear a emissão por ultrapassar uma folha.
- A prévia do editor de modelos foi substituída pelo PDF gerado pelo mesmo código usado no download. Todas as páginas aparecem, com numeração e identificação das quebras; existe também abertura ampliada.
- O campo de texto mostra quantidade de páginas, contador de caracteres, ocupação da primeira página e estimativa de linhas restantes. O cálculo usa as métricas reais da fonte e considera título, papel, dados do paciente, campos específicos, cabeçalho, rodapé e assinatura.
- Alterações no layout recalculam o espaço. O limite técnico de edição continua em 30.000 caracteres; ele não representa a capacidade de uma folha.
- O prontuário usa os dados reais do atendimento para o mesmo cálculo, antes da emissão. Nos modelos, a interface informa que os exemplos e as variáveis podem resultar em outra paginação quando substituídos.
- A assinatura profissional é preservada como bloco. Se precisar de uma página própria, o editor avisa. A folha de evidências de consentimento aparece separadamente na contagem.
- A geração aguarda uma pequena pausa na digitação, mantém o resultado anterior visível durante a atualização e descarta respostas antigas. Páginas distantes da área visível não mantêm canvas renderizado.
- Verificação: 173 testes passaram, incluindo 14 cenários de paginação, margem, texto longo, variáveis, largura de palavras, capacidade da primeira página e paridade entre prévia e download nos oito tipos. TypeScript, lint e build passaram; um PDF de três páginas foi renderizado e inspecionado visualmente. Não houve teste da interface no navegador nem alteração adicional no banco.

### Outras expansões possíveis

| Prioridade               | Tipo                       | Comportamento proposto                                                                                    |
| ------------------------ | -------------------------- | --------------------------------------------------------------------------------------------------------- |
| Conforme o serviço       | Laudo                      | Resultado e conclusão vinculados ao exame ou procedimento; requisitos próprios da especialidade           |
| Conforme o serviço       | Sumário de alta            | Síntese do episódio e plano de continuidade quando houver esse fluxo assistencial                         |
| Administrativo           | Declarações e autorizações | Permissões e campos próprios; separar comparecimento de documento que recomenda afastamento               |
| Flexibilidade controlada | Documento personalizado    | Permissão explícita, finalidade e modelo; sem classificar automaticamente como receita, atestado ou laudo |

Receitas sujeitas a controle especial precisam de um projeto específico de prescrição e integração. Os requisitos e a implementação do SNCR devem ser verificados na etapa de desenvolvimento: [orientação atual da Anvisa](https://www.gov.br/anvisa/pt-br/assuntos/noticias-anvisa/2026/inicio-de-nova-etapa-do-sncr-o-que-muda-a-partir-de-30-de-setembro). Criar um modelo de texto não implementa esse processo.

### Organização sugerida na interface

1. Escolher o tipo de documento pela finalidade.
2. Escolher um modelo da clínica, opcional nos tipos que permitem texto livre.
3. Preencher apenas os campos daquele tipo e conferir dados do paciente/profissional.
4. Revisar e emitir; exibir assinatura e situação de entrega de acordo com as capacidades efetivamente implementadas.
5. Consultar no histórico do paciente, filtrando por tipo, data e situação.

A ficha de atendimento continua como registro clínico do episódio. Documentos emitidos, anexos recebidos e consentimentos têm ciclos próprios e permanecem identificáveis no prontuário. O catálogo de tipos está centralizado em `apps/web/src/lib/clinical/document-types.ts`.
