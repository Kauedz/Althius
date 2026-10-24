begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(100);

-- Preço por rodada, estimativa por dia e por mês, e limites ao ativar o Sinal (agente-de-sinal 04): a cotação antes de
-- ativar, o limite por dia (agenda e manual contam no dia), o corte no ponto certo, a Rodada parcial, as Rodadas puladas por
-- falta de créditos e a pausa na terceira. Os horários e os dias que importam são fixos (now() é um só dentro da transação) e as
-- listas saem por conjunto, nunca pela ordem de created_at.
-- Ana: Administradora dos Workspaces. Beto: membro do Norte (criou o M5). Cris: Administradora do Sul. Eva: de fora.

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
                        created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
                        is_sso_user, is_anonymous)
values
  ('fb000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'ana@norte.test', '', now(), now(), now(), '{}', '{}', false, false),
  ('fb000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'beto@norte.test', '', now(), now(), now(), '{}', '{}', false, false),
  ('fb000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'cris@sul.test', '', now(), now(), now(), '{}', '{}', false, false),
  ('fb000000-0000-4000-8000-000000000005', 'authenticated', 'authenticated', 'eva@fora.test', '', now(), now(), now(), '{}', '{}', false, false);

-- Os Workspaces: 1 Norte, 2 Sul, 3 Parado, 4 Confirmar, 5 Atingido, 6 Pobre, 7 Livre, 8 Teto, 9 Parcial.
insert into public.workspaces (id, kind, name)
select ('fb100000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid, 'empresa', nome
from (values (1, 'Norte'), (2, 'Sul'), (3, 'Parado'), (4, 'Confirmar'), (5, 'Atingido'), (6, 'Pobre'), (7, 'Livre'), (8, 'Teto'), (9, 'Parcial'))
  as w (n, nome);
insert into private.workspace_contracts (workspace_id, tier_id, status, starts_at, monthly_credit_limit)
select ('fb100000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid, 'profissional', case when n = 3 then 'suspenso' else 'ativo' end,
  date_trunc('month', now()), 100000
from generate_series(1, 9) n where n <> 7;
insert into private.workspace_billing (workspace_id, credits_enforced, unlimited_credits)
values ('fb100000-0000-4000-8000-000000000007', true, true);
insert into public.workspace_memberships (workspace_id, user_id, role, active)
select ('fb100000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid, 'fb000000-0000-4000-8000-000000000001', 'admin', true
from generate_series(1, 9) n where n <> 2;
insert into public.workspace_memberships (workspace_id, user_id, role, active) values
  ('fb100000-0000-4000-8000-000000000001', 'fb000000-0000-4000-8000-000000000002', 'member', true),
  ('fb100000-0000-4000-8000-000000000002', 'fb000000-0000-4000-8000-000000000003', 'admin', true);
select public.grant_credits(('fb100000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid, c, 'plano', 'saldo de teste')
from (values (1, 1000), (3, 1000), (4, 1000), (5, 1000), (6, 10), (8, 1000), (9, 4)) as g (n, c);
-- A Automação vem em automático, dentro do limite do contrato, nos Workspaces que rodam; o Confirmar fica em "confirmar".
select private.seed_contract_automation(('fb100000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid)
from generate_series(1, 9) n where n not in (2, 4);
-- Um valor de Teto que não pode aparecer em nenhuma cotação.
update private.automation_settings set monthly_cap = 77777
where workspace_id = 'fb100000-0000-4000-8000-000000000001' and scope = 'acao:varredura';
-- O Atingido já gastou todo o Teto do mês.
insert into private.automation_spend (workspace_id, scope, month, spent)
select workspace_id, scope, date_trunc('month', now())::date, monthly_cap
from private.automation_settings where workspace_id = 'fb100000-0000-4000-8000-000000000005' and scope = 'acao:varredura';

-- As Contas: o Workspace n tem as primeiras qtd.
insert into public.target_accounts (id, workspace_id, name, canonical_url, domain, created_by)
select ('fb200000-00' || lpad(w.n::text, 2, '0') || '-4000-8000-' || lpad(g.i::text, 12, '0'))::uuid,
  ('fb100000-0000-4000-8000-' || lpad(w.n::text, 12, '0'))::uuid,
  'Conta ' || w.n || '-' || g.i, 'https://c' || w.n || '-' || g.i || '.test', 'c' || w.n || '-' || g.i || '.test',
  'fb000000-0000-4000-8000-000000000001'
from (values (1, 12), (2, 1), (3, 1), (4, 2), (5, 2), (6, 12), (7, 2), (8, 5), (9, 5)) as w (n, qtd), generate_series(1, 12) g (i)
where g.i <= w.qtd;

-- Abertura de vagas roda.
select public.set_signal_actor_state(a.actor_id, 'available', 'v1') from private.signal_actors a where a.signal_type = 'vaga_linkedin';

-- O público de um Monitoramento: as primeiras qtd Contas do Workspace n.
create function pg_temp.publico(p_ws integer, p_qtd integer) returns jsonb language sql as $f$
  select jsonb_build_object('accountIds', coalesce(jsonb_agg(t.id::text order by t.id), '[]'::jsonb))
  from (select a.id from public.target_accounts a
        where a.workspace_id = ('fb100000-0000-4000-8000-' || lpad(p_ws::text, 12, '0'))::uuid order by a.id limit p_qtd) t
$f$;

-- Os Monitoramentos. next_run_at e horários são fixos e passados. Os ids: fb300000-...-NN.
insert into private.signal_monitors
  (id, workspace_id, signal_type, name, state, audience, criteria, every_hours, created_by, next_run_at, schedule, daily_credit_cap) values
  -- M1: Norte, 12 Contas, dois horários em dias úteis (o exemplo da cotação).
  ('fb300000-0000-4000-8000-000000000001', 'fb100000-0000-4000-8000-000000000001', 'vaga_linkedin', 'Vagas', 'ativo',
   pg_temp.publico(1, 12), '{}', 24, 'fb000000-0000-4000-8000-000000000001', '2026-01-01 12:00:00+00',
   '{"horarios":["08:00","14:00"],"dias":[1,2,3,4,5],"fuso":"America/Sao_Paulo"}', null),
  -- M2: Norte, 3 Contas, sem Agenda (o ritmo de every_hours).
  ('fb300000-0000-4000-8000-000000000002', 'fb100000-0000-4000-8000-000000000001', 'vaga_linkedin', 'Vagas legado', 'rascunho',
   pg_temp.publico(1, 3), '{}', 24, 'fb000000-0000-4000-8000-000000000001', null, null, null),
  -- M3: Teto, 5 Contas, limite por dia de 6 créditos (3 Contas a 2 créditos).
  ('fb300000-0000-4000-8000-000000000003', 'fb100000-0000-4000-8000-000000000008', 'vaga_linkedin', 'Vagas com limite', 'ativo',
   pg_temp.publico(8, 5), '{}', 24, 'fb000000-0000-4000-8000-000000000001', '2026-01-01 12:00:00+00',
   '{"horarios":["08:00"],"dias":[1,2,3,4,5],"fuso":"America/Sao_Paulo"}', 6),
  -- M4: Norte, mercado, dois horários em dias úteis.
  ('fb300000-0000-4000-8000-000000000004', 'fb100000-0000-4000-8000-000000000001', 'vaga_linkedin', 'Mercado', 'rascunho',
   '{"escopo":"mercado","accountIds":[]}', '{}', 24, 'fb000000-0000-4000-8000-000000000001', null,
   '{"horarios":["08:00","14:00"],"dias":[1,2,3,4,5],"fuso":"America/Sao_Paulo"}', null),
  -- M5: Norte, do Beto, ativo, um horário: o das Rodadas puladas.
  ('fb300000-0000-4000-8000-000000000005', 'fb100000-0000-4000-8000-000000000001', 'vaga_linkedin', 'Vagas do Beto', 'ativo',
   pg_temp.publico(1, 2), '{}', 24, 'fb000000-0000-4000-8000-000000000002', '2026-01-01 12:00:00+00',
   '{"horarios":["10:00"],"dias":[1,2,3,4,5],"fuso":"America/Sao_Paulo"}', null),
  -- M6: Norte, Sinal interno (das Interações): não gasta crédito.
  ('fb300000-0000-4000-8000-000000000006', 'fb100000-0000-4000-8000-000000000001', 'sem_resposta', 'Sem resposta', 'rascunho',
   '{"accountIds":[]}', '{}', 24, 'fb000000-0000-4000-8000-000000000001', null, null, null),
  -- M7: Teto, 5 Contas, limite por dia de 4 créditos: o dia, a reserva solta e a que já existe.
  ('fb300000-0000-4000-8000-000000000007', 'fb100000-0000-4000-8000-000000000008', 'vaga_linkedin', 'Vagas do dia', 'ativo',
   pg_temp.publico(8, 5), '{}', 24, 'fb000000-0000-4000-8000-000000000001', '2026-01-01 12:00:00+00', null, 4),
  -- M8: Norte, 1 Conta, um horário uma vez por semana (o arredondamento para cima).
  ('fb300000-0000-4000-8000-000000000008', 'fb100000-0000-4000-8000-000000000001', 'vaga_linkedin', 'Vagas de segunda', 'rascunho',
   pg_temp.publico(1, 1), '{}', 24, 'fb000000-0000-4000-8000-000000000001', null,
   '{"horarios":["08:00"],"dias":[1],"fuso":"America/Sao_Paulo"}', null),
  -- M9: Confirmar. M10: Parado. M11: Atingido. M12: Pobre. M13: Livre. M14: Parcial. M15: Norte sem Contas. M16: do Sul.
  ('fb300000-0000-4000-8000-000000000009', 'fb100000-0000-4000-8000-000000000004', 'vaga_linkedin', 'Vagas confirmar', 'rascunho',
   pg_temp.publico(4, 2), '{}', 24, 'fb000000-0000-4000-8000-000000000001', null,
   '{"horarios":["08:00"],"dias":[1,2,3,4,5],"fuso":"America/Sao_Paulo"}', null),
  ('fb300000-0000-4000-8000-000000000010', 'fb100000-0000-4000-8000-000000000003', 'vaga_linkedin', 'Vagas paradas', 'rascunho',
   pg_temp.publico(3, 1), '{}', 24, 'fb000000-0000-4000-8000-000000000001', null,
   '{"horarios":["08:00"],"dias":[1,2,3,4,5],"fuso":"America/Sao_Paulo"}', null),
  ('fb300000-0000-4000-8000-000000000011', 'fb100000-0000-4000-8000-000000000005', 'vaga_linkedin', 'Vagas atingido', 'rascunho',
   pg_temp.publico(5, 2), '{}', 24, 'fb000000-0000-4000-8000-000000000001', null,
   '{"horarios":["08:00"],"dias":[1,2,3,4,5],"fuso":"America/Sao_Paulo"}', null),
  ('fb300000-0000-4000-8000-000000000012', 'fb100000-0000-4000-8000-000000000006', 'vaga_linkedin', 'Vagas pobre', 'rascunho',
   pg_temp.publico(6, 12), '{}', 24, 'fb000000-0000-4000-8000-000000000001', null,
   '{"horarios":["08:00","14:00"],"dias":[1,2,3,4,5],"fuso":"America/Sao_Paulo"}', null),
  ('fb300000-0000-4000-8000-000000000013', 'fb100000-0000-4000-8000-000000000007', 'vaga_linkedin', 'Vagas livre', 'rascunho',
   pg_temp.publico(7, 2), '{}', 24, 'fb000000-0000-4000-8000-000000000001', null,
   '{"horarios":["08:00"],"dias":[1,2,3,4,5],"fuso":"America/Sao_Paulo"}', null),
  ('fb300000-0000-4000-8000-000000000014', 'fb100000-0000-4000-8000-000000000009', 'vaga_linkedin', 'Vagas parcial', 'ativo',
   pg_temp.publico(9, 5), '{}', 24, 'fb000000-0000-4000-8000-000000000001', '2026-01-01 12:00:00+00', null, null),
  ('fb300000-0000-4000-8000-000000000015', 'fb100000-0000-4000-8000-000000000001', 'vaga_linkedin', 'Sem Contas', 'rascunho',
   '{"accountIds":[]}', '{}', 24, 'fb000000-0000-4000-8000-000000000001', null,
   '{"horarios":["08:00"],"dias":[1,2,3,4,5],"fuso":"America/Sao_Paulo"}', null),
  ('fb300000-0000-4000-8000-000000000016', 'fb100000-0000-4000-8000-000000000002', 'vaga_linkedin', 'Vagas do Sul', 'rascunho',
   pg_temp.publico(2, 1), '{}', 24, 'fb000000-0000-4000-8000-000000000003', null, null, null);

create temporary table r (k text primary key, id uuid, txt text) on commit drop;
grant all on r to authenticated;

-- 1. A cotação: o exemplo da conta. 12 Contas a 2 créditos, dois horários em dias úteis.
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'fb000000-0000-4000-8000-000000000001', true);

select is(
  (select concat_ws('|', q.por_rodada, q.rodadas_por_semana, q.por_dia, q.por_mes_aprox, q.saldo, q.dias_de_saldo,
                    q.aviso_repeticao, q.teto_diario_sugerido, coalesce(q.bloqueio_ativacao, '-'), q.ilimitado)
   from public.quote_signal_schedule('fb100000-0000-4000-8000-000000000001', 'fb300000-0000-4000-8000-000000000001') q),
  '24|10|48|1040|1000.00|29|f|48|-|f',
  '12 Contas e 2 horários em dias úteis: 24 por rodada, 10 rodadas por semana, 48 por dia, cerca de 1.040 por mês; o saldo de 1.000 dura 29 dias');
select is(
  (select q.saldo from public.quote_signal_schedule('fb100000-0000-4000-8000-000000000001', 'fb300000-0000-4000-8000-000000000001') q),
  (select b.available from public.get_credit_balance('fb100000-0000-4000-8000-000000000001') b),
  'o saldo da cotação é o mesmo número que a tela de créditos mostra');

-- A Agenda proposta, que a tela ainda não gravou: a cotação segue a proposta e não grava nada.
select is(
  (select concat_ws('|', q.por_rodada, q.rodadas_por_semana, q.por_dia, q.por_mes_aprox, q.aviso_repeticao, q.teto_diario_sugerido)
   from public.quote_signal_schedule('fb100000-0000-4000-8000-000000000001', 'fb300000-0000-4000-8000-000000000001',
     '{"horarios":["08:00","12:00","16:00"],"dias":[1,2,3,4,5]}') q),
  '24|15|72|1560|t|72', 'três horários: 72 por dia, 1.560 por mês, e o aviso de que rodar várias vezes por dia repete resultados');
select is(
  (select concat_ws('|', q.rodadas_por_semana, q.por_dia, q.por_mes_aprox, q.aviso_repeticao)
   from public.quote_signal_schedule('fb100000-0000-4000-8000-000000000001', 'fb300000-0000-4000-8000-000000000001',
     '{"horarios":["08:00","14:00"],"dias":[1,2,3,4,5,6,7]}') q),
  '14|48|1456|f', 'dois horários não dão aviso; os sete dias entram na conta (14 × 52 × 24 / 12 = 1.456)');
select is(
  (select q.por_mes_aprox from public.quote_signal_schedule('fb100000-0000-4000-8000-000000000001', 'fb300000-0000-4000-8000-000000000008') q),
  9, 'o mês arredonda para cima: 1 rodada por semana de 2 créditos é 8,67 e vira 9');
select is(
  (select concat_ws('|', q.por_rodada, q.rodadas_por_semana, q.por_dia, q.por_mes_aprox, q.aviso_repeticao)
   from public.quote_signal_schedule('fb100000-0000-4000-8000-000000000001', 'fb300000-0000-4000-8000-000000000002') q),
  '6|7|6|182|f', 'sem Agenda, vale o ritmo de every_hours: 1 rodada por dia, todos os dias, 3 Contas a 2 créditos');
reset role;
update private.signal_monitors set every_hours = 6 where id = 'fb300000-0000-4000-8000-000000000002';
set local role authenticated;
select is(
  (select concat_ws('|', q.rodadas_por_semana, q.por_dia, q.por_mes_aprox, q.aviso_repeticao)
   from public.quote_signal_schedule('fb100000-0000-4000-8000-000000000001', 'fb300000-0000-4000-8000-000000000002') q),
  '28|24|728|t', 'a cada 6 horas são 4 rodadas por dia: o aviso de repetição aparece');
select is(
  (select concat_ws('|', q.por_rodada, q.por_dia, q.por_mes_aprox)
   from public.quote_signal_schedule('fb100000-0000-4000-8000-000000000001', 'fb300000-0000-4000-8000-000000000004') q),
  '4|8|174', 'o mercado cobra o fixo da descoberta por rodada (4), e não por Conta');
select is(
  (select concat_ws('|', q.por_rodada, q.por_dia, q.por_mes_aprox, coalesce(q.dias_de_saldo::text, 'nulo'), coalesce(q.bloqueio_ativacao, '-'))
   from public.quote_signal_schedule('fb100000-0000-4000-8000-000000000001', 'fb300000-0000-4000-8000-000000000006') q),
  '0|0|0|nulo|-', 'o Sinal interno não gasta crédito: nada a estimar e nada a bloquear');
select is(
  (select concat_ws('|', q.por_rodada, q.por_dia, coalesce(q.dias_de_saldo::text, 'nulo'), q.teto_diario_sugerido)
   from public.quote_signal_schedule('fb100000-0000-4000-8000-000000000001', 'fb300000-0000-4000-8000-000000000015') q),
  '0|0|nulo|0', 'sem Contas no escopo não há custo, e o saldo não "dura" nada');

-- A conferência da Agenda proposta é a do servidor.
select throws_ok(
  $$select * from public.quote_signal_schedule('fb100000-0000-4000-8000-000000000001', 'fb300000-0000-4000-8000-000000000001',
    '{"horarios":["08:00","09:00"],"dias":[1]}')$$,
  '22023', 'signal schedule invalid: intervalo_curto', 'a Agenda proposta com menos de 2 horas entre as rodadas é recusada');
select throws_ok(
  $$select * from public.quote_signal_schedule('fb100000-0000-4000-8000-000000000001', 'fb300000-0000-4000-8000-000000000001',
    '{"horarios":[],"dias":[1]}')$$,
  '22023', 'signal schedule invalid: sem_horario', 'e sem horário também');

-- 2. O bloqueio da ativação, em cada Workspace.
select is(
  (select q.bloqueio_ativacao from public.quote_signal_schedule('fb100000-0000-4000-8000-000000000003', 'fb300000-0000-4000-8000-000000000010') q),
  'contrato_inativo', 'sem contrato ativo, não ativa');
select is(
  (select q.bloqueio_ativacao from public.quote_signal_schedule('fb100000-0000-4000-8000-000000000004', 'fb300000-0000-4000-8000-000000000009') q),
  'sem_teto_automacao', 'a Automação em "confirmar" não roda sozinha: falta liberar a automação');
select is(
  (select q.bloqueio_ativacao from public.quote_signal_schedule('fb100000-0000-4000-8000-000000000005', 'fb300000-0000-4000-8000-000000000011') q),
  'sem_teto_automacao', 'e o Teto do mês já gasto também pede liberar a automação');
select is(
  (select q.bloqueio_ativacao from public.quote_signal_schedule('fb100000-0000-4000-8000-000000000006', 'fb300000-0000-4000-8000-000000000012') q),
  'sem_creditos', 'o saldo de 10 não cobre uma rodada de 24');
select is(
  (select concat_ws('|', q.ilimitado, q.por_rodada, coalesce(q.dias_de_saldo::text, 'nulo'), coalesce(q.bloqueio_ativacao, '-'))
   from public.quote_signal_schedule('fb100000-0000-4000-8000-000000000007', 'fb300000-0000-4000-8000-000000000013') q),
  't|4|nulo|-', 'a Equipe, ilimitada, ativa sem saldo contado e sem dias de saldo');

-- Nunca o valor do Teto: nem na linha, nem no nome de uma coluna.
select unalike(
  (select to_jsonb(q)::text from public.quote_signal_schedule('fb100000-0000-4000-8000-000000000001', 'fb300000-0000-4000-8000-000000000001') q),
  '%77777%', 'a cotação do Workspace com Teto de 77.777 não traz esse valor');
select is(
  (select array_agg(c order by c) from unnest(string_to_array(pg_get_function_result('public.quote_signal_schedule(uuid, uuid, jsonb)'::regprocedure), ', ')) c
   where c ~* 'teto|cap|usd|dolar|actor'),
  array['teto_diario_sugerido integer'], 'a única coluna com "teto" no nome é o sugerido do limite por dia: nenhum Teto mensal, US$ ou actor');

-- Quem pode ver: todo participante ativo. O Monitoramento de outro Workspace é "não encontrado".
select set_config('request.jwt.claim.sub', 'fb000000-0000-4000-8000-000000000002', true);
select is(
  (select q.por_mes_aprox from public.quote_signal_schedule('fb100000-0000-4000-8000-000000000001', 'fb300000-0000-4000-8000-000000000001') q),
  1040, 'um membro vê a cotação do Monitoramento de outra pessoa');
select throws_ok(
  $$select * from public.quote_signal_schedule('fb100000-0000-4000-8000-000000000001', 'fb300000-0000-4000-8000-000000000016')$$,
  'P0002', 'monitor not found', 'o Monitoramento de outro Workspace é "não encontrado"');
select set_config('request.jwt.claim.sub', 'fb000000-0000-4000-8000-000000000005', true);
select throws_ok(
  $$select * from public.quote_signal_schedule('fb100000-0000-4000-8000-000000000001', 'fb300000-0000-4000-8000-000000000001')$$,
  '42501', 'active workspace membership required', 'quem não participa não vê a cotação');
select set_config('request.jwt.claim.sub', 'fb000000-0000-4000-8000-000000000003', true);
select throws_ok(
  $$select * from public.quote_signal_schedule('fb100000-0000-4000-8000-000000000001', 'fb300000-0000-4000-8000-000000000001')$$,
  '42501', 'active workspace membership required', 'a Administradora do Sul não vê a cotação do Norte');
reset role;
set local role anon;
select throws_ok(
  $$select * from public.quote_signal_schedule('fb100000-0000-4000-8000-000000000001', 'fb300000-0000-4000-8000-000000000001')$$,
  '42501', null, 'anônimo não vê a cotação');
select throws_ok(
  $$select public.save_signal_daily_cap('fb100000-0000-4000-8000-000000000001', 'fb300000-0000-4000-8000-000000000001', 10)$$,
  '42501', null, 'nem grava o limite por dia');
reset role;

-- 3. O limite por dia: de 1 ao sugerido, só quem pode salvar o Monitoramento.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'fb000000-0000-4000-8000-000000000001', true);
select is(public.save_signal_daily_cap('fb100000-0000-4000-8000-000000000001', 'fb300000-0000-4000-8000-000000000001', 30), 30,
  'a Administradora baixa o limite para 30 (o sugerido é 48)');
select is(public.save_signal_daily_cap('fb100000-0000-4000-8000-000000000001', 'fb300000-0000-4000-8000-000000000001', 48), 48,
  'o limite igual ao sugerido vale');
select is(public.save_signal_daily_cap('fb100000-0000-4000-8000-000000000001', 'fb300000-0000-4000-8000-000000000001', 1), 1,
  'e o menor limite é 1');
select throws_ok(
  $$select public.save_signal_daily_cap('fb100000-0000-4000-8000-000000000001', 'fb300000-0000-4000-8000-000000000001', 49)$$,
  '22023', 'daily credit cap invalid: acima_do_sugerido', 'subir acima do custo máximo de um dia é recusado');
select throws_ok(
  $$select public.save_signal_daily_cap('fb100000-0000-4000-8000-000000000001', 'fb300000-0000-4000-8000-000000000001', 0)$$,
  '22023', 'daily credit cap invalid: limite_invalido', 'zero é recusado');
select throws_ok(
  $$select public.save_signal_daily_cap('fb100000-0000-4000-8000-000000000001', 'fb300000-0000-4000-8000-000000000001', -3)$$,
  '22023', 'daily credit cap invalid: limite_invalido', 'e negativo também');
select throws_ok(
  $$select public.save_signal_daily_cap('fb100000-0000-4000-8000-000000000001', 'fb300000-0000-4000-8000-000000000001', null)$$,
  '22023', 'daily credit cap invalid: limite_invalido', 'vazio não tira o limite: só se baixa');
select throws_ok(
  $$select public.save_signal_daily_cap('fb100000-0000-4000-8000-000000000001', 'fb300000-0000-4000-8000-000000000015', 5)$$,
  '22023', 'daily credit cap invalid: sem_estimativa', 'sem Contas no escopo não há custo para limitar');
select throws_ok(
  $$select public.save_signal_daily_cap('fb100000-0000-4000-8000-000000000001', 'fb300000-0000-4000-8000-000000000006', 5)$$,
  '22023', 'daily credit cap invalid: tipo_sem_limite', 'o Sinal interno não gasta crédito e não tem limite por dia');
select throws_ok(
  $$select public.save_signal_daily_cap('fb100000-0000-4000-8000-000000000001', 'fb300000-0000-4000-8000-000000000016', 5)$$,
  'P0002', 'monitor not found', 'o Monitoramento de outro Workspace é "não encontrado"');
reset role;
select is((select m.daily_credit_cap from private.signal_monitors m where m.id = 'fb300000-0000-4000-8000-000000000001'), 1,
  'o último limite válido ficou guardado; as recusas não mexeram nele');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'fb000000-0000-4000-8000-000000000002', true);
select throws_ok(
  $$select public.save_signal_daily_cap('fb100000-0000-4000-8000-000000000001', 'fb300000-0000-4000-8000-000000000001', 10)$$,
  '42501', 'only the creator or an administrator can change this monitor', 'um membro não muda o limite do Sinal dos outros');
select is(public.save_signal_daily_cap('fb100000-0000-4000-8000-000000000001', 'fb300000-0000-4000-8000-000000000005', 4), 4,
  'mas muda o do próprio Sinal (1 rodada por dia de 4 créditos: no máximo 4)');
select set_config('request.jwt.claim.sub', 'fb000000-0000-4000-8000-000000000005', true);
select throws_ok(
  $$select public.save_signal_daily_cap('fb100000-0000-4000-8000-000000000001', 'fb300000-0000-4000-8000-000000000001', 10)$$,
  '42501', 'active workspace membership required', 'quem não participa do Workspace não muda o limite');
reset role;


-- 4. A varredura da Conta e o limite por dia. Teto, M3: limite de 6 créditos, 2 por Conta. A Rodada agendada do dia 02/02 e a do
-- manual somam no mesmo dia.
create temporary table v (k text primary key, outcome text, rid uuid) on commit drop;
create function pg_temp.conta(p_ws integer, p_i integer) returns uuid language sql as $f$
  select ('fb200000-00' || lpad(p_ws::text, 2, '0') || '-4000-8000-' || lpad(p_i::text, 12, '0'))::uuid
$f$;
create function pg_temp.varrer(p_chave text, p_ws integer, p_monitor integer, p_conta integer, p_slot timestamptz,
                               p_manual uuid default null, p_liquidar boolean default true) returns void language plpgsql as $f$
declare
  v_o record;
begin
  select * into v_o from public.begin_account_scan(
    ('fb100000-0000-4000-8000-' || lpad(p_ws::text, 12, '0'))::uuid, 'fb000000-0000-4000-8000-000000000001',
    ('fb300000-0000-4000-8000-' || lpad(p_monitor::text, 12, '0'))::uuid, pg_temp.conta(p_ws, p_conta), p_slot,
    case when p_manual is null then 'agenda' else 'manual' end, p_manual);
  insert into v values (p_chave, v_o.outcome, v_o.reservation_id);
  if v_o.outcome = 'go' and p_liquidar then
    perform public.end_account_scan(v_o.reservation_id, true);
  end if;
end;
$f$;

select pg_temp.varrer('m3a1', 8, 3, 1, '2026-02-02 11:00:00+00');
select pg_temp.varrer('m3a2', 8, 3, 2, '2026-02-02 11:00:00+00');
select pg_temp.varrer('m3a3', 8, 3, 3, '2026-02-02 11:00:00+00');
select pg_temp.varrer('m3a4', 8, 3, 4, '2026-02-02 11:00:00+00');
select pg_temp.varrer('m3a5', 8, 3, 5, '2026-02-02 11:00:00+00');
select is(
  (select string_agg(v.k || '=' || v.outcome, ',' order by v.k) from v where v.k like 'm3%'),
  'm3a1=go,m3a2=go,m3a3=go,m3a4=teto_diario,m3a5=teto_diario',
  'o limite de 6 corta no ponto certo: 3 Contas a 2 créditos cabem; a quarta e a quinta voltam teto_diario');
select is(
  (select count(*)::int from private.credit_reservations r where r.action_key like 'scan:fb300000-0000-4000-8000-000000000003:%'),
  3, 'e a Conta cortada não reserva nem cobra: só há 3 reservas');
select is(private.signal_day_credits('fb100000-0000-4000-8000-000000000008', 'fb300000-0000-4000-8000-000000000003'), 6::numeric,
  'o gasto do dia é de 6 créditos');
select is(
  (select t.booked - t.reserved from private.credit_totals('fb100000-0000-4000-8000-000000000008') t), 994::numeric,
  'e o saldo caiu 6 do 1.000 (a Conta cortada não foi cobrada)');
select is(
  (select s.outcome from public.begin_account_scan('fb100000-0000-4000-8000-000000000008', 'fb000000-0000-4000-8000-000000000001',
    'fb300000-0000-4000-8000-000000000003', pg_temp.conta(8, 1), '2026-02-02 11:00:00+00') s),
  'done', 'a Conta já cobrada nesta Rodada volta "done", mesmo com o limite do dia batido');

-- A Rodada registra só o que foi verificado: 3 Contas, 6 créditos, parada pelo limite por dia (e não é Rodada pulada).
select public.open_signal_run('fb300000-0000-4000-8000-000000000003', '2026-02-02 11:00:00+00');
select public.add_signal_run_progress(
  (select m.current_run_id from private.signal_monitors m where m.id = 'fb300000-0000-4000-8000-000000000003'),
  3, 0, 0, 0, (select array_agg(v.rid order by v.k) from v where v.k in ('m3a1', 'm3a2', 'm3a3')), 'teto_diario');
select public.finish_signal_monitor_run('fb300000-0000-4000-8000-000000000003', 3, null, false);
select is(
  (select concat_ws('|', x.state, x.stop_reason, x.accounts_checked, x.credits_charged)
   from private.signal_monitor_runs x where x.monitor_id = 'fb300000-0000-4000-8000-000000000003'),
  'concluida|teto_diario|3|6', 'a Rodada parcial cobra só o verificado: 3 Contas e 6 créditos, parada pelo limite por dia');
select is(
  (select m.consecutive_skips from private.signal_monitors m where m.id = 'fb300000-0000-4000-8000-000000000003'), 0,
  'e uma Rodada que verificou não é Rodada pulada');

-- O manual conta no dia (M7, limite de 4): uma reservada agendada, uma manual e a terceira já não cabe.
insert into private.credit_reservations (workspace_id, action, action_key, quantity, unit_credits, amount, status, settled_quantity, created_at, closed_at)
values
  -- Ontem (um minuto antes do começo do dia em Brasília): não conta.
  ('fb100000-0000-4000-8000-000000000008', 'account_scan',
   'scan:fb300000-0000-4000-8000-000000000007:' || pg_temp.conta(8, 5)::text || ':1700000000', 4, 1, 4, 'settled', 4,
   private.signal_day_start() - interval '1 minute', private.signal_day_start() - interval '1 minute'),
  -- Solta hoje (a Conta que falhou): não conta.
  ('fb100000-0000-4000-8000-000000000008', 'account_scan',
   'scan:fb300000-0000-4000-8000-000000000007:' || pg_temp.conta(8, 4)::text || ':1700000001', 2, 1, 2, 'released', null,
   private.signal_day_start() + interval '1 minute', private.signal_day_start() + interval '2 minutes'),
  -- A busca da reativação do mesmo Monitoramento tem outra chave: não conta.
  ('fb100000-0000-4000-8000-000000000008', 'account_scan',
   'rescan:fb300000-0000-4000-8000-000000000007:' || pg_temp.conta(8, 4)::text, 2, 1, 2, 'settled', 2,
   private.signal_day_start() + interval '1 minute', private.signal_day_start() + interval '2 minutes');
select is(private.signal_day_credits('fb100000-0000-4000-8000-000000000008', 'fb300000-0000-4000-8000-000000000007'), 0::numeric,
  'o que passou ontem, a reserva solta e a busca da reativação não entram na soma de hoje');
select pg_temp.varrer('m7a1', 8, 7, 1, '2026-02-02 12:00:00+00', null, false);
select pg_temp.varrer('m7a2', 8, 7, 2, '2026-02-02 12:00:00+00', 'fb400000-0000-4000-8000-000000000001');
select pg_temp.varrer('m7a3', 8, 7, 3, '2026-02-02 12:00:00+00');
select is(
  (select string_agg(v.k || '=' || v.outcome, ',' order by v.k) from v where v.k like 'm7%'),
  'm7a1=go,m7a2=go,m7a3=teto_diario',
  'a Rodada manual conta no dia: a agendada reservou 2, a manual 2, e a terceira Conta já não cabe');
select is(private.signal_day_credits('fb100000-0000-4000-8000-000000000008', 'fb300000-0000-4000-8000-000000000007'), 4::numeric,
  'a soma conta a reservada (ainda em andamento) e a liquidada');
select pg_temp.varrer('m7a1b', 8, 7, 1, '2026-02-02 12:00:00+00', null, false);
select is(
  (select concat_ws('|', b.outcome, b.rid = a.rid) from v a join v b on a.k = 'm7a1' and b.k = 'm7a1b'),
  'resume|t', 'a reserva que já existe continua (resume) mesmo com o limite batido: a Conta já reservada não é refeita');

-- O mesmo cálculo para o runner antes de uma cascata.
reset role;
select is(public.signal_round_exceeds_daily_cap('fb300000-0000-4000-8000-000000000003'), true,
  'o limite de hoje já foi todo gasto: a Rodada inteira não cabe');
select is(public.signal_round_exceeds_daily_cap('fb300000-0000-4000-8000-000000000005'), false,
  'cabe uma Rodada igual ao limite quando nada foi gasto (M5: 4 créditos de limite e de preço)');
select is(public.signal_round_exceeds_daily_cap('fb300000-0000-4000-8000-000000000002'), false, 'sem limite por dia, nunca estoura');
select is(public.signal_round_exceeds_daily_cap('fb300000-0000-4000-8000-000000000099'), false, 'e um Monitoramento que não existe não estoura');
select is(
  (select has_function_privilege('anon', 'public.signal_round_exceeds_daily_cap(uuid)', 'execute')
       or has_function_privilege('authenticated', 'public.signal_round_exceeds_daily_cap(uuid)', 'execute')
       or has_function_privilege('anon', 'public.begin_account_scan(uuid, uuid, uuid, uuid, timestamptz, text, uuid)', 'execute')
       or has_function_privilege('authenticated', 'public.begin_account_scan(uuid, uuid, uuid, uuid, timestamptz, text, uuid)', 'execute')),
  false, 'o navegador não chama a conta do runner nem a varredura');
select is(
  (select has_function_privilege('service_role', 'public.signal_round_exceeds_daily_cap(uuid)', 'execute')),
  true, 'só o servidor chama');
select is(
  (select bool_or(has_function_privilege('authenticated', f, 'execute') or has_function_privilege('anon', f, 'execute'))
   from unnest(array[
     'private.signal_day_credits(uuid, uuid)', 'private.signal_round_price(uuid, uuid)',
     'private.signal_cost_estimate(uuid, uuid, jsonb)', 'private.signal_price_limit(text)', 'private.signal_day_start(timestamptz)'
   ]) f),
  false, 'as contas do preço ficam no banco: ninguém de fora as chama');

-- "Rodar agora" respeita o limite por dia: bloqueado quando nem uma Conta cabe, livre quando cabe.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'fb000000-0000-4000-8000-000000000001', true);
select is(
  (select q.bloqueio from public.quote_signal_run('fb100000-0000-4000-8000-000000000008', 'fb300000-0000-4000-8000-000000000007') q),
  'teto_diario', 'Rodar agora com o limite do dia batido é bloqueado na prévia');
select is(
  (select q.bloqueio from public.quote_signal_run('fb100000-0000-4000-8000-000000000008', 'fb300000-0000-4000-8000-000000000003') q),
  'teto_diario', 'também no outro Sinal com limite');
select throws_ok(
  $$select public.request_signal_run_now('fb100000-0000-4000-8000-000000000008', 'fb300000-0000-4000-8000-000000000003')$$,
  'P0001', 'signal run blocked: teto_diario', 'e o pedido é recusado com o mesmo código');
select is(
  (select q.bloqueio from public.quote_signal_run('fb100000-0000-4000-8000-000000000001', 'fb300000-0000-4000-8000-000000000005') q),
  null, 'com folga no limite, a prévia libera');
reset role;

-- A prévia bate com o que a Rodada de fato cobra, no mesmo Plano: M2 (3 Contas, sem limite).
create temporary table cot (por_rodada integer) on commit drop;
grant all on cot to authenticated;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'fb000000-0000-4000-8000-000000000001', true);
insert into cot select q.por_rodada from public.quote_signal_schedule('fb100000-0000-4000-8000-000000000001', 'fb300000-0000-4000-8000-000000000002') q;
reset role;
select pg_temp.varrer('m2a1', 1, 2, 1, '2026-02-03 11:00:00+00');
select pg_temp.varrer('m2a2', 1, 2, 2, '2026-02-03 11:00:00+00');
select pg_temp.varrer('m2a3', 1, 2, 3, '2026-02-03 11:00:00+00');
select is(
  (select sum(r.unit_credits * r.settled_quantity)::integer from private.credit_reservations r
   where r.action_key like 'scan:fb300000-0000-4000-8000-000000000002:%' and r.status = 'settled'),
  (select c.por_rodada from cot c), 'a Rodada inteira cobra exatamente o que a cotação disse: 6 créditos');
select pg_temp.varrer('m2a1b', 1, 2, 1, '2026-02-03 11:00:00+00');
select is(
  (select v.outcome from v where v.k = 'm2a1b'), 'done', 'repetir a Rodada não cobra duas vezes');
select is(
  (select count(*)::int from private.credit_reservations r where r.action_key like 'scan:fb300000-0000-4000-8000-000000000002:%'), 3,
  'e continua uma reserva por Conta');

-- A Rodada parcial por falta de saldo cobra só o verificado: Parcial tem saldo para 2 Contas (4 créditos) de 5.
select pg_temp.varrer('m14a1', 9, 14, 1, '2026-02-03 11:00:00+00');
select pg_temp.varrer('m14a2', 9, 14, 2, '2026-02-03 11:00:00+00');
select pg_temp.varrer('m14a3', 9, 14, 3, '2026-02-03 11:00:00+00');
select is(
  (select string_agg(v.k || '=' || v.outcome, ',' order by v.k) from v where v.k like 'm14%'),
  'm14a1=go,m14a2=go,m14a3=no_credits', 'sem saldo para a terceira Conta, o runner para');
select public.open_signal_run('fb300000-0000-4000-8000-000000000014', '2026-02-03 11:00:00+00');
select public.add_signal_run_progress(
  (select m.current_run_id from private.signal_monitors m where m.id = 'fb300000-0000-4000-8000-000000000014'),
  2, 0, 0, 0, (select array_agg(v.rid order by v.k) from v where v.k in ('m14a1', 'm14a2')), 'sem_creditos');
select public.finish_signal_monitor_run('fb300000-0000-4000-8000-000000000014', 2, 'Sem créditos', false);
select is(
  (select concat_ws('|', x.stop_reason, x.accounts_checked, x.credits_charged) from private.signal_monitor_runs x
   where x.monitor_id = 'fb300000-0000-4000-8000-000000000014'),
  'sem_creditos|2|4', 'a Rodada parcial cobra só o verificado: 2 Contas e 4 créditos');
select is(
  (select t.booked - t.reserved from private.credit_totals('fb100000-0000-4000-8000-000000000009') t), 0::numeric,
  'o saldo foi a zero e nada foi cobrado a mais');
select is(
  (select concat_ws('|', m.consecutive_skips, m.state) from private.signal_monitors m where m.id = 'fb300000-0000-4000-8000-000000000014'),
  '0|ativo', 'a Rodada que verificou algo, mesmo parando por falta de créditos, não conta como pulada');

select throws_ok(
  $$select public.add_signal_run_progress('fb300000-0000-4000-8000-000000000099', 0, 0, 0, 0, '{}', 'inventado')$$,
  '22023', 'invalid stop reason', 'o motivo da parada tem lista fechada');

-- 5. Sem créditos a Rodada é pulada; a terceira seguida pausa o Sinal. M5, do Beto, ativo, um horário.
create function pg_temp.rodada(p_monitor integer, p_dia integer, p_motivo text, p_verificadas integer default 0,
                               p_creditos integer default 0, p_continuar boolean default false) returns void language plpgsql as $f$
declare
  v_id uuid := ('fb300000-0000-4000-8000-' || lpad(p_monitor::text, 12, '0'))::uuid;
begin
  perform public.open_signal_run(v_id, '2026-03-01 13:00:00+00'::timestamptz + make_interval(days => p_dia));
  perform public.add_signal_run_progress(
    (select m.current_run_id from private.signal_monitors m where m.id = v_id), p_verificadas, 0, 0, 0, '{}', p_motivo, p_creditos);
  perform public.finish_signal_monitor_run(v_id, p_verificadas, null, p_continuar);
end;
$f$;
create function pg_temp.situacao(p_monitor integer) returns text language sql as $f$
  select concat_ws('|', m.state, m.consecutive_skips, coalesce(m.paused_reason, '-'), m.next_run_at is not null)
  from private.signal_monitors m where m.id = ('fb300000-0000-4000-8000-' || lpad(p_monitor::text, 12, '0'))::uuid
$f$;

select pg_temp.rodada(5, 1, 'sem_creditos');
select is(pg_temp.situacao(5), 'ativo|1|-|t', 'a primeira Rodada sem créditos é pulada: o Sinal continua ativo');
select is(
  (select concat_ws('|', x.state, x.stop_reason, x.credits_charged, x.accounts_checked) from private.signal_monitor_runs x
   where x.monitor_id = 'fb300000-0000-4000-8000-000000000005'),
  'concluida|sem_creditos|0|0', 'a Rodada pulada fica registrada com o motivo e sem cobrança');
select pg_temp.rodada(5, 2, 'sem_creditos');
select is(pg_temp.situacao(5), 'ativo|2|-|t', 'a segunda segue ativo');

-- A Rodada que continua em outra chamada não conta até fechar, e fechada conta uma vez só.
select public.open_signal_run('fb300000-0000-4000-8000-000000000005', '2026-03-04 13:00:00+00');
select public.add_signal_run_progress(
  (select m.current_run_id from private.signal_monitors m where m.id = 'fb300000-0000-4000-8000-000000000005'), 0, 0, 0, 0, '{}', 'sem_creditos');
select public.finish_signal_monitor_run('fb300000-0000-4000-8000-000000000005', 0, null, true);
select is(pg_temp.situacao(5), 'ativo|2|-|t', 'a continuação de uma Rodada ainda aberta não conta');
select public.finish_signal_monitor_run('fb300000-0000-4000-8000-000000000005', 0, null, false);
select is(pg_temp.situacao(5), 'pausado|3|sem_creditos|f', 'na terceira seguida o Sinal pausa por falta de créditos, sem próxima Rodada');
select is(
  (select count(*)::int from private.signal_monitor_runs x where x.monitor_id = 'fb300000-0000-4000-8000-000000000005'), 3,
  'foram três Rodadas registradas, e a continuação ficou na mesma linha');
select is(
  (select concat_ws('|', n.kind, n.title, n.link) from private.workspace_notices n where n.workspace_id = 'fb100000-0000-4000-8000-000000000001'),
  'sinal_pausado|Sinal pausado por falta de créditos: Vagas do Beto|/sinais',
  'e os Administradores recebem um Aviso do Workspace, uma vez');
select is(
  (select m.current_run_id is null and m.claimed_until is null and m.current_slot_at is null
   from private.signal_monitors m where m.id = 'fb300000-0000-4000-8000-000000000005'),
  true, 'a Rodada aberta, a reserva e o horário são limpos');

-- A lista traz o limite por dia, as Rodadas puladas e o motivo da pausa, para qualquer participante.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'fb000000-0000-4000-8000-000000000002', true);
select is(
  (select concat_ws('|', l.state, l.daily_credit_cap, l.consecutive_skips, l.paused_reason)
   from public.list_signal_monitors('fb100000-0000-4000-8000-000000000001') l where l.id = 'fb300000-0000-4000-8000-000000000005'),
  'pausado|4|3|sem_creditos', 'list_signal_monitors diz o estado, o limite por dia, as Rodadas puladas e o motivo');
select is(
  (select l.daily_credit_cap from public.list_signal_monitors('fb100000-0000-4000-8000-000000000001') l where l.id = 'fb300000-0000-4000-8000-000000000002'),
  null, 'o Sinal sem limite aparece com o limite nulo');

-- Reativar zera (pelo estado). O Beto é quem criou.
select public.set_signal_monitor_state('fb300000-0000-4000-8000-000000000005', 'ativo');
reset role;
select is(pg_temp.situacao(5), 'ativo|0|-|t', 'reativar zera as Rodadas puladas e o motivo, e aponta para a próxima Rodada');
select is(
  (select m.next_run_at = private.next_signal_run(m.schedule, now()) and m.next_run_at > now()
   from private.signal_monitors m where m.id = 'fb300000-0000-4000-8000-000000000005'),
  true, 'o próximo horário é o primeiro depois de agora, sem compensar o que se perdeu');

-- Só as Rodadas seguidas pausam: uma que verifica zera a conta, e outro fim não conta.
select pg_temp.rodada(5, 10, 'sem_creditos');
select is(pg_temp.situacao(5), 'ativo|1|-|t', 'pulada: 1');
select pg_temp.rodada(5, 11, 'concluida', 1, 2);
select is(pg_temp.situacao(5), 'ativo|0|-|t', 'uma Rodada que verificou e cobrou zera a conta');
select pg_temp.rodada(5, 12, 'sem_creditos');
select pg_temp.rodada(5, 13, 'sem_creditos');
select is(pg_temp.situacao(5), 'ativo|2|-|t', 'duas puladas depois de uma que rodou ainda não pausam');
select pg_temp.rodada(5, 14, 'teto');
select pg_temp.rodada(5, 15, 'teto_diario');
select pg_temp.rodada(5, 16, 'erro');
select pg_temp.rodada(5, 17, 'concluida');
select is(pg_temp.situacao(5), 'ativo|2|-|t', 'o limite do mês, o limite por dia, o erro e a Rodada sem novidade não contam como puladas');
select pg_temp.rodada(5, 18, 'sem_creditos');
select is(pg_temp.situacao(5), 'pausado|3|sem_creditos|f', 'e a terceira pulada em sequência pausa');

-- O editor salvando o Sinal que continua pausado não apaga o motivo; passar a ativo zera; pausar pela pessoa não deixa motivo.
insert into r select 'aud5', null, m.audience::text from private.signal_monitors m where m.id = 'fb300000-0000-4000-8000-000000000005';
set local role authenticated;
select set_config('request.jwt.claim.sub', 'fb000000-0000-4000-8000-000000000002', true);
select public.save_signal_monitor('fb100000-0000-4000-8000-000000000001', 'fb300000-0000-4000-8000-000000000005', 'vaga_linkedin', 'Vagas do Beto',
  'pausado', (select r.txt::jsonb from r where r.k = 'aud5'), '{}', 24);
reset role;
select is(pg_temp.situacao(5), 'pausado|3|sem_creditos|f', 'o editor salvando o Sinal ainda pausado mantém o motivo');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'fb000000-0000-4000-8000-000000000002', true);
select public.set_signal_monitor_state('fb300000-0000-4000-8000-000000000005', 'pausado');
reset role;
select is(pg_temp.situacao(5), 'pausado|3|sem_creditos|f', 'pausar de novo o que já está pausado também mantém');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'fb000000-0000-4000-8000-000000000002', true);
select public.save_signal_monitor('fb100000-0000-4000-8000-000000000001', 'fb300000-0000-4000-8000-000000000005', 'vaga_linkedin', 'Vagas do Beto',
  'ativo', (select r.txt::jsonb from r where r.k = 'aud5'), '{}', 24);
reset role;
select is(pg_temp.situacao(5), 'ativo|0|-|t', 'reativar pelo editor também zera');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'fb000000-0000-4000-8000-000000000002', true);
select public.set_signal_monitor_state('fb300000-0000-4000-8000-000000000005', 'pausado');
reset role;
select is(
  (select concat_ws('|', m.state, m.consecutive_skips, coalesce(m.paused_reason, '-')) from private.signal_monitors m
   where m.id = 'fb300000-0000-4000-8000-000000000005'),
  'pausado|0|-', 'a pausa da pessoa não leva motivo');

-- O Sinal que o runner encontra pausado não é pausado de novo, e a pausa só vale para o ativo.
update private.signal_monitors set state = 'ativo' where id = 'fb300000-0000-4000-8000-000000000005';
update private.signal_monitors set state = 'pausado' where id = 'fb300000-0000-4000-8000-000000000005';
update private.signal_monitors set consecutive_skips = 2, state = 'pausado' where id = 'fb300000-0000-4000-8000-000000000005';
select pg_temp.rodada(5, 30, 'sem_creditos');
select is(pg_temp.situacao(5), 'pausado|3|-|t', 'o Sinal que a pessoa já tinha pausado não muda de estado nem ganha motivo, mesmo com a Rodada em curso pulada');


-- O Aviso do Workspace do Sinal pausado é dos Administradores.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'fb000000-0000-4000-8000-000000000001', true);
select is(
  (select count(*)::int from public.list_workspace_notices('fb100000-0000-4000-8000-000000000001') n where n.kind = 'sinal_pausado'), 2,
  'a Administradora lê os Avisos do Sinal pausado, um por pausa (o Sinal pausou duas vezes)');
select set_config('request.jwt.claim.sub', 'fb000000-0000-4000-8000-000000000002', true);
select is(
  (select count(*)::int from public.list_workspace_notices('fb100000-0000-4000-8000-000000000001') n where n.kind = 'sinal_pausado'), 0,
  'e um membro não lê');
reset role;

-- O começo do dia é o de Brasília: a reserva exatamente nele conta; um segundo antes, não.
insert into private.credit_reservations (workspace_id, action, action_key, quantity, unit_credits, amount, status, settled_quantity, created_at, closed_at)
values
  ('fb100000-0000-4000-8000-000000000001', 'account_scan',
   'scan:fb300000-0000-4000-8000-000000000008:' || pg_temp.conta(1, 1)::text || ':1700000100', 1, 1, 1, 'settled', 1,
   private.signal_day_start() - interval '1 second', private.signal_day_start()),
  ('fb100000-0000-4000-8000-000000000001', 'account_scan',
   'scan:fb300000-0000-4000-8000-000000000008:' || pg_temp.conta(1, 2)::text || ':1700000101', 2, 1, 2, 'settled', 2,
   private.signal_day_start(), private.signal_day_start() + interval '1 second');
select is(private.signal_day_credits('fb100000-0000-4000-8000-000000000001', 'fb300000-0000-4000-8000-000000000008'), 2::numeric,
  'a reserva do começo do dia conta; a de um segundo antes (o dia anterior em Brasília) não');
select is(private.signal_day_start('2026-02-02 02:00:00+00'), '2026-02-01 03:00:00+00'::timestamptz,
  'o dia de 02/02 02:00 UTC ainda é 01/02 em Brasília: começa às 03:00 UTC de 01/02');
select is(private.signal_day_start('2026-02-02 03:00:00+00'), '2026-02-02 03:00:00+00'::timestamptz,
  'e às 03:00 UTC começa o dia 02/02');

-- A estrutura.
select has_column('private', 'signal_monitors', 'daily_credit_cap', 'o Monitoramento guarda o limite por dia');
select has_column('private', 'signal_monitors', 'consecutive_skips', 'as Rodadas puladas em sequência');
select has_column('private', 'signal_monitors', 'paused_reason', 'e o motivo da pausa');
select throws_ok(
  $$update private.signal_monitors set daily_credit_cap = 0 where id = 'fb300000-0000-4000-8000-000000000001'$$,
  '23514', null, 'o banco não aceita limite por dia zero');

select * from finish();
rollback;
