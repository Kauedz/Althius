begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(8);

-- Ana (Admin) do Norte, com as Contas Alfa e Beta; o Sul tem a própria Conta e o próprio Contato.
insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
                        created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
                        is_sso_user, is_anonymous)
values
  ('5b000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'ana@norte.test', '', now(), now(), now(), '{}', '{}', false, false),
  ('5b000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'bia@sul.test', '', now(), now(), now(), '{}', '{}', false, false);
insert into public.workspaces (id, kind, name) values
  ('fb000000-0000-0000-0000-000000000001', 'empresa', 'Norte'),
  ('fb000000-0000-0000-0000-000000000002', 'empresa', 'Sul');
insert into private.workspace_contracts (workspace_id, tier_id, starts_at) select w.id, 'escala', date_trunc('month', now()) from public.workspaces w where w.id in ('fb000000-0000-0000-0000-000000000001', 'fb000000-0000-0000-0000-000000000002') on conflict (workspace_id) do nothing; -- contrato de teste (automacao-e-contrato-inativo)
insert into public.workspace_memberships (workspace_id, user_id, role, active) values
  ('fb000000-0000-0000-0000-000000000001', '5b000000-0000-0000-0000-000000000001', 'admin', true),
  ('fb000000-0000-0000-0000-000000000002', '5b000000-0000-0000-0000-000000000002', 'admin', true);
insert into public.target_accounts (id, workspace_id, name, canonical_url, domain, linkedin_url, created_by) values
  ('db000000-0000-0000-0000-000000000001', 'fb000000-0000-0000-0000-000000000001', 'Alfa', 'https://alfa.test', 'alfa.test', 'https://www.linkedin.com/company/alfa', '5b000000-0000-0000-0000-000000000001'),
  ('db000000-0000-0000-0000-000000000002', 'fb000000-0000-0000-0000-000000000001', 'Beta', 'https://beta.test', 'beta.test', null, '5b000000-0000-0000-0000-000000000001'),
  ('db000000-0000-0000-0000-000000000003', 'fb000000-0000-0000-0000-000000000002', 'Sul', 'https://sul.test', 'sul.test', null, '5b000000-0000-0000-0000-000000000002');

-- Na Alfa: Caio (LinkedIn, vínculo ativo), Duda (sem LinkedIn), Enzo (vínculo encerrado), Fábio (arquivado) e Gil
-- (LinkedIn que não é perfil). No Sul: Hana, vinculada à Conta do Sul.
insert into public.contacts (id, workspace_id, name, linkedin, created_by, archived_at) values
  ('cb000000-0000-0000-0000-000000000001', 'fb000000-0000-0000-0000-000000000001', 'Caio', 'https://www.linkedin.com/in/caio-ficticio', '5b000000-0000-0000-0000-000000000001', null),
  ('cb000000-0000-0000-0000-000000000002', 'fb000000-0000-0000-0000-000000000001', 'Duda', null, '5b000000-0000-0000-0000-000000000001', null),
  ('cb000000-0000-0000-0000-000000000003', 'fb000000-0000-0000-0000-000000000001', 'Enzo', 'https://www.linkedin.com/in/enzo-ficticio', '5b000000-0000-0000-0000-000000000001', null),
  ('cb000000-0000-0000-0000-000000000004', 'fb000000-0000-0000-0000-000000000001', 'Fábio', 'https://www.linkedin.com/in/fabio-ficticio', '5b000000-0000-0000-0000-000000000001', null),
  ('cb000000-0000-0000-0000-000000000005', 'fb000000-0000-0000-0000-000000000001', 'Gil', 'https://www.linkedin.com/company/gil', '5b000000-0000-0000-0000-000000000001', null),
  ('cb000000-0000-0000-0000-000000000006', 'fb000000-0000-0000-0000-000000000002', 'Hana', 'https://www.linkedin.com/in/hana-ficticia', '5b000000-0000-0000-0000-000000000002', null);
insert into public.contact_account_links (workspace_id, contact_id, target_account_id, ended_at) values
  ('fb000000-0000-0000-0000-000000000001', 'cb000000-0000-0000-0000-000000000001', 'db000000-0000-0000-0000-000000000001', null),
  ('fb000000-0000-0000-0000-000000000001', 'cb000000-0000-0000-0000-000000000002', 'db000000-0000-0000-0000-000000000001', null),
  ('fb000000-0000-0000-0000-000000000001', 'cb000000-0000-0000-0000-000000000003', 'db000000-0000-0000-0000-000000000001', now()),
  ('fb000000-0000-0000-0000-000000000001', 'cb000000-0000-0000-0000-000000000004', 'db000000-0000-0000-0000-000000000001', null),
  ('fb000000-0000-0000-0000-000000000001', 'cb000000-0000-0000-0000-000000000005', 'db000000-0000-0000-0000-000000000001', null),
  ('fb000000-0000-0000-0000-000000000002', 'cb000000-0000-0000-0000-000000000006', 'db000000-0000-0000-0000-000000000003', null);
update public.contacts set archived_at = now() where id = 'cb000000-0000-0000-0000-000000000004';

select public.set_signal_actor_state('harvestapi~linkedin-profile-scraper', 'available', '0.0.135');

-- Um Monitoramento de mudança de emprego com as duas Contas do Norte.
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '5b000000-0000-0000-0000-000000000001', true);
select public.save_signal_monitor('fb000000-0000-0000-0000-000000000001', null, 'mudanca_de_emprego', 'Contatos', 'ativo',
  '{"accountIds":["db000000-0000-0000-0000-000000000001","db000000-0000-0000-0000-000000000002"]}', '{"movimento":["Promoção"]}', 24);
reset role;

create temporary table claim on commit drop as select * from public.claim_due_signal_monitors(10);
create temporary table contas on commit drop as
  select c.value as conta from claim, jsonb_array_elements(claim.accounts) c;

-- 1. Cada Conta vem com o LinkedIn dos Contatos com vínculo ativo, não arquivados e com perfil: só o Caio, na Alfa.
select is(
  (select conta -> 'contatos' from contas where conta ->> 'name' = 'Alfa'),
  '[{"id": "cb000000-0000-0000-0000-000000000001", "linkedinUrl": "https://www.linkedin.com/in/caio-ficticio"}]'::jsonb,
  'a Alfa vem só com o Caio: sem LinkedIn, vínculo encerrado, arquivado e página que não é perfil ficam de fora'
);
select is((select conta -> 'contatos' from contas where conta ->> 'name' = 'Beta'), '[]'::jsonb, 'a Conta sem Contato vem com a lista vazia');
select is(
  (select array_agg(k order by k) from contas, jsonb_object_keys(conta -> 'contatos' -> 0) k where conta ->> 'name' = 'Alfa'),
  array['id', 'linkedinUrl'],
  'do Contato só vão o id e o perfil: nada de nome, e-mail ou telefone'
);
select is(
  (select row(conta ->> 'domain', conta ->> 'linkedinUrl')::text from contas where conta ->> 'name' = 'Alfa'),
  '(alfa.test,https://www.linkedin.com/company/alfa)', 'o resto da Conta segue igual'
);
select ok(
  not exists (select 1 from contas where conta::text like '%hana%'),
  'o Contato de outro Workspace nunca vem'
);

-- 2. A busca de Sinais (reativação) leva os mesmos Contatos.
insert into private.signal_rescans (workspace_id, target_account_id, origin, requested_by)
values ('fb000000-0000-0000-0000-000000000001', 'db000000-0000-0000-0000-000000000001', 'manual', '5b000000-0000-0000-0000-000000000001');
select is(
  (select account -> 'contatos' from public.claim_signal_rescans(5)),
  '[{"id": "cb000000-0000-0000-0000-000000000001", "linkedinUrl": "https://www.linkedin.com/in/caio-ficticio"}]'::jsonb,
  'a busca da Conta leva o LinkedIn do Caio'
);

-- 3. No máximo 25 Contatos por Conta, em ordem de nome.
insert into public.contacts (id, workspace_id, name, linkedin, created_by)
select ('cb000000-0000-0000-0001-' || lpad(i::text, 12, '0'))::uuid, 'fb000000-0000-0000-0000-000000000001', 'Zé ' || lpad(i::text, 2, '0'),
  'https://www.linkedin.com/in/ze-ficticio-' || i, '5b000000-0000-0000-0000-000000000001'
from generate_series(1, 30) i;
insert into public.contact_account_links (workspace_id, contact_id, target_account_id)
select 'fb000000-0000-0000-0000-000000000001', ('cb000000-0000-0000-0001-' || lpad(i::text, 12, '0'))::uuid, 'db000000-0000-0000-0000-000000000002'
from generate_series(1, 30) i;
select is(
  jsonb_array_length(private.signal_scan_contacts('fb000000-0000-0000-0000-000000000001', 'db000000-0000-0000-0000-000000000002')), 25,
  'a Conta com 30 Contatos leva 25'
);

-- 4. Só o servidor reivindica.
select ok(
  not has_function_privilege('authenticated', 'public.claim_due_signal_monitors(integer)', 'execute')
    and not has_function_privilege('authenticated', 'public.claim_signal_rescans(integer)', 'execute')
    and not has_function_privilege('service_role', 'private.signal_scan_contacts(uuid, uuid)', 'execute')
    and has_function_privilege('service_role', 'public.claim_due_signal_monitors(integer)', 'execute')
    and has_function_privilege('service_role', 'public.claim_signal_rescans(integer)', 'execute'),
  'reivindicar a varredura e a busca segue só do servidor'
);
select * from finish();
rollback;
