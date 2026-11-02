begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(11);
create function pg_temp.semear_agentes_padrao(p_workspace_id uuid) returns void
language plpgsql
as $$
begin
  with novos as (
    insert into private.agents (workspace_id, specialty, kind)
    select p_workspace_id, c.specialty, 'padrao' from private.specialty_catalog c
    on conflict do nothing returning id, workspace_id, specialty
  ), configuracao as (
    insert into private.agent_settings (agent_id, workspace_id, channels)
    select n.id, n.workspace_id, array['whatsapp']::text[] from novos n
  )
  insert into private.agent_permissions (agent_id, workspace_id, integration_id, permission)
  select n.id, n.workspace_id, d.integration_id, d.permission from novos n
  join private.specialty_default_permissions d on d.specialty = n.specialty;
end;
$$;


-- A regra única do Playbook e a guarda em dólar (aprovacoes-playbook-automacao-tetos). Norte: Ana (Admin), Bruno
-- (Membro). Sul: Carla (Admin).
insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
                        created_at, updated_at, raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous)
values
  ('5a000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'ana@norte12.test', '', now(), now(), now(), '{}', '{}', false, false),
  ('5a000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'bruno@norte12.test', '', now(), now(), now(), '{}', '{}', false, false),
  ('5a000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'carla@sul12.test', '', now(), now(), now(), '{}', '{}', false, false);
insert into public.workspaces (id, kind, name) values
  ('fa000000-0000-0000-0000-000000000001', 'empresa', 'Norte'),
  ('fa000000-0000-0000-0000-000000000002', 'empresa', 'Sul');
select pg_temp.semear_agentes_padrao(w.id) from public.workspaces w;
insert into public.workspace_memberships (workspace_id, user_id, role, active) values
  ('fa000000-0000-0000-0000-000000000001', '5a000000-0000-0000-0000-000000000001', 'admin', true),
  ('fa000000-0000-0000-0000-000000000001', '5a000000-0000-0000-0000-000000000002', 'member', true),
  ('fa000000-0000-0000-0000-000000000002', '5a000000-0000-0000-0000-000000000003', 'admin', true);

create function pg_temp.entrar_como(p uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', p::text, true), set_config('request.jwt.claim.role', 'authenticated', true)
$$;
create temporary table ap (k text primary key, id uuid) on commit drop;
grant all on ap to authenticated;

select ok(
  has_function_privilege('authenticated', 'public.propose_playbook_revision(uuid, text, jsonb, text)', 'execute')
    and not has_function_privilege('anon', 'public.propose_playbook_revision(uuid, text, jsonb, text)', 'execute')
    and not has_function_privilege('authenticated', 'private.sync_contract_usd_guard()', 'execute'),
  'o Participante propõe pelo app; o anônimo não, e o gatilho da guarda não é do app'
);

-- 1. O Membro não grava direto: propõe, e a proposta vai para Aprovações.
select pg_temp.entrar_como('5a000000-0000-0000-0000-000000000002');
select throws_ok(
  $$select public.save_playbook_section('fa000000-0000-0000-0000-000000000001', 'icp', '{"texto": "Indústria"}')$$,
  '42501', 'only administrators can edit the playbook', 'o Membro não grava o Playbook direto'
);
insert into ap select 'm1', approval_id from public.propose_playbook_revision(
  'fa000000-0000-0000-0000-000000000001', 'icp', '{"texto": "Indústrias de 200 a 500 pessoas"}', 'Vi nos fechamentos');
select is(
  (select row(a.state, a.category, a.playbook_section, a.base_version, a.requested_by, a.run_id, g.specialty)::text
   from private.approvals a join private.agents g on g.id = a.agent_id where a.id = (select id from ap where k = 'm1')),
  '(pendente,revisao,icp,0,5a000000-0000-0000-0000-000000000002,,scopus)',
  'a proposta do Membro nasce pendente, sem Execução, no nome do Scopus'
);
select is(
  (select approval_id from public.propose_playbook_revision(
     'fa000000-0000-0000-0000-000000000001', 'icp', '{"texto": "Indústrias de 200 a 500 pessoas"}', '')),
  (select id from ap where k = 'm1'),
  'a mesma proposta pendente devolve a Aprovação que já existe'
);
select is(
  (select count(*)::integer from public.list_approvals('fa000000-0000-0000-0000-000000000001')
   where id = (select id from ap where k = 'm1') and expires_at > now()),
  1, 'a fila traz a proposta com o prazo'
);

-- 2. Outro Workspace não propõe aqui.
select pg_temp.entrar_como('5a000000-0000-0000-0000-000000000003');
select throws_ok(
  $$select * from public.propose_playbook_revision('fa000000-0000-0000-0000-000000000001', 'icp', '{"texto": "x"}', '')$$,
  '42501', 'active workspace membership required', 'quem é de outro Workspace não propõe'
);

-- 3. A Administradora aprova: grava a versão 1 do ICP com o conteúdo proposto.
select pg_temp.entrar_como('5a000000-0000-0000-0000-000000000001');
select lives_ok(
  format($$select public.decide_approval(%L, 'aprovar')$$, (select id from ap where k = 'm1')),
  'a Administradora aprova a proposta do Membro'
);
select is(
  (select content ->> 'texto' from private.playbook_section_versions
   where workspace_id = 'fa000000-0000-0000-0000-000000000001' and section = 'icp' and version = 1),
  'Indústrias de 200 a 500 pessoas', 'aprovar gravou a versão nova do Playbook'
);
select lives_ok(
  $$select public.save_playbook_section('fa000000-0000-0000-0000-000000000001', 'icp', '{"texto": "Indústria e varejo"}')$$,
  'a Administradora grava direto, com versão nova'
);

-- 4. A guarda em dólar segue a faixa do contrato; trocar a faixa troca a guarda.
reset role;
select set_config('request.jwt.claim.sub', '', true);
insert into private.workspace_contracts (workspace_id, tier_id) values ('fa000000-0000-0000-0000-000000000002', 'essencial');
select is(
  (select monthly_cap_usd from private.workspace_signal_budget where workspace_id = 'fa000000-0000-0000-0000-000000000002'),
  140.00::numeric(12, 2), 'o contrato novo leva a guarda da faixa'
);
update private.workspace_contracts set tier_id = 'escala' where workspace_id = 'fa000000-0000-0000-0000-000000000002';
select is(
  (select monthly_cap_usd from private.workspace_signal_budget where workspace_id = 'fa000000-0000-0000-0000-000000000002'),
  280.00::numeric(12, 2), 'renovar em outra faixa troca a guarda'
);

select * from finish();
rollback;
