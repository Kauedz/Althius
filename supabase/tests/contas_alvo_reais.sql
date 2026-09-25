begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(24);

-- Workspace da empresa com Ana (Administradora), Beto (Membro) e Dora (Participação removida).
-- Caio participa só de outro Workspace.
insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
                        created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
                        is_sso_user, is_anonymous)
values
  ('40000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'ana@cliente.com.br', '', now(), now(), now(), '{}', '{}', false, false),
  ('40000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'beto@cliente.com.br', '', now(), now(), now(), '{}', '{}', false, false),
  ('40000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'caio@outro.com.br', '', now(), now(), now(), '{}', '{}', false, false),
  ('40000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'dora@cliente.com.br', '', now(), now(), now(), '{}', '{}', false, false);

insert into public.workspaces (id, kind, name) values
  ('41000000-0000-0000-0000-000000000001', 'empresa', 'Cliente'),
  ('41000000-0000-0000-0000-000000000002', 'empresa', 'Outro');

insert into public.workspace_memberships (workspace_id, user_id, role, active) values
  ('41000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', 'admin', true),
  ('41000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000002', 'member', true),
  ('41000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000004', 'member', false),
  ('41000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000003', 'admin', true);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);

-- Beto (Membro) cadastra uma Conta-alvo manualmente.
select set_config('request.jwt.claim.sub', '40000000-0000-0000-0000-000000000002', true);
create temporary table criada on commit drop as
  select * from public.save_target_account(
    '41000000-0000-0000-0000-000000000001', 'Empresa Alfa', 'https://empresa.com.br/matriz',
    p_legal_identifier => '12.345.678/0001-90', p_segment => 'Varejo');

select is(pg_typeof((select id from criada))::text, 'uuid', 'a Conta-alvo tem identidade UUID');
select is((select workspace_id from criada), '41000000-0000-0000-0000-000000000001'::uuid,
  'a Conta-alvo pertence ao Workspace');
select is((select canonical_url from criada), 'https://empresa.com.br/matriz', 'a URL da empresa é guardada na forma canônica');
select is((select domain from criada), 'empresa.com.br', 'o domínio é derivado da URL canônica');
select is(
  (select owner_user_id from public.sales_responsibilities where target_account_id = (select id::text from criada)),
  '40000000-0000-0000-0000-000000000002'::uuid,
  'a responsabilidade inicial do cadastro manual é de quem criou');
select is((select count(*)::int from public.target_accounts), 1, 'o Membro consulta a Conta que criou');

-- A mesma URL, escrita de outro jeito, encontra a Conta existente para atualização.
select is(
  (select id from public.save_target_account(
    '41000000-0000-0000-0000-000000000001', 'Empresa Alfa S.A.', 'HTTP://www.Empresa.com.br/matriz/?utm=x')),
  (select id from criada), 'a URL canônica corresponde à Conta existente');
select is((select name from public.target_accounts where id = (select id from criada)), 'Empresa Alfa S.A.',
  'a Conta existente é atualizada');
select is((select segment from public.target_accounts where id = (select id from criada)), 'Varejo',
  'atualizar sem um campo não apaga o que já existia');
select is((select count(*)::int from public.target_accounts), 1, 'a correspondência pela URL não cria outra Conta');

select throws_ok(
  $$select public.save_target_account('41000000-0000-0000-0000-000000000001', 'Sem site', 'não é uma url')$$,
  '22023', 'invalid company url', 'uma URL da empresa inválida é recusada');
select throws_ok(
  $$update public.target_accounts set name = 'Invasão'$$,
  '42501', null, 'o cliente não altera Contas por fora do backend');

-- Beto registra uma Interação comercial manual na Conta sob sua responsabilidade.
select is(
  (select kind from public.register_account_interaction((select id from criada), 'ligacao', '2026-09-24T15:00:00Z')),
  'ligacao', 'o responsável registra uma Interação comercial manual');
select is(
  (select last_interaction_at from public.target_accounts where id = (select id from criada)),
  '2026-09-24T15:00:00Z'::timestamptz, 'a Conta guarda a data da Interação mais recente');

-- Ana (Administradora) consulta todas as Contas do Workspace e o histórico.
select set_config('request.jwt.claim.sub', '40000000-0000-0000-0000-000000000001', true);
select is((select count(*)::int from public.target_accounts), 1, 'a Administradora consulta as Contas do Workspace');
select is(
  (select count(*)::int from public.account_interactions where target_account_id = (select id from criada)), 1,
  'a Interação aparece no histórico da Conta');
select throws_ok(
  $$select public.save_target_account('41000000-0000-0000-0000-000000000001', 'Tomada', 'https://empresa.com.br/matriz')$$,
  '42501', 'only the responsible seller can edit this target account',
  'o backend impede editar uma Conta fora da própria responsabilidade');
select throws_ok(
  format($$select public.register_account_interaction(%L, 'reuniao')$$, (select id from criada)),
  '42501', 'only the responsible seller can register interactions on this target account',
  'quem não é responsável não registra Interação na Conta');

-- Mesmo domínio e mesmo identificador legal, outra URL canônica: outra Conta.
select isnt(
  (select id from public.save_target_account(
    '41000000-0000-0000-0000-000000000001', 'Empresa Alfa Filial', 'https://empresa.com.br/filial',
    p_legal_identifier => '12.345.678/0001-90')),
  (select id from criada), 'domínio ou identificador legal isolados não mesclam Contas');
select is((select count(*)::int from public.target_accounts), 2, 'as duas Contas continuam separadas');

-- Caio, de outro Workspace, e Dora, com a Participação removida, não veem nem criam.
select set_config('request.jwt.claim.sub', '40000000-0000-0000-0000-000000000003', true);
select is((select count(*)::int from public.target_accounts), 0, 'outro Workspace não enxerga as Contas');
select throws_ok(
  $$select public.save_target_account('41000000-0000-0000-0000-000000000001', 'Intrusa', 'https://intrusa.com')$$,
  '42501', 'active workspace membership required', 'quem não participa do Workspace não cria Contas nele');

select set_config('request.jwt.claim.sub', '40000000-0000-0000-0000-000000000004', true);
select is((select count(*)::int from public.target_accounts), 0, 'Participação removida não consulta Contas');
select is((select count(*)::int from public.account_interactions), 0, 'Participação removida não consulta Interações');

select * from finish();
rollback;
