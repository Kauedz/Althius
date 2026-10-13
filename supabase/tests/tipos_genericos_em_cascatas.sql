begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(48);

-- Tipos genéricos do catálogo atendidos pelas cascatas do Mapa de Mercado (auditoria de Sinais, 13/10/2026). Ana (Admin) e
-- Bruno (Membro) do Norte; Carla é do Sul. O banco liga o tipo genérico às cascatas de empresa que o servem, de qualquer ICP;
-- o estado do tipo é o melhor estado dessas cascatas, e o Sinal é gravado no tipo genérico.
insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
                        created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
                        is_sso_user, is_anonymous)
values
  ('5e000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'ana@norte.test', '', now(), now(), now(), '{}', '{}', false, false),
  ('5e000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'bruno@norte.test', '', now(), now(), now(), '{}', '{}', false, false),
  ('5e000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'carla@sul.test', '', now(), now(), now(), '{}', '{}', false, false);
insert into public.workspaces (id, kind, name) values
  ('fe000000-0000-0000-0000-000000000001', 'empresa', 'Norte'),
  ('fe000000-0000-0000-0000-000000000002', 'empresa', 'Sul');
insert into public.workspace_memberships (workspace_id, user_id, role, active) values
  ('fe000000-0000-0000-0000-000000000001', '5e000000-0000-0000-0000-000000000001', 'admin', true),
  ('fe000000-0000-0000-0000-000000000001', '5e000000-0000-0000-0000-000000000002', 'member', true),
  ('fe000000-0000-0000-0000-000000000002', '5e000000-0000-0000-0000-000000000003', 'admin', true);
insert into public.target_accounts (id, workspace_id, name, canonical_url, domain, created_by) values
  ('de000000-0000-0000-0000-000000000001', 'fe000000-0000-0000-0000-000000000001', 'Alfa', 'https://alfa.test', 'alfa.test', '5e000000-0000-0000-0000-000000000001'),
  ('de000000-0000-0000-0000-000000000002', 'fe000000-0000-0000-0000-000000000001', 'Beta', 'https://beta.test', 'beta.test', '5e000000-0000-0000-0000-000000000001'),
  ('de000000-0000-0000-0000-000000000009', 'fe000000-0000-0000-0000-000000000002', 'Sul S/A', 'https://sul.test', 'sul.test', '5e000000-0000-0000-0000-000000000003');

create temporary table r (k text primary key, id uuid) on commit drop;
grant all on r to authenticated;

-- 1. O mapeamento é um dado: cada tipo genérico e as cascatas que o servem, na ordem. O tipo `vaga_linkedin` (o card
-- "Abertura de vagas", que já tem actor) ganha as cascatas de vaga; os outros cinco são tipos novos do catálogo.
select is(
  (select jsonb_object_agg(signal_type, cascatas order by signal_type) from (
     select signal_type, array_agg(cascade_signal_type order by position) as cascatas
     from private.signal_type_cascades group by signal_type) x),
  '{
    "crescimento_de_equipes": ["cruzando_faixa_de_headcount"],
    "expansao_geografica": ["nova_filial_icp_g", "novo_cd_ou_filial", "nova_planta_filial"],
    "investimentos_anunciados": ["financiamento_bndes_finep", "expansao_de_planta"],
    "novo_escritorio": ["nova_planta_filial", "novo_cd_ou_filial", "troca_de_sede"],
    "registros_empresariais": ["cnpj_novo", "mudanca_de_porte_ou_regime", "entrada_de_socio"],
    "vaga_linkedin": ["vaga_comex", "vaga_logistica", "vaga_engenharia_manutencao"]
  }'::jsonb,
  'seis tipos do catálogo, ligados às cascatas de empresa que já existem (de ICPs diferentes)'
);
select is(
  (select count(distinct c.icp)::integer from private.signal_type_cascades a join private.signal_cascades c on c.signal_type = a.cascade_signal_type
   where a.signal_type = 'novo_escritorio'), 2,
  'sem restrição de ICP: o Novo escritório junta cascatas do ICP D e do ICP F'
);
select is(
  (select count(*)::integer from private.signal_type_cascades a join private.signal_cascades c on c.signal_type = a.cascade_signal_type
   where c.scope <> 'conta' or c.state = 'sem_fonte'), 0,
  'só cascata de empresa (escopo Conta) e com fonte atende um tipo genérico: o evento é na empresa compradora, nunca no mercado'
);
select is(
  (select array_agg(row(signal_type, origin)::text order by signal_type) from private.signal_catalog
   where signal_type in ('novo_escritorio', 'registros_empresariais', 'investimentos_anunciados', 'crescimento_de_equipes', 'expansao_geografica')),
  array['(crescimento_de_equipes,externo)', '(expansao_geografica,externo)', '(investimentos_anunciados,externo)',
        '(novo_escritorio,externo)', '(registros_empresariais,externo)'],
  'os cinco tipos novos entram no catálogo como externos'
);
select is(
  (select count(*)::integer from private.signal_cascades where signal_type in
    ('novo_escritorio', 'registros_empresariais', 'investimentos_anunciados', 'crescimento_de_equipes', 'expansao_geografica')), 0,
  'nenhum deles é uma cascata nem tem actor: o tipo genérico só junta cascatas que já existem'
);

-- 2. O estado do tipo é o melhor estado das cascatas ligadas. Hoje todas estão em teste.
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '5e000000-0000-0000-0000-000000000002', true);
select is(
  (select jsonb_object_agg(signal_type, state order by signal_type) from public.list_signal_catalog()
   where signal_type in ('novo_escritorio', 'registros_empresariais', 'investimentos_anunciados', 'crescimento_de_equipes', 'expansao_geografica', 'vaga_linkedin')),
  '{"crescimento_de_equipes":"testing","expansao_geografica":"testing","investimentos_anunciados":"testing","novo_escritorio":"testing","registros_empresariais":"testing","vaga_linkedin":"testing"}'::jsonb,
  'com todas as cascatas em teste, os seis tipos aparecem em teste (não mais fora)'
);
select is(
  (select jsonb_object_agg(signal_type, state order by signal_type) from public.list_signal_catalog() where signal_type in ('vaga_comex', 'sem_resposta')),
  '{"sem_resposta":"available","vaga_comex":"testing"}'::jsonb,
  'o estado dos tipos que já existiam não muda'
);
select throws_ok(
  $$select public.save_signal_monitor('fe000000-0000-0000-0000-000000000001', null, 'novo_escritorio', 'Novos escritórios', 'rascunho', '{}', '{}', 24)$$,
  '55000', 'signal type is not available', 'com todas as cascatas em teste, o tipo genérico não aceita Monitoramento'
);

-- 3. A equipe valida uma cascata numa execução real e a marca disponível (passo do Nan): os tipos que a usam acompanham.
reset role;
select lives_ok($$select public.set_signal_cascade_state('nova_planta_filial', 'available')$$, 'a equipe marca nova_planta_filial como disponível');
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '5e000000-0000-0000-0000-000000000002', true);
select is(
  (select jsonb_object_agg(signal_type, state order by signal_type) from public.list_signal_catalog()
   where signal_type in ('novo_escritorio', 'registros_empresariais', 'investimentos_anunciados', 'crescimento_de_equipes', 'expansao_geografica', 'vaga_linkedin')),
  '{"crescimento_de_equipes":"testing","expansao_geografica":"available","investimentos_anunciados":"testing","novo_escritorio":"available","registros_empresariais":"testing","vaga_linkedin":"testing"}'::jsonb,
  'Novo escritório e Expansão geográfica ficam disponíveis; os outros continuam em teste'
);

-- 4. Um tipo genérico disponível aceita Monitoramento, com a configuração própria de qualquer participante.
insert into r (k, id) select 'esc', public.save_signal_monitor('fe000000-0000-0000-0000-000000000001', null, 'novo_escritorio', 'Novos escritórios', 'ativo',
  '{"accountIds":["de000000-0000-0000-0000-000000000001","de000000-0000-0000-0000-000000000002"]}', '{}', 24);
select is(
  (select row(signal_type, state)::text from public.list_signal_monitors('fe000000-0000-0000-0000-000000000001')
   where id = (select id from r where k = 'esc')),
  '(novo_escritorio,ativo)', 'o Monitoramento do tipo genérico fica gravado e ativo'
);
select throws_ok(
  $$select public.save_signal_monitor('fe000000-0000-0000-0000-000000000001', null, 'registros_empresariais', 'Registros', 'rascunho', '{}', '{}', 24)$$,
  '55000', 'signal type is not available', 'o tipo genérico em teste continua recusando Monitoramento'
);
select throws_ok(
  $$select public.save_signal_monitor('fe000000-0000-0000-0000-000000000001', null, 'novo_escritorio', 'Intruso', 'rascunho',
    '{"accountIds":["de000000-0000-0000-0000-000000000009"]}', '{}', 24)$$,
  '22023', 'invalid monitor', 'Conta de outro Workspace no público é recusada'
);

-- 5. O relógio do signal-runner reivindica o Monitoramento do tipo genérico, com as Contas do público.
reset role;
select is(
  (select row(signal_type, jsonb_array_length(accounts))::text from public.claim_due_signal_monitors(10)
   where monitor_id = (select id from r where k = 'esc')),
  '(novo_escritorio,2)', 'o signal-runner reivindica o tipo genérico com as duas Contas'
);
select is(private.signal_type_is_runnable('registros_empresariais'), false, 'o tipo genérico em teste não é rodável');
select is(private.signal_type_is_runnable('novo_escritorio'), true, 'o tipo genérico com cascata disponível é rodável');

-- 6. O plano do Monitoramento: as cascatas do tipo, o estado de cada uma e se estão no prazo da cadência dela.
select is(
  (select jsonb_object_agg(cascade_signal_type, jsonb_build_array(state, due) order by cascade_signal_type)
   from public.signal_type_cascade_plan((select id from r where k = 'esc'))),
  '{"nova_planta_filial":["available",true],"novo_cd_ou_filial":["testing",true],"troca_de_sede":["testing",true]}'::jsonb,
  'o plano traz as três cascatas do Novo escritório; só a nova_planta_filial está disponível, e ainda não rodou'
);
select is(
  (select array_agg(cascade_signal_type) from public.signal_type_cascade_plan((select id from r where k = 'esc'))),
  array['nova_planta_filial', 'novo_cd_ou_filial', 'troca_de_sede'], 'na ordem do mapeamento'
);

-- A cascata roda para o Monitoramento: uma execução concluída tira a cascata do plano até a cadência dela (720 h) vencer.
insert into private.signal_cascade_runs (workspace_id, cascade_id, origin, monitor_id, idempotency_key, state, est_cost_usd, est_credits, cap_usd, started_at)
select 'fe000000-0000-0000-0000-000000000001', c.id, 'monitor', (select id from r where k = 'esc'), 'monitor:falhou', 'failed', 0.1, 1, 0.5, now() - interval '1 hour'
from private.signal_cascades c where c.signal_type = 'nova_planta_filial';
select is(
  (select due from public.signal_type_cascade_plan((select id from r where k = 'esc')) where cascade_signal_type = 'nova_planta_filial'), true,
  'uma execução que falhou não conta: a cascata continua devida'
);
insert into private.signal_cascade_runs (workspace_id, cascade_id, origin, monitor_id, idempotency_key, state, est_cost_usd, est_credits, cap_usd, started_at)
select 'fe000000-0000-0000-0000-000000000001', c.id, 'monitor', (select id from r where k = 'esc'), 'monitor:ok', 'succeeded', 0.1, 1, 0.5, now() - interval '10 days'
from private.signal_cascades c where c.signal_type = 'nova_planta_filial';
select is(
  (select due from public.signal_type_cascade_plan((select id from r where k = 'esc')) where cascade_signal_type = 'nova_planta_filial'), false,
  'uma execução concluída há 10 dias, dentro da cadência de 30 dias, tira a cascata do plano'
);
update private.signal_cascade_runs set started_at = now() - interval '31 days' where idempotency_key = 'monitor:ok';
select is(
  (select due from public.signal_type_cascade_plan((select id from r where k = 'esc')) where cascade_signal_type = 'nova_planta_filial'), true,
  'passada a cadência, a cascata volta ao plano'
);
update private.signal_cascade_runs set started_at = now() - interval '1 day' where idempotency_key = 'monitor:ok';
insert into private.signal_cascade_runs (workspace_id, cascade_id, origin, monitor_id, idempotency_key, state, est_cost_usd, est_credits, cap_usd, started_at)
select 'fe000000-0000-0000-0000-000000000001', c.id, 'conversa', null, 'conversa:ok', 'succeeded', 0.1, 1, 0.5, now() - interval '1 hour'
from private.signal_cascades c where c.signal_type = 'novo_cd_ou_filial';
select is(
  (select due from public.signal_type_cascade_plan((select id from r where k = 'esc')) where cascade_signal_type = 'novo_cd_ou_filial'), true,
  'a busca feita numa conversa não vale pela rodada do Monitoramento'
);
select is(
  (select count(*)::integer from public.signal_type_cascade_plan('00000000-0000-0000-0000-00000000dead')), 0,
  'um Monitoramento que não existe não tem plano'
);

-- 7. O Sinal de uma cascata é gravado no tipo genérico, que é o do Monitoramento; o mesmo acontecimento conta uma vez.
select is(
  private.record_signal('fe000000-0000-0000-0000-000000000001', 'de000000-0000-0000-0000-000000000001', (select id from r where k = 'esc'),
    'novo_escritorio', 'filial|11222333000181', 'Nova filial em Curitiba', now() - interval '2 days', 'Receita Federal', 'Filial aberta em Curitiba.'),
  true, 'o Sinal da cascata entra no tipo genérico'
);
select is(
  private.record_signal('fe000000-0000-0000-0000-000000000001', 'de000000-0000-0000-0000-000000000001', (select id from r where k = 'esc'),
    'novo_escritorio', 'filial|11222333000181', 'Nova filial em Curitiba', now() - interval '2 days', 'Receita Federal', 'Filial aberta em Curitiba.'),
  false, 'achado de novo (por outra cascata, por exemplo), não conta duas vezes'
);
select throws_ok(
  $$select private.record_signal('fe000000-0000-0000-0000-000000000001', 'de000000-0000-0000-0000-000000000001', (select id from r where k = 'esc'),
    'nova_planta_filial', 'filial|x', 'Frase', now(), 'Receita Federal', 'e')$$,
  '22023', 'the monitor does not match the signal type', 'o Monitoramento do tipo genérico não grava no tipo da cascata'
);
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '5e000000-0000-0000-0000-000000000002', true);
select is(
  (select row(signal_type, source, valid)::text from public.list_signals('fe000000-0000-0000-0000-000000000001', 'de000000-0000-0000-0000-000000000001')),
  '(novo_escritorio,"Receita Federal",t)', 'a tela lê o Sinal no tipo genérico, com a fonte'
);
select is(
  (select row(valid_signals, hot)::text from public.list_account_signals('fe000000-0000-0000-0000-000000000001')
   where target_account_id = 'de000000-0000-0000-0000-000000000001'),
  '(1,t)', 'Alfa fica Quente pelo Sinal'
);

-- 8. O tipo que já tinha actor (Abertura de vagas) ganha as cascatas de vaga sem perder o actor: o estado é o melhor dos dois.
reset role;
select lives_ok($$select public.set_signal_cascade_state('vaga_comex', 'available')$$, 'a equipe marca vaga_comex como disponível');
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '5e000000-0000-0000-0000-000000000002', true);
select is(
  (select state from public.list_signal_catalog() where signal_type = 'vaga_linkedin'), 'available',
  'o actor de vagas em teste e uma cascata de vaga disponível: Abertura de vagas fica disponível'
);
-- O actor disponível mantém o tipo disponível, mesmo com as cascatas de vaga em teste.
reset role;
select lives_ok($$select public.set_signal_cascade_state('vaga_comex', 'testing')$$, 'vaga_comex volta para teste');
select lives_ok($$select public.set_signal_actor_state('curious_coder~linkedin-jobs-scraper', 'available')$$, 'o actor de vagas passa no teste');
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '5e000000-0000-0000-0000-000000000002', true);
select is(
  (select state from public.list_signal_catalog() where signal_type = 'vaga_linkedin'), 'available',
  'com o actor disponível e as cascatas em teste, a Abertura de vagas continua disponível'
);

-- 9. Cascata sem fonte não conta: um tipo cujas cascatas estão todas fora aparece fora, e não em teste.
reset role;
insert into private.signal_catalog (signal_type, origin) values ('tipo_so_sem_fonte', 'externo');
insert into private.signal_type_cascades (signal_type, cascade_signal_type, position) values ('tipo_so_sem_fonte', 'caged_por_empresa', 1);
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '5e000000-0000-0000-0000-000000000002', true);
select is(
  (select state from public.list_signal_catalog() where signal_type = 'tipo_so_sem_fonte'), 'out',
  'o tipo que só tem cascata sem fonte aparece fora'
);
reset role;
select is(private.signal_type_is_runnable('tipo_so_sem_fonte'), false, 'e não é rodável');

-- 10. As regras do mapeamento, no banco: só cascata de empresa, nunca de mercado; um tipo genérico não é cascata nem interno.
select throws_ok(
  $$insert into private.signal_type_cascades (signal_type, cascade_signal_type, position) values ('tipo_so_sem_fonte', 'volume_por_porto', 2)$$,
  '23514', 'a generic signal type is served only by account cascades', 'cascata de mercado não atende um tipo genérico'
);
select throws_ok(
  $$insert into private.signal_type_cascades (signal_type, cascade_signal_type, position) values ('vaga_comex', 'vaga_logistica', 1)$$,
  '23514', 'a cascade cannot be a generic signal type', 'uma cascata não vira tipo genérico'
);
select throws_ok(
  $$insert into private.signal_type_cascades (signal_type, cascade_signal_type, position) values ('sem_resposta', 'vaga_logistica', 1)$$,
  '23514', 'an internal signal cannot be a generic signal type', 'um Sinal interno não vira tipo genérico'
);
select throws_ok(
  $$insert into private.signal_type_cascades (signal_type, cascade_signal_type, position) values ('tipo_so_sem_fonte', 'cascata_que_nao_existe', 3)$$,
  '23503', null, 'a cascata tem de existir'
);
select throws_ok(
  $$insert into private.signal_type_cascades (signal_type, cascade_signal_type, position) values ('tipo_que_nao_existe', 'vaga_logistica', 1)$$,
  '23503', null, 'o tipo tem de estar no catálogo'
);
select throws_ok(
  $$insert into private.signal_type_cascades (signal_type, cascade_signal_type, position) values ('novo_escritorio', 'nova_planta_filial', 9)$$,
  '23505', null, 'a mesma cascata não entra duas vezes no mesmo tipo'
);
select throws_ok(
  $$update private.signal_cascades set scope = 'mercado' where signal_type = 'nova_planta_filial'$$,
  '23514', 'a cascade that serves a generic signal type must stay an account cascade', 'a cascata que atende um tipo genérico não vira de mercado depois'
);

-- 11. Permissões: o mapeamento e o plano são do servidor.
select is(
  (select count(*)::integer from information_schema.table_privileges
   where table_schema = 'private' and table_name = 'signal_type_cascades' and grantee in ('anon', 'authenticated', 'service_role')), 0,
  'o mapeamento só se lê pelas funções'
);
select ok(
  (select c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'private' and c.relname = 'signal_type_cascades'),
  'RLS ligado na tabela nova'
);
select ok(
  has_function_privilege('service_role', 'public.signal_type_cascade_plan(uuid)', 'execute')
    and not has_function_privilege('authenticated', 'public.signal_type_cascade_plan(uuid)', 'execute')
    and not has_function_privilege('anon', 'public.signal_type_cascade_plan(uuid)', 'execute'),
  'o plano é só do servidor'
);

-- 12. Quem é de fora não cria Monitoramento no Norte, e o catálogo exige sessão.
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '5e000000-0000-0000-0000-000000000003', true);
select throws_ok(
  $$select public.save_signal_monitor('fe000000-0000-0000-0000-000000000001', null, 'novo_escritorio', 'Intrusa', 'rascunho', '{}', '{}', 24)$$,
  '42501', 'active workspace membership required', 'quem é de fora não cria Monitoramento no Norte'
);
select is(
  (select count(*)::integer from public.list_signals('fe000000-0000-0000-0000-000000000002')), 0,
  'o Sul não recebe Sinal do Norte'
);
select set_config('request.jwt.claim.sub', '', true);
select throws_ok(
  $$select * from public.list_signal_catalog()$$,
  '42501', 'authentication required', 'o catálogo exige uma sessão'
);

select * from finish();
rollback;
