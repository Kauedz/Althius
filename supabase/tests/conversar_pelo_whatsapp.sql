begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(17);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous, last_sign_in_at)
values ('67000000-0000-0000-0000-000000000007', 'authenticated', 'authenticated', 'canais07@althius.test', '',
  now(), now(), now(), '{}', '{}', false, false, now());
insert into public.workspaces (id, kind, name) values ('a7000000-0000-0000-0000-000000000007', 'empresa', 'Norte');
insert into private.workspace_contracts (workspace_id, tier_id, starts_at)
select 'a7000000-0000-0000-0000-000000000007', 'escala', date_trunc('month', now());
select public.grant_credits('a7000000-0000-0000-0000-000000000007', 100, 'plano', 'teste canais 07');
insert into public.workspace_memberships (workspace_id, user_id, role, active)
values ('a7000000-0000-0000-0000-000000000007', '67000000-0000-0000-0000-000000000007', 'member', true);
select private.seed_default_agents('a7000000-0000-0000-0000-000000000007');
insert into private.whatsapp_channel_settings (workspace_id, enabled) values ('a7000000-0000-0000-0000-000000000007', true);
insert into private.user_channel_phones (user_id, phone_e164, verified_at)
values ('67000000-0000-0000-0000-000000000007', '+5511999990007', now());

select ok(has_function_privilege('service_role', 'public.start_channel_run(uuid,uuid,text,text,boolean)', 'execute')
  and not has_function_privilege('authenticated', 'public.start_channel_run(uuid,uuid,text,text,boolean)', 'execute'),
  'somente o servidor abre uma execução WhatsApp');
select is(public.claim_whatsapp_channel_event('wamid.07'), true, 'o primeiro wamid é reservado');
select is(public.claim_whatsapp_channel_event('wamid.07'), false, 'o mesmo wamid não é reservado duas vezes');
select is(public.claim_whatsapp_unknown_reply('5511888880007'), true, 'a recusa do número desconhecido é liberada uma vez');
select is(public.claim_whatsapp_unknown_reply('5511888880007'), false, 'a recusa diária do mesmo número tem teto de uma');
select is((select count(*)::int from private.agent_runs), 0, 'recusas a números desconhecidos não criam Execução');
select is((select count(*)::int from private.credit_entries), 1, 'recusas a números desconhecidos não lançam nem reservam Créditos');
select is(public.whatsapp_channel_account_by_phone('5511999990007'), '67000000-0000-0000-0000-000000000007'::uuid,
  'telefone verificado reconhece a Conta com login recente');
select is((select count(*)::int from public.whatsapp_channel_eligible_workspaces('67000000-0000-0000-0000-000000000007')),
  1, 'somente Workspace habilitado, ativo e contratado é elegível');
select is(public.set_whatsapp_channel_notices_stopped('67000000-0000-0000-0000-000000000007', true), true,
  'PARAR persiste a preferência');
select is(public.whatsapp_channel_notice_stopped('67000000-0000-0000-0000-000000000007'), true,
  'a preferência de avisos desligados é lida');
select * from public.set_whatsapp_channel_session('67000000-0000-0000-0000-000000000007', null, true, false);
select is((select awaiting_workspace from public.get_whatsapp_channel_session('67000000-0000-0000-0000-000000000007')),
  true, 'a escolha de Workspace pendente persiste entre eventos do webhook');

select set_config('test.run', (select run_id::text from public.start_channel_run(
  'a7000000-0000-0000-0000-000000000007', '67000000-0000-0000-0000-000000000007', 'Quantos Créditos tenho?', 'wamid.07')), true);
select set_config('test.conversation', (select conversation_id::text from private.agent_runs where id = current_setting('test.run')::uuid), true);
select is((select origin from private.agent_conversations where id = current_setting('test.conversation')::uuid), 'whatsapp',
  'a Conversa aberta tem origem WhatsApp');
select is((select request_text from private.agent_runs where id = current_setting('test.run')::uuid),
  E'Workspace: Norte\n\nQuantos Créditos tenho?', 'o nome do Workspace inicia o pedido recebido pelo motor');
select is((select trigger_kind from private.agent_runs where id = current_setting('test.run')::uuid), 'canal',
  'a execução entra na fila do motor como Canal');
select is((select run_id::text from public.start_channel_run(
  'a7000000-0000-0000-0000-000000000007', '67000000-0000-0000-0000-000000000007', 'Quantos Créditos tenho?', 'wamid.07')),
  current_setting('test.run'), 'repetir a mesma solicitação devolve a mesma execução');
select throws_ok($$select * from public.start_channel_run(
  'a7000000-0000-0000-0000-000000000007', '67000000-0000-0000-0000-000000000007', 'Outra pergunta', 'wamid.08')$$,
  '55006', 'conversation busy', 'a segunda mensagem durante Execução recebe a recusa de ocupado');

select * from finish();
rollback;
