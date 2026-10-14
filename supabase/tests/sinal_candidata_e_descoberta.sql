begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(78);

-- Ana (Admin) e Bruno (Membro) do Norte; Carla é do Sul.
insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
                        created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
                        is_sso_user, is_anonymous)
values
  ('5a000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'ana@norte.test', '', now(), now(), now(), '{}', '{}', false, false),
  ('5a000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'bruno@norte.test', '', now(), now(), now(), '{}', '{}', false, false),
  ('5a000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'carla@sul.test', '', now(), now(), now(), '{}', '{}', false, false);
insert into public.workspaces (id, kind, name) values
  ('fa000000-0000-0000-0000-000000000001', 'empresa', 'Norte'),
  ('fa000000-0000-0000-0000-000000000002', 'empresa', 'Sul');
insert into private.workspace_contracts (workspace_id, tier_id, starts_at) select w.id, 'escala', date_trunc('month', now()) from public.workspaces w on conflict (workspace_id) do nothing; -- contrato de teste (acesso-e-planos)
insert into public.workspace_memberships (workspace_id, user_id, role, active) values
  ('fa000000-0000-0000-0000-000000000001', '5a000000-0000-0000-0000-000000000001', 'admin', true),
  ('fa000000-0000-0000-0000-000000000001', '5a000000-0000-0000-0000-000000000002', 'member', true),
  ('fa000000-0000-0000-0000-000000000002', '5a000000-0000-0000-0000-000000000003', 'admin', true);

-- Contas que o Norte já tem: Alfa (domínio), Beta (domínio e CNPJ), Gama (LinkedIn), Delta (será arquivada).
insert into public.target_accounts (id, workspace_id, name, canonical_url, domain, legal_identifier, linkedin_url, created_by) values
  ('da000000-0000-0000-0000-000000000001', 'fa000000-0000-0000-0000-000000000001', 'Alfa Tecnologia Ltda', 'https://alfa.test', 'alfa.test', null, null, '5a000000-0000-0000-0000-000000000001'),
  ('da000000-0000-0000-0000-000000000002', 'fa000000-0000-0000-0000-000000000001', 'Beta Soluções', 'https://beta.test', 'beta.test', '11.222.333/0001-81', null, '5a000000-0000-0000-0000-000000000001'),
  ('da000000-0000-0000-0000-000000000003', 'fa000000-0000-0000-0000-000000000001', 'Gama Dados', 'https://gama.test', 'gama.test', null, 'https://www.linkedin.com/company/gama-dados/', '5a000000-0000-0000-0000-000000000001'),
  ('da000000-0000-0000-0000-000000000004', 'fa000000-0000-0000-0000-000000000001', 'Delta Sistemas', 'https://delta.test', 'delta.test', null, null, '5a000000-0000-0000-0000-000000000001');
insert into public.sales_responsibilities (workspace_id, target_account_id, owner_user_id) values
  ('fa000000-0000-0000-0000-000000000001', 'da000000-0000-0000-0000-000000000001', '5a000000-0000-0000-0000-000000000001'),
  ('fa000000-0000-0000-0000-000000000001', 'da000000-0000-0000-0000-000000000002', '5a000000-0000-0000-0000-000000000001'),
  ('fa000000-0000-0000-0000-000000000001', 'da000000-0000-0000-0000-000000000003', '5a000000-0000-0000-0000-000000000001'),
  ('fa000000-0000-0000-0000-000000000001', 'da000000-0000-0000-0000-000000000004', '5a000000-0000-0000-0000-000000000001');

create temporary table ids (chave text primary key, valor text);
grant all on ids to authenticated;

-- 1. O esquema (ticket 01).
insert into private.discovered_accounts (id, workspace_id, name, domain, domain_key, name_key, source_actor) values
  ('ca000000-0000-0000-0000-000000000001', 'fa000000-0000-0000-0000-000000000001', 'Busca Um', 'busca1.test', 'busca1.test', 'busca um', 'harvestapi~linkedin-company-search');
select is((select origin from private.discovered_accounts where id = 'ca000000-0000-0000-0000-000000000001'), 'busca',
  'uma candidata sem origem informada é da busca');
select throws_ok(
  $$update private.discovered_accounts set origin = 'outro' where id = 'ca000000-0000-0000-0000-000000000001'$$,
  '23514', null, 'a origem só aceita busca, sinal ou sincronizacao');
select lives_ok(
  $$update private.discovered_accounts set origin = 'sincronizacao' where id = 'ca000000-0000-0000-0000-000000000001'$$,
  'sincronizacao é um valor válido (ninguém grava, por enquanto)');
update private.discovered_accounts set origin = 'busca' where id = 'ca000000-0000-0000-0000-000000000001';

select throws_ok(
  $$insert into private.signals (workspace_id, signal_type, event_key, phrase, fired_at)
    values ('fa000000-0000-0000-0000-000000000001', 'novo_importador', 'k-nenhum', 'Sem dono', now())$$,
  '23514', null, 'um Sinal sem Conta e sem candidata é recusado');
select throws_ok(
  $$insert into private.signals (workspace_id, target_account_id, discovered_account_id, signal_type, event_key, phrase, fired_at)
    values ('fa000000-0000-0000-0000-000000000001', 'da000000-0000-0000-0000-000000000001', 'ca000000-0000-0000-0000-000000000001',
      'novo_importador', 'k-dois', 'Dois donos', now())$$,
  '23514', null, 'um Sinal com Conta e candidata ao mesmo tempo é recusado');
select lives_ok(
  $$insert into private.signals (workspace_id, discovered_account_id, signal_type, event_key, phrase, fired_at)
    values ('fa000000-0000-0000-0000-000000000001', 'ca000000-0000-0000-0000-000000000001', 'novo_importador', 'k-cand', 'Da candidata', now())$$,
  'um Sinal só da candidata é aceito');
select throws_ok(
  $$insert into private.signals (workspace_id, discovered_account_id, signal_type, event_key, phrase, fired_at)
    values ('fa000000-0000-0000-0000-000000000001', 'ca000000-0000-0000-0000-000000000001', 'novo_importador', 'k-cand', 'Repetido', now())$$,
  '23505', null, 'o mesmo acontecimento é um Sinal só dentro da candidata');
select throws_ok(
  $$insert into private.signals (workspace_id, discovered_account_id, signal_type, event_key, phrase, fired_at)
    values ('fa000000-0000-0000-0000-000000000002', 'ca000000-0000-0000-0000-000000000001', 'novo_importador', 'k-cruzado', 'Outro Workspace', now())$$,
  '23503', null, 'a candidata de um Workspace não recebe Sinal de outro');
select lives_ok(
  $$insert into private.discovery_reasons (discovered_account_id, signal_id, workspace_id, weight)
    select s.discovered_account_id, s.id, s.workspace_id, 25 from private.signals s where s.event_key = 'k-cand'$$,
  'o motivo liga a candidata ao Sinal');
select throws_ok(
  $$insert into private.discovery_reasons (discovered_account_id, signal_id, workspace_id, weight)
    select s.discovered_account_id, s.id, s.workspace_id, 101 from private.signals s where s.event_key = 'k-cand'$$,
  '23514', null, 'o peso de um motivo fica entre 0 e 100');
select ok((select relrowsecurity from pg_class where oid = 'private.discovery_reasons'::regclass),
  'os motivos têm RLS ligado');
select ok(not has_table_privilege('authenticated', 'private.discovery_reasons', 'select'),
  'e ninguém de fora lê os motivos direto');

-- Quem lê "os Sinais das Contas" não vê o Sinal da candidata.
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '5a000000-0000-0000-0000-000000000002', true);
select is((select count(*)::integer from public.list_signals('fa000000-0000-0000-0000-000000000001')), 0,
  'list_signals só devolve Sinais de Contas');
select is((select count(*)::integer from public.list_account_signals('fa000000-0000-0000-0000-000000000001')), 0,
  'list_account_signals não cria uma linha sem Conta para o Sinal da candidata');
reset role;

-- Apagar a candidata leva o Sinal e o motivo.
delete from private.discovered_accounts where id = 'ca000000-0000-0000-0000-000000000001';
select is((select count(*)::integer from private.signals where event_key = 'k-cand')
  + (select count(*)::integer from private.discovery_reasons), 0, 'apagar a candidata apaga o Sinal e o motivo dela');

-- A Conta que nasce do aceite por CNPJ não tem site; duas Contas sem site não repetem o CNPJ.
select lives_ok(
  $$insert into public.target_accounts (id, workspace_id, name, canonical_url, domain, legal_identifier, created_by)
    values ('da000000-0000-0000-0000-0000000000a1', 'fa000000-0000-0000-0000-000000000001', 'Sem Site SA', null, null,
      '47.960.950/0001-21', '5a000000-0000-0000-0000-000000000001')$$,
  'uma Conta pode não ter site');
select throws_ok(
  $$insert into public.target_accounts (id, workspace_id, name, canonical_url, domain, legal_identifier, created_by)
    values ('da000000-0000-0000-0000-0000000000a2', 'fa000000-0000-0000-0000-000000000001', 'Sem Site Outra', null, null,
      '47960950000121', '5a000000-0000-0000-0000-000000000001')$$,
  '23505', null, 'duas Contas sem site não têm o mesmo CNPJ');
select lives_ok(
  $$insert into public.target_accounts (id, workspace_id, name, canonical_url, domain, legal_identifier, created_by)
    values ('da000000-0000-0000-0000-0000000000a3', 'fa000000-0000-0000-0000-000000000002', 'Sem Site Sul', null, null,
      '47960950000121', '5a000000-0000-0000-0000-000000000003')$$,
  'o mesmo CNPJ sem site em outro Workspace é outra Conta');
delete from public.target_accounts where id in ('da000000-0000-0000-0000-0000000000a1', 'da000000-0000-0000-0000-0000000000a3');


-- 2. A resolução do Sinal em Conta ou candidata (ticket 02). O servidor chama; o crédito não se mexe.
select ok(not has_function_privilege('authenticated', 'public.record_signal_for_company(uuid,jsonb,uuid,text,text,text,timestamptz,text,text,integer)', 'execute'),
  'quem usa o app não grava o Sinal de uma empresa');
select ok(has_function_privilege('service_role', 'public.record_signal_for_company(uuid,jsonb,uuid,text,text,text,timestamptz,text,text,integer)', 'execute'),
  'o servidor grava');
select ok(not has_function_privilege('authenticated', 'public.record_market_signal(uuid,text,text,text,timestamptz,text,text,jsonb,integer)', 'execute'),
  'nem o Sinal de mercado');

insert into ids (chave, valor) values ('creditos', (select count(*)::text from private.credit_entries) || '/' || (select count(*)::text from private.credit_reservations));

-- 2.1 A empresa é Conta: por CNPJ, por domínio, e o CNPJ vence o domínio.
select is(
  (select row(r.resolved, r.is_new, r.target_account_id, r.discovered_account_id)::text
   from public.record_signal_for_company('fa000000-0000-0000-0000-000000000001',
     '{"name":"Beta Soluções S.A.","cnpj":"11.222.333/0001-81"}', null, 'nova_filial_icp_g', 'filial|beta|1',
     'Abriu filial em Campinas', now() - interval '2 days', 'Diário Oficial', 'Ato 1', 35) r),
  '(conta,t,da000000-0000-0000-0000-000000000002,)', 'a empresa que já é Conta, pelo CNPJ: o Sinal vai para a Conta');
select is(
  (select stage from private.prospecting_stages where target_account_id = 'da000000-0000-0000-0000-000000000002'),
  'quente', 'e a Conta fica Quente');
select is(
  (select count(*)::integer from private.signals where target_account_id = 'da000000-0000-0000-0000-000000000002' and event_key = 'filial|beta|1'),
  1, 'o Sinal é da Conta (e nenhuma candidata nasceu)');
select is((select count(*)::integer from private.discovered_accounts where workspace_id = 'fa000000-0000-0000-0000-000000000001'), 0,
  'a Caixa continua vazia');
select is(
  (select row(r.resolved, r.target_account_id)::text
   from public.record_signal_for_company('fa000000-0000-0000-0000-000000000001',
     '{"name":"Alfa","website":"https://www.alfa.test/produtos"}', null, 'nova_filial_icp_g', 'filial|alfa|1',
     'Abriu filial em Recife', now() - interval '1 day', 'Diário Oficial', 'Ato 2') r),
  '(conta,da000000-0000-0000-0000-000000000001)', 'e pelo domínio, quando não há CNPJ');
select is(
  (select r.target_account_id::text
   from public.record_signal_for_company('fa000000-0000-0000-0000-000000000001',
     '{"name":"Mistura","cnpj":"11222333000181","website":"https://alfa.test"}', null, 'nova_filial_icp_g', 'filial|mistura|1',
     'Abriu filial em Natal', now() - interval '1 day', 'Diário Oficial', 'Ato 3') r),
  'da000000-0000-0000-0000-000000000002', 'quando CNPJ e domínio apontam Contas diferentes, vale o CNPJ');
select is(
  (select r.is_new from public.record_signal_for_company('fa000000-0000-0000-0000-000000000001',
     '{"cnpj":"11222333000181"}', null, 'nova_filial_icp_g', 'filial|beta|1',
     'Abriu filial em Campinas', now() - interval '2 days', 'Diário Oficial', 'Ato 1') r),
  false, 'o mesmo acontecimento é um reencontro, e não um Sinal novo');

-- 2.2 Não é Conta: nasce a candidata, com o motivo.
select is(
  (select row(r.resolved, r.is_new, r.target_account_id is null, r.discovered_account_id is not null, r.reopened)::text
   from public.record_signal_for_company('fa000000-0000-0000-0000-000000000001',
     '{"name":"Zeta Indústria Ltda","cnpj":"47.960.950/0001-21","website":"https://www.zeta.test","uf":"sp","sector":"Indústria"}',
     null, 'nova_filial_icp_g', 'filial|zeta|1', 'Abriu filial em Campinas', now() - interval '3 days', 'Diário Oficial', 'Ato 4', 35) r),
  '(candidata,t,t,t,f)', 'a empresa que não é Conta vira candidata');
insert into ids (chave, valor)
select 'zeta', d.id::text from private.discovered_accounts d where d.workspace_id = 'fa000000-0000-0000-0000-000000000001' and d.cnpj_key = '47960950000121';
select is(
  (select row(d.origin, d.state, d.name, d.domain, d.cnpj, d.uf, d.source_actor, d.fit_level, d.fit_score)::text
   from private.discovered_accounts d where d.id::text = (select valor from ids where chave = 'zeta')),
  '(sinal,nova,"Zeta Indústria Ltda",zeta.test,47960950000121,SP,sinal:nova_filial_icp_g,sem_dado,0)',
  'com a origem sinal, os dados da empresa e o encaixe ainda sem dado');
select is(
  (select row(g.target_account_id is null, g.phrase, r.weight)::text
   from private.signals g join private.discovery_reasons r on r.signal_id = g.id
   where g.discovered_account_id::text = (select valor from ids where chave = 'zeta')),
  '(t,"Abriu filial em Campinas",35)', 'o Sinal é da candidata e o motivo guarda o peso do tipo');
select is(
  (select r.is_new from public.record_signal_for_company('fa000000-0000-0000-0000-000000000001',
     '{"name":"Zeta","cnpj":"47960950000121"}', null, 'nova_filial_icp_g', 'filial|zeta|1',
     'Abriu filial em Campinas', now() - interval '3 days', 'Diário Oficial', 'Ato 4', 35) r),
  false, 'o mesmo acontecimento não vira outro Sinal');
select ok((select seen_again_at is not null from private.signals where event_key = 'filial|zeta|1'),
  'mas fica registrado que foi visto de novo');
-- Outro acontecimento da mesma empresa, achada só pelo domínio: a mesma candidata, mais um motivo.
select is(
  (select row(r.resolved, r.is_new, r.discovered_account_id::text = (select valor from ids where chave = 'zeta'))::text
   from public.record_signal_for_company('fa000000-0000-0000-0000-000000000001',
     '{"name":"Zeta Ind.","website":"https://zeta.test/imprensa"}', null, 'expansao_de_planta', 'planta|zeta|1',
     'Anunciou nova planta', now() - interval '1 day', 'Notícia', 'Nota 1', 40) r),
  '(candidata,t,t)', 'a mesma empresa, achada por outro dado, é a mesma candidata');
select is((select count(*)::integer from private.discovered_accounts where workspace_id = 'fa000000-0000-0000-0000-000000000001'), 1,
  'nunca duas candidatas para a mesma empresa');
select is((select count(*)::integer from private.discovery_reasons where discovered_account_id::text = (select valor from ids where chave = 'zeta')), 2,
  'o motivo foi acrescentado');
select is(
  (select row(d.domain_key, d.cnpj_key)::text from private.discovered_accounts d where d.id::text = (select valor from ids where chave = 'zeta')),
  '(zeta.test,47960950000121)', 'e as chaves de comparação seguem as da empresa');
-- Quem chega só com CNPJ (um Sinal de mercado traz só o CNPJ) completa a candidata que veio pelo domínio.
insert into private.discovered_accounts (id, workspace_id, name, domain, domain_key, website, name_key, source_actor, origin) values
  ('ca000000-0000-0000-0000-000000000009', 'fa000000-0000-0000-0000-000000000001', 'Sigma Lab', 'sigma.test', 'sigma.test', 'https://sigma.test', 'sigma lab', 'harvestapi~linkedin-company-search', 'busca');
select is(
  (select row(r.resolved, r.discovered_account_id)::text
   from public.record_signal_for_company('fa000000-0000-0000-0000-000000000001',
     '{"name":"Sigma Laboratórios","cnpj":"60746948000112","website":"https://sigma.test"}', null, 'financiamento_bndes_finep', 'fin|sigma|1',
     'Financiamento aprovado', now() - interval '2 days', 'Notícia', 'Nota 2', 40) r),
  '(candidata,ca000000-0000-0000-0000-000000000009)', 'a candidata que veio da busca recebe o Sinal');
select is(
  (select row(d.origin, d.cnpj_key, d.cnpj)::text from private.discovered_accounts d where d.id = 'ca000000-0000-0000-0000-000000000009'),
  '(sinal,60746948000112,60746948000112)', 'a origem passa de busca para sinal e o CNPJ que faltava entra');
update private.discovered_accounts set origin = 'sincronizacao' where id = 'ca000000-0000-0000-0000-000000000009';
select is(
  (select r.is_new from public.record_signal_for_company('fa000000-0000-0000-0000-000000000001',
     '{"name":"Sigma","website":"https://sigma.test"}', null, 'expansao_de_planta', 'planta|sigma|1',
     'Anunciou nova planta', now() - interval '1 day', 'Notícia', 'Nota 3', 40) r),
  true, 'outro Sinal para a mesma candidata');
select is((select origin from private.discovered_accounts where id = 'ca000000-0000-0000-0000-000000000009'), 'sincronizacao',
  'a origem sincronizacao nunca é trocada por um Sinal');

-- 2.3 Isolamento, identidade mínima, Conta arquivada e empresa que já é Conta por LinkedIn.
select is(
  (select r.discovered_account_id::text <> (select valor from ids where chave = 'zeta')
   from public.record_signal_for_company('fa000000-0000-0000-0000-000000000002',
     '{"name":"Zeta Indústria Ltda","cnpj":"47960950000121"}', null, 'nova_filial_icp_g', 'filial|zeta|1',
     'Abriu filial em Campinas', now() - interval '3 days', 'Diário Oficial', 'Ato 4', 35) r),
  true, 'o outro Workspace tem a candidata dele, separada');
select is((select count(*)::integer from private.signals where discovered_account_id::text = (select valor from ids where chave = 'zeta')), 2,
  'e a candidata do Norte não ganhou nada');
select is(
  (select row(r.resolved, r.is_new, r.target_account_id, r.discovered_account_id)::text
   from public.record_signal_for_company('fa000000-0000-0000-0000-000000000001',
     '{"name":"Sem Identidade"}', null, 'nova_filial_icp_g', 'filial|ninguem|1',
     'Abriu filial', now() - interval '1 day', 'Diário Oficial', 'Ato 5') r),
  '(sem_identidade,f,,)', 'sem CNPJ válido nem site, nada é gravado');
select is(
  (select r.resolved from public.record_signal_for_company('fa000000-0000-0000-0000-000000000001',
     '{"name":"CNPJ errado","cnpj":"11111111111111"}', null, 'nova_filial_icp_g', 'filial|errado|1',
     'Abriu filial', now() - interval '1 day', 'Diário Oficial', 'Ato 6') r),
  'sem_identidade', 'um CNPJ que não fecha não é identidade');
update public.target_accounts set archived_at = now(), archived_by = '5a000000-0000-0000-0000-000000000001' where id = 'da000000-0000-0000-0000-000000000004';
select is(
  (select row(r.resolved, r.is_new, r.target_account_id)::text
   from public.record_signal_for_company('fa000000-0000-0000-0000-000000000001',
     '{"name":"Delta","website":"https://delta.test"}', null, 'nova_filial_icp_g', 'filial|delta|1',
     'Abriu filial', now() - interval '1 day', 'Diário Oficial', 'Ato 7') r),
  '(conta_arquivada,f,da000000-0000-0000-0000-000000000004)', 'a Conta arquivada não recebe Sinal nem vira candidata');
select is((select count(*)::integer from private.signals where event_key = 'filial|delta|1'), 0, 'nada foi gravado para ela');
select is(
  (select r.resolved from public.record_signal_for_company('fa000000-0000-0000-0000-000000000001',
     '{"name":"Gama Dados Brasil","cnpj":"00000000000191","linkedinUrl":"https://br.linkedin.com/company/Gama-Dados"}', null,
     'nova_filial_icp_g', 'filial|gama|1', 'Abriu filial', now() - interval '1 day', 'Diário Oficial', 'Ato 8') r),
  'ja_e_conta', 'a empresa que a deduplicação reconhece como Conta (LinkedIn) não vira candidata');
select throws_ok(
  $$select * from public.record_signal_for_company('fa000000-0000-0000-0000-000000000001', '{"cnpj":"47960950000121"}',
    'aaaaaaaa-0000-0000-0000-000000000000', 'nova_filial_icp_g', 'k', 'f', now(), null, null)$$,
  'P0002', 'monitor not found', 'um Monitoramento que não existe é recusado');
select throws_ok(
  $$select * from public.record_signal_for_company('fa000000-0000-0000-0000-000000000001', '{"cnpj":"47960950000121"}',
    null, 'nova_filial_icp_g', 'k', 'f', now() + interval '3 days', null, null)$$,
  '22023', 'invalid signal date', 'uma data muito no futuro é recusada');

-- 2.4 O Sinal de mercado com CNPJ segue o mesmo caminho; sem CNPJ fica só no painel de Mercado.
select is(
  public.record_market_signal('fa000000-0000-0000-0000-000000000001', 'licenca_instalacao_dou', 'lic|1',
    'Licença de instalação publicada no DOU por IBAMA', now() - interval '1 day', 'Diário Oficial da União', 'Ato 9',
    '{"orgao":"IBAMA","cnpj":"33000167000101"}', 30),
  true, 'o Sinal de mercado é gravado');
select is(
  (select row(d.origin, d.name, d.cnpj_key)::text from private.discovered_accounts d
   where d.workspace_id = 'fa000000-0000-0000-0000-000000000001' and d.cnpj_key = '33000167000101'),
  '(sinal,"CNPJ 33.000.167/0001-01",33000167000101)', 'a empresa do CNPJ vira candidata, com o CNPJ no lugar do nome');
select is(
  (select row(r.weight, g.market_signal_id is not null, g.signal_type)::text
   from private.signals g join private.discovery_reasons r on r.signal_id = g.id
   join private.discovered_accounts d on d.id = g.discovered_account_id and d.cnpj_key = '33000167000101'),
  '(30,t,licenca_instalacao_dou)', 'o motivo guarda o peso e o vínculo com o Sinal de mercado');
select is(
  public.record_market_signal('fa000000-0000-0000-0000-000000000001', 'licenca_instalacao_dou', 'lic|1',
    'Licença de instalação publicada no DOU por IBAMA', now() - interval '1 day', 'Diário Oficial da União', 'Ato 9',
    '{"orgao":"IBAMA","cnpj":"33000167000101"}', 30),
  false, 'repetir o Sinal de mercado não grava de novo');
select is((select count(*)::integer from private.signals where event_key = 'lic|1'), 1, 'nem cria outro Sinal para a candidata');
select is(
  public.record_market_signal('fa000000-0000-0000-0000-000000000001', 'licenca_instalacao_dou', 'lic|2',
    'Licença de instalação publicada no DOU por IBAMA', now() - interval '1 day', 'Diário Oficial da União', 'Ato 10',
    '{"orgao":"IBAMA","cnpj":"11222333000181"}', 30),
  true, 'o Sinal de mercado de um CNPJ que já é Conta');
select is(
  (select row(g.target_account_id, g.market_signal_id is not null)::text from private.signals g where g.event_key = 'lic|2'),
  '(da000000-0000-0000-0000-000000000002,t)', 'vai para a Conta (por CNPJ) e guarda o vínculo');
select is(
  public.record_market_signal('fa000000-0000-0000-0000-000000000001', 'licenca_instalacao_dou', 'lic|3',
    'Licença de instalação publicada no DOU por IBAMA', now() - interval '1 day', 'Diário Oficial da União', 'Ato 11',
    '{"orgao":"IBAMA"}'),
  true, 'o Sinal de mercado sem empresa');
select is((select count(*)::integer from private.signals where event_key = 'lic|3'), 0, 'continua só como painel de contexto, sem candidata');
select is((select count(*)::integer from private.market_signals where event_key in ('lic|1', 'lic|2', 'lic|3')), 3,
  'e os três estão no feed de Mercado');

select is(
  (select count(*)::text from private.credit_entries) || '/' || (select count(*)::text from private.credit_reservations),
  (select valor from ids where chave = 'creditos'), 'criar candidata e gravar Sinal não gasta crédito');

-- 3. A regra do descarte (ticket 03).
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '5a000000-0000-0000-0000-000000000002', true);
select lives_ok(
  format($$select public.discard_discovered_account(%L, 'Fora do ICP: indústria pesada')$$, (select valor from ids where chave = 'zeta')),
  'o Membro descarta a candidata com um motivo');
reset role;
select is(
  (select row(state, discard_reason, decided_by)::text from private.discovered_accounts where id::text = (select valor from ids where chave = 'zeta')),
  '(descartada,"Fora do ICP: indústria pesada",5a000000-0000-0000-0000-000000000002)', 'ela fica descartada, com o motivo guardado');

-- A busca por ICP nunca a traz de volta.
insert into private.discovery_runs (id, workspace_id, requested_by, state, criteria, max_results, actor_id)
values ('aa000000-0000-0000-0000-000000000001', 'fa000000-0000-0000-0000-000000000001', '5a000000-0000-0000-0000-000000000002',
  'em_andamento', '{}', 50, 'harvestapi~linkedin-company-search');
select is(
  (select row(r.added, r.duplicates)::text from public.record_discovered_accounts('aa000000-0000-0000-0000-000000000001',
    '[{"name":"Zeta Indústria","cnpj":"47.960.950/0001-21"}]'::jsonb) r),
  '(0,1)', 'a busca pelo ICP trata a descartada como repetida');

-- Dentro dos 90 dias o Sinal só é registrado.
select is(
  (select row(r.resolved, r.is_new, r.reopened)::text from public.record_signal_for_company('fa000000-0000-0000-0000-000000000001',
    '{"name":"Zeta","cnpj":"47960950000121"}', null, 'nova_filial_icp_g', 'filial|zeta|2', 'Abriu outra filial', now(), 'Diário Oficial', 'Ato 12', 35) r),
  '(candidata,t,f)', 'dentro dos 90 dias o Sinal novo é registrado, sem reabrir');
select is(
  (select row(state, reopened_by_signal_at is null)::text from private.discovered_accounts where id::text = (select valor from ids where chave = 'zeta')),
  '(descartada,t)', 'e a candidata segue descartada');
select is((select count(*)::integer from private.signals where discovered_account_id::text = (select valor from ids where chave = 'zeta')), 3,
  'o Sinal ficou guardado nela');

-- Passados os 90 dias, um Sinal velho (de antes do descarte, ou que já venceu) também não reabre.
update private.discovered_accounts set decided_at = now() - interval '91 days'
where id::text = (select valor from ids where chave = 'zeta');
select is(
  (select r.reopened from public.record_signal_for_company('fa000000-0000-0000-0000-000000000001',
    '{"name":"Zeta","cnpj":"47960950000121"}', null, 'nova_filial_icp_g', 'filial|zeta|antigo', 'Abriu filial antiga',
    now() - interval '100 days', 'Diário Oficial', 'Ato 13', 35) r),
  false, 'um Sinal que aconteceu antes do descarte não reabre');
select is(
  (select r.reopened from public.record_signal_for_company('fa000000-0000-0000-0000-000000000001',
    '{"name":"Zeta","cnpj":"47960950000121"}', null, 'nova_filial_icp_g', 'filial|zeta|vencido', 'Abriu filial vencida',
    now() - interval '40 days', 'Diário Oficial', 'Ato 14', 35) r),
  false, 'nem um Sinal que já venceu (mais de 30 dias)');
select is(
  (select r.reopened from public.record_signal_for_company('fa000000-0000-0000-0000-000000000001',
    '{"name":"Zeta","cnpj":"47960950000121"}', null, 'nova_filial_icp_g', 'filial|zeta|2', 'Abriu outra filial', now(), 'Diário Oficial', 'Ato 12', 35) r),
  false, 'nem o reencontro de um Sinal que já estava registrado');
select is((select state from private.discovered_accounts where id::text = (select valor from ids where chave = 'zeta')), 'descartada',
  'a candidata segue descartada');

-- Um Sinal novo, que vale, depois do descarte e mais de 90 dias depois dele, reabre.
select is(
  (select row(r.resolved, r.is_new, r.reopened)::text from public.record_signal_for_company('fa000000-0000-0000-0000-000000000001',
    '{"name":"Zeta","cnpj":"47960950000121"}', null, 'financiamento_bndes_finep', 'fin|zeta|1', 'Financiamento aprovado',
    now() - interval '1 day', 'Notícia', 'Nota 4', 40) r),
  '(candidata,t,t)', 'um Sinal novo depois dos 90 dias reabre a candidata');
select is(
  (select row(state, origin, reopened_by_signal_at is not null, reopened_discard_reason, reopened_decided_at is not null,
    decided_at is null, decided_by is null, discard_reason is null)::text
   from private.discovered_accounts where id::text = (select valor from ids where chave = 'zeta')),
  '(nova,sinal,t,"Fora do ICP: indústria pesada",t,t,t,t)',
  'volta para nova, com o motivo do descarte anterior guardado e a decisão limpa');

-- O usuário descarta de novo: a reabertura anterior deixa de valer.
set local role authenticated;
select set_config('request.jwt.claim.sub', '5a000000-0000-0000-0000-000000000002', true);
select public.discard_discovered_account((select valor from ids where chave = 'zeta')::uuid, 'Ainda fora do ICP');
reset role;
select is(
  (select row(state, reopened_by_signal_at is null, reopened_discard_reason is null, discard_reason)::text
   from private.discovered_accounts where id::text = (select valor from ids where chave = 'zeta')),
  '(descartada,t,t,"Ainda fora do ICP")', 'descartar de novo limpa a reabertura e guarda o novo motivo');

-- Restaurar vale a qualquer momento, mesmo dentro dos 90 dias.
set local role authenticated;
select set_config('request.jwt.claim.sub', '5a000000-0000-0000-0000-000000000001', true);
select lives_ok(
  format($$select public.restore_discovered_account(%L)$$, (select valor from ids where chave = 'zeta')),
  'a pessoa restaura a candidata, mesmo dentro dos 90 dias');
reset role;
select is((select state from private.discovered_accounts where id::text = (select valor from ids where chave = 'zeta')), 'nova', 'e ela volta para nova');

-- A origem sincronizacao não é trocada na reabertura.
update private.discovered_accounts set state = 'descartada', decided_at = now() - interval '120 days', decided_by = '5a000000-0000-0000-0000-000000000001',
  origin = 'sincronizacao', discard_reason = 'Cliente antigo'
where id = 'ca000000-0000-0000-0000-000000000009';
select is(
  (select r.reopened from public.record_signal_for_company('fa000000-0000-0000-0000-000000000001',
    '{"name":"Sigma","website":"https://sigma.test"}', null, 'novo_cd_ou_filial', 'cd|sigma|1', 'Abriu novo CD',
    now() - interval '1 day', 'Notícia', 'Nota 5', 30) r),
  true, 'um Sinal novo reabre também a candidata que veio da sincronização');
select is((select origin from private.discovered_accounts where id = 'ca000000-0000-0000-0000-000000000009'), 'sincronizacao',
  'sem mudar a origem dela');

select * from finish();
rollback;
