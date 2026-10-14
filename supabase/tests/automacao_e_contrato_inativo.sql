begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(55);

-- Automação e contrato inativo: sem contrato ativo, Monitoramento, cascata, Rotina e Sequência não rodam
-- (motivo contrato_inativo) e nada é apagado. A Equipe, ilimitada, roda. A renovação despausa e avisa.
-- Inativo: suspenso. Sem: nenhuma linha de contrato. Futuro: ativo com início no futuro (ainda roda).
-- Encerrado: status encerrado. Renova: aniversário há 45 dias, com pausa por teto. Limite: Administrador ajusta o mês.

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
                        created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
                        is_sso_user, is_anonymous)
values
  ('a1100000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'ana-inativo@cliente.test', '', now(), now(), now(), '{}', '{}', false, false),
  ('a1100000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'bia-sem@cliente.test', '', now(), now(), now(), '{}', '{}', false, false),
  ('a1100000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'caio-renova@cliente.test', '', now(), now(), now(), '{}', '{}', false, false),
  ('a1100000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'dora-limite@cliente.test', '', now(), now(), now(), '{}', '{}', false, false),
  ('a1100000-0000-4000-8000-000000000005', 'authenticated', 'authenticated', 'edu-membro@cliente.test', '', now(), now(), now(), '{}', '{}', false, false),
  ('a1100000-0000-4000-8000-000000000006', 'authenticated', 'authenticated', 'fabi-equipe@althius.test', '', now(), now(), now(), '{}', '{}', false, false);

insert into public.workspaces (id, kind, name) values
  ('c1100000-0000-4000-8000-000000000001', 'empresa', 'Inativo'),
  ('c1100000-0000-4000-8000-000000000002', 'empresa', 'Sem contrato'),
  ('c1100000-0000-4000-8000-000000000003', 'empresa', 'Renova'),
  ('c1100000-0000-4000-8000-000000000004', 'empresa', 'Limite'),
  ('c1100000-0000-4000-8000-000000000005', 'empresa', 'Futuro'),
  ('c1100000-0000-4000-8000-000000000006', 'empresa', 'Encerrado');

insert into private.workspace_contracts (workspace_id, tier_id, status, starts_at) values
  ('c1100000-0000-4000-8000-000000000001', 'essencial', 'suspenso', date_trunc('month', now())),
  ('c1100000-0000-4000-8000-000000000003', 'essencial', 'ativo', now() - interval '45 days'),
  ('c1100000-0000-4000-8000-000000000004', 'essencial', 'ativo', date_trunc('month', now())),
  ('c1100000-0000-4000-8000-000000000005', 'essencial', 'ativo', now() + interval '10 days'),
  ('c1100000-0000-4000-8000-000000000006', 'essencial', 'encerrado', date_trunc('month', now()));

insert into public.workspace_memberships (workspace_id, user_id, role, active) values
  ('c1100000-0000-4000-8000-000000000001', 'a1100000-0000-4000-8000-000000000001', 'admin', true),
  ('c1100000-0000-4000-8000-000000000002', 'a1100000-0000-4000-8000-000000000002', 'admin', true),
  ('c1100000-0000-4000-8000-000000000003', 'a1100000-0000-4000-8000-000000000003', 'admin', true),
  ('c1100000-0000-4000-8000-000000000004', 'a1100000-0000-4000-8000-000000000004', 'admin', true),
  ('c1100000-0000-4000-8000-000000000004', 'a1100000-0000-4000-8000-000000000005', 'member', true),
  ('e0a17e00-0000-4000-8000-000000000001', 'a1100000-0000-4000-8000-000000000006', 'admin', true);

insert into public.target_accounts (id, workspace_id, name, canonical_url, domain, created_by) values
  ('d1100000-0000-4000-8000-000000000001', 'c1100000-0000-4000-8000-000000000001', 'Alfa', 'https://alfa-inativo.test', 'alfa-inativo.test', 'a1100000-0000-4000-8000-000000000001'),
  ('d1100000-0000-4000-8000-000000000002', 'c1100000-0000-4000-8000-000000000002', 'Beta', 'https://beta-sem.test', 'beta-sem.test', 'a1100000-0000-4000-8000-000000000002'),
  ('d1100000-0000-4000-8000-000000000003', 'e0a17e00-0000-4000-8000-000000000001', 'Gama', 'https://gama-equipe.test', 'gama-equipe.test', 'a1100000-0000-4000-8000-000000000006');

select public.set_signal_actor_state('curious_coder~linkedin-jobs-scraper', 'available', 'v1');

insert into private.signal_monitors (id, workspace_id, signal_type, name, state, audience, next_run_at, created_by) values
  ('b1100000-0000-4000-8000-000000000001', 'c1100000-0000-4000-8000-000000000001', 'vaga_linkedin', 'Vagas', 'ativo',
    '{"accountIds":["d1100000-0000-4000-8000-000000000001"]}', now() - interval '1 minute', 'a1100000-0000-4000-8000-000000000001'),
  ('b1100000-0000-4000-8000-000000000002', 'c1100000-0000-4000-8000-000000000002', 'vaga_linkedin', 'Vagas', 'ativo',
    '{"accountIds":["d1100000-0000-4000-8000-000000000002"]}', now() - interval '1 minute', 'a1100000-0000-4000-8000-000000000002'),
  ('b1100000-0000-4000-8000-000000000003', 'e0a17e00-0000-4000-8000-000000000001', 'vaga_linkedin', 'Vagas', 'ativo',
    '{"accountIds":["d1100000-0000-4000-8000-000000000003"]}', now() - interval '1 minute', 'a1100000-0000-4000-8000-000000000006');

insert into private.signal_rescans (id, workspace_id, target_account_id, origin) values
  ('f1100000-0000-4000-8000-000000000001', 'c1100000-0000-4000-8000-000000000001', 'd1100000-0000-4000-8000-000000000001', 'manual'),
  ('f1100000-0000-4000-8000-000000000003', 'e0a17e00-0000-4000-8000-000000000001', 'd1100000-0000-4000-8000-000000000003', 'manual');

insert into public.contacts (id, workspace_id, name, created_by) values
  ('91100000-0000-4000-8000-000000000001', 'c1100000-0000-4000-8000-000000000001', 'Sara', 'a1100000-0000-4000-8000-000000000001'),
  ('91100000-0000-4000-8000-000000000002', 'c1100000-0000-4000-8000-000000000002', 'Teo', 'a1100000-0000-4000-8000-000000000002'),
  ('91100000-0000-4000-8000-000000000003', 'e0a17e00-0000-4000-8000-000000000001', 'Lia', 'a1100000-0000-4000-8000-000000000006');

insert into public.sales_responsibilities (workspace_id, target_account_id, owner_user_id) values
  ('c1100000-0000-4000-8000-000000000001', 'd1100000-0000-4000-8000-000000000001', 'a1100000-0000-4000-8000-000000000001'),
  ('c1100000-0000-4000-8000-000000000002', 'd1100000-0000-4000-8000-000000000002', 'a1100000-0000-4000-8000-000000000002'),
  ('e0a17e00-0000-4000-8000-000000000001', 'd1100000-0000-4000-8000-000000000003', 'a1100000-0000-4000-8000-000000000006');

insert into public.sequences (id, workspace_id, target_account_id, owner_user_id, status) values
  ('e1100000-0000-4000-8000-000000000001', 'c1100000-0000-4000-8000-000000000001', 'd1100000-0000-4000-8000-000000000001', 'a1100000-0000-4000-8000-000000000001', 'ativa'),
  ('e1100000-0000-4000-8000-000000000002', 'c1100000-0000-4000-8000-000000000002', 'd1100000-0000-4000-8000-000000000002', 'a1100000-0000-4000-8000-000000000002', 'ativa'),
  ('e1100000-0000-4000-8000-000000000003', 'e0a17e00-0000-4000-8000-000000000001', 'd1100000-0000-4000-8000-000000000003', 'a1100000-0000-4000-8000-000000000006', 'ativa');

insert into private.sequence_authorizations (id, sequence_id, version, document, authorized_by) values
  ('81100000-0000-4000-8000-000000000001', 'e1100000-0000-4000-8000-000000000001', 1, '{"steps":[]}', 'a1100000-0000-4000-8000-000000000001'),
  ('81100000-0000-4000-8000-000000000002', 'e1100000-0000-4000-8000-000000000002', 1, '{"steps":[]}', 'a1100000-0000-4000-8000-000000000002'),
  ('81100000-0000-4000-8000-000000000003', 'e1100000-0000-4000-8000-000000000003', 1, '{"steps":[]}', 'a1100000-0000-4000-8000-000000000006');

insert into private.sequence_step_sends (
  id, sequence_id, workspace_id, step_id, owner_user_id, contact_id, channel, destination, status, mode, scheduled_for, authorization_id
) values
  ('71100000-0000-4000-8000-000000000001', 'e1100000-0000-4000-8000-000000000001', 'c1100000-0000-4000-8000-000000000001', 'p1', 'a1100000-0000-4000-8000-000000000001', '91100000-0000-4000-8000-000000000001', 'email', 'sara@alfa.test', 'scheduled', 'auto', now() - interval '1 hour', '81100000-0000-4000-8000-000000000001'),
  ('71100000-0000-4000-8000-000000000002', 'e1100000-0000-4000-8000-000000000002', 'c1100000-0000-4000-8000-000000000002', 'p1', 'a1100000-0000-4000-8000-000000000002', '91100000-0000-4000-8000-000000000002', 'email', 'teo@beta.test', 'scheduled', 'auto', now() - interval '1 hour', '81100000-0000-4000-8000-000000000002'),
  ('71100000-0000-4000-8000-000000000003', 'e1100000-0000-4000-8000-000000000003', 'e0a17e00-0000-4000-8000-000000000001', 'p1', 'a1100000-0000-4000-8000-000000000006', '91100000-0000-4000-8000-000000000003', 'email', 'lia@gama.test', 'scheduled', 'auto', now() - interval '1 hour', '81100000-0000-4000-8000-000000000003');

create temporary table rotinas (chave text primary key, id uuid) on commit drop;
with nova as (
  insert into private.agent_routines (workspace_id, agent_id, task, frequency, run_time, owner_id, updated_by)
  select 'c1100000-0000-4000-8000-000000000001', a.id, 'Reavaliar as Contas-alvo', 'diaria', '09:00',
    'a1100000-0000-4000-8000-000000000001', 'a1100000-0000-4000-8000-000000000001'
  from private.agents a
  where a.workspace_id = 'c1100000-0000-4000-8000-000000000001' and a.specialty = 'scopus' and a.kind = 'padrao'
  limit 1
  returning id
)
insert into rotinas (chave, id) select 'inativo', id from nova;
with nova as (
  insert into private.agent_routines (workspace_id, agent_id, task, frequency, run_time, owner_id, updated_by)
  select 'e0a17e00-0000-4000-8000-000000000001', a.id, 'Reavaliar as Contas-alvo', 'diaria', '09:00',
    'a1100000-0000-4000-8000-000000000006', 'a1100000-0000-4000-8000-000000000006'
  from private.agents a
  where a.workspace_id = 'e0a17e00-0000-4000-8000-000000000001' and a.specialty = 'scopus' and a.kind = 'padrao'
  limit 1
  returning id
)
insert into rotinas (chave, id) select 'equipe', id from nova;

insert into private.automation_settings (workspace_id, scope, mode, monthly_cap)
select 'e0a17e00-0000-4000-8000-000000000001', 'rotina:' || id::text, 'automatico', 1000
from rotinas where chave = 'equipe';

update private.agent_routines set next_run_at = now() - interval '1 minute'
where id in (select id from rotinas);

-- 1. O motivo. Ilimitado roda. Ativo roda, mesmo com início no futuro. Suspenso, encerrado ou sem linha não.
select is(private.automation_contract_block('c1100000-0000-4000-8000-000000000001'), 'contrato_inativo', 'contrato suspenso não roda');
select is(private.automation_contract_block('c1100000-0000-4000-8000-000000000002'), 'contrato_inativo', 'sem linha de contrato não roda');
select is(private.automation_contract_block('c1100000-0000-4000-8000-000000000006'), 'contrato_inativo', 'contrato encerrado não roda');
select ok(private.automation_contract_block('c1100000-0000-4000-8000-000000000005') is null, 'status ativo roda, mesmo com início no futuro');
select ok(private.automation_contract_block('e0a17e00-0000-4000-8000-000000000001') is null, 'a Equipe, ilimitada, roda');
select is(
  (select string_agg(scope || '=' || mode || ':' || coalesce(monthly_cap::text, 'ilimitado'), ',' order by scope)
   from private.automation_settings
   where workspace_id = 'e0a17e00-0000-4000-8000-000000000001' and scope like 'acao:%'),
  'acao:agentes=automatico:ilimitado,acao:enriquecimento=automatico:ilimitado,acao:varredura=automatico:ilimitado',
  'a Equipe tem as três ações em automático, sem teto'
);

-- 2. Monitoramento e busca: o inativo e o sem contrato ficam de fora; a Equipe é reivindicada. Nada é apagado.
create temporary table mon_claim on commit drop as select * from public.claim_due_signal_monitors(20);
select is((select count(*)::int from mon_claim where monitor_id = 'b1100000-0000-4000-8000-000000000001'), 0, 'Monitoramento suspenso não é reivindicado');
select is((select count(*)::int from mon_claim where monitor_id = 'b1100000-0000-4000-8000-000000000002'), 0, 'Monitoramento sem contrato não é reivindicado');
select is((select count(*)::int from mon_claim where monitor_id = 'b1100000-0000-4000-8000-000000000003'), 1, 'o Monitoramento da Equipe é reivindicado');
select is(
  (select state || ':' || (claimed_until is null)::text from private.signal_monitors where id = 'b1100000-0000-4000-8000-000000000001'),
  'ativo:true', 'o Monitoramento suspenso continua ativo e sem reserva'
);
select is((select outcome from public.begin_account_scan(
  'c1100000-0000-4000-8000-000000000001', 'a1100000-0000-4000-8000-000000000001',
  'b1100000-0000-4000-8000-000000000001', 'd1100000-0000-4000-8000-000000000001', now())),
  'contrato_inativo', 'abrir a varredura do suspenso devolve contrato_inativo');
select is((select outcome from public.begin_account_scan(
  'c1100000-0000-4000-8000-000000000002', null,
  'b1100000-0000-4000-8000-000000000002', 'd1100000-0000-4000-8000-000000000002', now())),
  'contrato_inativo', 'abrir a varredura sem contrato devolve contrato_inativo');
select is((select outcome from public.begin_account_scan(
  'e0a17e00-0000-4000-8000-000000000001', 'a1100000-0000-4000-8000-000000000006',
  'b1100000-0000-4000-8000-000000000003', 'd1100000-0000-4000-8000-000000000003', now())),
  'go', 'a Equipe abre a varredura');
select is((select count(*)::int from private.signal_monitors where id = 'b1100000-0000-4000-8000-000000000001'), 1, 'o Monitoramento suspenso não foi apagado');

create temporary table busca_claim on commit drop as select * from public.claim_signal_rescans(20);
select is((select count(*)::int from busca_claim where rescan_id = 'f1100000-0000-4000-8000-000000000001'), 0, 'a busca do suspenso não é reivindicada');
select is((select state from private.signal_rescans where id = 'f1100000-0000-4000-8000-000000000001'), 'pending', 'a busca do suspenso continua pendente');
select is((select outcome from public.begin_rescan_scan('f1100000-0000-4000-8000-000000000001', 'b1100000-0000-4000-8000-000000000001')),
  'contrato_inativo', 'abrir a busca do suspenso devolve contrato_inativo');
select is((select count(*)::int from busca_claim where rescan_id = 'f1100000-0000-4000-8000-000000000003'), 1, 'a busca da Equipe é reivindicada');

-- 3. Cascata: para antes de gastar. Na Equipe, o tipo desconhecido segue o caminho normal (sem cascata).
select is((select outcome from public.begin_cascade_run(
  'c1100000-0000-4000-8000-000000000001', null, 'tipo_que_nao_existe', 'monitor', null, 'chave-inativo', 0)),
  'contrato_inativo', 'a cascata do suspenso não abre');
select is((select outcome from public.begin_cascade_run(
  'c1100000-0000-4000-8000-000000000002', null, 'tipo_que_nao_existe', 'monitor', null, 'chave-sem', 0)),
  'contrato_inativo', 'a cascata sem contrato não abre');
select is((select count(*)::int from private.signal_cascade_runs where workspace_id = 'c1100000-0000-4000-8000-000000000001'), 0,
  'a cascata recusada não grava execução');
select is((select outcome from public.begin_cascade_run(
  'e0a17e00-0000-4000-8000-000000000001', null, 'tipo_que_nao_existe', 'monitor', null, 'chave-equipe', 0)),
  'sem_cascata', 'a Equipe passa da guarda do contrato e cai em sem cascata');

-- 4. Rotina: o relógio avança o horário e não cria Execução. A que já estava na fila fecha com o mesmo motivo.
create temporary table cron on commit drop as select * from private.enqueue_due_agent_routines(now());
select is((select outcome from cron where routine_id = (select id from rotinas where chave = 'inativo')), 'contrato_inativo',
  'a Rotina do suspenso não é criada');
select is((select paused::text from private.agent_routines where id = (select id from rotinas where chave = 'inativo')), 'false',
  'a Rotina do suspenso não é pausada');
select is((select count(*)::int from private.agent_runs where routine_id = (select id from rotinas where chave = 'inativo')), 0,
  'a Rotina do suspenso não ganha Execução');
select ok((select next_run_at > now() - interval '1 minute' from private.agent_routines where id = (select id from rotinas where chave = 'inativo')),
  'o horário da Rotina do suspenso avança');
select is((select outcome from cron where routine_id = (select id from rotinas where chave = 'equipe')), 'criada',
  'a Rotina da Equipe, com teto próprio, entra na fila');
select is((select count(*)::int from private.agent_runs where routine_id = (select id from rotinas where chave = 'equipe')), 1,
  'a Equipe ganha a Execução da Rotina');

insert into private.agent_conversations (id, workspace_id, owner_id, kind, agent_id)
select '61100000-0000-4000-8000-000000000001', 'c1100000-0000-4000-8000-000000000001', 'a1100000-0000-4000-8000-000000000001', 'agente', a.id
from private.agents a
where a.workspace_id = 'c1100000-0000-4000-8000-000000000001' and a.specialty = 'scopus' and a.kind = 'padrao'
limit 1;
insert into private.agent_runs (id, workspace_id, conversation_id, requested_by, client_request_id, request_text, trigger_kind, routine_id)
values (
  '51100000-0000-4000-8000-000000000001', 'c1100000-0000-4000-8000-000000000001', '61100000-0000-4000-8000-000000000001',
  'a1100000-0000-4000-8000-000000000001', '51100000-0000-4000-8000-000000000099', 'Reavaliar as Contas-alvo', 'rotina',
  (select id from rotinas where chave = 'inativo')
);
select ok(public.claim_agent_run('51100000-0000-4000-8000-000000000001') is null, 'reivindicar a Execução do suspenso não devolve a rodada');
select is((select error_code from private.agent_runs where id = '51100000-0000-4000-8000-000000000001'), 'contrato_inativo',
  'a Execução que já estava na fila fecha como contrato_inativo');
select is((select count(*)::int from private.agent_routines where id = (select id from rotinas where chave = 'inativo')), 1,
  'fechar a Execução não apaga a Rotina');

select is((select status from private.agent_runs where routine_id = (select id from rotinas where chave = 'equipe')), 'queued',
  'a Execução da Equipe ainda está na fila antes do claim');
select ok(public.claim_agent_run((select id from private.agent_runs where routine_id = (select id from rotinas where chave = 'equipe'))) is not null,
  'a Equipe reivindica a Execução da Rotina');
select is((select status from private.agent_runs where routine_id = (select id from rotinas where chave = 'equipe')), 'running',
  'a Execução da Equipe começa');

-- 5. Sequência: o passo vencido do suspenso e do sem contrato fica programado. O da Equipe sai.
create temporary table envios on commit drop as select * from public.claim_due_step_sends(20);
select is((select count(*)::int from envios where send_id in (
  '71100000-0000-4000-8000-000000000001', '71100000-0000-4000-8000-000000000002')), 0,
  'Sequência sem contrato ativo não é reivindicada');
select is((select status from private.sequence_step_sends where id = '71100000-0000-4000-8000-000000000001'), 'scheduled',
  'o passo do suspenso continua programado');
select is((select count(*)::int from envios where send_id = '71100000-0000-4000-8000-000000000003'), 1,
  'a Sequência da Equipe é reivindicada');
select is((select count(*)::int from public.sequences where id in (
  'e1100000-0000-4000-8000-000000000001', 'e1100000-0000-4000-8000-000000000002', 'e1100000-0000-4000-8000-000000000003')), 3,
  'nenhuma Sequência é apagada');

-- 6. Renovação: limpa a pausa dos três tipos de ação e avisa uma vez.
insert into private.automation_settings (workspace_id, scope, mode, monthly_cap, paused_at)
select 'c1100000-0000-4000-8000-000000000003', s.scope, 'automatico', 3000, now()
from (values ('acao:varredura'), ('acao:enriquecimento'), ('acao:agentes')) as s (scope);
select public.grant_credits('c1100000-0000-4000-8000-000000000003', 100, 'plano', 'saldo de teste');
select is(private.renew_contract_credits('c1100000-0000-4000-8000-000000000003'), true, 'o aniversário vencido renova');
select is((select count(*)::int from private.automation_settings
  where workspace_id = 'c1100000-0000-4000-8000-000000000003' and paused_at is not null), 0,
  'a renovação limpa a pausa dos três tipos de ação');
select is((select count(*)::int from private.workspace_notices
  where workspace_id = 'c1100000-0000-4000-8000-000000000003' and kind = 'automacao_retomada'
    and body = 'Automação retomada com os créditos do novo mês'), 1,
  'os Administradores recebem o aviso de retomada');
select is(private.renew_contract_credits('c1100000-0000-4000-8000-000000000003'), false, 'repetir no mesmo período não renova');
select is((select count(*)::int from private.workspace_notices
  where workspace_id = 'c1100000-0000-4000-8000-000000000003' and kind = 'automacao_retomada'), 1,
  'o aviso não se repete no mesmo período');

-- 7. O limite mensal único, até os créditos da faixa. Só o Administrador.
select private.seed_contract_automation('c1100000-0000-4000-8000-000000000004');
update private.automation_settings set paused_at = now()
where workspace_id = 'c1100000-0000-4000-8000-000000000004' and scope = 'acao:varredura';
insert into private.automation_spend (workspace_id, scope, month, spent)
values ('c1100000-0000-4000-8000-000000000004', 'acao:varredura', date_trunc('month', now())::date, 100);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'a1100000-0000-4000-8000-000000000001', true);
select is(
  (select inactive::text || ':' || coalesce(contract_status, '-') from public.automation_limit_summary('c1100000-0000-4000-8000-000000000001')),
  'true:suspenso', 'o resumo do suspenso diz que está inativo');
select set_config('request.jwt.claim.sub', 'a1100000-0000-4000-8000-000000000002', true);
select is(
  (select inactive::text || ':' || coalesce(contract_status, '-') || ':' || coalesce(monthly_limit::text, '-')
   from public.automation_limit_summary('c1100000-0000-4000-8000-000000000002')),
  'true:-:-', 'sem contrato, o resumo não tem limite');
select set_config('request.jwt.claim.sub', 'a1100000-0000-4000-8000-000000000006', true);
select is(
  (select unlimited::text || ':' || inactive::text || ':' || coalesce(blocked_reason, 'livre') || ':' || coalesce(monthly_cap::text, 'ilimitado')
   from public.automation_limit_summary('e0a17e00-0000-4000-8000-000000000001') s
   join public.list_automation_settings('e0a17e00-0000-4000-8000-000000000001') a on a.scope = 'acao:varredura'),
  'true:false:livre:ilimitado', 'a tela da Equipe lê ilimitado e a varredura sem bloqueio');

select set_config('request.jwt.claim.sub', 'a1100000-0000-4000-8000-000000000004', true);
select lives_ok(
  $$select public.set_workspace_monthly_limit('c1100000-0000-4000-8000-000000000004', 2000)$$,
  'o Administrador grava um limite dentro da faixa');
select throws_ok(
  $$select public.set_workspace_monthly_limit('c1100000-0000-4000-8000-000000000004', 4000)$$,
  '22023', 'monthly limit above tier', 'passar dos créditos da faixa recusa');
select throws_ok(
  $$select public.set_workspace_monthly_limit('c1100000-0000-4000-8000-000000000004', 0)$$,
  '22023', 'invalid monthly cap', 'limite zero recusa');
select set_config('request.jwt.claim.sub', 'a1100000-0000-4000-8000-000000000005', true);
select throws_ok(
  $$select public.set_workspace_monthly_limit('c1100000-0000-4000-8000-000000000004', 2000)$$,
  '42501', 'only administrators can change automation', 'Membro não muda o limite');
select set_config('request.jwt.claim.sub', 'a1100000-0000-4000-8000-000000000006', true);
select throws_ok(
  $$select public.set_workspace_monthly_limit('e0a17e00-0000-4000-8000-000000000001', 1000)$$,
  '22023', 'unlimited workspace has no monthly limit', 'a Equipe não tem limite mensal para gravar');
reset role;

select is((select monthly_credit_limit from private.workspace_contracts where workspace_id = 'c1100000-0000-4000-8000-000000000004'),
  2000::numeric, 'o limite gravado é o do contrato');
select is((select string_agg(scope || '=' || monthly_cap::text, ',' order by scope) from private.automation_settings
  where workspace_id = 'c1100000-0000-4000-8000-000000000004' and scope like 'acao:%'),
  'acao:agentes=2000.00,acao:enriquecimento=2000.00,acao:varredura=2000.00',
  'os três tipos de ação passam a usar o limite do Workspace');
select is((select paused_at is null from private.automation_settings
  where workspace_id = 'c1100000-0000-4000-8000-000000000004' and scope = 'acao:varredura'), true,
  'subir o limite acima do gasto do mês tira a pausa');

select ok(
  has_function_privilege('authenticated', 'public.automation_limit_summary(uuid)', 'execute')
    and not has_function_privilege('anon', 'public.automation_limit_summary(uuid)', 'execute')
    and has_function_privilege('authenticated', 'public.set_workspace_monthly_limit(uuid, numeric)', 'execute')
    and not has_function_privilege('anon', 'public.set_workspace_monthly_limit(uuid, numeric)', 'execute')
    and not has_function_privilege('authenticated', 'private.automation_contract_block(uuid)', 'execute'),
  'o resumo e o limite são do participante; a guarda do contrato não é'
);

select * from finish();
rollback;
