-- Preço por rodada, estimativa por dia e por mês, e limites ao ativar o Sinal (agente-de-sinal 04).
--
-- Cada Rodada gasta créditos do Cliente. Antes de ativar, a pessoa vê quanto o Sinal pode gastar por Rodada, por dia e por mês
-- (aproximado) e quantos dias o saldo aguenta nesse ritmo. Só créditos: nada de US$, de custo de fornecedor, de nome de actor
-- nem de valor de Teto. Sem tabela de preço nova: o preço da Rodada é o que o runner já cobra, `scan_credits(tipo)` por Conta
-- no escopo Contas e o fixo da descoberta (`market_discovery_credits_per_run`) no escopo mercado.
--
-- 1. `private.signal_monitors` ganha o limite por dia (`daily_credit_cap`), as Rodadas puladas em sequência
--    (`consecutive_skips`) e o motivo da pausa (`paused_reason`). `signal_monitor_runs.stop_reason` aceita `teto_diario`.
-- 2. Os limites e o dia de Brasília, num lugar só: `private.signal_price_limit` (DECISÃO PENDENTE 14 e aviso de repetição).
-- 3. O preço e a estimativa: `private.signal_round_price`, `private.signal_cost_estimate` e `public.quote_signal_schedule`
--    (a cotação, para a Agenda salva ou para uma proposta que a tela ainda não gravou).
-- 4. O limite por dia: `public.save_signal_daily_cap` grava (de 1 ao sugerido: a pessoa pode baixar, não subir),
--    `private.signal_day_credits` soma o que o Monitoramento já gastou hoje (Rodadas agendadas e manuais), e
--    `public.begin_account_scan` devolve `teto_diario` na Conta que estouraria o limite, sem reservar nem cobrar.
--    `public.signal_round_exceeds_daily_cap` faz a mesma conta para o runner antes de uma cascata (mercado e tipos por cascata).
-- 5. "Rodar agora" respeita o limite por dia: `private.signal_run_quote` ganha o bloqueio `teto_diario`.
-- 6. Sem créditos: a Rodada é pulada sem cobrar; a terceira seguida pausa o Sinal (`paused_reason = 'sem_creditos'`), e o
--    Administrador recebe um Aviso do Workspace. `public.finish_signal_monitor_run` conta e pausa; reativar zera
--    (`save_signal_monitor` e `set_signal_monitor_state`).
-- 7. `public.list_signal_monitors` traz o limite por dia, as Rodadas puladas e o motivo da pausa.
--
-- Qual soma é exata para o dia: a do razão de créditos (`credit_reservations`), não a de `signal_monitor_runs.credits_charged`.
-- A Rodada só soma os créditos no registro quando a chamada do runner termina, então no meio dela o registro ainda não sabe
-- o que as Contas já reservaram; a reserva nasce no ato (`reserve_credits`) e a soma conta tanto a reservada quanto a
-- liquidada (pelo que de fato foi liquidado), logo o limite corta no ponto certo, mesmo dentro de uma Rodada. As reservas
-- soltas (a Conta que falhou) não contam. O dia é o de America/Sao_Paulo.
--
-- Redefinidas a partir da definição mais recente: public.begin_account_scan de 7 parâmetros, private.signal_run_quote e
-- public.add_signal_run_progress (20261117120000_rodar_agora_e_registro_da_rodada.sql), public.finish_signal_monitor_run,
-- public.save_signal_monitor, public.set_signal_monitor_state e public.list_signal_monitors
-- (20261118120000_agenda_do_sinal.sql).
--
-- DECISÃO PENDENTE 2 (preço): fixo por fonte; a Rodada sem novidade cobra o que verificou; a Conta sem dado não cobra.
-- DECISÃO PENDENTE 4 (Teto): ativar com Agenda continua exigindo o Teto mensal da varredura automática; a cotação só diz
--   `sem_teto_automacao`, nunca o valor.
-- DECISÃO PENDENTE 14 (pausa): depois de 3 Rodadas seguidas puladas por falta de créditos o Sinal pausa e mostra o motivo.
-- DECISÃO PENDENTE (limite por dia): opcional; o sugerido é o custo máximo de um dia da Agenda (Rodadas por dia × preço da
--   Rodada) e a pessoa só baixa. DECISÃO PENDENTE (aviso de repetição): acima de 2 Rodadas por dia.

-- 1. As colunas. Nenhum dado é tocado: o Monitoramento que existe fica sem limite, sem Rodada pulada e sem motivo de pausa.
alter table private.signal_monitors
  add column daily_credit_cap integer check (daily_credit_cap is null or daily_credit_cap > 0),
  add column consecutive_skips integer not null default 0 check (consecutive_skips >= 0),
  add column paused_reason text check (paused_reason is null or paused_reason ~ '^[a-z_]{1,40}$');

comment on column private.signal_monitors.daily_credit_cap is
  'O limite de créditos por dia (America/Sao_Paulo) que este Sinal pode gastar, somando Rodadas agendadas e manuais. Nulo: sem limite próprio. A pessoa só baixa do sugerido (o custo máximo de um dia da Agenda).';
comment on column private.signal_monitors.consecutive_skips is
  'As Rodadas agendadas seguidas que terminaram sem verificar nenhuma Conta por falta de créditos. Uma Rodada que verificou zera; reativar zera.';
comment on column private.signal_monitors.paused_reason is
  'Por que o Sinal está pausado quando foi o sistema que o pausou, em código estável (sem_creditos). Nulo na pausa que a pessoa fez.';

-- O motivo da parada da Rodada ganha o limite por dia.
alter table private.signal_monitor_runs drop constraint signal_monitor_runs_stop_reason_check;
alter table private.signal_monitor_runs
  add constraint signal_monitor_runs_stop_reason_check
  check (stop_reason in ('sem_creditos', 'teto', 'teto_diario', 'contrato_inativo', 'prazo', 'concluida', 'erro'));

-- A soma do dia lê o razão por Workspace e por data: o índice evita varrer o histórico inteiro a cada Conta.
create index credit_reservations_workspace_created_idx on private.credit_reservations (workspace_id, created_at desc);

-- O Aviso do Workspace de um Sinal pausado por falta de créditos entra ao lado dos que já existem.
alter table private.workspace_notices drop constraint workspace_notices_kind_check;
alter table private.workspace_notices
  add constraint workspace_notices_kind_check
  check (kind in ('teto_atingido', 'automacao_retomada', 'sinal_pausado'));

-- 2. Os limites, num lugar só do banco. Os mesmos números de `src/fonte/preco-por-rodada.ts` (um teste confere).
create function private.signal_price_limit(p_name text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case p_name
    when 'pause_after_skips' then 3          -- DECISÃO PENDENTE 14
    when 'repeat_warning_above' then 2       -- DECISÃO PENDENTE (aviso de repetição)
  end;
$$;

revoke all on function private.signal_price_limit(text) from public, anon, authenticated, service_role;

-- O começo do dia de `p_at` em Brasília, como instante.
create function private.signal_day_start(p_at timestamptz default now())
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select date_trunc('day', p_at at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo';
$$;

revoke all on function private.signal_day_start(timestamptz) from public, anon, authenticated, service_role;

-- 3. O preço e a estimativa.

-- O que o Monitoramento já gastou hoje, em créditos: as Contas varridas pelas Rodadas agendadas e pelas manuais (chave
-- `scan:<monitor>:...`) e as cascatas (`cascade:monitor:<monitor>:...`). Reservada conta pelo que reservou; liquidada, pelo que
-- liquidou; solta não conta. A busca da reativação (`rescan:...`) tem outra chave e fica de fora.
create function private.signal_day_credits(p_workspace_id uuid, p_monitor_id uuid)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(case when r.status = 'settled' then r.unit_credits * r.settled_quantity else r.amount end), 0)
  from private.credit_reservations r
  where r.workspace_id = p_workspace_id
    and r.status in ('reserved', 'settled')
    and r.created_at >= private.signal_day_start()
    and ((r.action = 'account_scan' and r.action_key like 'scan:' || p_monitor_id::text || ':%')
      or (r.action = 'cascata_de_sinais' and r.action_key like 'cascade:monitor:' || p_monitor_id::text || ':%'));
$$;

revoke all on function private.signal_day_credits(uuid, uuid) from public, anon, authenticated, service_role;

-- O máximo de créditos de uma Rodada do Monitoramento: o preço de uma Conta verificada vezes as Contas do escopo, ou o fixo da
-- descoberta no mercado. O Sinal interno (das Interações) não gasta crédito. É o que o runner cobraria se verificasse todas as
-- Contas; a Conta sem dado e a que falha não cobram, então o real só pode ser menor. O `maxEmpresasPorRodada` do Plano ainda não
-- limita o runner (é do ticket de listas): a cotação conta todas as Contas do escopo, como a Rodada.
create function private.signal_round_price(p_workspace_id uuid, p_monitor_id uuid)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_m private.signal_monitors%rowtype;
begin
  select * into v_m from private.signal_monitors m where m.workspace_id = p_workspace_id and m.id = p_monitor_id;
  if not found then
    raise exception 'monitor not found' using errcode = 'P0002';
  end if;
  if exists (select 1 from private.signal_catalog c where c.signal_type = v_m.signal_type and c.origin = 'interno') then
    return 0;
  end if;
  if private.monitor_scope(v_m.audience) = 'mercado' then
    return private.market_discovery_credits_per_run();
  end if;
  return private.scan_credits(v_m.signal_type) * cardinality(private.signal_run_account_ids(p_workspace_id, v_m.audience));
end;
$$;

revoke all on function private.signal_round_price(uuid, uuid) from public, anon, authenticated, service_role;

-- As contas da estimativa. `p_schedule`: a Agenda já validada e normalizada, ou nula para o Monitoramento sem Agenda, que roda
-- a cada `every_hours` horas todos os dias. Por mês: Rodadas por semana × 52 / 12 × preço da Rodada, arredondado para cima.
create function private.signal_cost_estimate(p_workspace_id uuid, p_monitor_id uuid, p_schedule jsonb)
returns table (
  o_por_rodada integer,
  o_rodadas_por_dia integer,
  o_rodadas_por_semana integer,
  o_por_dia integer,
  o_por_mes integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_every integer;
  v_por_rodada integer := private.signal_round_price(p_workspace_id, p_monitor_id);
  v_por_dia integer;
  v_por_semana integer;
begin
  if p_schedule is null then
    select m.every_hours into v_every from private.signal_monitors m where m.workspace_id = p_workspace_id and m.id = p_monitor_id;
    v_por_dia := ceil(24.0 / greatest(v_every, 1))::integer;
    v_por_semana := v_por_dia * 7;
  else
    v_por_dia := jsonb_array_length(p_schedule -> 'horarios');
    v_por_semana := v_por_dia
      * jsonb_array_length(coalesce(p_schedule -> 'dias', private.signal_schedule_default_days()));
  end if;
  return query select
    v_por_rodada,
    v_por_dia,
    v_por_semana,
    v_por_rodada * v_por_dia,
    ceil((v_por_semana * 52 * v_por_rodada)::numeric / 12)::integer;
end;
$$;

revoke all on function private.signal_cost_estimate(uuid, uuid, jsonb) from public, anon, authenticated, service_role;

-- A cotação antes de ativar. `p_schedule`: a Agenda que a tela propõe e ainda não gravou (a mesma conferência de
-- `save_signal_schedule`; recusada com `signal schedule invalid: <código>`); nula usa a Agenda gravada, ou o ritmo de
-- `every_hours` do Monitoramento sem Agenda. Todos os números são créditos:
--   por_rodada             o máximo de uma Rodada
--   rodadas_por_semana     Rodadas da Agenda por semana
--   por_dia                o máximo no dia com mais Rodadas
--   por_mes_aprox          Rodadas por semana × 52 / 12 × por Rodada, para cima
--   saldo                  o disponível, o mesmo número da tela de créditos
--   dias_de_saldo          quantos dias o saldo aguenta no ritmo médio da semana (para baixo); nulo sem custo ou sem limite
--   aviso_repeticao        mais de 2 Rodadas por dia costuma repetir resultados
--   teto_diario_sugerido   o custo máximo de um dia, o teto do limite por dia
--   bloqueio_ativacao      contrato_inativo, sem_teto_automacao, sem_creditos (o saldo não cobre uma Rodada) ou nulo
--   ilimitado              a Equipe Althius não tem saldo contado
-- Nunca devolve o valor do Teto mensal: só diz que a automação ainda não está liberada.
create function public.quote_signal_schedule(p_workspace_id uuid, p_monitor_id uuid, p_schedule jsonb default null)
returns table (
  por_rodada integer,
  rodadas_por_semana integer,
  por_dia integer,
  por_mes_aprox integer,
  saldo numeric,
  dias_de_saldo integer,
  aviso_repeticao boolean,
  teto_diario_sugerido integer,
  bloqueio_ativacao text,
  ilimitado boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_m private.signal_monitors%rowtype;
  v_schedule jsonb;
  v_e record;
  v_saldo numeric;
  v_ilimitado boolean;
  v_bloqueio text;
  v_dias integer;
  v_interno boolean;
  v_mode text;
  v_cap numeric;
  v_paused timestamptz;
  v_spent numeric;
begin
  perform private.require_active_membership(p_workspace_id);
  select * into v_m from private.signal_monitors m where m.workspace_id = p_workspace_id and m.id = p_monitor_id;
  if not found then
    raise exception 'monitor not found' using errcode = 'P0002';
  end if;
  if p_schedule is not null then
    perform private.validate_signal_schedule(p_schedule, cardinality(private.signal_run_account_ids(p_workspace_id, v_m.audience)));
    v_schedule := private.normalize_signal_schedule(p_schedule);
  else
    v_schedule := v_m.schedule;
  end if;
  select * into v_e from private.signal_cost_estimate(p_workspace_id, p_monitor_id, v_schedule);
  select t.booked - t.reserved into v_saldo from private.credit_totals(p_workspace_id) t;
  v_ilimitado := private.credits_unlimited(p_workspace_id);
  v_interno := exists (select 1 from private.signal_catalog c where c.signal_type = v_m.signal_type and c.origin = 'interno');

  if v_interno then
    v_bloqueio := null;
  elsif private.automation_contract_block(p_workspace_id) is not null then
    v_bloqueio := 'contrato_inativo';
  else
    -- O Teto da varredura automática: só se olha o estado (confirmar, sem teto ou atingido); o valor fica no servidor.
    select s.mode, s.monthly_cap, s.paused_at into v_mode, v_cap, v_paused
    from private.automation_settings s where s.workspace_id = p_workspace_id and s.scope = 'acao:varredura';
    select g.spent into v_spent from private.automation_spend g
    where g.workspace_id = p_workspace_id and g.scope = 'acao:varredura' and g.month = date_trunc('month', now())::date;
    if not v_ilimitado and private.automation_block_reason(v_mode, v_cap, coalesce(v_spent, 0), v_paused) is not null then
      v_bloqueio := 'sem_teto_automacao';
    elsif not v_ilimitado and v_e.o_por_rodada > 0 and v_saldo < v_e.o_por_rodada then
      v_bloqueio := 'sem_creditos';
    end if;
  end if;

  if v_ilimitado or v_e.o_por_rodada = 0 or v_e.o_rodadas_por_semana = 0 then
    v_dias := null;
  else
    v_dias := floor(greatest(v_saldo, 0) / (v_e.o_rodadas_por_semana * v_e.o_por_rodada / 7.0))::integer;
  end if;

  return query select
    v_e.o_por_rodada,
    v_e.o_rodadas_por_semana,
    v_e.o_por_dia,
    v_e.o_por_mes,
    v_saldo,
    v_dias,
    v_e.o_rodadas_por_dia > private.signal_price_limit('repeat_warning_above'),
    v_e.o_por_dia,
    v_bloqueio,
    v_ilimitado;
end;
$$;

revoke all on function public.quote_signal_schedule(uuid, uuid, jsonb) from public, anon;
grant execute on function public.quote_signal_schedule(uuid, uuid, jsonb) to authenticated;

-- 4. O limite por dia.

-- Grava o limite por dia do Sinal, em créditos. A permissão é a de salvar o Monitoramento (quem criou, ou um Administrador).
-- Vale de 1 ao sugerido (o custo máximo de um dia da Agenda gravada): a pessoa pode baixar, não subir. Recusas, com um
-- código estável (`daily credit cap invalid: <código>`):
--   tipo_sem_limite   o Sinal interno não gasta crédito
--   sem_estimativa    o Sinal não tem Contas no escopo, então não há custo para limitar
--   limite_invalido   vazio ou menor que 1
--   acima_do_sugerido mais que o custo máximo de um dia
-- Devolve o limite como foi guardado.
create function public.save_signal_daily_cap(p_workspace_id uuid, p_monitor_id uuid, p_cap integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := private.require_active_membership(p_workspace_id);
  v_m private.signal_monitors%rowtype;
  v_por_dia integer;
begin
  select * into v_m from private.signal_monitors m where m.workspace_id = p_workspace_id and m.id = p_monitor_id for update;
  if not found then
    raise exception 'monitor not found' using errcode = 'P0002';
  end if;
  perform private.assert_can_change_monitor(v_role, v_m.created_by);
  if exists (select 1 from private.signal_catalog c where c.signal_type = v_m.signal_type and c.origin = 'interno') then
    raise exception 'daily credit cap invalid: tipo_sem_limite' using errcode = '22023', hint = 'tipo_sem_limite';
  end if;
  select e.o_por_dia into v_por_dia from private.signal_cost_estimate(p_workspace_id, p_monitor_id, v_m.schedule) e;
  if v_por_dia = 0 then
    raise exception 'daily credit cap invalid: sem_estimativa' using errcode = '22023', hint = 'sem_estimativa';
  end if;
  if p_cap is null or p_cap < 1 then
    raise exception 'daily credit cap invalid: limite_invalido' using errcode = '22023', hint = 'limite_invalido';
  end if;
  if p_cap > v_por_dia then
    raise exception 'daily credit cap invalid: acima_do_sugerido' using errcode = '22023', hint = 'acima_do_sugerido';
  end if;
  update private.signal_monitors set daily_credit_cap = p_cap, updated_at = now() where id = p_monitor_id;
  return p_cap;
end;
$$;

revoke all on function public.save_signal_daily_cap(uuid, uuid, integer) from public, anon;
grant execute on function public.save_signal_daily_cap(uuid, uuid, integer) to authenticated;

-- Para o runner, antes de uma cascata (mercado e tipos por cascata), que reserva o crédito por Rodada e não por Conta: a Rodada
-- inteira cabe no que falta do limite de hoje? Verdadeiro quando o Monitoramento tem limite por dia e o gasto de hoje mais o
-- máximo da Rodada o passaria. Só o servidor.
create function public.signal_round_exceeds_daily_cap(p_monitor_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select m.daily_credit_cap is not null
       and private.signal_day_credits(m.workspace_id, m.id) + private.signal_round_price(m.workspace_id, m.id) > m.daily_credit_cap
     from private.signal_monitors m where m.id = p_monitor_id),
    false);
$$;

revoke all on function public.signal_round_exceeds_daily_cap(uuid) from public, anon, authenticated;
grant execute on function public.signal_round_exceeds_daily_cap(uuid) to service_role;

-- A varredura da Conta, agora com o limite por dia. Redefinida a partir de 20261117120000. O acréscimo é só o `teto_diario`: se a
-- soma do que o Monitoramento já gastou hoje (agenda e manual) mais esta Conta passa do limite, nada é reservado nem cobrado
-- e o runner para a Rodada. A reserva que já existe (continuação da Rodada) volta antes, como sempre: a Conta já cobrada não
-- é afetada. O trava por Monitoramento evita que duas Contas conferidas ao mesmo tempo estourem o limite.
create or replace function public.begin_account_scan(
  p_workspace_id uuid, p_user_id uuid, p_monitor_id uuid, p_account_id uuid, p_slot timestamptz,
  p_origin text, p_request_id uuid
) returns table (outcome text, reservation_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key text;
  v_existing private.credit_reservations%rowtype;
  v_user uuid;
  v_id uuid;
  v_cap text;
  v_block text;
  v_type text;
  v_qty integer;
  v_hint text;
  v_daily_cap integer;
begin
  if p_origin is null or p_origin not in ('agenda', 'manual') or (p_origin = 'manual' and p_request_id is null) then
    raise exception 'invalid scan origin' using errcode = '22023';
  end if;
  v_key := 'scan:' || p_monitor_id::text || ':' || p_account_id::text || ':'
    || case when p_origin = 'manual' then 'manual:' || p_request_id::text else extract(epoch from p_slot)::bigint::text end;
  perform pg_advisory_xact_lock(hashtext('scan:' || v_key));
  select * into v_existing from private.credit_reservations r where r.workspace_id = p_workspace_id and r.action_key = v_key;
  if found then
    return query select
      case v_existing.status when 'reserved' then 'resume' when 'settled' then 'done' else 'skip' end,
      v_existing.id;
    return;
  end if;
  if private.automation_contract_block(p_workspace_id) is not null then
    return query select 'contrato_inativo'::text, null::uuid;
    return;
  end if;
  if not exists (
    select 1 from private.signal_monitors m where m.workspace_id = p_workspace_id and m.id = p_monitor_id
  ) or not exists (
    select 1 from public.target_accounts a where a.workspace_id = p_workspace_id and a.id = p_account_id
  ) then
    raise exception 'monitor or target account not found' using errcode = 'P0002';
  end if;
  -- O preço fixo do Sinal: créditos por Conta varrida (creditos-moeda-unica).
  select m.signal_type, m.daily_credit_cap into v_type, v_daily_cap
  from private.signal_monitors m where m.workspace_id = p_workspace_id and m.id = p_monitor_id;
  v_qty := private.scan_credits(v_type);

  -- O limite por dia do Sinal: a soma de hoje (agenda e manual) mais esta Conta não pode passá-lo.
  if v_daily_cap is not null then
    perform pg_advisory_xact_lock(hashtextextended('signal_daily_cap:' || p_monitor_id::text, 0));
    if private.signal_day_credits(p_workspace_id, p_monitor_id) + v_qty > v_daily_cap then
      return query select 'teto_diario'::text, null::uuid;
      return;
    end if;
  end if;

  v_block := private.signal_budget_block(p_workspace_id, 0);
  if v_block is not null then
    return query select v_block, null::uuid;
    return;
  end if;

  v_user := case when p_user_id is not null and exists (
    select 1 from public.workspace_memberships m where m.workspace_id = p_workspace_id and m.user_id = p_user_id and m.active
  ) then p_user_id end;
  begin
    v_id := public.reserve_credits(p_workspace_id, v_user, 'account_scan', v_key, v_qty, false);
  exception when others then
    get stacked diagnostics v_hint = pg_exception_hint;
    -- O limite do contrato (e não o do participante) é o "Limite do mês atingido" que o cliente vê.
    if sqlerrm = 'monthly credit limit reached' and v_hint = 'workspace_limit' then
      return query select 'teto_atingido'::text, null::uuid;
      return;
    end if;
    if sqlerrm in ('insufficient credits', 'monthly credit limit reached') then
      return query select 'no_credits'::text, null::uuid;
      return;
    end if;
    raise;
  end;
  if p_origin <> 'manual' or private.manual_run_uses_automation_cap() then
    v_cap := public.consume_automation_cap(
      p_workspace_id, 'acao:varredura', (select r.amount from private.credit_reservations r where r.id = v_id));
    if v_cap <> 'ok' then
      delete from private.credit_reservations where id = v_id;
      return query select v_cap, null::uuid;
      return;
    end if;
  end if;
  return query select 'go'::text, v_id;
end;
$$;

-- 5. "Rodar agora" respeita o limite por dia. Redefinida a partir de 20261117120000: o único acréscimo é o bloqueio `teto_diario`,
-- quando nem uma Conta mais cabe no que falta do limite de hoje (se couberem algumas, a Rodada corta no ponto certo).
create or replace function private.signal_run_quote(p_workspace_id uuid, p_monitor_id uuid, p_role text, p_user_id uuid)
returns table (
  o_contas integer,
  o_sem_dado integer,
  o_por_conta integer,
  o_ate integer,
  o_saldo numeric,
  o_ilimitado boolean,
  o_bloqueio text,
  o_liberado_em timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_m private.signal_monitors%rowtype;
  v_contas integer;
  v_sem integer;
  v_por_conta integer;
  v_precisa integer;
  v_saldo numeric;
  v_ilimitado boolean;
  v_bloqueio text;
  v_liberado timestamptz;
  v_ultimo timestamptz;
  v_limite numeric;
  v_limite_do_participante numeric;
begin
  select * into v_m from private.signal_monitors m where m.workspace_id = p_workspace_id and m.id = p_monitor_id;
  if not found then
    raise exception 'monitor not found' using errcode = 'P0002';
  end if;
  select count(*)::integer,
         count(*) filter (where private.signal_run_lacks_data(v_m.signal_type, t.workspace_id, t.id, t.linkedin_url))::integer
    into v_contas, v_sem
  from public.target_accounts t
  where t.id = any (private.signal_run_account_ids(p_workspace_id, v_m.audience));
  v_por_conta := private.scan_credits(v_m.signal_type);
  v_precisa := (v_contas - v_sem) * v_por_conta;
  select t.booked - t.reserved into v_saldo from private.credit_totals(p_workspace_id) t;
  v_ilimitado := private.credits_unlimited(p_workspace_id);

  if p_role <> 'admin' and v_m.created_by is distinct from p_user_id then
    v_bloqueio := 'sem_permissao';
  elsif private.monitor_scope(v_m.audience) <> 'contas' or not exists (
    select 1 from private.signal_actors a where a.signal_type = v_m.signal_type and a.state = 'available'
  ) then
    v_bloqueio := 'sem_fonte';
  elsif v_contas = 0 then
    v_bloqueio := 'sem_contas';
  elsif private.automation_contract_block(p_workspace_id) is not null then
    v_bloqueio := 'contrato_inativo';
  elsif exists (
    select 1 from private.signal_run_requests r where r.monitor_id = p_monitor_id and r.state in ('pendente', 'rodando')
  ) then
    v_bloqueio := 'ja_na_fila';
  else
    -- Só conta o pedido que andou ou está andando: o que falhou, ou foi cancelado, não segura a pessoa por duas horas.
    select max(r.requested_at) into v_ultimo from private.signal_run_requests r
    where r.monitor_id = p_monitor_id and r.state in ('pendente', 'rodando', 'feita');
    if v_ultimo is not null and v_ultimo + make_interval(mins => private.signal_run_limit('manual_min_interval_minutes')) > now() then
      v_bloqueio := 'intervalo_minimo';
      v_liberado := v_ultimo + make_interval(mins => private.signal_run_limit('manual_min_interval_minutes'));
    elsif v_m.daily_credit_cap is not null and v_precisa > 0
          and private.signal_day_credits(p_workspace_id, p_monitor_id) + v_por_conta > v_m.daily_credit_cap then
      v_bloqueio := 'teto_diario';
    elsif not v_ilimitado and v_precisa > 0 then
      if v_saldo < v_precisa then
        v_bloqueio := 'sem_creditos';
      else
        v_limite := private.workspace_monthly_limit(p_workspace_id);
        if private.signal_budget_block(p_workspace_id, 0) is not null
           or (v_limite is not null and private.workspace_period_usage(p_workspace_id) + v_precisa > v_limite) then
          v_bloqueio := 'limite_do_mes';
        else
          select l.monthly_limit into v_limite_do_participante from private.credit_member_limits l
          where l.workspace_id = p_workspace_id and l.user_id = p_user_id;
          if v_limite_do_participante is not null
             and private.credit_member_month_usage(p_workspace_id, p_user_id) + v_precisa > v_limite_do_participante then
            v_bloqueio := 'limite_do_participante';
          end if;
        end if;
      end if;
    end if;
  end if;

  return query select v_contas, v_sem, v_por_conta, v_contas * v_por_conta, v_saldo, v_ilimitado, v_bloqueio, v_liberado;
end;
$$;

-- O progresso da Rodada aceita o motivo novo. Redefinida a partir de 20261117120000: só a lista de motivos muda.
create or replace function public.add_signal_run_progress(
  p_run_id uuid,
  p_checked integer default 0,
  p_new integer default 0,
  p_repeated integer default 0,
  p_without_data integer default 0,
  p_reservation_ids uuid[] default '{}',
  p_stop_reason text default null,
  p_credits integer default 0
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run private.signal_monitor_runs%rowtype;
  v_credits integer;
begin
  if p_stop_reason is not null
     and p_stop_reason not in ('sem_creditos', 'teto', 'teto_diario', 'contrato_inativo', 'prazo', 'concluida', 'erro') then
    raise exception 'invalid stop reason' using errcode = '22023';
  end if;
  select * into v_run from private.signal_monitor_runs x where x.id = p_run_id for update;
  if not found then
    raise exception 'run not found' using errcode = 'P0002';
  end if;
  if v_run.state <> 'rodando' then
    return;
  end if;
  select coalesce(round(sum(r.unit_credits * r.settled_quantity)), 0)::integer + greatest(coalesce(p_credits, 0), 0) into v_credits
  from private.credit_reservations r
  where r.id = any (coalesce(p_reservation_ids, '{}')) and r.workspace_id = v_run.workspace_id and r.status = 'settled';
  update private.signal_monitor_runs set
    accounts_checked = accounts_checked + greatest(coalesce(p_checked, 0), 0),
    signals_new = signals_new + greatest(coalesce(p_new, 0), 0),
    signals_repeated = signals_repeated + greatest(coalesce(p_repeated, 0), 0),
    accounts_without_data = accounts_without_data + greatest(coalesce(p_without_data, 0), 0),
    credits_charged = credits_charged + v_credits,
    stop_reason = coalesce(p_stop_reason, stop_reason)
  where id = p_run_id;
end;
$$;

-- 6. Sem créditos, a Rodada é pulada; a terceira seguida pausa o Sinal.

-- Termina a chamada do runner para uma Rodada agendada. Redefinida a partir de 20261118120000: o cálculo de `next_run_at` é o
-- de sempre e o acréscimo é a contagem das Rodadas puladas. Quando a Rodada fecha (não é continuação):
--   verificou alguma Conta (ou cobrou créditos)                       zera `consecutive_skips`
--   terminou por `sem_creditos` sem verificar nem cobrar nada         soma 1
--   qualquer outro fim (erro, prazo, limite do mês, limite por dia)   deixa como está
-- No terceiro seguido (DECISÃO PENDENTE 14) o Sinal ativo vira `pausado` com `paused_reason = 'sem_creditos'`, sem próxima
-- Rodada, e os Administradores recebem um Aviso do Workspace. A Rodada manual (Rodar agora) fecha em outro lugar e não conta.
create or replace function public.finish_signal_monitor_run(
  p_monitor_id uuid, p_attempted integer, p_error text, p_continue boolean default false
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_m private.signal_monitors%rowtype;
  v_r private.signal_monitor_runs%rowtype;
  v_closing boolean := not coalesce(p_continue, false);
  v_skips integer;
  v_pause boolean := false;
begin
  select * into v_m from private.signal_monitors m where m.id = p_monitor_id for update;
  if not found then
    raise exception 'monitor not found' using errcode = 'P0002';
  end if;
  v_skips := v_m.consecutive_skips;
  if v_closing and v_m.current_run_id is not null then
    select * into v_r from private.signal_monitor_runs x where x.id = v_m.current_run_id and x.state = 'rodando';
    if found then
      if v_r.accounts_checked > 0 or v_r.credits_charged > 0 then
        v_skips := 0;
      elsif v_r.stop_reason = 'sem_creditos' then
        v_skips := v_skips + 1;
      end if;
      v_pause := v_m.state = 'ativo' and v_skips >= private.signal_price_limit('pause_after_skips');
    end if;
  end if;

  update private.signal_monitors set
    last_run_at = now(),
    next_run_at = case
      when v_pause then null
      when p_continue then now()
      when schedule is null then now() + make_interval(hours => every_hours)
      else private.next_signal_run(schedule, greatest(now(), coalesce(current_slot_at, now())))
    end,
    current_slot_at = case when schedule is not null and coalesce(p_continue, false) and not v_pause then current_slot_at end,
    state = case when v_pause then 'pausado' else state end,
    paused_reason = case when v_pause then 'sem_creditos' else paused_reason end,
    consecutive_skips = v_skips,
    claimed_until = null,
    scan_offset = (scan_offset + greatest(coalesce(p_attempted, 0), 0)) % 1000000,
    last_error = nullif(left(coalesce(p_error, ''), 500), '')
  where id = p_monitor_id;

  if v_m.current_run_id is not null and v_closing then
    update private.signal_monitor_runs x set
      state = case when x.stop_reason = 'erro' then 'falhou' else 'concluida' end,
      finished_at = clock_timestamp(),
      stop_reason = coalesce(x.stop_reason, 'concluida'),
      error = nullif(left(coalesce(p_error, ''), 500), '')
    where x.id = v_m.current_run_id and x.state = 'rodando';
    update private.signal_monitors set current_run_id = null where id = p_monitor_id;
  end if;

  if v_pause then
    insert into private.workspace_notices (workspace_id, kind, title, body, link)
    values (
      v_m.workspace_id, 'sinal_pausado', 'Sinal pausado por falta de créditos: ' || left(v_m.name, 120),
      'Três rodadas seguidas foram puladas por falta de créditos, e o Sinal foi pausado. Reative-o quando houver saldo.',
      '/sinais');
  end if;
end;
$$;

-- Reativar zera. Redefinidas a partir de 20261118120000 (`save_signal_monitor` e `set_signal_monitor_state`): o acréscimo é o
-- motivo da pausa e a contagem das Rodadas puladas. Passar a ativo zera as duas; pausar pela pessoa também limpa o motivo; o
-- Sinal que continua pausado (por exemplo, o editor salvando um Sinal pausado por falta de créditos) mantém o motivo.
create or replace function public.save_signal_monitor(
  p_workspace_id uuid,
  p_id uuid,
  p_signal_type text,
  p_name text,
  p_state text,
  p_audience jsonb,
  p_criteria jsonb,
  p_every_hours integer default 24
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := private.require_active_membership(p_workspace_id);
  v_origin text := private.available_signal_origin(p_signal_type);
  v_existing private.signal_monitors%rowtype;
  v_id uuid;
  v_ativando boolean;
  v_segue_pausado boolean;
begin
  if v_origin is null then
    raise exception 'signal type is not available' using errcode = '55000';
  end if;
  perform private.validate_signal_monitor(p_workspace_id, p_name, p_state, p_audience, p_criteria, p_every_hours);
  if v_origin = 'interno' and private.internal_signal_days(p_criteria) is null then
    raise exception 'invalid monitor' using errcode = '22023';
  end if;

  if p_id is null then
    insert into private.signal_monitors
      (workspace_id, signal_type, name, state, audience, criteria, every_hours, created_by, next_run_at)
    values (p_workspace_id, p_signal_type, btrim(p_name), p_state, p_audience, p_criteria, p_every_hours, auth.uid(),
            case when p_state = 'ativo' then now() end)
    returning id into v_id;
  else
    select * into v_existing from private.signal_monitors m where m.workspace_id = p_workspace_id and m.id = p_id for update;
    if not found then
      raise exception 'monitor not found' using errcode = 'P0002';
    end if;
    perform private.assert_can_change_monitor(v_role, v_existing.created_by);
    if v_existing.schedule is not null then
      perform private.assert_schedule_fits_scope(v_existing.schedule, cardinality(private.signal_run_account_ids(p_workspace_id, p_audience)));
    end if;
    v_ativando := p_state = 'ativo' and v_existing.schedule is not null and v_existing.state is distinct from 'ativo';
    v_segue_pausado := p_state = 'pausado' and v_existing.state = 'pausado';
    -- Pausar guarda a hora marcada: retomar antes dela não força uma rodada nova (nem um gasto de crédito).
    update private.signal_monitors set
      signal_type = p_signal_type, name = btrim(p_name), state = p_state, audience = p_audience, criteria = p_criteria,
      every_hours = p_every_hours, scan_offset = 0, updated_at = now(),
      next_run_at = case
        when v_ativando then private.next_signal_run(v_existing.schedule, now())
        when p_state = 'ativo' then coalesce(next_run_at, now())
        else next_run_at
      end,
      current_slot_at = case when v_ativando then null else current_slot_at end,
      paused_reason = case when v_segue_pausado then paused_reason end,
      consecutive_skips = case when v_segue_pausado or (p_state = 'ativo' and v_existing.state = 'ativo') then consecutive_skips else 0 end,
      plan = case when v_existing.signal_type = p_signal_type and v_existing.audience = p_audience
        and v_existing.criteria = p_criteria then v_existing.plan end,
      plan_origin = case when v_existing.signal_type = p_signal_type and v_existing.audience = p_audience
        and v_existing.criteria = p_criteria then v_existing.plan_origin end,
      plan_seed = case when v_existing.signal_type = p_signal_type and v_existing.audience = p_audience
        and v_existing.criteria = p_criteria then v_existing.plan_seed end
    where id = p_id;
    v_id := p_id;
  end if;

  if v_origin = 'interno' and p_state = 'ativo' then
    perform private.run_internal_signal_monitor(v_id);
  end if;
  return v_id;
end;
$$;

create or replace function public.set_signal_monitor_state(p_id uuid, p_state text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v private.signal_monitors%rowtype;
  v_ativando boolean;
  v_segue_pausado boolean;
begin
  select * into v from private.signal_monitors m where m.id = p_id for update;
  if not found then
    raise exception 'monitor not found' using errcode = 'P0002';
  end if;
  perform private.assert_can_change_monitor(private.require_active_membership(v.workspace_id), v.created_by);
  perform private.validate_signal_monitor(v.workspace_id, v.name, p_state, v.audience, v.criteria, v.every_hours);
  v_ativando := p_state = 'ativo' and v.schedule is not null and v.state is distinct from 'ativo';
  v_segue_pausado := p_state = 'pausado' and v.state = 'pausado';
  update private.signal_monitors set
    state = p_state, updated_at = now(),
    next_run_at = case
      when v_ativando then private.next_signal_run(v.schedule, now())
      when p_state = 'ativo' then coalesce(next_run_at, now())
      else next_run_at
    end,
    current_slot_at = case when v_ativando then null else current_slot_at end,
    paused_reason = case when v_segue_pausado then paused_reason end,
    consecutive_skips = case when v_segue_pausado or (p_state = 'ativo' and v.state = 'ativo') then consecutive_skips else 0 end
  where id = p_id;
  if p_state = 'ativo' and private.available_signal_origin(v.signal_type) = 'interno' then
    perform private.run_internal_signal_monitor(p_id);
  end if;
end;
$$;

-- 7. Os Monitoramentos do Workspace, com o limite por dia, as Rodadas puladas e o motivo da pausa. Redefinida a partir de
-- 20261118120000: as colunas antigas seguem na mesma ordem e as três novas vêm no fim.
drop function public.list_signal_monitors(uuid);

create function public.list_signal_monitors(p_workspace_id uuid)
returns table (
  id uuid, signal_type text, name text, state text, audience jsonb, criteria jsonb, every_hours integer,
  created_by uuid, last_run_at timestamptz, last_error text, created_at timestamptz, last_run jsonb,
  brief text, plan jsonb, plan_version integer, plan_origin text,
  schedule jsonb, next_run_at timestamptz,
  daily_credit_cap integer, consecutive_skips integer, paused_reason text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_active_membership(p_workspace_id);
  return query
  select m.id, m.signal_type, m.name, m.state, m.audience, m.criteria, m.every_hours, m.created_by, m.last_run_at,
    m.last_error, m.created_at,
    (select jsonb_build_object(
        'state', x.state, 'startedAt', x.started_at, 'finishedAt', x.finished_at, 'accountsChecked', x.accounts_checked,
        'signalsNew', x.signals_new, 'signalsRepeated', x.signals_repeated)
     from private.signal_monitor_runs x
     where x.workspace_id = m.workspace_id and x.monitor_id = m.id
     order by x.started_at desc, x.id desc
     limit 1),
    m.brief, m.plan, m.plan_version, m.plan_origin,
    m.schedule, m.next_run_at,
    m.daily_credit_cap, m.consecutive_skips, m.paused_reason
  from private.signal_monitors m where m.workspace_id = p_workspace_id
  order by m.created_at, m.id;
end;
$$;

revoke all on function public.list_signal_monitors(uuid) from public, anon;
grant execute on function public.list_signal_monitors(uuid) to authenticated;
