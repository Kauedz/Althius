-- S1: aceitar de novo uma proposta já aceita devolve o mesmo Contato só a quem pode gerir os Contatos da Conta-alvo.
-- Um usuário de outro Workspace e um participante com a Participação desativada recebem 42501 e nenhum dado, mesmo
-- conhecendo o id da proposta. O vendedor responsável e o Administrador, com Participação ativa, recebem o mesmo Contato.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(6);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
                        created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
                        is_sso_user, is_anonymous)
values
  ('a5100000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'ana@s1-norte.test', '', now(), now(), now(), '{}', '{}', false, false),
  ('a5100000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'bia@s1-norte.test', '', now(), now(), now(), '{}', '{}', false, false),
  ('a5100000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'eva@s1-sul.test', '', now(), now(), now(), '{}', '{}', false, false);

insert into public.workspaces (id, kind, name) values
  ('a5200000-0000-0000-0000-000000000001', 'empresa', 'Norte S1'),
  ('a5200000-0000-0000-0000-000000000002', 'empresa', 'Sul S1');

-- Ana é Administradora da Norte; Bia é vendedora da Norte e responsável pela Acme; Eva é Administradora da Sul.
insert into public.workspace_memberships (workspace_id, user_id, role, active) values
  ('a5200000-0000-0000-0000-000000000001', 'a5100000-0000-0000-0000-000000000001', 'admin', true),
  ('a5200000-0000-0000-0000-000000000001', 'a5100000-0000-0000-0000-000000000002', 'member', true),
  ('a5200000-0000-0000-0000-000000000002', 'a5100000-0000-0000-0000-000000000003', 'admin', true);

insert into public.target_accounts (id, workspace_id, name, canonical_url, domain, created_by) values
  ('a5300000-0000-0000-0000-000000000001', 'a5200000-0000-0000-0000-000000000001', 'Acme Logistica', 'https://acme-s1.test', 'acme-s1.test', 'a5100000-0000-0000-0000-000000000001');

insert into public.sales_responsibilities (workspace_id, target_account_id, owner_user_id) values
  ('a5200000-0000-0000-0000-000000000001', 'a5300000-0000-0000-0000-000000000001', 'a5100000-0000-0000-0000-000000000002');

create temporary table proposta as
  select id from public.record_proposed_contact(
    'a5200000-0000-0000-0000-000000000001', 'a5300000-0000-0000-0000-000000000001', null,
    'Davi Decisor', 'Diretor de Operacoes', null, 'https://www.linkedin.com/in/davi-decisor-s1', null, null, 'Decisor'
  );
grant select on proposta to authenticated;

-- A Bia aceita a proposta com o e-mail e o telefone do Davi.
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'a5100000-0000-0000-0000-000000000002', true);
create temporary table aceito as
  select * from public.accept_proposed_contact((select id from proposta), 'davi@acme-s1.test', '+55 11 97777-6666');

select is(
  (select c.id from public.accept_proposed_contact((select id from proposta)) c),
  (select id from aceito),
  'a vendedora responsável aceita de novo e recebe o mesmo Contato'
);

-- Eva, de outro Workspace, conhece o id da proposta.
select set_config('request.jwt.claim.sub', 'a5100000-0000-0000-0000-000000000003', true);
select throws_ok(
  format('select public.accept_proposed_contact(%L::uuid)', (select id from proposta)),
  '42501',
  null,
  'um usuário de outro Workspace não recebe o Contato da proposta já aceita'
);

-- A Participação da Bia é desativada.
reset role;
update public.workspace_memberships set active = false
where workspace_id = 'a5200000-0000-0000-0000-000000000001' and user_id = 'a5100000-0000-0000-0000-000000000002';

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'a5100000-0000-0000-0000-000000000002', true);
select throws_ok(
  format('select public.accept_proposed_contact(%L::uuid)', (select id from proposta)),
  '42501',
  null,
  'a participante com a Participação desativada não recebe o Contato que ela mesma aceitou'
);

select set_config('request.jwt.claim.sub', 'a5100000-0000-0000-0000-000000000001', true);
select is(
  (select c.id from public.accept_proposed_contact((select id from proposta)) c),
  (select id from aceito),
  'a Administradora do Workspace aceita de novo e recebe o mesmo Contato'
);

reset role;

select is(
  (select count(*)::integer from public.contacts where workspace_id = 'a5200000-0000-0000-0000-000000000001'),
  1,
  'o aceite repetido não cria outro Contato'
);
select is(
  (select decided_by from private.proposed_contacts where id = (select id from proposta)),
  'a5100000-0000-0000-0000-000000000002'::uuid,
  'o aceite repetido não muda quem decidiu a proposta'
);

select * from finish();
rollback;
