begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(26);

select has_function('public', 'get_my_channel_phone', array[]::text[], 'consulta somente o telefone da Conta autenticada');
select has_function('public', 'start_my_channel_phone_verification', array['uuid', 'text']::text[], 'inicia verificação do telefone');
select has_function('public', 'confirm_my_channel_phone', array['uuid', 'text']::text[], 'confirma o código de seis dígitos');
select has_function('public', 'resend_my_channel_phone_verification', array['uuid']::text[], 'reenvia respeitando limites');
select has_function('public', 'change_my_channel_phone', array['uuid', 'text']::text[], 'troca pelo fluxo de verificação');
select has_function('public', 'remove_my_channel_phone', array['uuid']::text[], 'remove o telefone da própria Conta');
select has_function('public', 'get_my_channel_phone_verification_email', array['uuid']::text[], 'recupera aviso de verificação pendente');
select has_function('public', 'mark_my_channel_phone_email_sent', array['uuid']::text[], 'marca aviso de verificação enviado');
select has_table('private', 'user_channel_phones', 'guarda telefone e hash fora do acesso direto do cliente');
select ok((select relrowsecurity from pg_class where oid = 'private.user_channel_phones'::regclass), 'RLS habilitado');
select has_function('public', 'get_my_channel_notice_preferences', array[]::text[], 'consulta preferências da Conta autenticada');
select has_function('public', 'save_my_channel_notice_preferences', array['jsonb']::text[], 'salva preferências da Conta autenticada');
select has_table('private', 'user_channel_notice_preferences', 'guarda opt-ins por Conta');
select ok((select relrowsecurity from pg_class where oid = 'private.user_channel_notice_preferences'::regclass), 'RLS habilitado nas preferências');

insert into auth.users (id, email, last_sign_in_at)
values
  ('53000000-0000-0000-0000-000000000001', 'ana@exemplo.com', now()),
  ('53000000-0000-0000-0000-000000000002', 'bia@exemplo.com', now());
set local role service_role;
select public.start_my_channel_phone_verification('53000000-0000-0000-0000-000000000001', '+5511999990001') as codigo \gset
select ok(:'codigo' ~ '^[0-9]{6}$', 'gera código de seis dígitos');
set local role postgres;
select ok((select verification_hash <> :'codigo' and verification_salt is not null from private.user_channel_phones where user_id = '53000000-0000-0000-0000-000000000001'), 'guarda somente o hash com salt');
set local role service_role;
select public.confirm_my_channel_phone('53000000-0000-0000-0000-000000000001', 'inválido');
set local role postgres;
select is((select attempts from private.user_channel_phones where user_id = '53000000-0000-0000-0000-000000000001'), 1, 'registra tentativa de código inválido');
set local role service_role;
select lives_ok(format('select * from public.confirm_my_channel_phone(%L, %L)', '53000000-0000-0000-0000-000000000001', :'codigo'), 'confirma código correto');
set local role postgres;
select is((select phone_e164 from private.user_channel_phones where user_id = '53000000-0000-0000-0000-000000000001'), '+5511999990001', 'vincula o telefone confirmado');
select ok((select email_notification_pending from private.user_channel_phones where user_id = '53000000-0000-0000-0000-000000000001'), 'mantém aviso pendente enquanto e-mail não for entregue');
set local role service_role;
select public.mark_my_channel_phone_email_sent('53000000-0000-0000-0000-000000000001');
set local role postgres;
select ok(not (select email_notification_pending from private.user_channel_phones where user_id = '53000000-0000-0000-0000-000000000001'), 'limpa pendência depois do envio do e-mail');
set local role service_role;
select throws_ok($$select public.start_my_channel_phone_verification('53000000-0000-0000-0000-000000000002', '+5511999990001')$$, '23505', 'phone already used', 'impede telefone vinculado a outra Conta');
set local role postgres;
update auth.users set last_sign_in_at = now() - interval '31 days' where id = '53000000-0000-0000-0000-000000000002';
set local role service_role;
select throws_ok($$select public.start_my_channel_phone_verification('53000000-0000-0000-0000-000000000002', '+5511999990002')$$, '42501', 'recent login required', 'bloqueia código sem login nos últimos 30 dias');

set local role authenticated;
select set_config('request.jwt.claim.sub', '53000000-0000-0000-0000-000000000001', true);
select is(public.get_my_channel_notice_preferences()->>'resposta_lead', 'false', 'avisos começam desligados por padrão');
select public.save_my_channel_notice_preferences('{"aprovacao_pendente":true}'::jsonb);
select is((public.save_my_channel_notice_preferences('{"resposta_lead":true}'::jsonb)->>'resposta_lead') || ':' || (public.get_my_channel_notice_preferences()->>'aprovacao_pendente'), 'true:true', 'Conta atualiza um opt-in sem sobrescrever os demais');
select throws_ok($$select public.save_my_channel_notice_preferences('{"resposta_lead":"sim"}'::jsonb)$$, '22023', 'invalid channel notice preferences', 'recusa preferência malformada');

select * from finish();
rollback;
