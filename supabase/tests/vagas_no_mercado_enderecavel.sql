begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(49);

-- Abertura de vagas no mercado endereçável: o Monitoramento de mercado ativa sem Conta-alvo, com cargo e país; os limites
-- da tela valem no servidor; ativar exige contrato ativo (a Equipe, ilimitada, também ativa); a rodada reserva o preço fixo
-- de 4 créditos e só abre pelo Monitoramento de mercado; a empresa sem site vira candidata com a etiqueta "sem site".
-- O modo Contas-alvo continua como antes.
-- Ana: Administradora do Norte (contrato ativo). Bia: Administradora do Sem contrato. Fabi: da Equipe Althius.
insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
                        created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
                        is_sso_user, is_anonymous)
values
  ('e7000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'ana@norte.test', '', now(), now(), now(), '{}', '{}', false, false),
  ('e7000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'bia@semcontrato.test', '', now(), now(), now(), '{}', '{}', false, false),
  ('e7000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'fabi@althius.test', '', now(), now(), now(), '{}', '{}', false, false);

insert into public.workspaces (id, kind, name) values
  ('e7100000-0000-4000-8000-000000000001', 'empresa', 'Norte'),
  ('e7100000-0000-4000-8000-000000000002', 'empresa', 'Sem contrato');
insert into private.workspace_contracts (workspace_id, tier_id, status, starts_at, monthly_credit_limit) values
  ('e7100000-0000-4000-8000-000000000001', 'profissional', 'ativo', date_trunc('month', now()), 100000);
insert into public.workspace_memberships (workspace_id, user_id, role, active) values
  ('e7100000-0000-4000-8000-000000000001', 'e7000000-0000-4000-8000-000000000001', 'admin', true),
  ('e7100000-0000-4000-8000-000000000002', 'e7000000-0000-4000-8000-000000000002', 'admin', true),
  ('e0a17e00-0000-4000-8000-000000000001', 'e7000000-0000-4000-8000-000000000003', 'admin', true);
select public.grant_credits('e7100000-0000-4000-8000-000000000001', 1000, 'plano', 'saldo de teste');
select private.seed_contract_automation('e7100000-0000-4000-8000-000000000001');

insert into public.target_accounts (id, workspace_id, name, canonical_url, domain, created_by) values
  ('e7200000-0000-4000-8000-000000000001', 'e7100000-0000-4000-8000-000000000001', 'Alfa', 'https://alfa.test', 'alfa.test', 'e7000000-0000-4000-8000-000000000001');

select public.set_signal_actor_state(a.actor_id, 'available', 'v1')
from private.signal_actors a where a.signal_type in ('vaga_linkedin', 'avaliacoes_google_maps');

create temporary table r (k text primary key, id uuid) on commit drop;
grant all on r to authenticated;

-- 1. Cliente com contrato ativa o mercado sem Conta-alvo, com cargo e país.
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'e7000000-0000-4000-8000-000000000001', true);

insert into r select 'mercado', public.save_signal_monitor('e7100000-0000-4000-8000-000000000001', null, 'vaga_linkedin',
  'SDR em óleo e gás', 'ativo', '{"escopo":"mercado","accountIds":[]}',
  '{"nicho":"custom","nichoCustom":"Óleo e gás","funcoes":["SDR","BDR"],"localizacao":["Brasil"],"estado":"Rio de Janeiro","periodo":"Últimos 30 dias"}', 24);
select is((select state || ':' || (audience ->> 'escopo') from public.list_signal_monitors('e7100000-0000-4000-8000-000000000001')
  where id = (select id from r where k = 'mercado')), 'ativo:mercado', 'o Monitoramento de mercado ativa sem Conta-alvo');

-- 2. Os limites da tela valem no servidor.
select throws_ok(
  $$select public.save_signal_monitor('e7100000-0000-4000-8000-000000000001', null, 'vaga_linkedin', 'Nicho longo', 'rascunho',
      '{"escopo":"mercado"}', jsonb_build_object('nicho', 'custom', 'nichoCustom', repeat('a', 61), 'funcoes', '["SDR"]'::jsonb), 24)$$,
  '22023', 'market monitor limits exceeded', 'nicho Custom com mais de 60 caracteres é recusado');
select throws_ok(
  $$select public.save_signal_monitor('e7100000-0000-4000-8000-000000000001', null, 'vaga_linkedin', 'Cargo longo', 'rascunho',
      '{"escopo":"mercado"}', jsonb_build_object('funcoes', jsonb_build_array(repeat('b', 61))), 24)$$,
  '22023', 'market monitor limits exceeded', 'cargo com mais de 60 caracteres é recusado');
select throws_ok(
  $$select public.save_signal_monitor('e7100000-0000-4000-8000-000000000001', null, 'vaga_linkedin', 'Onze cargos', 'rascunho',
      '{"escopo":"mercado"}', '{"funcoes":["C1","C2","C3","C4","C5","C6","C7","C8","C9","C10","C11"]}', 24)$$,
  '22023', 'market monitor limits exceeded', 'mais de 10 cargos Custom é recusado');
select throws_ok(
  $$select public.save_signal_monitor('e7100000-0000-4000-8000-000000000001', null, 'vaga_linkedin', 'Repetido', 'rascunho',
      '{"escopo":"mercado"}', '{"funcoes":["SDR","  sdr "]}', 24)$$,
  '22023', 'market monitor limits exceeded', 'cargo repetido (caixa e espaços) é recusado');
select throws_ok(
  $$select public.save_signal_monitor('e7100000-0000-4000-8000-000000000001', null, 'vaga_linkedin', 'Repetido com acento', 'rascunho',
      '{"escopo":"mercado"}', '{"funcoes":["Agrônomo","agronomo"]}', 24)$$,
  '22023', 'market monitor limits exceeded', 'cargo repetido sem acento também');
select lives_ok(
  $$select public.save_signal_monitor('e7100000-0000-4000-8000-000000000001', null, 'vaga_linkedin', 'Dez mais sugestões', 'rascunho',
      '{"escopo":"mercado"}',
      '{"funcoes":["C1","C2","C3","C4","C5","C6","C7","C8","C9","C10","Agrônomo","Gerente comercial agro","Finanças"],"localizacao":["Brasil"]}', 24)$$,
  'as sugestões da tela não contam no limite dos 10 cargos Custom');
select throws_ok(
  $$select public.save_signal_monitor('e7100000-0000-4000-8000-000000000001', null, 'vaga_linkedin', 'País inventado', 'rascunho',
      '{"escopo":"mercado"}', '{"funcoes":["SDR"],"localizacao":["Atlântida"]}', 24)$$,
  '22023', 'market monitor limits exceeded', 'país fora da lista é recusado');
select throws_ok(
  $$select public.save_signal_monitor('e7100000-0000-4000-8000-000000000001', null, 'vaga_linkedin', 'Estado sem Brasil', 'rascunho',
      '{"escopo":"mercado"}', '{"funcoes":["SDR"],"localizacao":["México"],"estado":"São Paulo"}', 24)$$,
  '22023', 'market monitor limits exceeded', 'estado do Brasil sem o Brasil é recusado');
select throws_ok(
  $$select public.save_signal_monitor('e7100000-0000-4000-8000-000000000001', null, 'vaga_linkedin', 'Estado inventado', 'rascunho',
      '{"escopo":"mercado"}', '{"funcoes":["SDR"],"localizacao":["Brasil"],"estado":"Guanabara"}', 24)$$,
  '22023', 'market monitor limits exceeded', 'estado fora da lista é recusado');

-- 3. Ativar no mercado exige cargo e país; o rascunho não.
select throws_ok(
  $$select public.save_signal_monitor('e7100000-0000-4000-8000-000000000001', null, 'vaga_linkedin', 'Sem cargo', 'ativo',
      '{"escopo":"mercado"}', '{"localizacao":["Brasil"]}', 24)$$,
  '22023', 'a market monitor needs at least one role and a country', 'ativar sem cargo é recusado');
select throws_ok(
  $$select public.save_signal_monitor('e7100000-0000-4000-8000-000000000001', null, 'vaga_linkedin', 'Sem país', 'ativo',
      '{"escopo":"mercado"}', '{"funcoes":["SDR"]}', 24)$$,
  '22023', 'a market monitor needs at least one role and a country', 'ativar sem país é recusado');
insert into r select 'rascunho', public.save_signal_monitor('e7100000-0000-4000-8000-000000000001', null, 'vaga_linkedin',
  'Rascunho sem país', 'rascunho', '{"escopo":"mercado"}', '{"funcoes":["SDR"]}', 24);
select ok((select id from r where k = 'rascunho') is not null, 'o rascunho de mercado salva sem país');
select throws_ok(
  format('select public.set_signal_monitor_state(%L, %L)', (select id from r where k = 'rascunho'), 'ativo'),
  '22023', 'a market monitor needs at least one role and a country', 'e não ativa pelo botão de estado sem país');

-- 4. O público do mercado: sem Conta-alvo escolhida, escopo conhecido, só Abertura de vagas.
select throws_ok(
  $$select public.save_signal_monitor('e7100000-0000-4000-8000-000000000001', null, 'vaga_linkedin', 'Mercado com Conta', 'rascunho',
      '{"escopo":"mercado","accountIds":["e7200000-0000-4000-8000-000000000001"]}', '{"funcoes":["SDR"]}', 24)$$,
  '22023', 'invalid monitor', 'mercado com Conta-alvo escolhida é recusado');
select throws_ok(
  $$select public.save_signal_monitor('e7100000-0000-4000-8000-000000000001', null, 'vaga_linkedin', 'Escopo estranho', 'rascunho',
      '{"escopo":"planeta"}', '{}', 24)$$,
  '22023', 'invalid monitor', 'escopo desconhecido é recusado');
select throws_ok(
  $$select public.save_signal_monitor('e7100000-0000-4000-8000-000000000001', null, 'avaliacoes_google_maps', 'Avaliações no mercado', 'rascunho',
      '{"escopo":"mercado"}', '{}', 24)$$,
  '22023', 'the market scope is only for job openings', 'só Abertura de vagas tem mercado');

-- 5. O modo Contas-alvo não muda.
select throws_ok(
  $$select public.save_signal_monitor('e7100000-0000-4000-8000-000000000001', null, 'vaga_linkedin', 'Contas sem Conta', 'ativo',
      '{"accountIds":[]}', '{}', 24)$$,
  '22023', 'an active monitor needs at least one target account', 'Contas-alvo sem Conta continua sem ativar');
select throws_ok(
  $$select public.save_signal_monitor('e7100000-0000-4000-8000-000000000001', null, 'vaga_linkedin', 'Contas explícito', 'ativo',
      '{"escopo":"contas","accountIds":[]}', '{}', 24)$$,
  '22023', 'an active monitor needs at least one target account', 'escopo contas explícito também exige Conta');
insert into r select 'contas', public.save_signal_monitor('e7100000-0000-4000-8000-000000000001', null, 'vaga_linkedin',
  'Vagas das Contas', 'ativo', '{"accountIds":["e7200000-0000-4000-8000-000000000001"]}',
  jsonb_build_object('funcoes', jsonb_build_array('C1','C2','C3','C4','C5','C6','C7','C8','C9','C10','C11','C12')), 24);
select ok((select id from r where k = 'contas') is not null, 'Contas-alvo ativa como antes, sem os limites do mercado');

-- 6. Sem contrato, o mercado não ativa (nem pelo estado); o rascunho salva.
select set_config('request.jwt.claim.sub', 'e7000000-0000-4000-8000-000000000002', true);
select throws_ok(
  $$select public.save_signal_monitor('e7100000-0000-4000-8000-000000000002', null, 'vaga_linkedin', 'Mercado sem contrato', 'ativo',
      '{"escopo":"mercado"}', '{"funcoes":["SDR"],"localizacao":["Brasil"]}', 24)$$,
  '42501', 'the market scope needs an active contract', 'sem contrato, o mercado não ativa');
insert into r select 'sem_contrato', public.save_signal_monitor('e7100000-0000-4000-8000-000000000002', null, 'vaga_linkedin',
  'Mercado sem contrato', 'rascunho', '{"escopo":"mercado"}', '{"funcoes":["SDR"],"localizacao":["Brasil"]}', 24);
select ok((select id from r where k = 'sem_contrato') is not null, 'sem contrato, o rascunho de mercado salva');
select throws_ok(
  format('select public.set_signal_monitor_state(%L, %L)', (select id from r where k = 'sem_contrato'), 'ativo'),
  '42501', 'the market scope needs an active contract', 'e não ativa pelo botão de estado');

-- 7. A Equipe Althius, ilimitada, ativa.
select set_config('request.jwt.claim.sub', 'e7000000-0000-4000-8000-000000000003', true);
insert into r select 'equipe', public.save_signal_monitor('e0a17e00-0000-4000-8000-000000000001', null, 'vaga_linkedin',
  'Mercado da Equipe', 'ativo', '{"escopo":"mercado"}', '{"funcoes":["SDR"],"localizacao":["Brasil"]}', 24);
select ok((select id from r where k = 'equipe') is not null, 'a Equipe ativa o mercado');

-- O catálogo de cascatas da tela não mostra a descoberta.
select is((select count(*)::int from public.list_cascade_catalog() where signal_type = 'vaga_mercado'), 0,
  'a descoberta não aparece no catálogo de cascatas da tela');
select ok(not has_function_privilege('authenticated', 'public.signal_monitor_scope(uuid)', 'execute'),
  'o cliente não lê o escopo pela porta do servidor');

-- 8. O visitante não salva nada.
reset role;
set local role anon;
select throws_ok(
  $$select public.save_signal_monitor('e7100000-0000-4000-8000-000000000001', null, 'vaga_linkedin', 'Anônimo', 'ativo',
      '{"escopo":"mercado"}', '{"funcoes":["SDR"],"localizacao":["Brasil"]}', 24)$$,
  '42501', null, 'anon não salva Monitoramento de mercado');
reset role;

-- 9. O servidor: o escopo, o relógio e a cascata.
select ok(has_function_privilege('service_role', 'public.signal_monitor_scope(uuid)', 'execute'), 'o servidor lê o escopo');
select is(public.signal_monitor_scope((select id from r where k = 'mercado')), 'mercado', 'o escopo do Monitoramento de mercado');
select is(public.signal_monitor_scope((select id from r where k = 'contas')), 'contas', 'sem escopo, é Contas-alvo');
create temporary table reivindicados on commit drop as select * from public.claim_due_signal_monitors(20);
select is((select accounts::text from reivindicados where monitor_id = (select id from r where k = 'mercado')), '[]',
  'o relógio reivindica o Monitoramento de mercado, sem Contas');
select is(private.market_discovery_credits_per_run(), 4, 'a rodada no mercado custa 4 créditos');
select is((select state || ':' || scope || ':' || market_discovery::text || ':' || icp from private.signal_cascades where signal_type = 'vaga_mercado'),
  'testing:conta:true:*', 'a cascata da descoberta nasce em teste e serve a qualquer nicho');
select throws_ok(
  $$insert into private.signal_cascades (signal_type, icp, name) values ('sem_letra', '*', 'Sem letra')$$,
  '23514', null, 'só a descoberta fica sem a letra do ICP');
select is((select string_agg(s.handler, ',' order by s.ordem) from private.signal_cascade_steps s
  join private.signal_cascades c on c.id = s.cascade_id where c.signal_type = 'vaga_mercado'),
  'linkedin_vagas_mercado,confirmar_vaga_mercado,linkedin_empresa_mercado,casar_com_contas', 'os passos da descoberta');
select is((select count(*)::int from public.signal_cascade_catalog() where signal_type = 'vaga_mercado'), 0,
  'nem no catálogo do Hermes');

select is((select outcome from public.begin_cascade_run('e7100000-0000-4000-8000-000000000001', null, 'vaga_mercado', 'monitor',
  (select id from r where k = 'mercado'), 'mercado:teste', 0.3, 4, false)), 'em_teste', 'em teste, a descoberta não roda');
create temporary table rodada on commit drop as
  select * from public.begin_cascade_run('e7100000-0000-4000-8000-000000000001', 'e7000000-0000-4000-8000-000000000001',
    'vaga_mercado', 'monitor', (select id from r where k = 'mercado'), 'mercado:1', 0.3, 4, true, 50);
select is((select outcome || ':' || est_credits from rodada), 'go:4', 'a rodada abre e reserva 4 créditos, com qualquer número de Contas');
select is((select quantity::text from private.credit_reservations where id = (select reservation_id from rodada)), '4',
  'a reserva é de 4 créditos');
select is((select outcome from public.begin_cascade_run('e7100000-0000-4000-8000-000000000001', null, 'vaga_mercado', 'conversa',
  null, 'mercado:conversa', 0.3, 4, true)), 'indisponivel', 'a conversa não roda a descoberta');
select is((select outcome from public.begin_cascade_run('e7100000-0000-4000-8000-000000000001', null, 'vaga_mercado', 'monitor',
  (select id from r where k = 'contas'), 'mercado:contas', 0.3, 4, true)), 'indisponivel', 'nem o Monitoramento de Contas-alvo');
select is((select outcome from public.begin_cascade_run('e7100000-0000-4000-8000-000000000002', null, 'vaga_mercado', 'monitor',
  (select id from r where k = 'sem_contrato'), 'mercado:sem', 0.3, 4, true)), 'contrato_inativo', 'sem contrato, a rodada não abre');
select is((select credits_charged from public.finish_cascade_run((select run_id from rodada), 'succeeded', 0.25, 0, 0, 0, null)), 4,
  'concluída, cobra os 4 créditos');

-- 10. A empresa que não é Conta vira candidata; a sem site também, com a etiqueta.
create temporary table sem_site on commit drop as
  select * from public.record_signal_for_company('e7100000-0000-4000-8000-000000000001',
    '{"name":"Petro Sul","linkedinUrl":"https://www.linkedin.com/company/petro-sul/","semSite":true}',
    (select id from r where k = 'mercado'), 'vaga_linkedin', 'vaga|petro sul|sdr|2026', 'Abriu vaga de SDR',
    now() - interval '1 day', 'LinkedIn Vagas', 'SDR — Petro Sul', 60);
select is((select resolved || ':' || is_new::text from sem_site), 'candidata:true', 'a empresa sem site vira candidata');
select is((select array_to_string(tags, ',') || ':' || state from private.discovered_accounts where id = (select discovered_account_id from sem_site)),
  'sem site:nova', 'com a etiqueta "sem site", para aceite manual');
select is((select resolved || ':' || discovered_account_id::text from public.record_signal_for_company('e7100000-0000-4000-8000-000000000001',
    '{"name":"Petro Sul Ltda","linkedinUrl":"https://linkedin.com/company/petro-sul","semSite":true}',
    (select id from r where k = 'mercado'), 'vaga_linkedin', 'vaga|petro sul|bdr|2026', 'Abriu vaga de BDR',
    now() - interval '1 day', 'LinkedIn Vagas', 'BDR — Petro Sul', 60)),
  'candidata:' || (select discovered_account_id from sem_site)::text, 'a mesma página do LinkedIn não cria outra candidata');
select is((select resolved from public.record_signal_for_company('e7100000-0000-4000-8000-000000000001',
    '{"name":"Sem Nada","semSite":true}', (select id from r where k = 'mercado'), 'vaga_linkedin', 'vaga|sem nada|sdr|2026',
    'Abriu vaga de SDR', now() - interval '1 day', 'LinkedIn Vagas', 'SDR', 60)), 'sem_identidade',
  'sem site e sem a página do LinkedIn, continua sem identidade');
select is((select resolved from public.record_signal_for_company('e7100000-0000-4000-8000-000000000001',
    '{"name":"Outra","linkedinUrl":"https://www.linkedin.com/company/outra/"}', (select id from r where k = 'mercado'), 'vaga_linkedin',
    'vaga|outra|sdr|2026', 'Abriu vaga de SDR', now() - interval '1 day', 'LinkedIn Vagas', 'SDR', 60)), 'sem_identidade',
  'fora da descoberta, a empresa sem site segue como antes');
select is((select resolved || ':' || target_account_id::text from public.record_signal_for_company('e7100000-0000-4000-8000-000000000001',
    '{"name":"Alfa","website":"https://alfa.test"}', (select id from r where k = 'mercado'), 'vaga_linkedin',
    'vaga|alfa|sdr|2026', 'Abriu vaga de SDR', now() - interval '1 day', 'LinkedIn Vagas', 'SDR — Alfa', 60)),
  'conta:e7200000-0000-4000-8000-000000000001', 'a empresa que já é Conta recebe o Sinal da Conta');

select * from finish();
rollback;
