begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(41);

-- Ana (Admin) e Bruno (Membro) do Norte; Eva já saiu do Norte.
insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
                        created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
                        is_sso_user, is_anonymous)
values
  ('57000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'ana@norte.test', '', now(), now(), now(), '{}', '{}', false, false),
  ('57000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'bruno@norte.test', '', now(), now(), now(), '{}', '{}', false, false),
  ('57000000-0000-0000-0000-000000000005', 'authenticated', 'authenticated', 'eva@norte.test', '', now(), now(), now(), '{}', '{}', false, false);
insert into public.workspaces (id, kind, name) values ('f7000000-0000-0000-0000-000000000001', 'empresa', 'Norte');
insert into private.workspace_contracts (workspace_id, tier_id, starts_at) select w.id, 'escala', date_trunc('month', now()) from public.workspaces w on conflict (workspace_id) do nothing; -- contrato de teste (acesso-e-planos)
-- Este teste conta de 1 em 1 crédito por varredura; o preço fixo por Sinal (vagas: 2) é testado em precos_por_sinal.sql.
update public.signal_catalog set credits_per_account = 1 where workspace_id is null;
insert into public.workspace_memberships (workspace_id, user_id, role, active) values
  ('f7000000-0000-0000-0000-000000000001', '57000000-0000-0000-0000-000000000001', 'admin', true),
  ('f7000000-0000-0000-0000-000000000001', '57000000-0000-0000-0000-000000000002', 'member', true),
  ('f7000000-0000-0000-0000-000000000001', '57000000-0000-0000-0000-000000000005', 'member', false);
insert into public.target_accounts (id, workspace_id, name, canonical_url, domain, linkedin_url, created_by) values
  ('d7000000-0000-0000-0000-000000000001', 'f7000000-0000-0000-0000-000000000001', 'Alfa', 'https://alfa.test', 'alfa.test', 'https://linkedin.com/company/alfa', '57000000-0000-0000-0000-000000000001'),
  ('d7000000-0000-0000-0000-000000000002', 'f7000000-0000-0000-0000-000000000001', 'Beta', 'https://beta.test', 'beta.test', null, '57000000-0000-0000-0000-000000000001'),
  ('d7000000-0000-0000-0000-000000000003', 'f7000000-0000-0000-0000-000000000001', 'Gama', 'https://gama.test', 'gama.test', null, '57000000-0000-0000-0000-000000000001');
select public.set_signal_actor_state('curious_coder~linkedin-jobs-scraper', 'available', 'v1');

create temporary table r (k text primary key, id uuid) on commit drop;
grant all on r to authenticated;

-- 1. O token da chamada do relógio é conferido pelo banco; só o servidor pergunta.
select ok(
  public.signal_runner_token_matches((select token from private.signal_runner_settings)),
  'o token gerado pelo banco confere'
);
select ok(not public.signal_runner_token_matches('qualquer-coisa-que-nao-e-o-token-0123456789'), 'outro token não confere');
select ok(
  not has_function_privilege('authenticated', 'public.claim_due_signal_monitors(integer)', 'execute')
    and not has_function_privilege('authenticated', 'public.begin_account_scan(uuid, uuid, uuid, uuid, timestamptz)', 'execute')
    and not has_function_privilege('authenticated', 'public.end_account_scan(uuid, boolean)', 'execute')
    and not has_function_privilege('authenticated', 'public.signal_runner_token_matches(text)', 'execute')
    and has_function_privilege('service_role', 'public.claim_due_signal_monitors(integer)', 'execute')
    and has_function_privilege('service_role', 'public.begin_account_scan(uuid, uuid, uuid, uuid, timestamptz)', 'execute')
    and has_function_privilege('service_role', 'public.end_account_scan(uuid, boolean)', 'execute'),
  'reivindicar, abrir e fechar a varredura de uma Conta é só do servidor'
);

-- 2. Um Monitoramento ativo e vencido é reivindicado com as Contas do público e a hora marcada da rodada (o "slot").
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '57000000-0000-0000-0000-000000000001', true);
insert into r select 'mon', public.save_signal_monitor('f7000000-0000-0000-0000-000000000001', null, 'vaga_linkedin', 'Vagas', 'ativo',
  '{"accountIds":["d7000000-0000-0000-0000-000000000001","d7000000-0000-0000-0000-000000000002","d7000000-0000-0000-0000-000000000003"]}',
  '{"palavras":["dados"]}', 12);
reset role;
create temporary table claim on commit drop as select * from public.claim_due_signal_monitors(10);
select is(
  (select row(signal_type, jsonb_array_length(accounts), criteria ->> 'palavras' is not null, slot is not null)::text from claim),
  '(vaga_linkedin,3,t,t)', 'o Monitoramento ativo e vencido sai com as três Contas e o slot'
);
select is((select count(*)::integer from public.claim_due_signal_monitors(10)), 0, 'reivindicado, ninguém o pega de novo enquanto a reserva vale');

-- 3. Abrir a varredura de uma Conta reserva 1 crédito e confere o teto; sem saldo, sem varredura.
create function pg_temp.abrir(p_account text, p_slot text, p_user text default '57000000-0000-0000-0000-000000000001')
returns text language sql as $$
  select outcome || ':' || coalesce(reservation_id::text, '-')
  from public.begin_account_scan('f7000000-0000-0000-0000-000000000001', p_user::uuid,
    (select id from r where k = 'mon'), p_account::uuid, p_slot::timestamptz)
$$;
select is(split_part(pg_temp.abrir('d7000000-0000-0000-0000-000000000001', '2026-09-30 12:00+00'), ':', 1), 'no_credits', 'sem saldo, a varredura não abre');
select public.grant_credits('f7000000-0000-0000-0000-000000000001', 10, 'plano');
select is(split_part(pg_temp.abrir('d7000000-0000-0000-0000-000000000001', '2026-09-30 12:00+00'), ':', 1), 'confirmar', 'com o automático em confirmar, a varredura automática não abre');
select is(
  (select count(*)::integer from private.credit_reservations where status = 'reserved'), 0,
  'e a reserva volta ao saldo'
);

-- Liga o automático da varredura com teto 5.
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select public.save_automation_setting('f7000000-0000-0000-0000-000000000001', 'acao:varredura', 'automatico', 5);
reset role;

insert into r select 'res1', split_part(pg_temp.abrir('d7000000-0000-0000-0000-000000000001', '2026-09-30 12:00+00'), ':', 2)::uuid;
select isnt((select id from r where k = 'res1'), null, 'com saldo e teto, a varredura da Alfa abre');
select is(
  (select row(t.booked - t.reserved, (select spent from private.automation_spend where scope = 'acao:varredura'))::text
   from private.credit_totals('f7000000-0000-0000-0000-000000000001') t),
  '(9.00,1.00)', 'reservou 1 crédito e gastou 1 do teto do mês'
);
select is(
  pg_temp.abrir('d7000000-0000-0000-0000-000000000001', '2026-09-30 12:00+00'),
  'resume:' || (select id from r where k = 'res1'), 'repetir a mesma rodada retoma a mesma reserva, sem gastar de novo'
);
select lives_ok(format($$select public.end_account_scan(%L, true)$$, (select id from r where k = 'res1')), 'varredura concluída');
select is(
  (select row(t.booked, t.reserved)::text from private.credit_totals('f7000000-0000-0000-0000-000000000001') t),
  '(9.00,0)', 'debitou 1 crédito ao concluir'
);
select is(
  split_part(pg_temp.abrir('d7000000-0000-0000-0000-000000000001', '2026-09-30 12:00+00'), ':', 1), 'done',
  'a rodada já concluída não roda nem cobra outra vez'
);
select is((select spent from private.automation_spend where scope = 'acao:varredura'), 1.00::numeric, 'nem gasta o teto outra vez');

-- 4. A varredura que falha não cobra e devolve o teto.
insert into r select 'res2', split_part(pg_temp.abrir('d7000000-0000-0000-0000-000000000002', '2026-09-30 12:00+00'), ':', 2)::uuid;
select lives_ok(format($$select public.end_account_scan(%L, false)$$, (select id from r where k = 'res2')), 'varredura que falhou');
select is(
  (select row(t.booked, t.reserved, (select spent from private.automation_spend where scope = 'acao:varredura'))::text
   from private.credit_totals('f7000000-0000-0000-0000-000000000001') t),
  '(9.00,0,1.00)', 'não debitou e o teto voltou ao que era'
);
select is(
  split_part(pg_temp.abrir('d7000000-0000-0000-0000-000000000002', '2026-09-30 12:00+00'), ':', 1), 'skip',
  'na mesma rodada, a Conta que falhou fica para a próxima'
);

-- 5. Chegou no teto: a varredura para, avisa uma vez, e estornar o teto tira a pausa.
select public.end_account_scan(split_part(pg_temp.abrir('d7000000-0000-0000-0000-000000000002', '2026-09-30 13:00+00'), ':', 2)::uuid, true);
select public.end_account_scan(split_part(pg_temp.abrir('d7000000-0000-0000-0000-000000000003', '2026-09-30 13:00+00'), ':', 2)::uuid, true);
select public.end_account_scan(split_part(pg_temp.abrir('d7000000-0000-0000-0000-000000000001', '2026-09-30 13:00+00'), ':', 2)::uuid, true);
select public.end_account_scan(split_part(pg_temp.abrir('d7000000-0000-0000-0000-000000000001', '2026-09-30 14:00+00'), ':', 2)::uuid, true);
select is(
  split_part(pg_temp.abrir('d7000000-0000-0000-0000-000000000002', '2026-09-30 14:00+00'), ':', 1), 'teto_atingido',
  'com o teto de 5 gasto, a sexta varredura não abre'
);
select is((select count(*)::integer from private.workspace_notices), 1, 'e um Aviso do Workspace sai, uma vez');
select is((select count(*)::integer from private.credit_reservations where status = 'reserved'), 0, 'sem deixar reserva presa');
select private.refund_automation_cap('f7000000-0000-0000-0000-000000000001', 'acao:varredura', 1);
select is(
  (select row(spent, (select paused_at is null from private.automation_settings where workspace_id = 'f7000000-0000-0000-0000-000000000001' and scope = 'acao:varredura'))::text
   from private.automation_spend where workspace_id = 'f7000000-0000-0000-0000-000000000001' and scope = 'acao:varredura'),
  '(4.00,t)', 'estornar 1 do teto tira a pausa'
);

-- 6. Quem criou o Monitoramento e saiu do Workspace não trava a varredura; o limite do participante vale.
update private.signal_monitors set created_by = '57000000-0000-0000-0000-000000000005';
select is(
  split_part(pg_temp.abrir('d7000000-0000-0000-0000-000000000002', '2026-09-30 15:00+00', '57000000-0000-0000-0000-000000000005'), ':', 1), 'go',
  'o criador que saiu não trava a varredura'
);
select is(
  (select user_id is null from private.credit_reservations
   where action_key = 'scan:' || (select id from r where k = 'mon') || ':d7000000-0000-0000-0000-000000000002:'
     || extract(epoch from '2026-09-30 15:00+00'::timestamptz)::bigint),
  true, 'o crédito é do Workspace, sem participante'
);
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select public.set_member_credit_limit('f7000000-0000-0000-0000-000000000001', '57000000-0000-0000-0000-000000000002', 0);
reset role;
select is(
  split_part(pg_temp.abrir('d7000000-0000-0000-0000-000000000003', '2026-09-30 16:00+00', '57000000-0000-0000-0000-000000000002'), ':', 1), 'no_credits',
  'no limite mensal do participante, a varredura dele não abre'
);

-- 7. A faxina solta a reserva que ficou presa (a função caiu no meio) e deixa a recente.
select public.reserve_credits('f7000000-0000-0000-0000-000000000001', null, 'agent_round', 'faxina:velha', 1);
select public.reserve_credits('f7000000-0000-0000-0000-000000000001', null, 'agent_round', 'faxina:nova', 1);
update private.credit_reservations set created_at = now() - interval '3 hours' where action_key = 'faxina:velha';
select is(private.release_stale_credit_reservations(), 1, 'a faxina solta a reserva de 3 horas atrás');
select is(
  (select string_agg(action_key || '=' || status, ',' order by action_key) from private.credit_reservations where action_key like 'faxina:%'),
  'faxina:nova=reserved,faxina:velha=released', 'e deixa a recente'
);

-- 8. Terminar a rodada agenda a próxima, ou pede continuar já; a rotação nunca deixa Conta sem varredura.
select lives_ok(
  format($$select public.finish_signal_monitor_run(%L, 3, 'o Apify não respondeu', false)$$, (select id from r where k = 'mon')),
  'terminar a rodada'
);
select is(
  (select row(next_run_at between now() + interval '11 hours 59 minutes' and now() + interval '12 hours 1 minute', claimed_until is null)::text
   from private.signal_monitors where id = (select id from r where k = 'mon')),
  '(t,t)', 'a próxima rodada fica daqui a 12 horas e a reserva é solta'
);
select public.finish_signal_monitor_run((select id from r where k = 'mon'), 0, null, true);
select is(
  (select next_run_at <= now() from private.signal_monitors where id = (select id from r where k = 'mon')),
  true, 'quando o prazo acaba no meio, a rodada pede para continuar já'
);
update private.signal_monitors set scan_offset = 7, claimed_until = null;
select is(
  (select string_agg(a ->> 'name', ',' order by o) from public.claim_due_signal_monitors(10), jsonb_array_elements(accounts) with ordinality as x(a, o)),
  'Beta,Gama,Alfa', 'a rotação continua de onde parou, mesmo com o deslocamento maior que o número de Contas'
);
update public.target_accounts set archived_at = now() where id = 'd7000000-0000-0000-0000-000000000003';
update private.signal_monitors set next_run_at = now() - interval '1 minute', claimed_until = null;
select is(
  (select jsonb_array_length(accounts) from public.claim_due_signal_monitors(10)), 2,
  'a Conta arquivada sai da varredura'
);
update public.target_accounts set archived_at = null;
update private.signal_monitors set next_run_at = now() - interval '1 minute', claimed_until = null;
select is(
  (select created_by is null from public.claim_due_signal_monitors(10)),
  true, 'o criador que saiu do Workspace não é devolvido para cobrar o crédito'
);
update public.target_accounts set deleted_at = now() where id = 'd7000000-0000-0000-0000-000000000003';
update private.signal_monitors set next_run_at = now() - interval '1 minute', claimed_until = null;
select is(
  (select jsonb_array_length(accounts) from public.claim_due_signal_monitors(10)), 2,
  'e a apagada também'
);

-- 9. Pausado, ou de um Sinal cujo actor saiu do ar, não é reivindicado.
update private.signal_monitors set next_run_at = now() - interval '1 minute', state = 'pausado', claimed_until = null;
select is((select count(*)::integer from public.claim_due_signal_monitors(10)), 0, 'pausado não é reivindicado');
update private.signal_monitors set state = 'ativo';
select public.set_signal_actor_state('curious_coder~linkedin-jobs-scraper', 'out');
select is((select count(*)::integer from public.claim_due_signal_monitors(10)), 0, 'actor fora do ar: o Monitoramento espera');
select public.set_signal_actor_state('curious_coder~linkedin-jobs-scraper', 'available');

-- 10. O motivo da falha aparece na lista do Monitoramento.
select public.finish_signal_monitor_run((select id from r where k = 'mon'), 0, 'o Apify não respondeu', false);
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select is(
  (select last_error from public.list_signal_monitors('f7000000-0000-0000-0000-000000000001')),
  'o Apify não respondeu', 'o Monitoramento mostra por que a última rodada falhou'
);
reset role;

-- 11. O relógio só chama a função quando há Monitoramento vencido e o endereço foi configurado.
update private.signal_monitors set next_run_at = now() - interval '1 minute', claimed_until = null;
create or replace function private.post_to_signal_runner(p_url text, p_token text) returns void language sql as $$ select $$;
select is(private.kick_signal_runner(), false, 'sem o endereço configurado, nada é chamado');
select private.configure_signal_runner('https://exemplo.supabase.co');
select is(private.kick_signal_runner(), true, 'com endereço e Monitoramento vencido, chama');

-- 12. A varredura automática descobre o actor de um tipo de Sinal; só o servidor pergunta.
select is(
  (select row(actor_id, state, version)::text from public.signal_actor_for_type('vaga_linkedin')),
  '(curious_coder~linkedin-jobs-scraper,available,v1)', 'o actor do Sinal e o estado dele'
);
select ok(
  not has_function_privilege('authenticated', 'public.signal_actor_for_type(text)', 'execute')
    and has_function_privilege('service_role', 'public.signal_actor_for_type(text)', 'execute'),
  'perguntar pelo actor é só do servidor'
);

select * from finish();
rollback;
