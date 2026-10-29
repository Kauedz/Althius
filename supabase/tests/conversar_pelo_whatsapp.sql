begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(21);

create function pg_temp.semear_agentes_padrao(p_workspace_id uuid) returns void language plpgsql as $$
begin
  with novos as (insert into private.agents (workspace_id, specialty, kind)
    select p_workspace_id, c.specialty, 'padrao' from private.specialty_catalog c
    on conflict do nothing returning id, workspace_id, specialty), configuracao as (
    insert into private.agent_settings (agent_id, workspace_id, channels)
    select n.id, n.workspace_id, array['whatsapp']::text[] from novos n)
  insert into private.agent_permissions (agent_id, workspace_id, integration_id, permission)
  select n.id, n.workspace_id, d.integration_id, d.permission from novos n
  join private.specialty_default_permissions d on d.specialty = n.specialty;
end; $$;

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
select pg_temp.semear_agentes_padrao('a7000000-0000-0000-0000-000000000007');
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

-- A resposta de uma falha precisa sobreviver ao template enviado fora da janela de 24 horas.
update private.whatsapp_last_inbound
set received_at = now() - interval '25 hours'
where phone_hash = encode(extensions.digest('5511999990007', 'sha256'), 'hex');
insert into private.whatsapp_last_inbound(phone_hash, received_at)
values (encode(extensions.digest('5511999990007', 'sha256'), 'hex'), now() - interval '25 hours')
on conflict (phone_hash) do update set received_at = excluded.received_at;
update private.agent_runs set status = 'failed', error_code = 'timeout', finished_at = now()
where id = current_setting('test.run')::uuid;
insert into private.agent_run_events(run_id, seq, kind, payload)
values (current_setting('test.run')::uuid, 1, 'falha', '{"motivo":"timeout"}');
select is((select within_window from public.claim_whatsapp_channel_delivery(current_setting('test.run')::uuid)), false,
  'a falha é detectada fora da janela de 24 horas');
select is(public.claim_whatsapp_pending_answer('67000000-0000-0000-0000-000000000007'),
  'O pedido passou do tempo e foi interrompido, sem resposta. Tente de novo.',
  'a falha fora da janela fica pendente para a próxima mensagem');

-- Duas Execuções do mesmo usuário devem manter ambas as respostas pendentes e consumi-las em ordem.
select set_config('test.run2', (select run_id::text from public.start_channel_run(
  'a7000000-0000-0000-0000-000000000007', '67000000-0000-0000-0000-000000000007', 'Segundo pedido', 'wamid.09')), true);
insert into private.whatsapp_pending_answers(user_id, run_id, answer, created_at)
values ('67000000-0000-0000-0000-000000000007', current_setting('test.run')::uuid, 'primeira', now() - interval '2 seconds');
insert into private.whatsapp_pending_answers(user_id, run_id, answer, created_at)
values ('67000000-0000-0000-0000-000000000007', current_setting('test.run2')::uuid, 'segunda', now());
select is((select count(*)::int from private.whatsapp_pending_answers
  where user_id = '67000000-0000-0000-0000-000000000007'), 2, 'respostas pendentes distintas não se sobrescrevem');
select is(public.claim_whatsapp_pending_answer('67000000-0000-0000-0000-000000000007'), 'primeira',
  'a resposta pendente mais antiga é entregue primeiro');

select * from finish();
rollback;
