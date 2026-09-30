begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(19);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
                        created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
                        is_sso_user, is_anonymous)
values ('57000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'ana@norte.test', '', now(), now(), now(), '{}', '{}', false, false);
insert into public.workspaces (id, kind, name) values ('f7000000-0000-0000-0000-000000000001', 'empresa', 'Norte');
insert into public.workspace_memberships (workspace_id, user_id, role, active) values
  ('f7000000-0000-0000-0000-000000000001', '57000000-0000-0000-0000-000000000001', 'admin', true);
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
    and not has_function_privilege('authenticated', 'public.signal_runner_token_matches(text)', 'execute')
    and has_function_privilege('service_role', 'public.claim_due_signal_monitors(integer)', 'execute'),
  'reivindicar Monitoramentos é só do servidor'
);

-- 2. Um Monitoramento ativo e vencido é reivindicado com as Contas do público.
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '57000000-0000-0000-0000-000000000001', true);
insert into r select 'mon', public.save_signal_monitor('f7000000-0000-0000-0000-000000000001', null, 'vaga_linkedin', 'Vagas', 'ativo',
  '{"accountIds":["d7000000-0000-0000-0000-000000000001","d7000000-0000-0000-0000-000000000002"]}', '{"palavras":["dados"]}', 12);
reset role;
select is(
  (select row(signal_type, jsonb_array_length(accounts), criteria ->> 'palavras' is not null)::text
   from public.claim_due_signal_monitors(10)),
  '(vaga_linkedin,2,t)', 'o Monitoramento ativo e vencido sai com as duas Contas'
);
select is((select count(*)::integer from public.claim_due_signal_monitors(10)), 0, 'reivindicado, ninguém o pega de novo enquanto a reserva vale');

-- 3. Terminar a rodada agenda a próxima e libera a reserva.
select lives_ok(
  format($$select public.finish_signal_monitor_run(%L, 2, null)$$, (select id from r where k = 'mon')),
  'terminar a rodada'
);
select is(
  (select next_run_at between now() + interval '11 hours 59 minutes' and now() + interval '12 hours 1 minute'
   from private.signal_monitors where id = (select id from r where k = 'mon')),
  true, 'a próxima rodada fica daqui a 12 horas'
);
select is((select count(*)::integer from public.claim_due_signal_monitors(10)), 0, 'e ainda não é hora');
update private.signal_monitors set next_run_at = now() - interval '1 minute' where id = (select id from r where k = 'mon');
select is((select count(*)::integer from public.claim_due_signal_monitors(10)), 1, 'passada a hora, volta a ser reivindicado');
select public.finish_signal_monitor_run((select id from r where k = 'mon'), 0, 'o Apify não respondeu');
select is(
  (select last_error from private.signal_monitors where id = (select id from r where k = 'mon')),
  'o Apify não respondeu', 'o motivo da falha fica no Monitoramento'
);

-- 4. Pausado, ou de um Sinal cujo actor saiu do ar, ou com a Conta arquivada.
update private.signal_monitors set next_run_at = now() - interval '1 minute', state = 'pausado';
select is((select count(*)::integer from public.claim_due_signal_monitors(10)), 0, 'pausado não é reivindicado');
update private.signal_monitors set state = 'ativo';
select public.set_signal_actor_state('curious_coder~linkedin-jobs-scraper', 'out');
select is((select count(*)::integer from public.claim_due_signal_monitors(10)), 0, 'actor fora do ar: o Monitoramento espera');
select public.set_signal_actor_state('curious_coder~linkedin-jobs-scraper', 'available');
update public.target_accounts set archived_at = now() where id = 'd7000000-0000-0000-0000-000000000002';
select is(
  (select jsonb_array_length(accounts) from public.claim_due_signal_monitors(10)),
  1, 'a Conta arquivada sai da varredura'
);

-- 5. O relógio só chama a função quando há Monitoramento vencido e o endereço foi configurado.
update private.signal_monitors set next_run_at = now() - interval '1 minute', claimed_until = null;
create or replace function private.post_to_signal_runner(p_url text, p_token text) returns void language sql as $$ select $$;
select is(private.kick_signal_runner(), false, 'sem o endereço configurado, nada é chamado');
select private.configure_signal_runner('https://exemplo.supabase.co');
select is(private.kick_signal_runner(), true, 'com endereço e Monitoramento vencido, chama');

-- 6. Uma rodada que não deu conta de todas as Contas continua de onde parou na seguinte (ninguém fica sem varredura).
update private.signal_monitors set audience = '{"accountIds":["d7000000-0000-0000-0000-000000000001","d7000000-0000-0000-0000-000000000002","d7000000-0000-0000-0000-000000000003"]}',
  next_run_at = now() - interval '1 minute', claimed_until = null;
update public.target_accounts set archived_at = null;
select is(
  (select string_agg(a ->> 'name', ',' order by o) from public.claim_due_signal_monitors(10), jsonb_array_elements(accounts) with ordinality as x(a, o)),
  'Alfa,Beta,Gama', 'a primeira rodada começa pela primeira Conta'
);
select public.finish_signal_monitor_run((select id from private.signal_monitors limit 1), 2, null);
update private.signal_monitors set next_run_at = now() - interval '1 minute';
select is(
  (select string_agg(a ->> 'name', ',' order by o) from public.claim_due_signal_monitors(10), jsonb_array_elements(accounts) with ordinality as x(a, o)),
  'Gama,Alfa,Beta', 'varridas duas, a seguinte começa pela terceira e dá a volta'
);

-- 7. O Executor descobre o actor de um tipo de Sinal; só o servidor pergunta.
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
