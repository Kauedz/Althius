begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(15);

-- Marina e Bruno têm Conta de usuário; cada um tem o seu limite de tentativas da troca de senha.
insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
                        created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
                        is_sso_user, is_anonymous)
values
  ('a8000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'marina@cliente.com.br', '', now(), now(), now(), '{}', '{}', false, false),
  ('a8000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'bruno@cliente.com.br', '', now(), now(), now(), '{}', '{}', false, false);

-- 1. Só a chave de serviço (a Edge Function account-password) reserva e esquece tentativas; o navegador não chega às
-- funções nem à tabela, para ninguém zerar o próprio contador.
select ok(
  has_function_privilege('service_role', 'public.claim_password_change_attempt(uuid)', 'execute')
    and not has_function_privilege('anon', 'public.claim_password_change_attempt(uuid)', 'execute')
    and not has_function_privilege('authenticated', 'public.claim_password_change_attempt(uuid)', 'execute'),
  'só service_role executa claim_password_change_attempt');
select ok(
  has_function_privilege('service_role', 'public.clear_password_change_attempts(uuid)', 'execute')
    and not has_function_privilege('anon', 'public.clear_password_change_attempts(uuid)', 'execute')
    and not has_function_privilege('authenticated', 'public.clear_password_change_attempts(uuid)', 'execute'),
  'só service_role executa clear_password_change_attempts');
select ok(
  not has_table_privilege('anon', 'private.password_change_attempts', 'select')
    and not has_table_privilege('authenticated', 'private.password_change_attempts', 'select')
    and not has_table_privilege('authenticated', 'private.password_change_attempts', 'delete'),
  'anon e authenticated não leem nem apagam as tentativas');
select is(
  (select relrowsecurity from pg_class where oid = 'private.password_change_attempts'::regclass), true,
  'a tabela das tentativas tem RLS');

set local role service_role;

-- 2. Cinco tentativas cabem; a sexta, nos mesmos 15 minutos, não.
select is(
  (select bool_and(public.claim_password_change_attempt('a8000000-0000-0000-0000-000000000001')) from generate_series(1, 5)),
  true, 'cinco tentativas da Marina cabem no limite');
select is(public.claim_password_change_attempt('a8000000-0000-0000-0000-000000000001'), false,
  'a sexta tentativa em 15 minutos é recusada');
reset role;
select is((select count(*)::int from private.password_change_attempts where user_id = 'a8000000-0000-0000-0000-000000000001'), 5,
  'a tentativa recusada não é gravada');
set local role service_role;

-- 3. O limite é de cada Conta de usuário.
select is(public.claim_password_change_attempt('a8000000-0000-0000-0000-000000000002'), true,
  'as tentativas da Marina não param o Bruno');

-- 4. Passados 15 minutos, as tentativas antigas não contam mais e são apagadas.
reset role;
update private.password_change_attempts set attempted_at = attempted_at - interval '16 minutes'
where user_id = 'a8000000-0000-0000-0000-000000000001';
set local role service_role;
select is(public.claim_password_change_attempt('a8000000-0000-0000-0000-000000000001'), true,
  'passados 15 minutos, a Marina tenta de novo');
reset role;
select is((select count(*)::int from private.password_change_attempts where user_id = 'a8000000-0000-0000-0000-000000000001'), 1,
  'as tentativas vencidas são apagadas');
set local role service_role;

-- 5. Uma confirmação certa esquece as tentativas da Conta de usuário, e só as dela.
select lives_ok($$ select public.clear_password_change_attempts('a8000000-0000-0000-0000-000000000001') $$,
  'a chave de serviço esquece as tentativas da Marina');
reset role;
select is((select count(*)::int from private.password_change_attempts where user_id = 'a8000000-0000-0000-0000-000000000001'), 0,
  'a confirmação certa esquece as tentativas da Marina');
select is((select count(*)::int from private.password_change_attempts where user_id = 'a8000000-0000-0000-0000-000000000002'), 1,
  'e não as do Bruno');

-- 6. Sem Conta de usuário, nada é reservado.
set local role service_role;
select throws_ok($$ select public.claim_password_change_attempt(null) $$, '22023', null,
  'reservar sem Conta de usuário é recusado');
reset role;

-- 7. Apagar a Conta de usuário apaga as tentativas dela.
delete from auth.users where id = 'a8000000-0000-0000-0000-000000000002';
select is((select count(*)::int from private.password_change_attempts where user_id = 'a8000000-0000-0000-0000-000000000002'), 0,
  'apagar a Conta de usuário apaga as tentativas dela');

select * from finish();
rollback;
