begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(41);

-- Workspace da empresa Norte: Ana é Administradora e Bruno é Membro. Diego se cadastrou sem nome e não participa de
-- nada. O perfil e as preferências são de cada Conta de usuário: ninguém lê nem muda os de outra pessoa.
insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
                        created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
                        is_sso_user, is_anonymous)
values
  ('50000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'ana@norte.com.br', '', now(), now(), now(), '{}', '{"full_name":"Ana Lima"}', false, false),
  ('50000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'bruno@norte.com.br', '', now(), now(), now(), '{}', '{"name":"Bruno Reis"}', false, false),
  ('50000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'diego@gmail.com', '', now(), now(), now(), '{}', '{}', false, false);

insert into public.workspaces (id, kind, name) values
  ('eeeeeeee-0000-0000-0000-000000000001', 'empresa', 'Norte');

insert into public.workspace_memberships (workspace_id, user_id, role, active) values
  ('eeeeeeee-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', 'admin', true),
  ('eeeeeeee-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000002', 'member', true);

-- As funções são security definer, com search_path vazio, e nenhuma recebe o id de uma Conta de usuário.
select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('get_my_profile', 'save_my_profile', 'get_my_preferences', 'save_my_preferences')
      and p.prosecdef and p.proconfig @> array['search_path=""']),
  4, 'as funções de perfil e preferências são security definer com search_path vazio');
select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('get_my_profile', 'save_my_profile', 'get_my_preferences', 'save_my_preferences')
      and 'uuid'::regtype::oid = any (p.proargtypes::oid[])),
  0, 'nenhuma função de perfil ou preferências recebe o id de uma Conta de usuário: vale sempre a da sessão');
select ok(
  (select c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'private' and c.relname = 'user_profiles'),
  'o perfil fica numa tabela com RLS ligado');
select ok(
  (select c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'private' and c.relname = 'user_preferences'),
  'as preferências ficam numa tabela com RLS ligado');

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);

-- Perfil da Ana: sem nada salvo, o nome vem do cadastro (ou do Google), e o e-mail é o da Conta de usuário.
select set_config('request.jwt.claim.sub', '50000000-0000-0000-0000-000000000001', true);
select is(
  (select name || ' · ' || email || ' · ' || coalesce(avatar_data_url, '-') from public.get_my_profile()),
  'Ana Lima · ana@norte.com.br · -', 'sem perfil salvo, o nome vem do cadastro e não há foto');

select is(
  (select name from public.save_my_profile('  Ana L. Costa  ', 'data:image/png;base64,iVBORw0KGgo=')),
  'Ana L. Costa', 'salvar o perfil devolve o nome gravado, sem espaços nas pontas');
select is(
  (select name || ' · ' || avatar_data_url from public.get_my_profile()),
  'Ana L. Costa · data:image/png;base64,iVBORw0KGgo=', 'o perfil salvo volta na leitura seguinte, com a foto');
select is(
  (select coalesce(avatar_data_url, '-') from public.save_my_profile('Ana L. Costa', null)),
  '-', 'remover a foto grava o perfil sem foto');
select is(
  (select coalesce(avatar_data_url, '-') from public.get_my_profile()),
  '-', 'a foto removida não volta');

select throws_ok(
  $$select public.save_my_profile('   ', null)$$,
  '22023', 'invalid name', 'o nome não fica vazio');
select throws_ok(
  $$select public.save_my_profile(repeat('a', 121), null)$$,
  '22023', 'invalid name', 'o nome tem no máximo 120 caracteres');
select throws_ok(
  $$select public.save_my_profile('Ana', 'https://exemplo.com/foto.png')$$,
  '22023', 'invalid avatar', 'a foto é uma imagem enviada pela pessoa, não um endereço externo');
select throws_ok(
  $$select public.save_my_profile('Ana', 'data:text/html;base64,PGgxPg==')$$,
  '22023', 'invalid avatar', 'a foto precisa ser uma imagem');
select throws_ok(
  $$select public.save_my_profile('Ana', 'data:image/png;base64,' || repeat('A', 400000))$$,
  '22023', 'invalid avatar', 'a foto tem um tamanho máximo');
select is(
  (select name from public.get_my_profile()),
  'Ana L. Costa', 'uma gravação recusada não muda o perfil salvo');

-- Bruno, no mesmo Workspace: vê só o próprio perfil, e o nome salvo pela Ana na lista de participantes.
select set_config('request.jwt.claim.sub', '50000000-0000-0000-0000-000000000002', true);
select is(
  (select name || ' · ' || email from public.get_my_profile()),
  'Bruno Reis · bruno@norte.com.br', 'outra Conta de usuário lê o próprio perfil, nunca o da Ana');
select is(
  (select name from public.list_workspace_participants('eeeeeeee-0000-0000-0000-000000000001')
    where user_id = '50000000-0000-0000-0000-000000000001'),
  'Ana L. Costa', 'os participantes do Workspace veem o nome que a Ana salvou em Meu perfil');
select is(
  (select name from public.list_workspace_participants('eeeeeeee-0000-0000-0000-000000000001')
    where user_id = '50000000-0000-0000-0000-000000000002'),
  'Bruno Reis', 'sem perfil salvo, a lista de participantes continua com o nome do cadastro');
select is(
  (select name from public.save_my_profile('Bruno R.', null)),
  'Bruno R.', 'o Bruno salva o próprio perfil');
select set_config('request.jwt.claim.sub', '50000000-0000-0000-0000-000000000001', true);
select is(
  (select name from public.get_my_profile()),
  'Ana L. Costa', 'o perfil que o Bruno salvou não sobrescreve o da Ana');

-- Diego: cadastrado sem nome, o nome fica ausente; nunca é deduzido do e-mail.
select set_config('request.jwt.claim.sub', '50000000-0000-0000-0000-000000000003', true);
select is(
  (select coalesce(name, '-') || ' · ' || email from public.get_my_profile()),
  '- · diego@gmail.com', 'sem nome no cadastro, o perfil não inventa um a partir do e-mail');
select is(
  (select theme from public.save_my_preferences(p_theme => 'escuro')),
  'escuro', 'quem não participa de nenhum Workspace também guarda as próprias preferências');

-- Preferências da Ana: sem nada salvo, tema do navegador e notificações desligadas.
select set_config('request.jwt.claim.sub', '50000000-0000-0000-0000-000000000001', true);
select is(
  (select coalesce(theme, '-') || ' · ' || browser_notifications from public.get_my_preferences()),
  '- · false', 'sem preferências salvas, não há tema escolhido e as notificações ficam desligadas');
select is(
  (select theme || ' · ' || browser_notifications from public.save_my_preferences(p_theme => 'claro')),
  'claro · false', 'salvar só o tema mantém as notificações como estavam');
select is(
  (select theme || ' · ' || browser_notifications from public.save_my_preferences(p_browser_notifications => true)),
  'claro · true', 'salvar só as notificações mantém o tema como estava');
select is(
  (select theme || ' · ' || browser_notifications from public.get_my_preferences()),
  'claro · true', 'as preferências salvas voltam em qualquer sessão da Conta de usuário');
select throws_ok(
  $$select public.save_my_preferences(p_theme => 'roxo')$$,
  '22023', 'invalid theme', 'só existem os temas claro e escuro');

-- Bruno: as preferências da Ana não chegam a ele, e as dele não sobrescrevem as dela.
select set_config('request.jwt.claim.sub', '50000000-0000-0000-0000-000000000002', true);
select is(
  (select coalesce(theme, '-') || ' · ' || browser_notifications from public.get_my_preferences()),
  '- · false', 'outra Conta de usuário não herda as preferências da Ana');
select is(
  (select theme || ' · ' || browser_notifications from public.save_my_preferences('escuro', false)),
  'escuro · false', 'o Bruno salva as próprias preferências');
select set_config('request.jwt.claim.sub', '50000000-0000-0000-0000-000000000001', true);
select is(
  (select theme || ' · ' || browser_notifications from public.get_my_preferences()),
  'claro · true', 'as preferências que o Bruno salvou não sobrescrevem as da Ana');

-- Nada se lê nem se escreve direto nas tabelas pela API: só pelas funções, sempre com a Conta de usuário da sessão.
select throws_ok(
  $$select count(*) from private.user_preferences$$,
  '42501', 'permission denied for schema private', 'as preferências não são lidas direto pela API');
select throws_ok(
  $$update private.user_profiles set display_name = 'Invasor'$$,
  '42501', 'permission denied for schema private', 'o perfil de outra pessoa não é escrito direto pela API');

-- Sem sessão identificada, nada.
select set_config('request.jwt.claim.sub', '', true);
select throws_ok(
  $$select public.get_my_profile()$$,
  '42501', 'authentication required', 'ler o perfil exige uma Conta de usuário autenticada');
select throws_ok(
  $$select public.save_my_preferences(p_theme => 'claro')$$,
  '42501', 'authentication required', 'salvar preferências exige uma Conta de usuário autenticada');

-- Visitante sem login (anon): as funções nem podem ser chamadas.
set local role anon;
select set_config('request.jwt.claim.role', 'anon', true);
select throws_ok(
  $$select public.get_my_profile()$$,
  '42501', 'permission denied for function get_my_profile', 'o visitante não lê perfis');
select throws_ok(
  $$select public.save_my_profile('Invasor', null)$$,
  '42501', 'permission denied for function save_my_profile', 'o visitante não salva perfis');
select throws_ok(
  $$select public.get_my_preferences()$$,
  '42501', 'permission denied for function get_my_preferences', 'o visitante não lê preferências');
select throws_ok(
  $$select public.save_my_preferences('claro', true)$$,
  '42501', 'permission denied for function save_my_preferences', 'o visitante não salva preferências');
reset role;

-- A Participação removida não leva o perfil nem as preferências: são da Conta de usuário, não do Workspace.
update public.workspace_memberships set active = false
where workspace_id = 'eeeeeeee-0000-0000-0000-000000000001' and user_id = '50000000-0000-0000-0000-000000000002';
select is(
  (select display_name from private.user_profiles where user_id = '50000000-0000-0000-0000-000000000002'),
  'Bruno R.', 'sair do Workspace preserva o perfil da Conta de usuário');
select is(
  (select theme from private.user_preferences where user_id = '50000000-0000-0000-0000-000000000002'),
  'escuro', 'sair do Workspace preserva as preferências da Conta de usuário');

-- Excluir a Conta de usuário leva junto o perfil e as preferências dela.
delete from auth.users where id = '50000000-0000-0000-0000-000000000003';
select is(
  (select count(*)::int from private.user_profiles where user_id = '50000000-0000-0000-0000-000000000003')
  + (select count(*)::int from private.user_preferences where user_id = '50000000-0000-0000-0000-000000000003'),
  0, 'excluir a Conta de usuário apaga o perfil e as preferências dela');

select * from finish();
rollback;
