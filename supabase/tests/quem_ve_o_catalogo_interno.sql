begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(5);

-- Quem vê o catálogo de Sinais inteiro: a equipe da Althius vê os Sinais internos, o membro comum não, e quem não está
-- logado nem chama a função. Pessoas: Dora (staff da Althius) e Bruno (membro comum).
insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
                        created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
                        is_sso_user, is_anonymous)
values
  ('c1000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'dora@althius.test', '', now(), now(), now(), '{}', '{}', false, false),
  ('c1000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'bruno@norte.test', '', now(), now(), now(), '{}', '{}', false, false);
insert into private.althius_staff (user_id) values ('c1000000-0000-4000-8000-000000000001');

-- 1. A função não recebe usuário: só responde por quem está logado.
select has_function('public', 'viewer_is_althius_staff', array[]::text[], 'a função existe e não recebe parâmetro');

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);

-- 2. A equipe da Althius vê o catálogo inteiro.
select set_config('request.jwt.claim.sub', 'c1000000-0000-4000-8000-000000000001', true);
select is(public.viewer_is_althius_staff(), true, 'a equipe da Althius vê os Sinais internos');

-- 3. O membro comum vê só os Sinais que funcionam.
select set_config('request.jwt.claim.sub', 'c1000000-0000-4000-8000-000000000002', true);
select is(public.viewer_is_althius_staff(), false, 'o membro comum não vê os Sinais internos');

reset role;

-- 4 e 5. Quem não está logado não chama a função.
select is(has_function_privilege('anon', 'public.viewer_is_althius_staff()', 'execute'), false, 'anon não executa');

set local role anon;
select set_config('request.jwt.claim.role', 'anon', true);
select set_config('request.jwt.claim.sub', '', true);
select throws_ok('select public.viewer_is_althius_staff()', '42501', null, 'anon recebe permissão negada');
reset role;

select * from finish();
rollback;
