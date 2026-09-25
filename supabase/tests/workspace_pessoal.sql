begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(21);

-- Marina tem e-mail verificado e nome no cadastro; Rui é uma conta antiga criada por link, sem nome;
-- Nina ainda não verificou o e-mail.
insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
                        created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
                        is_sso_user, is_anonymous)
values
  ('30000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'marina@cliente.com.br', '', now(), now(), now(), '{}', '{"full_name":"Marina Alves"}', false, false),
  ('30000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'rui.souza@cliente.com.br', '', now(), now(), now(), '{}', '{}', false, false),
  ('30000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'nina@cliente.com.br', '', null, now(), now(), '{}', '{"name":"Nina"}', false, false);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);

-- Primeiro acesso da Marina.
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000001', true);
create temporary table primeiro(id uuid, kind text, name text, owner_user_id uuid) on commit drop;
insert into primeiro select id, kind, name, owner_user_id from public.bootstrap_personal_workspace('2026-09-25');

select is((select kind from primeiro), 'pessoal', 'o bootstrap cria um Workspace pessoal');
select is((select name from primeiro), 'Marina Alves', 'o Workspace pessoal nasce com o nome da pessoa');
select is((select owner_user_id from primeiro), '30000000-0000-0000-0000-000000000001'::uuid,
  'a Conta de usuário é a Titular do Workspace pessoal');
select is(
  (select role from public.workspace_memberships
    where workspace_id = (select id from primeiro) and user_id = '30000000-0000-0000-0000-000000000001' and active),
  'admin', 'a Titular tem Participação ativa de Administrador');
select is(
  (select terms_version from public.terms_acceptances where user_id = '30000000-0000-0000-0000-000000000001'),
  '2026-09-25', 'o bootstrap grava a versão dos Termos de Uso e da Política de Privacidade aceitos');
select ok(
  (select accepted_at is not null from public.terms_acceptances where user_id = '30000000-0000-0000-0000-000000000001'),
  'o bootstrap grava a data do aceite');
select is((select count(*)::int from public.workspaces), 1, 'a Titular enxerga o próprio Workspace pessoal');

-- Repetir o login, atualizar a página ou voltar do Google chama o bootstrap de novo.
select is((select id from public.bootstrap_personal_workspace('2026-09-25')), (select id from primeiro),
  'chamar o bootstrap de novo devolve o mesmo Workspace pessoal');
select is((select count(*)::int from public.workspaces where owner_user_id = '30000000-0000-0000-0000-000000000001'), 1,
  'repetir o bootstrap não cria outro Workspace pessoal');
select is((select count(*)::int from public.workspace_memberships where user_id = '30000000-0000-0000-0000-000000000001'), 1,
  'repetir o bootstrap não cria outra Participação');

-- A versão dos Termos muda: o login seguinte não registra um aceite que a pessoa não viu.
select lives_ok($$select public.bootstrap_personal_workspace('2026-10-01')$$,
  'o login depois de mudar a versão dos Termos continua funcionando');
select is(
  (select terms_version from public.terms_acceptances where user_id = '30000000-0000-0000-0000-000000000001'),
  '2026-09-25', 'o bootstrap não sobrescreve o aceite existente com a versão nova');

-- Conta antiga sem nome: rótulo neutro, nunca derivado do e-mail.
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000002', true);
select is((select name from public.bootstrap_personal_workspace('2026-09-25')), 'Workspace pessoal',
  'sem nome no cadastro, o Workspace pessoal usa um rótulo neutro, e não o e-mail');
select is((select count(*)::int from public.workspaces), 1,
  'outra Conta de usuário não enxerga o Workspace pessoal alheio');
select is((select count(*)::int from public.workspaces where id = (select id from primeiro)), 0,
  'o Workspace pessoal da Marina fica isolado do Rui');

-- Sem e-mail verificado não há Workspace pessoal nem Participação.
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000003', true);
select throws_ok(
  $$select public.bootstrap_personal_workspace('2026-09-25')$$,
  '42501', 'email not verified',
  'o bootstrap recusa Conta de usuário sem e-mail verificado'
);

select throws_ok(
  $$insert into public.workspaces(kind, name, owner_user_id) values ('pessoal', 'Invasor', '30000000-0000-0000-0000-000000000003')$$,
  '42501', null,
  'o cliente não cria Workspaces por fora do bootstrap'
);

-- A proteção da Titular vale até para quem opera o banco com privilégios.
reset role;
insert into public.workspace_memberships(workspace_id, user_id, role, active)
select id, '30000000-0000-0000-0000-000000000002', 'admin', true from primeiro;

select throws_ok(
  $$update public.workspace_memberships set role = 'member'
    where workspace_id = (select id from primeiro) and user_id = '30000000-0000-0000-0000-000000000001'$$,
  '42501', 'the owner of a personal workspace cannot be removed or demoted',
  'a Titular não pode ser rebaixada no próprio Workspace pessoal'
);
select throws_ok(
  $$update public.workspace_memberships set active = false
    where workspace_id = (select id from primeiro) and user_id = '30000000-0000-0000-0000-000000000001'$$,
  '42501', 'the owner of a personal workspace cannot be removed or demoted',
  'a Titular não pode ter a Participação desativada no próprio Workspace pessoal'
);
select throws_ok(
  $$delete from public.workspace_memberships
    where workspace_id = (select id from primeiro) and user_id = '30000000-0000-0000-0000-000000000001'$$,
  '42501', 'the owner of a personal workspace cannot be removed or demoted',
  'a Titular não pode ser removida do próprio Workspace pessoal'
);
select lives_ok(
  $$delete from public.workspace_memberships
    where workspace_id = (select id from primeiro) and user_id = '30000000-0000-0000-0000-000000000002'$$,
  'quem foi convidado ao Workspace pessoal pode ser removido'
);

select * from finish();
rollback;
