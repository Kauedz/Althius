begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(11);

-- Desfazer o Sinais first, ticket 07 (ADR-0034): o ICP volta a ser o da seção ICP do Playbook e o mini-ICP do Day0. Nada
-- grava mais o ICP estruturado, as empresas achadas por Sinal de mercado ficam "sem dado" e as funções dele saem.

select hasnt_function('public', 'get_my_workspace_icp', array['uuid'], 'a leitura do ICP estruturado saiu');
select hasnt_function('public', 'save_my_workspace_icp_fields', array['uuid', 'text', 'text', 'text'], 'a gravação de Setor, Porte e Região saiu');
select hasnt_function('private', 'score_market_discovery_icp', array['uuid'], 'a nota pelo ICP estruturado saiu');

insert into auth.users (id, email, email_confirmed_at) values
 ('e0320000-0000-0000-0000-000000000001', 'sem-icp@example.test', now());
insert into public.workspaces (id, kind, name) values
 ('e0320000-0000-0000-0000-000000000010', 'empresa', 'Sem ICP estruturado'),
 ('e0320000-0000-0000-0000-000000000020', 'empresa', 'Sem mini-ICP');
insert into public.workspace_memberships (workspace_id, user_id, role) values
 ('e0320000-0000-0000-0000-000000000010', 'e0320000-0000-0000-0000-000000000001', 'admin'),
 ('e0320000-0000-0000-0000-000000000020', 'e0320000-0000-0000-0000-000000000001', 'admin');

-- Empresas do Workspace: duas achadas por um Sinal de mercado (uma ainda com a nota antiga) e uma da Busca.
insert into private.discovered_accounts (id, workspace_id, origin, name, name_key, source_actor, sector, size_label, country, fit_score, fit_level)
values
  ('e0320000-0000-0000-0000-0000000000a1', 'e0320000-0000-0000-0000-000000000010', 'sinal', 'Mercado alto', 'mercado alto', 'sinal:mercado', 'Tecnologia', 'Médio', 'Brasil', 100, 'alto'),
  ('e0320000-0000-0000-0000-0000000000a2', 'e0320000-0000-0000-0000-000000000010', 'sinal', 'Mercado baixo', 'mercado baixo', 'sinal:mercado', 'Varejo', 'Grande', 'Argentina', 0, 'baixo'),
  ('e0320000-0000-0000-0000-0000000000a3', 'e0320000-0000-0000-0000-000000000010', 'busca', 'Da busca', 'da busca', 'busca:linkedin', 'Tecnologia', 'Médio', 'Brasil', 90, 'alto'),
  ('e0320000-0000-0000-0000-0000000000a4', 'e0320000-0000-0000-0000-000000000020', 'sinal', 'Sem mini-ICP', 'sem mini-icp', 'sinal:mercado', 'Tecnologia', 'Médio', 'Brasil', 0, 'sem_dado');
insert into private.market_signals (id, workspace_id, signal_type, event_key, phrase, fired_at)
values ('e0320000-0000-0000-0000-0000000000b1', 'e0320000-0000-0000-0000-000000000010', 'vaga_comex', 'sem-icp-estruturado', 'Sinal de mercado', now());
insert into private.signals (workspace_id, discovered_account_id, signal_type, event_key, phrase, fired_at, market_signal_id)
values
  ('e0320000-0000-0000-0000-000000000010', 'e0320000-0000-0000-0000-0000000000a1', 'vaga_comex', 'sem-icp-estruturado', 'Sinal de mercado', now(), 'e0320000-0000-0000-0000-0000000000b1'),
  ('e0320000-0000-0000-0000-000000000010', 'e0320000-0000-0000-0000-0000000000a2', 'vaga_comex', 'sem-icp-estruturado', 'Sinal de mercado', now(), 'e0320000-0000-0000-0000-0000000000b1');

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'e0320000-0000-0000-0000-000000000001', true);

select is(public.save_my_day0('e0320000-0000-0000-0000-000000000010', 'produto',
  '{"oQueVende":"Software financeiro","miniIcp":"Fintechs B2B","porQueCompram":"Reduzem conciliação"}')->>'miniIcp',
  'Fintechs B2B', 'o Day0 continua salvando o mini-ICP');
select is(public.get_my_day0('e0320000-0000-0000-0000-000000000010')->>'oQueVende', 'Software financeiro',
  'a leitura do Day0 retoma o que vende');
select lives_ok($$select public.save_playbook_section('e0320000-0000-0000-0000-000000000010', 'icp', '{"texto":"Fintechs B2B do Sul"}')$$,
  'a seção ICP do Playbook continua sendo salva');
reset role;
select is((select count(*)::integer from private.workspace_icp_versions where workspace_id = 'e0320000-0000-0000-0000-000000000010'), 0,
  'nem o Day0 nem o Playbook gravam mais o ICP estruturado');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'e0320000-0000-0000-0000-000000000001', true);
select is((select array_agg(name || ':' || fit_level order by name)::text
  from public.list_discovered_accounts('e0320000-0000-0000-0000-000000000010') where origin = 'sinal'),
  '{"Mercado alto:sem_dado","Mercado baixo:sem_dado"}', 'as empresas achadas por Sinal de mercado ficam sem dado');
select isnt((select fit_level from public.list_discovered_accounts('e0320000-0000-0000-0000-000000000010') where name = 'Da busca'),
  'sem_dado', 'a empresa da Busca continua com a Aderência dela');
select is(public.get_discovered_account_fit_explanation('e0320000-0000-0000-0000-0000000000a3') -> 'icp',
  '{"oQueVende": "Software financeiro"}'::jsonb, 'a explicação da Aderência leva o que vende do Day0 como ICP');
select is(public.get_discovered_account_fit_explanation('e0320000-0000-0000-0000-0000000000a4') -> 'icp',
  'null'::jsonb, 'sem mini-ICP no Day0, o ICP da explicação vem nulo');
reset role;

select * from finish();
rollback;
