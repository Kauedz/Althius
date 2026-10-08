-- B2: a Persona da proposta chega ao Contato aceito; falha do comitê não debita; outro Workspace não lê a proposta.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(16);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
                        created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
                        is_sso_user, is_anonymous)
values
  ('b2100000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'ana@b2-norte.test', '', now(), now(), now(), '{}', '{}', false, false),
  ('b2100000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'eva@b2-sul.test', '', now(), now(), now(), '{}', '{}', false, false);

insert into public.workspaces (id, kind, name) values
  ('b2200000-0000-0000-0000-000000000001', 'empresa', 'Norte B2'),
  ('b2200000-0000-0000-0000-000000000002', 'empresa', 'Sul B2');

insert into public.workspace_memberships (workspace_id, user_id, role, active) values
  ('b2200000-0000-0000-0000-000000000001', 'b2100000-0000-0000-0000-000000000001', 'admin', true),
  ('b2200000-0000-0000-0000-000000000002', 'b2100000-0000-0000-0000-000000000002', 'admin', true);

select public.grant_credits('b2200000-0000-0000-0000-000000000001', 100, 'plano', 'Saldo inicial do B2');

insert into public.target_accounts (id, workspace_id, name, canonical_url, domain, created_by) values
  ('b2300000-0000-0000-0000-000000000001', 'b2200000-0000-0000-0000-000000000001', 'Acme Logistica', 'https://acme-b2.test', 'acme-b2.test', 'b2100000-0000-0000-0000-000000000001');

insert into public.sales_responsibilities (workspace_id, target_account_id, owner_user_id) values
  ('b2200000-0000-0000-0000-000000000001', 'b2300000-0000-0000-0000-000000000001', 'b2100000-0000-0000-0000-000000000001');

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'b2100000-0000-0000-0000-000000000001', true);

create temporary table saldo_inicial as
  select available from public.get_credit_balance('b2200000-0000-0000-0000-000000000001');

create temporary table t_falha as
  select * from public.begin_committee_discovery(
    'b2200000-0000-0000-0000-000000000001'::uuid,
    'b2300000-0000-0000-0000-000000000001'::uuid,
    'b2-falha',
    3,
    'harvestapi~linkedin-company-employees',
    true
  );

reset role;
select public.finish_committee_discovery(
  (select run_id from t_falha),
  false,
  0,
  0.07,
  'O actor do Apify não respondeu a tempo'
);

select is(
  (select state from private.discovery_runs where id = (select run_id from t_falha)),
  'falhou',
  'exceção do actor termina a busca como falhou'
);
select is(
  (select actual_cost_usd = 0.07 from private.discovery_runs where id = (select run_id from t_falha)),
  true,
  'a falha grava o custo em dólares da execução'
);
select is(
  (select last_error from private.discovery_runs where id = (select run_id from t_falha)),
  'O actor do Apify não respondeu a tempo',
  'a falha grava o erro'
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'b2100000-0000-0000-0000-000000000001', true);
select is(
  (select available from public.get_credit_balance('b2200000-0000-0000-0000-000000000001')),
  (select available from saldo_inicial),
  'a falha libera a reserva e não debita'
);

create temporary table t_vazia as
  select * from public.begin_committee_discovery(
    'b2200000-0000-0000-0000-000000000001'::uuid,
    'b2300000-0000-0000-0000-000000000001'::uuid,
    'b2-vazia',
    2,
    'harvestapi~linkedin-company-employees',
    true
  );

reset role;
select public.finish_committee_discovery((select run_id from t_vazia), true, 0, 0.02, null);

select is(
  (select state from private.discovery_runs where id = (select run_id from t_vazia)),
  'concluida',
  'lista vazia termina concluída'
);
select is(
  (select found from private.discovery_runs where id = (select run_id from t_vazia)),
  0,
  'lista vazia encontra zero pessoas'
);
select is(
  (select actual_cost_usd = 0.02 from private.discovery_runs where id = (select run_id from t_vazia)),
  true,
  'a lista vazia também grava o custo'
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'b2100000-0000-0000-0000-000000000001', true);
select is(
  (select available from public.get_credit_balance('b2200000-0000-0000-0000-000000000001')),
  (select available from saldo_inicial),
  'concluída com zero debita zero'
);

create temporary table t_ok as
  select * from public.begin_committee_discovery(
    'b2200000-0000-0000-0000-000000000001'::uuid,
    'b2300000-0000-0000-0000-000000000001'::uuid,
    'b2-ok',
    4,
    'harvestapi~linkedin-company-employees',
    true
  );

select public.create_contact(
  'b2300000-0000-0000-0000-000000000001',
  'Caio Campeao',
  'Analista',
  null,
  null,
  'https://www.linkedin.com/in/caio-campeao'
);

reset role;
select public.record_proposed_contact(
  'b2200000-0000-0000-0000-000000000001', 'b2300000-0000-0000-0000-000000000001', (select run_id from t_ok),
  'Ana Decisora', 'Diretora', null, 'https://www.linkedin.com/in/ana-decisora', null, null, 'Decisor'
);
select public.record_proposed_contact(
  'b2200000-0000-0000-0000-000000000001', 'b2300000-0000-0000-0000-000000000001', (select run_id from t_ok),
  'Bia Influencia', 'Gerente', null, 'https://www.linkedin.com/in/bia-influencia', null, null, 'Influenciador'
);
select public.record_proposed_contact(
  'b2200000-0000-0000-0000-000000000001', 'b2300000-0000-0000-0000-000000000001', (select run_id from t_ok),
  'Caio Campeao', 'Analista', null, 'https://www.linkedin.com/in/caio-campeao', null, null, 'Campeao'
);
select public.record_proposed_contact(
  'b2200000-0000-0000-0000-000000000001', 'b2300000-0000-0000-0000-000000000001', (select run_id from t_ok),
  'Otto Outro', 'Estagiario', null, 'https://www.linkedin.com/in/otto-outro', null, null, 'Outro'
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'b2100000-0000-0000-0000-000000000001', true);

select public.accept_proposed_contact(
  (select id from public.list_proposed_contacts('b2300000-0000-0000-0000-000000000001', 'nova') where name = 'Ana Decisora')
);
select public.accept_proposed_contact(
  (select id from public.list_proposed_contacts('b2300000-0000-0000-0000-000000000001', 'nova') where name = 'Bia Influencia')
);
select public.accept_proposed_contact(
  (select id from public.list_proposed_contacts('b2300000-0000-0000-0000-000000000001', 'nova') where name = 'Caio Campeao')
);
select public.accept_proposed_contact(
  (select id from public.list_proposed_contacts('b2300000-0000-0000-0000-000000000001', 'nova') where name = 'Otto Outro')
);

select is(
  (select persona from public.contacts where name = 'Ana Decisora'),
  'Decisor',
  'aceitar a proposta Decisor grava essa Persona no Contato'
);
select is(
  (select persona from public.contacts where name = 'Bia Influencia'),
  'Influenciador',
  'aceitar a proposta Influenciador grava essa Persona no Contato'
);
select is(
  (select persona from public.contacts where name = 'Caio Campeao'),
  'Campeao',
  'aceitar a proposta de quem já era Contato copia a Persona'
);
select is(
  (select persona from public.contacts where name = 'Otto Outro'),
  null,
  'Outro deixa o Contato sem Persona'
);
select is(
  (select persona from public.target_contacts where name = 'Ana Decisora'),
  'Decisor',
  'a Conta lê a Persona do Contato aceito'
);

select set_config('request.jwt.claim.sub', 'b2100000-0000-0000-0000-000000000002', true);
select throws_ok(
  $$select * from public.list_proposed_contacts('b2300000-0000-0000-0000-000000000001'::uuid, null)$$,
  '42501',
  null,
  'outro Workspace não lê a proposta'
);
select throws_ok(
  $$select * from private.proposed_contacts$$,
  '42501',
  null,
  'proposed_contacts continua fechada para authenticated'
);

reset role;
select throws_ok(
  $$update public.contacts set persona = 'Decisor, Influenciador' where name = 'Ana Decisora'$$,
  '23514',
  null,
  'um Contato tem no máximo uma Persona'
);

select * from finish();
rollback;
