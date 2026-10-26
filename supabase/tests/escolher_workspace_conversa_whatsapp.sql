begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(6);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous, last_sign_in_at)
values ('68000000-0000-0000-0000-000000000008', 'authenticated', 'authenticated', 'canais08@althius.test', '',
  now(), now(), now(), '{}', '{}', false, false, now());
insert into public.workspaces (id, kind, name) values
  ('a8000000-0000-0000-0000-000000000008', 'empresa', 'Acme'),
  ('a8000000-0000-0000-0000-000000000009', 'empresa', 'Beta');
insert into private.workspace_contracts (workspace_id, tier_id, starts_at)
select id, 'escala', date_trunc('month', now()) from public.workspaces
where id in ('a8000000-0000-0000-0000-000000000008', 'a8000000-0000-0000-0000-000000000009');
select public.grant_credits('a8000000-0000-0000-0000-000000000008', 100, 'plano', 'teste canais 08');
insert into public.workspace_memberships (workspace_id, user_id, role, active) values
  ('a8000000-0000-0000-0000-000000000008', '68000000-0000-0000-0000-000000000008', 'member', true),
  ('a8000000-0000-0000-0000-000000000009', '68000000-0000-0000-0000-000000000008', 'member', true);
insert into private.whatsapp_channel_settings (workspace_id, enabled) values
  ('a8000000-0000-0000-0000-000000000008', true),
  ('a8000000-0000-0000-0000-000000000009', true);
insert into private.user_channel_phones (user_id, phone_e164, verified_at)
values ('68000000-0000-0000-0000-000000000008', '+5511999990008', now());

select is((select string_agg(workspace_name, ', ' order by workspace_name)
  from public.whatsapp_channel_eligible_workspaces('68000000-0000-0000-0000-000000000008')),
  'Acme, Beta', 'a lista contém os Workspaces elegíveis em ordem estável');
select * from public.set_whatsapp_channel_session('68000000-0000-0000-0000-000000000008',
  'a8000000-0000-0000-0000-000000000009', false, false);
select is((select workspace_id from public.get_whatsapp_channel_session('68000000-0000-0000-0000-000000000008')),
  'a8000000-0000-0000-0000-000000000009'::uuid, 'a escolha do Workspace fica lembrada para a próxima mensagem');
select is((select count(*)::int from private.credit_entries), 1,
  'a escolha e a persistência do Workspace não lançam Créditos');

select set_config('test.run', (select run_id::text from public.start_channel_run(
  'a8000000-0000-0000-0000-000000000008', '68000000-0000-0000-0000-000000000008', 'Olá', 'wamid.08a')), true);
select set_config('test.conversation', (select conversation_id::text from private.agent_runs where id = current_setting('test.run')::uuid), true);
select public.claim_whatsapp_channel_event('wamid.08a', '5511999990008');
insert into private.agent_run_events(run_id, seq, kind, payload)
values (current_setting('test.run')::uuid, 1, 'resposta', '{"texto":"Olá"}');
update private.agent_runs set status = 'succeeded', finished_at = now() where id = current_setting('test.run')::uuid;
select is((select answer from public.claim_whatsapp_channel_delivery(current_setting('test.run')::uuid)),
  E'Em *Acme*:\nOlá', 'a resposta começa com o nome do Workspace');
insert into private.whatsapp_pending_answers(user_id, run_id, answer)
values ('68000000-0000-0000-0000-000000000008', current_setting('test.run')::uuid, 'Resposta pendente');
select is(public.claim_whatsapp_pending_answer_with_workspace('68000000-0000-0000-0000-000000000008'),
  E'Em *Acme*:\nResposta pendente', 'uma resposta pendente mantém o prefixo do Workspace original');
update private.agent_conversations set updated_at = now() - interval '4 hours 1 second'
where id = current_setting('test.conversation')::uuid;
select set_config('test.conversation_nova', (select conversation_id::text from public.start_channel_run(
  'a8000000-0000-0000-0000-000000000008', '68000000-0000-0000-0000-000000000008', 'Nova mensagem', 'wamid.08b')), true);
select isnt(current_setting('test.conversation_nova'), current_setting('test.conversation'),
  'mais de quatro horas de silêncio abre outra Conversa');

select * from finish();
rollback;
