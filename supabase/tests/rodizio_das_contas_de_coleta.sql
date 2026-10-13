begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(16);

-- 1. Só a chave de serviço mexe na espera e no cursor. anon e authenticated não chegam às funções nem às tabelas.
select ok(
  has_function_privilege('service_role', 'public.list_collection_account_cooldowns()', 'execute')
    and not has_function_privilege('anon', 'public.list_collection_account_cooldowns()', 'execute')
    and not has_function_privilege('authenticated', 'public.list_collection_account_cooldowns()', 'execute'),
  'só service_role lista a espera');
select ok(
  has_function_privilege('service_role', 'public.mark_collection_account_cooldown(integer, timestamptz, text)', 'execute')
    and not has_function_privilege('anon', 'public.mark_collection_account_cooldown(integer, timestamptz, text)', 'execute')
    and not has_function_privilege('authenticated', 'public.mark_collection_account_cooldown(integer, timestamptz, text)', 'execute'),
  'só service_role grava a espera');
select ok(
  has_function_privilege('service_role', 'public.next_collection_account_start(integer)', 'execute')
    and not has_function_privilege('anon', 'public.next_collection_account_start(integer)', 'execute')
    and not has_function_privilege('authenticated', 'public.next_collection_account_start(integer)', 'execute'),
  'só service_role avança o cursor');
select ok(
  not has_table_privilege('anon', 'private.collection_account_cooldowns', 'select')
    and not has_table_privilege('authenticated', 'private.collection_account_cooldowns', 'select')
    and not has_table_privilege('service_role', 'private.collection_account_cooldowns', 'select'),
  'anon, authenticated e service_role não leem a tabela da espera');
select ok(
  not has_table_privilege('anon', 'private.collection_account_cursor', 'select')
    and not has_table_privilege('authenticated', 'private.collection_account_cursor', 'select'),
  'anon e authenticated não leem o cursor');

-- 2. A espera guarda índice e motivo, nunca um segredo.
select hasnt_column('private', 'collection_account_cooldowns', 'token', 'a espera não tem coluna de segredo');
select hasnt_column('private', 'collection_account_cooldowns', 'secret', 'a espera não tem coluna secret');

set local role service_role;

-- 3. O cursor avança e volta ao início.
select is(public.next_collection_account_start(2), 0, 'a primeira partida é 0');
select is(public.next_collection_account_start(2), 1, 'a seguinte é 1');
select is(public.next_collection_account_start(2), 0, 'a terceira volta a 0');

-- 4. A espera vigente volta com índice e motivo; a vencida não volta. Slot e motivo inválidos não entram.
select lives_ok($$ select public.mark_collection_account_cooldown(2, now() + interval '30 minutes', 'credito') $$, 'grava a espera de crédito');
select is(
  (select count(*)::int from public.list_collection_account_cooldowns() where slot = 2 and reason = 'credito'),
  1,
  'a lista devolve o índice 2 e o motivo credito');
select lives_ok($$ select public.mark_collection_account_cooldown(1, now() - interval '1 minute', 'limite') $$, 'grava uma espera já vencida');
select is(
  (select count(*)::int from public.list_collection_account_cooldowns() where slot = 1),
  0,
  'espera vencida não volta');
select throws_ok(
  $$ select public.mark_collection_account_cooldown(9, now() + interval '1 minute', 'credito') $$,
  '23514', null, 'slot fora de 0 a 5 não entra');
select throws_ok(
  $$ select public.mark_collection_account_cooldown(3, now() + interval '1 minute', 'segredo-da-conta') $$,
  '23514', null, 'motivo que não é credito nem limite não entra');

select * from finish();
rollback;
