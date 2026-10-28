begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(21);
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


-- Onde não há Vault (o Postgres puro do pgtap-local.sh), um esqueleto do que a migration usa dele; no Supabase e no CI
-- o Vault de verdade vale.
do $vault$
begin
  if to_regnamespace('vault') is null then
    create schema vault;
    create table vault.secrets (
      id uuid primary key default gen_random_uuid(),
      name text unique,
      secret text not null,
      created_at timestamptz not null default now()
    );
    create view vault.decrypted_secrets as select id, name, secret, secret as decrypted_secret from vault.secrets;
    create function vault.create_secret(new_secret text, new_name text default null)
    returns uuid language sql as 'insert into vault.secrets (name, secret) values (new_name, new_secret) returning id';
  end if;
end
$vault$;

-- Ana (Admin) e Bruno (Membro) do Norte; o Sul não tem chave própria.
insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
                        created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
                        is_sso_user, is_anonymous)
values
  ('59000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'ana@norte.test', '', now(), now(), now(), '{}', '{}', false, false),
  ('59000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'bruno@norte.test', '', now(), now(), now(), '{}', '{}', false, false);
insert into public.workspaces (id, kind, name) values
  ('f9000000-0000-0000-0000-000000000001', 'empresa', 'Norte'),
  ('f9000000-0000-0000-0000-000000000002', 'empresa', 'Sul');
select pg_temp.semear_agentes_padrao(w.id) from public.workspaces w;
insert into private.workspace_contracts (workspace_id, tier_id, starts_at) select w.id, 'escala', date_trunc('month', now()) from public.workspaces w on conflict (workspace_id) do nothing; -- contrato de teste (acesso-e-planos)
insert into public.workspace_memberships (workspace_id, user_id, role, active) values
  ('f9000000-0000-0000-0000-000000000001', '59000000-0000-0000-0000-000000000001', 'admin', true),
  ('f9000000-0000-0000-0000-000000000001', '59000000-0000-0000-0000-000000000002', 'member', true),
  ('f9000000-0000-0000-0000-000000000002', '59000000-0000-0000-0000-000000000001', 'admin', true);

create temporary table r (k text primary key, id uuid) on commit drop;

-- Uma Execução de cada Workspace, com o Scopus, um dos Agentes que o banco cria com o Workspace.
create function pg_temp.agente(p_workspace text) returns uuid language sql as $$
  select id from private.agents where workspace_id = p_workspace::uuid and specialty = 'scopus'
$$;
insert into private.agent_conversations (id, workspace_id, owner_id, kind) values
  ('c9000000-0000-0000-0000-000000000001', 'f9000000-0000-0000-0000-000000000001', '59000000-0000-0000-0000-000000000001', 'coordenada'),
  ('c9000000-0000-0000-0000-000000000002', 'f9000000-0000-0000-0000-000000000002', '59000000-0000-0000-0000-000000000001', 'coordenada');
insert into private.agent_runs (id, workspace_id, conversation_id, requested_by, client_request_id, request_text) values
  ('a9000000-0000-0000-0000-000000000001', 'f9000000-0000-0000-0000-000000000001', 'c9000000-0000-0000-0000-000000000001', '59000000-0000-0000-0000-000000000001', gen_random_uuid(), 'Quem são os melhores alvos?'),
  ('a9000000-0000-0000-0000-000000000002', 'f9000000-0000-0000-0000-000000000002', 'c9000000-0000-0000-0000-000000000002', '59000000-0000-0000-0000-000000000001', gen_random_uuid(), 'Resuma a Alfa');

-- 1. A chave do cliente mora no Vault; o banco guarda só o nome do segredo. Só o servidor liga a chave ao Workspace.
select ok(
  not has_table_privilege('service_role', 'private.workspace_ai_keys', 'select')
    and not has_table_privilege('authenticated', 'private.workspace_ai_keys', 'select')
    and not has_function_privilege('authenticated', 'public.set_workspace_ai_key(uuid, text, text, text)', 'execute')
    and not has_function_privilege('authenticated', 'public.agent_run_ai_key(uuid)', 'execute')
    and not has_function_privilege('anon', 'public.agent_run_ai_key(uuid)', 'execute')
    and has_function_privilege('service_role', 'public.set_workspace_ai_key(uuid, text, text, text)', 'execute')
    and has_function_privilege('service_role', 'public.agent_run_ai_key(uuid)', 'execute'),
  'a tabela não se lê por fora, e ligar e ler a chave é só do servidor'
);
select throws_ok(
  $$select public.set_workspace_ai_key('f9000000-0000-0000-0000-000000000001', 'anthropic', 'claude-opus-5-5', 'segredo-que-nao-existe')$$,
  'P0002', 'vault secret not found', 'ligar um segredo que não está no Vault é recusado'
);
select vault.create_secret('sk-ant-CHAVE-DO-CLIENTE-NORTE', 'ia-cliente-norte');
select throws_ok(
  $$select public.set_workspace_ai_key('f9000000-0000-0000-0000-000000000001', 'openai', 'gpt', 'ia-cliente-norte')$$,
  '22023', 'unsupported ai provider', 'só há suporte ao provedor Anthropic por enquanto'
);
select throws_ok(
  $$select public.set_workspace_ai_key('f9000000-0000-0000-0000-000000000001', 'anthropic', '  ', 'ia-cliente-norte')$$,
  '22023', 'model is required', 'o modelo é obrigatório'
);
select throws_ok(
  $$select public.set_workspace_ai_key('f9000000-0000-0000-0000-0000000000ff', 'anthropic', 'claude-opus-5-5', 'ia-cliente-norte')$$,
  'P0002', 'workspace not found', 'o Workspace tem de existir'
);

-- 2. Sem chave própria, a Execução usa o modelo da Althius: a função não devolve nada.
select is(
  (select count(*)::integer from public.agent_run_ai_key('a9000000-0000-0000-0000-000000000001')), 0,
  'sem chave ligada, não há chave a usar'
);

-- 3. Com a chave ligada, o servidor recebe o provedor, o modelo e a chave; o banco só guardou o nome do segredo.
select lives_ok(
  $$select public.set_workspace_ai_key('f9000000-0000-0000-0000-000000000001', 'anthropic', 'claude-opus-5-5', 'ia-cliente-norte')$$,
  'ligar o segredo do Vault ao Norte'
);
select is(
  (select row(provider, model, api_key)::text from public.agent_run_ai_key('a9000000-0000-0000-0000-000000000001')),
  '(anthropic,claude-opus-5-5,sk-ant-CHAVE-DO-CLIENTE-NORTE)', 'a Execução do Norte recebe a chave e o modelo do cliente'
);
select is(
  (select count(*)::integer from public.agent_run_ai_key('a9000000-0000-0000-0000-000000000002')), 0,
  'e a do Sul, sem chave, continua no modelo da Althius'
);
select is(
  (select to_jsonb(k)::text like '%CHAVE-DO-CLIENTE%' from private.workspace_ai_keys k),
  false, 'o banco não guarda a chave, só o nome do segredo'
);
select throws_ok(
  $$select public.agent_run_ai_key('00000000-0000-0000-0000-000000000000')$$,
  'P0002', 'agent run not found', 'a Execução tem de existir'
);

select is(
  (select array_agg(public.agent_run_uses_own_ai_key(id) order by workspace_id) from private.agent_runs),
  array[true, false], 'quem só precisa saber se há chave (o worker do Hermes) recebe um sim ou não, sem a chave'
);
select ok(
  not has_function_privilege('authenticated', 'public.agent_run_uses_own_ai_key(uuid)', 'execute')
    and has_function_privilege('service_role', 'public.agent_run_uses_own_ai_key(uuid)', 'execute'),
  'e é só do servidor'
);

-- 4. Ligar de novo troca o modelo e o segredo; o segredo que sumiu do Vault falha com motivo, sem cair no modelo da Althius.
select public.set_workspace_ai_key('f9000000-0000-0000-0000-000000000001', 'anthropic', 'claude-sonnet-5-5', 'ia-cliente-norte');
select is(
  (select model from public.agent_run_ai_key('a9000000-0000-0000-0000-000000000001')), 'claude-sonnet-5-5',
  'ligar de novo troca o modelo'
);
delete from vault.secrets where name = 'ia-cliente-norte';
select throws_ok(
  $$select * from public.agent_run_ai_key('a9000000-0000-0000-0000-000000000001')$$,
  '55000', 'workspace ai key unavailable', 'o segredo que sumiu do Vault falha com motivo, em vez de cair no modelo da Althius'
);
select vault.create_secret('   ', 'ia-cliente-norte');
select throws_ok(
  $$select * from public.agent_run_ai_key('a9000000-0000-0000-0000-000000000001')$$,
  '55000', 'workspace ai key unavailable', 'e o segredo vazio também'
);
delete from vault.secrets where name = 'ia-cliente-norte';
select vault.create_secret('sk-ant-CHAVE-DO-CLIENTE-NORTE', 'ia-cliente-norte');

-- 5. Com a chave do cliente, a rodada de um Agente custa 20% do normal (ADR-0019); sem, o valor cheio.
select public.grant_credits('f9000000-0000-0000-0000-000000000001', 10, 'plano');
select public.grant_credits('f9000000-0000-0000-0000-000000000002', 10, 'plano');
select public.set_credits_enforced('f9000000-0000-0000-0000-000000000001', true);
select public.set_credits_enforced('f9000000-0000-0000-0000-000000000002', true);
insert into r select 'norte', reservation_id
from public.begin_agent_round('a9000000-0000-0000-0000-000000000001', pg_temp.agente('f9000000-0000-0000-0000-000000000001'), 1);
insert into r select 'sul', reservation_id
from public.begin_agent_round('a9000000-0000-0000-0000-000000000002', pg_temp.agente('f9000000-0000-0000-0000-000000000002'), 1);
select is(
  (select amount from private.credit_reservations where id = (select id from r where k = 'norte')), 0.20::numeric,
  'a rodada do Norte, com a chave do cliente, reserva 0,20 crédito'
);
select is(
  (select amount from private.credit_reservations where id = (select id from r where k = 'sul')), 1.00::numeric,
  'a rodada do Sul, sem chave, reserva 1 crédito'
);

-- 6. Tirar a chave devolve o Workspace ao modelo e ao preço da Althius.
select public.remove_workspace_ai_key('f9000000-0000-0000-0000-000000000001');
select is(
  (select count(*)::integer from public.agent_run_ai_key('a9000000-0000-0000-0000-000000000001')), 0,
  'sem a chave, a Execução volta ao modelo da Althius'
);
insert into r select 'norte2', reservation_id
from public.begin_agent_round('a9000000-0000-0000-0000-000000000001', pg_temp.agente('f9000000-0000-0000-0000-000000000001'), 2);
select is(
  (select amount from private.credit_reservations where id = (select id from r where k = 'norte2')), 1.00::numeric,
  'e a rodada seguinte volta a custar 1 crédito'
);
select is(
  (select amount from private.credit_reservations where id = (select id from r where k = 'norte')), 0.20::numeric,
  'a rodada já reservada com a chave do cliente não muda de preço'
);

select * from finish();
rollback;
