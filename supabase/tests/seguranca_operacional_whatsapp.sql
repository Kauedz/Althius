begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(20);

select has_table('private', 'whatsapp_channel_security_limits', 'limites operacionais são configuráveis');
select has_function('public', 'set_whatsapp_channel_security_limits', array['integer', 'integer', 'integer'], 'há RPC para configurar limites');
select ok(has_function_privilege('service_role', 'public.claim_whatsapp_channel_message(text)', 'execute')
  and not has_function_privilege('authenticated', 'public.claim_whatsapp_channel_message(text)', 'execute'),
  'somente o backend pode consumir o rate limit');
select ok(has_function_privilege('service_role', 'public.set_whatsapp_channel_security_limits(integer,integer,integer)', 'execute')
  and not has_function_privilege('authenticated', 'public.set_whatsapp_channel_security_limits(integer,integer,integer)', 'execute'),
  'somente o backend configura os limites');
select is((select messages_per_10m from private.whatsapp_channel_security_limits where singleton), 20, 'o padrão limita a vinte mensagens em dez minutos');
select is((select messages_per_day from private.whatsapp_channel_security_limits where singleton), 200, 'o padrão limita a duzentas mensagens por dia');
select is((select runs_per_workspace_hour from private.whatsapp_channel_security_limits where singleton), 20, 'o teto inicial do Workspace é configurável e conservador');

select lives_ok($$select public.set_whatsapp_channel_security_limits(3, 2, 1)$$, 'os limites podem ser ajustados');
select is(public.claim_whatsapp_channel_message('5511888111111'), true, 'primeira mensagem do período é aceita');
select is(public.claim_whatsapp_channel_message('5511888111111'), true, 'segunda mensagem respeita o limite diário configurado');
select is(public.claim_whatsapp_channel_message('5511888111111'), false, 'mensagem acima do limite diário é recusada');
select throws_ok($$select public.set_whatsapp_channel_security_limits(0, 2, 1)$$, '22023', 'invalid WhatsApp channel limits', 'limite zero é inválido');

select lives_ok($$select public.set_whatsapp_channel_security_limits(2, 10, 1)$$, 'limite curto pode ser ajustado independentemente');
select is(public.claim_whatsapp_channel_message('5511888222222'), true, 'primeira mensagem da janela curta é aceita');
select is(public.claim_whatsapp_channel_message('5511888222222'), true, 'segunda mensagem da janela curta é aceita');
select is(public.claim_whatsapp_channel_message('5511888222222'), false, 'terceira mensagem em dez minutos é recusada');

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous, last_sign_in_at)
values ('67100000-0000-0000-0000-000000000017', 'authenticated', 'authenticated', 'seguranca17@althius.test', '',
  now(), now(), now(), '{}', '{}', false, false, now());
insert into public.workspaces (id, kind, name) values ('a7100000-0000-0000-0000-000000000017', 'empresa', 'Workspace de segurança');
insert into private.agent_conversations (id, workspace_id, owner_id, kind, origin) values
  ('c7100000-0000-0000-0000-000000000017', 'a7100000-0000-0000-0000-000000000017', '67100000-0000-0000-0000-000000000017', 'coordenada', 'whatsapp'),
  ('c7100000-0000-0000-0000-000000000018', 'a7100000-0000-0000-0000-000000000017', '67100000-0000-0000-0000-000000000017', 'coordenada', 'slack'),
  ('c7100000-0000-0000-0000-000000000019', 'a7100000-0000-0000-0000-000000000017', '67100000-0000-0000-0000-000000000017', 'coordenada', 'whatsapp');
select lives_ok($$insert into private.agent_runs(workspace_id, conversation_id, requested_by, client_request_id, request_text, trigger_kind)
  values ('a7100000-0000-0000-0000-000000000017', 'c7100000-0000-0000-0000-000000000017', '67100000-0000-0000-0000-000000000017',
    'd7100000-0000-0000-0000-000000000017', 'mensagem de teste', 'canal')$$, 'primeira Execução do Workspace é aceita');
select lives_ok($$insert into private.agent_runs(workspace_id, conversation_id, requested_by, client_request_id, request_text, trigger_kind)
  values ('a7100000-0000-0000-0000-000000000017', 'c7100000-0000-0000-0000-000000000018', '67100000-0000-0000-0000-000000000017',
    'd7100000-0000-0000-0000-000000000018', 'execucao do slack', 'canal')$$, 'o limite WhatsApp não bloqueia Execução do Slack');
select throws_ok($$insert into private.agent_runs(workspace_id, conversation_id, requested_by, client_request_id, request_text, trigger_kind)
  values ('a7100000-0000-0000-0000-000000000017', 'c7100000-0000-0000-0000-000000000019', '67100000-0000-0000-0000-000000000017',
    'd7100000-0000-0000-0000-000000000019', 'outra mensagem de teste', 'canal')$$,
  '55000', 'WhatsApp workspace run limit reached', 'segunda Execução WhatsApp na hora é recusada pelo teto do Workspace');

select has_trigger('private', 'agent_runs', 'whatsapp_workspace_run_limit', 'Execuções do Canal passam pelo teto por Workspace');
select * from finish();
rollback;
