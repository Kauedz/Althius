begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(4);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
                        created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
                        is_sso_user, is_anonymous)
values
  ('a4000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'comex@test.invalid', '', now(), now(), now(), '{}', '{}', false, false),
  ('a4000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'agro@test.invalid', '', now(), now(), now(), '{}', '{}', false, false);
insert into public.workspaces (id, kind, name) values
  ('a5000000-0000-0000-0000-000000000001', 'empresa', 'Comex'),
  ('a5000000-0000-0000-0000-000000000002', 'empresa', 'Agro');
insert into public.workspace_memberships (workspace_id, user_id, role, active) values
  ('a5000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000001', 'admin', true),
  ('a5000000-0000-0000-0000-000000000002', 'a4000000-0000-0000-0000-000000000002', 'admin', true);
insert into private.workspace_icp_versions
  (workspace_id, version, sector, created_by)
values
  ('a5000000-0000-0000-0000-000000000001', 1, 'Comércio exterior e importação', 'a4000000-0000-0000-0000-000000000001'),
  ('a5000000-0000-0000-0000-000000000002', 1, 'Agronegócio e cooperativas', 'a4000000-0000-0000-0000-000000000002');

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'a4000000-0000-0000-0000-000000000001', true);
select is((select count(*)::integer from public.list_signal_catalog_for_my_icp('a5000000-0000-0000-0000-000000000001') where matches_icp),
  (select count(*)::integer from public.signal_catalog c join public.signal_catalog_niches n on n.catalog_id = c.id
   where c.workspace_id is null and n.niche_slug = 'comex-e-importacao'),
  'o ICP de comércio exterior retorna os cards do nicho correspondente');
select isnt((select array_agg(id order by id) from public.list_signal_catalog_for_my_icp('a5000000-0000-0000-0000-000000000001') where matches_icp),
  (select array_agg(id order by id) from public.list_signal_catalog_for_my_icp('a5000000-0000-0000-0000-000000000002') where matches_icp),
  'ICPs de nichos diferentes produzem prateleiras diferentes');
select throws_ok($$select * from public.list_signal_catalog_for_my_icp('a5000000-0000-0000-0000-000000000002')$$,
  '42501', 'active workspace membership required', 'um participante não consulta catálogo cruzado de outro workspace');
select ok((select prosecdef from pg_proc where oid = 'public.list_signal_catalog_for_my_icp(uuid)'::regprocedure),
  'a RPC de leitura usa security definer para consultar o ICP privado');

reset role;
select * from finish();
rollback;
