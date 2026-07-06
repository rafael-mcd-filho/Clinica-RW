# Criterios de Aceite do MVP

## Criterios globais

- A aplicacao sobe localmente com instrucoes documentadas.
- Lint, typecheck, testes e build rodam por script unico.
- Todas as tabelas sensiveis multi-tenant possuem `organization_id` e RLS.
- Testes automatizados validam isolamento entre ao menos dois tenants.
- Acesso a conteudo clinico exige permissao explicita.
- Acoes sensiveis geram `audit_logs`.
- Fluxos principais funcionam em desktop e tablet; mobile deve ser utilizavel para consultas e agenda basica.
- Dados financeiros e clinicos nao aparecem em logs tecnicos sem mascaramento.
- Falhas de autorizacao retornam 403 e nao vazam existencia de dados de outro tenant.

## Primeiro acesso

- Super admin cria organizacao e admin owner.
- Admin owner consegue acessar o tenant criado.
- Perfis padrao, permissoes iniciais e escopos iniciais sao criados automaticamente.
- Tenant inicia em modo solo quando houver apenas um profissional ativo.

## Configuracoes base

- Admin configura dados da clinica, unidade, sala, profissional, procedimento e horario.
- Profissional solo consegue operar sem etapas obrigatorias de clinica multiprofissional.
- Adicionar segundo profissional muda o tenant para modo clinica de forma controlada.

## Pacientes

- Usuario autorizado cadastra paciente com dados pessoais e contato.
- Consentimento LGPD fica registrado com tipo, versao e data.
- Busca encontra paciente por nome, CPF, telefone ou e-mail.
- Recepcionista nao ve conteudo clinico protegido.
- Profissional autorizado ve dados clinicos dos pacientes dentro do escopo.

## Agenda

- Recepcionista cria, edita, reagenda e cancela consulta dentro do escopo.
- Sistema impede conflito de horario para o mesmo profissional/sala.
- Check-in e check-out alteram status e registram historico.
- Medico ve proximos pacientes da propria agenda.
- Mudancas de status geram eventos consistentes.

## Atendimento e prontuario

- Medico abre atendimento a partir da agenda ou da ficha do paciente.
- Atendimento pode ser salvo como rascunho.
- Finalizacao torna o registro imutavel.
- Atendimento finalizado aceita apenas adendo.
- Template usado no atendimento fica salvo como snapshot.
- Recepcionista nao acessa conteudo do prontuario.

## Documentos clinicos

- Prescricao simples, solicitacao de exame, atestado e declaracao podem ser emitidos.
- Documento fica vinculado a paciente, profissional e atendimento.
- PDF gerado identifica paciente, profissional, clinica, data e tipo do documento.
- Historico de documentos aparece na ficha do paciente.

## Financeiro

- Consulta particular pode gerar conta a receber.
- Usuario autorizado registra pagamento com forma de pagamento e data.
- Admin ve recebimentos e pendencias.
- Profissional ve apenas repasse proprio quando permitido.
- Alteracoes financeiras geram auditoria.

## Piloto

- Uma clinica parceira consegue completar configuracao inicial.
- Uma recepcionista consegue operar um dia de agenda.
- Um profissional consegue atender e finalizar prontuario.
- Um pagamento de consulta pode ser registrado.
- Ao menos um documento clinico pode ser emitido em PDF.
