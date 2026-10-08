begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(10);

-- O custo das Propostas de resposta (creditos-e-planos, ticket 01): cada chamada ao modelo grava o modelo e os tokens,
-- pela reserva do trabalho, e o relatório mensal do Administrador mostra a linha delas.
-- Ana é a titular e Administradora do Norte; Carla é Administradora do Sul.
insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
                        created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
                        is_sso_user, is_anonymous)
values
  ('6a000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'ana@norte.test', '', now(), now(), now(), '{}', '{}', false, false),
  ('6a000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'carla@sul.test', '', now(), now(), now(), '{}', '{}', false, false);
insert into public.workspaces (id, kind, name) values
  ('6b000000-0000-0000-0000-000000000001', 'empresa', 'Norte'),
  ('6b000000-0000-0000-0000-000000000002', 'empresa', 'Sul');
insert into public.workspace_memberships (workspace_id, user_id, role, active) values
  ('6b000000-0000-0000-0000-000000000001', '6a000000-0000-0000-0000-000000000001', 'admin', true),
  ('6b000000-0000-0000-0000-000000000002', '6a000000-0000-0000-0000-000000000002', 'admin', true);

-- Um preço de TESTE (não é preço de nenhum provedor) para provar a estimativa.
insert into private.model_prices (model, input_usd_per_million, output_usd_per_million)
values ('claude-teste-de-custo', 3, 15);

create temporary table ids (chave text primary key, valor uuid) on commit drop;
grant all on ids to authenticated, service_role;
create function pg_temp.i(p_chave text) returns uuid language sql as $f$ select valor from pg_temp.ids where chave = p_chave $f$;
grant execute on function pg_temp.i(text) to authenticated, service_role;

-- Ana prepara a Sequência real: Conta-alvo, Contato e Sequência.
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '6a000000-0000-0000-0000-000000000001', true);
insert into ids select 'conta', id from public.save_target_account(
  '6b000000-0000-0000-0000-000000000001', 'Empresa Alvo', 'https://empresa-alvo.test');
insert into ids select 'maria', id from public.create_contact(
  pg_temp.i('conta'), 'Maria Souza', 'Diretora', 'maria@empresa-alvo.test');
insert into ids select 'sequencia', id from public.create_sequence(
  '6b000000-0000-0000-0000-000000000001',
  pg_temp.i('conta')::text,
  jsonb_build_object('participantesIds', jsonb_build_array(pg_temp.i('maria')::text),
    'steps', jsonb_build_array(
      jsonb_build_object('id', 'passo-1', 'ordem', 1, 'canal', 'email', 'contatoId', pg_temp.i('maria')::text,
        'delayDiasUteis', 0, 'titulo', 'Abertura', 'assunto', 'Apresentação', 'corpo', 'Olá, Maria.'))),
  '{}'::jsonb);
reset role;

-- A resposta da Maria (a Interação pública) e a proposta dela, pela entrada comum dos canais.
with interacao as (
  insert into public.account_interactions (workspace_id, target_account_id, contact_id, kind, recorded_by)
  values ('6b000000-0000-0000-0000-000000000001', pg_temp.i('conta'), pg_temp.i('maria'), 'email-recebido',
    '6a000000-0000-0000-0000-000000000001')
  returning id
)
insert into ids select 'interacao', id from interacao;
insert into ids select 'proposta', private.enqueue_reply_proposal(
  '6b000000-0000-0000-0000-000000000001', pg_temp.i('sequencia'), pg_temp.i('conta'), pg_temp.i('maria'),
  '6a000000-0000-0000-0000-000000000001', null, 'email', pg_temp.i('interacao'), 'thread-1',
  'maria@empresa-alvo.test', 'Maria', null, 'Apresentação');

-- O servidor reserva o trabalho: o token da reserva é o que autoriza gravar o resultado e o custo.
create temporary table reserva on commit drop as select * from public.claim_reply_proposal_jobs(5);
grant select on reserva to authenticated, service_role;

-- 1. Gravar: só o servidor, com a reserva, e sem repetir a mesma chamada.
set local role service_role;
select lives_ok(
  $$select public.record_reply_proposal_cost((select job_id from reserva), (select claim_token from reserva),
    'claude-teste-de-custo', 1200, 300)$$,
  'a geração grava o modelo e os tokens da chamada');
select lives_ok(
  $$select public.record_reply_proposal_cost((select job_id from reserva), (select claim_token from reserva),
    'claude-teste-de-custo', 1200, 300)$$,
  'repetir o registro da mesma chamada não falha');
select throws_ok(
  $$select public.record_reply_proposal_cost((select job_id from reserva), gen_random_uuid(), 'claude-teste-de-custo', 1, 1)$$,
  '55000', 'the reply proposal job is not running for this claim',
  'sem a reserva do trabalho, o custo é recusado');
select throws_ok(
  $$select public.record_reply_proposal_cost((select job_id from reserva), (select claim_token from reserva),
    'claude-teste-de-custo', -1, 300)$$,
  '22023', 'invalid token count', 'um número de tokens negativo é recusado');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '6a000000-0000-0000-0000-000000000001', true);
select throws_ok(
  $$select public.record_reply_proposal_cost((select job_id from reserva), (select claim_token from reserva),
    'claude-teste-de-custo', 1, 1)$$,
  '42501', null, 'o app não grava custo, nem a titular');
reset role;

-- 2. A titular pede outra versão: a nova chamada é outro custo, não a repetição do primeiro.
set local role service_role;
select public.save_generated_reply((select job_id from reserva), (select claim_token from reserva), 'Olá, Maria!',
  'claude-teste-de-custo');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '6a000000-0000-0000-0000-000000000001', true);
select public.request_reply_proposal_again(pg_temp.i('proposta'));
reset role;
create temporary table segunda on commit drop as select * from public.claim_reply_proposal_jobs(5);
grant select on segunda to authenticated, service_role;
set local role service_role;
select lives_ok(
  $$select public.record_reply_proposal_cost((select job_id from segunda), (select claim_token from segunda),
    'claude-teste-de-custo', 800, 200)$$,
  'gerar de novo grava o custo da nova chamada');
reset role;

-- 3. O relatório do mês: uma linha das Propostas de resposta, com as duas chamadas e a estimativa pelo preço do modelo.
set local role authenticated;
select set_config('request.jwt.claim.sub', '6a000000-0000-0000-0000-000000000001', true);
select is(
  (select row(provider, model_or_actor, actions, input_units, output_units)::text
   from public.get_cost_report('6b000000-0000-0000-0000-000000000001') where action_type = 'reply_proposal'),
  '(anthropic,claude-teste-de-custo,2,2000,500)',
  'o relatório mostra as Propostas de resposta numa linha, com as duas chamadas e os tokens somados');
-- 2000 × 3 / 1.000.000 + 500 × 15 / 1.000.000 = 0,006 + 0,0075.
select is(
  (select estimated_cost_usd::numeric(14, 6)
   from public.get_cost_report('6b000000-0000-0000-0000-000000000001') where action_type = 'reply_proposal'),
  0.0135::numeric(14, 6),
  'com o preço do modelo, o relatório estima o custo das Propostas de resposta');
select set_config('request.jwt.claim.sub', '6a000000-0000-0000-0000-000000000002', true);
select is(
  (select count(*)::int from public.get_cost_report('6b000000-0000-0000-0000-000000000002')),
  0,
  'o Sul não vê o custo das propostas do Norte');
reset role;

-- 4. Sem dado pessoal: o registro não leva o texto, o Contato nem o token da reserva.
select is(
  (select count(*)::int from private.action_costs c
   where c.action_type = 'reply_proposal'
     and (c.source_ref like '%' || (select claim_token::text from reserva) || '%'
       or c.source_ref like '%' || (select claim_token::text from segunda) || '%'
       or c.source_ref ilike '%maria%' or c.model_or_actor ilike '%maria%')),
  0,
  'o custo das propostas não guarda o token da reserva nem dado do Contato');

select * from finish();
rollback;
