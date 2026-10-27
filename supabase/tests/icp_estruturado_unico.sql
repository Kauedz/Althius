begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(22);

insert into auth.users (id, email, email_confirmed_at) values
 ('e0310000-0000-0000-0000-000000000001', 'icp-admin@example.test', now()),
 ('e0310000-0000-0000-0000-000000000002', 'icp-other@example.test', now());
insert into public.workspaces (id, kind, name) values
 ('e0310000-0000-0000-0000-000000000010', 'empresa', 'Workspace ICP'),
 ('e0310000-0000-0000-0000-000000000020', 'empresa', 'Workspace com Playbook'),
 ('e0310000-0000-0000-0000-000000000030', 'empresa', 'Workspace sem ICP');
insert into public.workspace_memberships (workspace_id, user_id, role) values
 ('e0310000-0000-0000-0000-000000000010', 'e0310000-0000-0000-0000-000000000001', 'admin'),
 ('e0310000-0000-0000-0000-000000000020', 'e0310000-0000-0000-0000-000000000001', 'admin'),
 ('e0310000-0000-0000-0000-000000000030', 'e0310000-0000-0000-0000-000000000001', 'admin'),
 ('e0310000-0000-0000-0000-000000000010', 'e0310000-0000-0000-0000-000000000002', 'member');
insert into private.playbook_section_versions (workspace_id, section, version, content, created_by) values
 ('e0310000-0000-0000-0000-000000000020', 'icp', 1,
  '{"texto":"ICP da seção existente","linhas":[{"papel":"Decisor","cargo":"CFO"}]}',
  'e0310000-0000-0000-0000-000000000001');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'e0310000-0000-0000-0000-000000000001', true);
select is(public.save_my_day0('e0310000-0000-0000-0000-000000000010', 'produto',
  '{"oQueVende":"Software financeiro","miniIcp":"Fintechs B2B","porQueCompram":"Reduzem conciliação"}')->>'miniIcp',
  'Fintechs B2B', 'salvar produto persiste o mini-ICP no Workspace do Day0');
select is(public.get_my_day0('e0310000-0000-0000-0000-000000000010')->>'oQueVende',
  'Software financeiro', 'a leitura do Day0 retoma o produto');
select is(public.get_my_day0('e0310000-0000-0000-0000-000000000010')->>'porQueCompram',
  'Reduzem conciliação', 'a leitura do Day0 retoma por que compram');
select is(public.get_my_workspace_icp('e0310000-0000-0000-0000-000000000010')->>'miniIcp',
  'Fintechs B2B', 'o ICP estruturado nasce dos campos do Day0');
select is(public.get_my_workspace_icp('e0310000-0000-0000-0000-000000000010')->>'version',
  '1', 'o primeiro salvamento cria uma versão');
select is(public.get_my_workspace_icp('e0310000-0000-0000-0000-000000000010')->>'version',
  '1', 'leituras repetidas preservam a versão vigente');
select is(public.save_my_day0('e0310000-0000-0000-0000-000000000010', 'produto',
  '{"oQueVende":"Texto editado","miniIcp":"ICP editado","porQueCompram":"Motivo editado"}')->>'miniIcp',
  'ICP editado', 'o Day0 continua editável depois da primeira gravação');
select is(public.get_my_workspace_icp('e0310000-0000-0000-0000-000000000010')->>'miniIcp',
  'Fintechs B2B', 'a edição do Day0 não sobrescreve um ICP estruturado já semeado');
select is(public.get_playbook_section('e0310000-0000-0000-0000-000000000020', 'icp')->'content'->>'texto',
  'ICP da seção existente', 'a seção ICP do Playbook continua preservada');
select is(public.save_my_day0('e0310000-0000-0000-0000-000000000020', 'produto',
  '{"oQueVende":"Serviço B2B","miniIcp":"Indústrias","porQueCompram":"Reduzem perdas"}')->>'miniIcp',
  'Indústrias', 'mini-ICP é salvo mesmo quando o Workspace já tem seção ICP');
select is(public.get_my_workspace_icp('e0310000-0000-0000-0000-000000000020')->>'freeText',
  'ICP da seção existente', 'a seção ICP preenche o texto livre da fonte única');
select is(public.get_my_workspace_icp('e0310000-0000-0000-0000-000000000020')->'playbookContent'->'linhas'->0->>'papel',
  'Decisor', 'a representação completa da seção ICP continua acessível na fonte única');
select is(public.get_my_workspace_icp('e0310000-0000-0000-0000-000000000030')->>'version',
  null, 'sem Day0 nem Playbook não cria versão vazia');
select is(public.get_my_workspace_icp('e0310000-0000-0000-0000-000000000030')->>'miniIcp',
  '', 'Workspace sem fonte lê um ICP vazio');
select throws_ok($$select public.save_my_day0('e0310000-0000-0000-0000-000000000010', 'produto',
  jsonb_build_object('miniIcp', repeat('x', 2001), 'oQueVende', '', 'porQueCompram', '')::text)$$,
  '22023', 'Day0 product field too long', 'campo acima de 2.000 caracteres é recusado');
select set_config('request.jwt.claim.sub', 'e0310000-0000-0000-0000-000000000002', true);
select throws_ok($$select public.save_my_day0('e0310000-0000-0000-0000-000000000010', 'produto',
  '{"oQueVende":"Ataque","miniIcp":"Ataque","porQueCompram":"Ataque"}')$$,
  '42501', 'company Day0 requires original administrator', 'Membro não grava o mini-ICP');
select throws_ok($$select public.get_my_workspace_icp('e0310000-0000-0000-0000-000000000020')$$,
  '42501', 'active workspace membership required', 'Membro não lê o ICP de outro Workspace');
reset role;
insert into auth.users (id, email, email_confirmed_at) values
 ('e0310000-0000-0000-0000-000000000003', 'icp-empty@example.test', now());
insert into public.workspaces (id, kind, name, owner_user_id) values
 ('e0310000-0000-0000-0000-000000000040', 'pessoal', 'Pessoal admin', 'e0310000-0000-0000-0000-000000000001'),
 ('e0310000-0000-0000-0000-000000000041', 'pessoal', 'Pessoal membro', 'e0310000-0000-0000-0000-000000000002'),
 ('e0310000-0000-0000-0000-000000000042', 'pessoal', 'Pessoal sem fonte', 'e0310000-0000-0000-0000-000000000003');
insert into public.day0_companies (workspace_id, o_que_vende, mini_icp, por_que_compram) values
 ('e0310000-0000-0000-0000-000000000040', 'Serviço de dados', 'Indústrias médias', 'Diminuem perdas');
insert into private.playbook_section_versions (workspace_id, section, version, content, created_by) values
 ('e0310000-0000-0000-0000-000000000041', 'icp', 1, '{"texto":"ICP do Workspace pessoal"}', 'e0310000-0000-0000-0000-000000000002');
set local role service_role;
select set_config('request.jwt.claim.sub', 'e0310000-0000-0000-0000-000000000001', true);
create temporary table icp_criado_do_day0 on commit drop as
  select w.* from public.create_company_workspace('Empresa do Day0', 'e0310000-0000-0000-0000-000000000101') w;
select set_config('request.jwt.claim.sub', 'e0310000-0000-0000-0000-000000000002', true);
create temporary table icp_criado_do_playbook on commit drop as
  select w.* from public.create_company_workspace('Empresa do Playbook', 'e0310000-0000-0000-0000-000000000102') w;
select set_config('request.jwt.claim.sub', 'e0310000-0000-0000-0000-000000000003', true);
create temporary table icp_criado_vazio on commit drop as
  select w.* from public.create_company_workspace('Empresa sem ICP', 'e0310000-0000-0000-0000-000000000103') w;
reset role;
select is((select mini_icp from public.day0_companies where workspace_id = (select id from icp_criado_do_day0)),
  'Indústrias médias', 'criação de Workspace copia o mini-ICP do Workspace pessoal identificado');
select is((select o_que_vende from private.workspace_icp_versions where workspace_id = (select id from icp_criado_do_day0)),
  'Serviço de dados', 'cópia do Day0 semeia o ICP estruturado');
select is((select free_text from private.workspace_icp_versions where workspace_id = (select id from icp_criado_do_playbook)),
  'ICP do Workspace pessoal', 'sem Mini-ICP, a criação usa o texto do Playbook pessoal');
select is((select count(*)::int from private.workspace_icp_versions where workspace_id = (select id from icp_criado_vazio)),
  0, 'sem Mini-ICP nem Playbook, o Workspace nasce sem versão ou aprovação pendente');
select is((select count(*)::int from private.workspace_icp_versions
  where workspace_id = 'e0310000-0000-0000-0000-000000000010'), 1,
  'um Workspace mantém uma única versão vigente sem edição');
select * from finish();
rollback;
