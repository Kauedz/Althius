begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(14);

-- Marina tem Conta de usuário confirmada; Bruno se cadastrou e não confirmou; Carla e Davi existem para os limites.
insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
                        created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
                        is_sso_user, is_anonymous)
values
  ('a3000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'marina@cliente.com.br', '', now(), now(), now(), '{}', '{}', false, false),
  ('a3000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'bruno@cliente.com.br', '', null, now(), now(), '{}', '{}', false, false),
  ('a3000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'carla@cliente.com.br', '', now(), now(), now(), '{}', '{}', false, false),
  ('a3000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'davi@cliente.com.br', '', now(), now(), now(), '{}', '{}', false, false);

-- 1. Só a chave de serviço (a Edge Function) reserva avisos; o navegador não chega à função nem à tabela.
select ok(
  has_function_privilege('service_role', 'public.claim_existing_account_notice(text)', 'execute')
    and not has_function_privilege('anon', 'public.claim_existing_account_notice(text)', 'execute')
    and not has_function_privilege('authenticated', 'public.claim_existing_account_notice(text)', 'execute'),
  'só service_role executa claim_existing_account_notice');
select ok(
  not has_table_privilege('anon', 'private.existing_account_notices', 'select')
    and not has_table_privilege('authenticated', 'private.existing_account_notices', 'select'),
  'anon e authenticated não leem os avisos');
select hasnt_column('private', 'existing_account_notices', 'email', 'o aviso guarda a Conta de usuário, não o e-mail');

set local role service_role;

-- 2. Conta de usuário confirmada: o aviso é reservado e fica gravado.
select is(public.claim_existing_account_notice('marina@cliente.com.br'), 'marina@cliente.com.br',
  'um e-mail com Conta de usuário confirmada recebe o aviso');
reset role;
select is((select count(*)::int from private.existing_account_notices where user_id = 'a3000000-0000-0000-0000-000000000001'), 1,
  'a reserva fica gravada para a Conta de usuário');
set local role service_role;

-- 3. Sem conta confirmada, nada a avisar e nada gravado.
select is(public.claim_existing_account_notice('bruno@cliente.com.br'), null,
  'um cadastro não confirmado não recebe o aviso (o Supabase Auth reenvia a confirmação)');
select is(public.claim_existing_account_notice('ninguem@cliente.com.br'), null, 'um e-mail sem conta não recebe o aviso');
reset role;
select is((select count(*)::int from private.existing_account_notices), 1, 'e nenhum dos dois é gravado');
set local role service_role;

-- 4. Limites por e-mail: um aviso a cada 10 minutos, maiúsculas e espaços não contam como outro e-mail.
select is(public.claim_existing_account_notice('marina@cliente.com.br'), null,
  'o mesmo e-mail não recebe dois avisos em 10 minutos');
reset role;
update private.existing_account_notices set requested_at = requested_at - interval '11 minutes';
set local role service_role;
select is(public.claim_existing_account_notice('  Marina@Cliente.com.br '), 'marina@cliente.com.br',
  'passados 10 minutos, sai outro aviso, para o e-mail guardado na Conta de usuário, mesmo digitado de outro jeito');
reset role;
update private.existing_account_notices set requested_at = requested_at - interval '11 minutes';
set local role service_role;
select is(public.claim_existing_account_notice('marina@cliente.com.br'), 'marina@cliente.com.br', 'o terceiro aviso do dia sai');
reset role;
update private.existing_account_notices set requested_at = requested_at - interval '11 minutes';
set local role service_role;
select is(public.claim_existing_account_notice('MARINA@cliente.com.br'), null, 'o quarto aviso do dia não sai, escrito de outro jeito');

-- 5. Limite geral: 200 avisos na última hora param os avisos de todos, para o remetente não virar canal de spam.
reset role;
insert into private.existing_account_notices (user_id, requested_at)
  select 'a3000000-0000-0000-0000-000000000003', now() - interval '30 minutes' from generate_series(1, 200);
set local role service_role;
select is(public.claim_existing_account_notice('davi@cliente.com.br'), null,
  'com 200 avisos na última hora, nenhum outro sai');
reset role;

-- 6. Apagar a Conta de usuário apaga os avisos dela.
delete from auth.users where id = 'a3000000-0000-0000-0000-000000000001';
select is((select count(*)::int from private.existing_account_notices where user_id = 'a3000000-0000-0000-0000-000000000001'), 0,
  'apagar a Conta de usuário apaga os avisos dela');

select * from finish();
rollback;
