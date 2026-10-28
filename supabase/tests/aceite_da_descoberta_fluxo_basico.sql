begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(18);

-- Contrato mínimo do aceite: identidade da candidata, idempotência, deduplicação e isolamento.
insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous)
values ('71000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'aceite@norte.test', '', now(), now(), now(), '{}', '{}', false, false),
       ('71000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'fora@sul.test', '', now(), now(), now(), '{}', '{}', false, false);
insert into public.workspaces (id, kind, name) values ('f1000000-0000-0000-0000-000000000001', 'empresa', 'Norte'), ('f1000000-0000-0000-0000-000000000002', 'empresa', 'Sul');
insert into public.workspace_memberships (workspace_id, user_id, role, active) values
  ('f1000000-0000-0000-0000-000000000001', '71000000-0000-0000-0000-000000000001', 'admin', true),
  ('f1000000-0000-0000-0000-000000000002', '71000000-0000-0000-0000-000000000002', 'admin', true);

insert into private.discovered_accounts (id, workspace_id, name, name_key, website, domain, domain_key, cnpj, cnpj_key, sector, linkedin_url, state, fit_level, source_actor, created_at)
values ('e1000000-0000-0000-0000-000000000001', 'f1000000-0000-0000-0000-000000000001', 'Conta Fluxo Ltda', 'conta fluxo', 'https://fluxo.test', 'fluxo.test', 'fluxo.test', '00000000000191', '00000000000191', 'Software', 'https://linkedin.com/company/fluxo', 'nova', 'alto', 'teste', now()),
       ('e1000000-0000-0000-0000-000000000002', 'f1000000-0000-0000-0000-000000000002', 'Conta Sul', 'conta sul', 'https://sul.test', 'sul.test', 'sul.test', null, null, 'Serviços', null, 'nova', 'alto', 'teste', now());

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '71000000-0000-0000-0000-000000000001', true);
select is((select count(*) from public.target_accounts where workspace_id = 'f1000000-0000-0000-0000-000000000001'), 0::bigint, 'a Conta ainda não existe');
select lives_ok($$select * from public.accept_discovered_account('e1000000-0000-0000-0000-000000000001')$$, 'aceitar uma Descoberta nova funciona');
select is((select count(*) from public.target_accounts where workspace_id = 'f1000000-0000-0000-0000-000000000001' and domain = 'fluxo.test'), 1::bigint, 'cria uma Conta com o domínio');
select is((select count(*) from public.target_accounts where workspace_id = 'f1000000-0000-0000-0000-000000000001'), 1::bigint, 'o aceite não cria duplicata');
select is((select created from public.accept_discovered_account('e1000000-0000-0000-0000-000000000001')), false, 'aceitar duas vezes é idempotente');
select throws_ok($$select * from public.accept_discovered_account('e1000000-0000-0000-0000-000000000002')$$, 'P0002', 'discovered account not found', 'membro de outro Workspace não acessa a Descoberta');
select is((select name from public.target_accounts where domain = 'fluxo.test'), 'Conta Fluxo Ltda', 'leva o nome da candidata');
select is((select segment from public.target_accounts where domain = 'fluxo.test'), 'Software', 'leva o setor da candidata');
select is((select canonical_url from public.target_accounts where domain = 'fluxo.test'), 'https://fluxo.test', 'leva o website da candidata');
select is((select legal_identifier from public.target_accounts where domain = 'fluxo.test'), '00.000.000/0001-91', 'leva o CNPJ da candidata');
select is((select linkedin_url from public.target_accounts where domain = 'fluxo.test'), 'https://linkedin.com/company/fluxo', 'leva o LinkedIn da candidata');
reset role;
select is((select state from private.discovered_accounts where id = 'e1000000-0000-0000-0000-000000000001'), 'aceita', 'muda o estado para aceita');
select ok((select target_account_id is not null and decided_by = '71000000-0000-0000-0000-000000000001' from private.discovered_accounts where id = 'e1000000-0000-0000-0000-000000000001'), 'grava Conta-alvo e pessoa decisora');
select is(private.committee_gate('f1000000-0000-0000-0000-000000000001', '71000000-0000-0000-0000-000000000001'), 'sem_contrato', 'sem contrato impede o Comitê');

-- A Conta já existente deve ser reutilizada, primeiro pelo domínio e depois pelo CNPJ.
insert into public.target_accounts (id, workspace_id, name, canonical_url, domain, legal_identifier, created_by)
values
  ('d1000000-0000-0000-0000-000000000001', 'f1000000-0000-0000-0000-000000000001', 'Conta Domínio Existente', 'https://dominio.test', 'dominio.test', null, '71000000-0000-0000-0000-000000000001'),
  ('d1000000-0000-0000-0000-000000000002', 'f1000000-0000-0000-0000-000000000001', 'Conta CNPJ Existente', 'https://cnpj-existente.test', 'cnpj-existente.test', '11.222.333/0001-81', '71000000-0000-0000-0000-000000000001');
insert into private.discovered_accounts (id, workspace_id, name, name_key, website, domain, domain_key, cnpj, cnpj_key, sector, state, fit_level, source_actor, created_at)
values
  ('e1000000-0000-0000-0000-000000000003', 'f1000000-0000-0000-0000-000000000001', 'Outra Razão', 'outra razao', 'https://www.dominio.test/', 'dominio.test', 'dominio.test', null, null, 'Software', 'nova', 'alto', 'teste', now()),
  ('e1000000-0000-0000-0000-000000000004', 'f1000000-0000-0000-0000-000000000001', 'Outra Razão CNPJ', 'outra razao cnpj', 'https://outro.test', 'outro.test', 'outro.test', '11222333000181', '11222333000181', 'Serviços', 'nova', 'alto', 'teste', now());
set local role authenticated;
select is((select target_account_id from public.accept_discovered_account('e1000000-0000-0000-0000-000000000003')), 'd1000000-0000-0000-0000-000000000001'::uuid, 'domínio existente é reutilizado');
select is((select created from public.accept_discovered_account('e1000000-0000-0000-0000-000000000003')), false, 'aceite por domínio não cria Conta');
select is((select target_account_id from public.accept_discovered_account('e1000000-0000-0000-0000-000000000004')), 'd1000000-0000-0000-0000-000000000002'::uuid, 'CNPJ existente é reutilizado');
select is((select count(*) from public.target_accounts where workspace_id = 'f1000000-0000-0000-0000-000000000001'), 3::bigint, 'deduplicação não cria Contas extras');

select * from finish();
rollback;
