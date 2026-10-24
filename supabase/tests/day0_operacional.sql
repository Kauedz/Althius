begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(32);
insert into auth.users (id, email) values ('e0300000-0000-0000-0000-000000000001', 'day0@example.test');
insert into public.workspaces (id, kind, name) values ('e0300000-0000-0000-0000-000000000010', 'empresa', 'Contrato');
insert into public.workspace_memberships (workspace_id, user_id, role) values
 ('e0300000-0000-0000-0000-000000000010', 'e0300000-0000-0000-0000-000000000001', 'admin');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'e0300000-0000-0000-0000-000000000001', true);
select is(public.get_my_day0('e0300000-0000-0000-0000-000000000010')->>'concluido', 'false', 'primeira entrada exige Day0');
select is(public.save_my_day0('e0300000-0000-0000-0000-000000000010', 'papel', 'RevOps')->>'etapa', 'empresa', 'papel salvo avança à empresa');
select is(public.get_my_day0('e0300000-0000-0000-0000-000000000010')->>'papel', 'RevOps', 'nova leitura retoma papel do backend');
select is(public.save_my_day0('e0300000-0000-0000-0000-000000000010', 'empresa', 'Cliente Real')->>'etapa', 'dominio', 'empresa avança ao site');
select is(public.save_my_day0('e0300000-0000-0000-0000-000000000010', 'dominio', 'cliente.test')->>'etapa', 'hdyhau', 'domínio confirmado avança');
select is(public.save_my_day0('e0300000-0000-0000-0000-000000000010', 'hdyhau', 'LinkedIn')->>'etapa', 'convite', 'respostas pessoais completas permitem concluir');
select is(public.save_my_day0('e0300000-0000-0000-0000-000000000010', 'concluir')->>'concluido', 'true', 'concluir guarda Day0');
select is(public.get_my_day0('e0300000-0000-0000-0000-000000000010')->>'concluido', 'true', 'outra leitura não força novamente');
select is(public.save_my_day0('e0300000-0000-0000-0000-000000000010', 'concluir')->>'concluido', 'true', 'conclusão idempotente');
select is((select name from public.workspaces where id = 'e0300000-0000-0000-0000-000000000010'), 'Contrato', 'empresa não renomeia Workspace');
select throws_ok($$select public.save_my_day0('e0300000-0000-0000-0000-000000000010', 'dominio', 'https://errado')$$, '22023', 'invalid Day0 domain', 'domínio inválido recusado');
reset role;
insert into auth.users (id, email) values
 ('e0300000-0000-0000-0000-000000000002', 'membro@example.test'),
 ('e0300000-0000-0000-0000-000000000003', 'convidado@example.test');
insert into public.workspaces (id, kind, name) values ('e0300000-0000-0000-0000-000000000020', 'empresa', 'Segundo contrato');
insert into public.workspace_memberships (workspace_id, user_id, role) values
 ('e0300000-0000-0000-0000-000000000020', 'e0300000-0000-0000-0000-000000000001', 'admin'),
 ('e0300000-0000-0000-0000-000000000010', 'e0300000-0000-0000-0000-000000000002', 'member'),
 ('e0300000-0000-0000-0000-000000000010', 'e0300000-0000-0000-0000-000000000003', 'admin');
insert into private.workspace_invitations (workspace_id, email, role, token, status, accepted_by, accepted_at) values
 ('e0300000-0000-0000-0000-000000000010', 'convidado@example.test', 'admin', repeat('x', 64), 'aceito', 'e0300000-0000-0000-0000-000000000003', now());
set local role authenticated;
select is(public.get_my_day0('e0300000-0000-0000-0000-000000000020')->>'etapa', 'empresa', 'outro Workspace não pergunta papel nem HDYHAU de novo');
select is(public.get_my_day0('e0300000-0000-0000-0000-000000000020')->>'empresa', '', 'empresa pertence ao Workspace');
select is(public.get_my_day0('e0300000-0000-0000-0000-000000000020')->>'concluido', 'false', 'conclusão pertence à Participação');
select set_config('request.jwt.claim.sub', 'e0300000-0000-0000-0000-000000000002', true);
select is((select count(*)::int from public.day0_accounts), 0, 'outro participante não lê respostas pessoais alheias');
select is((select count(*)::int from public.day0_completions), 0, 'outro participante não lê conclusão alheia');
select is(public.get_my_day0('e0300000-0000-0000-0000-000000000010')->>'ramo', 'convidado', 'membro entra como convidado');
select is(public.save_my_day0('e0300000-0000-0000-0000-000000000010', 'papel', 'AE')->>'etapa', 'hdyhau', 'convidado pula empresa e domínio');
select throws_ok($$select public.save_my_day0('e0300000-0000-0000-0000-000000000010', 'empresa', 'Ataque')$$, '42501', 'company Day0 requires original administrator', 'membro não altera empresa');
select is(public.save_my_day0('e0300000-0000-0000-0000-000000000010', 'concluir')->>'concluido', 'true', 'pular também conclui permanentemente');
select throws_ok($$select public.get_my_day0('e0300000-0000-0000-0000-000000000020')$$, '42501', 'active workspace membership required', 'sem Participação não lê outro Workspace');
select set_config('request.jwt.claim.sub', 'e0300000-0000-0000-0000-000000000003', true);
select is(public.get_my_day0('e0300000-0000-0000-0000-000000000010')->>'ramo', 'convidado', 'Administrador por convite também pula empresa');
select throws_ok($$select public.save_my_day0('e0300000-0000-0000-0000-000000000010', 'empresa', 'Ataque')$$, '42501', 'company Day0 requires original administrator', 'Administrador convidado não altera empresa');
reset role;
update public.workspace_memberships set active = false where user_id = 'e0300000-0000-0000-0000-000000000002';
set local role authenticated;
select set_config('request.jwt.claim.sub', 'e0300000-0000-0000-0000-000000000002', true);
select throws_ok($$select public.get_my_day0('e0300000-0000-0000-0000-000000000010')$$, '42501', 'active workspace membership required', 'participação removida perde leitura');
select is((select count(*)::int from public.day0_completions), 0, 'RLS oculta conclusão após remoção');
reset role;
select is((select count(*)::int from public.workspaces where id::text like 'e0300000%'), 2, 'Day0 não criou Workspace');
insert into public.workspace_memberships (workspace_id, user_id, role) values
 ('e0300000-0000-0000-0000-000000000020', 'e0300000-0000-0000-0000-000000000002', 'member');
set local role authenticated;
select is(public.get_my_day0('e0300000-0000-0000-0000-000000000020')->>'etapa', 'convite', 'pular respostas pessoais também vale em outro Workspace');
select throws_ok($$insert into public.day0_accounts (user_id) values ('e0300000-0000-0000-0000-000000000003')$$, '42501', 'permission denied for table day0_accounts', 'cliente não escreve identidade diretamente');
select throws_ok($$update public.day0_companies set empresa = 'Ataque'$$, '42501', 'permission denied for table day0_companies', 'cliente não contorna autorização pela tabela');
select throws_ok($$delete from public.day0_completions$$, '42501', 'permission denied for table day0_completions', 'cliente não apaga conclusão');
set local role anon;
select throws_ok($$select public.get_my_day0('e0300000-0000-0000-0000-000000000010')$$, '42501', 'permission denied for function get_my_day0', 'anônimo não lê Day0');
select throws_ok($$select public.save_my_day0('e0300000-0000-0000-0000-000000000010', 'concluir')$$, '42501', 'permission denied for function save_my_day0', 'anônimo não salva Day0');
select * from finish();
rollback;
