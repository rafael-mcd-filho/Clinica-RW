-- Rotulos de perfis e permissoes com acentuacao.
--
-- O seed de 20260529134000 gravou descricoes e categorias sem acento
-- ("Clinico", "Relatorios", "Recepcao..."), e a tela de Usuarios e acessos
-- mostra e agrupa exatamente esses textos. Eles sao so rotulos: o codigo da
-- permissao (agenda.ver, ...) e o identificador e nao muda.
--
-- Dos nomes de perfil, so "Tecnico" estava sem acento. Os perfis padrao sao
-- encontrados pelo nome -- cada clinica recebe copias com o mesmo nome do
-- modelo global, e as migrations de permissao casam por profiles.name --, por
-- isso a troca vale para o modelo e para as copias de uma vez. Migrations
-- futuras que concedam permissoes a esse perfil devem usar 'Técnico'.
--
-- Cada alteracao em profiles dispara a checagem de que a clinica mantem um
-- gestor de acessos. Clinicas que ja estejam fora dessa regra ficam como
-- estao, em vez de derrubar a migration inteira.

update public.permissions as permission
set
  category = labels.category,
  description = labels.description
from (
  values
    ('agenda.ver', 'Agenda', 'Visualizar agendas dentro do escopo'),
    ('agenda.criar_agendamento', 'Agenda', 'Criar novo agendamento'),
    ('agenda.editar_agendamento', 'Agenda', 'Editar agendamento existente'),
    ('agenda.cancelar_agendamento', 'Agenda', 'Cancelar agendamento'),
    ('agenda.encaixar', 'Agenda', 'Criar encaixe fora dos horários disponíveis'),
    ('agenda.bloquear_horario', 'Agenda', 'Bloquear horários da agenda'),
    ('agenda.configurar', 'Agenda', 'Alterar configurações da agenda'),
    ('paciente.ver', 'Pacientes', 'Visualizar pacientes dentro do escopo'),
    ('paciente.criar', 'Pacientes', 'Cadastrar paciente'),
    ('paciente.editar', 'Pacientes', 'Editar dados de paciente'),
    ('paciente.excluir', 'Pacientes', 'Excluir paciente (a ficha fica arquivada)'),
    ('paciente.exportar', 'Pacientes', 'Exportar lista de pacientes'),
    ('paciente.ver_dados_sensiveis', 'Pacientes', 'Ver CPF completo, telefone e endereço'),
    ('clinico.ver_prontuario', 'Clínico', 'Acessar prontuário clínico'),
    ('clinico.ver_prontuario_proprios', 'Clínico', 'Acessar apenas prontuários dos próprios pacientes'),
    ('clinico.preencher_prontuario', 'Clínico', 'Criar ou editar atendimento em rascunho'),
    ('clinico.finalizar_prontuario', 'Clínico', 'Finalizar atendimento de forma imutável'),
    ('clinico.adicionar_adendo', 'Clínico', 'Adicionar adendo a atendimento finalizado'),
    ('clinico.prescrever', 'Clínico', 'Emitir prescrição'),
    ('clinico.solicitar_exame', 'Clínico', 'Emitir solicitação de exame'),
    ('clinico.emitir_atestado', 'Clínico', 'Emitir atestado'),
    ('clinico.criar_template', 'Clínico', 'Criar modelos de prontuário'),
    ('financeiro.ver_geral', 'Financeiro', 'Ver financeiro completo'),
    ('financeiro.ver_proprio_repasse', 'Financeiro', 'Ver apenas o próprio repasse'),
    ('financeiro.receber_pagamento', 'Financeiro', 'Registrar recebimento no caixa'),
    ('financeiro.gerenciar_contas_pagar', 'Financeiro', 'Gerenciar contas a pagar'),
    ('financeiro.conciliar', 'Financeiro', 'Executar conciliação bancária'),
    ('financeiro.emitir_nf', 'Financeiro', 'Emitir nota fiscal'),
    ('financeiro.tiss', 'Financeiro', 'Operar faturamento TISS'),
    ('crescimento.ver_campanhas', 'Crescimento', 'Ver campanhas'),
    ('crescimento.criar_campanha', 'Crescimento', 'Criar campanhas'),
    ('crescimento.disparar_campanha', 'Crescimento', 'Executar disparos de campanha'),
    ('automacao.ver', 'Automação', 'Ver automações'),
    ('automacao.criar', 'Automação', 'Criar automações'),
    ('automacao.ativar', 'Automação', 'Ativar ou desativar automações'),
    ('relatorio.operacional', 'Relatórios', 'Acessar relatórios operacionais'),
    ('relatorio.financeiro', 'Relatórios', 'Acessar relatórios financeiros'),
    ('relatorio.clinico', 'Relatórios', 'Acessar relatórios clínicos'),
    ('relatorio.exportar', 'Relatórios', 'Exportar relatórios'),
    ('config.geral', 'Configurações', 'Gerenciar configurações gerais da clínica'),
    ('config.usuarios', 'Configurações', 'Gerenciar usuários, perfis e escopos'),
    ('config.integracoes', 'Configurações', 'Gerenciar integrações'),
    ('config.plano', 'Configurações', 'Visualizar e gerenciar plano e cobrança')
) as labels(code, category, description)
where permission.code = labels.code
  and (
    permission.category is distinct from labels.category
    or permission.description is distinct from labels.description
  );

-- Descricoes dos perfis padrao: so as que ainda tem o texto original.
update public.profiles as profile
set description = labels.new_description
from (
  values
    (
      'Administrador',
      'Acesso administrativo completo da clinica',
      'Acesso administrativo completo da clínica'
    ),
    (
      'Profissional',
      'Profissional de saude com acesso clinico dentro do escopo',
      'Profissional de saúde com acesso clínico dentro do escopo'
    ),
    (
      'Atendente',
      'Recepcao com agenda, pacientes e caixa operacional',
      'Recepção com agenda, pacientes e caixa operacional'
    ),
    (
      'Financeiro',
      'Equipe financeira sem acesso ao conteudo clinico',
      'Equipe financeira sem acesso ao conteúdo clínico'
    ),
    (
      'Tecnico',
      'Tecnico ou auxiliar com acesso operacional clinico limitado',
      'Técnico ou auxiliar com acesso operacional clínico limitado'
    )
) as labels(name, old_description, new_description)
where profile.is_system_default
  and profile.name = labels.name
  and profile.description = labels.old_description
  and (
    profile.organization_id is null
    or app_private.organization_has_access_manager(profile.organization_id)
  );

update public.profiles as profile
set name = 'Técnico'
where profile.is_system_default
  and profile.name = 'Tecnico'
  and not exists (
    select 1
    from public.profiles as other
    where other.name = 'Técnico'
      and other.organization_id is not distinct from profile.organization_id
  )
  and (
    profile.organization_id is null
    or app_private.organization_has_access_manager(profile.organization_id)
  );
