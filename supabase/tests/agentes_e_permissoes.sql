begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(112);

-- Workspace da empresa Norte: Ana é Administradora, Bruno é Membro e Eva já foi removida. Workspace Sul: Carla é
-- Administradora. Diego não participa de nada. Os Agentes padrão nascem com cada Workspace (gatilho); a configuração de
-- cada um é do Workspace dele, e só Administrador a altera.
insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
                        created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
                        is_sso_user, is_anonymous)
values
  ('60000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'ana@norte.com.br', '', now(), now(), now(), '{}', '{}', false, false),
  ('60000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'bruno@norte.com.br', '', now(), now(), now(), '{}', '{}', false, false),
  ('60000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'carla@sul.com.br', '', now(), now(), now(), '{}', '{}', false, false),
  ('60000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'diego@gmail.com', '', now(), now(), now(), '{}', '{}', false, false),
  ('60000000-0000-0000-0000-000000000005', 'authenticated', 'authenticated', 'eva@norte.com.br', '', now(), now(), now(), '{}', '{}', false, false);

insert into public.workspaces (id, kind, name) values
  ('aaaaaaaa-1300-0000-0000-000000000001', 'empresa', 'Norte'),
  ('aaaaaaaa-1300-0000-0000-000000000002', 'empresa', 'Sul');

insert into public.workspace_memberships (workspace_id, user_id, role, active) values
  ('aaaaaaaa-1300-0000-0000-000000000001', '60000000-0000-0000-0000-000000000001', 'admin', true),
  ('aaaaaaaa-1300-0000-0000-000000000001', '60000000-0000-0000-0000-000000000002', 'member', true),
  ('aaaaaaaa-1300-0000-0000-000000000001', '60000000-0000-0000-0000-000000000005', 'member', false),
  ('aaaaaaaa-1300-0000-0000-000000000002', '60000000-0000-0000-0000-000000000003', 'admin', true);

-- O que o Agente aprende e cria com o uso vem do runtime (CRM-14): aqui entram direto, com privilégio de dono, uma
-- Habilidade do Scopus do Norte (para a cópia do Agente criado), um fato da Memória e um do Sul.
insert into private.agent_skills (workspace_id, agent_id, name, description, uses, last_improved_at, active, uses_document)
select a.workspace_id, a.id, 'Pontuar aderência ao ICP', 'Compara a Conta-alvo com o ICP vigente.', 12, date '2026-09-10', true, 'icp'
from private.agents a where a.workspace_id = 'aaaaaaaa-1300-0000-0000-000000000001' and a.name = 'Scopus';
insert into private.agent_memory_facts (workspace_id, agent_id, content, origin)
select a.workspace_id, a.id, 'O ciclo de venda leva seis meses.', 'Aprendido na Conversa de 12/09/2026'
from private.agents a where a.workspace_id = 'aaaaaaaa-1300-0000-0000-000000000001' and a.name = 'Scopus';
insert into private.agent_memory_facts (workspace_id, agent_id, content, origin)
select a.workspace_id, a.id, 'A Sul vende só no Nordeste.', 'Aprendido na Conversa de 01/09/2026'
from private.agents a where a.workspace_id = 'aaaaaaaa-1300-0000-0000-000000000002' and a.name = 'Scopus';

-- Estrutura: funções security definer com search_path vazio, tabelas com RLS ligado, e só a Conta de usuário autenticada
-- executa as funções.
select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('list_agents', 'get_agent_settings', 'create_agent', 'delete_agent', 'save_agent_settings',
        'list_agent_memory', 'edit_agent_memory_fact', 'delete_agent_memory_fact', 'list_agent_skills',
        'set_agent_skill_active', 'list_agent_routines', 'create_agent_routine', 'update_agent_routine',
        'set_agent_routine_paused', 'delete_agent_routine')
      and p.prosecdef and p.proconfig @> array['search_path=""']),
  15, 'as funções de Agentes são security definer com search_path vazio');
select is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'private' and c.relkind = 'r' and c.relrowsecurity
      and c.relname in ('specialty_catalog', 'integration_catalog', 'specialty_default_permissions', 'agents',
        'agent_settings', 'agent_knowledge_sources', 'agent_permissions', 'agent_memory_facts', 'agent_skills',
        'agent_routines', 'agent_events')),
  11, 'todas as tabelas de Agentes têm RLS ligado');
select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('list_agents', 'create_agent', 'delete_agent', 'save_agent_settings')
      and (has_function_privilege('anon', p.oid, 'execute') or not has_function_privilege('authenticated', p.oid, 'execute'))),
  0, 'só a Conta de usuário autenticada executa as funções de Agentes, nunca anon');
select is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'private' and c.relname like 'agent%'
      and (has_table_privilege('authenticated', c.oid, 'select') or has_table_privilege('anon', c.oid, 'select')
        or has_table_privilege('service_role', c.oid, 'select'))),
  0, 'nenhum papel do app lê as tabelas de Agentes direto: só pelas funções');

-- Cada Workspace nasce com os quatro Agentes padrão, com o nome da Especialidade e as Permissões padrão (ADR-0002).
select is(
  (select string_agg(name || ':' || kind, ', ' order by name) from private.agents
    where workspace_id = 'aaaaaaaa-1300-0000-0000-000000000001'),
  'Ethos:padrao, Oraculum:padrao, Rhetor:padrao, Scopus:padrao', 'o Workspace novo nasce com um Agente padrão por Especialidade');
select is(
  (select count(*)::int from private.agents where workspace_id = 'aaaaaaaa-1300-0000-0000-000000000002'),
  4, 'o outro Workspace também nasce com os quatro');
select is(
  (select string_agg(p.integration_id || '=' || p.permission, ', ' order by p.integration_id)
    from private.agent_permissions p join private.agents a on a.id = p.agent_id
    where a.workspace_id = 'aaaaaaaa-1300-0000-0000-000000000001' and a.name = 'Scopus'),
  'apollo=ler, clay=ler, hubspot=propor, lusha=ler', 'o Scopus começa com Ler, e Propor onde a Integração escreve');
select is(
  (select string_agg(p.integration_id || '=' || p.permission, ', ' order by p.integration_id)
    from private.agent_permissions p join private.agents a on a.id = p.agent_id
    where a.workspace_id = 'aaaaaaaa-1300-0000-0000-000000000001' and a.name = 'Oraculum'),
  'google-ads=propor, notion=propor', 'o Oraculum usa o Notion e o Google Ads, ambos com Propor');
select is(
  (select count(*)::int from private.agent_settings s join private.agents a on a.id = s.agent_id
    where a.workspace_id = 'aaaaaaaa-1300-0000-0000-000000000001' and s.instructions = '' and s.voice_tone = ''),
  4, 'a Personalização dos Agentes padrão começa vazia');

-- Semear de novo não desfaz nada: um Agente padrão que já existe não é tocado.
delete from private.agent_permissions p using private.agents a
  where a.id = p.agent_id and a.workspace_id = 'aaaaaaaa-1300-0000-0000-000000000001' and a.name = 'Scopus' and p.integration_id = 'clay';
select private.seed_default_agents('aaaaaaaa-1300-0000-0000-000000000001');
select is(
  (select string_agg(p.integration_id, ', ' order by p.integration_id)
    from private.agent_permissions p join private.agents a on a.id = p.agent_id
    where a.workspace_id = 'aaaaaaaa-1300-0000-0000-000000000001' and a.name = 'Scopus'),
  'apollo, hubspot, lusha', 'semear de novo não devolve uma Permissão que foi retirada');
select is(
  (select count(*)::int from private.agents where workspace_id = 'aaaaaaaa-1300-0000-0000-000000000001'),
  4, 'semear de novo não duplica os Agentes padrão');
insert into private.agent_permissions (agent_id, workspace_id, integration_id, permission)
select a.id, a.workspace_id, 'clay', 'ler'
from private.agents a where a.workspace_id = 'aaaaaaaa-1300-0000-0000-000000000001' and a.name = 'Scopus';

-- O catálogo é fixo e o Agente não muda de identidade, nem por escrita direta.
select throws_ok(
  $$insert into private.specialty_catalog (specialty, name, position) values ('novo', 'Novo', 5)$$,
  '23514', null, 'o catálogo de Especialidades aceita só as quatro da Althius');
select throws_ok(
  $$insert into private.agents (workspace_id, specialty, kind) values ('aaaaaaaa-1300-0000-0000-000000000001', 'scopus', 'padrao')$$,
  '23505', null, 'um Workspace tem um único Agente padrão por Especialidade');
select throws_ok(
  $$update private.agents set name = 'Outro nome' where workspace_id = 'aaaaaaaa-1300-0000-0000-000000000001' and name = 'Scopus'$$,
  '42501', 'agents cannot be renamed or moved', 'nenhum Agente é renomeado');
select throws_ok(
  $$update private.agents set workspace_id = 'aaaaaaaa-1300-0000-0000-000000000002' where workspace_id = 'aaaaaaaa-1300-0000-0000-000000000001' and name = 'Scopus'$$,
  '42501', 'agents cannot be renamed or moved', 'nenhum Agente muda de Workspace');
select throws_ok(
  $$delete from private.agents where workspace_id = 'aaaaaaaa-1300-0000-0000-000000000001' and name = 'Scopus'$$,
  '42501', 'default agents cannot be deleted', 'o Agente padrão não é excluído nem por escrita direta');

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);

-- Sem sessão, nada.
select throws_ok(
  $$select * from public.list_agents('aaaaaaaa-1300-0000-0000-000000000001')$$,
  '42501', 'authentication required', 'sem sessão não há Agentes para ler');

-- Ana, Administradora do Norte.
select set_config('request.jwt.claim.sub', '60000000-0000-0000-0000-000000000001', true);
select is(
  (select string_agg(name, ', ') from public.list_agents('aaaaaaaa-1300-0000-0000-000000000001')),
  'Scopus, Ethos, Rhetor, Oraculum', 'a grade traz os Agentes padrão na ordem das Especialidades');
select is(
  (select array_to_string(integrations, ',') from public.list_agents('aaaaaaaa-1300-0000-0000-000000000001') where name = 'Ethos'),
  'apollo,hubspot,lusha,notion', 'a grade traz as Integrações em que cada Agente tem Permissão');
select throws_ok(
  $$select * from public.list_agents('aaaaaaaa-1300-0000-0000-000000000002')$$,
  '42501', 'active workspace membership required', 'a Ana não lê os Agentes de um Workspace de que não participa');

-- Criar um Agente a partir de uma Especialidade: primeiro o Agente padrão ganha uma Personalização, que a cópia herda.
select lives_ok(
  $$select public.save_agent_settings(
    (select id from public.list_agents('aaaaaaaa-1300-0000-0000-000000000001') where name = 'Scopus'),
    'Priorize Contas-alvo com time de dados próprio.', 'Analítico e objetivo.', array['slack', 'email', 'slack'],
    '[{"kind":"notion","name":"Playbook de segmentação"},{"kind":"url","name":"norte.com.br/clientes"}]'::jsonb,
    '{"hubspot":"executar","clay":"ler","apollo":"ler","lusha":"propor"}'::jsonb)$$,
  'a Administradora personaliza o Agente padrão');
select is(
  (select instructions || ' | ' || voice_tone || ' | ' || array_to_string(channels, ',')
    from public.get_agent_settings((select id from public.list_agents('aaaaaaaa-1300-0000-0000-000000000001') where name = 'Scopus'))),
  'Priorize Contas-alvo com time de dados próprio. | Analítico e objetivo. | email,slack',
  'a Personalização salva volta na leitura, com os canais sem repetição');
select is(
  (select knowledge::text from public.get_agent_settings((select id from public.list_agents('aaaaaaaa-1300-0000-0000-000000000001') where name = 'Scopus'))
    ) ~ '"name": "Playbook de segmentação".*"name": "norte.com.br/clientes"',
  true, 'a base de conhecimento volta na ordem em que foi salva');

create temporary table agente_criado on commit drop as
  select public.create_agent('aaaaaaaa-1300-0000-0000-000000000001', 'scopus', '  Enterprise LATAM ', 'Só Contas enterprise.') as id;
grant select on agente_criado to authenticated;

select is(
  (select name || ' | ' || kind || ' | ' || complement from public.list_agents('aaaaaaaa-1300-0000-0000-000000000001') where id = (select id from agente_criado)),
  'Scopus · Enterprise LATAM | criado | Enterprise LATAM', 'o Agente criado se chama "Especialidade · complemento"');
select is(
  (select string_agg(name, ', ') from public.list_agents('aaaaaaaa-1300-0000-0000-000000000001')),
  'Scopus, Ethos, Rhetor, Oraculum, Scopus · Enterprise LATAM', 'o Agente criado entra depois dos padrão');
select is(
  (select instructions || ' | ' || voice_tone || ' | ' || array_to_string(channels, ',')
    from public.get_agent_settings((select id from agente_criado))),
  'Só Contas enterprise. | Analítico e objetivo. | email,slack',
  'o Agente criado copia a Personalização do padrão, com as instruções que o formulário trouxe');
select is(
  (select permissions from public.get_agent_settings((select id from agente_criado))),
  '{"hubspot":"executar","clay":"ler","apollo":"ler","lusha":"propor"}'::jsonb,
  'o Agente criado copia as Permissões do padrão');
select is(
  (select jsonb_array_length(knowledge) from public.get_agent_settings((select id from agente_criado))),
  2, 'o Agente criado copia a base de conhecimento do padrão');
select is(
  (select name || ':' || uses || ':' || last_improved_at || ':' || uses_document from public.list_agent_skills((select id from agente_criado))),
  'Pontuar aderência ao ICP:0:2026-09-10:icp', 'o Agente criado copia as Habilidades do padrão, sem os usos dele');
select is(
  (select uses from public.list_agent_skills((select id from public.list_agents('aaaaaaaa-1300-0000-0000-000000000001') where name = 'Scopus'))),
  12, 'as Habilidades do Agente padrão continuam com os usos dele');
select is(
  (select count(*)::int from public.list_agent_memory((select id from agente_criado)))
  + (select count(*)::int from public.list_agent_routines((select id from agente_criado))),
  0, 'o Agente criado começa com a Memória vazia e sem Rotinas');
select is(
  (select instructions from public.list_agents('aaaaaaaa-1300-0000-0000-000000000001') where id = (select id from agente_criado)),
  'Só Contas enterprise.', 'a grade descreve o Agente criado pelas instruções dele');

-- Recusas da criação.
select throws_ok(
  $$select public.create_agent('aaaaaaaa-1300-0000-0000-000000000001', 'scopus', 'enterprise latam', '')$$,
  '23505', 'agent name already exists', 'o nome do Agente é único no Workspace, sem diferença de caixa');
select throws_ok(
  $$select public.create_agent('aaaaaaaa-1300-0000-0000-000000000001', 'especialista', 'Novo', '')$$,
  '22023', 'invalid specialty', 'o Cliente não cria Especialidades');
select throws_ok(
  $$select public.create_agent('aaaaaaaa-1300-0000-0000-000000000001', 'ethos', '   ', '')$$,
  '22023', 'invalid complement', 'o complemento do nome é obrigatório');
select throws_ok(
  $$select public.create_agent('aaaaaaaa-1300-0000-0000-000000000001', 'ethos', repeat('a', 61), '')$$,
  '22023', 'invalid complement', 'o complemento tem no máximo 60 caracteres');
select throws_ok(
  $$select public.create_agent('aaaaaaaa-1300-0000-0000-000000000001', 'ethos', 'Comitê', repeat('a', 4001))$$,
  '22023', 'invalid instructions', 'as instruções têm um tamanho máximo');
select is(
  (select count(*)::int from public.list_agents('aaaaaaaa-1300-0000-0000-000000000001')),
  5, 'as criações recusadas não deixam Agente nenhum');

-- A Personalização do criado e a do padrão são independentes.
select lives_ok(
  $$select public.save_agent_settings((select id from agente_criado), 'Só o México.', 'Direto.', array['email'],
    '[]'::jsonb, '{"hubspot":"ler"}'::jsonb)$$,
  'a Administradora muda a Personalização do Agente criado');
select is(
  (select instructions from public.get_agent_settings(
    (select id from public.list_agents('aaaaaaaa-1300-0000-0000-000000000001') where name = 'Scopus'))),
  'Priorize Contas-alvo com time de dados próprio.', 'mudar o criado não muda as instruções do padrão');
select is(
  (select permissions from public.get_agent_settings(
    (select id from public.list_agents('aaaaaaaa-1300-0000-0000-000000000001') where name = 'Scopus'))),
  '{"hubspot":"executar","clay":"ler","apollo":"ler","lusha":"propor"}'::jsonb,
  'mudar o criado não muda as Permissões do padrão');
select lives_ok(
  $$select public.save_agent_settings(
    (select id from public.list_agents('aaaaaaaa-1300-0000-0000-000000000001') where name = 'Scopus'),
    'Priorize o Sudeste.', '', array[]::text[], '[]'::jsonb, '{"hubspot":"propor"}'::jsonb)$$,
  'a Administradora muda de novo o Agente padrão');
select is(
  (select instructions from public.get_agent_settings((select id from agente_criado))),
  'Só o México.', 'mudar o padrão depois não muda as instruções do Agente criado');
select is(
  (select permissions from public.get_agent_settings((select id from agente_criado))),
  '{"hubspot":"ler"}'::jsonb, 'mudar o padrão depois não muda as Permissões do Agente criado');

-- Recusas da gravação: nada muda.
select throws_ok(
  $$select public.save_agent_settings((select id from agente_criado), 'x', 'x', array['email'], '[]'::jsonb, '{"hubspot":"admin"}'::jsonb)$$,
  '22023', 'invalid permission', 'só existem Ler, Propor e Executar');
select throws_ok(
  $$select public.save_agent_settings((select id from agente_criado), 'x', 'x', array['email'], '[]'::jsonb, '{"kommo":"ler"}'::jsonb)$$,
  '22023', 'unknown integration', 'a Permissão é só de uma Integração do catálogo');
select throws_ok(
  $$select public.save_agent_settings((select id from agente_criado), 'x', 'x', array['email'], '[]'::jsonb, '["hubspot"]'::jsonb)$$,
  '22023', 'invalid permissions', 'as Permissões vêm como um objeto Integração e Permissão');
select throws_ok(
  $$select public.save_agent_settings((select id from agente_criado), 'x', 'x', array['sms'], '[]'::jsonb, '{}'::jsonb)$$,
  '22023', 'invalid channel', 'só existem os quatro canais');
select throws_ok(
  $$select public.save_agent_settings((select id from agente_criado), 'x', 'x', array['email'], '[{"kind":"pdf","name":"a"}]'::jsonb, '{}'::jsonb)$$,
  '22023', 'invalid knowledge', 'a base de conhecimento aceita documento, URL e Notion');
select throws_ok(
  $$select public.save_agent_settings((select id from agente_criado), repeat('a', 4001), 'x', array['email'], '[]'::jsonb, '{}'::jsonb)$$,
  '22023', 'invalid instructions', 'as instruções têm um tamanho máximo também ao salvar');
select is(
  (select instructions || ' | ' || voice_tone || ' | ' || array_to_string(channels, ',') || ' | ' || (permissions ->> 'hubspot')
    from public.get_agent_settings((select id from agente_criado))),
  'Só o México. | Direto. | email | ler', 'uma gravação recusada não muda nada');

-- Bruno, Membro do Norte: consulta tudo, e não altera nada.
select set_config('request.jwt.claim.sub', '60000000-0000-0000-0000-000000000002', true);
select is(
  (select count(*)::int from public.list_agents('aaaaaaaa-1300-0000-0000-000000000001')),
  5, 'o Membro consulta os Agentes do Workspace');
select is(
  (select permissions ->> 'hubspot' from public.get_agent_settings((select id from agente_criado))),
  'ler', 'o Membro consulta a Personalização e as Permissões');
select is(
  (select count(*)::int from public.list_agent_memory(
    (select id from public.list_agents('aaaaaaaa-1300-0000-0000-000000000001') where name = 'Scopus'))),
  1, 'o Membro consulta a Memória');
select throws_ok(
  $$select public.create_agent('aaaaaaaa-1300-0000-0000-000000000001', 'ethos', 'Comitê financeiro', '')$$,
  '42501', 'only administrators can manage agents', 'o Membro não cria Agentes');
select throws_ok(
  $$select public.delete_agent((select id from agente_criado))$$,
  '42501', 'only administrators can manage agents', 'o Membro não exclui Agentes');
select throws_ok(
  $$select public.save_agent_settings((select id from agente_criado), 'x', 'x', array['email'], '[]'::jsonb, '{"hubspot":"executar"}'::jsonb)$$,
  '42501', 'only administrators can manage agents', 'o Membro não muda a Personalização nem as Permissões');
select is(
  (select permissions ->> 'hubspot' from public.get_agent_settings((select id from agente_criado))),
  'ler', 'a Permissão continua como estava depois da tentativa do Membro');
select throws_ok(
  $$select public.edit_agent_memory_fact(
    (select id from public.list_agent_memory((select id from public.list_agents('aaaaaaaa-1300-0000-0000-000000000001') where name = 'Scopus'))), 'x')$$,
  '42501', 'only administrators can manage agents', 'o Membro não edita a Memória');
select throws_ok(
  $$select public.set_agent_skill_active(
    (select id from public.list_agent_skills((select id from agente_criado))), false)$$,
  '42501', 'only administrators can manage agents', 'o Membro não liga nem desliga Habilidades');
select throws_ok(
  $$select public.create_agent_routine((select id from agente_criado), 'Reavaliar', 'diaria', null, '08:00', null)$$,
  '42501', 'only administrators can manage agents', 'o Membro não cria Rotinas');

-- Carla, Administradora do Sul: nenhum acesso aos Agentes do Norte, nem para saber que existem.
select set_config('request.jwt.claim.sub', '60000000-0000-0000-0000-000000000003', true);
select is(
  (select string_agg(name, ', ') from public.list_agents('aaaaaaaa-1300-0000-0000-000000000002')),
  'Scopus, Ethos, Rhetor, Oraculum', 'a Carla vê só os Agentes do Sul');
select throws_ok(
  $$select * from public.list_agents('aaaaaaaa-1300-0000-0000-000000000001')$$,
  '42501', 'active workspace membership required', 'a Carla não lista os Agentes do Norte');
select throws_ok(
  $$select * from public.get_agent_settings((select id from agente_criado))$$,
  'P0002', 'agent not found', 'a Carla não lê a Personalização de um Agente do Norte');
select throws_ok(
  $$select public.save_agent_settings((select id from agente_criado), 'x', 'x', array['email'], '[]'::jsonb, '{"hubspot":"executar"}'::jsonb)$$,
  'P0002', 'agent not found', 'a Administradora do Sul não altera um Agente do Norte');
select throws_ok(
  $$select public.delete_agent((select id from agente_criado))$$,
  'P0002', 'agent not found', 'a Administradora do Sul não exclui um Agente do Norte');
select throws_ok(
  $$select public.create_agent('aaaaaaaa-1300-0000-0000-000000000001', 'ethos', 'Invasor', '')$$,
  '42501', 'active workspace membership required', 'a Administradora do Sul não cria Agente no Norte');
select throws_ok(
  $$select * from public.list_agent_memory((select id from agente_criado))$$,
  'P0002', 'agent not found', 'a Carla não lê a Memória de um Agente do Norte');
select throws_ok(
  $$select public.delete_agent_memory_fact(gen_random_uuid())$$,
  'P0002', 'agent not found', 'um fato que não existe responde como um que a pessoa não vê');

-- Diego não participa de nada, e Eva foi removida do Norte.
select set_config('request.jwt.claim.sub', '60000000-0000-0000-0000-000000000004', true);
select throws_ok(
  $$select * from public.list_agents('aaaaaaaa-1300-0000-0000-000000000001')$$,
  '42501', 'active workspace membership required', 'quem não participa não lê os Agentes');
select set_config('request.jwt.claim.sub', '60000000-0000-0000-0000-000000000005', true);
select throws_ok(
  $$select * from public.list_agents('aaaaaaaa-1300-0000-0000-000000000001')$$,
  '42501', 'active workspace membership required', 'quem foi removido do Workspace perde o acesso aos Agentes');

-- Memória, Habilidades e Rotinas, pela Ana.
select set_config('request.jwt.claim.sub', '60000000-0000-0000-0000-000000000001', true);
select is(
  (select content || ' | ' || origin from public.list_agent_memory(
    (select id from public.list_agents('aaaaaaaa-1300-0000-0000-000000000001') where name = 'Scopus'))),
  'O ciclo de venda leva seis meses. | Aprendido na Conversa de 12/09/2026', 'a Memória mostra o fato e a origem');
select lives_ok(
  $$select public.edit_agent_memory_fact(
    (select id from public.list_agent_memory((select id from public.list_agents('aaaaaaaa-1300-0000-0000-000000000001') where name = 'Scopus'))),
    '  O ciclo de venda leva cinco meses. ')$$,
  'a Administradora corrige um fato');
select is(
  (select content || ' | ' || origin from public.list_agent_memory(
    (select id from public.list_agents('aaaaaaaa-1300-0000-0000-000000000001') where name = 'Scopus'))),
  'O ciclo de venda leva cinco meses. | Aprendido na Conversa de 12/09/2026', 'a correção persiste e a origem continua a do aprendizado');
select throws_ok(
  $$select public.edit_agent_memory_fact(
    (select id from public.list_agent_memory((select id from public.list_agents('aaaaaaaa-1300-0000-0000-000000000001') where name = 'Scopus'))), '   ')$$,
  '22023', 'invalid content', 'um fato não fica vazio');
select lives_ok(
  $$select public.delete_agent_memory_fact(
    (select id from public.list_agent_memory((select id from public.list_agents('aaaaaaaa-1300-0000-0000-000000000001') where name = 'Scopus'))))$$,
  'a Administradora apaga um fato');
select is(
  (select count(*)::int from public.list_agent_memory(
    (select id from public.list_agents('aaaaaaaa-1300-0000-0000-000000000001') where name = 'Scopus'))),
  0, 'o fato apagado não volta');

select lives_ok(
  $$select public.set_agent_skill_active((select id from public.list_agent_skills((select id from agente_criado))), false)$$,
  'a Administradora desliga uma Habilidade do Agente criado');
select is(
  (select active from public.list_agent_skills((select id from agente_criado))),
  false, 'a Habilidade desligada continua desligada');
select is(
  (select active from public.list_agent_skills((select id from public.list_agents('aaaaaaaa-1300-0000-0000-000000000001') where name = 'Scopus'))),
  true, 'a Habilidade do Agente padrão não muda com a do criado');

create temporary table rotina_criada on commit drop as
  select public.create_agent_routine((select id from agente_criado), '  Reavaliar as Contas-alvo ', 'semanal', 'segunda', '09:00', 'slack') as id;
grant select on rotina_criada to authenticated;
select is(
  (select task || ' | ' || frequency || ' | ' || weekday || ' | ' || run_time || ' | ' || destination_channel || ' | ' || paused
    from public.list_agent_routines((select id from agente_criado))),
  'Reavaliar as Contas-alvo | semanal | segunda | 09:00 | slack | false', 'a Rotina criada persiste');
select is(
  (select active_routine ->> 'task' from public.list_agents('aaaaaaaa-1300-0000-0000-000000000001') where id = (select id from agente_criado)),
  'Reavaliar as Contas-alvo', 'a grade mostra a Rotina ativa do Agente');
select lives_ok(
  $$select public.update_agent_routine((select id from rotina_criada), 'Reavaliar as Contas-alvo', 'diaria', null, '07:30', null)$$,
  'a Administradora edita a Rotina');
select is(
  (select frequency || ' | ' || coalesce(weekday, '-') || ' | ' || run_time || ' | ' || coalesce(destination_channel, '-')
    from public.list_agent_routines((select id from agente_criado))),
  'diaria | - | 07:30 | -', 'a edição da Rotina persiste');
select lives_ok(
  $$select public.set_agent_routine_paused((select id from rotina_criada), true)$$,
  'a Administradora pausa a Rotina');
select is(
  (select active_routine from public.list_agents('aaaaaaaa-1300-0000-0000-000000000001') where id = (select id from agente_criado)),
  null, 'pausada, a Rotina deixa de ser a Rotina ativa do Agente');
select throws_ok(
  $$select public.create_agent_routine((select id from agente_criado), 'Tarefa', 'semanal', null, '09:00', null)$$,
  '22023', 'invalid weekday', 'uma Rotina semanal precisa do dia da semana');
select throws_ok(
  $$select public.create_agent_routine((select id from agente_criado), 'Tarefa', 'diaria', 'segunda', '09:00', null)$$,
  '22023', 'invalid weekday', 'só a Rotina semanal tem dia da semana');
select throws_ok(
  $$select public.create_agent_routine((select id from agente_criado), 'Tarefa', 'diaria', null, '25:00', null)$$,
  '22023', 'invalid time', 'o horário é uma hora válida');
select throws_ok(
  $$select public.create_agent_routine((select id from agente_criado), '  ', 'diaria', null, '09:00', null)$$,
  '22023', 'invalid task', 'a Rotina tem uma tarefa');
select throws_ok(
  $$select public.create_agent_routine((select id from agente_criado), 'Tarefa', 'diaria', null, '09:00', 'sms')$$,
  '22023', 'invalid channel', 'o canal de destino é um dos quatro');
select throws_ok(
  $$select public.update_agent_routine((select id from rotina_criada), 'Tarefa', 'anual', null, '09:00', null)$$,
  '22023', 'invalid frequency', 'a frequência é diária, semanal ou mensal');

select set_config('request.jwt.claim.sub', '60000000-0000-0000-0000-000000000002', true);
select is(
  (select count(*)::int from public.list_agent_routines((select id from agente_criado))),
  1, 'o Membro consulta as Rotinas');
select throws_ok(
  $$select public.delete_agent_routine((select id from rotina_criada))$$,
  '42501', 'only administrators can manage agents', 'o Membro não exclui Rotinas');
select set_config('request.jwt.claim.sub', '60000000-0000-0000-0000-000000000003', true);
select throws_ok(
  $$select public.set_agent_routine_paused((select id from rotina_criada), false)$$,
  'P0002', 'agent not found', 'a Administradora do Sul não mexe numa Rotina do Norte');
select set_config('request.jwt.claim.sub', '60000000-0000-0000-0000-000000000001', true);
select lives_ok(
  $$select public.delete_agent_routine((select id from rotina_criada))$$,
  'a Administradora exclui a Rotina');
select is(
  (select count(*)::int from public.list_agent_routines((select id from agente_criado))),
  0, 'a Rotina excluída não volta');

-- Excluir: o Agente padrão não, mesmo para a Administradora.
select throws_ok(
  $$select public.delete_agent((select id from public.list_agents('aaaaaaaa-1300-0000-0000-000000000001') where name = 'Scopus'))$$,
  '42501', 'default agents cannot be deleted', 'o Agente padrão não pode ser excluído');
select is(
  (select count(*)::int from public.list_agents('aaaaaaaa-1300-0000-0000-000000000001') where kind = 'padrao'),
  4, 'os quatro Agentes padrão continuam depois da tentativa');

-- Uma referência ao Agente que não acompanha a exclusão a recusa, sem apagar nada; a que acompanha, vai junto.
reset role;
create table public.crm13_referencia_restrita (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references private.agents(id)
);
create table public.crm13_referencia_em_cascata (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references private.agents(id) on delete cascade
);
insert into public.crm13_referencia_restrita (agent_id) select id from agente_criado;
insert into public.crm13_referencia_em_cascata (agent_id) select id from agente_criado;
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '60000000-0000-0000-0000-000000000001', true);

select throws_ok(
  $$select public.delete_agent((select id from agente_criado))$$,
  '23503', 'agent has references', 'uma referência que não acompanha o Agente recusa a exclusão');
select is(
  (select count(*)::int from public.list_agents('aaaaaaaa-1300-0000-0000-000000000001') where kind = 'criado'),
  1, 'a exclusão recusada não apaga o Agente nem a configuração dele');
select is(
  (select instructions from public.get_agent_settings((select id from agente_criado))),
  'Só o México.', 'a configuração do Agente continua inteira depois da recusa');

reset role;
delete from public.crm13_referencia_restrita;
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '60000000-0000-0000-0000-000000000001', true);

select lives_ok(
  $$select public.delete_agent((select id from agente_criado))$$,
  'sem referência que o segure, a Administradora exclui o Agente criado');
select is(
  (select string_agg(name, ', ') from public.list_agents('aaaaaaaa-1300-0000-0000-000000000001')),
  'Scopus, Ethos, Rhetor, Oraculum', 'o Agente criado sai da grade');

reset role;
select is(
  (select count(*)::int from public.crm13_referencia_em_cascata),
  0, 'o que referencia o Agente com cascata sai junto com ele');
select is(
  (select count(*)::int from private.agent_settings where agent_id = (select id from agente_criado))
  + (select count(*)::int from private.agent_permissions where agent_id = (select id from agente_criado))
  + (select count(*)::int from private.agent_knowledge_sources where agent_id = (select id from agente_criado))
  + (select count(*)::int from private.agent_skills where agent_id = (select id from agente_criado))
  + (select count(*)::int from private.agent_routines where agent_id = (select id from agente_criado))
  + (select count(*)::int from private.agent_memory_facts where agent_id = (select id from agente_criado)),
  0, 'a configuração do Agente excluído sai junto: Personalização, Permissões, Habilidades, Rotinas e Memória');
select is(
  (select count(*)::int from private.agents where workspace_id = 'aaaaaaaa-1300-0000-0000-000000000001' and kind = 'padrao'),
  4, 'excluir o Agente criado não toca nos Agentes padrão');

-- O histórico sobrevive ao Agente: criação, exclusão e cada troca de Permissão, com o nome de quando aconteceu.
select is(
  (select string_agg(event || ':' || agent_name, ', ' order by id) from private.agent_events
    where workspace_id = 'aaaaaaaa-1300-0000-0000-000000000001' and event <> 'permissao_alterada'),
  'agente_criado:Scopus · Enterprise LATAM, agente_excluido:Scopus · Enterprise LATAM',
  'a criação e a exclusão do Agente ficam no histórico');
select is(
  (select string_agg(agent_name || ' ' || integration_id || ' ' || coalesce(old_permission, '-') || '>' || coalesce(new_permission, '-'),
                     ', ' order by id)
    from private.agent_events
    where workspace_id = 'aaaaaaaa-1300-0000-0000-000000000001' and event = 'permissao_alterada' and agent_name = 'Scopus'),
  'Scopus hubspot propor>executar, Scopus lusha ler>propor, Scopus apollo ler>-, Scopus clay ler>-'
  || ', Scopus hubspot executar>propor, Scopus lusha propor>-',
  'cada troca de Permissão do Scopus fica no histórico, com a antiga e a nova, inclusive as retiradas');
select is(
  (select count(distinct actor_user_id)::int from private.agent_events
    where workspace_id = 'aaaaaaaa-1300-0000-0000-000000000001'),
  1, 'o histórico guarda quem agiu');

-- Excluir o Workspace leva os Agentes padrão junto, sem esbarrar na proteção deles.
select lives_ok(
  $$delete from public.workspaces where id = 'aaaaaaaa-1300-0000-0000-000000000002'$$,
  'excluir o Workspace inteiro não esbarra na proteção dos Agentes padrão');
select is(
  (select count(*)::int from private.agents where workspace_id = 'aaaaaaaa-1300-0000-0000-000000000002')
  + (select count(*)::int from private.agent_memory_facts where workspace_id = 'aaaaaaaa-1300-0000-0000-000000000002'),
  0, 'os Agentes do Workspace excluído saem com ele, com a Memória');

select * from finish();
rollback;
