begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(15);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous)
values ('d2000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'confirmacao@test.local', '', now(), now(), now(), '{}', '{}', false, false);
insert into public.workspaces (id, kind, name) values ('d3000000-0000-0000-0000-000000000001', 'empresa', 'Confirmação');

select ok(to_regclass('private.whatsapp_action_confirmations') is not null, 'tokens de confirmação ficam em tabela privada');
select hasnt_column('private', 'whatsapp_action_confirmations', 'payload', 'conteúdo da ação não é armazenado');
select has_function('public', 'create_whatsapp_confirmation', array['text','uuid','uuid','text','jsonb'], 'RPC de criação recebe payload jsonb');
select has_function('public', 'decide_whatsapp_confirmation', array['text','uuid','uuid','text','jsonb','text'], 'RPC de decisão recebe payload jsonb');
select ok(not has_table_privilege('service_role', 'private.whatsapp_action_confirmations', 'select,insert,update'), 'service_role acessa a tabela somente pelas RPCs');
set local role service_role;
select is(public.create_whatsapp_confirmation('token-confirmacao-001-abcdef0123456789', 'd2000000-0000-0000-0000-000000000001', 'd3000000-0000-0000-0000-000000000001', 'pausar_rotina', '{"rotina":"fintechs","acao":"pausar"}'::jsonb) is not null, true, 'cria token com escopo e payload');
select is(public.decide_whatsapp_confirmation('token-confirmacao-001-abcdef0123456789', 'd2000000-0000-0000-0000-000000000001', 'd3000000-0000-0000-0000-000000000001', 'pausar_rotina', '{"acao":"pausar","rotina":"fintechs"}'::jsonb, 'aprovar'), 'aprovar', 'payload jsonb igual com outra ordem pode ser aprovado');
select is(public.decide_whatsapp_confirmation('token-confirmacao-001-abcdef0123456789', 'd2000000-0000-0000-0000-000000000001', 'd3000000-0000-0000-0000-000000000001', 'pausar_rotina', '{"rotina":"fintechs","acao":"pausar"}'::jsonb, 'aprovar'), 'usado', 'token repetido não executa novamente');
select is(public.decide_whatsapp_confirmation('token-confirmacao-001-abcdef0123456789', 'd2000000-0000-0000-0000-000000000002', 'd3000000-0000-0000-0000-000000000001', 'pausar_rotina', '{"rotina":"fintechs","acao":"pausar"}'::jsonb, 'aprovar'), 'invalido', 'outro usuário não pode decidir');
select is(public.decide_whatsapp_confirmation('token-confirmacao-001-abcdef0123456789', 'd2000000-0000-0000-0000-000000000001', 'd3000000-0000-0000-0000-000000000001', 'pausar_rotina', '{"acao":"pausar"}'::jsonb, 'aprovar'), 'usado', 'payload alterado não reaproveita token consumido');
select ok(public.create_whatsapp_confirmation('token-confirmacao-002-abcdef0123456789', 'd2000000-0000-0000-0000-000000000001', 'd3000000-0000-0000-0000-000000000001', 'pausar_rotina', '{"acao":"pausar"}'::jsonb) is not null, 'cria segundo token');
select is(public.decide_whatsapp_confirmation('token-confirmacao-002-abcdef0123456789', 'd2000000-0000-0000-0000-000000000001', 'd3000000-0000-0000-0000-000000000001', 'pausar_rotina', '{"acao":"retomar"}'::jsonb, 'aprovar'), 'alterado', 'payload diferente invalida a confirmação');
select is(public.decide_whatsapp_confirmation('token-confirmacao-002-abcdef0123456789', 'd2000000-0000-0000-0000-000000000001', 'd3000000-0000-0000-0000-000000000001', 'pausar_rotina', '{"acao":"pausar"}'::jsonb, 'aprovar'), 'usado', 'token de payload alterado não pode ser reaproveitado');
select ok(public.create_whatsapp_confirmation('token-confirmacao-003-abcdef0123456789', 'd2000000-0000-0000-0000-000000000001', 'd3000000-0000-0000-0000-000000000001', 'pausar_rotina', '{"acao":"pausar"}'::jsonb) is not null, 'cria token para validar expiração');
reset role;
update private.whatsapp_action_confirmations set expires_at = now() - interval '1 second'
where token_hash = encode(extensions.digest('token-confirmacao-003-abcdef0123456789', 'sha256'), 'hex');
set local role service_role;
select is(public.decide_whatsapp_confirmation('token-confirmacao-003-abcdef0123456789', 'd2000000-0000-0000-0000-000000000001', 'd3000000-0000-0000-0000-000000000001', 'pausar_rotina', '{"acao":"pausar"}'::jsonb, 'aprovar'), 'expirado', 'token vencido não executa');
select * from finish();
rollback;
