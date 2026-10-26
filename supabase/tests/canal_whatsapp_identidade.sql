begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(21);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
                        created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
                        is_sso_user, is_anonymous)
values ('5d000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated',
        'ferramenta@teste.local', '', now(), now(), now(), '{}', '{}', false, false);
insert into public.workspaces (id, kind, name)
values ('fd000000-0000-0000-0000-000000000001', 'empresa', 'Workspace teste');

select ok(to_regclass('private.channel_tool_activity') is not null, 'a auditoria de ferramenta do Canal existe');
select ok(to_regprocedure('public.record_whatsapp_tool_activity(uuid,uuid,text,text,text)') is not null, 'a RPC de auditoria existe');
select has_column('private', 'channel_tool_activity', 'payload_hash', 'a auditoria guarda o hash do payload');
select hasnt_column('private', 'channel_tool_activity', 'message_text', 'a auditoria não guarda o texto da mensagem');

set local role service_role;
select public.record_whatsapp_tool_activity(
  '5d000000-0000-0000-0000-000000000001',
  'fd000000-0000-0000-0000-000000000001',
  'send_whatsapp_message', repeat('a', 64), 'succeeded'
) as activity_id \gset
select is((select user_id from private.channel_tool_activity where id = :'activity_id'::uuid),
          '5d000000-0000-0000-0000-000000000001'::uuid, 'a atividade registra a Conta');
select is((select workspace_id from private.channel_tool_activity where id = :'activity_id'::uuid),
          'fd000000-0000-0000-0000-000000000001'::uuid, 'a atividade registra o Workspace');
select is((select channel from private.channel_tool_activity where id = :'activity_id'::uuid),
          'whatsapp', 'a atividade registra WhatsApp');
select is((select tool from private.channel_tool_activity where id = :'activity_id'::uuid),
          'send_whatsapp_message', 'a atividade registra a ferramenta');
select is((select payload_hash from private.channel_tool_activity where id = :'activity_id'::uuid),
          repeat('a', 64), 'a atividade registra o hash');
select is((select outcome from private.channel_tool_activity where id = :'activity_id'::uuid),
          'succeeded', 'a atividade registra o resultado');
select is((select count(*)::integer from private.channel_tool_activity), 1, 'nenhum texto da mensagem é gravado');
select throws_ok($$select public.record_whatsapp_tool_activity('5d000000-0000-0000-0000-000000000001', 'fd000000-0000-0000-0000-000000000001', 'tool', 'xyz', 'ok')$$,
                 '22023', 'invalid channel activity', 'hash malformado é recusado');
select throws_ok($$select public.record_whatsapp_tool_activity('5d000000-0000-0000-0000-000000000001', 'fd000000-0000-0000-0000-000000000001', 'tool', null, 'ok')$$,
                 '22023', 'invalid channel activity', 'hash nulo é recusado');
select throws_ok($$select public.record_whatsapp_tool_activity('5d000000-0000-0000-0000-000000000001', 'fd000000-0000-0000-0000-000000000001', '  ', repeat('a', 64), 'ok')$$,
                 '22023', 'invalid channel activity', 'ferramenta vazia é recusada');
select throws_ok($$select public.record_whatsapp_tool_activity('5d000000-0000-0000-0000-000000000001', 'fd000000-0000-0000-0000-000000000001', 'tool', repeat('a', 64), '  ')$$,
                 '22023', 'invalid channel activity', 'resultado vazio é recusado');
reset role;

set local role anon;
select throws_ok($$select public.record_whatsapp_tool_activity('5d000000-0000-0000-0000-000000000001', 'fd000000-0000-0000-0000-000000000001', 'tool', repeat('a', 64), 'ok')$$,
                 '42501', null, 'anon não pode executar a RPC');
select throws_ok($$select * from private.channel_tool_activity$$, '42501', null, 'anon não pode consultar a tabela privada');
select throws_ok($$insert into private.channel_tool_activity(user_id, workspace_id, channel, tool, payload_hash, outcome) values ('5d000000-0000-0000-0000-000000000001', 'fd000000-0000-0000-0000-000000000001', 'whatsapp', 'tool', repeat('a', 64), 'ok')$$,
                 '42501', null, 'anon não pode inserir na tabela privada');
reset role;

set local role authenticated;
select throws_ok($$select public.record_whatsapp_tool_activity('5d000000-0000-0000-0000-000000000001', 'fd000000-0000-0000-0000-000000000001', 'tool', repeat('a', 64), 'ok')$$,
                 '42501', null, 'authenticated não pode executar a RPC');
select throws_ok($$select * from private.channel_tool_activity$$, '42501', null, 'authenticated não pode consultar a tabela privada');
select throws_ok($$insert into private.channel_tool_activity(user_id, workspace_id, channel, tool, payload_hash, outcome) values ('5d000000-0000-0000-0000-000000000001', 'fd000000-0000-0000-0000-000000000001', 'whatsapp', 'tool', repeat('a', 64), 'ok')$$,
                 '42501', null, 'authenticated não pode inserir na tabela privada');
reset role;

select * from finish();
rollback;
