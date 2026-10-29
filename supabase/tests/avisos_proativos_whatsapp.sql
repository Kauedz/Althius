begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(29);
create function pg_temp.semear_agentes_padrao(p_workspace_id uuid) returns void
language plpgsql
as $$
begin
  with novos as (
    insert into private.agents (workspace_id, specialty, kind)
    select p_workspace_id, c.specialty, 'padrao' from private.specialty_catalog c
    on conflict do nothing returning id, workspace_id, specialty
  ), configuracao as (
    insert into private.agent_settings (agent_id, workspace_id, channels)
    select n.id, n.workspace_id, array['whatsapp']::text[] from novos n
  )
  insert into private.agent_permissions (agent_id, workspace_id, integration_id, permission)
  select n.id, n.workspace_id, d.integration_id, d.permission from novos n
  join private.specialty_default_permissions d on d.specialty = n.specialty;
end;
$$;


insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous, last_sign_in_at)
values ('10000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'avisos@althius.test', '',
  now(), now(), now(), '{}', '{}', false, false, now());
insert into public.workspaces (id, kind, name)
values ('20000000-0000-4000-8000-000000000001', 'empresa', 'Workspace de avisos');
select pg_temp.semear_agentes_padrao(w.id) from public.workspaces w;
insert into private.user_channel_notice_preferences(user_id, preferences)
values ('10000000-0000-4000-8000-000000000001',
  '{"resposta_lead":false,"aprovacao_pendente":true,"rotina_terminada":false,"sinal_novo":false,"sequencia_pausada":false,"creditos_baixos":false}');
insert into private.user_channel_phones(user_id, phone_e164, verified_at)
values ('10000000-0000-4000-8000-000000000001', '+5511999990001', now());
insert into private.whatsapp_last_inbound(phone_hash, received_at)
values (encode(extensions.digest('5511999990001','sha256'),'hex'), '2026-10-27 08:45:00-03');
insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous, last_sign_in_at)
values ('10000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'sem-aviso@althius.test', '',
  now(), now(), now(), '{}', '{}', false, false, now());

select has_table('private', 'channel_notices', 'fila privada de avisos');
select has_function('public', 'enqueue_whatsapp_channel_notice', array['uuid', 'uuid', 'text', 'text', 'text'], 'função de enfileiramento');
select has_function('public', 'claim_whatsapp_channel_notices', array['uuid', 'timestamp with time zone'], 'claim agrupa avisos elegíveis');

select is(
  public.enqueue_whatsapp_channel_notice(
    '10000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    'aprovacao_pendente', 'Uma Aprovação espera sua decisão.', 'approval-1'),
  true,
  'um aviso com opt-in pode ser enfileirado'
);
select is(public.enqueue_whatsapp_channel_notice(
  '10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',
  'aprovacao_pendente','Uma segunda Aprovação também espera.', 'approval-2'), true,
  'o segundo aviso pode ser agrupado');
select is(public.enqueue_whatsapp_channel_notice(
  '10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001',
  'aprovacao_pendente','Aviso sem preferência.', 'approval-3'), false,
  'sem preferência o evento não entra na fila');

select is(
  (select count(*)::integer from private.channel_notices
   where user_id = '10000000-0000-4000-8000-000000000001'),
  2,
  'o aviso fica persistido sem criar lançamento de Crédito'
);

select is((select count(*)::integer from public.claim_whatsapp_channel_notices(
  '10000000-0000-4000-8000-000000000001','2026-10-27 08:59:00-03')),
  0,'antes das 09h o aviso fica aguardando');
select set_config('test.aviso_claim', (select row_to_json(c)::text from public.claim_whatsapp_channel_notices(
  '10000000-0000-4000-8000-000000000001','2026-10-27 09:00:00-03') c), true);
select is((current_setting('test.aviso_claim')::jsonb->>'summary'),
  E'Uma Aprovação espera sua decisão.\nUma segunda Aprovação também espera.',
  'às 09h os avisos pendentes saem agrupados e em ordem');
select is((current_setting('test.aviso_claim')::jsonb->>'dentro_da_janela')::boolean,
  true,'a mensagem de entrada recente permite texto de serviço');
select is(public.confirm_whatsapp_channel_notices(
  '10000000-0000-4000-8000-000000000001','2026-10-27 09:00:00-03'),2,
  'a confirmação registra um envio agrupado');
select is(public.enqueue_whatsapp_channel_notice(
  '10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',
  'aprovacao_pendente','Terceiro aviso.', 'approval-4'),true,'um aviso novo pode entrar após a entrega');
select is((select count(*)::integer from public.claim_whatsapp_channel_notices(
  '10000000-0000-4000-8000-000000000001','2026-10-27 09:29:00-03')),
  0,'o intervalo impede novo envio antes de 30 minutos');
select is((select count(*)::integer from public.claim_whatsapp_channel_notices(
  '10000000-0000-4000-8000-000000000001','2026-10-27 09:30:00-03')),
  1,'após 30 minutos a fila volta a ser reivindicável');
select is(public.confirm_whatsapp_channel_notices(
  '10000000-0000-4000-8000-000000000001','2026-10-27 09:30:00-03'),1,
  'a segunda entrega é registrada');

do $$
declare i integer; v_quando timestamptz;
begin
  for i in 3..10 loop
    perform public.enqueue_whatsapp_channel_notice('10000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000001','aprovacao_pendente','Aviso '||i::text,'cap-'||i::text);
    v_quando := '2026-10-27 09:00:00-03'::timestamptz + ((i-1)*interval '30 minutes');
    perform public.claim_whatsapp_channel_notices('10000000-0000-4000-8000-000000000001',v_quando);
    perform public.confirm_whatsapp_channel_notices('10000000-0000-4000-8000-000000000001',v_quando);
  end loop;
  perform public.enqueue_whatsapp_channel_notice('10000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001','aprovacao_pendente','Aviso 11','cap-11');
end $$;
select is((select count(*)::integer from private.channel_notice_deliveries where user_id='10000000-0000-4000-8000-000000000001' and (delivered_at at time zone 'America/Sao_Paulo')::date='2026-10-27'),10,
  'as dez entregas do dia ficam registradas antes de reter a décima primeira');
select is((select count(*)::integer from public.claim_whatsapp_channel_notices(
  '10000000-0000-4000-8000-000000000001','2026-10-27 14:00:00-03')),
  0,'o décimo primeiro envio diário fica retido');
select is(
  (select count(*)::integer from private.credit_entries
   where workspace_id = '20000000-0000-4000-8000-000000000001'),
  0,
  'avisos não consomem Créditos'
);

update private.user_channel_notice_preferences set stopped = true
where user_id = '10000000-0000-4000-8000-000000000001';
select is(public.enqueue_whatsapp_channel_notice(
  '10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',
  'aprovacao_pendente','Outra Aprovação espera sua decisão.', 'approval-12'), false,
  'PARAR desliga os avisos na origem');

-- Integrações com os eventos reais: cada transição de origem deve criar exatamente
-- um aviso, e repetir o mesmo identificador de origem não duplica a fila.
update private.user_channel_notice_preferences set stopped=false,
  preferences='{"resposta_lead":true,"aprovacao_pendente":true,"rotina_terminada":true,"sinal_novo":true,"sequencia_pausada":true,"creditos_baixos":true}'::jsonb
where user_id='10000000-0000-4000-8000-000000000001';
insert into public.workspace_memberships(workspace_id,user_id,role,active)
values ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','admin',true);
insert into public.target_accounts(id,workspace_id,name,canonical_url,domain,created_by)
values ('30000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','Conta de avisos','https://avisos.test','avisos.test','10000000-0000-4000-8000-000000000001');
insert into public.sales_responsibilities(workspace_id,target_account_id,owner_user_id)
values ('20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001');
insert into public.sequences(id,workspace_id,target_account_id,owner_user_id)
values ('40000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001');
insert into public.account_interactions(id,workspace_id,target_account_id,kind,recorded_by)
values ('50000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','email-recebido','10000000-0000-4000-8000-000000000001');
insert into private.reply_proposals(id,workspace_id,sequence_id,target_account_id,owner_user_id,channel,origin_interaction_id,recipient,status)
values ('60000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','email','50000000-0000-4000-8000-000000000001','contato@avisos.test','pronta');
select is((select count(*)::integer from private.channel_notices where notice_type='resposta_lead'),1,
  'uma Proposta de resposta pronta enfileira aviso');
select is(public.enqueue_whatsapp_channel_notice('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','resposta_lead','Reprocessada.' ,'60000000-0000-4000-8000-000000000001'),false,
  'a mesma origem não duplica o aviso');

insert into private.approvals(id,workspace_id,agent_id,integration_id,action,payload_hash)
select '61000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',id,'hubspot','Criar registro','hash'
from private.agents where workspace_id='20000000-0000-4000-8000-000000000001' and kind='padrao' limit 1;
select is((select count(*)::integer from private.channel_notices where event_key='aprovacao_pendente:10000000-0000-4000-8000-000000000001:61000000-0000-4000-8000-000000000001'),1,
  'uma Aprovação pendente enfileira aviso para a Administradora');

insert into private.agent_routines(workspace_id,agent_id,task,frequency,run_time)
select '20000000-0000-4000-8000-000000000001',id,'Revisar respostas','diaria','09:00'
from private.agents where workspace_id='20000000-0000-4000-8000-000000000001' and kind='padrao' limit 1;
insert into private.agent_conversations(id,workspace_id,owner_id,kind)
values ('70000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','coordenada');
insert into private.agent_runs(id,workspace_id,conversation_id,requested_by,client_request_id,request_text,trigger_kind,routine_id,status,finished_at)
select '80000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','90000000-0000-4000-8000-000000000001','Rotina concluída','rotina',id,'succeeded',now()
from private.agent_routines where workspace_id='20000000-0000-4000-8000-000000000001' limit 1;
select is((select count(*)::integer from private.channel_notices where notice_type='rotina_terminada'),1,
  'uma Execução de Rotina concluída enfileira aviso');

insert into private.signals(workspace_id,target_account_id,signal_type,event_key,phrase,fired_at)
values ('20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','vaga_linkedin','aviso-1','Vaga nova',now());
select is((select count(*)::integer from private.channel_notices where notice_type='sinal_novo'),1,
  'um Sinal em Conta atribuída enfileira aviso');
insert into private.sequence_reply_holds(sequence_id,workspace_id,target_account_id,open,state)
values ('40000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001',true,'preventive');
select is((select count(*)::integer from private.channel_notices where notice_type='sequencia_pausada'),1,
  'uma retenção aberta enfileira aviso');

insert into private.credit_entries(workspace_id,amount,kind,note) values
 ('20000000-0000-4000-8000-000000000001',1,'ajuste','Saldo antes do consumo');
insert into private.credit_entries(workspace_id,amount,kind,note) values
 ('20000000-0000-4000-8000-000000000001',-1,'ajuste','Saldo esgotado');
select is((select count(*)::integer from private.channel_notices where notice_type='creditos_baixos'),1,
  'a transição do saldo a zero enfileira aviso');

select is((select count(*)::integer from public.claim_whatsapp_channel_notices('10000000-0000-4000-8000-000000000001','2026-10-28 09:00:00-03')),1,
  'a fila é reivindicável antes de testar a liberação');
select is(public.release_whatsapp_channel_notices('10000000-0000-4000-8000-000000000001','2026-10-28 09:01:00-03'),7,
  'falha de entrega libera os avisos agrupados usando horário injetável');
select is((select count(*)::integer from public.claim_whatsapp_channel_notices('10000000-0000-4000-8000-000000000001','2026-10-28 09:02:00-03')),1,
  'avisos liberados podem ser reivindicados novamente');

select * from finish();
rollback;
