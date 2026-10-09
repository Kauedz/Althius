begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(31);

-- O teto das Propostas de resposta e os escopos sem executor (creditos-e-planos, ticket 03, decisão 6 do Renan em
-- 08/10/2026). A primeira geração de uma proposta é automática: só roda com Execuções de Agentes e o Rhetor em
-- automático, cada um com teto, e soma o crédito da rodada aos dois. Gerar de novo é o clique do titular, que vale como
-- confirmação e não passa pelo teto. Os escopos que ninguém executa (Enriquecimento, Integrações e os outros Agentes)
-- ficam em confirmar: o banco recusa ligar o automático deles.
-- Ana é a titular e Administradora do Norte; Bruno é Membro do Norte; Carla é Administradora do Sul.
insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
                        created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
                        is_sso_user, is_anonymous)
values
  ('6c000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'ana@norte.test', '', now(), now(), now(), '{}', '{}', false, false),
  ('6c000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'bruno@norte.test', '', now(), now(), now(), '{}', '{}', false, false),
  ('6c000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'carla@sul.test', '', now(), now(), now(), '{}', '{}', false, false);
insert into public.workspaces (id, kind, name) values
  ('6d000000-0000-0000-0000-000000000001', 'empresa', 'Norte'),
  ('6d000000-0000-0000-0000-000000000002', 'empresa', 'Sul');
insert into public.workspace_memberships (workspace_id, user_id, role, active) values
  ('6d000000-0000-0000-0000-000000000001', '6c000000-0000-0000-0000-000000000001', 'admin', true),
  ('6d000000-0000-0000-0000-000000000001', '6c000000-0000-0000-0000-000000000002', 'member', true),
  ('6d000000-0000-0000-0000-000000000002', '6c000000-0000-0000-0000-000000000003', 'admin', true);

create temporary table ids (chave text primary key, valor uuid) on commit drop;
grant all on ids to authenticated, service_role;
create function pg_temp.i(p_chave text) returns uuid language sql as $f$ select valor from pg_temp.ids where chave = p_chave $f$;
grant execute on function pg_temp.i(text) to authenticated, service_role;
insert into ids select 'rhetor', a.id from private.agents a
where a.workspace_id = '6d000000-0000-0000-0000-000000000001' and a.specialty = 'rhetor' and a.kind = 'padrao';
insert into ids select 'scopus', a.id from private.agents a
where a.workspace_id = '6d000000-0000-0000-0000-000000000001' and a.specialty = 'scopus' and a.kind = 'padrao';

-- O que o automático já gastou no mês, por escopo.
create function pg_temp.gasto(p_scope text) returns numeric language sql as $f$
  select coalesce((select g.spent from private.automation_spend g
    where g.workspace_id = '6d000000-0000-0000-0000-000000000001' and g.scope = p_scope
      and g.month = date_trunc('month', now())::date), 0)
$f$;

-- Ana prepara a Sequência real: Conta-alvo, Contato e Sequência.
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '6c000000-0000-0000-0000-000000000001', true);
insert into ids select 'conta', id from public.save_target_account(
  '6d000000-0000-0000-0000-000000000001', 'Empresa Alvo', 'https://empresa-alvo.test');
insert into ids select 'maria', id from public.create_contact(
  pg_temp.i('conta'), 'Maria Souza', 'Diretora', 'maria@empresa-alvo.test');
insert into ids select 'sequencia', id from public.create_sequence(
  '6d000000-0000-0000-0000-000000000001',
  pg_temp.i('conta')::text,
  jsonb_build_object('participantesIds', jsonb_build_array(pg_temp.i('maria')::text),
    'steps', jsonb_build_array(
      jsonb_build_object('id', 'passo-1', 'ordem', 1, 'canal', 'email', 'contatoId', pg_temp.i('maria')::text,
        'delayDiasUteis', 0, 'titulo', 'Abertura', 'assunto', 'Apresentação', 'corpo', 'Olá, Maria.'))),
  '{}'::jsonb);
reset role;

-- Uma resposta da Maria, cada uma numa conversa, vira uma proposta pela entrada comum dos canais.
create function pg_temp.resposta(p_chave text) returns uuid language plpgsql as $f$
declare
  v_interacao uuid;
  v_proposta uuid;
begin
  insert into public.account_interactions (workspace_id, target_account_id, contact_id, kind, recorded_by)
  values ('6d000000-0000-0000-0000-000000000001', pg_temp.i('conta'), pg_temp.i('maria'), 'email-recebido',
    '6c000000-0000-0000-0000-000000000001')
  returning id into v_interacao;
  v_proposta := private.enqueue_reply_proposal(
    '6d000000-0000-0000-0000-000000000001', pg_temp.i('sequencia'), pg_temp.i('conta'), pg_temp.i('maria'),
    '6c000000-0000-0000-0000-000000000001', null, 'email', v_interacao, 'conversa-' || p_chave,
    'maria@empresa-alvo.test', 'Maria', null, 'Apresentação');
  insert into pg_temp.ids values (p_chave, v_proposta);
  return v_proposta;
end;
$f$;

select pg_temp.resposta('p1');
create temporary table j1 on commit drop as select * from public.claim_reply_proposal_jobs(5);
grant select on j1 to service_role;

-- 1. Só o servidor consulta e devolve o teto das propostas.
select ok(
  not has_function_privilege('authenticated', 'public.consume_reply_proposal_cap(uuid, uuid)', 'execute')
    and not has_function_privilege('authenticated', 'public.refund_reply_proposal_cap(uuid, uuid)', 'execute')
    and has_function_privilege('service_role', 'public.consume_reply_proposal_cap(uuid, uuid)', 'execute')
    and has_function_privilege('service_role', 'public.refund_reply_proposal_cap(uuid, uuid)', 'execute'),
  'consultar e devolver o teto das propostas é só do servidor');

-- 2. No padrão (confirmar), a primeira geração não roda sozinha e nada é somado.
set local role service_role;
select is(public.consume_reply_proposal_cap((select job_id from j1), (select claim_token from j1)), 'confirmar',
  'em confirmar, a proposta não é gerada sozinha');
select throws_ok(
  $$select public.consume_reply_proposal_cap((select job_id from j1), gen_random_uuid())$$,
  '55000', 'the reply proposal job is not running for this claim', 'sem a reserva do trabalho, o teto não é consultado');
reset role;
select is((select count(*)::int from private.automation_spend where workspace_id = '6d000000-0000-0000-0000-000000000001'), 0,
  'e nada é somado aos tetos');

-- 3. Quais escopos rodam sozinhos: a varredura, as Execuções de Agentes e o Rhetor. Os outros ficam em confirmar.
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '6c000000-0000-0000-0000-000000000002', true);
select is(
  (select array_agg(scope order by scope) from public.list_runnable_automation_scopes('6d000000-0000-0000-0000-000000000001')),
  array['acao:agentes', 'acao:varredura', 'agente:' || pg_temp.i('rhetor')::text],
  'o Membro lê que só a varredura, as Execuções de Agentes e o Rhetor rodam sozinhos');
select set_config('request.jwt.claim.sub', '6c000000-0000-0000-0000-000000000003', true);
select throws_ok(
  $$select * from public.list_runnable_automation_scopes('6d000000-0000-0000-0000-000000000001')$$,
  '42501', 'active workspace membership required', 'quem é de outro Workspace não lê');

select set_config('request.jwt.claim.sub', '6c000000-0000-0000-0000-000000000001', true);
select throws_ok(
  $$select public.save_automation_setting('6d000000-0000-0000-0000-000000000001', 'acao:enriquecimento', 'automatico', 10)$$,
  '22023', 'automatic mode is not available for this scope yet', 'o automático do Enriquecimento é recusado');
select throws_ok(
  $$select public.save_automation_setting('6d000000-0000-0000-0000-000000000001', 'integracao:hubspot', 'automatico', 10)$$,
  '22023', 'automatic mode is not available for this scope yet', 'o de uma Integração também');
select throws_ok(
  format($$select public.save_automation_setting('6d000000-0000-0000-0000-000000000001', %L, 'automatico', 10)$$,
    'agente:' || pg_temp.i('scopus')::text),
  '22023', 'automatic mode is not available for this scope yet', 'e o de um Agente que não é o Rhetor');
select lives_ok(
  $$select public.save_automation_setting('6d000000-0000-0000-0000-000000000001', 'acao:enriquecimento', 'confirmar', 10)$$,
  'confirmar continua valendo para qualquer escopo');

-- 4. Os dois precisam liberar: com Execuções de Agentes em automático e o Rhetor em confirmar, nada roda nem soma.
select public.save_automation_setting('6d000000-0000-0000-0000-000000000001', 'acao:agentes', 'automatico', 2);
reset role;
set local role service_role;
select is(public.consume_reply_proposal_cap((select job_id from j1), (select claim_token from j1)), 'confirmar',
  'com o Rhetor em confirmar, a proposta não roda sozinha');
reset role;
select is(pg_temp.gasto('acao:agentes'), 0::numeric, 'e as Execuções de Agentes não somam a rodada que não rodou');

set local role authenticated;
select set_config('request.jwt.claim.sub', '6c000000-0000-0000-0000-000000000001', true);
select public.save_automation_setting('6d000000-0000-0000-0000-000000000001', 'agente:' || pg_temp.i('rhetor')::text,
  'automatico', 5);
reset role;
set local role service_role;
select is(public.consume_reply_proposal_cap((select job_id from j1), (select claim_token from j1)), 'ok',
  'com os dois em automático e com teto, a proposta roda');
select is(public.consume_reply_proposal_cap((select job_id from j1), (select claim_token from j1)), 'ok',
  'consultar de novo no mesmo trabalho também libera');
reset role;
select is(row(pg_temp.gasto('acao:agentes'), pg_temp.gasto('agente:' || pg_temp.i('rhetor')::text))::text, '(1.00,1.00)',
  'a rodada soma 1 crédito a cada teto, uma vez só');

-- 5. A geração que falhou devolve o que somou; a próxima tentativa soma de novo.
set local role service_role;
select public.refund_reply_proposal_cap((select job_id from j1), (select claim_token from j1));
reset role;
select is(row(pg_temp.gasto('acao:agentes'), pg_temp.gasto('agente:' || pg_temp.i('rhetor')::text))::text, '(0.00,0.00)',
  'a falha devolve o crédito aos dois tetos');
set local role service_role;
select public.consume_reply_proposal_cap((select job_id from j1), (select claim_token from j1));
reset role;
select is(pg_temp.gasto('acao:agentes'), 1::numeric, 'e a nova tentativa soma de novo');

-- 6. Chegou no teto: pausa, avisa os Administradores uma vez, e a próxima proposta não roda sozinha.
select pg_temp.resposta('p2');
create temporary table j2 on commit drop as select * from public.claim_reply_proposal_jobs(5);
grant select on j2 to service_role;
set local role service_role;
select is(public.consume_reply_proposal_cap((select job_id from j2), (select claim_token from j2)), 'ok',
  'a segunda proposta chega exatamente no teto e roda');
reset role;
select pg_temp.resposta('p3');
create temporary table j3 on commit drop as select * from public.claim_reply_proposal_jobs(5);
grant select on j3 to service_role;
set local role service_role;
select is(public.consume_reply_proposal_cap((select job_id from j3), (select claim_token from j3)), 'teto_atingido',
  'a terceira encontra o teto atingido e não roda');
reset role;
select is(
  (select string_agg(title, ' | ') from private.workspace_notices where workspace_id = '6d000000-0000-0000-0000-000000000001'),
  'Teto mensal atingido: Execuções de Agentes', 'o Aviso do teto sai uma vez só');
select is(pg_temp.gasto('agente:' || pg_temp.i('rhetor')::text), 2::numeric,
  'e o Rhetor não soma a proposta que o outro teto barrou');

-- 7. O titular pede a resposta: o clique é a confirmação e não passa pelo teto, nem soma, nem devolve.
set local role service_role;
select public.fail_reply_proposal_job((select job_id from j3), (select claim_token from j3), 'automation_cap_reached', false);
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '6c000000-0000-0000-0000-000000000001', true);
select public.request_reply_proposal_again(pg_temp.i('p3'));
reset role;
create temporary table j3b on commit drop as select * from public.claim_reply_proposal_jobs(5);
grant select on j3b to service_role;
set local role service_role;
select is(public.consume_reply_proposal_cap((select job_id from j3b), (select claim_token from j3b)), 'ok',
  'gerar de novo é o clique do titular e roda mesmo com o teto atingido');
select public.refund_reply_proposal_cap((select job_id from j3b), (select claim_token from j3b));
reset role;
select is(row(pg_temp.gasto('acao:agentes'), pg_temp.gasto('agente:' || pg_temp.i('rhetor')::text))::text, '(2.00,2.00)',
  'e não soma nem devolve nada aos tetos');

-- 8. A rodada que não cabe no teto do Rhetor: só ele pausa e avisa. As Execuções de Agentes, que com ela chegariam
-- exatamente no teto delas, não somam, não pausam e não avisam.
set local role authenticated;
select set_config('request.jwt.claim.sub', '6c000000-0000-0000-0000-000000000001', true);
select public.save_automation_setting('6d000000-0000-0000-0000-000000000001', 'acao:agentes', 'automatico', 3);
select public.save_automation_setting('6d000000-0000-0000-0000-000000000001', 'agente:' || pg_temp.i('rhetor')::text,
  'automatico', 2.5);
reset role;
select pg_temp.resposta('p4');
create temporary table j4 on commit drop as select * from public.claim_reply_proposal_jobs(5);
grant select on j4 to service_role;
set local role service_role;
select is(public.consume_reply_proposal_cap((select job_id from j4), (select claim_token from j4)), 'teto_atingido',
  'a rodada que passaria do teto do Rhetor não roda');
reset role;
select is(pg_temp.gasto('acao:agentes'), 2::numeric, 'e as Execuções de Agentes não somam a rodada que o Rhetor barrou');
select is(
  (select count(*)::int from private.workspace_notices
   where workspace_id = '6d000000-0000-0000-0000-000000000001' and title = 'Teto mensal atingido: Rhetor'),
  1, 'o Rhetor pausa e avisa os Administradores');
select is(
  (select row(c.paused_at is null, (select count(*) from private.workspace_notices n
     where n.workspace_id = c.workspace_id and n.title = 'Teto mensal atingido: Execuções de Agentes'))::text
   from private.automation_settings c
   where c.workspace_id = '6d000000-0000-0000-0000-000000000001' and c.scope = 'acao:agentes'),
  '(t,1)', 'e as Execuções de Agentes não pausam nem avisam de novo');

-- 9. Um escopo em confirmar barra antes de outro, sem espaço, pausar e avisar por uma rodada que nunca rodaria.
set local role authenticated;
select set_config('request.jwt.claim.sub', '6c000000-0000-0000-0000-000000000001', true);
select public.save_automation_setting('6d000000-0000-0000-0000-000000000001', 'acao:agentes', 'automatico', 2.5);
select public.save_automation_setting('6d000000-0000-0000-0000-000000000001', 'agente:' || pg_temp.i('rhetor')::text,
  'confirmar', 2.5);
reset role;
select pg_temp.resposta('p5');
create temporary table j5 on commit drop as select * from public.claim_reply_proposal_jobs(5);
grant select on j5 to service_role;
set local role service_role;
select is(public.consume_reply_proposal_cap((select job_id from j5), (select claim_token from j5)), 'confirmar',
  'com o Rhetor em confirmar, o motivo é confirmar, mesmo sem espaço nas Execuções de Agentes');
reset role;
select is(
  (select row(c.paused_at is null, (select count(*) from private.workspace_notices n
     where n.workspace_id = c.workspace_id and n.title = 'Teto mensal atingido: Execuções de Agentes'))::text
   from private.automation_settings c
   where c.workspace_id = '6d000000-0000-0000-0000-000000000001' and c.scope = 'acao:agentes'),
  '(t,1)', 'e as Execuções de Agentes não pausam nem avisam por ela');

-- 10. Com a chave de IA do próprio cliente, a rodada custa 20% e é isso que soma ao teto.
set local role authenticated;
select set_config('request.jwt.claim.sub', '6c000000-0000-0000-0000-000000000001', true);
select public.save_automation_setting('6d000000-0000-0000-0000-000000000001', 'acao:agentes', 'automatico', 10);
select public.save_automation_setting('6d000000-0000-0000-0000-000000000001', 'agente:' || pg_temp.i('rhetor')::text,
  'automatico', 10);
reset role;
insert into private.workspace_ai_keys (workspace_id, provider, model, secret_name)
values ('6d000000-0000-0000-0000-000000000001', 'anthropic', 'claude-do-cliente', 'chave-de-teste');
select pg_temp.resposta('p6');
create temporary table j6 on commit drop as select * from public.claim_reply_proposal_jobs(5);
grant select on j6 to service_role;
set local role service_role;
select is(public.consume_reply_proposal_cap((select job_id from j6), (select claim_token from j6)), 'ok',
  'subir o teto acima do gasto libera de novo');
reset role;
select is(pg_temp.gasto('acao:agentes'), 2.20::numeric, 'com a chave do cliente, a rodada soma 0,2 crédito');

select * from finish();
rollback;
