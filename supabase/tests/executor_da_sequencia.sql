begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(16);

-- O relógio da agenda e a chamada HTTP ficam sob controle do teste, só dentro desta transação.
create function pg_temp.relogio(p_at timestamptz) returns void language plpgsql as $f$
begin
  execute format(
    'create or replace function private.clock_now() returns timestamptz language sql stable set search_path = '''' '
    'as $c$ select %L::timestamptz $c$', p_at);
end
$f$;

create temporary table chamadas (url text, token text);
create or replace function private.post_to_sequence_runner(p_url text, p_token text) returns void
language sql security definer set search_path = '' as $f$
  insert into pg_temp.chamadas values (p_url, p_token);
$f$;

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
                        created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
                        is_sso_user, is_anonymous)
values ('80000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'titular@cliente.com.br', '', now(), now(), now(), '{}', '{}', false, false);
insert into public.workspaces (id, kind, name) values ('81000000-0000-0000-0000-000000000001', 'empresa', 'Cliente');
insert into public.workspace_memberships (workspace_id, user_id, role, active) values
  ('81000000-0000-0000-0000-000000000001', '80000000-0000-0000-0000-000000000001', 'member', true);

create temporary table ids (chave text primary key, valor text);
grant all on ids to authenticated, service_role;

-- 1. O token nasce no banco e só a Edge Function (service_role) pergunta por ele.
select is((select length(token) from private.sequence_runner_settings), 64, 'the database creates its own 64-char token');
select is(public.sequence_runner_token_matches((select token from private.sequence_runner_settings)), true,
  'the stored token matches');
select is(public.sequence_runner_token_matches(repeat('0', 64)), false, 'another token does not match');
select is(public.sequence_runner_token_matches(''), false, 'an empty token does not match');
set local role authenticated;
select throws_ok($$select public.sequence_runner_token_matches('x')$$, '42501',
  'permission denied for function sequence_runner_token_matches', 'signed-in users cannot probe the token');
reset role;

-- 2. Sem endereço configurado, nada é chamado; o endereço aceita só https.
select is(private.kick_sequence_runner(), false, 'without the function address nothing is called');
select throws_ok($$select private.configure_sequence_runner('http://abc.supabase.co')$$, '22023',
  'project url must look like https://<ref>.supabase.co', 'a plain http address is refused');
select is(private.configure_sequence_runner('https://abc.supabase.co/'),
  'https://abc.supabase.co/functions/v1/sequence-runner', 'the project address points to the sequence-runner function');
select is(private.kick_sequence_runner(), false, 'with nothing due, the function is not called');

-- 3. Um passo automático vencido faz o banco chamar a função, com o token.
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '80000000-0000-0000-0000-000000000001', true);
insert into ids select 'conta', id::text from public.save_target_account(
  '81000000-0000-0000-0000-000000000001', 'Empresa Alvo', 'https://empresa-alvo.test');
insert into ids select 'maria', id::text from public.create_contact(
  (select valor::uuid from ids where chave = 'conta'), 'Maria Souza', 'Diretora', 'maria@empresa-alvo.test');
insert into ids select 'sequencia', id::text from public.create_sequence(
  '81000000-0000-0000-0000-000000000001', (select valor from ids where chave = 'conta'),
  jsonb_build_object('janelaPadrao', '{"de": "09:00", "ate": "18:00"}'::jsonb, 'steps', jsonb_build_array(
    jsonb_build_object('id', 'passo-1', 'canal', 'email', 'contatoId', (select valor from ids where chave = 'maria'),
      'delayDiasUteis', 0, 'titulo', 'Abertura', 'assunto', 'Oi', 'corpo', 'Olá, Maria.'))));
insert into ids select 'tentativa', attempt_id::text from public.create_sender_connection_attempt(
  '81000000-0000-0000-0000-000000000001', 'email', null);
reset role;
select public.complete_sender_connection_attempt(
  (select valor::uuid from ids where chave = 'tentativa'), 'unipile-google-8', 'GOOGLE', 'CREATION_SUCCESS');
select public.apply_unipile_sender_status('unipile-google-8', 'SYNC_SUCCESS');
select pg_temp.relogio('2026-09-30 10:00-03');
set local role authenticated;
select is((select outcome from public.activate_sequence((select valor::uuid from ids where chave = 'sequencia'))),
  'activated', 'the sequence is activated');
reset role;

select is(private.kick_sequence_runner(), true, 'a due automatic step makes the database call the function');
select is((select url || ' ' || (token = (select token from private.sequence_runner_settings)) from chamadas),
  'https://abc.supabase.co/functions/v1/sequence-runner true', 'the call carries the database token');

-- 4. Uma Sequência pausada não chama nada; um envio esquecido em voo vira incerto a cada minuto.
update public.sequences set status = 'pausada' where id = (select valor::uuid from ids where chave = 'sequencia');
select is(private.kick_sequence_runner(), false, 'a paused sequence does not call the function');
update private.sequence_step_sends set status = 'sending', sending_at = now() - interval '11 minutes' where step_id = 'passo-1';
select private.kick_sequence_runner();
select is((select status from private.sequence_step_sends where step_id = 'passo-1'), 'uncertain',
  'a send forgotten in flight becomes uncertain');

-- 5. O relógio só é ligado onde existe pg_cron (Supabase e o CI).
create function pg_temp.job_do_executor() returns text language plpgsql as $f$
declare
  v text;
begin
  if to_regclass('cron.job') is null then
    return 'sem pg_cron';
  end if;
  execute $q$select schedule || ' ' || command from cron.job where jobname = 'althius-sequence-runner'$q$ into v;
  return v;
end
$f$;
select ok(pg_temp.job_do_executor() in ('sem pg_cron', '* * * * * select private.kick_sequence_runner()'),
  'where pg_cron exists, the executor runs every minute');
select isnt(pg_temp.job_do_executor(), null, 'the job exists wherever pg_cron exists');

select * from finish();
rollback;
