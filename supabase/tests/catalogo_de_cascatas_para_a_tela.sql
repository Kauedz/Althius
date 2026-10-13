begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(10);

-- O catálogo de cascatas que a tela lê (ticket 13): um cartão por Sinal do Mapa, só com o que o cartão mostra.
-- A RPC do servidor (`signal_cascade_catalog`) continua só do service_role; esta é a de leitura da tela.
insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
                        created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
                        is_sso_user, is_anonymous)
values
  ('d1000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'ana@norte.test', '', now(), now(), now(), '{}', '{}', false, false);

-- 1. Quem pode chamar.
select ok(
  has_function_privilege('authenticated', 'public.list_cascade_catalog()', 'execute')
    and not has_function_privilege('anon', 'public.list_cascade_catalog()', 'execute'),
  'a tela (authenticated) lê o catálogo de cascatas; anon não'
);
select ok(
  not has_function_privilege('authenticated', 'public.signal_cascade_catalog()', 'execute'),
  'a leitura técnica das cascatas continua só do servidor'
);

-- 2. O que a RPC devolve: só o que o cartão mostra, sem nada técnico.
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'd1000000-0000-0000-0000-000000000001', true);

create temporary table catalogo_da_tela on commit drop as
  select * from public.list_cascade_catalog();

select is(
  (select array_agg(attname::text order by attnum) from pg_attribute where attrelid = 'catalogo_da_tela'::regclass and attnum > 0),
  array['signal_type', 'icp', 'name', 'state', 'scope', 'sem_fonte_motivo'],
  'só seis colunas: tipo, ICP, nome, estado, escopo e o motivo do sem_fonte (nada de teto, passos, handler ou multiplicador)');
select is((select count(*)::integer from catalogo_da_tela), 39, 'os 39 Sinais do Mapa');
select is(
  (select array_agg(n order by icp) from (select icp, count(*)::integer n from catalogo_da_tela group by icp) t),
  array[5, 4, 5, 5, 6, 4, 5, 5],
  'por ICP A a H: 5, 4, 5, 5, 6, 4, 5, 5');
select is((select count(*)::integer from catalogo_da_tela where scope = 'mercado'), 8, 'oito são de Mercado (não são de uma Conta)');
select is((select count(*)::integer from catalogo_da_tela where state = 'sem_fonte'), 12, 'doze estão sem fonte');
select ok(
  not exists (select 1 from catalogo_da_tela where state = 'sem_fonte' and (sem_fonte_motivo is null or sem_fonte_motivo = ''))
    and not exists (select 1 from catalogo_da_tela where state <> 'sem_fonte' and sem_fonte_motivo is not null),
  'o sem_fonte sempre traz o motivo, e só ele');
select ok(
  not exists (select 1 from catalogo_da_tela
               where concat_ws(' ', name, sem_fonte_motivo) ~* '(apify|\yactors?\y|openai|anthropic|\yclaude\y|\ygpt[-\s]?[0-9]|\ycodex\y)'),
  'nenhum nome ou motivo cita fornecedor, actor ou modelo');
reset role;

-- 3. Cascata desligada não aparece; a leitura reflete o estado do banco.
update private.signal_cascades set state = 'disabled' where signal_type = 'vaga_comex';
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'd1000000-0000-0000-0000-000000000001', true);
select ok(
  not exists (select 1 from public.list_cascade_catalog() where signal_type = 'vaga_comex')
    and (select count(*)::integer from public.list_cascade_catalog()) = 38,
  'uma cascata desligada sai do catálogo da tela');
reset role;

select * from finish();
rollback;
