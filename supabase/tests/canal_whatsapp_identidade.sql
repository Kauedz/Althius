begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(4);

select ok(to_regclass('private.channel_tool_activity') is not null, 'a auditoria de ferramenta do Canal existe');
select ok(to_regprocedure('public.record_whatsapp_tool_activity(uuid,uuid,text,text,text)') is not null, 'a RPC de auditoria existe');

select has_column('private', 'channel_tool_activity', 'payload_hash', 'a auditoria guarda o hash do payload');
select hasnt_column('private', 'channel_tool_activity', 'message_text', 'a auditoria não guarda o texto da mensagem');

select * from finish();
rollback;
