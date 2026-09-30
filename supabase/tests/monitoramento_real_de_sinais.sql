begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(31);

-- Ana (Admin), Bruno (Membro) e Diego (Membro) do Norte; Carla é de fora.
insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
                        created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
                        is_sso_user, is_anonymous)
values
  ('56000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'ana@norte.test', '', now(), now(), now(), '{}', '{}', false, false),
  ('56000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'bruno@norte.test', '', now(), now(), now(), '{}', '{}', false, false),
  ('56000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'carla@fora.test', '', now(), now(), now(), '{}', '{}', false, false),
  ('56000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'diego@norte.test', '', now(), now(), now(), '{}', '{}', false, false);
insert into public.workspaces (id, kind, name) values
  ('f6000000-0000-0000-0000-000000000001', 'empresa', 'Norte'),
  ('f6000000-0000-0000-0000-000000000002', 'empresa', 'Sul');
insert into public.workspace_memberships (workspace_id, user_id, role, active) values
  ('f6000000-0000-0000-0000-000000000001', '56000000-0000-0000-0000-000000000001', 'admin', true),
  ('f6000000-0000-0000-0000-000000000001', '56000000-0000-0000-0000-000000000002', 'member', true),
  ('f6000000-0000-0000-0000-000000000001', '56000000-0000-0000-0000-000000000004', 'member', true),
  ('f6000000-0000-0000-0000-000000000002', '56000000-0000-0000-0000-000000000003', 'admin', true);
insert into public.target_accounts (id, workspace_id, name, canonical_url, domain, created_by) values
  ('d6000000-0000-0000-0000-000000000001', 'f6000000-0000-0000-0000-000000000001', 'Alfa', 'https://alfa.test', 'alfa.test', '56000000-0000-0000-0000-000000000001'),
  ('d6000000-0000-0000-0000-000000000003', 'f6000000-0000-0000-0000-000000000001', 'Beta', 'https://beta.test', 'beta.test', '56000000-0000-0000-0000-000000000001'),
  ('d6000000-0000-0000-0000-000000000004', 'f6000000-0000-0000-0000-000000000001', 'Gama', 'https://gama.test', 'gama.test', '56000000-0000-0000-0000-000000000001'),
  ('d6000000-0000-0000-0000-000000000002', 'f6000000-0000-0000-0000-000000000002', 'Sul S/A', 'https://sul.test', 'sul.test', '56000000-0000-0000-0000-000000000003');

create temporary table r (k text primary key, id uuid) on commit drop;
grant all on r to authenticated;

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '56000000-0000-0000-0000-000000000002', true);

-- 1. Só cria Monitoramento de um Sinal cujo actor foi marcado disponível.
select throws_ok(
  $$select public.save_signal_monitor('f6000000-0000-0000-0000-000000000001', null, 'vaga_linkedin', 'Vagas de dados', 'rascunho',
      '{"accountIds":["d6000000-0000-0000-0000-000000000001"]}', '{}', 24)$$,
  '55000', 'signal type is not available', 'Sinal em teste ainda não cria Monitoramento'
);
select throws_ok(
  $$select public.save_signal_monitor('f6000000-0000-0000-0000-000000000001', null, 'inexistente', 'X', 'rascunho', '{}', '{}', 24)$$,
  '55000', 'signal type is not available', 'Sinal fora do registro também não'
);

reset role;
select public.set_signal_actor_state('curious_coder~linkedin-jobs-scraper', 'available', 'v1');
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);

-- 2. Com o actor disponível, qualquer participante cria; o Monitoramento guarda o público e os critérios.
insert into r select 'mon', public.save_signal_monitor('f6000000-0000-0000-0000-000000000001', null, 'vaga_linkedin', 'Vagas de dados', 'rascunho',
  '{"accountIds":["d6000000-0000-0000-0000-000000000001"]}', '{"palavras":["dados"]}', 24);
select is(
  (select row(name, state, every_hours, audience -> 'accountIds' ->> 0)::text
   from public.list_signal_monitors('f6000000-0000-0000-0000-000000000001') where name = 'Vagas de dados'),
  '("Vagas de dados",rascunho,24,d6000000-0000-0000-0000-000000000001)', 'o Monitoramento aparece na lista do Workspace'
);
select throws_ok(
  $$select public.save_signal_monitor('f6000000-0000-0000-0000-000000000001', null, 'vaga_linkedin', '  ', 'rascunho', '{}', '{}', 24)$$,
  '22023', 'invalid monitor', 'nome vazio é recusado'
);
select throws_ok(
  $$select public.save_signal_monitor('f6000000-0000-0000-0000-000000000001', null, 'vaga_linkedin', 'Ruim', 'rascunho', '{"accountIds":["nao-e-uuid"]}', '{}', 24)$$,
  '22023', 'invalid monitor', 'público com identificador que não é uuid é recusado'
);
select throws_ok(
  $$select public.save_signal_monitor('f6000000-0000-0000-0000-000000000001', null, 'vaga_linkedin', 'Ruim', 'rascunho', '{"accountIds":["d6000000-0000-0000-0000-000000000002"]}', '{}', 24)$$,
  '22023', 'invalid monitor', 'Conta de outro Workspace no público é recusada'
);

-- 3. Ativo só com pelo menos uma Conta no público.
insert into r select 'vazio', public.save_signal_monitor('f6000000-0000-0000-0000-000000000001', null, 'vaga_linkedin', 'Sem público', 'rascunho', '{}', '{}', 24);
select throws_ok(
  format($$select public.set_signal_monitor_state(%L, 'ativo')$$, (select id from r where k = 'vazio')),
  '22023', 'an active monitor needs at least one target account', 'ativo sem Conta no público é recusado'
);
select lives_ok(format($$select public.set_signal_monitor_state(%L, 'ativo')$$, (select id from r where k = 'mon')), 'com Conta no público, ativa');

-- 4. Só quem criou (ou o Administrador) muda ou apaga.
select set_config('request.jwt.claim.sub', '56000000-0000-0000-0000-000000000004', true);
select throws_ok(
  format($$select public.set_signal_monitor_state(%L, 'pausado')$$, (select id from r where k = 'mon')),
  '42501', 'only the creator or an administrator can change this monitor', 'outro membro não pausa o Monitoramento alheio'
);
select set_config('request.jwt.claim.sub', '56000000-0000-0000-0000-000000000001', true);
select lives_ok(format($$select public.set_signal_monitor_state(%L, 'pausado')$$, (select id from r where k = 'mon')), 'o Administrador pausa');
select set_config('request.jwt.claim.sub', '56000000-0000-0000-0000-000000000003', true);
select throws_ok(
  $$select * from public.list_signal_monitors('f6000000-0000-0000-0000-000000000001')$$,
  '42501', 'active workspace membership required', 'quem é de fora não lista'
);

-- 5. Um Sinal real entra pelo servidor, com data, fonte e evidência; o mesmo acontecimento conta uma vez.
reset role;
select set_config('request.jwt.claim.sub', '56000000-0000-0000-0000-000000000001', true);
select is(
  private.record_signal('f6000000-0000-0000-0000-000000000001', 'd6000000-0000-0000-0000-000000000001',
    (select id from r where k = 'mon'), 'vaga_linkedin', 'alfa|analista-de-dados|2026-09-20',
    'Abriu vaga de analista de dados', now() - interval '3 days', 'LinkedIn', 'linkedin.com/jobs/1'),
  true, 'o primeiro Sinal de um acontecimento é novo'
);
select is(
  private.record_signal('f6000000-0000-0000-0000-000000000001', 'd6000000-0000-0000-0000-000000000001',
    (select id from r where k = 'mon'), 'vaga_linkedin', 'alfa|analista-de-dados|2026-09-20',
    'Abriu vaga de analista de dados', now(), 'LinkedIn', 'linkedin.com/jobs/1'),
  false, 'reencontrar o mesmo acontecimento não gera outro Sinal'
);
select is((select count(*)::integer from private.signals), 1, 'e só há um Sinal gravado');
select is(
  (select fired_at < now() - interval '2 days' from private.signals),
  true, 'o reencontro não renova a data do disparo'
);
select isnt((select seen_again_at from private.signals), null, 'mas o reencontro fica registrado');
select is(
  private.record_signal('f6000000-0000-0000-0000-000000000001', 'd6000000-0000-0000-0000-000000000001',
    (select id from r where k = 'mon'), 'vaga_linkedin', 'alfa|engenheiro|2026-09-25',
    'Abriu vaga de engenheiro de dados', now() - interval '1 day', 'LinkedIn', 'linkedin.com/jobs/2'),
  true, 'outro acontecimento é outro Sinal'
);

-- 6. O Sinal deixa a Conta Quente: o foguinho conta os Sinais válidos; o cartão do kanban vai para Quente.
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select is(
  (select row(valid_signals, hot, last_phrase)::text from public.list_account_signals('f6000000-0000-0000-0000-000000000001')
   where target_account_id = 'd6000000-0000-0000-0000-000000000001'),
  '(2,t,"Abriu vaga de engenheiro de dados")', 'duas vagas válidas: Quente, com o último Sinal'
);
select is(
  (select stage from public.list_prospecting_stages('f6000000-0000-0000-0000-000000000001')
   where target_account_id = 'd6000000-0000-0000-0000-000000000001'),
  'quente', 'e o kanban leva a Conta para Quente'
);
select is(
  (select evidence from public.list_signals('f6000000-0000-0000-0000-000000000001', 'd6000000-0000-0000-0000-000000000001')
   where event_key = 'alfa|engenheiro|2026-09-25'),
  'linkedin.com/jobs/2', 'a lista de Sinais traz a evidência'
);

-- 7. Um Sinal que já chega com mais de 30 dias fica no histórico, mas não deixa a Conta Quente nem move o cartão.
reset role;
select is(
  private.record_signal('f6000000-0000-0000-0000-000000000001', 'd6000000-0000-0000-0000-000000000004',
    (select id from r where k = 'mon'), 'vaga_linkedin', 'gama|antiga', 'Vaga antiga', now() - interval '40 days', 'LinkedIn', 'linkedin.com/jobs/9'),
  true, 'o Sinal antigo é gravado no histórico'
);
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select is(
  (select row(valid_signals, hot)::text from public.list_account_signals('f6000000-0000-0000-0000-000000000001')
   where target_account_id = 'd6000000-0000-0000-0000-000000000004'),
  '(0,f)', 'mas a Conta não fica Quente'
);
select is(
  (select stage from public.list_prospecting_stages('f6000000-0000-0000-0000-000000000001')
   where target_account_id = 'd6000000-0000-0000-0000-000000000004'),
  'descoberta', 'nem o cartão sai de Descoberta'
);

-- 8. Quando os Sinais vencem antes da abordagem, a Conta deixa de ser Quente e o cartão volta a Descoberta.
reset role;
select private.record_signal('f6000000-0000-0000-0000-000000000001', 'd6000000-0000-0000-0000-000000000003',
  (select id from r where k = 'mon'), 'vaga_linkedin', 'beta|1', 'Vaga da Beta', now() - interval '29 days', 'LinkedIn', 'linkedin.com/jobs/5');
select is((select stage from private.prospecting_stages where target_account_id = 'd6000000-0000-0000-0000-000000000003'), 'quente', 'a Beta ficou Quente');
select is(private.expire_signals(), 0, 'com o Sinal ainda válido, nada vence');
update private.signals set fired_at = now() - interval '31 days' where event_key = 'beta|1';
select is(private.expire_signals(), 1, 'passados 30 dias, a Beta perde o Quente');
select is((select stage from private.prospecting_stages where target_account_id = 'd6000000-0000-0000-0000-000000000003'), 'descoberta', 'e volta a Descoberta');
select is(
  (select count(*)::integer from private.prospecting_stage_history
   where target_account_id = 'd6000000-0000-0000-0000-000000000003' and event = 'sinais_vencidos'),
  1, 'com o evento no histórico'
);
select is(private.expire_signals(), 0, 'rodar de novo não repete');
-- Depois da abordagem, o vencimento não tira o cartão de onde ele está.
select private.record_signal('f6000000-0000-0000-0000-000000000001', 'd6000000-0000-0000-0000-000000000003',
  (select id from r where k = 'mon'), 'vaga_linkedin', 'beta|2', 'Outra vaga', now() - interval '2 days', 'LinkedIn', 'linkedin.com/jobs/6');
select private.advance_prospecting_stage('f6000000-0000-0000-0000-000000000001', 'd6000000-0000-0000-0000-000000000003', 'em_abordagem', 'envio');
update private.signals set fired_at = now() - interval '35 days' where event_key = 'beta|2';
select private.expire_signals();
select is((select stage from private.prospecting_stages where target_account_id = 'd6000000-0000-0000-0000-000000000003'), 'em_abordagem', 'depois da abordagem, o vencimento não volta o cartão');

-- 9. Ninguém do app grava Sinal nem roda o vencimento.
select ok(
  not has_function_privilege('authenticated', 'private.record_signal(uuid, uuid, uuid, text, text, text, timestamptz, text, text)', 'execute')
    and not has_table_privilege('authenticated', 'private.signals', 'select'),
  'gravar Sinal é só do servidor'
);

select * from finish();
rollback;
