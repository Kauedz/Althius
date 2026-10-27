begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(18);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous, last_sign_in_at)
values ('10000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'avisos@althius.test', '',
  now(), now(), now(), '{}', '{}', false, false, now());
insert into public.workspaces (id, kind, name)
values ('20000000-0000-4000-8000-000000000001', 'empresa', 'Workspace de avisos');
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
select has_function('public', 'enqueue_whatsapp_channel_notice', array['uuid', 'uuid', 'text', 'text'], 'função de enfileiramento');
select has_function('public', 'claim_whatsapp_channel_notices', array['uuid', 'timestamp with time zone'], 'claim agrupa avisos elegíveis');

select is(
  public.enqueue_whatsapp_channel_notice(
    '10000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    'aprovacao_pendente', 'Uma Aprovação espera sua decisão.'),
  true,
  'um aviso com opt-in pode ser enfileirado'
);
select is(public.enqueue_whatsapp_channel_notice(
  '10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',
  'aprovacao_pendente','Uma segunda Aprovação também espera.'), true,
  'o segundo aviso pode ser agrupado');
select is(public.enqueue_whatsapp_channel_notice(
  '10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001',
  'aprovacao_pendente','Aviso sem preferência.'), false,
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
  'aprovacao_pendente','Terceiro aviso.'),true,'um aviso novo pode entrar após a entrega');
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
      '20000000-0000-4000-8000-000000000001','aprovacao_pendente','Aviso '||i::text);
    v_quando := '2026-10-27 09:00:00-03'::timestamptz + ((i-1)*interval '30 minutes');
    perform public.claim_whatsapp_channel_notices('10000000-0000-4000-8000-000000000001',v_quando);
    perform public.confirm_whatsapp_channel_notices('10000000-0000-4000-8000-000000000001',v_quando);
  end loop;
  perform public.enqueue_whatsapp_channel_notice('10000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001','aprovacao_pendente','Aviso 11');
end $$;
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
  'aprovacao_pendente','Outra Aprovação espera sua decisão.'), false,
  'PARAR desliga os avisos na origem');

select * from finish();
rollback;
