begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(132);

-- Agenda do Sinal (agente-de-sinal 03): os horários, os dias, a próxima Rodada, a recusa no servidor, a continuação que mantém o
-- horário (e não cobra a mesma Conta duas vezes), a Rodada perdida que não é compensada e o Monitoramento legado, que segue igual.
-- Os horários que importam são fixos e passados por parâmetro (BRT = UTC-3): nada depende de now() comparado com ordem. Onde a
-- função usa now() por dentro (terminar a Rodada, ativar, salvar a Agenda), o teste confere com a mesma função no mesmo now(),
-- que é um só dentro da transação. As listas saem por conjunto, nunca pela ordem de created_at.
-- Ana: Administradora do Norte. Beto: membro do Norte. Eva: de fora.

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
                        created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
                        is_sso_user, is_anonymous)
values
  ('fa000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'ana@norte.test', '', now(), now(), now(), '{}', '{}', false, false),
  ('fa000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'beto@norte.test', '', now(), now(), now(), '{}', '{}', false, false),
  ('fa000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'eva@fora.test', '', now(), now(), now(), '{}', '{}', false, false);

insert into public.workspaces (id, kind, name) values
  ('fa100000-0000-4000-8000-000000000001', 'empresa', 'Norte'),
  ('fa100000-0000-4000-8000-000000000002', 'empresa', 'Sul');
insert into private.workspace_contracts (workspace_id, tier_id, status, starts_at, monthly_credit_limit) values
  ('fa100000-0000-4000-8000-000000000001', 'profissional', 'ativo', date_trunc('month', now()), 100000),
  ('fa100000-0000-4000-8000-000000000002', 'profissional', 'ativo', date_trunc('month', now()), 100000);
insert into public.workspace_memberships (workspace_id, user_id, role, active) values
  ('fa100000-0000-4000-8000-000000000001', 'fa000000-0000-4000-8000-000000000001', 'admin', true),
  ('fa100000-0000-4000-8000-000000000001', 'fa000000-0000-4000-8000-000000000002', 'member', true),
  ('fa100000-0000-4000-8000-000000000002', 'fa000000-0000-4000-8000-000000000003', 'admin', true);
select public.grant_credits('fa100000-0000-4000-8000-000000000001', 1000, 'plano', 'saldo de teste');
select private.seed_contract_automation('fa100000-0000-4000-8000-000000000001');

insert into public.target_accounts (id, workspace_id, name, canonical_url, domain, linkedin_url, created_by) values
  ('fa200000-0000-4000-8000-000000000001', 'fa100000-0000-4000-8000-000000000001', 'Alfa', 'https://alfa.test', 'alfa.test',
   'https://www.linkedin.com/company/alfa', 'fa000000-0000-4000-8000-000000000001'),
  ('fa200000-0000-4000-8000-000000000002', 'fa100000-0000-4000-8000-000000000001', 'Beta', 'https://beta.test', 'beta.test',
   'https://www.linkedin.com/company/beta', 'fa000000-0000-4000-8000-000000000001'),
  ('fa200000-0000-4000-8000-000000000011', 'fa100000-0000-4000-8000-000000000002', 'Sul Um', 'https://sul1.test', 'sul1.test', null,
   'fa000000-0000-4000-8000-000000000003');
-- 51 Contas, uma além do limite de 50.
insert into public.target_accounts (id, workspace_id, name, canonical_url, domain, created_by)
select ('fa210000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid, 'fa100000-0000-4000-8000-000000000001',
       'Grande ' || lpad(i::text, 2, '0'), 'https://grande' || i || '.test', 'grande' || i || '.test', 'fa000000-0000-4000-8000-000000000001'
from generate_series(1, 51) i;

select public.set_signal_actor_state(a.actor_id, 'available', 'v1') from private.signal_actors a where a.signal_type = 'vaga_linkedin';

-- O horário marcado de A1: um instante fixo dentro da transação, 1 segundo atrás. Com a Rodada perdida (agente-de-sinal 05), o
-- relógio roda no horário vencido MAIS RECENTE; um horário que o relógio ainda não ultrapassou é o único jeito de a Rodada de A1
-- ter um horário previsível sem depender do dia em que o teste roda.
create temporary table ancora on commit drop as select date_trunc('second', now() - interval '1 second') as slot;

-- Os Monitoramentos. Quem não deve ser reivindicado pelo relógio tem a hora marcada num futuro distante (2999).
-- A1: com Agenda (08:00 e 14:00, seg-sex), ativo e vencido (seg 05/01/2026 08:00 BRT). L1 e L4: legados, ativos e vencidos.
-- L2: legado pausado. L3: legado em rascunho. S1: legado ativo (a Agenda chega depois). D1 e D2: rascunhos com Agenda.
-- P1: pausado com Agenda e uma Rodada que ficou pela metade. B1: 51 Contas, sem Agenda. R1: Rodada em andamento.
-- N1: a Rodada atrasada. I1: Sinal interno. BETO: do Beto. SUL: do Sul. G2 e G3: com Agenda, ativos.
insert into private.signal_monitors
  (id, workspace_id, signal_type, name, state, audience, criteria, every_hours, created_by, next_run_at, schedule, current_slot_at) values
  ('fa300000-0000-4000-8000-000000000001', 'fa100000-0000-4000-8000-000000000001', 'vaga_linkedin', 'A1', 'ativo',
   '{"accountIds":["fa200000-0000-4000-8000-000000000001","fa200000-0000-4000-8000-000000000002"]}', '{}', 24,
   'fa000000-0000-4000-8000-000000000001', (select slot from ancora),
   '{"horarios":["08:00","14:00"],"dias":[1,2,3,4,5],"fuso":"America/Sao_Paulo"}', null),
  ('fa300000-0000-4000-8000-000000000002', 'fa100000-0000-4000-8000-000000000001', 'vaga_linkedin', 'L1', 'ativo',
   '{"accountIds":["fa200000-0000-4000-8000-000000000001"]}', '{}', 6,
   'fa000000-0000-4000-8000-000000000001', '2026-01-05 11:00:00+00', null, null),
  ('fa300000-0000-4000-8000-000000000003', 'fa100000-0000-4000-8000-000000000001', 'vaga_linkedin', 'L2', 'pausado',
   '{"accountIds":["fa200000-0000-4000-8000-000000000001"]}', '{}', 12,
   'fa000000-0000-4000-8000-000000000001', '2026-01-05 11:00:00+00', null, null),
  ('fa300000-0000-4000-8000-000000000004', 'fa100000-0000-4000-8000-000000000001', 'vaga_linkedin', 'L3', 'rascunho',
   '{"accountIds":["fa200000-0000-4000-8000-000000000001"]}', '{}', 24,
   'fa000000-0000-4000-8000-000000000001', null, null, null),
  ('fa300000-0000-4000-8000-000000000005', 'fa100000-0000-4000-8000-000000000001', 'vaga_linkedin', 'S1', 'ativo',
   '{"accountIds":["fa200000-0000-4000-8000-000000000001"]}', '{}', 24,
   'fa000000-0000-4000-8000-000000000001', '2999-01-01 00:00:00+00', null, null),
  ('fa300000-0000-4000-8000-000000000006', 'fa100000-0000-4000-8000-000000000001', 'vaga_linkedin', 'D1', 'rascunho',
   '{"accountIds":["fa200000-0000-4000-8000-000000000001"]}', '{}', 24,
   'fa000000-0000-4000-8000-000000000001', null,
   '{"horarios":["09:00"],"dias":[1,2,3,4,5],"fuso":"America/Sao_Paulo"}', null),
  ('fa300000-0000-4000-8000-000000000007', 'fa100000-0000-4000-8000-000000000001', 'vaga_linkedin', 'P1', 'pausado',
   '{"accountIds":["fa200000-0000-4000-8000-000000000001"]}', '{}', 24,
   'fa000000-0000-4000-8000-000000000001', '2026-01-05 11:00:00+00',
   '{"horarios":["08:00","14:00"],"dias":[1,2,3,4,5],"fuso":"America/Sao_Paulo"}', '2026-01-05 11:00:00+00'),
  ('fa300000-0000-4000-8000-000000000008', 'fa100000-0000-4000-8000-000000000001', 'vaga_linkedin', 'D2', 'rascunho',
   '{"accountIds":["fa200000-0000-4000-8000-000000000001"]}', '{}', 24,
   'fa000000-0000-4000-8000-000000000001', null,
   '{"horarios":["10:00"],"dias":[1,2,3,4,5],"fuso":"America/Sao_Paulo"}', null),
  ('fa300000-0000-4000-8000-000000000010', 'fa100000-0000-4000-8000-000000000001', 'vaga_linkedin', 'R1', 'ativo',
   '{"accountIds":["fa200000-0000-4000-8000-000000000001"]}', '{}', 24,
   'fa000000-0000-4000-8000-000000000001', '2999-01-01 00:00:00+00',
   '{"horarios":["08:00"],"dias":[1,2,3,4,5],"fuso":"America/Sao_Paulo"}', '2026-01-05 11:00:00+00'),
  ('fa300000-0000-4000-8000-000000000011', 'fa100000-0000-4000-8000-000000000001', 'vaga_linkedin', 'N1', 'ativo',
   '{"accountIds":["fa200000-0000-4000-8000-000000000001"]}', '{}', 24,
   'fa000000-0000-4000-8000-000000000001', '2999-01-01 00:00:00+00',
   '{"horarios":["08:00","14:00"],"dias":[1,2,3,4,5],"fuso":"America/Sao_Paulo"}', '2026-01-05 11:00:00+00'),
  ('fa300000-0000-4000-8000-000000000012', 'fa100000-0000-4000-8000-000000000001', 'sem_resposta', 'I1', 'rascunho',
   '{"accountIds":["fa200000-0000-4000-8000-000000000001"]}', '{"dias":30}', 24,
   'fa000000-0000-4000-8000-000000000001', null, null, null),
  ('fa300000-0000-4000-8000-000000000014', 'fa100000-0000-4000-8000-000000000001', 'vaga_linkedin', 'BETO', 'rascunho',
   '{"accountIds":["fa200000-0000-4000-8000-000000000001"]}', '{}', 24,
   'fa000000-0000-4000-8000-000000000002', null, null, null),
  ('fa300000-0000-4000-8000-000000000015', 'fa100000-0000-4000-8000-000000000002', 'vaga_linkedin', 'SUL', 'rascunho',
   '{"accountIds":["fa200000-0000-4000-8000-000000000011"]}', '{}', 24,
   'fa000000-0000-4000-8000-000000000003', null, null, null),
  ('fa300000-0000-4000-8000-000000000016', 'fa100000-0000-4000-8000-000000000001', 'vaga_linkedin', 'G2', 'ativo',
   '{"accountIds":["fa200000-0000-4000-8000-000000000001"]}', '{}', 24,
   'fa000000-0000-4000-8000-000000000001', '2999-01-01 00:00:00+00',
   '{"horarios":["08:00","14:00"],"dias":[1,2,3,4,5],"fuso":"America/Sao_Paulo"}', null),
  ('fa300000-0000-4000-8000-000000000017', 'fa100000-0000-4000-8000-000000000001', 'vaga_linkedin', 'G3', 'ativo',
   '{"accountIds":["fa200000-0000-4000-8000-000000000001"]}', '{}', 24,
   'fa000000-0000-4000-8000-000000000001', '2999-01-01 00:00:00+00',
   '{"horarios":["08:00"],"dias":[1,2,3,4,5],"fuso":"America/Sao_Paulo"}', null),
  ('fa300000-0000-4000-8000-000000000019', 'fa100000-0000-4000-8000-000000000001', 'vaga_linkedin', 'G4', 'ativo',
   '{"accountIds":["fa200000-0000-4000-8000-000000000001"]}', '{}', 24,
   'fa000000-0000-4000-8000-000000000001', '2999-01-01 00:00:00+00',
   '{"horarios":["08:00","08:45"],"dias":[1,2,3,4,5],"fuso":"America/Sao_Paulo"}', null),
  ('fa300000-0000-4000-8000-000000000018', 'fa100000-0000-4000-8000-000000000001', 'vaga_linkedin', 'L4', 'ativo',
   '{"accountIds":["fa200000-0000-4000-8000-000000000001"]}', '{}', 48,
   'fa000000-0000-4000-8000-000000000001', '2026-01-05 11:00:00+00', null, null);
insert into private.signal_monitors (id, workspace_id, signal_type, name, state, audience, criteria, every_hours, created_by)
select 'fa300000-0000-4000-8000-000000000009', 'fa100000-0000-4000-8000-000000000001', 'vaga_linkedin', 'B1', 'rascunho',
       jsonb_build_object('accountIds', (select jsonb_agg(t.id) from public.target_accounts t where t.name like 'Grande %')),
       '{}', 24, 'fa000000-0000-4000-8000-000000000001';

-- 1. A estrutura e quem pode chamar o quê.
select has_column('private', 'signal_monitors', 'schedule', 'o Monitoramento tem a Agenda');
select has_column('private', 'signal_monitors', 'current_slot_at', 'e o horário da Rodada em andamento');
select is(
  (select count(*)::int from private.signal_monitors m where m.schedule is null and m.id in (
    'fa300000-0000-4000-8000-000000000002', 'fa300000-0000-4000-8000-000000000003', 'fa300000-0000-4000-8000-000000000004')),
  3, 'o Monitoramento sem Agenda é o legado: a coluna nasce nula');
select is(
  (select bool_and(not has_function_privilege('authenticated', f, 'execute') and not has_function_privilege('anon', f, 'execute'))
   from unnest(array[
     'private.next_signal_run(jsonb, timestamptz)',
     'private.validate_signal_schedule(jsonb, integer)',
     'private.normalize_signal_schedule(jsonb)',
     'private.signal_schedule_limit(text)',
     'private.signal_schedule_default_days()',
     'private.fail_signal_schedule(text)']) f),
  true, 'o cálculo, a validação e os limites ficam no servidor: o navegador não os chama');
select is(
  has_function_privilege('authenticated', 'public.save_signal_schedule(uuid, uuid, jsonb)', 'execute')
    and has_function_privilege('authenticated', 'public.preview_signal_schedule(jsonb, timestamptz, integer, integer)', 'execute')
    and not has_function_privilege('anon', 'public.save_signal_schedule(uuid, uuid, jsonb)', 'execute')
    and not has_function_privilege('anon', 'public.preview_signal_schedule(jsonb, timestamptz, integer, integer)', 'execute'),
  true, 'gravar a Agenda e ver a prévia são de quem está logado');
select is(
  has_function_privilege('service_role', 'public.claim_due_signal_monitors(integer)', 'execute')
    and has_function_privilege('service_role', 'public.finish_signal_monitor_run(uuid, integer, text, boolean)', 'execute')
    and not has_function_privilege('authenticated', 'public.claim_due_signal_monitors(integer)', 'execute')
    and not has_function_privilege('authenticated', 'public.finish_signal_monitor_run(uuid, integer, text, boolean)', 'execute'),
  true, 'o relógio continua só do servidor');
select is(
  (select array[private.signal_schedule_limit('step_minutes'), private.signal_schedule_limit('max_per_day'),
                private.signal_schedule_limit('min_gap_minutes')]),
  array[15, 12, 60], 'os limites (decididos pelo Kauê em 24/10/2026: 12 por dia, 1 h entre horários) estão numa função só');
select is(
  private.signal_schedule_limit('big_scope_accounts') is null and private.signal_schedule_limit('big_scope_max_per_day') is null,
  true, 'e as chaves do escopo grande saíram');
select is(private.signal_schedule_default_days(), '[1,2,3,4,5]'::jsonb, 'o padrão dos dias é seg-sex');
select is((select p.provolatile::text from pg_proc p where p.oid = 'private.next_signal_run(jsonb, timestamptz)'::regprocedure),
  'i', 'o cálculo da próxima Rodada é imutável');

-- 2. A tabela de casos da próxima Rodada. Cada linha: a Agenda, o instante de partida e o horário esperado, todos fixos (BRT = -03).
create temporary table casos (k text primary key, agenda jsonb, depois timestamptz, esperado timestamptz) on commit drop;
insert into casos values
  ('01 sexta 18:00 vai para a segunda 08:00', '{"horarios":["08:00","14:00"],"dias":[1,2,3,4,5]}',
   '2026-10-23 18:00:00-03', '2026-10-26 08:00:00-03'),
  ('02 o horário igual ao instante não conta', '{"horarios":["08:00","14:00"],"dias":[1,2,3,4,5]}',
   '2026-10-26 08:00:00-03', '2026-10-26 14:00:00-03'),
  ('03 um instante depois do horário, vale o seguinte', '{"horarios":["08:00","14:00"],"dias":[1,2,3,4,5]}',
   '2026-10-26 08:00:00.000001-03', '2026-10-26 14:00:00-03'),
  ('04 um instante antes do horário, vale o horário', '{"horarios":["08:00","14:00"],"dias":[1,2,3,4,5]}',
   '2026-10-26 07:59:59-03', '2026-10-26 08:00:00-03'),
  ('05 depois do último horário do dia, o primeiro do dia útil seguinte', '{"horarios":["08:00","14:00"],"dias":[1,2,3,4,5]}',
   '2026-10-26 14:00:00-03', '2026-10-27 08:00:00-03'),
  ('06 sábado de manhã vai para a segunda', '{"horarios":["08:00","14:00"],"dias":[1,2,3,4,5]}',
   '2026-10-24 10:00:00-03', '2026-10-26 08:00:00-03'),
  ('07 domingo com o fim de semana ligado roda no domingo', '{"horarios":["08:00","14:00"],"dias":[1,2,3,4,5,6,7]}',
   '2026-10-25 07:00:00-03', '2026-10-25 08:00:00-03'),
  ('08 só sábado e domingo, de segunda vai para o sábado', '{"horarios":["08:00"],"dias":[6,7]}',
   '2026-10-26 09:00:00-03', '2026-10-31 08:00:00-03'),
  ('09 virada do dia: 23:30 vai para 01:00 do dia seguinte', '{"horarios":["23:00","01:00"],"dias":[1,2,3,4,5]}',
   '2026-10-26 23:30:00-03', '2026-10-27 01:00:00-03'),
  ('10 virada do dia na sexta: o fim de semana desligado vai para a segunda 01:00', '{"horarios":["23:00","01:00"],"dias":[1,2,3,4,5]}',
   '2026-10-23 23:00:00-03', '2026-10-26 01:00:00-03'),
  ('11 um dia só: já passou o horário, vale o da semana seguinte', '{"horarios":["08:00"],"dias":[5]}',
   '2026-10-23 08:00:00-03', '2026-10-30 08:00:00-03'),
  ('12 meia-noite exata é um horário como outro', '{"horarios":["00:00","12:00"],"dias":[1,2,3,4,5,6,7]}',
   '2026-10-27 23:59:59-03', '2026-10-28 00:00:00-03'),
  ('13 o horário é de Brasília, não UTC (07:59:59 BRT ainda é antes)', '{"horarios":["08:00"],"dias":[1,2,3,4,5]}',
   '2026-10-26 10:59:59+00', '2026-10-26 11:00:00+00'),
  ('14 horários fora de ordem dão o mesmo resultado', '{"horarios":["14:00","08:00"],"dias":[5,1,3,2,4]}',
   '2026-10-23 18:00:00-03', '2026-10-26 08:00:00-03'),
  ('15 sem dias, valem os dias úteis', '{"horarios":["08:00"]}',
   '2026-10-24 09:00:00-03', '2026-10-26 08:00:00-03'),
  ('16 virada do ano', '{"horarios":["08:00","14:00"],"dias":[1,2,3,4,5]}',
   '2026-12-31 15:00:00-03', '2027-01-01 08:00:00-03'),
  ('17 passo de 15 minutos', '{"horarios":["08:15","08:45"],"dias":[1,2,3,4,5]}',
   '2026-10-26 08:15:00-03', '2026-10-26 08:45:00-03'),
  ('18 seis horários no mesmo dia', '{"horarios":["00:00","04:00","08:00","12:00","16:00","20:00"],"dias":[1,2,3,4,5,6,7]}',
   '2026-10-26 16:01:00-03', '2026-10-26 20:00:00-03');
select is(private.next_signal_run(c.agenda, c.depois), c.esperado, c.k) from casos c order by c.k;
select is(private.next_signal_run('{"horarios":["08:00"],"dias":[1]}', null), null, 'sem instante de partida não há próxima Rodada');

-- 3. A validação: o que o servidor aceita e o que ele recusa, cada recusa com o seu código.
select lives_ok($$select private.validate_signal_schedule('{"horarios":["08:00"],"dias":[1,2,3,4,5],"fuso":"America/Sao_Paulo"}', 10)$$,
  'um horário em dias úteis é válido');
select lives_ok($$select private.validate_signal_schedule('{"horarios":["00:00","04:00","08:00","12:00","16:00","20:00"],"dias":[1,2,3,4,5,6,7]}', 10)$$,
  'seis horários, 4 h entre eles, são válidos');
select lives_ok($$select private.validate_signal_schedule('{"horarios":["14:00","08:00"],"dias":[3,1]}', 0)$$,
  'a ordem dos horários e dos dias não importa');
select lives_ok($$select private.validate_signal_schedule('{"horarios":["08:00","09:00"],"dias":[1]}', 0)$$,
  'exatamente 1 h entre dois horários é válido');
select lives_ok($$select private.validate_signal_schedule('{"horarios":["23:00","00:00"],"dias":[1]}', 0)$$,
  'a virada do dia: 23:00 e 00:00 são 1 h');
select lives_ok($$select private.validate_signal_schedule('{"horarios":["08:00","09:00","10:00","11:00","12:00","13:00","14:00","15:00","16:00","17:00","18:00","19:00"],"dias":[1]}', 0)$$,
  'doze horários, de hora em hora, são válidos');
select lives_ok($$select private.validate_signal_schedule('{"horarios":["08:00"]}', 0)$$,
  'sem dias nem fuso valem os padrões');
select throws_ok($$select private.validate_signal_schedule('{"horarios":["08:00","09:00","10:00","11:00","12:00","13:00","14:00","15:00","16:00","17:00","18:00","19:00","20:00"],"dias":[1]}', 0)$$,
  '22023', 'signal schedule invalid: muitos_horarios', 'treze horários são recusados (o máximo são doze por dia)');
select throws_ok($$select private.validate_signal_schedule('{"horarios":["08:00","08:45"],"dias":[1]}', 0)$$,
  '22023', 'signal schedule invalid: intervalo_curto', '45 minutos entre dois horários é recusado');
select throws_ok($$select private.validate_signal_schedule('{"horarios":["23:30","00:15"],"dias":[1]}', 0)$$,
  '22023', 'signal schedule invalid: intervalo_curto', 'a virada do dia também conta: 23:30 e 00:15 são 45 minutos');
select throws_ok($$select private.validate_signal_schedule('{"horarios":["08:00","08:00"],"dias":[1]}', 0)$$,
  '22023', 'signal schedule invalid: horario_repetido', 'o mesmo horário duas vezes é recusado');
select throws_ok($$select private.validate_signal_schedule('{"horarios":[],"dias":[1]}', 0)$$,
  '22023', 'signal schedule invalid: sem_horario', 'sem horário é recusado');
select throws_ok($$select private.validate_signal_schedule('{"dias":[1]}', 0)$$,
  '22023', 'signal schedule invalid: sem_horario', 'e a Agenda sem a chave dos horários também');
select throws_ok($$select private.validate_signal_schedule('{"horarios":["8:00"],"dias":[1]}', 0)$$,
  '22023', 'signal schedule invalid: horario_invalido', 'horário sem o zero à esquerda é recusado');
select throws_ok($$select private.validate_signal_schedule('{"horarios":["24:00"],"dias":[1]}', 0)$$,
  '22023', 'signal schedule invalid: horario_invalido', '24:00 não existe');
select throws_ok($$select private.validate_signal_schedule('{"horarios":["08:10"],"dias":[1]}', 0)$$,
  '22023', 'signal schedule invalid: horario_invalido', 'só de 15 em 15 minutos');
select throws_ok($$select private.validate_signal_schedule('{"horarios":["08:00:00"],"dias":[1]}', 0)$$,
  '22023', 'signal schedule invalid: horario_invalido', 'segundos não entram');
select throws_ok($$select private.validate_signal_schedule('{"horarios":[800],"dias":[1]}', 0)$$,
  '22023', 'signal schedule invalid: horario_invalido', 'horário que não é texto é recusado');
select throws_ok($$select private.validate_signal_schedule('{"horarios":["08:00"],"dias":[]}', 0)$$,
  '22023', 'signal schedule invalid: sem_dia', 'sem dia é recusado');
select throws_ok($$select private.validate_signal_schedule('{"horarios":["08:00"],"dias":[0]}', 0)$$,
  '22023', 'signal schedule invalid: dia_invalido', 'o dia 0 não existe');
select throws_ok($$select private.validate_signal_schedule('{"horarios":["08:00"],"dias":[8]}', 0)$$,
  '22023', 'signal schedule invalid: dia_invalido', 'o dia 8 não existe');
select throws_ok($$select private.validate_signal_schedule('{"horarios":["08:00"],"dias":["1"]}', 0)$$,
  '22023', 'signal schedule invalid: dia_invalido', 'dia que não é número é recusado');
select throws_ok($$select private.validate_signal_schedule('{"horarios":["08:00"],"dias":[1.5]}', 0)$$,
  '22023', 'signal schedule invalid: dia_invalido', 'dia quebrado é recusado');
select throws_ok($$select private.validate_signal_schedule('{"horarios":["08:00"],"dias":[1,1]}', 0)$$,
  '22023', 'signal schedule invalid: dia_invalido', 'dia repetido é recusado');
select throws_ok($$select private.validate_signal_schedule('{"horarios":["08:00"],"dias":[1],"fuso":"UTC"}', 0)$$,
  '22023', 'signal schedule invalid: fuso_invalido', 'só o fuso de Brasília por enquanto');
select throws_ok($$select private.validate_signal_schedule('"08:00"', 0)$$,
  '22023', 'signal schedule invalid: formato_invalido', 'a Agenda que não é um objeto é recusada');
select throws_ok($$select private.validate_signal_schedule('{"horarios":["08:00"],"dias":[1],"extra":true}', 0)$$,
  '22023', 'signal schedule invalid: formato_invalido', 'e a que traz campo desconhecido também');
select throws_ok($$select private.validate_signal_schedule(null, 0)$$,
  '22023', 'signal schedule invalid: formato_invalido', 'nula não vale');
select lives_ok($$select private.validate_signal_schedule('{"horarios":["08:00","14:00"],"dias":[1]}', 51)$$,
  'com mais de 50 Contas, dois horários cabem: a lista gira em lotes e a regra do escopo grande acabou');
select lives_ok($$select private.validate_signal_schedule('{"horarios":["08:00","12:00","16:00"],"dias":[1]}', 500)$$,
  'e com 500 Contas, três horários também');
select is(private.normalize_signal_schedule('{"horarios":["14:00","08:00"],"dias":[3,1]}'),
  '{"horarios":["08:00","14:00"],"dias":[1,3],"fuso":"America/Sao_Paulo"}'::jsonb,
  'a Agenda é guardada em ordem e com o fuso escrito');
select is(private.normalize_signal_schedule('{"horarios":["08:00"]}'),
  '{"horarios":["08:00"],"dias":[1,2,3,4,5],"fuso":"America/Sao_Paulo"}'::jsonb, 'e com os dias úteis quando faltam');

-- 4. O relógio: a Rodada agendada, a continuação que mantém o horário e a cobrança que não se repete.
create temporary table reivindicados (k text, monitor_id uuid, slot timestamptz) on commit drop;
insert into reivindicados select '1', c.monitor_id, c.slot from public.claim_due_signal_monitors(20) c;
select is(
  (select array_agg(r.monitor_id::text order by r.monitor_id::text) from reivindicados r where r.k = '1'),
  array['fa300000-0000-4000-8000-000000000001', 'fa300000-0000-4000-8000-000000000002', 'fa300000-0000-4000-8000-000000000018'],
  'o relógio reivindica o Monitoramento com Agenda e os dois legados vencidos');
select is(
  (select r.slot from reivindicados r where r.k = '1' and r.monitor_id = 'fa300000-0000-4000-8000-000000000001'),
  (select slot from ancora), 'o slot do Monitoramento com Agenda é a hora marcada da Rodada');
select is(
  (select m.current_slot_at from private.signal_monitors m where m.id = 'fa300000-0000-4000-8000-000000000001'),
  (select slot from ancora), 'e ela fica gravada em current_slot_at');
select is(
  (select r.slot from reivindicados r where r.k = '1' and r.monitor_id = 'fa300000-0000-4000-8000-000000000002'),
  '2026-01-05 11:00:00+00'::timestamptz, 'o legado tem o slot de sempre: o next_run_at');
select is(
  (select m.current_slot_at from private.signal_monitors m where m.id in ('fa300000-0000-4000-8000-000000000002', 'fa300000-0000-4000-8000-000000000018') and m.current_slot_at is not null limit 1),
  null, 'e o legado não grava horário de Rodada');

-- A Rodada de A1 abre uma vez só por horário.
create temporary table rodadas_abertas (k text primary key, id uuid) on commit drop;
insert into rodadas_abertas select 'a', public.open_signal_run('fa300000-0000-4000-8000-000000000001', (select slot from ancora));
select is(public.open_signal_run('fa300000-0000-4000-8000-000000000001', (select slot from ancora)), (select id from rodadas_abertas where k = 'a'),
  'abrir a Rodada de novo, no mesmo horário, devolve a mesma');

-- Alfa é cobrada na primeira chamada; a chamada tem tempo só para ela.
create temporary table varreduras (k text primary key, outcome text, reservation_id uuid) on commit drop;
insert into varreduras select 'alfa1', outcome, reservation_id
from public.begin_account_scan('fa100000-0000-4000-8000-000000000001', 'fa000000-0000-4000-8000-000000000001',
  'fa300000-0000-4000-8000-000000000001', 'fa200000-0000-4000-8000-000000000001', (select slot from ancora));
select is((select outcome from varreduras where k = 'alfa1'), 'go', 'a primeira chamada abre a varredura da Alfa');
select public.end_account_scan((select reservation_id from varreduras where k = 'alfa1'), true);

-- O tempo da função acabou: a Rodada continua na chamada seguinte, já.
select public.finish_signal_monitor_run('fa300000-0000-4000-8000-000000000001', 1, null, true);
select is(
  (select m.current_slot_at from private.signal_monitors m where m.id = 'fa300000-0000-4000-8000-000000000001'),
  (select slot from ancora), 'a continuação mantém o horário da Rodada');
select is(
  (select m.next_run_at = now() and m.claimed_until is null from private.signal_monitors m where m.id = 'fa300000-0000-4000-8000-000000000001'),
  true, 'e pede a próxima chamada já');

insert into reivindicados select '2', c.monitor_id, c.slot from public.claim_due_signal_monitors(20) c;
select is(
  (select array_agg(r.monitor_id::text order by r.monitor_id::text) from reivindicados r where r.k = '2'),
  array['fa300000-0000-4000-8000-000000000001'], 'a chamada seguinte reivindica o Monitoramento que continua');
select is(
  (select r.slot from reivindicados r where r.k = '2'), (select slot from ancora),
  'com o mesmo slot de antes, e não com o next_run_at = now() da continuação');
select is(public.open_signal_run('fa300000-0000-4000-8000-000000000001', (select r.slot from reivindicados r where r.k = '2')),
  (select id from rodadas_abertas where k = 'a'), 'a continuação segue na mesma linha do registro da Rodada');
insert into varreduras select 'alfa2', outcome, reservation_id
from public.begin_account_scan('fa100000-0000-4000-8000-000000000001', 'fa000000-0000-4000-8000-000000000001',
  'fa300000-0000-4000-8000-000000000001', 'fa200000-0000-4000-8000-000000000001', (select r.slot from reivindicados r where r.k = '2'));
insert into varreduras select 'beta', outcome, reservation_id
from public.begin_account_scan('fa100000-0000-4000-8000-000000000001', 'fa000000-0000-4000-8000-000000000001',
  'fa300000-0000-4000-8000-000000000001', 'fa200000-0000-4000-8000-000000000002', (select r.slot from reivindicados r where r.k = '2'));
select is((select outcome from varreduras where k = 'alfa2'), 'done', 'a Conta já cobrada no horário volta como done: não é cobrada de novo');
select is((select outcome from varreduras where k = 'beta'), 'go', 'e a Conta que faltava abre');
select public.end_account_scan((select reservation_id from varreduras where k = 'beta'), true);
select is(
  (select count(*)::int from private.credit_reservations r where r.action_key like 'scan:fa300000-0000-4000-8000-000000000001:%'),
  2, 'a Rodada inteira tem uma cobrança por Conta (Alfa e Beta)');
select is(
  (select sum(r.amount) from private.credit_reservations r where r.action_key like 'scan:fa300000-0000-4000-8000-000000000001:%'),
  (2 * private.scan_credits('vaga_linkedin'))::numeric, 'e o total é o preço fixo vezes as duas Contas');
select is(
  (select r.action_key from private.credit_reservations r where r.id = (select reservation_id from varreduras where k = 'alfa1')),
  'scan:fa300000-0000-4000-8000-000000000001:fa200000-0000-4000-8000-000000000001:' || extract(epoch from (select slot from ancora))::bigint,
  'a chave de cobrança é a do horário marcado');

-- A Rodada termina: a próxima é o primeiro horário depois de agora, e a Rodada perdida (14:00 do dia 05/01) não é compensada.
select public.finish_signal_monitor_run('fa300000-0000-4000-8000-000000000001', 1, null, false);
select is(
  (select m.next_run_at from private.signal_monitors m where m.id = 'fa300000-0000-4000-8000-000000000001'),
  private.next_signal_run((select m.schedule from private.signal_monitors m where m.id = 'fa300000-0000-4000-8000-000000000001'), now()),
  'a próxima Rodada é o primeiro horário depois de agora');
select isnt(
  (select m.next_run_at from private.signal_monitors m where m.id = 'fa300000-0000-4000-8000-000000000001'),
  '2026-01-05 17:00:00+00'::timestamptz, 'e não o 14:00 daquele dia 05/01: a Rodada perdida não é compensada');
select is(
  (select m.current_slot_at is null and m.current_run_id is null and m.claimed_until is null
   from private.signal_monitors m where m.id = 'fa300000-0000-4000-8000-000000000001'),
  true, 'o horário, a Rodada aberta e a reserva são limpos');
select is(
  (select x.state from private.signal_monitor_runs x where x.id = (select id from rodadas_abertas where k = 'a')),
  'concluida', 'o registro da Rodada fecha');
select is(
  (select count(*)::int from private.signal_monitor_runs x where x.monitor_id = 'fa300000-0000-4000-8000-000000000001' and x.origin = 'agenda'),
  1, 'e houve uma Rodada só para o horário, sem Rodadas acumuladas');
select is(
  (select m.next_run_at > now() from private.signal_monitors m where m.id = 'fa300000-0000-4000-8000-000000000001'),
  true, 'a próxima Rodada está no futuro');

-- Sem compensação, de outro ângulo: a Rodada de N1 só terminou muito depois da hora (runner parado). A próxima não volta no tempo.
select public.finish_signal_monitor_run('fa300000-0000-4000-8000-000000000011', 2, null, false);
select is(
  (select m.next_run_at from private.signal_monitors m where m.id = 'fa300000-0000-4000-8000-000000000011'),
  private.next_signal_run((select m.schedule from private.signal_monitors m where m.id = 'fa300000-0000-4000-8000-000000000011'), now()),
  'terminar uma Rodada atrasada agenda o primeiro horário depois de agora');
select isnt(
  (select m.next_run_at from private.signal_monitors m where m.id = 'fa300000-0000-4000-8000-000000000011'),
  private.next_signal_run((select m.schedule from private.signal_monitors m where m.id = 'fa300000-0000-4000-8000-000000000011'),
    '2026-01-05 11:00:00+00'), 'e não o horário seguinte ao da Rodada atrasada');

-- O legado: igual a antes. L1 termina e agenda daqui a every_hours (6 h); L4 continua e volta já.
select public.finish_signal_monitor_run('fa300000-0000-4000-8000-000000000002', 1, null, false);
select is(
  (select m.next_run_at from private.signal_monitors m where m.id = 'fa300000-0000-4000-8000-000000000002'),
  now() + interval '6 hours', 'o legado termina e agenda daqui a every_hours, como sempre');
select public.finish_signal_monitor_run('fa300000-0000-4000-8000-000000000018', 1, null, true);
select is(
  (select m.next_run_at = now() and m.current_slot_at is null from private.signal_monitors m where m.id = 'fa300000-0000-4000-8000-000000000018'),
  true, 'o legado que continua volta já, sem horário de Rodada');
select is(
  (select m.schedule is null and m.current_slot_at is null from private.signal_monitors m where m.id = 'fa300000-0000-4000-8000-000000000002'),
  true, 'e continua sem Agenda');

-- 5. Gravar a Agenda, a ativação e a lista, como Ana (Administradora).
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'fa000000-0000-4000-8000-000000000001', true);

select is(
  public.save_signal_schedule('fa100000-0000-4000-8000-000000000001', 'fa300000-0000-4000-8000-000000000005',
    '{"horarios":["14:00","08:00"],"dias":[3,1]}'),
  '{"horarios":["08:00","14:00"],"dias":[1,3],"fuso":"America/Sao_Paulo"}'::jsonb,
  'gravar a Agenda devolve como foi guardada: em ordem e com o fuso');
reset role;
select is(
  (select m.schedule from private.signal_monitors m where m.id = 'fa300000-0000-4000-8000-000000000005'),
  '{"horarios":["08:00","14:00"],"dias":[1,3],"fuso":"America/Sao_Paulo"}'::jsonb, 'e é o que fica no Monitoramento');
set local role authenticated;
reset role;
select is(
  (select m.next_run_at from private.signal_monitors m where m.id = 'fa300000-0000-4000-8000-000000000005'),
  private.next_signal_run('{"horarios":["08:00","14:00"],"dias":[1,3]}', now()),
  'no Monitoramento ativo, a próxima Rodada passa para o primeiro horário da Agenda nova');
set local role authenticated;
select is(
  public.save_signal_schedule('fa100000-0000-4000-8000-000000000001', 'fa300000-0000-4000-8000-000000000006', '{"horarios":["10:30"]}'),
  '{"horarios":["10:30"],"dias":[1,2,3,4,5],"fuso":"America/Sao_Paulo"}'::jsonb, 'sem dias, a Agenda guardada leva os dias úteis');
reset role;
select is(
  (select m.next_run_at from private.signal_monitors m where m.id = 'fa300000-0000-4000-8000-000000000006'),
  null, 'no rascunho gravar a Agenda não marca Rodada');
set local role authenticated;
select public.save_signal_schedule('fa100000-0000-4000-8000-000000000001', 'fa300000-0000-4000-8000-000000000010', '{"horarios":["09:00"]}');
reset role;
select is(
  (select m.next_run_at from private.signal_monitors m where m.id = 'fa300000-0000-4000-8000-000000000010'),
  '2999-01-01 00:00:00+00'::timestamptz, 'com uma Rodada em andamento, a hora marcada não muda: ela termina e então segue a Agenda nova');
set local role authenticated;
reset role;
select is(
  (select m.schedule from private.signal_monitors m where m.id = 'fa300000-0000-4000-8000-000000000010'),
  '{"horarios":["09:00"],"dias":[1,2,3,4,5],"fuso":"America/Sao_Paulo"}'::jsonb, 'mas a Agenda nova já fica gravada');
set local role authenticated;
select throws_ok(
  $$select public.save_signal_schedule('fa100000-0000-4000-8000-000000000001', 'fa300000-0000-4000-8000-000000000005', '{"horarios":["08:00","08:45"]}')$$,
  '22023', 'signal schedule invalid: intervalo_curto', 'o servidor recusa a Agenda com menos de 1 h, mesmo que a tela deixe passar');
select throws_ok(
  $$select public.save_signal_schedule('fa100000-0000-4000-8000-000000000001', 'fa300000-0000-4000-8000-000000000005', '{"horarios":[]}')$$,
  '22023', 'signal schedule invalid: sem_horario', 'sem horário também');
select throws_ok(
  $$select public.save_signal_schedule('fa100000-0000-4000-8000-000000000001', 'fa300000-0000-4000-8000-000000000005', null)$$,
  '22023', 'signal schedule invalid: formato_invalido', 'e a Agenda nula: não se volta ao legado por aqui');
reset role;
select is(
  (select m.schedule from private.signal_monitors m where m.id = 'fa300000-0000-4000-8000-000000000005'),
  '{"horarios":["08:00","14:00"],"dias":[1,3],"fuso":"America/Sao_Paulo"}'::jsonb, 'a recusa não muda a Agenda que estava gravada');
set local role authenticated;
select is(
  public.save_signal_schedule('fa100000-0000-4000-8000-000000000001', 'fa300000-0000-4000-8000-000000000009', '{"horarios":["08:00","14:00"]}') ->> 'horarios',
  '["08:00", "14:00"]', 'com 51 Contas no escopo, dois horários são aceitos (a regra do escopo grande acabou)');
select is(
  public.save_signal_schedule('fa100000-0000-4000-8000-000000000001', 'fa300000-0000-4000-8000-000000000009', '{"horarios":["08:00"]}') ->> 'horarios',
  '["08:00"]', 'e um horário por dia também');
select throws_ok(
  $$select public.save_signal_schedule('fa100000-0000-4000-8000-000000000001', 'fa300000-0000-4000-8000-000000000012', '{"horarios":["08:00"]}')$$,
  '22023', 'signal schedule invalid: tipo_sem_agenda', 'o Sinal interno, que sai das Interações com o relógio dele, não tem Agenda');
select throws_ok(
  $$select public.save_signal_schedule('fa100000-0000-4000-8000-000000000001', 'fa300000-0000-4000-8000-000000000015', '{"horarios":["08:00"]}')$$,
  'P0002', 'monitor not found', 'o Monitoramento de outro Workspace não existe aqui');

-- A prévia: os próximos horários, a partir de um instante fixo.
select is(
  (select array_agg(p order by p) from public.preview_signal_schedule(
    '{"horarios":["08:00","14:00"],"dias":[1,2,3,4,5]}', '2026-10-23 18:00:00-03', 5) p),
  array['2026-10-26 08:00:00-03', '2026-10-26 14:00:00-03', '2026-10-27 08:00:00-03', '2026-10-27 14:00:00-03',
        '2026-10-28 08:00:00-03']::timestamptz[], 'a prévia traz os próximos 5 horários, de sexta 18:00 em diante');
select is(
  (select count(*)::int from public.preview_signal_schedule('{"horarios":["08:00"]}', '2026-10-23 18:00:00-03', 3)), 3,
  'e só os N pedidos');
select is(
  (select count(*)::int from public.preview_signal_schedule('{"horarios":["08:00"]}', '2026-10-23 18:00:00-03', 100)), 20,
  'N tem teto (20)');
select is(
  (select count(*)::int from public.preview_signal_schedule('{"horarios":["08:00"]}', '2026-10-23 18:00:00-03', 0)), 1,
  'e pelo menos 1');
select throws_ok(
  $$select * from public.preview_signal_schedule('{"horarios":["08:00","08:45"]}', '2026-10-23 18:00:00-03', 3)$$,
  '22023', 'signal schedule invalid: intervalo_curto', 'a prévia recusa a Agenda que o servidor recusaria ao gravar');
select is(
  (select count(*)::int from public.preview_signal_schedule('{"horarios":["08:00","14:00"]}', '2026-10-23 18:00:00-03', 3, 500)), 3,
  'e não recusa mais a Agenda de uma lista grande: com 500 Contas e dois horários a prévia vem');

-- A ativação aponta para o próximo horário.
select public.set_signal_monitor_state('fa300000-0000-4000-8000-000000000006', 'ativo');
reset role;
select is(
  (select m.next_run_at from private.signal_monitors m where m.id = 'fa300000-0000-4000-8000-000000000006'),
  private.next_signal_run('{"horarios":["10:30"],"dias":[1,2,3,4,5]}', now()), 'ativar o rascunho com Agenda aponta para o próximo horário');
set local role authenticated;
select public.set_signal_monitor_state('fa300000-0000-4000-8000-000000000007', 'ativo');
reset role;
select is(
  (select m.next_run_at from private.signal_monitors m where m.id = 'fa300000-0000-4000-8000-000000000007'),
  private.next_signal_run((select m.schedule from private.signal_monitors m where m.id = 'fa300000-0000-4000-8000-000000000007'), now()),
  'retomar o pausado pula o horário que passou, sem compensar');
set local role authenticated;
reset role;
select is(
  (select m.current_slot_at from private.signal_monitors m where m.id = 'fa300000-0000-4000-8000-000000000007'),
  null, 'e esquece a Rodada que tinha ficado pela metade');
set local role authenticated;
select public.save_signal_monitor('fa100000-0000-4000-8000-000000000001', 'fa300000-0000-4000-8000-000000000008', 'vaga_linkedin', 'D2', 'ativo',
  '{"accountIds":["fa200000-0000-4000-8000-000000000001"]}', '{}', 24);
reset role;
select is(
  (select m.next_run_at from private.signal_monitors m where m.id = 'fa300000-0000-4000-8000-000000000008'),
  private.next_signal_run('{"horarios":["10:00"],"dias":[1,2,3,4,5]}', now()), 'ativar pelo editor também aponta para o próximo horário');
set local role authenticated;
select public.save_signal_monitor('fa100000-0000-4000-8000-000000000001', 'fa300000-0000-4000-8000-000000000008', 'vaga_linkedin', 'D2 editado', 'ativo',
  '{"accountIds":["fa200000-0000-4000-8000-000000000001"]}', '{}', 24);
reset role;
select is(
  (select m.next_run_at from private.signal_monitors m where m.id = 'fa300000-0000-4000-8000-000000000008'),
  private.next_signal_run('{"horarios":["10:00"],"dias":[1,2,3,4,5]}', now()), 'e editar o que já está ativo mantém a hora marcada');
set local role authenticated;
select lives_ok(
  $$select public.save_signal_monitor('fa100000-0000-4000-8000-000000000001', 'fa300000-0000-4000-8000-000000000016', 'vaga_linkedin', 'G2', 'ativo',
    (select jsonb_build_object('accountIds', jsonb_agg(t.id)) from public.target_accounts t where t.name like 'Grande %'), '{}', 24)$$,
  'o editor passa de 50 Contas num Sinal com dois horários: o escopo grande acabou');
select lives_ok(
  $$select public.save_signal_monitor('fa100000-0000-4000-8000-000000000001', 'fa300000-0000-4000-8000-000000000017', 'vaga_linkedin', 'G3', 'ativo',
    (select jsonb_build_object('accountIds', jsonb_agg(t.id)) from public.target_accounts t where t.name like 'Grande %'), '{}', 24)$$,
  'e num Sinal com um horário só também');

select lives_ok(
  $$select public.save_signal_monitor('fa100000-0000-4000-8000-000000000001', 'fa300000-0000-4000-8000-000000000019', 'vaga_linkedin', 'G4 editado', 'ativo',
    '{"accountIds":["fa200000-0000-4000-8000-000000000001"]}', '{}', 24)$$,
  'o editor não revalida a Agenda (ela se corrige na tela da Agenda), nem a que deixou de valer por um limite mudado depois');

-- O legado, na ativação: igual a antes.
select public.set_signal_monitor_state('fa300000-0000-4000-8000-000000000003', 'ativo');
reset role;
select is(
  (select m.next_run_at from private.signal_monitors m where m.id = 'fa300000-0000-4000-8000-000000000003'),
  '2026-01-05 11:00:00+00'::timestamptz, 'o legado pausado retoma com a hora marcada que tinha');
set local role authenticated;
select public.set_signal_monitor_state('fa300000-0000-4000-8000-000000000004', 'ativo');
reset role;
select is(
  (select m.next_run_at from private.signal_monitors m where m.id = 'fa300000-0000-4000-8000-000000000004'),
  now(), 'e o legado em rascunho roda já ao ativar, como sempre');

-- A lista traz a Agenda e a hora marcada; as colunas de antes seguem iguais.
set local role authenticated;
select is(
  (select l.schedule from public.list_signal_monitors('fa100000-0000-4000-8000-000000000001') l where l.id = 'fa300000-0000-4000-8000-000000000001'),
  '{"horarios":["08:00","14:00"],"dias":[1,2,3,4,5],"fuso":"America/Sao_Paulo"}'::jsonb, 'a lista traz a Agenda');
reset role;
select is(
  (select l.next_run_at from public.list_signal_monitors('fa100000-0000-4000-8000-000000000001') l where l.id = 'fa300000-0000-4000-8000-000000000001'),
  (select m.next_run_at from private.signal_monitors m where m.id = 'fa300000-0000-4000-8000-000000000001'), 'e a hora marcada da próxima Rodada');
set local role authenticated;
select is(
  (select l.schedule from public.list_signal_monitors('fa100000-0000-4000-8000-000000000001') l where l.id = 'fa300000-0000-4000-8000-000000000002'),
  null, 'o legado vem sem Agenda');
select is(
  (select l.every_hours || '|' || l.name || '|' || l.state from public.list_signal_monitors('fa100000-0000-4000-8000-000000000001') l
   where l.id = 'fa300000-0000-4000-8000-000000000002'),
  '6|L1|ativo', 'e com as colunas de antes');
reset role;
select is(
  (select count(*)::int from public.list_signal_monitors('fa100000-0000-4000-8000-000000000001') l where l.id::text like 'fa3%'),
  (select count(*)::int from private.signal_monitors m where m.workspace_id = 'fa100000-0000-4000-8000-000000000001'),
  'a lista traz todos os Monitoramentos do Workspace');

-- 6. Quem pode: a permissão de salvar o Monitoramento.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'fa000000-0000-4000-8000-000000000002', true);
select throws_ok(
  $$select public.save_signal_schedule('fa100000-0000-4000-8000-000000000001', 'fa300000-0000-4000-8000-000000000005', '{"horarios":["08:00"]}')$$,
  '42501', 'only the creator or an administrator can change this monitor', 'um membro não grava a Agenda do Monitoramento de outra pessoa');
select is(
  public.save_signal_schedule('fa100000-0000-4000-8000-000000000001', 'fa300000-0000-4000-8000-000000000014', '{"horarios":["08:00"]}') ->> 'horarios',
  '["08:00"]', 'mas grava a do próprio');
select lives_ok(
  $$select * from public.preview_signal_schedule('{"horarios":["08:00"]}', '2026-10-23 18:00:00-03', 3)$$, 'e vê a prévia');
select set_config('request.jwt.claim.sub', 'fa000000-0000-4000-8000-000000000003', true);
select throws_ok(
  $$select public.save_signal_schedule('fa100000-0000-4000-8000-000000000001', 'fa300000-0000-4000-8000-000000000005', '{"horarios":["08:00"]}')$$,
  '42501', 'active workspace membership required', 'quem não participa do Workspace não grava Agenda nele');
select throws_ok(
  $$select * from public.list_signal_monitors('fa100000-0000-4000-8000-000000000001')$$,
  '42501', 'active workspace membership required', 'nem lê a lista');
reset role;
set local role anon;
select throws_ok(
  $$select public.save_signal_schedule('fa100000-0000-4000-8000-000000000001', 'fa300000-0000-4000-8000-000000000005', '{"horarios":["08:00"]}')$$,
  '42501', null, 'o anônimo não grava Agenda');
select throws_ok(
  $$select * from public.preview_signal_schedule('{"horarios":["08:00"]}', '2026-10-23 18:00:00-03', 3)$$,
  '42501', null, 'nem vê a prévia');
reset role;

select * from finish();
rollback;
