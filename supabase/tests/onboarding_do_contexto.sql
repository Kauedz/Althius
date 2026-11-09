begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(16);
-- contexto-da-empresa 03: o site do onboarding pode ficar para depois; informar o site depois retoma de onde parou.
insert into auth.users (id, email) values
 ('e0330000-0000-0000-0000-000000000001', 'criador@example.test'),
 ('e0330000-0000-0000-0000-000000000002', 'membro@example.test');
insert into public.workspaces (id, kind, name) values
 ('e0330000-0000-0000-0000-000000000010', 'empresa', 'Pula o site'),
 ('e0330000-0000-0000-0000-000000000020', 'empresa', 'Outro');
insert into public.workspace_memberships (workspace_id, user_id, role) values
 ('e0330000-0000-0000-0000-000000000010', 'e0330000-0000-0000-0000-000000000001', 'admin'),
 ('e0330000-0000-0000-0000-000000000020', 'e0330000-0000-0000-0000-000000000001', 'admin'),
 ('e0330000-0000-0000-0000-000000000010', 'e0330000-0000-0000-0000-000000000002', 'member');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'e0330000-0000-0000-0000-000000000001', true);

select public.save_my_day0('e0330000-0000-0000-0000-000000000010', 'papel', 'Founder');
select is(public.save_my_day0('e0330000-0000-0000-0000-000000000010', 'empresa', 'Pula')->>'etapa', 'dominio', 'empresa leva ao site');
select is(public.get_my_day0('e0330000-0000-0000-0000-000000000010')->>'sitePulado', 'false', 'site não pulado no começo');
select is(public.save_my_day0('e0330000-0000-0000-0000-000000000010', 'pular_site')->>'etapa', 'hdyhau', 'pular o site segue o Day0');
select is(public.get_my_day0('e0330000-0000-0000-0000-000000000010')->>'sitePulado', 'true', 'recarregar lembra que o site ficou para depois');
select is(public.get_my_day0('e0330000-0000-0000-0000-000000000010')->>'dominio', '', 'pular não inventa site');
select is(public.save_my_day0('e0330000-0000-0000-0000-000000000010', 'hdyhau', 'LinkedIn')->>'etapa', 'convite', 'sem site, o Day0 chega ao fim');
select is(public.save_my_day0('e0330000-0000-0000-0000-000000000010', 'concluir')->>'concluido', 'true', 'sem site, o Day0 conclui');
select is(public.get_my_day0('e0330000-0000-0000-0000-000000000020')->>'sitePulado', 'false', 'o pulo vale só para o Workspace em que foi feito');

-- Informar o site depois, em Configurações (geração do ticket 02), desfaz o pulo.
select lives_ok($$select public.start_company_context_generation('e0330000-0000-0000-0000-000000000010', 'pula.test')$$,
  'Administrador informa o site depois');
select is(public.get_my_day0('e0330000-0000-0000-0000-000000000010')->>'sitePulado', 'false', 'site informado depois deixa de constar como pulado');
select is(public.get_my_day0('e0330000-0000-0000-0000-000000000010')->>'dominio', 'pula.test', 'o site informado depois é o do Day0');
select is(public.save_my_day0('e0330000-0000-0000-0000-000000000010', 'pular_site')->>'sitePulado', 'false',
  'com site cadastrado, pular não apaga nem esconde o site');

-- Quem não é o Administrador original não pula o site do Workspace.
select set_config('request.jwt.claim.sub', 'e0330000-0000-0000-0000-000000000002', true);
select throws_ok($$select public.save_my_day0('e0330000-0000-0000-0000-000000000010', 'pular_site')$$, '42501',
  'company Day0 requires original administrator', 'membro não pula o site do Workspace');
select throws_ok($$select public.save_my_day0('e0330000-0000-0000-0000-000000000020', 'pular_site')$$, '42501',
  'active workspace membership required', 'sem Participação não pula o site de outro Workspace');

-- Domínio confirmado no Day0 também desfaz o pulo.
reset role;
insert into public.day0_companies (workspace_id, empresa, site_skipped) values ('e0330000-0000-0000-0000-000000000020', 'Outro', true);
set local role authenticated;
select set_config('request.jwt.claim.sub', 'e0330000-0000-0000-0000-000000000001', true);
select is(public.save_my_day0('e0330000-0000-0000-0000-000000000020', 'dominio', 'outro.test')->>'sitePulado', 'false',
  'confirmar o domínio desfaz o pulo');
select throws_ok($$select public.save_my_day0('e0330000-0000-0000-0000-000000000020', 'pular_site', 'x')$$, '22023',
  'invalid Day0 value', 'pular o site não recebe valor');
select * from finish();
rollback;
