begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(74);

-- Ana (Admin), Bruno (Membro) e Diego (Membro) do Norte; Carla é de fora.
insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
                        created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
                        is_sso_user, is_anonymous)
values
  ('58000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'ana@norte.test', '', now(), now(), now(), '{}', '{}', false, false),
  ('58000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'bruno@norte.test', '', now(), now(), now(), '{}', '{}', false, false),
  ('58000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'carla@fora.test', '', now(), now(), now(), '{}', '{}', false, false),
  ('58000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'diego@norte.test', '', now(), now(), now(), '{}', '{}', false, false);
insert into public.workspaces (id, kind, name) values
  ('f8000000-0000-0000-0000-000000000001', 'empresa', 'Norte'),
  ('f8000000-0000-0000-0000-000000000002', 'empresa', 'Sul');
insert into public.workspace_memberships (workspace_id, user_id, role, active) values
  ('f8000000-0000-0000-0000-000000000001', '58000000-0000-0000-0000-000000000001', 'admin', true),
  ('f8000000-0000-0000-0000-000000000001', '58000000-0000-0000-0000-000000000002', 'member', true),
  ('f8000000-0000-0000-0000-000000000001', '58000000-0000-0000-0000-000000000004', 'member', true),
  ('f8000000-0000-0000-0000-000000000002', '58000000-0000-0000-0000-000000000003', 'admin', true);
insert into public.target_accounts (id, workspace_id, name, canonical_url, domain, linkedin_url, created_by) values
  ('d8000000-0000-0000-0000-000000000001', 'f8000000-0000-0000-0000-000000000001', 'Alfa', 'https://alfa.test', 'alfa.test', 'https://linkedin.com/company/alfa', '58000000-0000-0000-0000-000000000001'),
  ('d8000000-0000-0000-0000-000000000002', 'f8000000-0000-0000-0000-000000000001', 'Beta', 'https://beta.test', 'beta.test', null, '58000000-0000-0000-0000-000000000001'),
  ('d8000000-0000-0000-0000-000000000003', 'f8000000-0000-0000-0000-000000000001', 'Gama', 'https://gama.test', 'gama.test', null, '58000000-0000-0000-0000-000000000001'),
  ('d8000000-0000-0000-0000-000000000004', 'f8000000-0000-0000-0000-000000000001', 'Delta', 'https://delta.test', 'delta.test', null, '58000000-0000-0000-0000-000000000001'),
  ('d8000000-0000-0000-0000-000000000005', 'f8000000-0000-0000-0000-000000000001', 'Epsilon', 'https://epsilon.test', 'epsilon.test', null, '58000000-0000-0000-0000-000000000001'),
  ('d8000000-0000-0000-0000-000000000006', 'f8000000-0000-0000-0000-000000000001', 'Zeta', 'https://zeta.test', 'zeta.test', null, '58000000-0000-0000-0000-000000000001'),
  ('d8000000-0000-0000-0000-000000000009', 'f8000000-0000-0000-0000-000000000002', 'Sul S/A', 'https://sul.test', 'sul.test', null, '58000000-0000-0000-0000-000000000003');

create temporary table r (k text primary key, id uuid) on commit drop;
grant all on r to authenticated;

-- 1. Sem Monitoramento ativo não há o que buscar: o custo é zero e o pedido é recusado.
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '58000000-0000-0000-0000-000000000002', true);
select is(
  (select row(monitors, credits)::text from public.quote_account_rescan('f8000000-0000-0000-0000-000000000001', 'd8000000-0000-0000-0000-000000000001')),
  '(0,0.00)', 'sem Monitoramento ativo, o custo de buscar de novo é zero'
);
select throws_ok(
  $$select public.request_account_rescan('f8000000-0000-0000-0000-000000000001', 'd8000000-0000-0000-0000-000000000001')$$,
  '22023', 'no active monitor to search with', 'e o pedido é recusado, sem varredura vazia'
);

-- 2. Só conta o Monitoramento ativo de um Sinal cujo actor está disponível; o custo é 1 crédito por Monitoramento.
reset role;
select public.set_signal_actor_state('curious_coder~linkedin-jobs-scraper', 'available', 'v1');
select public.set_signal_actor_state('harvestapi~linkedin-profile-search', 'available', 'v1');
select public.set_signal_actor_state('valig~indeed-jobs-scraper', 'available', 'v1');
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '58000000-0000-0000-0000-000000000001', true);
insert into r select 'vagas', public.save_signal_monitor('f8000000-0000-0000-0000-000000000001', null, 'vaga_linkedin', 'Vagas', 'ativo',
  '{"accountIds":["d8000000-0000-0000-0000-000000000002"]}', '{"palavras":["dados"]}', 24);
insert into r select 'lideranca', public.save_signal_monitor('f8000000-0000-0000-0000-000000000001', null, 'nova_lideranca', 'Lideranças', 'ativo',
  '{"accountIds":["d8000000-0000-0000-0000-000000000002"]}', '{}', 24);
insert into r select 'indeed', public.save_signal_monitor('f8000000-0000-0000-0000-000000000001', null, 'vaga_indeed', 'Indeed', 'pausado',
  '{"accountIds":["d8000000-0000-0000-0000-000000000002"]}', '{}', 24);
reset role;
select public.grant_credits('f8000000-0000-0000-0000-000000000001', 10, 'plano');
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '58000000-0000-0000-0000-000000000002', true);
select is(
  (select row(monitors, credits, available, in_progress)::text
   from public.quote_account_rescan('f8000000-0000-0000-0000-000000000001', 'd8000000-0000-0000-0000-000000000001')),
  '(2,2.00,10.00,f)', 'dois Monitoramentos ativos custam 2 créditos; o pausado não conta; o saldo aparece'
);
reset role;
select public.set_signal_actor_state('harvestapi~linkedin-profile-search', 'testing');
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '58000000-0000-0000-0000-000000000002', true);
select is(
  (select monitors from public.quote_account_rescan('f8000000-0000-0000-0000-000000000001', 'd8000000-0000-0000-0000-000000000001')),
  1, 'o Monitoramento cujo actor saiu de "disponível" também não conta'
);
reset role;
select public.set_signal_actor_state('harvestapi~linkedin-profile-search', 'available');
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '58000000-0000-0000-0000-000000000002', true);

-- 3. Qualquer participante pede; o pedido guarda quem pediu e não se repete enquanto a busca não termina.
insert into r select 'busca', public.request_account_rescan('f8000000-0000-0000-0000-000000000001', 'd8000000-0000-0000-0000-000000000001');
reset role;
select is(
  (select row(origin, state, requested_by = '58000000-0000-0000-0000-000000000002')::text
   from private.signal_rescans where id = (select id from r where k = 'busca')),
  '(manual,pending,t)', 'o pedido do Bruno fica pendente, com o nome dele'
);
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '58000000-0000-0000-0000-000000000002', true);
select is(
  public.request_account_rescan('f8000000-0000-0000-0000-000000000001', 'd8000000-0000-0000-0000-000000000001'),
  (select id from r where k = 'busca'), 'pedir de novo enquanto a busca não terminou devolve a mesma busca'
);
select is(
  (select in_progress from public.quote_account_rescan('f8000000-0000-0000-0000-000000000001', 'd8000000-0000-0000-0000-000000000001')),
  true, 'e o custo mostra que ela está em andamento'
);

-- 4. Quem é de fora, a Conta de outro Workspace, a Conta arquivada e a que não existe são recusadas.
select set_config('request.jwt.claim.sub', '58000000-0000-0000-0000-000000000003', true);
select throws_ok(
  $$select public.request_account_rescan('f8000000-0000-0000-0000-000000000001', 'd8000000-0000-0000-0000-000000000001')$$,
  '42501', 'active workspace membership required', 'quem é de fora não pede'
);
select set_config('request.jwt.claim.sub', '58000000-0000-0000-0000-000000000002', true);
select throws_ok(
  $$select public.quote_account_rescan('f8000000-0000-0000-0000-000000000001', 'd8000000-0000-0000-0000-000000000009')$$,
  'P0002', 'target account not found', 'a Conta de outro Workspace não existe para este'
);
reset role;
update public.target_accounts set archived_at = now() where id = 'd8000000-0000-0000-0000-000000000003';
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '58000000-0000-0000-0000-000000000002', true);
select throws_ok(
  $$select public.request_account_rescan('f8000000-0000-0000-0000-000000000001', 'd8000000-0000-0000-0000-000000000003')$$,
  '55006', 'the target account is archived', 'a Conta arquivada não é varrida de novo'
);

-- 5. Sem saldo, ou acima do limite mensal de quem pede, o pedido é recusado na hora e não deixa busca para trás.
reset role;
select public.reserve_credits('f8000000-0000-0000-0000-000000000001', null, 'person_collected', 'segura-o-saldo', 9);
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '58000000-0000-0000-0000-000000000002', true);
select throws_ok(
  $$select public.request_account_rescan('f8000000-0000-0000-0000-000000000001', 'd8000000-0000-0000-0000-000000000002')$$,
  'P0001', 'insufficient credits', 'com 1 crédito livre e 2 Monitoramentos, o pedido é recusado'
);
reset role;
select public.release_credits((select id from private.credit_reservations where action_key = 'segura-o-saldo'));
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '58000000-0000-0000-0000-000000000001', true);
select public.set_member_credit_limit('f8000000-0000-0000-0000-000000000001', '58000000-0000-0000-0000-000000000004', 1);
select set_config('request.jwt.claim.sub', '58000000-0000-0000-0000-000000000004', true);
select throws_ok(
  $$select public.request_account_rescan('f8000000-0000-0000-0000-000000000001', 'd8000000-0000-0000-0000-000000000002')$$,
  'P0001', 'monthly credit limit reached', 'o Diego, com limite mensal de 1 crédito, não pede uma busca de 2'
);
select is(
  (select count(*)::integer from public.quote_account_rescan('f8000000-0000-0000-0000-000000000001', 'd8000000-0000-0000-0000-000000000002')
   where in_progress),
  0, 'e nenhuma busca ficou pendente para a Beta'
);
select set_config('request.jwt.claim.sub', '58000000-0000-0000-0000-000000000002', true);

-- 6. O relógio reivindica as buscas pendentes, com a Conta e os Monitoramentos que rodam. Só o servidor chama.
reset role;
create temporary table claim on commit drop as select * from public.claim_signal_rescans(10);
select is(
  (select row(origin, requested_by = '58000000-0000-0000-0000-000000000002', account ->> 'name', jsonb_array_length(monitors))::text from claim),
  '(manual,t,Alfa,2)', 'a busca do Bruno sai com a Alfa e os 2 Monitoramentos ativos'
);
select is((select count(*)::integer from public.claim_signal_rescans(10)), 0, 'reivindicada, ninguém a pega de novo enquanto a reserva vale');
update private.signal_rescans set claimed_until = now() - interval '1 minute';
select is((select count(*)::integer from public.claim_signal_rescans(10)), 1, 'a reserva que venceu (a função caiu) devolve a busca à fila');

update private.signal_monitors set state = 'pausado' where id = (select id from r where k = 'lideranca');
update private.signal_rescans set claimed_until = null;
select is((select jsonb_array_length(monitors) from public.claim_signal_rescans(10)), 1, 'o Monitoramento pausado não entra na busca');
update private.signal_monitors set state = 'ativo' where id = (select id from r where k = 'lideranca');

update public.workspace_memberships set active = false where user_id = '58000000-0000-0000-0000-000000000002';
update private.signal_rescans set claimed_until = null;
select is((select requested_by from public.claim_signal_rescans(10)), null::uuid, 'quem pediu e saiu do Workspace não trava a busca');
update public.workspace_memberships set active = true where user_id = '58000000-0000-0000-0000-000000000002';

-- A Conta arquivada no meio do caminho e o Workspace sem Monitoramento ativo: a busca para, com o motivo.
insert into private.signal_rescans (workspace_id, target_account_id, origin, requested_by) values
  ('f8000000-0000-0000-0000-000000000001', 'd8000000-0000-0000-0000-000000000002', 'manual', '58000000-0000-0000-0000-000000000002');
update public.target_accounts set archived_at = now() where id = 'd8000000-0000-0000-0000-000000000002';
update private.signal_rescans set claimed_until = null;
select is(
  (select count(*)::integer from public.claim_signal_rescans(10) where account ->> 'name' = 'Beta'), 0,
  'a Conta arquivada no meio do caminho não é buscada'
);
select is(
  (select row(state, last_error)::text from private.signal_rescans where target_account_id = 'd8000000-0000-0000-0000-000000000002'),
  '(stopped,"A Conta foi arquivada ou apagada.")', 'e a busca dela fica parada, com o motivo'
);
update public.target_accounts set archived_at = null where id = 'd8000000-0000-0000-0000-000000000002';
insert into private.signal_rescans (workspace_id, target_account_id, origin) values
  ('f8000000-0000-0000-0000-000000000002', 'd8000000-0000-0000-0000-000000000009', 'mensal');
select is(
  (select count(*)::integer from public.claim_signal_rescans(10) where workspace_id = 'f8000000-0000-0000-0000-000000000002'), 0,
  'sem Monitoramento ativo, a busca do Sul nem sai'
);
select is(
  (select last_error from private.signal_rescans where workspace_id = 'f8000000-0000-0000-0000-000000000002'),
  'Nenhum Monitoramento ativo para buscar.', 'e para com o motivo'
);

-- 7. Fechar a busca: sem dar conta de tudo, volta à fila; concluída, fica de histórico e não volta.
select public.finish_signal_rescan((select id from r where k = 'busca'), 'pending', 1, 'Varridas 1 de 2 Monitoramentos; o resto na próxima rodada.');
select is(
  (select row(state, scanned, claimed_until is null, finished_at is null)::text from private.signal_rescans where id = (select id from r where k = 'busca')),
  '(pending,1,t,t)', 'a busca que não deu conta de tudo volta à fila, contando o que varreu'
);
select public.finish_signal_rescan((select id from r where k = 'busca'), 'done', 1, null);
select is(
  (select row(state, scanned, finished_at is not null)::text from private.signal_rescans where id = (select id from r where k = 'busca')),
  '(done,2,t)', 'concluída, guarda quando terminou e quantas varreduras fez'
);
select public.finish_signal_rescan((select id from r where k = 'busca'), 'pending', 5, 'de novo');
select is(
  (select row(state, scanned)::text from private.signal_rescans where id = (select id from r where k = 'busca')),
  '(done,2)', 'a busca concluída não volta à fila nem soma de novo'
);
select throws_ok(
  format($$select public.finish_signal_rescan(%L, 'qualquer', 0, null)$$, (select id from r where k = 'busca')),
  '22023', 'invalid rescan state', 'estado inválido é recusado'
);
select throws_ok(
  $$select public.finish_signal_rescan('00000000-0000-0000-0000-000000000000', 'done', 0, null)$$,
  'P0002', 'rescan not found', 'busca que não existe é recusada'
);

-- O teto ou o saldo acabou: as buscas mensais pendentes do Workspace param de uma vez; a do clique fica.
delete from private.signal_rescans where workspace_id = 'f8000000-0000-0000-0000-000000000001';
insert into private.signal_rescans (workspace_id, target_account_id, origin, requested_by) values
  ('f8000000-0000-0000-0000-000000000001', 'd8000000-0000-0000-0000-000000000001', 'mensal', null),
  ('f8000000-0000-0000-0000-000000000001', 'd8000000-0000-0000-0000-000000000002', 'manual', '58000000-0000-0000-0000-000000000002');
select is(
  public.stop_workspace_rescans('f8000000-0000-0000-0000-000000000001', 'O teto mensal da varredura foi atingido.'), 1,
  'parou 1 busca mensal'
);
select is(
  (select string_agg(origin || ':' || state, ',' order by origin) from private.signal_rescans where workspace_id = 'f8000000-0000-0000-0000-000000000001'),
  'manual:pending,mensal:stopped', 'a busca do clique continua pendente'
);

-- 8. Cada varredura da busca reserva 1 crédito. A busca do clique não depende do interruptor nem do teto do automático.
delete from private.signal_rescans where workspace_id = 'f8000000-0000-0000-0000-000000000001';
with x as (
  insert into private.signal_rescans (workspace_id, target_account_id, origin, requested_by)
  values ('f8000000-0000-0000-0000-000000000001', 'd8000000-0000-0000-0000-000000000001', 'manual', '58000000-0000-0000-0000-000000000002')
  returning id)
insert into r select 'clique', id from x;
create function pg_temp.abrir(p_rescan text, p_monitor text)
returns text language sql as $$
  select outcome || ':' || coalesce(reservation_id::text, '-')
  from public.begin_rescan_scan((select id from r where k = p_rescan), (select id from r where k = p_monitor))
$$;
insert into r select 'res1', split_part(pg_temp.abrir('clique', 'vagas'), ':', 2)::uuid;
select isnt((select id from r where k = 'res1'), null, 'com o automático em "confirmar", a busca do clique abre a varredura');
select is(
  (select row(t.booked - t.reserved, (select count(*) from private.automation_spend))::text
   from private.credit_totals('f8000000-0000-0000-0000-000000000001') t),
  '(9.00,0)', 'reservou 1 crédito e não gastou nada do teto do automático'
);
select is(pg_temp.abrir('clique', 'vagas'), 'resume:' || (select id from r where k = 'res1'), 'repetir retoma a mesma reserva, sem cobrar de novo');
select public.end_rescan_scan((select id from r where k = 'clique'), (select id from r where k = 'res1'), true);
select is(pg_temp.abrir('clique', 'vagas') like 'done:%', true, 'a varredura concluída não roda nem cobra outra vez');
select is(
  (select row(t.booked, t.reserved)::text from private.credit_totals('f8000000-0000-0000-0000-000000000001') t),
  '(9.00,0)', 'debitou 1 crédito ao concluir'
);
insert into r select 'res2', split_part(pg_temp.abrir('clique', 'lideranca'), ':', 2)::uuid;
select public.end_rescan_scan((select id from r where k = 'clique'), (select id from r where k = 'res2'), false);
select is(
  (select row(t.booked, t.reserved, (select count(*) from private.automation_spend))::text
   from private.credit_totals('f8000000-0000-0000-0000-000000000001') t),
  '(9.00,0,0)', 'a varredura que falhou não cobra e não mexe no teto que a busca do clique nunca usou'
);
select is(pg_temp.abrir('clique', 'lideranca') like 'skip:%', true, 'e não é tentada de novo na mesma busca');
select public.reserve_credits('f8000000-0000-0000-0000-000000000001', null, 'person_collected', 'segura-tudo', 9);
select is(
  split_part(pg_temp.abrir('clique', 'indeed'), ':', 1), 'no_credits', 'sem saldo, a varredura não abre'
);
select public.release_credits((select id from private.credit_reservations where action_key = 'segura-tudo'));
select throws_ok(
  format($$select public.begin_rescan_scan(%L, '00000000-0000-0000-0000-000000000000')$$, (select id from r where k = 'clique')),
  'P0002', 'monitor not found', 'o Monitoramento tem de ser do Workspace da busca'
);

-- 9. A busca mensal é automática: só abre com o interruptor ligado e teto, e cada varredura gasta do teto.
delete from private.signal_rescans where workspace_id = 'f8000000-0000-0000-0000-000000000001';
with x as (
  insert into private.signal_rescans (workspace_id, target_account_id, origin)
  values ('f8000000-0000-0000-0000-000000000001', 'd8000000-0000-0000-0000-000000000001', 'mensal') returning id)
insert into r select 'mensal1', id from x;
with x as (
  insert into private.signal_rescans (workspace_id, target_account_id, origin)
  values ('f8000000-0000-0000-0000-000000000001', 'd8000000-0000-0000-0000-000000000002', 'mensal') returning id)
insert into r select 'mensal2', id from x;
select is(split_part(pg_temp.abrir('mensal1', 'vagas'), ':', 1), 'confirmar', 'em "confirmar", a busca mensal não abre');
select is((select count(*)::integer from private.credit_reservations where status = 'reserved'), 0, 'e não deixa reserva presa');
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '58000000-0000-0000-0000-000000000001', true);
select public.save_automation_setting('f8000000-0000-0000-0000-000000000001', 'acao:varredura', 'automatico', 2);
reset role;
insert into r select 'auto1', split_part(pg_temp.abrir('mensal1', 'vagas'), ':', 2)::uuid;
insert into r select 'auto2', split_part(pg_temp.abrir('mensal1', 'lideranca'), ':', 2)::uuid;
select is(
  (select spent from private.automation_spend where scope = 'acao:varredura'), 2.00::numeric,
  'com o automático ligado e teto 2, cada varredura da busca mensal gasta do teto'
);
select is(split_part(pg_temp.abrir('mensal2', 'vagas'), ':', 1), 'teto_atingido', 'no teto, a próxima varredura não abre');
select public.end_rescan_scan((select id from r where k = 'mensal1'), (select id from r where k = 'auto2'), false);
select is(
  (select row(spent, (select paused_at is null from private.automation_settings where scope = 'acao:varredura'))::text
   from private.automation_spend where scope = 'acao:varredura'),
  '(1.00,t)', 'a varredura da busca mensal que falha devolve o teto e tira a pausa'
);
select public.end_rescan_scan((select id from r where k = 'mensal1'), (select id from r where k = 'auto1'), true);
select throws_ok(
  format($$select public.begin_rescan_scan(%L, %L)$$, (select id from r where k = 'clique'), (select id from r where k = 'vagas')),
  'P0002', 'rescan not found', 'a busca apagada é recusada'
);
update private.signal_rescans set state = 'done', finished_at = now() where id = (select id from r where k = 'mensal2');
select throws_ok(
  format($$select public.begin_rescan_scan(%L, %L)$$, (select id from r where k = 'mensal2'), (select id from r where k = 'vagas')),
  '55006', 'the rescan is not pending', 'a busca que já terminou não abre varredura nova'
);

-- 10. A busca mensal enfileira só as Contas com Fit que esfriaram, e só com o automático ligado, com teto e Monitoramento.
delete from private.signal_rescans;
update public.target_accounts set archived_at = null where id = 'd8000000-0000-0000-0000-000000000003';
select private.record_prospecting_event('f8000000-0000-0000-0000-000000000001', c, 'fit')
from unnest(array[
  'd8000000-0000-0000-0000-000000000001', 'd8000000-0000-0000-0000-000000000002', 'd8000000-0000-0000-0000-000000000003',
  'd8000000-0000-0000-0000-000000000005', 'd8000000-0000-0000-0000-000000000006']::uuid[]) c;
select private.record_prospecting_event('f8000000-0000-0000-0000-000000000001', 'd8000000-0000-0000-0000-000000000005', 'primeiro_envio');
update public.target_accounts set archived_at = now() where id = 'd8000000-0000-0000-0000-000000000003';
select private.record_signal('f8000000-0000-0000-0000-000000000001', 'd8000000-0000-0000-0000-000000000002', (select id from r where k = 'vagas'),
  'vaga_linkedin', 'beta-vaga-1', 'Vaga de dados', now() - interval '2 days', 'LinkedIn', null);
select private.record_signal('f8000000-0000-0000-0000-000000000001', 'd8000000-0000-0000-0000-000000000004', (select id from r where k = 'vagas'),
  'vaga_linkedin', 'delta-vaga-1', 'Vaga de dados', now() - interval '2 days', 'LinkedIn', null);
select private.record_signal('f8000000-0000-0000-0000-000000000001', 'd8000000-0000-0000-0000-000000000006', (select id from r where k = 'vagas'),
  'vaga_linkedin', 'zeta-vaga-1', 'Vaga antiga', now() - interval '40 days', 'LinkedIn', null);
select is(private.enqueue_monthly_rescans(), 2, 'enfileirou 2 Contas');
select is(
  (select string_agg(a.name, ',' order by a.name)
   from private.signal_rescans r join public.target_accounts a on a.id = r.target_account_id where r.state = 'pending' and r.origin = 'mensal'),
  'Alfa,Zeta', 'a Alfa (Fit sem Sinal) e a Zeta (Fit com Sinal vencido); a Beta tem Sinal válido, a Delta é Quente sem Fit, a Epsilon já está em abordagem e a Gama está arquivada'
);
select is(private.enqueue_monthly_rescans(), 0, 'rodar de novo no mesmo dia não repete');
update private.signal_rescans set state = 'done', finished_at = now() where target_account_id = 'd8000000-0000-0000-0000-000000000001';
select is(private.enqueue_monthly_rescans(), 0, 'a Conta revisitada nos últimos 30 dias espera');
update private.signal_rescans set finished_at = now() - interval '31 days' where target_account_id = 'd8000000-0000-0000-0000-000000000001';
select is(private.enqueue_monthly_rescans(), 1, 'passados 30 dias, a Conta entra de novo');
update private.signal_rescans set state = 'stopped', finished_at = now()
where target_account_id = 'd8000000-0000-0000-0000-000000000006' and state = 'pending';
select is(private.enqueue_monthly_rescans(), 1, 'a busca que parou (sem teto ou saldo) não conta como feita: a Conta volta à fila');
delete from private.signal_rescans where target_account_id = 'd8000000-0000-0000-0000-000000000006' and state = 'pending';
insert into private.signal_rescans (workspace_id, target_account_id, origin, requested_by, state, finished_at)
values ('f8000000-0000-0000-0000-000000000001', 'd8000000-0000-0000-0000-000000000006', 'manual', '58000000-0000-0000-0000-000000000002', 'done', now());
select is(private.enqueue_monthly_rescans(), 0, 'uma busca do clique recente também adia a mensal');

delete from private.signal_rescans;
update private.automation_settings set mode = 'confirmar' where scope = 'acao:varredura';
select is(private.enqueue_monthly_rescans(), 0, 'com o automático em "confirmar", nada é enfileirado');
update private.automation_settings set mode = 'automatico', paused_at = now() where scope = 'acao:varredura';
select is(private.enqueue_monthly_rescans(), 0, 'com a varredura pausada pelo teto, nada é enfileirado');
update private.automation_settings set paused_at = null where scope = 'acao:varredura';
update private.signal_monitors set state = 'pausado' where workspace_id = 'f8000000-0000-0000-0000-000000000001';
select is(private.enqueue_monthly_rescans(), 0, 'sem Monitoramento ativo, nada é enfileirado');
update private.signal_monitors set state = 'ativo' where id in (select id from r where k in ('vagas', 'lideranca'));
select is(private.enqueue_monthly_rescans(), 2, 'religado o automático e o Monitoramento, a fila volta');

-- Só acontecimento novo reaquece: reencontrar o mesmo não conta nem renova o prazo; um acontecimento novo, sim.
select is(
  private.record_signal('f8000000-0000-0000-0000-000000000001', 'd8000000-0000-0000-0000-000000000006', (select id from r where k = 'vagas'),
    'vaga_linkedin', 'zeta-vaga-1', 'Vaga antiga', now(), 'LinkedIn', null),
  false, 'a busca que reencontra o mesmo acontecimento não grava Sinal novo'
);
select is(
  (select row(count(*) filter (where private.signal_is_valid(fired_at)), bool_and(fired_at < now() - interval '39 days'))::text
   from private.signals where target_account_id = 'd8000000-0000-0000-0000-000000000006'),
  '(0,t)', 'a Conta segue sem Sinal válido e o prazo do Sinal antigo não renovou'
);
select is(
  private.record_signal('f8000000-0000-0000-0000-000000000001', 'd8000000-0000-0000-0000-000000000006', (select id from r where k = 'vagas'),
    'vaga_linkedin', 'zeta-vaga-2', 'Vaga nova de dados', now() - interval '1 day', 'LinkedIn', null),
  true, 'um acontecimento novo é Sinal novo'
);
select is(
  (select row(count(*) filter (where private.signal_is_valid(fired_at)),
    (select s.stage from private.prospecting_stages s where s.target_account_id = 'd8000000-0000-0000-0000-000000000006'))::text
   from private.signals where target_account_id = 'd8000000-0000-0000-0000-000000000006'),
  '(1,fit)', 'a Conta reaquece (1 Sinal válido) e o cartão continua em Fit'
);

-- A busca que ninguém pegou em 2 dias é encerrada; o relógio só chama a função quando há Monitoramento vencido ou busca.
insert into private.signal_rescans (workspace_id, target_account_id, origin, requested_at)
values ('f8000000-0000-0000-0000-000000000001', 'd8000000-0000-0000-0000-000000000004', 'mensal', now() - interval '3 days');
select is(private.expire_stale_rescans(), 1, 'a busca pendente há mais de 2 dias é encerrada');
select is(
  (select last_error from private.signal_rescans where target_account_id = 'd8000000-0000-0000-0000-000000000004'),
  'A busca não foi feita a tempo.', 'com o motivo'
);
delete from private.signal_rescans;
create or replace function private.post_to_signal_runner(p_url text, p_token text) returns void language sql as $$ select $$;
select is(private.kick_rescan_runner(), false, 'sem o endereço da função configurado, nada é chamado');
select private.configure_signal_runner('https://exemplo.supabase.co');
select is(private.kick_rescan_runner(), false, 'com o endereço mas sem busca pendente, o relógio não chama a função');
insert into private.signal_rescans (workspace_id, target_account_id, origin, requested_by)
values ('f8000000-0000-0000-0000-000000000001', 'd8000000-0000-0000-0000-000000000001', 'manual', '58000000-0000-0000-0000-000000000002');
select is(private.kick_rescan_runner(), true, 'com uma busca pendente, chama');
update private.signal_rescans set claimed_until = now() + interval '10 minutes';
select is(private.kick_rescan_runner(), false, 'e não chama de novo enquanto a reserva da busca vale');
select is(public.kick_rescan_runner(), false, 'o atalho do servidor faz o mesmo');
create function pg_temp.relogio_agendado() returns boolean language plpgsql as $$
declare v boolean;
begin
  if to_regclass('cron.job') is null then return true; end if;
  execute $q$select count(*) = 1 from cron.job where jobname = 'althius-signal-reactivation'$q$ into v;
  return v;
end $$;
select ok(pg_temp.relogio_agendado(), 'onde o pg_cron existe, o relógio diário da reativação está agendado');


-- O clique numa Conta que já tem busca mensal pendente (ainda sem varredura) assume a busca: vira do clique, de quem pediu.
delete from private.signal_rescans;
insert into private.signal_rescans (workspace_id, target_account_id, origin)
values ('f8000000-0000-0000-0000-000000000001', 'd8000000-0000-0000-0000-000000000001', 'mensal');
update private.signal_monitors set state = 'ativo' where id in (select id from r where k in ('vagas', 'lideranca'));
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '58000000-0000-0000-0000-000000000002', true);
select public.request_account_rescan('f8000000-0000-0000-0000-000000000001', 'd8000000-0000-0000-0000-000000000001');
reset role;
select is(
  (select row(count(*), min(origin), bool_and(requested_by = '58000000-0000-0000-0000-000000000002'))::text from private.signal_rescans),
  '(1,manual,t)', 'o clique assume a busca mensal pendente, em vez de ficar preso ao teto do automático'
);

-- 11. Só o participante ativo do Workspace chama as buscas; as funções do relógio são só do servidor.
select ok(
  has_function_privilege('authenticated', 'public.quote_account_rescan(uuid, uuid)', 'execute')
    and has_function_privilege('authenticated', 'public.request_account_rescan(uuid, uuid)', 'execute')
    and not has_function_privilege('anon', 'public.quote_account_rescan(uuid, uuid)', 'execute')
    and not has_function_privilege('anon', 'public.request_account_rescan(uuid, uuid)', 'execute'),
  'o Workspace operacional chama; a chave pública não'
);
select ok(
  not has_function_privilege('authenticated', 'public.claim_signal_rescans(integer)', 'execute')
    and not has_function_privilege('authenticated', 'public.finish_signal_rescan(uuid, text, integer, text)', 'execute')
    and not has_function_privilege('authenticated', 'public.stop_workspace_rescans(uuid, text)', 'execute')
    and not has_function_privilege('authenticated', 'public.begin_rescan_scan(uuid, uuid)', 'execute')
    and not has_function_privilege('authenticated', 'public.end_rescan_scan(uuid, uuid, boolean)', 'execute')
    and has_function_privilege('service_role', 'public.end_rescan_scan(uuid, uuid, boolean)', 'execute')
    and not has_function_privilege('authenticated', 'public.kick_rescan_runner()', 'execute')
    and has_function_privilege('service_role', 'public.kick_rescan_runner()', 'execute')
    and has_function_privilege('service_role', 'public.begin_rescan_scan(uuid, uuid)', 'execute')
    and has_function_privilege('service_role', 'public.claim_signal_rescans(integer)', 'execute')
    and has_function_privilege('service_role', 'public.finish_signal_rescan(uuid, text, integer, text)', 'execute')
    and has_function_privilege('service_role', 'public.stop_workspace_rescans(uuid, text)', 'execute'),
  'reivindicar, fechar e parar as buscas é só do servidor'
);

-- 12. As garantias estruturais: RLS ligado, a tabela fechada a todos, toda função nova com search_path vazio, e as do
-- servidor fechadas a anon e authenticated.
select ok(
  (select relrowsecurity from pg_class where oid = 'private.signal_rescans'::regclass)
    and not has_table_privilege('anon', 'private.signal_rescans', 'select')
    and not has_table_privilege('authenticated', 'private.signal_rescans', 'select')
    and not has_table_privilege('service_role', 'private.signal_rescans', 'select'),
  'a fila de buscas tem RLS e ninguém a lê por fora'
);
select is(
  (select count(*)::integer from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname in ('public', 'private')
     and p.proname in ('rescan_monitors', 'rescan_cost', 'assert_rescannable', 'quote_account_rescan', 'request_account_rescan',
       'claim_signal_rescans', 'finish_signal_rescan', 'stop_workspace_rescans', 'begin_rescan_scan', 'end_rescan_scan',
       'enqueue_monthly_rescans', 'expire_stale_rescans', 'run_signal_reactivation', 'kick_rescan_runner')
     and p.prosecdef and 'search_path=""' = any (p.proconfig)),
  15, 'as 15 funções novas são security definer com search_path vazio'
);
select ok(
  not has_function_privilege('anon', 'public.claim_signal_rescans(integer)', 'execute')
    and not has_function_privilege('anon', 'public.begin_rescan_scan(uuid, uuid)', 'execute')
    and not has_function_privilege('anon', 'public.end_rescan_scan(uuid, uuid, boolean)', 'execute')
    and not has_function_privilege('anon', 'public.finish_signal_rescan(uuid, text, integer, text)', 'execute')
    and not has_function_privilege('anon', 'public.stop_workspace_rescans(uuid, text)', 'execute')
    and not has_function_privilege('anon', 'public.kick_rescan_runner()', 'execute'),
  'a chave pública também não chama as funções do servidor'
);

select * from finish();
rollback;
