-- enriquecimento-em-cascata 01: o dado que veio do fornecedor grava a Origem do campo e não sobrescreve correção manual.
-- Contato novo aceito do comitê: nome, cargo e LinkedIn do actor ficam automatico; e-mail e telefone digitados no aceite
-- ficam manual. Contato que já existe só ganha o Vínculo. O CNPJ da Receita é o que a pessoa digitou: fica manual.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(12);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
                        created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
                        is_sso_user, is_anonymous)
values
  ('ec100000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'ana@ec-norte.test', '', now(), now(), now(), '{}', '{}', false, false),
  ('ec100000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'eva@ec-sul.test', '', now(), now(), now(), '{}', '{}', false, false);

insert into public.workspaces (id, kind, name) values
  ('ec200000-0000-0000-0000-000000000001', 'empresa', 'Norte EC'),
  ('ec200000-0000-0000-0000-000000000002', 'empresa', 'Sul EC');

insert into public.workspace_memberships (workspace_id, user_id, role, active) values
  ('ec200000-0000-0000-0000-000000000001', 'ec100000-0000-0000-0000-000000000001', 'admin', true),
  ('ec200000-0000-0000-0000-000000000002', 'ec100000-0000-0000-0000-000000000002', 'admin', true);

insert into public.target_accounts (id, workspace_id, name, canonical_url, domain, created_by, legal_identifier) values
  ('ec300000-0000-0000-0000-000000000001', 'ec200000-0000-0000-0000-000000000001', 'Acme Logistica', 'https://acme-ec.test', 'acme-ec.test', 'ec100000-0000-0000-0000-000000000001', null),
  ('ec300000-0000-0000-0000-000000000002', 'ec200000-0000-0000-0000-000000000001', 'Beta Energia', 'https://beta-ec.test', 'beta-ec.test', 'ec100000-0000-0000-0000-000000000001', '33.000.167/0001-01');

insert into public.sales_responsibilities (workspace_id, target_account_id, owner_user_id) values
  ('ec200000-0000-0000-0000-000000000001', 'ec300000-0000-0000-0000-000000000001', 'ec100000-0000-0000-0000-000000000001'),
  ('ec200000-0000-0000-0000-000000000001', 'ec300000-0000-0000-0000-000000000002', 'ec100000-0000-0000-0000-000000000001');

-- A Beta veio da Descoberta: o CNPJ dela é automático (accept_discovered_account faz o mesmo).
update private.account_field_sources set origin = 'automatico'
where target_account_id = 'ec300000-0000-0000-0000-000000000002' and field = 'legal_identifier';

-- O Caio já é Contato, com nome e cargo corrigidos à mão.
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'ec100000-0000-0000-0000-000000000001', true);
select public.create_contact(
  'ec300000-0000-0000-0000-000000000001', 'Caio Campeao', 'Analista Senior', null, null,
  'https://www.linkedin.com/in/caio-campeao-ec'
);

reset role;
select public.record_proposed_contact(
  'ec200000-0000-0000-0000-000000000001', 'ec300000-0000-0000-0000-000000000001', null,
  'Ana Decisora', 'Diretora de Operacoes', null, 'https://www.linkedin.com/in/ana-decisora-ec', null, null, 'Decisor'
);
select public.record_proposed_contact(
  'ec200000-0000-0000-0000-000000000001', 'ec300000-0000-0000-0000-000000000001', null,
  'Caio C.', 'Analista', null, 'https://www.linkedin.com/in/caio-campeao-ec', null, null, 'Campeao'
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'ec100000-0000-0000-0000-000000000001', true);

create temporary table propostas as
  select id, name from public.list_proposed_contacts('ec300000-0000-0000-0000-000000000001', 'nova');

-- Outro Workspace não aceita a proposta da Norte.
select set_config('request.jwt.claim.sub', 'ec100000-0000-0000-0000-000000000002', true);
select throws_ok(
  format('select public.accept_proposed_contact(%L::uuid)', (select id from propostas where name = 'Ana Decisora')),
  '42501',
  null,
  'outro Workspace não aceita a proposta'
);

select set_config('request.jwt.claim.sub', 'ec100000-0000-0000-0000-000000000001', true);
create temporary table ana as
  select * from public.accept_proposed_contact(
    (select id from propostas where name = 'Ana Decisora'), 'ana@acme-ec.test', '+55 11 98888-7777'
  );
select public.accept_proposed_contact((select id from propostas where name = 'Caio C.'));

-- A pessoa consulta a Receita na sessão dela: na Acme, um CNPJ que ela digitou; na Beta, o mesmo CNPJ que já estava.
select public.save_account_receita_enrichment(
  'ec200000-0000-0000-0000-000000000001', 'ec300000-0000-0000-0000-000000000001', '07526557000100', '{"razaoSocial": "Acme"}'
);
select public.save_account_receita_enrichment(
  'ec200000-0000-0000-0000-000000000001', 'ec300000-0000-0000-0000-000000000002', '33000167000101', '{"razaoSocial": "Beta"}'
);

reset role;

select is(
  (select origin from private.contact_field_sources where contact_id = (select id from ana) and field = 'name'),
  'automatico',
  'o nome que veio do actor fica automatico no Contato aceito'
);
select is(
  (select origin from private.contact_field_sources where contact_id = (select id from ana) and field = 'role'),
  'automatico',
  'o cargo que veio do actor fica automatico no Contato aceito'
);
select is(
  (select origin from private.contact_field_sources where contact_id = (select id from ana) and field = 'linkedin'),
  'automatico',
  'o LinkedIn que veio do actor fica automatico no Contato aceito'
);
select is(
  (select origin from private.contact_field_sources where contact_id = (select id from ana) and field = 'email'),
  'manual',
  'o e-mail digitado no aceite fica manual'
);
select is(
  (select origin from private.contact_field_sources where contact_id = (select id from ana) and field = 'phone'),
  'manual',
  'o telefone digitado no aceite fica manual'
);

select is(
  (select name || ' / ' || role from public.contacts where linkedin = private.normalize_linkedin('https://www.linkedin.com/in/caio-campeao-ec')),
  'Caio Campeao / Analista Senior',
  'aceitar a proposta de quem já é Contato não sobrescreve o nome nem o cargo corrigidos à mão'
);
select is(
  (select origin from private.contact_field_sources s join public.contacts c on c.id = s.contact_id
   where c.name = 'Caio Campeao' and s.field = 'name'),
  'manual',
  'o nome manual do Contato que já existia continua manual'
);
select is(
  (select origin from private.contact_field_sources s join public.contacts c on c.id = s.contact_id
   where c.name = 'Caio Campeao' and s.field = 'role'),
  'manual',
  'o cargo manual do Contato que já existia continua manual'
);
select is(
  (select count(*)::integer from public.contacts where workspace_id = 'ec200000-0000-0000-0000-000000000001'),
  2,
  'o aceite de quem já é Contato não cria outro Contato'
);

select is(
  (select origin from private.account_field_sources
   where target_account_id = 'ec300000-0000-0000-0000-000000000001' and field = 'legal_identifier'),
  'manual',
  'o CNPJ que a pessoa digitou para a Receita fica manual'
);
select is(
  (select origin from private.account_field_sources
   where target_account_id = 'ec300000-0000-0000-0000-000000000002' and field = 'legal_identifier'),
  'automatico',
  'consultar a Receita com o mesmo CNPJ não troca a origem dele'
);

select * from finish();
rollback;
