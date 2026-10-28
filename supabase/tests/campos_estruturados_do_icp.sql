-- Campos estruturados do ICP (Sinais first, ticket 16): gravação só por Administrador, normalização, porte válido,
-- isolamento por Workspace e Aderência das candidatas de Sinais de mercado pelas listas.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(20);

insert into auth.users (id, email, email_confirmed_at) values
 ('e1600000-0000-0000-0000-000000000001', 'icp16-admin@example.test', now()),
 ('e1600000-0000-0000-0000-000000000002', 'icp16-membro@example.test', now()),
 ('e1600000-0000-0000-0000-000000000003', 'icp16-fora@example.test', now());
insert into public.workspaces (id, kind, name) values
 ('e1600000-0000-0000-0000-000000000010', 'empresa', 'Workspace campos do ICP'),
 ('e1600000-0000-0000-0000-000000000020', 'empresa', 'Outro Workspace');
insert into public.workspace_memberships (workspace_id, user_id, role) values
 ('e1600000-0000-0000-0000-000000000010', 'e1600000-0000-0000-0000-000000000001', 'admin'),
 ('e1600000-0000-0000-0000-000000000010', 'e1600000-0000-0000-0000-000000000002', 'member'),
 ('e1600000-0000-0000-0000-000000000020', 'e1600000-0000-0000-0000-000000000003', 'admin');
insert into private.workspace_icp_versions (workspace_id, version, free_text, o_que_vende, mini_icp, por_que_compram, target_roles)
values ('e1600000-0000-0000-0000-000000000010', 1, 'Setor: Logística', 'Roteirização', 'Transportadoras', 'Cortam custo', '["COO"]');

insert into private.discovered_accounts (id, workspace_id, origin, name, name_key, source_actor, sector, size_label, employee_count, uf, country, fit_score, fit_level)
values
 ('e1600000-0000-0000-0000-0000000000a1', 'e1600000-0000-0000-0000-000000000010', 'sinal', 'Transportes Sul', 'transportes sul', 'sinal:mercado', 'Logística e transporte', null, 120, 'SP', 'Brasil', 0, 'sem_dado'),
 ('e1600000-0000-0000-0000-0000000000a2', 'e1600000-0000-0000-0000-000000000010', 'sinal', 'Varejo Norte', 'varejo norte', 'sinal:mercado', 'Varejo', '5001-10000', null, 'AM', 'Brasil', 0, 'sem_dado'),
 ('e1600000-0000-0000-0000-0000000000a3', 'e1600000-0000-0000-0000-000000000020', 'sinal', 'Fora', 'fora', 'sinal:mercado', 'Logística', null, 120, 'SP', 'Brasil', 0, 'sem_dado');
insert into private.market_signals (id, workspace_id, signal_type, event_key, phrase, fired_at)
values ('e1600000-0000-0000-0000-0000000000b1', 'e1600000-0000-0000-0000-000000000010', 'vaga_comex', 'icp16', 'Sinal de mercado', now());
insert into private.signals (workspace_id, discovered_account_id, signal_type, event_key, phrase, fired_at, market_signal_id)
values
 ('e1600000-0000-0000-0000-000000000010', 'e1600000-0000-0000-0000-0000000000a1', 'vaga_comex', 'icp16', 'Sinal de mercado', now(), 'e1600000-0000-0000-0000-0000000000b1'),
 ('e1600000-0000-0000-0000-000000000010', 'e1600000-0000-0000-0000-0000000000a2', 'vaga_comex', 'icp16', 'Sinal de mercado', now(), 'e1600000-0000-0000-0000-0000000000b1');

select is(private.score_market_discovery_icp('e1600000-0000-0000-0000-0000000000a1'), null,
  'sem campos estruturados a candidata continua sem dado');

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);

-- Membro não grava.
select set_config('request.jwt.claim.sub', 'e1600000-0000-0000-0000-000000000002', true);
select throws_ok($$select public.save_my_workspace_icp_fields('e1600000-0000-0000-0000-000000000010', 'Logística', '51-200', 'SP')$$,
  '42501', null, 'Membro não grava os campos do ICP');
-- Administrador de outro Workspace não grava.
select set_config('request.jwt.claim.sub', 'e1600000-0000-0000-0000-000000000003', true);
select throws_ok($$select public.save_my_workspace_icp_fields('e1600000-0000-0000-0000-000000000010', 'Logística', '51-200', 'SP')$$,
  '42501', null, 'quem não participa do Workspace não grava');

select set_config('request.jwt.claim.sub', 'e1600000-0000-0000-0000-000000000001', true);
select throws_ok($$select public.save_my_workspace_icp_fields('e1600000-0000-0000-0000-000000000010', 'Logística', 'médio', 'SP')$$,
  '22023', null, 'porte fora das faixas conhecidas é recusado');
select throws_ok($$select public.save_my_workspace_icp_fields('e1600000-0000-0000-0000-000000000010', repeat('a', 81), '', '')$$,
  '22023', null, 'item longo demais é recusado, não cortado');
select is(public.get_my_workspace_icp('e1600000-0000-0000-0000-000000000010')->>'version', '1',
  'gravações recusadas não criam versão');

select is(public.save_my_workspace_icp_fields('e1600000-0000-0000-0000-000000000010',
  ' Logística ,  , Seguros, logística', '51-200, me', 'SP, RJ')->>'sector',
  'Logística, Seguros', 'setor é normalizado: aparado, sem vazios nem repetidos');
select is(public.get_my_workspace_icp('e1600000-0000-0000-0000-000000000010')->>'companySize', '51-200, ME',
  'porte é guardado na forma canônica');
select is(public.get_my_workspace_icp('e1600000-0000-0000-0000-000000000010')->>'geography', 'SP, RJ',
  'região é devolvida pela leitura do ICP');
select is(public.get_my_workspace_icp('e1600000-0000-0000-0000-000000000010')->>'version', '2',
  'cada gravação cria uma versão nova');
select is(public.get_my_workspace_icp('e1600000-0000-0000-0000-000000000010')->>'freeText', 'Setor: Logística',
  'o texto livre da versão vigente é mantido');
select is(public.get_my_workspace_icp('e1600000-0000-0000-0000-000000000010')->>'miniIcp', 'Transportadoras',
  'os campos do Day0 da versão vigente são mantidos');
select is(public.get_my_workspace_icp('e1600000-0000-0000-0000-000000000010')->'targetRoles', '["COO"]'::jsonb,
  'os papéis-alvo da versão vigente são mantidos');
select is(public.save_my_workspace_icp_fields('e1600000-0000-0000-0000-000000000010',
  'Logística, Seguros', '51-200, ME', 'SP, RJ')->>'version', '2', 'gravar os mesmos valores não cria versão');
select is(public.get_my_workspace_icp('e1600000-0000-0000-0000-000000000020')->>'version', null,
  'o outro Workspace não recebe versão');
reset role;

select is(private.score_market_discovery_icp('e1600000-0000-0000-0000-0000000000a1'), 100,
  'setor por qualquer item da lista, porte pela faixa de funcionários e região pela UF');
select is((select fit_level from private.discovered_accounts where id = 'e1600000-0000-0000-0000-0000000000a1'), 'alto',
  'a versão nova do ICP recalcula o nível da candidata');
select is(private.score_market_discovery_icp('e1600000-0000-0000-0000-0000000000a2'), 0,
  'candidata divergente nos três campos fica com nota zero');
select is((select fit_level from private.discovered_accounts where id = 'e1600000-0000-0000-0000-0000000000a2'), 'baixo',
  'a candidata divergente deixa de ser sem dado');
select is((select fit_level from private.discovered_accounts where id = 'e1600000-0000-0000-0000-0000000000a3'), 'sem_dado',
  'o ICP de um Workspace não mexe nas candidatas de outro');

select * from finish();
rollback;
