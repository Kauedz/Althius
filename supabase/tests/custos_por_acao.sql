begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(19);
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


-- Norte: Ana (Administradora) e Bruno (Membro). Sul: Carla (Administradora).
insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
                        created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
                        is_sso_user, is_anonymous)
values
  ('64000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'ana@norte.com.br', '', now(), now(), now(), '{}', '{}', false, false),
  ('64000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'bruno@norte.com.br', '', now(), now(), now(), '{}', '{}', false, false),
  ('64000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'carla@sul.com.br', '', now(), now(), now(), '{}', '{}', false, false);

insert into public.workspaces (id, kind, name) values
  ('aaaaaaaa-4000-0000-0000-000000000001', 'empresa', 'Norte'),
  ('aaaaaaaa-4000-0000-0000-000000000002', 'empresa', 'Sul');
select pg_temp.semear_agentes_padrao(w.id) from public.workspaces w;
insert into private.workspace_contracts (workspace_id, tier_id, starts_at) select w.id, 'escala', date_trunc('month', now()) from public.workspaces w on conflict (workspace_id) do nothing; -- contrato de teste (acesso-e-planos)
select public.grant_credits(w.id, 1000, 'plano', 'saldo de teste') from public.workspaces w where w.id <> 'e0a17e00-0000-4000-8000-000000000001'; -- a rodada de Agente sempre reserva (acesso-e-planos)

insert into public.workspace_memberships (workspace_id, user_id, role, active) values
  ('aaaaaaaa-4000-0000-0000-000000000001', '64000000-0000-0000-0000-000000000001', 'admin', true),
  ('aaaaaaaa-4000-0000-0000-000000000001', '64000000-0000-0000-0000-000000000002', 'member', true),
  ('aaaaaaaa-4000-0000-0000-000000000002', '64000000-0000-0000-0000-000000000003', 'admin', true);

select set_config('t.scopus', (select id::text from private.agents
  where workspace_id = 'aaaaaaaa-4000-0000-0000-000000000001' and name = 'Scopus'), true);

-- Um preço de TESTE (não é preço de nenhum provedor) para provar a estimativa; sem preço, ela fica em branco.
insert into private.model_prices (model, input_usd_per_million, output_usd_per_million)
values ('modelo-de-teste', 3, 15);

create temporary table ids (nome text primary key, id uuid) on commit drop;
grant all on ids to authenticated, service_role;

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '64000000-0000-0000-0000-000000000001', true);
insert into ids select 'run_a', run_id from public.start_agent_run('aaaaaaaa-4000-0000-0000-000000000001',
  null, null, 'Pedido A', '{}', 'c4000000-0000-0000-0000-000000000001');
insert into ids select 'run_b', run_id from public.start_agent_run('aaaaaaaa-4000-0000-0000-000000000001',
  null, null, 'Pedido B', '{}', 'c4000000-0000-0000-0000-000000000002');
insert into ids select 'run_c', run_id from public.start_agent_run('aaaaaaaa-4000-0000-0000-000000000001',
  null, null, 'Pedido C', '{}', 'c4000000-0000-0000-0000-000000000003');
create function pg_temp.id(p text) returns uuid language sql as $f$ select id from ids where nome = p $f$;
grant execute on function pg_temp.id(text) to authenticated, service_role;

-- Uma Execução com uso informado (dois Agentes e a Coordenação), outra sem uso, e uma que não foi reservada.
reset role;
set local role service_role;
select public.claim_agent_run(pg_temp.id('run_a'));
select public.append_agent_run_event(pg_temp.id('run_a'), 'chamada', current_setting('t.scopus')::uuid, '{}');
select public.append_agent_run_event(pg_temp.id('run_a'), 'feito', current_setting('t.scopus')::uuid,
  '{"texto":"ICP.","uso":{"entrada":100,"saida":20}}');
select public.append_agent_run_event(pg_temp.id('run_a'), 'resposta', null,
  '{"texto":"Junto.","uso":{"entrada":10,"saida":5}}');
select public.finish_agent_run(pg_temp.id('run_a'), 'succeeded', null, 'modelo-de-teste');
select public.claim_agent_run(pg_temp.id('run_b'));
select public.append_agent_run_event(pg_temp.id('run_b'), 'resposta', null, '{"texto":"Sem uso informado."}');
select public.finish_agent_run(pg_temp.id('run_b'), 'succeeded', null, 'groq/qwen');

select throws_ok(
  $$select public.record_agent_run_cost(pg_temp.id('run_c'))$$,
  '55000', 'run is not finished', 'uma Execução que ainda não terminou não tem custo fechado');
select throws_ok(
  $$select public.record_agent_run_cost('00000000-0000-0000-0000-000000000000')$$,
  'P0002', 'run not found', 'uma Execução que não existe é recusada');
select lives_ok($$select public.record_agent_run_cost(pg_temp.id('run_a'))$$, 'registra o custo da Execução com uso');
select lives_ok($$select public.record_agent_run_cost(pg_temp.id('run_a'))$$, 'repetir o registro não falha');
select lives_ok($$select public.record_agent_run_cost(pg_temp.id('run_b'))$$, 'registra a Execução sem uso informado');

-- A busca de foto (Apify): um Contato com perfil, a consulta reservada pela Ana e fechada pela função.
reset role;
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '64000000-0000-0000-0000-000000000001', true);
insert into ids select 'alfa', id from public.save_target_account('aaaaaaaa-4000-0000-0000-000000000001', 'Alfa', 'alfa.com.br');
insert into ids select 'maria', id from public.create_contact(
  (select id from ids where nome = 'alfa'), 'Maria Souza', 'CFO', 'maria@alfa.com.br', null,
  'https://www.linkedin.com/in/maria-souza');
insert into ids select 'busca', lookup_id from public.begin_contact_photo_lookup(pg_temp.id('maria'));
reset role;
set local role service_role;
select public.finish_contact_photo_lookup(pg_temp.id('busca'), 'found', 'https://exemplo.com/foto.jpg', null,
  'harvestapi~linkedin-profile-scraper', 'run_apify_1', null);
select lives_ok($$select public.record_apify_lookup_cost(pg_temp.id('busca'), 0.004)$$, 'registra o custo do Apify');
select lives_ok($$select public.record_apify_lookup_cost(pg_temp.id('busca'), 0.004)$$, 'e repetir não duplica');
select throws_ok(
  $$select public.record_apify_lookup_cost('00000000-0000-0000-0000-000000000000', 0.004)$$,
  'P0002', 'lookup not found', 'uma busca que não existe é recusada');
select throws_ok(
  $$select public.record_apify_lookup_cost(pg_temp.id('busca'), -1)$$,
  '22023', 'invalid cost', 'um custo negativo é recusado');

-- Só a função registra; ninguém lê a tabela direto.
reset role;
select is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'private' and c.relname in ('action_costs', 'model_prices') and c.relrowsecurity
      and not has_table_privilege('authenticated', c.oid, 'select') and not has_table_privilege('service_role', c.oid, 'select')),
  2, 'as tabelas de custo têm RLS ligado e nenhum papel do app as lê direto');

-- O relatório do mês: só o Administrador do Workspace lê.
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '64000000-0000-0000-0000-000000000001', true);
select is(
  (select count(*)::int from public.get_cost_report('aaaaaaaa-4000-0000-0000-000000000001')),
  3, 'o relatório tem uma linha por tipo, fornecedor e modelo ou actor');
select is(
  (select jsonb_build_object('acoes', actions, 'entrada', input_units, 'saida', output_units)
   from public.get_cost_report('aaaaaaaa-4000-0000-0000-000000000001') where model_or_actor = 'modelo-de-teste'),
  jsonb_build_object('acoes', 1, 'entrada', 110, 'saida', 25), 'os tokens da Execução somam os eventos, uma vez só');
select is(
  (select estimated_cost_usd from public.get_cost_report('aaaaaaaa-4000-0000-0000-000000000001')
   where model_or_actor = 'modelo-de-teste'),
  0.000705::numeric, 'com preço do modelo, a estimativa sai dos tokens (110 x 3 + 25 x 15, por milhão)');
select is(
  (select estimated_cost_usd from public.get_cost_report('aaaaaaaa-4000-0000-0000-000000000001')
   where model_or_actor = 'groq/qwen'),
  null, 'sem preço do modelo, a estimativa fica em branco: nunca um valor inventado');
select is(
  (select recorded_cost_usd from public.get_cost_report('aaaaaaaa-4000-0000-0000-000000000001')
   where provider = 'apify'),
  0.004000::numeric, 'o custo que o Apify informou aparece como está');
select is(
  (select count(*)::int from public.get_cost_report('aaaaaaaa-4000-0000-0000-000000000001', '2020-01-15')),
  0, 'outro mês não traz o custo deste');
select set_config('request.jwt.claim.sub', '64000000-0000-0000-0000-000000000002', true);
select throws_ok(
  $$select * from public.get_cost_report('aaaaaaaa-4000-0000-0000-000000000001')$$,
  '42501', 'only administrators can read costs', 'o Membro não lê o relatório de custos');
select set_config('request.jwt.claim.sub', '64000000-0000-0000-0000-000000000003', true);
select throws_ok(
  $$select * from public.get_cost_report('aaaaaaaa-4000-0000-0000-000000000001')$$,
  '42501', 'active workspace membership required', 'a Carla, do Sul, não lê nada do Norte');
select throws_ok(
  $$select public.record_agent_run_cost(pg_temp.id('run_a'))$$,
  '42501', null, 'a Conta de usuário não registra custo: só a função');

select * from finish();
rollback;
