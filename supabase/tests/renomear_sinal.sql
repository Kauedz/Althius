begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(9);
insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous)
values ('f8600000-0000-4000-8000-000000000001','authenticated','authenticated','renomear-admin@example.com','',now(),now(),now(),'{}','{}',false,false),
       ('f8600000-0000-4000-8000-000000000002','authenticated','authenticated','renomear-membro@example.com','',now(),now(),now(),'{}','{}',false,false),
       ('f8600000-0000-4000-8000-000000000003','authenticated','authenticated','renomear-outro@example.com','',now(),now(),now(),'{}','{}',false,false);
insert into public.workspaces (id, kind, name) values ('f8610000-0000-4000-8000-000000000001','empresa','Renomear'), ('f8610000-0000-0000-0000-000000000002','empresa','Outro');
insert into public.workspace_memberships (workspace_id,user_id,role,active) values
 ('f8610000-0000-4000-8000-000000000001','f8600000-0000-4000-8000-000000000001','admin',true),
 ('f8610000-0000-4000-8000-000000000001','f8600000-0000-4000-8000-000000000002','member',true),
 ('f8610000-0000-0000-0000-000000000002','f8600000-0000-4000-8000-000000000003','admin',true);
insert into private.signal_monitors (id, workspace_id, signal_type, name, state, audience, criteria, every_hours, created_by, plan, plan_version)
values ('f8620000-0000-4000-8000-000000000001','f8610000-0000-4000-8000-000000000001','vaga_linkedin','Nome original','rascunho','{"accountIds":[]}','{"palavras":["dados"]}',24,'f8600000-0000-4000-8000-000000000001','{"versao":2}',2);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','f8600000-0000-4000-8000-000000000001',true);
\set monitor_id 'f8620000-0000-4000-8000-000000000001'

select is(public.rename_signal_monitor('11111111-1111-1111-1111-111111111111', :'monitor_id', '  Nome novo  '), :'monitor_id', 'retorna o id e renomeia');
select is((select name from private.signal_monitors where id = :'monitor_id'), 'Nome novo', 'aplica trim no nome');
select is((select plan_version from private.signal_monitors where id = :'monitor_id'), null::integer, 'preserva versão');
select is((select every_hours from private.signal_monitors where id = :'monitor_id'), 24, 'preserva frequência');
select is((select count(*)::int from private.signal_monitors where workspace_id = 'f8610000-0000-4000-8000-000000000001'), 1, 'não cria outro Monitoramento');

select throws_ok($q$select public.rename_signal_monitor('11111111-1111-1111-1111-111111111111', :'monitor_id', '')$q$, '22023', 'invalid monitor');
select throws_ok($q$select public.rename_signal_monitor('11111111-1111-1111-1111-111111111111', :'monitor_id', repeat('x', 121))$q$, '22023', 'invalid monitor');
select set_config('request.jwt.claim.sub','f8600000-0000-4000-8000-000000000002',true);
select throws_ok($q$select public.rename_signal_monitor('f8610000-0000-4000-8000-000000000001', :'monitor_id', 'De outro')$q$, '42501');
select set_config('request.jwt.claim.sub','f8600000-0000-4000-8000-000000000003',true);
select throws_ok($q$select public.rename_signal_monitor('f8610000-0000-4000-8000-000000000001', :'monitor_id', 'Fora')$q$, '42501', 'membro de outro Workspace é recusado');

select * from finish();
rollback;
