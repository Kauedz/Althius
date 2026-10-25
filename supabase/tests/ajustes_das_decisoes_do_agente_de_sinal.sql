begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(126);

-- Ajustes das decisões do Kauê sobre o Agente de Sinal (agente-de-sinal 05): a Agenda de até 12 Rodadas por dia com 1 h entre elas,
-- o fim da regra do escopo grande, o Plano com 500 Contas e 25 empresas por Rodada, o lote com rotação (agendado e manual), o preço
-- e a cotação pelo lote, a Rodada perdida em Rodadas, o Teto mensal pré-preenchido, o aviso na 1ª Rodada pulada e o intervalo de
-- 60 minutos entre Rodadas manuais.
-- Os horários que importam são fixos e passados por parâmetro (BRT = UTC-3): nada depende de now() comparado com ordem. Onde a
-- função usa now() por dentro, o teste confere com a mesma função no mesmo now(), que é um só dentro da transação. As listas saem
-- por conjunto ou por posição explícita, nunca pela ordem de created_at.
-- Ana: Administradora de todos os Workspaces. Beto: membro do Norte e do Teto. Eva: de fora.

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
                        created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
                        is_sso_user, is_anonymous)
values
  ('fd000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'ana@norte.test', '', now(), now(), now(), '{}', '{}', false, false),
  ('fd000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'beto@norte.test', '', now(), now(), now(), '{}', '{}', false, false),
  ('fd000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'eva@fora.test', '', now(), now(), now(), '{}', '{}', false, false);

-- Os Workspaces: 1 Norte, 2 Grande, 3 Teto (automação em "confirmar", limite 1.000), 4 Maior (limite 3.000), 5 Suspenso, 6 Livre.
insert into public.workspaces (id, kind, name)
select ('fd100000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid, 'empresa', nome
from (values (1, 'Norte'), (2, 'Grande'), (3, 'Teto'), (4, 'Maior'), (5, 'Suspenso'), (6, 'Livre')) as w (n, nome);
insert into private.workspace_contracts (workspace_id, tier_id, status, starts_at, monthly_credit_limit)
select ('fd100000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid, 'profissional', case when n = 5 then 'suspenso' else 'ativo' end,
  date_trunc('month', now()), lim
from (values (1, 4500), (2, 4500), (3, 1000), (4, 3000), (5, 1000)) as c (n, lim);
insert into private.workspace_billing (workspace_id, credits_enforced, unlimited_credits)
values ('fd100000-0000-4000-8000-000000000006', true, true);
insert into public.workspace_memberships (workspace_id, user_id, role, active)
select ('fd100000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid, 'fd000000-0000-4000-8000-000000000001', 'admin', true
from generate_series(1, 6) n;
insert into public.workspace_memberships (workspace_id, user_id, role, active) values
  ('fd100000-0000-4000-8000-000000000001', 'fd000000-0000-4000-8000-000000000002', 'member', true),
  ('fd100000-0000-4000-8000-000000000003', 'fd000000-0000-4000-8000-000000000002', 'member', true);
select public.grant_credits('fd100000-0000-4000-8000-000000000001', 1000, 'plano', 'saldo de teste');
select public.grant_credits('fd100000-0000-4000-8000-000000000002', 1000, 'plano', 'saldo de teste');
-- Norte e Grande rodam em automático, dentro do limite do contrato; os outros ficam em "confirmar".
select private.seed_contract_automation(('fd100000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid) from generate_series(1, 2) n;

-- As Contas do Norte: 60, de "Conta 01" a "Conta 60" (a ordem da rotação é por nome). As 10 primeiras não têm a página da
-- empresa no LinkedIn. As do Grande: 501.
insert into public.target_accounts (id, workspace_id, name, canonical_url, domain, linkedin_url, created_by)
select ('fd200000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid, 'fd100000-0000-4000-8000-000000000001',
       'Conta ' || lpad(i::text, 2, '0'), 'https://c' || i || '.test', 'c' || i || '.test',
       case when i > 10 then 'https://www.linkedin.com/company/c' || i end, 'fd000000-0000-4000-8000-000000000001'
from generate_series(1, 60) i;
insert into public.target_accounts (id, workspace_id, name, canonical_url, domain, created_by)
select ('fd210000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid, 'fd100000-0000-4000-8000-000000000002',
       'Grande ' || lpad(i::text, 3, '0'), 'https://g' || i || '.test', 'g' || i || '.test', 'fd000000-0000-4000-8000-000000000001'
from generate_series(1, 501) i;

select public.set_signal_actor_state(a.actor_id, 'available', 'v1') from private.signal_actors a where a.signal_type in ('vaga_linkedin', 'nova_lideranca');

-- O público: as Contas do Norte de a até b; as do Grande de a até b.
create function pg_temp.norte(p_de integer, p_ate integer) returns jsonb language sql as $f$
  select jsonb_build_object('accountIds', jsonb_agg(('fd200000-0000-4000-8000-' || lpad(i::text, 12, '0')) order by i))
  from generate_series(p_de, p_ate) i
$f$;
create function pg_temp.grande(p_de integer, p_ate integer) returns jsonb language sql as $f$
  select jsonb_build_object('accountIds', jsonb_agg(('fd210000-0000-4000-8000-' || lpad(i::text, 12, '0')) order by i))
  from generate_series(p_de, p_ate) i
$f$;
-- Os nomes das Contas de um claim, na ordem em que o runner as recebe.
create function pg_temp.nomes(p_contas jsonb) returns text[] language sql as $f$
  select coalesce(array_agg(t.e ->> 'name' order by t.n), '{}') from jsonb_array_elements(p_contas) with ordinality as t (e, n)
$f$;
-- "Conta 01" ... "Conta 60": as Contas de a até b, em ordem.
create function pg_temp.faixa(p_de integer, p_ate integer) returns text[] language sql as $f$
  select array_agg('Conta ' || lpad(i::text, 2, '0') order by i) from generate_series(p_de, p_ate) i
$f$;
-- Reivindica pelo relógio e guarda o que o runner recebeu. `p_retime`: marca o Monitoramento como vencido há 1 segundo (uma
-- Rodada nova); sem isso a chamada é a continuação, que o `finish` já deixou para agora.
create temporary table claims (k text primary key, slot timestamptz, accounts jsonb) on commit drop;
create function pg_temp.reivindicar(p_k text, p_monitor uuid, p_retime boolean default true) returns void language plpgsql as $f$
begin
  if p_retime then
    update private.signal_monitors set next_run_at = now() - interval '1 second', claimed_until = null where id = p_monitor;
  end if;
  insert into claims select p_k, c.slot, c.accounts from public.claim_due_signal_monitors(20) c where c.monitor_id = p_monitor;
end
$f$;
-- Uma Rodada que terminou sem verificar nada por falta de créditos.
create function pg_temp.pular(p_monitor uuid, p_slot timestamptz) returns void language plpgsql as $f$
declare
  v_run uuid := public.open_signal_run(p_monitor, p_slot);
begin
  perform public.add_signal_run_progress(v_run, 0, 0, 0, 0, '{}', 'sem_creditos');
  perform public.finish_signal_monitor_run(p_monitor, 0, null, false);
end
$f$;

-- Os Monitoramentos. Quem não deve ser reivindicado pelo relógio tem a hora marcada num futuro distante (2999).
-- Norte: M1 (60 Contas, lote 25, 2 horários em dias úteis), M2 (a continuação por prazo), M3 (a continuação que chega ao lote),
-- M4 (lote 100, maior que a lista), ML (legado, sem Plano e sem Agenda), M5 (com pedido manual em andamento), MI (o intervalo
-- manual), MN (nova_lideranca: 10 Contas sem a página no LinkedIn), MS (as Rodadas puladas), MQ (lote 100 e 60 Contas).
-- Rodada perdida: MP2 a MP6, MPC, MPP (pausado). Grande: G1 (200 Contas, lote 100), G2 (o editor) e G3 (500 Contas, lote 100). Teto, Maior, Suspenso, Livre: T1 a T4.
insert into private.signal_monitors
  (id, workspace_id, signal_type, name, state, audience, criteria, every_hours, created_by, next_run_at, schedule, plan) values
  ('fd300000-0000-4000-8000-000000000001', 'fd100000-0000-4000-8000-000000000001', 'vaga_linkedin', 'M1', 'ativo', pg_temp.norte(1, 60), '{}', 24,
   'fd000000-0000-4000-8000-000000000001', '2999-01-01 00:00:00+00',
   '{"horarios":["08:00","14:00"],"dias":[1,2,3,4,5],"fuso":"America/Sao_Paulo"}', '{"maxEmpresasPorRodada":25}'),
  ('fd300000-0000-4000-8000-000000000002', 'fd100000-0000-4000-8000-000000000001', 'vaga_linkedin', 'M2', 'ativo', pg_temp.norte(1, 60), '{}', 24,
   'fd000000-0000-4000-8000-000000000001', '2999-01-01 00:00:00+00',
   '{"horarios":["08:00","14:00"],"dias":[1,2,3,4,5],"fuso":"America/Sao_Paulo"}', '{"maxEmpresasPorRodada":25}'),
  ('fd300000-0000-4000-8000-000000000003', 'fd100000-0000-4000-8000-000000000001', 'vaga_linkedin', 'M3', 'ativo', pg_temp.norte(1, 60), '{}', 24,
   'fd000000-0000-4000-8000-000000000001', '2999-01-01 00:00:00+00',
   '{"horarios":["08:00","14:00"],"dias":[1,2,3,4,5],"fuso":"America/Sao_Paulo"}', '{"maxEmpresasPorRodada":25}'),
  ('fd300000-0000-4000-8000-000000000004', 'fd100000-0000-4000-8000-000000000001', 'vaga_linkedin', 'M4', 'ativo', pg_temp.norte(1, 3), '{}', 24,
   'fd000000-0000-4000-8000-000000000001', '2999-01-01 00:00:00+00',
   '{"horarios":["08:00"],"dias":[1,2,3,4,5],"fuso":"America/Sao_Paulo"}', '{"maxEmpresasPorRodada":25}'),
  ('fd300000-0000-4000-8000-000000000005', 'fd100000-0000-4000-8000-000000000001', 'vaga_linkedin', 'M5', 'ativo', pg_temp.norte(1, 60), '{}', 24,
   'fd000000-0000-4000-8000-000000000001', '2999-01-01 00:00:00+00',
   '{"horarios":["08:00","14:00"],"dias":[1,2,3,4,5],"fuso":"America/Sao_Paulo"}', '{"maxEmpresasPorRodada":25}'),
  ('fd300000-0000-4000-8000-000000000006', 'fd100000-0000-4000-8000-000000000001', 'vaga_linkedin', 'ML', 'ativo', pg_temp.norte(1, 60), '{}', 24,
   'fd000000-0000-4000-8000-000000000001', '2999-01-01 00:00:00+00', null, null),
  ('fd300000-0000-4000-8000-000000000007', 'fd100000-0000-4000-8000-000000000001', 'vaga_linkedin', 'MI', 'ativo', pg_temp.norte(1, 3), '{}', 24,
   'fd000000-0000-4000-8000-000000000001', '2999-01-01 00:00:00+00', null, '{"maxEmpresasPorRodada":25}'),
  ('fd300000-0000-4000-8000-000000000008', 'fd100000-0000-4000-8000-000000000001', 'nova_lideranca', 'MN', 'rascunho', pg_temp.norte(1, 60), '{}', 24,
   'fd000000-0000-4000-8000-000000000001', null, null, '{"maxEmpresasPorRodada":25}'),
  ('fd300000-0000-4000-8000-000000000009', 'fd100000-0000-4000-8000-000000000001', 'vaga_linkedin', 'MS', 'ativo', pg_temp.norte(1, 3), '{}', 24,
   'fd000000-0000-4000-8000-000000000001', '2999-01-01 00:00:00+00', null, null),
  ('fd300000-0000-4000-8000-00000000000a', 'fd100000-0000-4000-8000-000000000001', 'vaga_linkedin', 'MQ', 'rascunho', pg_temp.norte(1, 60), '{}', 24,
   'fd000000-0000-4000-8000-000000000001', null, null, '{"maxEmpresasPorRodada":100}'),
  ('fd300000-0000-4000-8000-000000000012', 'fd100000-0000-4000-8000-000000000001', 'vaga_linkedin', 'MP2', 'ativo', pg_temp.norte(1, 3), '{}', 24,
   'fd000000-0000-4000-8000-000000000001', '2026-10-26 08:00:00-03',
   '{"horarios":["08:00","12:00","16:00"],"dias":[1,2,3,4,5,6,7],"fuso":"America/Sao_Paulo"}', null),
  ('fd300000-0000-4000-8000-000000000013', 'fd100000-0000-4000-8000-000000000001', 'vaga_linkedin', 'MP3', 'ativo', pg_temp.norte(1, 3), '{}', 24,
   'fd000000-0000-4000-8000-000000000001', '2026-10-26 08:00:00-03',
   '{"horarios":["08:00","12:00","16:00"],"dias":[1,2,3,4,5,6,7],"fuso":"America/Sao_Paulo"}', null),
  ('fd300000-0000-4000-8000-000000000014', 'fd100000-0000-4000-8000-000000000001', 'vaga_linkedin', 'MP4', 'ativo', pg_temp.norte(1, 3), '{}', 24,
   'fd000000-0000-4000-8000-000000000001', '2026-10-19 08:00:00-03',
   '{"horarios":["08:00","09:00","10:00","11:00","12:00","13:00","14:00","15:00","16:00","17:00","18:00","19:00"],"dias":[1,2,3,4,5,6,7],"fuso":"America/Sao_Paulo"}', null),
  ('fd300000-0000-4000-8000-000000000015', 'fd100000-0000-4000-8000-000000000001', 'vaga_linkedin', 'MP5', 'ativo', pg_temp.norte(1, 3), '{}', 24,
   'fd000000-0000-4000-8000-000000000001', '2026-10-19 08:00:00-03', null, null),
  ('fd300000-0000-4000-8000-000000000016', 'fd100000-0000-4000-8000-000000000001', 'vaga_linkedin', 'MP6', 'ativo', pg_temp.norte(1, 3), '{}', 24,
   'fd000000-0000-4000-8000-000000000001', '2026-10-26 08:07:00-03',
   '{"horarios":["08:00","12:00","16:00"],"dias":[1,2,3,4,5,6,7],"fuso":"America/Sao_Paulo"}', null),
  ('fd300000-0000-4000-8000-000000000019', 'fd100000-0000-4000-8000-000000000001', 'vaga_linkedin', 'MP7', 'ativo', pg_temp.norte(1, 3), '{}', 24,
   'fd000000-0000-4000-8000-000000000001', '2026-01-02 08:00:00-03',
   '{"horarios":["08:00","09:00","10:00","11:00","12:00","13:00","14:00","15:00","16:00","17:00","18:00","19:00"],"dias":[1,2,3,4,5,6,7],"fuso":"America/Sao_Paulo"}', null),
  ('fd300000-0000-4000-8000-000000000017', 'fd100000-0000-4000-8000-000000000001', 'vaga_linkedin', 'MPC', 'ativo', pg_temp.norte(1, 3), '{}', 24,
   'fd000000-0000-4000-8000-000000000001', '2999-01-01 00:00:00+00',
   '{"horarios":["00:00","12:00"],"dias":[1,2,3,4,5,6,7],"fuso":"America/Sao_Paulo"}', null),
  ('fd300000-0000-4000-8000-000000000018', 'fd100000-0000-4000-8000-000000000001', 'vaga_linkedin', 'MPP', 'pausado', pg_temp.norte(1, 3), '{}', 24,
   'fd000000-0000-4000-8000-000000000001', '2026-10-19 08:00:00-03',
   '{"horarios":["00:00","12:00"],"dias":[1,2,3,4,5,6,7],"fuso":"America/Sao_Paulo"}', null),
  ('fd300000-0000-4000-8000-000000000021', 'fd100000-0000-4000-8000-000000000002', 'vaga_linkedin', 'G1', 'ativo', pg_temp.grande(1, 200), '{}', 24,
   'fd000000-0000-4000-8000-000000000001', '2999-01-01 00:00:00+00',
   '{"horarios":["08:00","14:00"],"dias":[1,2,3,4,5],"fuso":"America/Sao_Paulo"}', '{"maxEmpresasPorRodada":100}'),
  ('fd300000-0000-4000-8000-000000000022', 'fd100000-0000-4000-8000-000000000002', 'vaga_linkedin', 'G2', 'ativo', pg_temp.grande(1, 10), '{}', 24,
   'fd000000-0000-4000-8000-000000000001', '2999-01-01 00:00:00+00',
   '{"horarios":["08:00","12:00","16:00"],"dias":[1,2,3,4,5],"fuso":"America/Sao_Paulo"}', '{"maxEmpresasPorRodada":100}'),
  ('fd300000-0000-4000-8000-000000000023', 'fd100000-0000-4000-8000-000000000002', 'vaga_linkedin', 'G3', 'ativo', pg_temp.grande(1, 500), '{}', 24,
   'fd000000-0000-4000-8000-000000000001', '2999-01-01 00:00:00+00',
   '{"horarios":["08:00","12:00","16:00"],"dias":[1,2,3,4,5],"fuso":"America/Sao_Paulo"}', '{"maxEmpresasPorRodada":100}'),
  ('fd300000-0000-4000-8000-000000000031', 'fd100000-0000-4000-8000-000000000003', 'vaga_linkedin', 'T1', 'rascunho', '{"accountIds":[]}', '{}', 24,
   'fd000000-0000-4000-8000-000000000001', null, null, null),
  ('fd300000-0000-4000-8000-000000000032', 'fd100000-0000-4000-8000-000000000004', 'vaga_linkedin', 'T2', 'rascunho', '{"accountIds":[]}', '{}', 24,
   'fd000000-0000-4000-8000-000000000001', null, null, null),
  ('fd300000-0000-4000-8000-000000000033', 'fd100000-0000-4000-8000-000000000005', 'vaga_linkedin', 'T3', 'rascunho', '{"accountIds":[]}', '{}', 24,
   'fd000000-0000-4000-8000-000000000001', null, null, null),
  ('fd300000-0000-4000-8000-000000000034', 'fd100000-0000-4000-8000-000000000006', 'vaga_linkedin', 'T4', 'rascunho', '{"accountIds":[]}', '{}', 24,
   'fd000000-0000-4000-8000-000000000001', null, null, null);

-- Os Monitoramentos da Rodada perdida têm horário marcado em outubro de 2026 e são testados com um "agora" passado por parâmetro:
-- o relógio de verdade (`claim_due_signal_monitors`) não pode pegá-los quando esse dia chegar. A reserva num futuro distante os tira da fila.
update private.signal_monitors set claimed_until = '2999-01-01 00:00:00+00'
where id in (select ('fd300000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid from unnest(array[12, 13, 14, 15, 16, 19]) n);

-- 1. A estrutura, os limites e quem pode chamar o quê.
select ok(exists (select 1 from information_schema.columns where table_schema = 'private' and table_name = 'signal_monitors' and column_name = 'round_attempted'),
  'o Monitoramento guarda as Contas que a Rodada já tentou');
select ok(exists (select 1 from information_schema.columns where table_schema = 'private' and table_name = 'signal_run_requests' and column_name = 'start_offset'),
  'e o pedido do Rodar agora guarda de onde a rotação partiu');
select is(
  (select array[private.signal_schedule_limit('step_minutes'), private.signal_schedule_limit('max_per_day'),
                private.signal_schedule_limit('min_gap_minutes')]),
  array[15, 12, 60], 'a Agenda: passo de 15 minutos, até 12 Rodadas por dia, 1 h entre elas');
select is(
  (select array[private.signal_plan_limit('accounts_max'), private.signal_plan_limit('per_round_min'),
                private.signal_plan_limit('per_round_max'), private.signal_plan_limit('per_round_default'),
                private.signal_plan_limit('plan_max_chars')]),
  array[500, 1, 100, 25, 32000], 'o Plano: até 500 Contas, de 1 a 100 empresas por Rodada, padrão 25, e 500 Contas cabem no tamanho do Plano');
select is(private.signal_price_limit('monthly_cap_margin_percent'), 20, 'a margem do Teto sugerido é de 20%');
select is(private.signal_price_limit('pause_after_skips'), 3, 'a pausa continua na 3ª Rodada pulada');
select is(private.signal_run_limit('manual_min_interval_minutes'), 60, 'o intervalo entre Rodadas manuais é de 60 minutos');
select is(to_regprocedure('private.assert_schedule_fits_scope(jsonb, integer)') is null, true, 'a regra do escopo grande não existe mais');
select is(
  (select bool_and(p.prosrc not like '%muitas_contas%') from pg_proc p where p.oid = any (array[
    'private.validate_signal_schedule(jsonb, integer)'::regprocedure, 'public.save_signal_monitor(uuid, uuid, text, text, text, jsonb, jsonb, integer)'::regprocedure,
    'public.save_signal_schedule(uuid, uuid, jsonb)'::regprocedure, 'public.preview_signal_schedule(jsonb, timestamptz, integer, integer)'::regprocedure,
    'public.quote_signal_schedule(uuid, uuid, jsonb)'::regprocedure])),
  true, 'nenhuma função do servidor tem mais o código muitas_contas');
select is(
  (select bool_and(not has_function_privilege('authenticated', f, 'execute') and not has_function_privilege('anon', f, 'execute'))
   from unnest(array[
     'private.signal_round_batch(jsonb)', 'private.signal_round_accounts(uuid, jsonb, integer, integer)',
     'private.register_missed_signal_slots(uuid, timestamptz)']) f),
  true, 'o lote e a Rodada perdida ficam no servidor: o navegador não os chama');
select is(
  has_function_privilege('authenticated', 'public.suggest_signal_monthly_cap(uuid, uuid, jsonb)', 'execute')
    and has_function_privilege('authenticated', 'public.enable_signal_automation(uuid, uuid, integer)', 'execute')
    and not has_function_privilege('anon', 'public.suggest_signal_monthly_cap(uuid, uuid, jsonb)', 'execute')
    and not has_function_privilege('anon', 'public.enable_signal_automation(uuid, uuid, integer)', 'execute'),
  true, 'o Teto sugerido e a liberação da automação são de quem está logado, e o anon é recusado');
select is(
  has_function_privilege('service_role', 'public.claim_signal_run_requests(integer)', 'execute')
    and not has_function_privilege('authenticated', 'public.claim_signal_run_requests(integer)', 'execute')
    and not has_function_privilege('anon', 'public.claim_due_signal_monitors(integer)', 'execute'),
  true, 'o relógio continua só do servidor');

-- O tamanho do lote: o do Plano, ou 25 sem Plano, sempre de 1 a 100.
select is(private.signal_round_batch('{"maxEmpresasPorRodada":30}'), 30, 'o lote é o maxEmpresasPorRodada do Plano');
select is(private.signal_round_batch(null), 25, 'sem Plano, o lote é o padrão: 25');
select is(private.signal_round_batch('{}'), 25, 'e Plano sem o campo também');
select is(private.signal_round_batch('{"maxEmpresasPorRodada":0}'), 1, 'o lote nunca é menor que 1');
select is(private.signal_round_batch('{"maxEmpresasPorRodada":500}'), 100, 'nem maior que 100');

-- 2. A Agenda: 12 por dia, 1 h entre elas, e o fim do escopo grande.
select lives_ok($$select private.validate_signal_schedule('{"horarios":["08:00","09:00","10:00","11:00","12:00","13:00","14:00","15:00","16:00","17:00","18:00","19:00"],"dias":[1]}', 0)$$,
  'doze horários de hora em hora são aceitos');
select throws_ok($$select private.validate_signal_schedule('{"horarios":["08:00","09:00","10:00","11:00","12:00","13:00","14:00","15:00","16:00","17:00","18:00","19:00","20:00"],"dias":[1]}', 0)$$,
  '22023', 'signal schedule invalid: muitos_horarios', 'treze são recusados');
select lives_ok($$select private.validate_signal_schedule('{"horarios":["08:00","09:00"],"dias":[1]}', 0)$$, '08:00 e 09:00 passam');
select throws_ok($$select private.validate_signal_schedule('{"horarios":["08:00","08:45"],"dias":[1]}', 0)$$,
  '22023', 'signal schedule invalid: intervalo_curto', '08:00 e 08:45 dão intervalo_curto');
select throws_ok($$select private.validate_signal_schedule('{"horarios":["23:30","00:15"],"dias":[1]}', 0)$$,
  '22023', 'signal schedule invalid: intervalo_curto', '23:30 e 00:15 dão intervalo_curto na virada do dia');
select lives_ok($$select private.validate_signal_schedule('{"horarios":["23:00","00:00"],"dias":[1]}', 0)$$, 'e 23:00 e 00:00 passam na virada');
select is(private.signal_schedule_default_days(), '[1,2,3,4,5]'::jsonb, 'o padrão dos dias continua seg-sex');

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'fd000000-0000-4000-8000-000000000001', true);

-- 500 Contas com 3 horários, por todos os caminhos.
select is(
  public.save_signal_schedule('fd100000-0000-4000-8000-000000000002', 'fd300000-0000-4000-8000-000000000021',
    '{"horarios":["08:00","12:00","16:00"]}') ->> 'horarios',
  '["08:00", "12:00", "16:00"]', 'gravar a Agenda de 3 horários aceita um Sinal de Grande');
select lives_ok(
  $$select public.save_signal_monitor('fd100000-0000-4000-8000-000000000002', 'fd300000-0000-4000-8000-000000000022', 'vaga_linkedin', 'G2', 'ativo',
    (select pg_temp.grande(1, 500)), '{}', 24)$$,
  'o editor aceita 500 Contas num Sinal com 3 horários (o público que muda não é recusado)');
select is(
  (select count(*)::int from public.preview_signal_schedule('{"horarios":["08:00","12:00","16:00"]}', '2026-10-23 18:00:00-03', 5, 500)), 5,
  'a prévia aceita a Agenda de 3 horários com 500 Contas');
select is(
  (select q.por_rodada from public.quote_signal_schedule('fd100000-0000-4000-8000-000000000002', 'fd300000-0000-4000-8000-000000000023',
    '{"horarios":["08:00","12:00","16:00"]}') q),
  200, 'e a cotação também: 500 Contas, mas o lote é 100 (100 × 2 créditos)');

-- O Plano aceita 500 Contas e recusa 501.
create temporary table plano (k text primary key, p jsonb) on commit drop;
grant select on plano to authenticated;
insert into plano
select k, jsonb_build_object('versao', 1, 'origem', 'briefing',
  'escopo', jsonb_build_object('tipo', 'contas', 'contaIds', (select jsonb_agg('fd210000-0000-4000-8000-' || lpad(i::text, 12, '0')) from generate_series(1, n) i)),
  'sinais', jsonb_build_array(jsonb_build_object('tipo', 'vaga_linkedin',
    'criterios', '{"funcoes":["RevOps e GTM"],"senioridade":"Liderança","localizacao":["Brasil"],"periodo":"Últimos 30 dias","palavras":"lakehouse"}'::jsonb)),
  'explicacao', 'Acompanha vagas de RevOps.', 'maxEmpresasPorRodada', 25)
from (values ('quinhentas', 500), ('quinhentas_e_uma', 501)) as t (k, n);
select lives_ok(
  $$select public.save_signal_plan('fd100000-0000-4000-8000-000000000002', 'Quinhentas', null, (select p from plano where k = 'quinhentas'))$$,
  'o Plano aceita 500 Contas');
select throws_ok(
  $$select public.save_signal_plan('fd100000-0000-4000-8000-000000000002', 'Quinhentas e uma', null, (select p from plano where k = 'quinhentas_e_uma'))$$,
  '22023', 'invalid signal plan', 'e recusa 501');
reset role;

-- 3. O lote com rotação na Rodada agendada: 60 Contas e lote 25.
select pg_temp.reivindicar('m1r1', 'fd300000-0000-4000-8000-000000000001');
select is((select pg_temp.nomes(accounts) from claims where k = 'm1r1'), pg_temp.faixa(1, 25), 'a Rodada 1 recebe as Contas 1 a 25');
select public.finish_signal_monitor_run('fd300000-0000-4000-8000-000000000001', 25, null, false);
select is(
  (select m.scan_offset || '|' || m.round_attempted || '|' || (m.next_run_at > now()) || '|' || (m.current_slot_at is null)
   from private.signal_monitors m where m.id = 'fd300000-0000-4000-8000-000000000001'),
  '25|0|true|true', 'a Rodada fechou no lote: o cursor foi para 25, a contagem da Rodada zerou e a próxima é a da Agenda');
select pg_temp.reivindicar('m1r2', 'fd300000-0000-4000-8000-000000000001');
select is((select pg_temp.nomes(accounts) from claims where k = 'm1r2'), pg_temp.faixa(26, 50), 'a Rodada 2 recebe as Contas 26 a 50');
select public.finish_signal_monitor_run('fd300000-0000-4000-8000-000000000001', 25, null, false);
select pg_temp.reivindicar('m1r3', 'fd300000-0000-4000-8000-000000000001');
select is((select pg_temp.nomes(accounts) from claims where k = 'm1r3'), array_cat(pg_temp.faixa(51, 60), pg_temp.faixa(1, 15)),
  'a Rodada 3 recebe as Contas 51 a 60 e volta ao começo: 1 a 15');
select public.finish_signal_monitor_run('fd300000-0000-4000-8000-000000000001', 25, null, false);
select is((select m.scan_offset from private.signal_monitors m where m.id = 'fd300000-0000-4000-8000-000000000001'), 75, 'o cursor andou 75 Contas');

-- A continuação por prazo no meio do lote: não passa do lote e não cobra a mesma Conta duas vezes.
select pg_temp.reivindicar('m2c1', 'fd300000-0000-4000-8000-000000000002');
select is((select pg_temp.nomes(accounts) from claims where k = 'm2c1'), pg_temp.faixa(1, 25), 'a primeira chamada recebe o lote: Contas 1 a 25');
create temporary table varreduras (k text primary key, outcome text, reservation_id uuid) on commit drop;
insert into varreduras select 'c01', outcome, reservation_id
from public.begin_account_scan('fd100000-0000-4000-8000-000000000001', 'fd000000-0000-4000-8000-000000000001',
  'fd300000-0000-4000-8000-000000000002', 'fd200000-0000-4000-8000-000000000001', (select slot from claims where k = 'm2c1'));
select public.end_account_scan((select reservation_id from varreduras where k = 'c01'), true);
insert into varreduras select 'c02', outcome, reservation_id
from public.begin_account_scan('fd100000-0000-4000-8000-000000000001', 'fd000000-0000-4000-8000-000000000001',
  'fd300000-0000-4000-8000-000000000002', 'fd200000-0000-4000-8000-000000000002', (select slot from claims where k = 'm2c1'));
select public.end_account_scan((select reservation_id from varreduras where k = 'c02'), true);
select public.finish_signal_monitor_run('fd300000-0000-4000-8000-000000000002', 2, null, true);
select is(
  (select m.round_attempted || '|' || (m.current_slot_at = (select slot from claims where k = 'm2c1')) from private.signal_monitors m
   where m.id = 'fd300000-0000-4000-8000-000000000002'),
  '2|true', 'o tempo acabou depois de 2 Contas: a Rodada continua, com o mesmo horário e 2 Contas contadas');
select pg_temp.reivindicar('m2c2', 'fd300000-0000-4000-8000-000000000002', false);
select is((select pg_temp.nomes(accounts) from claims where k = 'm2c2'), pg_temp.faixa(3, 25),
  'a continuação recebe só o que falta do lote: Contas 3 a 25, e não passa de 25');
select is((select slot from claims where k = 'm2c2'), (select slot from claims where k = 'm2c1'), 'com o mesmo horário da Rodada');
insert into varreduras select 'c01b', outcome, reservation_id
from public.begin_account_scan('fd100000-0000-4000-8000-000000000001', 'fd000000-0000-4000-8000-000000000001',
  'fd300000-0000-4000-8000-000000000002', 'fd200000-0000-4000-8000-000000000001', (select slot from claims where k = 'm2c2'));
select is((select outcome from varreduras where k = 'c01b'), 'done', 'a Conta já cobrada nesta Rodada volta como done: não é cobrada de novo');
select public.finish_signal_monitor_run('fd300000-0000-4000-8000-000000000002', 23, null, true);
select is(
  (select m.round_attempted || '|' || (m.current_slot_at is null) || '|' || m.scan_offset || '|' || (m.next_run_at > now())
   from private.signal_monitors m where m.id = 'fd300000-0000-4000-8000-000000000002'),
  '0|true|25|true', 'o lote acabou (2 + 23): mesmo pedindo para continuar, a Rodada fecha e a próxima é a da Agenda');
select is(
  (select count(*)::int from private.credit_reservations r where r.action_key like 'scan:fd300000-0000-4000-8000-000000000002:%'),
  2, 'e a Rodada inteira teve uma cobrança por Conta varrida (duas)');

-- Lote maior que a lista; o legado sem Plano usa o padrão 25.
select pg_temp.reivindicar('m4', 'fd300000-0000-4000-8000-000000000004');
select is((select pg_temp.nomes(accounts) from claims where k = 'm4'), pg_temp.faixa(1, 3), 'com 3 Contas e lote 25, a Rodada leva as 3');
select public.finish_signal_monitor_run('fd300000-0000-4000-8000-000000000004', 3, null, false);
select is((select m.scan_offset from private.signal_monitors m where m.id = 'fd300000-0000-4000-8000-000000000004'), 3,
  'e o cursor anda 3: a lista toda é a Rodada, que recomeça no começo');
select pg_temp.reivindicar('ml', 'fd300000-0000-4000-8000-000000000006');
select is((select pg_temp.nomes(accounts) from claims where k = 'ml'), pg_temp.faixa(1, 25),
  'o Monitoramento legado, sem Plano, usa o lote padrão: 25');
select public.finish_signal_monitor_run('fd300000-0000-4000-8000-000000000006', 25, null, false);
select is((select m.scan_offset from private.signal_monitors m where m.id = 'fd300000-0000-4000-8000-000000000006'), 25,
  'e gira pela lista como os demais');

-- Mudar o público zera a rotação; renomear o Sinal não zera.
set local role authenticated;
select public.save_signal_monitor('fd100000-0000-4000-8000-000000000001', 'fd300000-0000-4000-8000-000000000006', 'vaga_linkedin', 'ML renomeado', 'ativo',
  (select pg_temp.norte(1, 60)), '{}', 24);
reset role;
select is((select m.scan_offset from private.signal_monitors m where m.id = 'fd300000-0000-4000-8000-000000000006'), 25,
  'renomear o Sinal mantém o cursor da rotação');
set local role authenticated;
select public.save_signal_monitor('fd100000-0000-4000-8000-000000000001', 'fd300000-0000-4000-8000-000000000006', 'vaga_linkedin', 'ML renomeado', 'ativo',
  (select pg_temp.norte(1, 59)), '{}', 24);
reset role;
select is((select m.scan_offset from private.signal_monitors m where m.id = 'fd300000-0000-4000-8000-000000000006'), 0,
  'e mudar o público volta ao começo da lista');

-- 4. O lote com rotação no "Rodar agora" (M1, cujo cursor está em 75).
insert into private.signal_run_requests (id, workspace_id, monitor_id, requested_by, quote_credits) values
  ('fd400000-0000-4000-8000-000000000001', 'fd100000-0000-4000-8000-000000000001', 'fd300000-0000-4000-8000-000000000001',
   'fd000000-0000-4000-8000-000000000001', 50);
create temporary table pedidos (k text primary key, accounts jsonb, scan_offset integer) on commit drop;
insert into pedidos select 'p1', c.accounts, c.scan_offset from public.claim_signal_run_requests(5) c where c.request_id = 'fd400000-0000-4000-8000-000000000001';
select is((select pg_temp.nomes(accounts) from pedidos where k = 'p1'), pg_temp.faixa(16, 40),
  'o pedido começa no cursor do Monitoramento (75, a Conta 16) e leva o lote de 25');
select is((select r.start_offset from private.signal_run_requests r where r.id = 'fd400000-0000-4000-8000-000000000001'), 75,
  'o cursor de partida fica guardado no pedido');
select public.finish_signal_run_request('fd400000-0000-4000-8000-000000000001', 'pendente', 10, null);
insert into pedidos select 'p2', c.accounts, c.scan_offset from public.claim_signal_run_requests(5) c where c.request_id = 'fd400000-0000-4000-8000-000000000001';
select is((select pg_temp.nomes(accounts) from pedidos where k = 'p2'), pg_temp.faixa(26, 40),
  'a volta seguinte do pedido segue de onde parou e só leva o que falta do lote (15)');
select is((select r.start_offset from private.signal_run_requests r where r.id = 'fd400000-0000-4000-8000-000000000001'), 75,
  'sem mudar o cursor de partida');
select is((select m.scan_offset from private.signal_monitors m where m.id = 'fd300000-0000-4000-8000-000000000001'), 75,
  'enquanto o pedido não termina, o cursor do Monitoramento não anda');
select public.finish_signal_run_request('fd400000-0000-4000-8000-000000000001', 'feita', 15, null);
select is((select m.scan_offset from private.signal_monitors m where m.id = 'fd300000-0000-4000-8000-000000000001'), 100,
  'o pedido terminou: o cursor avançou pelas 25 Contas tentadas');
select pg_temp.reivindicar('m1r4', 'fd300000-0000-4000-8000-000000000001');
select is((select pg_temp.nomes(accounts) from claims where k = 'm1r4'), array_cat(pg_temp.faixa(41, 60), pg_temp.faixa(1, 5)),
  'e a próxima Rodada agendada segue na lista: 41 a 60 e 1 a 5');
select public.finish_signal_monitor_run('fd300000-0000-4000-8000-000000000001', 25, null, false);

-- O pedido que falha não anda com o cursor.
insert into private.signal_run_requests (id, workspace_id, monitor_id, requested_by, quote_credits) values
  ('fd400000-0000-4000-8000-000000000002', 'fd100000-0000-4000-8000-000000000001', 'fd300000-0000-4000-8000-000000000001',
   'fd000000-0000-4000-8000-000000000001', 50);
select count(*) from public.claim_signal_run_requests(5);
select public.finish_signal_run_request('fd400000-0000-4000-8000-000000000002', 'falhou', 4, 'falha simulada');
select is((select m.scan_offset from private.signal_monitors m where m.id = 'fd300000-0000-4000-8000-000000000001'), 125,
  'o pedido que falha não avança o cursor do Monitoramento');

-- Uma Rodada agendada não passa por cima do pedido já começado.
insert into private.signal_run_requests (id, workspace_id, monitor_id, requested_by, quote_credits) values
  ('fd400000-0000-4000-8000-000000000003', 'fd100000-0000-4000-8000-000000000001', 'fd300000-0000-4000-8000-000000000005',
   'fd000000-0000-4000-8000-000000000001', 50);
select public.open_signal_run('fd300000-0000-4000-8000-000000000005', now(), 'fd400000-0000-4000-8000-000000000003');
update private.signal_monitors set next_run_at = now() - interval '1 second' where id = 'fd300000-0000-4000-8000-000000000005';
select is(
  (select count(*)::int from public.claim_due_signal_monitors(20) c where c.monitor_id = 'fd300000-0000-4000-8000-000000000005'), 0,
  'com um pedido manual que já tem Rodada, o relógio não pega o Monitoramento: entre duas voltas do pedido só o pedido anda');

-- A cobrança não duplica: a chave do manual é por pedido e a do agendado, por horário.
insert into varreduras select 'ag1', outcome, reservation_id
from public.begin_account_scan('fd100000-0000-4000-8000-000000000001', 'fd000000-0000-4000-8000-000000000001',
  'fd300000-0000-4000-8000-000000000003', 'fd200000-0000-4000-8000-000000000001', '2026-10-26 11:00:00+00', 'agenda', null);
select public.end_account_scan((select reservation_id from varreduras where k = 'ag1'), true);
insert into varreduras select 'ag2', outcome, reservation_id
from public.begin_account_scan('fd100000-0000-4000-8000-000000000001', 'fd000000-0000-4000-8000-000000000001',
  'fd300000-0000-4000-8000-000000000003', 'fd200000-0000-4000-8000-000000000001', '2026-10-26 11:00:00+00', 'agenda', null);
insert into varreduras select 'ma1', outcome, reservation_id
from public.begin_account_scan('fd100000-0000-4000-8000-000000000001', 'fd000000-0000-4000-8000-000000000001',
  'fd300000-0000-4000-8000-000000000003', 'fd200000-0000-4000-8000-000000000001', now(), 'manual', 'fd400000-0000-4000-8000-000000000003');
select public.end_account_scan((select reservation_id from varreduras where k = 'ma1'), true);
insert into varreduras select 'ma2', outcome, reservation_id
from public.begin_account_scan('fd100000-0000-4000-8000-000000000001', 'fd000000-0000-4000-8000-000000000001',
  'fd300000-0000-4000-8000-000000000003', 'fd200000-0000-4000-8000-000000000001', now(), 'manual', 'fd400000-0000-4000-8000-000000000003');
select is(
  (select (select outcome from varreduras where k = 'ag1') || '|' || (select outcome from varreduras where k = 'ag2') || '|'
       || (select outcome from varreduras where k = 'ma1') || '|' || (select outcome from varreduras where k = 'ma2')),
  'go|done|go|done', 'a Conta é cobrada uma vez por horário e uma vez por pedido, e repetir a chamada não cobra de novo');

-- O pedido cuja Rodada agendada ficou aberta: a Rodada que é encerrada zera a contagem do lote.
insert into private.signal_monitor_runs (id, workspace_id, monitor_id, state) values
  ('fd500000-0000-4000-8000-000000000001', 'fd100000-0000-4000-8000-000000000001', 'fd300000-0000-4000-8000-000000000003', 'rodando');
update private.signal_monitors set state = 'pausado', current_run_id = 'fd500000-0000-4000-8000-000000000001', round_attempted = 7
where id = 'fd300000-0000-4000-8000-000000000003';
insert into private.signal_run_requests (id, workspace_id, monitor_id, requested_by, quote_credits) values
  ('fd400000-0000-4000-8000-000000000004', 'fd100000-0000-4000-8000-000000000001', 'fd300000-0000-4000-8000-000000000003',
   'fd000000-0000-4000-8000-000000000001', 50);
select count(*) from public.claim_signal_run_requests(5);
select is(
  (select m.current_run_id is null and m.round_attempted = 0 from private.signal_monitors m where m.id = 'fd300000-0000-4000-8000-000000000003'),
  true, 'a Rodada agendada que ficou aberta e é encerrada para o pedido passar zera a contagem do lote');

-- 5. Preço e cotação pelo lote.
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'fd000000-0000-4000-8000-000000000001', true);
select is(
  (select q.por_rodada || '|' || q.rodadas_por_semana || '|' || q.por_dia || '|' || q.por_mes_aprox || '|' || q.teto_diario_sugerido
   from public.quote_signal_schedule('fd100000-0000-4000-8000-000000000001', 'fd300000-0000-4000-8000-000000000001') q),
  '50|10|100|2167|100',
  '60 Contas, lote 25, 2 horários em dias úteis, 2 créditos por Conta: 50 por rodada, 10 por semana, 100 por dia, cerca de 2.167 por mês');
select is(
  (select q.por_rodada from public.quote_signal_schedule('fd100000-0000-4000-8000-000000000001', 'fd300000-0000-4000-8000-000000000006') q),
  50, 'o legado sem Plano é cotado pelo lote padrão: 25 × 2 créditos');
select is(
  (select q.por_rodada from public.quote_signal_schedule('fd100000-0000-4000-8000-000000000001', 'fd300000-0000-4000-8000-00000000000a') q),
  120, 'e o lote maior que a lista conta a lista: 60 Contas × 2 créditos');
select is(
  (select q.por_rodada from public.quote_signal_schedule('fd100000-0000-4000-8000-000000000001', 'fd300000-0000-4000-8000-000000000004') q),
  6, 'e 3 Contas com lote 25 custam 3 × 2 créditos');
select is(
  (select q.contas || '|' || q.contas_sem_dado || '|' || q.creditos_por_conta || '|' || q.ate_creditos
   from public.quote_signal_run('fd100000-0000-4000-8000-000000000001', 'fd300000-0000-4000-8000-000000000001') q),
  '25|0|2|50', 'a prévia do Rodar agora conta o lote: 25 Contas e até 50 créditos');
select is(
  (select q.contas || '|' || q.contas_sem_dado || '|' || q.ate_creditos
   from public.quote_signal_run('fd100000-0000-4000-8000-000000000001', 'fd300000-0000-4000-8000-000000000008') q),
  '25|10|50', 'as Contas sem dado são estimadas sobre o próximo lote (as 10 primeiras não têm a página no LinkedIn)');
reset role;
update private.signal_monitors set scan_offset = 25 where id = 'fd300000-0000-4000-8000-000000000008';
set local role authenticated;
select is(
  (select q.contas || '|' || q.contas_sem_dado from public.quote_signal_run('fd100000-0000-4000-8000-000000000001', 'fd300000-0000-4000-8000-000000000008') q),
  '25|0', 'e, com o cursor adiante, o próximo lote (26 a 50) não tem Conta sem dado: a estimativa acompanha a rotação');

-- O limite por dia sugerido acompanha o lote.
select throws_ok(
  $$select public.save_signal_daily_cap('fd100000-0000-4000-8000-000000000001', 'fd300000-0000-4000-8000-000000000001', 101)$$,
  '22023', 'daily credit cap invalid: acima_do_sugerido', 'o limite por dia não passa do custo de um dia pelo lote (100), e não da lista inteira (240)');
select is(public.save_signal_daily_cap('fd100000-0000-4000-8000-000000000001', 'fd300000-0000-4000-8000-000000000001', 100), 100,
  'e 100 é aceito');
reset role;
update private.signal_monitors set daily_credit_cap = 40 where id = 'fd300000-0000-4000-8000-000000000001';
select is(public.signal_round_exceeds_daily_cap('fd300000-0000-4000-8000-000000000001'), true,
  'o limite de 40 créditos por dia não comporta uma Rodada de 25 Contas (50 créditos)');
update private.signal_monitors set daily_credit_cap = 100 where id = 'fd300000-0000-4000-8000-000000000001';
select is(public.signal_round_exceeds_daily_cap('fd300000-0000-4000-8000-000000000001'), false, 'mas o de 100 comporta');

-- 6. A Rodada perdida em Rodadas.
select is(private.register_missed_signal_slots('fd300000-0000-4000-8000-000000000012', '2026-10-26 16:05:00-03'), '2026-10-26 16:00:00-03'::timestamptz,
  'com o relógio de volta às 16:05, a Rodada roda no horário vencido mais recente: 16:00');
select is(
  (select array_agg(x.slot_at order by x.slot_at) from private.signal_monitor_runs x
   where x.monitor_id = 'fd300000-0000-4000-8000-000000000012' and x.stop_reason = 'perdida'),
  array['2026-10-26 08:00:00-03', '2026-10-26 12:00:00-03']::timestamptz[], 'e os horários 08:00 e 12:00 viram Rodadas perdidas');
select is(
  (select bool_and(x.origin = 'agenda' and x.state = 'concluida' and x.accounts_checked = 0 and x.signals_new = 0 and x.signals_repeated = 0
                   and x.credits_charged = 0 and x.accounts_without_data = 0 and x.started_at = x.finished_at)
   from private.signal_monitor_runs x where x.monitor_id = 'fd300000-0000-4000-8000-000000000012'),
  true, 'cada uma concluída, da Agenda, sem contagens nem créditos');
select is(
  (select count(*)::int from private.signal_monitor_runs x where x.monitor_id = 'fd300000-0000-4000-8000-000000000012' and x.slot_at = '2026-10-26 16:00:00-03'),
  0, 'o horário que roda não vira linha perdida');
select is(private.register_missed_signal_slots('fd300000-0000-4000-8000-000000000012', '2026-10-26 16:05:00-03'), '2026-10-26 16:00:00-03'::timestamptz,
  'repetir a conta devolve o mesmo horário');
select is((select count(*)::int from private.signal_monitor_runs x where x.monitor_id = 'fd300000-0000-4000-8000-000000000012'), 2,
  'e não duplica as linhas');
select is(private.register_missed_signal_slots('fd300000-0000-4000-8000-000000000013', '2026-10-26 08:09:00-03'), '2026-10-26 08:00:00-03'::timestamptz,
  'às 08:09 a Rodada de 08:00 roda');
select is((select count(*)::int from private.signal_monitor_runs x where x.monitor_id = 'fd300000-0000-4000-8000-000000000013'), 0,
  'e não há Rodada perdida: o runner só atrasou dentro do mesmo horário');
select is(private.register_missed_signal_slots('fd300000-0000-4000-8000-000000000014', '2026-10-26 20:00:00-03'), '2026-10-26 19:00:00-03'::timestamptz,
  'muitos horários vencidos juntos: a Rodada roda no mais recente');
select is((select count(*)::int from private.signal_monitor_runs x where x.monitor_id = 'fd300000-0000-4000-8000-000000000014' and x.stop_reason = 'perdida'), 20,
  'e no máximo 20 linhas perdidas por chamada');
select is(private.register_missed_signal_slots('fd300000-0000-4000-8000-000000000019', '2026-10-26 20:00:00-03'), '2026-10-26 19:00:00-03'::timestamptz,
  'depois de uma parada de meses, o horário que roda continua sendo o vencido mais recente');
select is(
  (select min(x.slot_at) >= '2026-10-18 00:00:00-03'::timestamptz from private.signal_monitor_runs x
   where x.monitor_id = 'fd300000-0000-4000-8000-000000000019' and x.stop_reason = 'perdida'),
  true, 'e as linhas perdidas são só as dos últimos 8 dias');
select is(private.register_missed_signal_slots('fd300000-0000-4000-8000-000000000015', '2026-10-26 20:00:00-03'), null,
  'o Monitoramento sem Agenda não tem Rodada perdida');
select is(private.register_missed_signal_slots('fd300000-0000-4000-8000-000000000016', '2026-10-26 16:05:00-03'), '2026-10-26 16:00:00-03'::timestamptz,
  'uma hora marcada que não é da Agenda (08:07) ainda roda no horário mais recente');
select is(
  (select array_agg(x.slot_at order by x.slot_at) from private.signal_monitor_runs x where x.monitor_id = 'fd300000-0000-4000-8000-000000000016'),
  array['2026-10-26 12:00:00-03']::timestamptz[], 'mas só os horários que são da Agenda viram Rodada perdida');

-- Pelo relógio de verdade: tudo que venceu antes do horário mais recente vira linha; só roda uma Rodada; repetir não duplica; o pausado não gera.
update private.signal_monitors set next_run_at = private.next_signal_run(schedule, now() - interval '40 hours')
where id = 'fd300000-0000-4000-8000-000000000017';
create temporary table vencidos (n integer, ultimo timestamptz) on commit drop;
insert into vencidos
with recursive s (t) as (
  select m.next_run_at from private.signal_monitors m where m.id = 'fd300000-0000-4000-8000-000000000017'
  union all
  select private.next_signal_run(m.schedule, s.t) from s, private.signal_monitors m
  where m.id = 'fd300000-0000-4000-8000-000000000017' and private.next_signal_run(m.schedule, s.t) <= now()
)
select count(*)::int, max(t) from s;
select pg_temp.reivindicar('mpc', 'fd300000-0000-4000-8000-000000000017', false);
select is((select slot from claims where k = 'mpc'), (select ultimo from vencidos), 'o relógio entrega o horário vencido mais recente');
select is(
  (select count(*)::int from private.signal_monitor_runs x where x.monitor_id = 'fd300000-0000-4000-8000-000000000017' and x.stop_reason = 'perdida'),
  (select n - 1 from vencidos), 'e cada horário vencido antes dele vira uma linha perdida');
select is(
  (select count(*)::int from private.signal_monitor_runs x where x.monitor_id = 'fd300000-0000-4000-8000-000000000017' and x.stop_reason is distinct from 'perdida'), 0,
  'sem compensação: nenhuma outra Rodada foi aberta');
update private.signal_monitors set claimed_until = null, current_slot_at = null,
  next_run_at = private.next_signal_run(schedule, now() - interval '40 hours')
where id = 'fd300000-0000-4000-8000-000000000017';
select pg_temp.reivindicar('mpc2', 'fd300000-0000-4000-8000-000000000017', false);
select is(
  (select count(*)::int from private.signal_monitor_runs x where x.monitor_id = 'fd300000-0000-4000-8000-000000000017' and x.stop_reason = 'perdida'),
  (select n - 1 from vencidos), 'repetir o claim não duplica as linhas');
select is(
  (select count(*)::int from private.signal_monitor_runs x where x.monitor_id = 'fd300000-0000-4000-8000-000000000018'), 0,
  'o Sinal pausado não é reivindicado e não gera Rodada perdida');

-- O motivo novo entra no progresso da Rodada e na lista.
select lives_ok(
  $$select public.add_signal_run_progress(public.open_signal_run('fd300000-0000-4000-8000-000000000015', now()), 0, 0, 0, 0, '{}', 'perdida')$$,
  'o progresso da Rodada aceita o motivo perdida');
select throws_ok(
  $$select public.add_signal_run_progress(public.open_signal_run('fd300000-0000-4000-8000-000000000015', now()), 0, 0, 0, 0, '{}', 'inventado')$$,
  '22023', 'invalid stop reason', 'e continua recusando motivo que não existe');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'fd000000-0000-4000-8000-000000000001', true);
create temporary table historico (rodada jsonb) on commit drop;
grant all on historico to authenticated;
insert into historico
select r from jsonb_array_elements(public.list_signal_runs('fd100000-0000-4000-8000-000000000001', 'fd300000-0000-4000-8000-000000000012') -> 'rodadas') r;
select is(
  (select array_agg((h.rodada ->> 'horarioMarcado')::timestamptz order by (h.rodada ->> 'horarioMarcado')::timestamptz) from historico h
   where h.rodada ->> 'motivoDaParada' = 'perdida' and (h.rodada ->> 'creditos')::int = 0 and h.rodada ->> 'estado' = 'concluida'),
  array['2026-10-26 08:00:00-03', '2026-10-26 12:00:00-03']::timestamptz[],
  'Rodadas lista as duas perdidas com o horário marcado, o motivo e 0 créditos');
reset role;

-- 7. O Teto mensal pré-preenchido.
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'fd000000-0000-4000-8000-000000000001', true);
select is(public.suggest_signal_monthly_cap('fd100000-0000-4000-8000-000000000001', 'fd300000-0000-4000-8000-000000000001'), 2601,
  'o Teto sugerido é o custo do mês mais 20%, para cima: ceil(2.167 × 1,2) = 2.601');
select is(public.suggest_signal_monthly_cap('fd100000-0000-4000-8000-000000000001', 'fd300000-0000-4000-8000-000000000001', '{"horarios":["08:00"]}'), 1301,
  'e acompanha a Agenda proposta: um horário em dias úteis dá ceil(1.084 × 1,2) = 1.301');
select is(public.suggest_signal_monthly_cap('fd100000-0000-4000-8000-000000000002', 'fd300000-0000-4000-8000-000000000021'), 4500,
  'e fica limitado aos créditos da faixa do contrato (200 por rodada daria mais de 10 mil no mês)');
select throws_ok(
  $$select public.suggest_signal_monthly_cap('fd100000-0000-4000-8000-000000000001', 'fd300000-0000-4000-8000-000000000001', '{"horarios":["08:00","08:45"]}')$$,
  '22023', 'signal schedule invalid: intervalo_curto', 'a Agenda proposta passa pela mesma conferência do servidor');
select set_config('request.jwt.claim.sub', 'fd000000-0000-4000-8000-000000000002', true);
select is(public.suggest_signal_monthly_cap('fd100000-0000-4000-8000-000000000001', 'fd300000-0000-4000-8000-000000000001'), 2601,
  'qualquer participante vê o sugerido (o membro também)');
select set_config('request.jwt.claim.sub', 'fd000000-0000-4000-8000-000000000003', true);
select throws_ok(
  $$select public.suggest_signal_monthly_cap('fd100000-0000-4000-8000-000000000001', 'fd300000-0000-4000-8000-000000000001')$$,
  '42501', 'active workspace membership required', 'quem não participa do Workspace é recusado');
select throws_ok(
  $$select public.enable_signal_automation('fd100000-0000-4000-8000-000000000003', 'fd300000-0000-4000-8000-000000000031', 2601)$$,
  '42501', 'active workspace membership required', 'e não libera a automação');
reset role;
-- O anon é recusado.
set local role anon;
select throws_ok(
  $$select public.suggest_signal_monthly_cap('fd100000-0000-4000-8000-000000000001', 'fd300000-0000-4000-8000-000000000001')$$,
  '42501', null, 'o anon não chama o Teto sugerido');
select throws_ok(
  $$select public.enable_signal_automation('fd100000-0000-4000-8000-000000000003', 'fd300000-0000-4000-8000-000000000031', 2601)$$,
  '42501', null, 'nem libera a automação');
reset role;

-- Liberar a automação: o Teto (Workspace 3) está em "confirmar" e o limite do contrato é 1.000.
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'fd000000-0000-4000-8000-000000000001', true);
select is(
  (select q.bloqueio_ativacao from public.quote_signal_schedule('fd100000-0000-4000-8000-000000000003', 'fd300000-0000-4000-8000-000000000031',
    '{"horarios":["08:00"]}') q),
  'sem_teto_automacao', 'antes, a cotação diz que falta liberar a automação');
select set_config('request.jwt.claim.sub', 'fd000000-0000-4000-8000-000000000002', true);
select throws_ok(
  $$select public.enable_signal_automation('fd100000-0000-4000-8000-000000000003', 'fd300000-0000-4000-8000-000000000031', 2601)$$,
  '42501', 'signal automation invalid: nao_administrador', 'o membro comum é recusado');
select set_config('request.jwt.claim.sub', 'fd000000-0000-4000-8000-000000000001', true);
select throws_ok(
  $$select public.enable_signal_automation('fd100000-0000-4000-8000-000000000003', 'fd300000-0000-4000-8000-000000000031', 0)$$,
  '22023', 'signal automation invalid: limite_invalido', 'limite zero é recusado');
select throws_ok(
  $$select public.enable_signal_automation('fd100000-0000-4000-8000-000000000003', 'fd300000-0000-4000-8000-000000000031', null)$$,
  '22023', 'signal automation invalid: limite_invalido', 'limite vazio também');
select throws_ok(
  $$select public.enable_signal_automation('fd100000-0000-4000-8000-000000000003', 'fd300000-0000-4000-8000-000000000031', 4501)$$,
  '22023', 'signal automation invalid: acima_da_faixa', 'acima dos créditos da faixa (4.500) é recusado');
select lives_ok(
  $$select public.enable_signal_automation('fd100000-0000-4000-8000-000000000003', 'fd300000-0000-4000-8000-000000000031', 2601)$$,
  'o Administrador libera com o limite sugerido');
select is(
  (select q.bloqueio_ativacao from public.quote_signal_schedule('fd100000-0000-4000-8000-000000000003', 'fd300000-0000-4000-8000-000000000031',
    '{"horarios":["08:00"]}') q),
  null, 'depois, a cotação não devolve mais sem_teto_automacao');
reset role;
select is(
  (select s.mode || '|' || s.monthly_cap::integer from private.automation_settings s
   where s.workspace_id = 'fd100000-0000-4000-8000-000000000003' and s.scope = 'acao:varredura'),
  'automatico|2601', 'a varredura ficou em automático com o limite');
select is(private.workspace_monthly_limit('fd100000-0000-4000-8000-000000000003'), 2601::numeric, 'e o limite mensal do Workspace subiu para o sugerido');

-- Nunca baixa um limite que já existe (Workspace 4, limite 3.000).
set local role authenticated;
select set_config('request.jwt.claim.sub', 'fd000000-0000-4000-8000-000000000001', true);
select public.enable_signal_automation('fd100000-0000-4000-8000-000000000004', 'fd300000-0000-4000-8000-000000000032', 2000);
reset role;
select is(private.workspace_monthly_limit('fd100000-0000-4000-8000-000000000004'), 3000::numeric, 'liberar com 2.000 não baixa o limite de 3.000');
select is(
  (select s.mode || '|' || s.monthly_cap::integer from private.automation_settings s
   where s.workspace_id = 'fd100000-0000-4000-8000-000000000004' and s.scope = 'acao:varredura'),
  'automatico|3000', 'e o Teto da varredura fica no limite do Workspace');
-- Contrato suspenso; Equipe ilimitada só liga o automático.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'fd000000-0000-4000-8000-000000000001', true);
select throws_ok(
  $$select public.enable_signal_automation('fd100000-0000-4000-8000-000000000005', 'fd300000-0000-4000-8000-000000000033', 1000)$$,
  '22023', 'signal automation invalid: contrato_inativo', 'sem contrato ativo a automação não se libera');
select lives_ok(
  $$select public.enable_signal_automation('fd100000-0000-4000-8000-000000000006', 'fd300000-0000-4000-8000-000000000034', null)$$,
  'na Equipe ilimitada só se liga o automático, sem limite');
reset role;
select is(
  (select s.mode || '|' || coalesce(s.monthly_cap::text, 'sem limite') from private.automation_settings s
   where s.workspace_id = 'fd100000-0000-4000-8000-000000000006' and s.scope = 'acao:varredura'),
  'automatico|sem limite', 'e a varredura fica em automático sem limite');

-- 8. O aviso na 1ª Rodada pulada; a 3ª pausa como antes (MS, legado do Norte).
select pg_temp.pular('fd300000-0000-4000-8000-000000000009', '2026-03-02 11:00:00+00');
select is(
  (select m.consecutive_skips || '|' || m.state from private.signal_monitors m where m.id = 'fd300000-0000-4000-8000-000000000009'),
  '1|ativo', 'a 1ª Rodada pulada por falta de créditos conta 1 e o Sinal segue ativo');
select is(
  (select concat_ws('|', n.title, n.link) from private.workspace_notices n
   where n.workspace_id = 'fd100000-0000-4000-8000-000000000001' and n.kind = 'sinal_rodada_pulada'),
  'Rodada pulada por falta de créditos: MS|/sinais',
  'e grava um aviso do Workspace com o link da página de Sinais');
select pg_temp.pular('fd300000-0000-4000-8000-000000000009', '2026-03-03 11:00:00+00');
select is(
  (select m.consecutive_skips || '|' || m.state from private.signal_monitors m where m.id = 'fd300000-0000-4000-8000-000000000009'),
  '2|ativo', 'a 2ª pulada conta 2');
select is(
  (select count(*)::int from private.workspace_notices n where n.workspace_id = 'fd100000-0000-4000-8000-000000000001' and n.kind = 'sinal_rodada_pulada'),
  1, 'e não grava outro aviso');
select pg_temp.pular('fd300000-0000-4000-8000-000000000009', '2026-03-04 11:00:00+00');
select is(
  (select m.consecutive_skips || '|' || m.state || '|' || m.paused_reason from private.signal_monitors m where m.id = 'fd300000-0000-4000-8000-000000000009'),
  '3|pausado|sem_creditos', 'a 3ª pausa o Sinal por falta de créditos, como antes');
select is(
  (select n.kind || '|' || count(*) from private.workspace_notices n
   where n.workspace_id = 'fd100000-0000-4000-8000-000000000001' and n.kind = 'sinal_pausado' group by n.kind),
  'sinal_pausado|1', 'com o aviso de pausa');
select is(
  (select count(*)::int from private.workspace_notices n where n.workspace_id = 'fd100000-0000-4000-8000-000000000001' and n.kind = 'sinal_rodada_pulada'),
  1, 'e o aviso da 1ª pulada segue sendo um só');

-- 9. O intervalo mínimo entre Rodadas manuais é de 60 minutos.
insert into private.signal_run_requests (id, workspace_id, monitor_id, requested_by, quote_credits, state, requested_at, finished_at) values
  ('fd400000-0000-4000-8000-000000000010', 'fd100000-0000-4000-8000-000000000001', 'fd300000-0000-4000-8000-000000000007',
   'fd000000-0000-4000-8000-000000000001', 6, 'feita', now() - interval '59 minutes', now() - interval '58 minutes');
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'fd000000-0000-4000-8000-000000000001', true);
select is(
  (select q.bloqueio from public.quote_signal_run('fd100000-0000-4000-8000-000000000001', 'fd300000-0000-4000-8000-000000000007') q),
  'intervalo_minimo', 'uma Rodada manual de 59 minutos atrás ainda bloqueia');
reset role;
select is(
  (select q.o_liberado_em = r.requested_at + interval '60 minutes'
   from private.signal_run_quote('fd100000-0000-4000-8000-000000000001', 'fd300000-0000-4000-8000-000000000007', 'admin', 'fd000000-0000-4000-8000-000000000001') q,
        private.signal_run_requests r where r.id = 'fd400000-0000-4000-8000-000000000010'),
  true, 'e a prévia diz que libera 60 minutos depois do pedido');
update private.signal_run_requests set requested_at = now() - interval '61 minutes' where id = 'fd400000-0000-4000-8000-000000000010';
set local role authenticated;
select set_config('request.jwt.claim.sub', 'fd000000-0000-4000-8000-000000000001', true);
select is(
  (select q.bloqueio from public.quote_signal_run('fd100000-0000-4000-8000-000000000001', 'fd300000-0000-4000-8000-000000000007') q),
  null, 'com 61 minutos já pode rodar de novo');
reset role;

select * from finish();
rollback;
