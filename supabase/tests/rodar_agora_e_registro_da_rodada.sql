begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(115);

-- Rodar agora e registro da Rodada (agente-de-sinal 02, escopo Contas): a prévia e o bloqueio, o pedido (um por
-- Monitoramento), a fila do runner, o modo manual da varredura (cobra crédito, respeita os limites e não consome o Teto de
-- automação), o registro de toda Rodada (agendada ou manual, a continuação na mesma linha) e os Sinais encontrados com o
-- "por que apareceu". Os horários que importam são fixos e passados (now() é um só dentro da transação), e as listas saem
-- por conjunto, nunca pela ordem de created_at.
-- Ana: Administradora do Norte e dos outros Workspaces. Beto e Dani: membros do Norte. Cris: Administradora do Sul. Eva: de fora.

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
                        created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
                        is_sso_user, is_anonymous)
values
  ('f9000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'ana@norte.test', '', now(), now(), now(), '{}', '{}', false, false),
  ('f9000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'beto@norte.test', '', now(), now(), now(), '{}', '{}', false, false),
  ('f9000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'cris@sul.test', '', now(), now(), now(), '{}', '{}', false, false),
  ('f9000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'dani@norte.test', '', now(), now(), now(), '{}', '{}', false, false),
  ('f9000000-0000-4000-8000-000000000005', 'authenticated', 'authenticated', 'eva@fora.test', '', now(), now(), now(), '{}', '{}', false, false);

insert into public.workspaces (id, kind, name) values
  ('f9100000-0000-4000-8000-000000000001', 'empresa', 'Norte'),
  ('f9100000-0000-4000-8000-000000000002', 'empresa', 'Sul'),
  ('f9100000-0000-4000-8000-000000000003', 'empresa', 'Parado'),
  ('f9100000-0000-4000-8000-000000000004', 'empresa', 'Pobre'),
  ('f9100000-0000-4000-8000-000000000005', 'empresa', 'Livre'),
  ('f9100000-0000-4000-8000-000000000006', 'empresa', 'Limite');
insert into private.workspace_contracts (workspace_id, tier_id, status, starts_at, monthly_credit_limit) values
  ('f9100000-0000-4000-8000-000000000001', 'profissional', 'ativo', date_trunc('month', now()), 100000),
  ('f9100000-0000-4000-8000-000000000002', 'profissional', 'ativo', date_trunc('month', now()), 100000),
  ('f9100000-0000-4000-8000-000000000003', 'essencial', 'suspenso', date_trunc('month', now()), 100000),
  ('f9100000-0000-4000-8000-000000000004', 'essencial', 'ativo', date_trunc('month', now()), 100000),
  ('f9100000-0000-4000-8000-000000000006', 'essencial', 'ativo', date_trunc('month', now()), 4);
insert into private.workspace_billing (workspace_id, credits_enforced, unlimited_credits)
values ('f9100000-0000-4000-8000-000000000005', true, true);
insert into public.workspace_memberships (workspace_id, user_id, role, active) values
  ('f9100000-0000-4000-8000-000000000001', 'f9000000-0000-4000-8000-000000000001', 'admin', true),
  ('f9100000-0000-4000-8000-000000000001', 'f9000000-0000-4000-8000-000000000002', 'member', true),
  ('f9100000-0000-4000-8000-000000000001', 'f9000000-0000-4000-8000-000000000004', 'member', true),
  ('f9100000-0000-4000-8000-000000000002', 'f9000000-0000-4000-8000-000000000003', 'admin', true),
  ('f9100000-0000-4000-8000-000000000003', 'f9000000-0000-4000-8000-000000000001', 'admin', true),
  ('f9100000-0000-4000-8000-000000000004', 'f9000000-0000-4000-8000-000000000001', 'admin', true),
  ('f9100000-0000-4000-8000-000000000005', 'f9000000-0000-4000-8000-000000000001', 'admin', true),
  ('f9100000-0000-4000-8000-000000000006', 'f9000000-0000-4000-8000-000000000001', 'admin', true);
select public.grant_credits('f9100000-0000-4000-8000-000000000001', 1000, 'plano', 'saldo de teste');
select public.grant_credits('f9100000-0000-4000-8000-000000000002', 1000, 'plano', 'saldo de teste');
select public.grant_credits('f9100000-0000-4000-8000-000000000003', 1000, 'plano', 'saldo de teste');
-- Pobre tem saldo para duas Contas (o preço é de 2 créditos por Conta).
select public.grant_credits('f9100000-0000-4000-8000-000000000004', 4, 'plano', 'saldo de teste');
select public.grant_credits('f9100000-0000-4000-8000-000000000006', 1000, 'plano', 'saldo de teste');
-- O Norte vem com a Automação em automático, dentro do limite do contrato (como um Workspace provisionado).
select private.seed_contract_automation('f9100000-0000-4000-8000-000000000001');
-- Dani gasta até 1 crédito por mês.
insert into private.credit_member_limits (workspace_id, user_id, monthly_limit)
values ('f9100000-0000-4000-8000-000000000001', 'f9000000-0000-4000-8000-000000000004', 1);

-- Norte: Alfa tem a página da empresa no LinkedIn; Beta e Gama não; Delta está arquivada.
insert into public.target_accounts (id, workspace_id, name, canonical_url, domain, linkedin_url, created_by) values
  ('f9200000-0000-4000-8000-000000000001', 'f9100000-0000-4000-8000-000000000001', 'Alfa', 'https://alfa.test', 'alfa.test',
   'https://www.linkedin.com/company/alfa', 'f9000000-0000-4000-8000-000000000001'),
  ('f9200000-0000-4000-8000-000000000002', 'f9100000-0000-4000-8000-000000000001', 'Beta', 'https://beta.test', 'beta.test', null,
   'f9000000-0000-4000-8000-000000000001'),
  ('f9200000-0000-4000-8000-000000000003', 'f9100000-0000-4000-8000-000000000001', 'Gama', 'https://gama.test', 'gama.test', null,
   'f9000000-0000-4000-8000-000000000001'),
  ('f9200000-0000-4000-8000-000000000004', 'f9100000-0000-4000-8000-000000000001', 'Delta', 'https://delta.test', 'delta.test', null,
   'f9000000-0000-4000-8000-000000000001'),
  ('f9200000-0000-4000-8000-000000000011', 'f9100000-0000-4000-8000-000000000002', 'Sul Um', 'https://sul1.test', 'sul1.test', null,
   'f9000000-0000-4000-8000-000000000003'),
  ('f9200000-0000-4000-8000-000000000021', 'f9100000-0000-4000-8000-000000000003', 'Parada', 'https://parada.test', 'parada.test', null,
   'f9000000-0000-4000-8000-000000000001'),
  ('f9200000-0000-4000-8000-000000000031', 'f9100000-0000-4000-8000-000000000004', 'Pi', 'https://pi.test', 'pi.test',
   'https://www.linkedin.com/company/pi', 'f9000000-0000-4000-8000-000000000001'),
  ('f9200000-0000-4000-8000-000000000032', 'f9100000-0000-4000-8000-000000000004', 'Rô', 'https://ro.test', 'ro.test', null,
   'f9000000-0000-4000-8000-000000000001'),
  ('f9200000-0000-4000-8000-000000000033', 'f9100000-0000-4000-8000-000000000004', 'Sigma', 'https://sigma.test', 'sigma.test', null,
   'f9000000-0000-4000-8000-000000000001'),
  ('f9200000-0000-4000-8000-000000000041', 'f9100000-0000-4000-8000-000000000005', 'Livre Um', 'https://livre1.test', 'livre1.test', null,
   'f9000000-0000-4000-8000-000000000001'),
  ('f9200000-0000-4000-8000-000000000051', 'f9100000-0000-4000-8000-000000000006', 'Teto Um', 'https://teto1.test', 'teto1.test', null,
   'f9000000-0000-4000-8000-000000000001'),
  ('f9200000-0000-4000-8000-000000000052', 'f9100000-0000-4000-8000-000000000006', 'Teto Dois', 'https://teto2.test', 'teto2.test', null,
   'f9000000-0000-4000-8000-000000000001'),
  ('f9200000-0000-4000-8000-000000000053', 'f9100000-0000-4000-8000-000000000006', 'Teto Três', 'https://teto3.test', 'teto3.test', null,
   'f9000000-0000-4000-8000-000000000001');
update public.target_accounts set archived_at = now() where id = 'f9200000-0000-4000-8000-000000000004';

-- Abertura de vagas e Nova liderança rodam; Anunciando no LinkedIn está fora do ar.
select public.set_signal_actor_state(a.actor_id, 'available', 'v1')
from private.signal_actors a where a.signal_type in ('vaga_linkedin', 'nova_lideranca');
select public.set_signal_actor_state(a.actor_id, 'out', 'v1') from private.signal_actors a where a.signal_type = 'anuncio_linkedin';

-- Os horários dos Monitoramentos são fixos e passados.
insert into private.signal_monitors
  (id, workspace_id, signal_type, name, state, audience, criteria, every_hours, created_by, next_run_at, plan_version) values
  -- M1: Vagas da Ana, ativo, vencido, com o Plano na versão 2.
  ('f9300000-0000-4000-8000-000000000001', 'f9100000-0000-4000-8000-000000000001', 'vaga_linkedin', 'Vagas', 'ativo',
   '{"accountIds":["f9200000-0000-4000-8000-000000000001","f9200000-0000-4000-8000-000000000002","f9200000-0000-4000-8000-000000000003"]}',
   '{"funcoes":["RevOps e GTM","SDR"],"senioridade":"Liderança","localizacao":["Brasil"],"periodo":"Últimos 30 dias","palavras":"lakehouse"}',
   24, 'f9000000-0000-4000-8000-000000000001', '2026-01-01 12:00:00+00', 2),
  -- M2: Nova liderança, rascunho (só Alfa tem a página da empresa).
  ('f9300000-0000-4000-8000-000000000002', 'f9100000-0000-4000-8000-000000000001', 'nova_lideranca', 'Lideranças', 'rascunho',
   '{"accountIds":["f9200000-0000-4000-8000-000000000001","f9200000-0000-4000-8000-000000000002","f9200000-0000-4000-8000-000000000003"]}',
   '{"cargos":["CTO"],"periodo":"Últimos 14 dias"}', 24, 'f9000000-0000-4000-8000-000000000001', null, 1),
  -- M3: do Beto, pausado, três Contas.
  ('f9300000-0000-4000-8000-000000000003', 'f9100000-0000-4000-8000-000000000001', 'vaga_linkedin', 'Vagas do Beto', 'pausado',
   '{"accountIds":["f9200000-0000-4000-8000-000000000001","f9200000-0000-4000-8000-000000000002","f9200000-0000-4000-8000-000000000003"]}',
   '{}', 24, 'f9000000-0000-4000-8000-000000000002', '2026-01-01 12:00:00+00', 0),
  -- M4: da Dani (tem limite mensal de 1 crédito), rascunho.
  ('f9300000-0000-4000-8000-000000000004', 'f9100000-0000-4000-8000-000000000001', 'vaga_linkedin', 'Vagas da Dani', 'rascunho',
   '{"accountIds":["f9200000-0000-4000-8000-000000000001"]}', '{}', 24, 'f9000000-0000-4000-8000-000000000004', null, 0),
  -- M5: tipo fora do ar. M6: mercado. M7: sem Contas. M8: só uma Conta arquivada.
  ('f9300000-0000-4000-8000-000000000005', 'f9100000-0000-4000-8000-000000000001', 'anuncio_linkedin', 'Fora do ar', 'rascunho',
   '{"accountIds":["f9200000-0000-4000-8000-000000000001"]}', '{}', 24, 'f9000000-0000-4000-8000-000000000001', null, 0),
  ('f9300000-0000-4000-8000-000000000006', 'f9100000-0000-4000-8000-000000000001', 'vaga_linkedin', 'Mercado', 'rascunho',
   '{"escopo":"mercado","accountIds":[]}', '{}', 24, 'f9000000-0000-4000-8000-000000000001', null, 0),
  ('f9300000-0000-4000-8000-000000000007', 'f9100000-0000-4000-8000-000000000001', 'vaga_linkedin', 'Sem Contas', 'rascunho',
   '{"accountIds":[]}', '{}', 24, 'f9000000-0000-4000-8000-000000000001', null, 0),
  ('f9300000-0000-4000-8000-000000000008', 'f9100000-0000-4000-8000-000000000001', 'vaga_linkedin', 'Só arquivada', 'rascunho',
   '{"accountIds":["f9200000-0000-4000-8000-000000000004"]}', '{}', 24, 'f9000000-0000-4000-8000-000000000001', null, 0),
  -- M9: do Sul. M10: do Workspace parado. M11 e M12: do Pobre. M13: agendado do Norte. M14: do Livre. M15: do Limite.
  ('f9300000-0000-4000-8000-000000000009', 'f9100000-0000-4000-8000-000000000002', 'vaga_linkedin', 'Vagas do Sul', 'ativo',
   '{"accountIds":["f9200000-0000-4000-8000-000000000011"]}', '{}', 24, 'f9000000-0000-4000-8000-000000000003', null, 0),
  ('f9300000-0000-4000-8000-000000000010', 'f9100000-0000-4000-8000-000000000003', 'vaga_linkedin', 'Vagas paradas', 'rascunho',
   '{"accountIds":["f9200000-0000-4000-8000-000000000021"]}', '{}', 24, 'f9000000-0000-4000-8000-000000000001', null, 0),
  ('f9300000-0000-4000-8000-000000000011', 'f9100000-0000-4000-8000-000000000004', 'nova_lideranca', 'Lideranças do Pobre', 'rascunho',
   '{"accountIds":["f9200000-0000-4000-8000-000000000031","f9200000-0000-4000-8000-000000000032","f9200000-0000-4000-8000-000000000033"]}',
   '{}', 24, 'f9000000-0000-4000-8000-000000000001', null, 0),
  ('f9300000-0000-4000-8000-000000000012', 'f9100000-0000-4000-8000-000000000004', 'vaga_linkedin', 'Vagas do Pobre', 'rascunho',
   '{"accountIds":["f9200000-0000-4000-8000-000000000031","f9200000-0000-4000-8000-000000000032","f9200000-0000-4000-8000-000000000033"]}',
   '{}', 24, 'f9000000-0000-4000-8000-000000000001', null, 0),
  ('f9300000-0000-4000-8000-000000000013', 'f9100000-0000-4000-8000-000000000001', 'vaga_linkedin', 'Vagas agendadas', 'ativo',
   '{"accountIds":["f9200000-0000-4000-8000-000000000001","f9200000-0000-4000-8000-000000000002"]}',
   '{"funcoes":["Finanças"],"periodo":"Últimos 7 dias"}', 24, 'f9000000-0000-4000-8000-000000000001', '2026-01-01 12:00:00+00', 3),
  ('f9300000-0000-4000-8000-000000000014', 'f9100000-0000-4000-8000-000000000005', 'vaga_linkedin', 'Vagas do Livre', 'rascunho',
   '{"accountIds":["f9200000-0000-4000-8000-000000000041"]}', '{}', 24, 'f9000000-0000-4000-8000-000000000001', null, 0),
  ('f9300000-0000-4000-8000-000000000015', 'f9100000-0000-4000-8000-000000000006', 'vaga_linkedin', 'Vagas do Limite', 'rascunho',
   '{"accountIds":["f9200000-0000-4000-8000-000000000051","f9200000-0000-4000-8000-000000000052","f9200000-0000-4000-8000-000000000053"]}',
   '{}', 24, 'f9000000-0000-4000-8000-000000000001', null, 0);

create temporary table r (k text primary key, id uuid) on commit drop;
grant all on r to authenticated;

-- 1. A prévia: Contas no escopo (nem a arquivada), as que devem ficar de fora, o preço, o máximo e o saldo.
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'f9000000-0000-4000-8000-000000000001', true);

select is(
  (select q.contas || '|' || q.contas_sem_dado || '|' || q.creditos_por_conta || '|' || q.ate_creditos || '|' || coalesce(q.bloqueio, '-')
   from public.quote_signal_run('f9100000-0000-4000-8000-000000000001', 'f9300000-0000-4000-8000-000000000001') q),
  '3|0|2|6|-', 'a prévia diz 3 Contas, 2 créditos por Conta e até 6 créditos, sem bloqueio');
select is(
  (select q.saldo from public.quote_signal_run('f9100000-0000-4000-8000-000000000001', 'f9300000-0000-4000-8000-000000000001') q),
  (select b.available from public.get_credit_balance('f9100000-0000-4000-8000-000000000001') b),
  'o saldo da prévia é o mesmo número que a tela de créditos mostra');
select is(
  (select q.contas || '|' || q.contas_sem_dado || '|' || q.ate_creditos
   from public.quote_signal_run('f9100000-0000-4000-8000-000000000001', 'f9300000-0000-4000-8000-000000000002') q),
  '3|2|6', 'o Sinal que lê a página da empresa estima 2 Contas sem dado, e o máximo continua sendo de todas as Contas');
select is(
  (select q.contas || '|' || coalesce(q.bloqueio, '-')
   from public.quote_signal_run('f9100000-0000-4000-8000-000000000001', 'f9300000-0000-4000-8000-000000000008') q),
  '0|sem_contas', 'a Conta arquivada não conta no escopo');
select is(
  (select q.bloqueio from public.quote_signal_run('f9100000-0000-4000-8000-000000000001', 'f9300000-0000-4000-8000-000000000007') q),
  'sem_contas', 'sem Contas no escopo não há o que rodar');

-- 2. Bloqueios por Monitoramento e por Workspace.
select is(
  (select q.bloqueio from public.quote_signal_run('f9100000-0000-4000-8000-000000000001', 'f9300000-0000-4000-8000-000000000005') q),
  'sem_fonte', 'o Sinal fora do ar não tem fonte');
select is(
  (select q.bloqueio from public.quote_signal_run('f9100000-0000-4000-8000-000000000001', 'f9300000-0000-4000-8000-000000000006') q),
  'sem_fonte', 'o escopo mercado não roda por aqui');
select is(
  (select q.bloqueio from public.quote_signal_run('f9100000-0000-4000-8000-000000000003', 'f9300000-0000-4000-8000-000000000010') q),
  'contrato_inativo', 'sem contrato ativo não roda');
select is(
  (select q.contas || '|' || q.contas_sem_dado || '|' || q.ate_creditos || '|' || coalesce(q.bloqueio, '-')
   from public.quote_signal_run('f9100000-0000-4000-8000-000000000004', 'f9300000-0000-4000-8000-000000000011') q),
  '3|2|6|-', 'a Conta sem dado não entra na conta do saldo: 1 Conta a verificar (2 créditos) cabe nos 4 do saldo');
select is(
  (select q.bloqueio from public.quote_signal_run('f9100000-0000-4000-8000-000000000004', 'f9300000-0000-4000-8000-000000000012') q),
  'sem_creditos', 'sem saldo para as 3 Contas (6 créditos) a prévia bloqueia');
select is(
  (select q.bloqueio from public.quote_signal_run('f9100000-0000-4000-8000-000000000006', 'f9300000-0000-4000-8000-000000000015') q),
  'limite_do_mes', 'o limite do contrato no mês também bloqueia');
select is(
  (select q.ilimitado || '|' || q.saldo || '|' || coalesce(q.bloqueio, '-')
   from public.quote_signal_run('f9100000-0000-4000-8000-000000000005', 'f9300000-0000-4000-8000-000000000014') q),
  'true|0|-', 'a Equipe, ilimitada, roda sem saldo');

-- 3. Quem pode: a permissão de salvar o Monitoramento. Dani tem limite mensal de 1 crédito.
select set_config('request.jwt.claim.sub', 'f9000000-0000-4000-8000-000000000002', true);
select is(
  (select q.bloqueio from public.quote_signal_run('f9100000-0000-4000-8000-000000000001', 'f9300000-0000-4000-8000-000000000001') q),
  'sem_permissao', 'um membro que não criou o Monitoramento não roda o dos outros');
select is(
  (select q.bloqueio from public.quote_signal_run('f9100000-0000-4000-8000-000000000001', 'f9300000-0000-4000-8000-000000000003') q),
  null, 'quem criou roda o próprio, mesmo pausado');
select throws_ok(
  $$select public.request_signal_run_now('f9100000-0000-4000-8000-000000000001', 'f9300000-0000-4000-8000-000000000001')$$,
  'P0001', 'signal run blocked: sem_permissao', 'e o pedido é recusado com o mesmo motivo');
select set_config('request.jwt.claim.sub', 'f9000000-0000-4000-8000-000000000004', true);
select is(
  (select q.bloqueio from public.quote_signal_run('f9100000-0000-4000-8000-000000000001', 'f9300000-0000-4000-8000-000000000004') q),
  'limite_do_participante', 'o limite mensal de quem pede vale');
select throws_ok(
  $$select public.request_signal_run_now('f9100000-0000-4000-8000-000000000001', 'f9300000-0000-4000-8000-000000000004')$$,
  'P0001', 'signal run blocked: limite_do_participante', 'e recusa o pedido');

-- Quem não participa do Workspace, e o anônimo, não veem nem pedem.
select set_config('request.jwt.claim.sub', 'f9000000-0000-4000-8000-000000000005', true);
select throws_ok(
  $$select * from public.quote_signal_run('f9100000-0000-4000-8000-000000000001', 'f9300000-0000-4000-8000-000000000001')$$,
  '42501', 'active workspace membership required', 'quem não participa não vê a prévia');
select throws_ok(
  $$select public.request_signal_run_now('f9100000-0000-4000-8000-000000000001', 'f9300000-0000-4000-8000-000000000001')$$,
  '42501', 'active workspace membership required', 'nem pede a Rodada');
select throws_ok(
  $$select public.list_signal_runs('f9100000-0000-4000-8000-000000000001', 'f9300000-0000-4000-8000-000000000001')$$,
  '42501', 'active workspace membership required', 'nem lê as Rodadas');
select set_config('request.jwt.claim.sub', 'f9000000-0000-4000-8000-000000000003', true);
select throws_ok(
  $$select public.request_signal_run_now('f9100000-0000-4000-8000-000000000001', 'f9300000-0000-4000-8000-000000000001')$$,
  '42501', 'active workspace membership required', 'a Administradora do Sul não pede Rodada no Norte');
reset role;
set local role anon;
select throws_ok(
  $$select * from public.quote_signal_run('f9100000-0000-4000-8000-000000000001', 'f9300000-0000-4000-8000-000000000001')$$,
  '42501', null, 'anônimo não vê a prévia');
select throws_ok(
  $$select public.request_signal_run_now('f9100000-0000-4000-8000-000000000001', 'f9300000-0000-4000-8000-000000000001')$$,
  '42501', null, 'anônimo não pede Rodada');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'f9000000-0000-4000-8000-000000000001', true);
select throws_ok(
  $$select * from public.quote_signal_run('f9100000-0000-4000-8000-000000000001', 'f9300000-0000-4000-8000-000000000009')$$,
  'P0002', 'monitor not found', 'o Monitoramento de outro Workspace é "não encontrado"');
select throws_ok(
  $$select public.request_signal_run_now('f9100000-0000-4000-8000-000000000003', 'f9300000-0000-4000-8000-000000000010')$$,
  'P0001', 'signal run blocked: contrato_inativo', 'sem contrato ativo o pedido é recusado com o código certo');
select throws_ok(
  $$select public.request_signal_run_now('f9100000-0000-4000-8000-000000000004', 'f9300000-0000-4000-8000-000000000012')$$,
  'P0001', 'signal run blocked: sem_creditos', 'sem créditos o pedido é recusado com o código certo');

-- 4. O pedido: um por Monitoramento. Vale em qualquer estado e não mexe no estado nem no horário do Monitoramento.
reset role;
create temporary table antes (k text primary key, state text, next_run_at timestamptz, last_run_at timestamptz) on commit drop;
insert into antes select 'm1', state, next_run_at, last_run_at from private.signal_monitors where id = 'f9300000-0000-4000-8000-000000000001';
insert into antes select 'm2', state, next_run_at, last_run_at from private.signal_monitors where id = 'f9300000-0000-4000-8000-000000000002';
insert into antes select 'm3', state, next_run_at, last_run_at from private.signal_monitors where id = 'f9300000-0000-4000-8000-000000000003';
set local role authenticated;
insert into r select 'm1', public.request_signal_run_now('f9100000-0000-4000-8000-000000000001', 'f9300000-0000-4000-8000-000000000001');
insert into r select 'm2', public.request_signal_run_now('f9100000-0000-4000-8000-000000000001', 'f9300000-0000-4000-8000-000000000002');
select set_config('request.jwt.claim.sub', 'f9000000-0000-4000-8000-000000000002', true);
insert into r select 'm3', public.request_signal_run_now('f9100000-0000-4000-8000-000000000001', 'f9300000-0000-4000-8000-000000000003');
select set_config('request.jwt.claim.sub', 'f9000000-0000-4000-8000-000000000001', true);
reset role;
select is(
  (select s.state || '|' || s.requested_by::text || '|' || s.quote_credits || '|' || s.monitor_id::text
   from private.signal_run_requests s where s.id = (select id from r where k = 'm1')),
  'pendente|f9000000-0000-4000-8000-000000000001|6|f9300000-0000-4000-8000-000000000001',
  'o pedido nasce pendente, de quem clicou, com o máximo da prévia');
select is(
  (select count(*)::int from private.signal_run_requests s where s.id in (select id from r where k in ('m1', 'm2', 'm3'))), 3,
  'rascunho, ativo e pausado aceitam o pedido');
select is(
  (select count(*)::int from private.signal_monitors m join antes a on a.k = 'm' || right(m.id::text, 1)
   where m.state = a.state and m.next_run_at is not distinct from a.next_run_at and m.last_run_at is not distinct from a.last_run_at
     and m.id in ('f9300000-0000-4000-8000-000000000001', 'f9300000-0000-4000-8000-000000000002', 'f9300000-0000-4000-8000-000000000003')),
  3, 'pedir não muda o estado nem o horário do Monitoramento');
set local role authenticated;
select throws_ok(
  $$select public.request_signal_run_now('f9100000-0000-4000-8000-000000000001', 'f9300000-0000-4000-8000-000000000001')$$,
  'P0001', 'signal run blocked: ja_na_fila', 'um clique repetido, ou de outra pessoa, não abre um segundo pedido');
select is(
  (select q.bloqueio from public.quote_signal_run('f9100000-0000-4000-8000-000000000001', 'f9300000-0000-4000-8000-000000000001') q),
  'ja_na_fila', 'e a prévia avisa que já tem uma Rodada na fila');
reset role;
select is((select count(*)::int from private.signal_run_requests where monitor_id = 'f9300000-0000-4000-8000-000000000001'), 1,
  'continua um pedido só por Monitoramento');
select throws_ok(
  $$insert into private.signal_run_requests (workspace_id, monitor_id, requested_by, quote_credits)
    values ('f9100000-0000-4000-8000-000000000001', 'f9300000-0000-4000-8000-000000000001', null, 1)$$,
  '23505', null, 'o banco garante: no máximo um pedido pendente ou rodando por Monitoramento');

-- O intervalo mínimo entre duas Rodadas manuais do mesmo Sinal: horários fixos e passados.
update private.signal_run_requests set state = 'feita', finished_at = now(), requested_at = now() - interval '30 minutes'
where id = (select id from r where k = 'm1');
create temporary table cot (bloqueio text, liberado_em timestamptz) on commit drop;
grant all on cot to authenticated;
set local role authenticated;
insert into cot select q.bloqueio, q.liberado_em from public.quote_signal_run('f9100000-0000-4000-8000-000000000001', 'f9300000-0000-4000-8000-000000000001') q;
reset role;
select is(
  (select c.bloqueio || '|' || (c.liberado_em = (select s.requested_at + interval '120 minutes' from private.signal_run_requests s where s.id = (select id from r where k = 'm1')))::text from cot c),
  'intervalo_minimo|true', 'uma Rodada manual de 30 minutos atrás bloqueia, e a prévia diz quando libera');
set local role authenticated;
select throws_ok(
  $$select public.request_signal_run_now('f9100000-0000-4000-8000-000000000001', 'f9300000-0000-4000-8000-000000000001')$$,
  'P0001', 'signal run blocked: intervalo_minimo', 'e o pedido é recusado');
reset role;
update private.signal_run_requests set requested_at = now() - interval '3 hours' where id = (select id from r where k = 'm1');
set local role authenticated;
select is(
  (select q.bloqueio from public.quote_signal_run('f9100000-0000-4000-8000-000000000001', 'f9300000-0000-4000-8000-000000000001') q),
  null, 'passado o intervalo, libera de novo');
reset role;
update private.signal_run_requests set state = 'cancelada', requested_at = now() - interval '10 minutes'
where id = (select id from r where k = 'm1');
set local role authenticated;
select is(
  (select q.bloqueio from public.quote_signal_run('f9100000-0000-4000-8000-000000000001', 'f9300000-0000-4000-8000-000000000001') q),
  null, 'o pedido cancelado não conta para o intervalo');
reset role;

-- 5. A fila do runner. O pedido do Norte (M1) é pedido de novo, já fora do intervalo.
update private.signal_run_requests set requested_at = now() - interval '5 hours' where id = (select id from r where k = 'm1');
insert into private.signal_run_requests (id, workspace_id, monitor_id, requested_by, requested_at, quote_credits) values
  ('f9400000-0000-4000-8000-000000000001', 'f9100000-0000-4000-8000-000000000001', 'f9300000-0000-4000-8000-000000000001',
   'f9000000-0000-4000-8000-000000000001', now() - interval '4 hours', 6);
select is((select s.state from private.signal_run_requests s where s.id = (select id from r where k = 'm2')), 'pendente',
  'os pedidos esperam o runner');
select is(
  (select has_function_privilege('anon', 'public.claim_signal_run_requests(integer)', 'execute')
     or has_function_privilege('authenticated', 'public.claim_signal_run_requests(integer)', 'execute')
     or has_function_privilege('authenticated', 'public.open_signal_run(uuid, timestamptz, uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.add_signal_run_progress(uuid, integer, integer, integer, integer, uuid[], text, integer)', 'execute')
     or has_function_privilege('authenticated', 'public.record_signal_in_run(uuid, uuid, uuid, uuid, text, text, text, timestamptz, text, text)', 'execute')
     or has_function_privilege('authenticated', 'public.finish_signal_run_request(uuid, text, integer, text)', 'execute')
     or has_function_privilege('anon', 'public.begin_account_scan(uuid, uuid, uuid, uuid, timestamptz, text, uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.begin_account_scan(uuid, uuid, uuid, uuid, timestamptz, text, uuid)', 'execute')),
  false, 'as funções do runner não são do navegador');
select is(
  (select has_function_privilege('service_role', 'public.claim_signal_run_requests(integer)', 'execute')
     and has_function_privilege('service_role', 'public.open_signal_run(uuid, timestamptz, uuid)', 'execute')
     and has_function_privilege('service_role', 'public.add_signal_run_progress(uuid, integer, integer, integer, integer, uuid[], text, integer)', 'execute')
     and has_function_privilege('service_role', 'public.record_signal_in_run(uuid, uuid, uuid, uuid, text, text, text, timestamptz, text, text)', 'execute')
     and has_function_privilege('service_role', 'public.finish_signal_run_request(uuid, text, integer, text)', 'execute')
     and has_function_privilege('service_role', 'public.begin_account_scan(uuid, uuid, uuid, uuid, timestamptz, text, uuid)', 'execute')),
  true, 'mas são do servidor');
select is(
  (select has_function_privilege('service_role', 'public.kick_signal_runner()', 'execute')
     and not has_function_privilege('authenticated', 'public.kick_signal_runner()', 'execute')
     and not has_function_privilege('anon', 'public.kick_signal_runner()', 'execute')),
  true, 'chamar o relógio de novo também é só do servidor');
select is(public.kick_signal_runner(), false, 'e onde o relógio não está configurado não chama ninguém');
select is(
  (select has_table_privilege('authenticated', 'private.signal_run_requests', 'select')
     or has_table_privilege('anon', 'private.signal_run_requests', 'select')
     or has_table_privilege('authenticated', 'private.signal_run_requests', 'insert')),
  false, 'a fila não tem grant ao navegador');
select is((select relrowsecurity from pg_class where oid = 'private.signal_run_requests'::regclass), true, 'e tem RLS ligado');

-- O relógio acorda com pedido manual esperando, mesmo sem nenhum Monitoramento vencido.
update private.signal_monitors set next_run_at = null where id in ('f9300000-0000-4000-8000-000000000001', 'f9300000-0000-4000-8000-000000000003', 'f9300000-0000-4000-8000-000000000013');
select is(private.signal_monitors_due(), true, 'o relógio acorda com pedido manual pendente');
create temporary table fila (n integer, request_id uuid, workspace_id uuid, monitor_id uuid, requested_by uuid, plan_version integer,
  accounts jsonb, scan_offset integer) on commit drop;
-- Só o pedido mais antigo do M1 (o de f94...01) e o do M2 e o do M3 estão pendentes; M1 tem dois: o de m1 virou cancelado.
update private.signal_run_requests set state = 'cancelada' where id = (select id from r where k = 'm1');
with c as (select * from public.claim_signal_run_requests(10))
insert into fila select row_number() over (order by c.requested_at, c.request_id), c.request_id, c.workspace_id, c.monitor_id,
  c.requested_by, c.plan_version, c.accounts, c.scan_offset from c;
select is((select count(*)::int from fila), 3, 'o runner reivindica os três pedidos pendentes');
select is(
  (select array_agg(f.monitor_id::text order by f.monitor_id::text) from fila f),
  array['f9300000-0000-4000-8000-000000000001', 'f9300000-0000-4000-8000-000000000002', 'f9300000-0000-4000-8000-000000000003'],
  'cada um do seu Monitoramento');
select is(
  (select f.requested_by::text || '|' || f.plan_version || '|' || jsonb_array_length(f.accounts) || '|' || f.scan_offset
   from fila f where f.request_id = 'f9400000-0000-4000-8000-000000000001'),
  'f9000000-0000-4000-8000-000000000001|2|3|0', 'o pedido chega com quem pediu, a versão do Plano e as 3 Contas do escopo');
select is(
  (select f.accounts -> 0 ->> 'name' from fila f where f.request_id = 'f9400000-0000-4000-8000-000000000001'), 'Alfa',
  'a rotação das Contas começa pela primeira');
select is(
  (select array_agg(s.state order by s.id::text) from private.signal_run_requests s
   where s.id in ('f9400000-0000-4000-8000-000000000001', (select id from r where k = 'm2'), (select id from r where k = 'm3'))),
  array['rodando', 'rodando', 'rodando'], 'e os marca como rodando');
select is((select count(*)::int from public.claim_signal_run_requests(10)), 0, 'o pedido reivindicado não sai duas vezes');
select is(
  (select m.claimed_until > now() from private.signal_monitors m where m.id = 'f9300000-0000-4000-8000-000000000001'), true,
  'o Monitoramento fica reservado enquanto a Rodada manual roda');

-- O agendado não passa por cima do Rodar agora: M1 está ativo, vencido e reservado; M13 também está vencido e segue livre.
update private.signal_monitors set next_run_at = '2026-01-01 12:00:00+00' where id in ('f9300000-0000-4000-8000-000000000001', 'f9300000-0000-4000-8000-000000000013');
select is(
  (select array_agg(c.monitor_id::text order by c.monitor_id::text) from public.claim_due_signal_monitors(10) c),
  array['f9300000-0000-4000-8000-000000000013'], 'o relógio pega o M13 e deixa o M1, que tem Rodar agora em andamento');

-- 6. O registro da Rodada manual de M1. Alfa, Beta e Gama; Alfa e Beta são verificadas, Gama falha (o crédito volta).
select is(
  (select public.open_signal_run('f9300000-0000-4000-8000-000000000001', '2026-01-01 12:00:00+00', 'f9400000-0000-4000-8000-000000000001') is not null),
  true, 'o runner abre a Rodada do pedido');
insert into r select 'run1', s.run_id from private.signal_run_requests s where s.id = 'f9400000-0000-4000-8000-000000000001';
select is(
  (select public.open_signal_run('f9300000-0000-4000-8000-000000000001', '2026-01-01 12:00:00+00', 'f9400000-0000-4000-8000-000000000001')),
  (select id from r where k = 'run1'), 'abrir de novo devolve a mesma Rodada');
select is(
  (select x.origin || '|' || x.requested_by::text || '|' || x.plan_version || '|' || x.accounts_total || '|' || x.state || '|'
          || (x.plan_snapshot ->> 'tipo') || '|' || (x.slot_at = s.requested_at)::text
   from private.signal_monitor_runs x join private.signal_run_requests s on s.run_id = x.id where x.id = (select id from r where k = 'run1')),
  'manual|f9000000-0000-4000-8000-000000000001|2|3|rodando|vaga_linkedin|true',
  'a Rodada guarda a origem, quem pediu, a versão do Plano, as Contas no escopo e o que procura');

create temporary table varreduras (k text primary key, outcome text, reservation_id uuid) on commit drop;
create temporary table gasto (k text primary key, spent numeric) on commit drop;
insert into gasto select 'antes', coalesce((select spent from private.automation_spend
  where workspace_id = 'f9100000-0000-4000-8000-000000000001' and scope = 'acao:varredura'), 0);
insert into varreduras select 'alfa', outcome, reservation_id
from public.begin_account_scan('f9100000-0000-4000-8000-000000000001', 'f9000000-0000-4000-8000-000000000001',
  'f9300000-0000-4000-8000-000000000001', 'f9200000-0000-4000-8000-000000000001', '2026-01-01 12:00:00+00', 'manual',
  'f9400000-0000-4000-8000-000000000001');
insert into varreduras select 'beta', outcome, reservation_id
from public.begin_account_scan('f9100000-0000-4000-8000-000000000001', 'f9000000-0000-4000-8000-000000000001',
  'f9300000-0000-4000-8000-000000000001', 'f9200000-0000-4000-8000-000000000002', '2026-01-01 12:00:00+00', 'manual',
  'f9400000-0000-4000-8000-000000000001');
insert into varreduras select 'gama', outcome, reservation_id
from public.begin_account_scan('f9100000-0000-4000-8000-000000000001', 'f9000000-0000-4000-8000-000000000001',
  'f9300000-0000-4000-8000-000000000001', 'f9200000-0000-4000-8000-000000000003', '2026-01-01 12:00:00+00', 'manual',
  'f9400000-0000-4000-8000-000000000001');
select is((select string_agg(k || '=' || outcome, ',' order by k) from varreduras), 'alfa=go,beta=go,gama=go',
  'o modo manual abre a varredura de cada Conta');
select is(
  (select array_agg(a.action_key order by a.action_key) from private.credit_reservations a
   where a.id in (select reservation_id from varreduras)),
  array[
    'scan:f9300000-0000-4000-8000-000000000001:f9200000-0000-4000-8000-000000000001:manual:f9400000-0000-4000-8000-000000000001',
    'scan:f9300000-0000-4000-8000-000000000001:f9200000-0000-4000-8000-000000000002:manual:f9400000-0000-4000-8000-000000000001',
    'scan:f9300000-0000-4000-8000-000000000001:f9200000-0000-4000-8000-000000000003:manual:f9400000-0000-4000-8000-000000000001'],
  'a chave de cobrança inclui o pedido');
select is((select sum(a.amount) from private.credit_reservations a where a.id in (select reservation_id from varreduras)), 6.00,
  'e cada Conta reserva o preço fixo do Sinal (2 créditos)');
select is(
  coalesce((select spent from private.automation_spend where workspace_id = 'f9100000-0000-4000-8000-000000000001' and scope = 'acao:varredura'), 0),
  (select spent from gasto where k = 'antes'), 'o manual não consome o Teto de automação');
select is(
  (select outcome from public.begin_account_scan('f9100000-0000-4000-8000-000000000001', 'f9000000-0000-4000-8000-000000000001',
    'f9300000-0000-4000-8000-000000000001', 'f9200000-0000-4000-8000-000000000001', '2026-01-01 12:00:00+00', 'manual',
    'f9400000-0000-4000-8000-000000000001')),
  'resume', 'repetir a abertura não reserva de novo');
select public.end_account_scan((select reservation_id from varreduras where k = 'alfa'), true);
select public.end_account_scan((select reservation_id from varreduras where k = 'beta'), true);
select public.end_account_scan((select reservation_id from varreduras where k = 'gama'), false);
select is(
  (select string_agg(outcome, ',') from (
    select outcome from public.begin_account_scan('f9100000-0000-4000-8000-000000000001', 'f9000000-0000-4000-8000-000000000001',
      'f9300000-0000-4000-8000-000000000001', 'f9200000-0000-4000-8000-000000000001', '2026-01-01 12:00:00+00', 'manual',
      'f9400000-0000-4000-8000-000000000001') union all
    select outcome from public.begin_account_scan('f9100000-0000-4000-8000-000000000001', 'f9000000-0000-4000-8000-000000000001',
      'f9300000-0000-4000-8000-000000000001', 'f9200000-0000-4000-8000-000000000003', '2026-01-01 12:00:00+00', 'manual',
      'f9400000-0000-4000-8000-000000000001')) x),
  'done,skip', 'a Conta já cobrada não é cobrada de novo, e a que falhou não é reaberta nesta Rodada');
-- O agendado, em comparação, consome o Teto; e a chamada de sempre (5 parâmetros) segue valendo.
select is(
  (select outcome from public.begin_account_scan('f9100000-0000-4000-8000-000000000001', 'f9000000-0000-4000-8000-000000000001',
    'f9300000-0000-4000-8000-000000000001', 'f9200000-0000-4000-8000-000000000002', '2026-01-02 12:00:00+00')),
  'go', 'a varredura agendada, com 5 parâmetros, abre como sempre');
select is(
  (select spent from private.automation_spend where workspace_id = 'f9100000-0000-4000-8000-000000000001' and scope = 'acao:varredura')
    - (select spent from gasto where k = 'antes'),
  2.00, 'e consome o Teto de automação');
select is(
  (select r.action_key from private.credit_reservations r
   where r.workspace_id = 'f9100000-0000-4000-8000-000000000001' and r.action_key like 'scan:f9300000-0000-4000-8000-000000000001:f9200000-0000-4000-8000-000000000002:1%'),
  'scan:f9300000-0000-4000-8000-000000000001:f9200000-0000-4000-8000-000000000002:' || extract(epoch from '2026-01-02 12:00:00+00'::timestamptz)::bigint::text,
  'com a chave de sempre: o Monitoramento, a Conta e a hora marcada');
select throws_ok(
  $$select * from public.begin_account_scan('f9100000-0000-4000-8000-000000000001', null, 'f9300000-0000-4000-8000-000000000001',
    'f9200000-0000-4000-8000-000000000002', now(), 'manual', null)$$,
  '22023', 'invalid scan origin', 'o modo manual exige o pedido');

-- O que a Rodada soma: as Contas verificadas, os Sinais, os créditos liquidados (2 de 3 reservas) e o motivo da parada.
select public.add_signal_run_progress((select id from r where k = 'run1'), 2, 1, 0, 0,
  (select array_agg(reservation_id) from varreduras), 'concluida');
select is(
  (select x.accounts_checked || '|' || x.credits_charged || '|' || x.signals_new || '|' || x.stop_reason
   from private.signal_monitor_runs x where x.id = (select id from r where k = 'run1')),
  '2|4|1|concluida', 'os créditos são os das 2 reservas liquidadas; a que voltou não entra');

-- Os Sinais: o novo ganha a Rodada; o mesmo acontecimento, visto de novo por outra Rodada, não vira novo nem perde a primeira.
select is(
  (select public.record_signal_in_run((select id from r where k = 'run1'), 'f9100000-0000-4000-8000-000000000001',
    'f9200000-0000-4000-8000-000000000001', 'f9300000-0000-4000-8000-000000000001', 'vaga_linkedin',
    'vaga|alfa|head de revops|2026-10', 'Vaga de Head de RevOps', now() - interval '2 days', 'LinkedIn', 'https://exemplo.test/vaga/1')),
  true, 'o Sinal novo é gravado');
select is(
  (select g.run_id from private.signals g where g.event_key = 'vaga|alfa|head de revops|2026-10'),
  (select id from r where k = 'run1'), 'e fica ligado à Rodada que o criou');
select is(
  (select public.record_signal_in_run((select id from r where k = 'run1'), 'f9100000-0000-4000-8000-000000000001',
    'f9200000-0000-4000-8000-000000000001', 'f9300000-0000-4000-8000-000000000001', 'vaga_linkedin',
    'vaga|alfa|sdr|2026-10', 'Vaga de SDR', now() - interval '3 days', 'LinkedIn', 'https://exemplo.test/vaga/2')),
  true, 'um segundo Sinal novo na mesma Rodada');
select is(
  (select public.record_signal_in_run(null, 'f9100000-0000-4000-8000-000000000001',
    'f9200000-0000-4000-8000-000000000002', 'f9300000-0000-4000-8000-000000000001', 'vaga_linkedin',
    'vaga|beta|cfo|2026-10', 'Vaga de CFO', now() - interval '1 day', 'LinkedIn', null)),
  true, 'sem Rodada (a busca de uma Conta, por exemplo) o Sinal é gravado do mesmo jeito');
select is((select g.run_id from private.signals g where g.event_key = 'vaga|beta|cfo|2026-10'), null,
  'e fica sem Rodada');

-- Fechar a Rodada manual: ela vira a última Rodada do Monitoramento, sem mexer no horário da próxima.
insert into antes select 'm1-fim', state, next_run_at, last_run_at from private.signal_monitors where id = 'f9300000-0000-4000-8000-000000000001';
select public.finish_signal_run_request('f9400000-0000-4000-8000-000000000001', 'feita', 3,
  'Contas sem a página da empresa no LinkedIn ficaram de fora: Gama.');
select is(
  (select s.state || '|' || x.state || '|' || x.stop_reason || '|' || (x.finished_at is not null)::text || '|' || x.error
   from private.signal_run_requests s join private.signal_monitor_runs x on x.id = s.run_id where s.id = 'f9400000-0000-4000-8000-000000000001'),
  'feita|concluida|concluida|true|Contas sem a página da empresa no LinkedIn ficaram de fora: Gama.',
  'o pedido e a Rodada fecham juntos, com o motivo');
select is(
  (select m.claimed_until is null and m.next_run_at is not distinct from a.next_run_at
     and m.state = a.state and m.current_run_id is null
   from private.signal_monitors m join antes a on a.k = 'm1-fim' where m.id = 'f9300000-0000-4000-8000-000000000001'),
  true, 'o Monitoramento é liberado e o horário e o estado ficam como estavam');
select is((select last_error from private.signal_monitors where id = 'f9300000-0000-4000-8000-000000000001'),
  'Contas sem a página da empresa no LinkedIn ficaram de fora: Gama.', 'o resultado vira a última Rodada do Monitoramento');
select is(
  (select count(*)::int from private.signal_monitor_runs where monitor_id = 'f9300000-0000-4000-8000-000000000001'), 1,
  'a Rodada manual gravou uma linha só');

-- A Rodada que continua na chamada seguinte usa a mesma linha, e a rotação segue de onde parou (M3: Alfa, Beta e Gama).
select public.open_signal_run('f9300000-0000-4000-8000-000000000003', now(), (select id from r where k = 'm3'));
insert into r select 'run3', s.run_id from private.signal_run_requests s where s.id = (select id from r where k = 'm3');
select public.add_signal_run_progress((select id from r where k = 'run3'), 1, 0, 0, 0, '{}', 'prazo');
select public.finish_signal_run_request((select id from r where k = 'm3'), 'pendente', 1, null);
select is(
  (select s.state || '|' || s.scan_offset || '|' || x.state || '|' || x.stop_reason
   from private.signal_run_requests s join private.signal_monitor_runs x on x.id = s.run_id where s.id = (select id from r where k = 'm3')),
  'pendente|1|rodando|prazo', 'o tempo da função acabou: o pedido volta à fila e a Rodada segue aberta');
select is(
  (select c.accounts -> 0 ->> 'name' from public.claim_signal_run_requests(5) c where c.request_id = (select id from r where k = 'm3')),
  'Beta', 'a continuação recomeça pela Conta seguinte');
select is(
  (select public.open_signal_run('f9300000-0000-4000-8000-000000000003', now(), (select id from r where k = 'm3'))),
  (select id from r where k = 'run3'), 'e usa a mesma Rodada');
select public.add_signal_run_progress((select id from r where k = 'run3'), 1, 0, 0, 1, '{}', 'sem_creditos', 3);
select public.finish_signal_run_request((select id from r where k = 'm3'), 'feita', 1, 'Sem créditos ou no limite mensal de quem pediu: a rodada parou.');
select is(
  (select x.state || '|' || x.stop_reason || '|' || x.accounts_checked || '|' || x.accounts_without_data || '|' || x.credits_charged
   from private.signal_monitor_runs x where x.id = (select id from r where k = 'run3')),
  'concluida|sem_creditos|2|1|3', 'a Rodada parada por falta de créditos soma as duas voltas, o que a cascata cobrou por fora e diz o motivo');
select is(
  (select count(*)::int from private.signal_monitor_runs where monitor_id = 'f9300000-0000-4000-8000-000000000003'), 1,
  'a continuação não abriu uma segunda linha');

-- A Rodada que falha por inteiro.
select public.open_signal_run('f9300000-0000-4000-8000-000000000002', now(), (select id from r where k = 'm2'));
insert into r select 'run2', s.run_id from private.signal_run_requests s where s.id = (select id from r where k = 'm2');
select public.add_signal_run_progress((select id from r where k = 'run2'), 0, 0, 0, 0, '{}', 'erro');
select public.finish_signal_run_request((select id from r where k = 'm2'), 'falhou', 3, 'A rodada falhou; tentamos de novo na próxima.');
select is(
  (select s.state || '|' || x.state || '|' || x.stop_reason from private.signal_run_requests s
   join private.signal_monitor_runs x on x.id = s.run_id where s.id = (select id from r where k = 'm2')),
  'falhou|falhou|erro', 'a Rodada que falhou diz o motivo');

-- Parar por falta de créditos, de contrato e do limite do contrato, com a Conta sem dado intocada (o runner nem abre a varredura).
insert into private.signal_run_requests (id, workspace_id, monitor_id, requested_by, quote_credits, state, claimed_until) values
  ('f9400000-0000-4000-8000-000000000012', 'f9100000-0000-4000-8000-000000000004', 'f9300000-0000-4000-8000-000000000012',
   'f9000000-0000-4000-8000-000000000001', 6, 'rodando', now() + interval '10 minutes'),
  ('f9400000-0000-4000-8000-000000000010', 'f9100000-0000-4000-8000-000000000003', 'f9300000-0000-4000-8000-000000000010',
   'f9000000-0000-4000-8000-000000000001', 2, 'rodando', now() + interval '10 minutes'),
  ('f9400000-0000-4000-8000-000000000015', 'f9100000-0000-4000-8000-000000000006', 'f9300000-0000-4000-8000-000000000015',
   'f9000000-0000-4000-8000-000000000001', 6, 'rodando', now() + interval '10 minutes'),
  ('f9400000-0000-4000-8000-000000000004', 'f9100000-0000-4000-8000-000000000001', 'f9300000-0000-4000-8000-000000000004',
   'f9000000-0000-4000-8000-000000000004', 2, 'rodando', now() + interval '10 minutes');
select is(
  (select string_agg(x.outcome, ',' order by x.n) from (
    select 1 as n, outcome from public.begin_account_scan('f9100000-0000-4000-8000-000000000004', 'f9000000-0000-4000-8000-000000000001',
      'f9300000-0000-4000-8000-000000000012', 'f9200000-0000-4000-8000-000000000031', now(), 'manual', 'f9400000-0000-4000-8000-000000000012')
    union all select 2, outcome from public.begin_account_scan('f9100000-0000-4000-8000-000000000004', 'f9000000-0000-4000-8000-000000000001',
      'f9300000-0000-4000-8000-000000000012', 'f9200000-0000-4000-8000-000000000032', now(), 'manual', 'f9400000-0000-4000-8000-000000000012')
    union all select 3, outcome from public.begin_account_scan('f9100000-0000-4000-8000-000000000004', 'f9000000-0000-4000-8000-000000000001',
      'f9300000-0000-4000-8000-000000000012', 'f9200000-0000-4000-8000-000000000033', now(), 'manual', 'f9400000-0000-4000-8000-000000000012')) x),
  'go,go,no_credits', 'o manual cobra o crédito e para quando o saldo acaba, sem Teto de automação nenhum');
select is(
  (select outcome from public.begin_account_scan('f9100000-0000-4000-8000-000000000003', 'f9000000-0000-4000-8000-000000000001',
    'f9300000-0000-4000-8000-000000000010', 'f9200000-0000-4000-8000-000000000021', now(), 'manual', 'f9400000-0000-4000-8000-000000000010')),
  'contrato_inativo', 'o manual para sem contrato ativo');
select is(
  (select string_agg(x.outcome, ',' order by x.n) from (
    select 1 as n, outcome from public.begin_account_scan('f9100000-0000-4000-8000-000000000006', 'f9000000-0000-4000-8000-000000000001',
      'f9300000-0000-4000-8000-000000000015', 'f9200000-0000-4000-8000-000000000051', now(), 'manual', 'f9400000-0000-4000-8000-000000000015')
    union all select 2, outcome from public.begin_account_scan('f9100000-0000-4000-8000-000000000006', 'f9000000-0000-4000-8000-000000000001',
      'f9300000-0000-4000-8000-000000000015', 'f9200000-0000-4000-8000-000000000052', now(), 'manual', 'f9400000-0000-4000-8000-000000000015')
    union all select 3, outcome from public.begin_account_scan('f9100000-0000-4000-8000-000000000006', 'f9000000-0000-4000-8000-000000000001',
      'f9300000-0000-4000-8000-000000000015', 'f9200000-0000-4000-8000-000000000053', now(), 'manual', 'f9400000-0000-4000-8000-000000000015')) x),
  'go,go,teto_atingido', 'o manual respeita o limite do contrato no mês');
select is(
  (select outcome from public.begin_account_scan('f9100000-0000-4000-8000-000000000001', 'f9000000-0000-4000-8000-000000000004',
    'f9300000-0000-4000-8000-000000000004', 'f9200000-0000-4000-8000-000000000001', now(), 'manual', 'f9400000-0000-4000-8000-000000000004')),
  'no_credits', 'e o limite mensal de quem pediu');

-- 7. A Rodada agendada: toda Rodada grava uma linha, e a continuação usa a mesma.
select is(
  (select public.open_signal_run('f9300000-0000-4000-8000-000000000013', '2026-01-01 12:00:00+00') is not null), true,
  'a Rodada agendada também abre uma linha');
insert into r select 'run13', current_run_id from private.signal_monitors where id = 'f9300000-0000-4000-8000-000000000013';
select is(
  (select x.origin || '|' || x.plan_version || '|' || x.accounts_total || '|' || (x.requested_by is null)::text || '|'
          || (x.slot_at = '2026-01-01 12:00:00+00'::timestamptz)::text
   from private.signal_monitor_runs x where x.id = (select id from r where k = 'run13')),
  'agenda|3|2|true|true', 'com a origem, a versão do Plano e a hora marcada');
select is(
  (select public.open_signal_run('f9300000-0000-4000-8000-000000000013', '2026-01-01 12:00:00+00')), (select id from r where k = 'run13'),
  'repetir a mesma hora marcada devolve a mesma Rodada');
select public.finish_signal_monitor_run('f9300000-0000-4000-8000-000000000013', 1, 'Varridas 1 de 2 Contas; o resto na próxima rodada.', true);
select is(
  (select x.state || '|' || (m.current_run_id = x.id)::text || '|' || (m.next_run_at = now())::text
   from private.signal_monitor_runs x join private.signal_monitors m on m.id = x.monitor_id where x.id = (select id from r where k = 'run13')),
  'rodando|true|true', 'quando o tempo acaba, a Rodada segue aberta e a próxima volta é já');
select is(
  (select public.open_signal_run('f9300000-0000-4000-8000-000000000013', now() + interval '1 minute')), (select id from r where k = 'run13'),
  'a continuação, com outra hora marcada, usa a mesma Rodada');
-- O mesmo acontecimento do M1, visto de novo pelo M13: não é Sinal novo e a Rodada o anota como visto de novo.
select is(
  (select public.record_signal_in_run((select id from r where k = 'run13'), 'f9100000-0000-4000-8000-000000000001',
    'f9200000-0000-4000-8000-000000000001', 'f9300000-0000-4000-8000-000000000013', 'vaga_linkedin',
    'vaga|alfa|head de revops|2026-10', 'Vaga de Head de RevOps', now() - interval '2 days', 'LinkedIn', 'https://exemplo.test/vaga/1')),
  false, 'o reencontro não é Sinal novo');
select is(
  (select g.run_id::text || '|' || g.seen_again_run_id::text from private.signals g where g.event_key = 'vaga|alfa|head de revops|2026-10'),
  (select id from r where k = 'run1')::text || '|' || (select id from r where k = 'run13')::text,
  'a Rodada de origem fica como estava e a que o viu de novo é anotada');
select public.add_signal_run_progress((select id from r where k = 'run13'), 2, 0, 1, 0, '{}', 'concluida');
select public.finish_signal_monitor_run('f9300000-0000-4000-8000-000000000013', 1, null, false);
select is(
  (select x.state || '|' || x.stop_reason || '|' || x.accounts_checked || '|' || x.signals_repeated || '|' || (x.finished_at is not null)::text
          || '|' || (m.current_run_id is null)::text || '|' || (m.next_run_at = now() + interval '24 hours')::text
   from private.signal_monitor_runs x join private.signal_monitors m on m.id = x.monitor_id where x.id = (select id from r where k = 'run13')),
  'concluida|concluida|2|1|true|true|true',
  'ao fechar, a Rodada guarda o resultado e o cálculo da próxima Rodada é o de sempre (a cada 24 horas)');
select is(
  (select count(*)::int from private.signal_monitor_runs where monitor_id = 'f9300000-0000-4000-8000-000000000013'), 1,
  'a Rodada agendada gravou uma linha só');
-- Rodada agendada aberta e abandonada (o Monitoramento foi pausado) não trava o Rodar agora.
select public.open_signal_run('f9300000-0000-4000-8000-000000000009', '2026-02-01 12:00:00+00');
update private.signal_monitors set state = 'pausado' where id = 'f9300000-0000-4000-8000-000000000009';
insert into private.signal_run_requests (id, workspace_id, monitor_id, requested_by, quote_credits)
values ('f9400000-0000-4000-8000-000000000009', 'f9100000-0000-4000-8000-000000000002', 'f9300000-0000-4000-8000-000000000009',
        'f9000000-0000-4000-8000-000000000003', 2);
select is(
  (select count(*)::int from public.claim_signal_run_requests(10) c where c.request_id = 'f9400000-0000-4000-8000-000000000009'), 1,
  'a Rodada agendada abandonada é fechada e o pedido segue');
select is(
  (select x.state || '|' || x.stop_reason from private.signal_monitor_runs x where x.monitor_id = 'f9300000-0000-4000-8000-000000000009' and x.origin = 'agenda'),
  'concluida|prazo', 'com o motivo "prazo"');

-- 8. Os Sinais encontrados: só os da Rodada, com o "por que apareceu" montado no Plano com que ela começou.
set local role authenticated;
select is(
  (select f.account_name || '|' || f.signal_type || '|' || f.kind || '|' || f.evidence
   from public.list_signal_run_findings('f9100000-0000-4000-8000-000000000001', (select id from r where k = 'run1')) f
   where f.phrase = 'Vaga de Head de RevOps'),
  'Alfa|vaga_linkedin|novo|https://exemplo.test/vaga/1', 'a Rodada manual lista o Sinal novo, com a Conta e a evidência');
select is(
  (select array_agg(f.phrase order by f.phrase) from public.list_signal_run_findings('f9100000-0000-4000-8000-000000000001', (select id from r where k = 'run1')) f),
  array['Vaga de Head de RevOps', 'Vaga de SDR'], 'só os Sinais da Rodada: o da busca sem Rodada não entra');
select is(
  (select f.why from public.list_signal_run_findings('f9100000-0000-4000-8000-000000000001', (select id from r where k = 'run1')) f
   where f.phrase = 'Vaga de SDR'),
  'Combina com o Plano: Abertura de vagas (função: RevOps e GTM, SDR; senioridade: Liderança; em Brasil; palavras: lakehouse; período: Últimos 30 dias)',
  'o "por que apareceu" diz o critério do Plano que bateu');
select is(
  (select f.kind || '|' || f.why from public.list_signal_run_findings('f9100000-0000-4000-8000-000000000001', (select id from r where k = 'run13')) f),
  'visto_de_novo|Combina com o Plano: Abertura de vagas (função: Finanças; período: Últimos 7 dias)',
  'a Rodada que viu o acontecimento de novo o lista como visto de novo, com o Plano dela');
reset role;
-- O Plano muda depois: o "por que" da Rodada antiga continua o do Plano com que ela rodou.
update private.signal_monitors set criteria = '{"funcoes":["Compras"]}' where id = 'f9300000-0000-4000-8000-000000000001';
-- Dados que não podem aparecer: um Sinal de outro Workspace ligado à Rodada, e uma Rodada de outro Workspace.
insert into r select 'run_sul', x.id from private.signal_monitor_runs x where x.monitor_id = 'f9300000-0000-4000-8000-000000000009';
insert into private.signals (workspace_id, target_account_id, monitor_id, signal_type, event_key, phrase, fired_at, run_id)
values ('f9100000-0000-4000-8000-000000000002', 'f9200000-0000-4000-8000-000000000011', 'f9300000-0000-4000-8000-000000000009', 'vaga_linkedin',
        'vaga|sul|x|2026-10', 'Vaga do Sul', now() - interval '1 day', (select id from r where k = 'run1'));
set local role authenticated;
select is(
  (select array_agg(f.phrase order by f.phrase) from public.list_signal_run_findings('f9100000-0000-4000-8000-000000000001', (select id from r where k = 'run1')) f),
  array['Vaga de Head de RevOps', 'Vaga de SDR'], 'o Sinal de outro Workspace nunca aparece, nem ligado à Rodada à força');
select is(
  (select f.why from public.list_signal_run_findings('f9100000-0000-4000-8000-000000000001', (select id from r where k = 'run1')) f
   where f.phrase = 'Vaga de SDR'),
  'Combina com o Plano: Abertura de vagas (função: RevOps e GTM, SDR; senioridade: Liderança; em Brasil; palavras: lakehouse; período: Últimos 30 dias)',
  'e editar o Plano não reescreve o "por que" da Rodada antiga');
select is(
  (select count(*)::int from public.list_signal_run_findings('f9100000-0000-4000-8000-000000000001', (select id from r where k = 'run3')) f), 0,
  'uma Rodada sem Sinais não lista nada');
select throws_ok(
  $$select * from public.list_signal_run_findings('f9100000-0000-4000-8000-000000000001', (select id from r where k = 'run_sul'))$$,
  'P0002', 'run not found', 'a Rodada de outro Workspace é "não encontrada"');
select set_config('request.jwt.claim.sub', 'f9000000-0000-4000-8000-000000000005', true);
select throws_ok(
  $$select * from public.list_signal_run_findings('f9100000-0000-4000-8000-000000000001', (select id from r where k = 'run1'))$$,
  '42501', 'active workspace membership required', 'quem não participa não lê os achados');
reset role;
set local role anon;
select throws_ok(
  $$select * from public.list_signal_run_findings('f9100000-0000-4000-8000-000000000001', 'f9300000-0000-4000-8000-000000000001')$$,
  '42501', null, 'anônimo não lê os achados');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'f9000000-0000-4000-8000-000000000001', true);

-- 9. O histórico: as Rodadas do Monitoramento e os pedidos ainda abertos.
select is(
  (select ((public.list_signal_runs('f9100000-0000-4000-8000-000000000001', 'f9300000-0000-4000-8000-000000000001') -> 'rodadas') -> 0)
          - 'id' - 'iniciadaEm' - 'terminouEm'),
  jsonb_build_object('origem', 'manual', 'estado', 'concluida', 'contasNoEscopo', 3, 'contasVerificadas', 2, 'contasSemDado', 0,
    'sinaisNovos', 1, 'sinaisRepetidos', 0, 'creditos', 4, 'motivoDaParada', 'concluida', 'versaoDoPlano', 2,
    'observacao', 'Contas sem a página da empresa no LinkedIn ficaram de fora: Gama.'),
  'o histórico traz origem, contagens, créditos, motivo da parada e a versão do Plano');
select is(
  (select jsonb_array_length(public.list_signal_runs('f9100000-0000-4000-8000-000000000001', 'f9300000-0000-4000-8000-000000000013') -> 'rodadas')), 1,
  'a Rodada agendada aparece no histórico do seu Monitoramento');
select is(
  (select (((public.list_signal_runs('f9100000-0000-4000-8000-000000000001', 'f9300000-0000-4000-8000-000000000013') -> 'rodadas') -> 0) ->> 'origem')),
  'agenda', 'com a origem agenda');
reset role;
insert into private.signal_run_requests (id, workspace_id, monitor_id, requested_by, quote_credits)
values ('f9400000-0000-4000-8000-000000000013', 'f9100000-0000-4000-8000-000000000001', 'f9300000-0000-4000-8000-000000000013',
        'f9000000-0000-4000-8000-000000000001', 4);
set local role authenticated;
select is(
  (select ((public.list_signal_runs('f9100000-0000-4000-8000-000000000001', 'f9300000-0000-4000-8000-000000000013') -> 'solicitacoes') -> 0)
          - 'id' - 'pedidaEm'),
  jsonb_build_object('estado', 'pendente', 'ateCreditos', 4, 'rodadaId', null), 'e os pedidos ainda abertos vêm junto');
select is(
  (select jsonb_array_length(public.list_signal_runs('f9100000-0000-4000-8000-000000000001', 'f9300000-0000-4000-8000-000000000001', 1) -> 'rodadas')), 1,
  'o limite de Rodadas respeita o que foi pedido');
select throws_ok(
  $$select public.list_signal_runs('f9100000-0000-4000-8000-000000000001', 'f9300000-0000-4000-8000-000000000009')$$,
  'P0002', 'monitor not found', 'o histórico de um Monitoramento de outro Workspace é "não encontrado"');
reset role;

-- 10. Apagar o Monitoramento leva as Rodadas e os pedidos juntos (e o vínculo circular com a Rodada aberta não trava).
insert into private.signal_monitors (id, workspace_id, signal_type, name, state, audience, created_by, next_run_at) values
  ('f9300000-0000-4000-8000-000000000016', 'f9100000-0000-4000-8000-000000000001', 'vaga_linkedin', 'Para apagar', 'ativo',
   '{"accountIds":["f9200000-0000-4000-8000-000000000001"]}', 'f9000000-0000-4000-8000-000000000001', '2026-01-01 12:00:00+00');
select public.open_signal_run('f9300000-0000-4000-8000-000000000016', '2026-01-01 12:00:00+00');
insert into private.signal_run_requests (workspace_id, monitor_id, requested_by, quote_credits)
values ('f9100000-0000-4000-8000-000000000001', 'f9300000-0000-4000-8000-000000000016', 'f9000000-0000-4000-8000-000000000001', 2);
select is(
  (select count(*)::int from private.signal_monitors where id = 'f9300000-0000-4000-8000-000000000016' and current_run_id is not null), 1,
  'o Monitoramento a apagar tem uma Rodada aberta');
delete from private.signal_monitors where id = 'f9300000-0000-4000-8000-000000000016';
select is(
  (select count(*)::int from private.signal_monitor_runs where monitor_id = 'f9300000-0000-4000-8000-000000000016')
  + (select count(*)::int from private.signal_run_requests where monitor_id = 'f9300000-0000-4000-8000-000000000016'),
  0, 'apagar o Monitoramento apaga as Rodadas e os pedidos');

select * from finish();
rollback;
