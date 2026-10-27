begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(8);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, last_sign_in_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous)
values ('d2100000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'link-acao@test.local', '', now(), now(), now(), now(), '{}', '{}', false, false);
insert into public.workspaces (id, kind, name) values ('d3100000-0000-0000-0000-000000000001', 'empresa', 'Link de ação');

select has_function('public', 'create_whatsapp_action_link', array['text','uuid','uuid','text','jsonb'], 'emite link opaco de ação');
select has_function('public', 'decide_whatsapp_action_link', array['text','text'], 'decide ação após autenticação');
set local role service_role;
select is(public.create_whatsapp_action_link('token-link-acao-001-abcdef0123456789', 'd2100000-0000-0000-0000-000000000001', 'd3100000-0000-0000-0000-000000000001', 'erase_contact', '{"contato":"e4100000-0000-0000-0000-000000000001"}'::jsonb), 'criado', 'emite token de uso único');
reset role;
select ok(not has_table_privilege('authenticated', 'private.whatsapp_action_links', 'select,insert,update'), 'link permanece privado');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'd2100000-0000-0000-0000-000000000001', true);
reset role;
update auth.users set last_sign_in_at = now() - interval '13 hours' where id = 'd2100000-0000-0000-0000-000000000001';
set local role authenticated;
select is(public.decide_whatsapp_action_link('token-link-acao-001-abcdef0123456789', null), 'invalido', 'decisão fora do catálogo é recusada');
select is(public.decide_whatsapp_action_link('token-link-acao-001-abcdef0123456789', 'aprovar'), 'login_recente', 'link exige login recente antes de aprovar');
reset role;
update auth.users set last_sign_in_at = now() where id = 'd2100000-0000-0000-0000-000000000001';
set local role authenticated;
select is(public.decide_whatsapp_action_link('token-link-acao-001-abcdef0123456789', 'aprovar'), 'aprovar', 'login recente pode aprovar a ação vinculada');
select is(public.decide_whatsapp_action_link('token-link-acao-001-abcdef0123456789', 'aprovar'), 'usado', 'link aprovado não pode ser usado novamente');

select * from finish();
rollback;
