-- Ajustes das decisões do Kauê sobre o Agente de Sinal (agente-de-sinal 05).
--
-- Em 24/10/2026 o Kauê decidiu os padrões que as migrations 20261116 a 20261119 deixaram como DECISÃO PENDENTE. Esta migration
-- só acrescenta (e troca constantes e funções com `create or replace`, a partir da última definição de cada uma):
--
-- 1. Agenda: até 12 Rodadas por dia (era 6), 1 h entre horários (era 2 h), passo de 15 minutos e dias úteis como padrão.
--    Sai a regra "mais de 50 Contas, só 1 Rodada por dia" (`muitas_contas`): `private.validate_signal_schedule` não recusa mais
--    por tamanho de lista e `private.assert_schedule_fits_scope` deixa de existir (`save_signal_monitor` não a chama mais).
-- 2. Plano: até 500 Contas escolhidas (era 50; o tamanho máximo do Plano sobe de 20 mil para 32 mil caracteres, porque 500 ids não
--    cabiam), de 1 a 100 empresas por Rodada, e o padrão passa de 50 para 25
--    (`per_round_default`). Nenhum Plano salvo é reescrito: os de 50 continuam na faixa.
-- 3. O lote da Rodada. Cada Rodada processa um lote de até `maxEmpresasPorRodada` Contas e gira pela lista: a Rodada seguinte
--    começa onde a anterior parou e volta ao começo no fim. O cursor é o `scan_offset` do Monitoramento. O lote vem de
--    `private.signal_round_batch(plano)`: o Monitoramento sem Plano (editor antigo) usa o padrão, 25.
--    - Agendada: `claim_due_signal_monitors` devolve no máximo o que falta do lote (`signal_monitors.round_attempted` soma o que
--      a Rodada já tentou, mesmo em várias chamadas do runner) e `finish_signal_monitor_run` fecha a Rodada quando o lote acaba.
--    - Manual: `claim_signal_run_requests` começa no cursor do Monitoramento (`signal_run_requests.start_offset`, guardado no
--      primeiro claim) e `finish_signal_run_request` avança o cursor quando o pedido fica `feita`. Uma Rodada agendada não
--      passa por cima de um pedido já começado (`claim_due_signal_monitors` pula o Monitoramento com pedido que tem Rodada),
--      então entre duas voltas do mesmo pedido só o pedido anda; a cobrança também não duplica, porque a chave do manual é por
--      pedido e a do agendado é por horário.
-- 4. Preço e cotação pelo lote: `private.signal_round_price` e `private.signal_run_quote` contam `least(Contas, lote)`.
--    Com isso `signal_cost_estimate`, `quote_signal_schedule`, `save_signal_daily_cap` (o sugerido) e
--    `signal_round_exceeds_daily_cap` passam a contar o lote sem mudar de assinatura.
-- 5. Rodada perdida em Rodadas: `private.register_missed_signal_slots` grava uma linha `perdida` por horário que venceu sem
--    começar (menos o mais recente, que roda). Continua sem compensação: nunca roda mais de uma.
-- 6. Teto mensal pré-preenchido: `public.suggest_signal_monthly_cap` (custo do mês mais 20%, em créditos) e
--    `public.enable_signal_automation` (só o Administrador; nunca baixa um limite que já existe).
-- 7. Aviso na 1ª Rodada pulada por falta de créditos: `private.workspace_notices` ganha o kind `sinal_rodada_pulada`. Como
--    `workspace_notices` ainda não tem leitor na tela, o aviso visível é o da tela do Sinal (lê `consecutive_skips`).
-- 8. "Rodar agora": o intervalo mínimo entre duas Rodadas manuais passa de 120 para 60 minutos (interpretação: o Kauê decidiu
--    "1 h entre Rodadas" sem separar a manual da agendada).
--
-- Redefinidas a partir da definição mais recente: private.signal_schedule_limit, private.validate_signal_schedule
-- (20261118120000), private.signal_plan_limit (20261116120000), private.signal_run_limit (20261117120000),
-- private.signal_price_limit, private.signal_round_price, private.signal_run_quote, public.finish_signal_monitor_run,
-- public.save_signal_monitor, public.set_signal_monitor_state, public.add_signal_run_progress (20261119120000),
-- public.claim_due_signal_monitors (20261118120000), public.claim_signal_run_requests, public.finish_signal_run_request e
-- public.list_signal_runs (20261117120000).
--
-- Decidido pelo Kauê em 24/10/2026: Agenda (12 por dia, 1 h), empresas por Rodada (padrão 25), 500 Contas em rotação, Teto
-- mensal pré-preenchido e aviso na 1ª Rodada pulada.

-- 1. As colunas e as constraints. Nenhum dado é tocado.
alter table private.signal_monitors
  add column round_attempted integer not null default 0 check (round_attempted >= 0);

comment on column private.signal_monitors.round_attempted is
  'As Contas que a Rodada agendada em andamento já tentou, somadas nas chamadas do runner. Limita a Rodada ao lote (maxEmpresasPorRodada) e volta a 0 quando a Rodada fecha.';

alter table private.signal_run_requests
  add column start_offset integer check (start_offset is null or start_offset >= 0);

comment on column private.signal_run_requests.start_offset is
  'O cursor de rotação do Monitoramento (scan_offset) no primeiro claim do pedido: o Rodar agora começa onde a Rodada anterior parou. Nulo até o primeiro claim.';

-- O motivo da parada da Rodada ganha `perdida` (o horário passou sem a Rodada começar).
alter table private.signal_monitor_runs drop constraint signal_monitor_runs_stop_reason_check;
alter table private.signal_monitor_runs
  add constraint signal_monitor_runs_stop_reason_check
  check (stop_reason in ('sem_creditos', 'teto', 'teto_diario', 'contrato_inativo', 'prazo', 'concluida', 'erro', 'perdida'));

-- O Plano com 500 Contas escolhidas não cabia no tamanho antigo: 500 ids de Conta já passam de 20 mil caracteres. O limite sobe
-- para 32 mil, na coluna e em `signal_plan_limit('plan_max_chars')`, e continua protegendo o banco de um Plano gigante.
alter table private.signal_monitors drop constraint signal_monitors_plan_check;
alter table private.signal_monitors
  add constraint signal_monitors_plan_check check (plan is null or length(plan::text) <= 32000);

-- O aviso da 1ª Rodada pulada entra ao lado dos que já existem.
alter table private.workspace_notices drop constraint workspace_notices_kind_check;
alter table private.workspace_notices
  add constraint workspace_notices_kind_check
  check (kind in ('teto_atingido', 'automacao_retomada', 'sinal_pausado', 'sinal_rodada_pulada'));

-- 2. Os limites, num lugar só do banco. Os mesmos números das telas e das Edge Functions (um teste confere cada um).

-- A Agenda. Decidido pelo Kauê em 24/10/2026: até 12 Rodadas por dia e 1 h entre os horários. As chaves do escopo grande
-- (`big_scope_accounts`, `big_scope_max_per_day`) saem: ninguém mais as lê.
create or replace function private.signal_schedule_limit(p_name text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case p_name
    when 'step_minutes' then 15                 -- Decidido pelo Kauê em 24/10/2026
    when 'max_per_day' then 12                  -- Decidido pelo Kauê em 24/10/2026
    when 'min_gap_minutes' then 60              -- Decidido pelo Kauê em 24/10/2026
    when 'preview_max' then 20
  end;
$$;

-- O Plano. Decidido pelo Kauê em 24/10/2026: até 500 Contas escolhidas, de 1 a 100 empresas por Rodada, padrão 25.
create or replace function private.signal_plan_limit(p_name text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case p_name
    when 'brief_max' then 1000
    when 'explanation_max' then 600
    when 'plan_max_chars' then 32000              -- 500 Contas escolhidas cabem (Decidido pelo Kauê em 24/10/2026)
    when 'signals_per_plan' then 1                -- Decidido pelo Kauê em 24/10/2026
    when 'accounts_max' then 500                  -- Decidido pelo Kauê em 24/10/2026
    when 'per_round_min' then 1                   -- Decidido pelo Kauê em 24/10/2026
    when 'per_round_max' then 100                 -- Decidido pelo Kauê em 24/10/2026
    when 'per_round_default' then 25              -- Decidido pelo Kauê em 24/10/2026
    when 'custom_text_max' then 60
    when 'custom_roles_max' then 10
    when 'list_items_max' then 30
    when 'keywords_max' then 200
    when 'seed_max' then 80
    when 'plans_per_day' then 20                  -- Decidido pelo Kauê em 24/10/2026
  end;
$$;

-- "Rodar agora". O intervalo entre duas Rodadas manuais do mesmo Sinal passa a 60 minutos: interpretação de "1 h entre
-- Rodadas" (o Kauê decidiu sem separar a manual da agendada). É uma linha, fácil de voltar a 120.
create or replace function private.signal_run_limit(p_name text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case p_name
    when 'manual_min_interval_minutes' then 60    -- Decidido pelo Kauê em 24/10/2026 (interpretação)
    when 'claim_minutes' then 15
    when 'stale_open_run_minutes' then 60
  end;
$$;

-- Preço e avisos. Decidido pelo Kauê em 24/10/2026: pausa na 3ª Rodada pulada, aviso de repetição acima de 2 por dia, e o
-- Teto mensal sugerido é o custo estimado do mês mais 20%.
create or replace function private.signal_price_limit(p_name text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case p_name
    when 'pause_after_skips' then 3             -- Decidido pelo Kauê em 24/10/2026
    when 'repeat_warning_above' then 2          -- Decidido pelo Kauê em 24/10/2026
    when 'monthly_cap_margin_percent' then 20   -- Decidido pelo Kauê em 24/10/2026
  end;
$$;

-- 3. A Agenda: sem o escopo grande.

-- Confere a Agenda. Redefinida a partir de 20261118120000 sem o código `muitas_contas`: o tamanho da lista não recusa mais
-- horário nenhum (a lista gira em lotes). `p_accounts` fica na assinatura só para não quebrar quem chama; não recusa nada.
-- Códigos de recusa: formato_invalido, sem_horario, muitos_horarios (mais de 12 por dia), horario_invalido (fora de HH:MM ou do
-- passo de 15 minutos), horario_repetido, intervalo_curto (menos de 1 h entre dois horários, contando a virada do dia),
-- sem_dia, dia_invalido, fuso_invalido. `dias` e `fuso` ausentes valem seg-sex e America/Sao_Paulo.
create or replace function private.validate_signal_schedule(p_schedule jsonb, p_accounts integer default 0)
returns void
language plpgsql
stable
set search_path = ''
as $$
declare
  v_horarios jsonb;
  v_dias jsonb;
  v_minutos integer[];
  v_n integer;
  v_i integer;
  v_item jsonb;
  v_text text;
  v_passo integer := private.signal_schedule_limit('step_minutes');
  v_intervalo integer := private.signal_schedule_limit('min_gap_minutes');
begin
  if p_schedule is null or jsonb_typeof(p_schedule) <> 'object'
     or exists (select 1 from jsonb_object_keys(p_schedule) k where k not in ('horarios', 'dias', 'fuso')) then
    perform private.fail_signal_schedule('formato_invalido');
  end if;

  v_horarios := p_schedule -> 'horarios';
  if v_horarios is null or jsonb_typeof(v_horarios) <> 'array' or jsonb_array_length(v_horarios) = 0 then
    perform private.fail_signal_schedule('sem_horario');
  end if;
  if jsonb_array_length(v_horarios) > private.signal_schedule_limit('max_per_day') then
    perform private.fail_signal_schedule('muitos_horarios');
  end if;
  for v_item in select e from jsonb_array_elements(v_horarios) e loop
    v_text := case when jsonb_typeof(v_item) = 'string' then v_item #>> '{}' end;
    if v_text is null or v_text !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
       or (split_part(v_text, ':', 1)::integer * 60 + split_part(v_text, ':', 2)::integer) % v_passo <> 0 then
      perform private.fail_signal_schedule('horario_invalido');
    end if;
  end loop;
  select array_agg(m order by m), count(*) into v_minutos, v_n
  from (select split_part(t, ':', 1)::integer * 60 + split_part(t, ':', 2)::integer as m
        from jsonb_array_elements_text(v_horarios) t) x;
  if (select count(distinct m) from unnest(v_minutos) m) <> v_n then
    perform private.fail_signal_schedule('horario_repetido');
  end if;
  for v_i in 1 .. v_n - 1 loop
    if v_minutos[v_i + 1] - v_minutos[v_i] < v_intervalo then
      perform private.fail_signal_schedule('intervalo_curto');
    end if;
  end loop;
  -- A virada do dia: do último horário de um dia ao primeiro do dia seguinte.
  if v_n >= 2 and v_minutos[1] + 1440 - v_minutos[v_n] < v_intervalo then
    perform private.fail_signal_schedule('intervalo_curto');
  end if;

  if p_schedule ? 'dias' then
    v_dias := p_schedule -> 'dias';
    if jsonb_typeof(v_dias) <> 'array' then
      perform private.fail_signal_schedule('dia_invalido');
    end if;
    if jsonb_array_length(v_dias) = 0 then
      perform private.fail_signal_schedule('sem_dia');
    end if;
    for v_item in select e from jsonb_array_elements(v_dias) e loop
      if jsonb_typeof(v_item) <> 'number' or (v_item #>> '{}') !~ '^[1-7]$' then
        perform private.fail_signal_schedule('dia_invalido');
      end if;
    end loop;
    if (select count(distinct d) from jsonb_array_elements_text(v_dias) d) <> jsonb_array_length(v_dias) then
      perform private.fail_signal_schedule('dia_invalido');
    end if;
  end if;

  if p_schedule ? 'fuso' and (jsonb_typeof(p_schedule -> 'fuso') <> 'string' or p_schedule ->> 'fuso' <> 'America/Sao_Paulo') then
    perform private.fail_signal_schedule('fuso_invalido');
  end if;
end;
$$;

-- 4. O lote da Rodada.

-- O tamanho do lote: `maxEmpresasPorRodada` do Plano, ou o padrão (25) quando o Monitoramento não tem Plano (o editor antigo),
-- sempre dentro da faixa de 1 a 100.
create function private.signal_round_batch(p_plan jsonb)
returns integer
language sql
immutable
set search_path = ''
as $$
  select least(
    greatest(
      case when jsonb_typeof(p_plan -> 'maxEmpresasPorRodada') = 'number' and (p_plan ->> 'maxEmpresasPorRodada') ~ '^[0-9]{1,6}$'
        then (p_plan ->> 'maxEmpresasPorRodada')::integer
        else private.signal_plan_limit('per_round_default')
      end,
      private.signal_plan_limit('per_round_min')),
    private.signal_plan_limit('per_round_max'));
$$;

revoke all on function private.signal_round_batch(jsonb) from public, anon, authenticated, service_role;

-- As Contas do escopo na ordem da rotação, a partir do cursor `p_offset`, no máximo `p_limit`. A ordem é a de sempre, `(name, id)`,
-- girada pelo cursor e voltando ao começo no fim da lista: o cursor 25 numa lista de 60 devolve as Contas 26 a 60 e depois 1 a 25.
-- `ord` é a posição na rotação (0 é a primeira).
create function private.signal_round_accounts(p_workspace_id uuid, p_audience jsonb, p_offset integer, p_limit integer)
returns table (id uuid, name text, domain text, linkedin_url text, legal_identifier text, ord integer)
language sql
stable
security definer
set search_path = ''
as $$
  select x.id, x.name, x.domain, x.linkedin_url, x.legal_identifier,
    ((((x.pos - 1 - greatest(coalesce(p_offset, 0), 0)) % x.total) + x.total) % x.total)::integer as ord
  from (
    select t.id, t.name, t.domain, t.linkedin_url, t.legal_identifier,
      row_number() over (order by t.name, t.id) as pos, count(*) over () as total
    from public.target_accounts t
    where t.workspace_id = p_workspace_id and t.archived_at is null and t.deleted_at is null
      and t.id::text in (select jsonb_array_elements_text(coalesce(p_audience -> 'accountIds', '[]'::jsonb)))
  ) x
  order by 6
  limit greatest(coalesce(p_limit, 0), 0);
$$;

revoke all on function private.signal_round_accounts(uuid, jsonb, integer, integer) from public, anon, authenticated, service_role;

-- O máximo de créditos de uma Rodada do Monitoramento: o preço de uma Conta verificada vezes as Contas do LOTE (as do escopo, no
-- máximo `maxEmpresasPorRodada`), ou o fixo da descoberta no mercado. O Sinal interno (das Interações) não gasta crédito. É o
-- que o runner cobraria se verificasse todo o lote; a Conta sem dado e a que falha não cobram, então o real só pode ser menor.
-- Redefinida a partir de 20261119120000: antes contava todas as Contas do escopo.
create or replace function private.signal_round_price(p_workspace_id uuid, p_monitor_id uuid)
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
  return private.scan_credits(v_m.signal_type)
    * least(cardinality(private.signal_run_account_ids(p_workspace_id, v_m.audience)), private.signal_round_batch(v_m.plan));
end;
$$;

-- A prévia e o bloqueio de uma Rodada manual. Redefinida a partir de 20261119120000: `o_contas` é o tamanho do PRÓXIMO lote
-- (`least(Contas, lote)`), `o_ate` é o lote vezes o preço por Conta, e `o_sem_dado` é estimado sobre as Contas desse lote, na
-- mesma ordem girada do claim (o cursor do Monitoramento). O resto da lista de bloqueios é o de sempre.
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
         count(*) filter (where private.signal_run_lacks_data(v_m.signal_type, p_workspace_id, a.id, a.linkedin_url))::integer
    into v_contas, v_sem
  from private.signal_round_accounts(p_workspace_id, v_m.audience, v_m.scan_offset, private.signal_round_batch(v_m.plan)) a;
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
    -- Só conta o pedido que andou ou está andando: o que falhou, ou foi cancelado, não segura a pessoa.
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

-- 5. O relógio: a Rodada perdida e o lote da Rodada agendada.

-- Registra em Rodadas os horários da Agenda que venceram sem a Rodada começar e devolve o horário em que a Rodada roda: o
-- vencido mais recente. Os anteriores viram uma linha cada (`origin = 'agenda'`, `state = 'concluida'`, `stop_reason = 'perdida'`,
-- contagens e créditos em 0). Sem compensação: nunca roda mais de uma Rodada. O runner atrasado dentro de UM horário (o relógio de
-- 10 em 10 minutos) não é Rodada perdida: só há linha quando existe um horário seguinte também vencido. `p_now` é parâmetro para o
-- teste ser determinístico. No máximo 20 linhas por chamada (as mais antigas dos últimos 8 dias); o horário devolvido é sempre o mais recente. O
-- índice `signal_monitor_runs_one_per_slot_idx` impede a repetição. Só o servidor.
create function private.register_missed_signal_slots(p_monitor_id uuid, p_now timestamptz)
returns timestamptz
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_m private.signal_monitors%rowtype;
  v_slot timestamptz;
  v_next timestamptz;
  v_registered integer := 0;
  v_at timestamptz;
  v_i integer;
begin
  select * into v_m from private.signal_monitors m where m.id = p_monitor_id;
  if not found or v_m.schedule is null or v_m.next_run_at is null then
    return null;
  end if;
  v_slot := v_m.next_run_at;
  -- Depois de uma parada muito longa, a conta começa 8 dias antes de agora (com 12 horários por dia são ~100 passos): os
  -- horários mais antigos que isso não viram linha, e o horário que roda continua sendo o vencido mais recente.
  if v_slot < p_now - interval '8 days' then
    v_slot := coalesce(private.next_signal_run(v_m.schedule, p_now - interval '8 days'), v_slot);
  end if;
  for v_i in 1 .. 1000 loop
    v_next := private.next_signal_run(v_m.schedule, v_slot);
    exit when v_next is null or v_next > p_now;
    -- `v_slot` venceu e há um horário seguinte também vencido: este horário foi perdido. Só vale se ele é mesmo um horário da
    -- Agenda (o `next_run_at` pode ser um instante qualquer, como o "já" de uma continuação).
    if v_registered < 20 and private.next_signal_run(v_m.schedule, v_slot - interval '1 second') = v_slot then
      v_at := clock_timestamp();
      insert into private.signal_monitor_runs
        (workspace_id, monitor_id, origin, state, slot_at, started_at, finished_at, stop_reason)
      values (v_m.workspace_id, v_m.id, 'agenda', 'concluida', v_slot, v_at, v_at, 'perdida')
      on conflict do nothing;
      v_registered := v_registered + 1;
    end if;
    v_slot := v_next;
  end loop;
  return v_slot;
end;
$$;

revoke all on function private.register_missed_signal_slots(uuid, timestamptz) from public, anon, authenticated, service_role;

-- Reivindica os Monitoramentos vencidos. Redefinida a partir de 20261118120000. Dois acréscimos:
--   a Rodada perdida: no começo de uma Rodada com Agenda, a Rodada roda no horário vencido mais recente e os anteriores viram
--   linhas `perdida` em Rodadas (`register_missed_signal_slots`);
--   o lote: a Rodada devolve no máximo o que falta do lote (`maxEmpresasPorRodada` menos `round_attempted`), a partir do cursor
--   `scan_offset`, voltando ao começo da lista no fim dela. `round_attempted` volta a 0 quando a Rodada fecha
--   (`finish_signal_monitor_run`), quando o público muda ou o Sinal com Agenda é reativado (`save_signal_monitor`,
--   `set_signal_monitor_state`) e quando a Rodada aberta é encerrada para um pedido manual passar (`claim_signal_run_requests`).
create or replace function public.claim_due_signal_monitors(p_limit integer default 5)
returns table (
  monitor_id uuid, workspace_id uuid, signal_type text, criteria jsonb, created_by uuid, slot timestamptz, accounts jsonb
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  with due as (
    select m.id from private.signal_monitors m
    where private.signal_type_is_runnable(m.signal_type)
      and m.state = 'ativo' and m.next_run_at <= now() and (m.claimed_until is null or m.claimed_until < now())
      and private.automation_contract_block(m.workspace_id) is null
      and not exists (
        select 1 from private.signal_run_requests q
        where q.monitor_id = m.id and q.state in ('pendente', 'rodando') and q.run_id is not null)
    order by m.next_run_at, m.id
    limit least(greatest(coalesce(p_limit, 5), 1), 20)
    for update of m skip locked
  ), claimed as (
    update private.signal_monitors m set
      claimed_until = now() + interval '15 minutes',
      current_slot_at = case when m.schedule is not null
        then coalesce(m.current_slot_at, private.register_missed_signal_slots(m.id, now()), m.next_run_at) end
    from due where m.id = due.id
    returning m.*
  )
  select c.id, c.workspace_id, c.signal_type, c.criteria,
    (select p.user_id from public.workspace_memberships p
     where p.workspace_id = c.workspace_id and p.user_id = c.created_by and p.active),
    coalesce(c.current_slot_at, c.next_run_at),
    coalesce((
      select jsonb_agg(jsonb_build_object('id', a.id, 'name', a.name, 'domain', a.domain, 'linkedinUrl', a.linkedin_url,
          'cnpj', a.legal_identifier, 'contatos', private.signal_scan_contacts(c.workspace_id, a.id))
        order by a.ord)
      from private.signal_round_accounts(
        c.workspace_id, c.audience, c.scan_offset, greatest(private.signal_round_batch(c.plan) - c.round_attempted, 0)) a
    ), '[]'::jsonb)
  from claimed c;
end;
$$;

-- Termina a chamada do runner para uma Rodada agendada. Redefinida a partir de 20261119120000. Acréscimos:
--   o lote: `round_attempted` soma as Contas tentadas; quando a soma chega ao lote a Rodada fecha mesmo que o runner peça para
--   continuar (nada mais cabe nela), e a próxima Rodada da Agenda começa no ponto seguinte da lista (`scan_offset`);
--   o aviso da 1ª Rodada pulada: quando `consecutive_skips` passa de 0 para 1 por falta de créditos e o Sinal não pausou,
--   `workspace_notices` ganha `sinal_rodada_pulada` (hoje sem leitor na tela: o aviso visível é o da tela do Sinal).
-- O resto é igual: a 3ª pulada seguida pausa o Sinal, como antes.
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
  v_attempted integer := greatest(coalesce(p_attempted, 0), 0);
  v_round integer;
  v_closing boolean;
  v_skips integer;
  v_pause boolean := false;
begin
  select * into v_m from private.signal_monitors m where m.id = p_monitor_id for update;
  if not found then
    raise exception 'monitor not found' using errcode = 'P0002';
  end if;
  v_round := v_m.round_attempted + v_attempted;
  v_closing := not coalesce(p_continue, false) or v_round >= private.signal_round_batch(v_m.plan);
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
      when not v_closing then now()
      when schedule is null then now() + make_interval(hours => every_hours)
      else private.next_signal_run(schedule, greatest(now(), coalesce(current_slot_at, now())))
    end,
    current_slot_at = case when schedule is not null and not v_closing and not v_pause then current_slot_at end,
    round_attempted = case when v_closing or v_pause then 0 else v_round end,
    state = case when v_pause then 'pausado' else state end,
    paused_reason = case when v_pause then 'sem_creditos' else paused_reason end,
    consecutive_skips = v_skips,
    claimed_until = null,
    scan_offset = (scan_offset + v_attempted) % 1000000,
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
  elsif v_closing and v_m.consecutive_skips = 0 and v_skips = 1 then
    insert into private.workspace_notices (workspace_id, kind, title, body, link)
    values (
      v_m.workspace_id, 'sinal_rodada_pulada', 'Rodada pulada por falta de créditos: ' || left(v_m.name, 120),
      'A última rodada foi pulada porque os créditos acabaram. Depois de '
        || private.signal_price_limit('pause_after_skips')::text || ' rodadas puladas seguidas, o Sinal pausa.',
      '/sinais');
  end if;
end;
$$;

-- O progresso da Rodada aceita o motivo `perdida`. Redefinida a partir de 20261119120000: só a lista de motivos muda.
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
     and p_stop_reason not in ('sem_creditos', 'teto', 'teto_diario', 'contrato_inativo', 'prazo', 'concluida', 'erro', 'perdida') then
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

-- 6. "Rodar agora": o lote e o cursor.

-- Reivindica os pedidos pendentes. Redefinida a partir de 20261117120000. O pedido começa no cursor do Monitoramento
-- (`start_offset`, gravado no primeiro claim) e não mais em 0, e devolve no máximo o que falta do lote (`maxEmpresasPorRodada`
-- menos as Contas que o pedido já tentou, `scan_offset` do pedido). A Rodada agendada que ficou aberta e foi encerrada aqui zera
-- `round_attempted`. O resto é igual.
create or replace function public.claim_signal_run_requests(p_limit integer default 5)
returns table (
  request_id uuid, workspace_id uuid, monitor_id uuid, signal_type text, criteria jsonb, requested_by uuid,
  requested_at timestamptz, scan_offset integer, plan_version integer, accounts jsonb
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Uma Rodada agendada que ficou aberta (o Monitoramento foi pausado, ou a continuação nunca veio) não trava o pedido.
  update private.signal_monitor_runs x set state = 'concluida', finished_at = clock_timestamp(),
    stop_reason = coalesce(x.stop_reason, 'prazo')
  where x.state = 'rodando' and x.origin = 'agenda' and exists (
    select 1 from private.signal_monitors m
    where m.current_run_id = x.id
      and (m.state <> 'ativo' or x.started_at < now() - make_interval(mins => private.signal_run_limit('stale_open_run_minutes')))
      and exists (select 1 from private.signal_run_requests r
                  where r.monitor_id = m.id and r.state in ('pendente', 'rodando') and r.run_id is null));
  update private.signal_monitors m set current_run_id = null, round_attempted = 0
  where m.current_run_id is not null and not exists (
    select 1 from private.signal_monitor_runs x where x.id = m.current_run_id and x.state = 'rodando');

  update private.signal_run_requests r set state = 'cancelada', finished_at = now(), claimed_until = null
  where r.state = 'pendente' and exists (
    select 1 from private.signal_monitors m
    where m.workspace_id = r.workspace_id and m.id = r.monitor_id
      and (private.monitor_scope(m.audience) <> 'contas'
        or not exists (select 1 from private.signal_actors a where a.signal_type = m.signal_type and a.state = 'available')
        or cardinality(private.signal_run_account_ids(m.workspace_id, m.audience)) = 0));

  return query
  with due as (
    select r.id from private.signal_run_requests r
    join private.signal_monitors m on m.workspace_id = r.workspace_id and m.id = r.monitor_id
    where (r.state = 'pendente' or (r.state = 'rodando' and r.claimed_until < now()))
      and (r.claimed_until is null or r.claimed_until < now())
      and (m.claimed_until is null or m.claimed_until < now())
      and m.current_run_id is null
    order by r.requested_at, r.id
    limit least(greatest(coalesce(p_limit, 5), 1), 20)
    for update of r, m skip locked
  ), claimed as (
    update private.signal_run_requests r
    set state = 'rodando', claimed_until = now() + make_interval(mins => private.signal_run_limit('claim_minutes')),
      start_offset = coalesce(r.start_offset, (
        select mm.scan_offset from private.signal_monitors mm where mm.workspace_id = r.workspace_id and mm.id = r.monitor_id))
    from due where r.id = due.id
    returning r.*
  ), locked as (
    update private.signal_monitors m
    set claimed_until = now() + make_interval(mins => private.signal_run_limit('claim_minutes'))
    from claimed c where m.id = c.monitor_id
    returning m.id
  )
  select c.id, c.workspace_id, c.monitor_id, m.signal_type, m.criteria,
    (select p.user_id from public.workspace_memberships p
     where p.workspace_id = c.workspace_id and p.user_id = c.requested_by and p.active),
    c.requested_at, c.scan_offset, m.plan_version,
    coalesce((
      select jsonb_agg(jsonb_build_object('id', a.id, 'name', a.name, 'domain', a.domain, 'linkedinUrl', a.linkedin_url,
          'cnpj', a.legal_identifier, 'contatos', private.signal_scan_contacts(c.workspace_id, a.id))
        order by a.ord)
      from private.signal_round_accounts(
        c.workspace_id, m.audience, coalesce(c.start_offset, 0) + c.scan_offset,
        greatest(private.signal_round_batch(m.plan) - c.scan_offset, 0)) a
    ), '[]'::jsonb)
  from claimed c
  join private.signal_monitors m on m.workspace_id = c.workspace_id and m.id = c.monitor_id
  order by c.requested_at, c.id;
end;
$$;

-- Fecha uma volta do pedido. Redefinida a partir de 20261117120000. O acréscimo: quando o pedido termina `feita`, o cursor de
-- rotação do Monitoramento (`scan_offset`) avança pelas Contas que o pedido tentou (as das voltas anteriores mais as desta), e a
-- próxima Rodada, agendada ou manual, segue na lista. `falhou` não avança o cursor.
create or replace function public.finish_signal_run_request(p_request_id uuid, p_state text, p_attempted integer, p_error text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_req private.signal_run_requests%rowtype;
  v_error text := nullif(left(coalesce(p_error, ''), 500), '');
  v_attempted integer := greatest(coalesce(p_attempted, 0), 0);
begin
  if p_state is null or p_state not in ('pendente', 'feita', 'falhou') then
    raise exception 'invalid run request state' using errcode = '22023';
  end if;
  select * into v_req from private.signal_run_requests r where r.id = p_request_id for update;
  if not found then
    raise exception 'run request not found' using errcode = 'P0002';
  end if;
  if v_req.state not in ('pendente', 'rodando') then
    return;
  end if;
  update private.signal_run_requests set
    state = p_state,
    claimed_until = null,
    scan_offset = case when p_state = 'pendente' then (scan_offset + v_attempted) % 1000000 else scan_offset end,
    finished_at = case when p_state = 'pendente' then null else now() end
  where id = p_request_id;
  update private.signal_monitors set
    claimed_until = null,
    scan_offset = case when p_state = 'feita' then (scan_offset + v_req.scan_offset + v_attempted) % 1000000 else scan_offset end
  where workspace_id = v_req.workspace_id and id = v_req.monitor_id;
  if p_state <> 'pendente' then
    update private.signal_monitor_runs x set
      state = case when p_state = 'falhou' then 'falhou' else 'concluida' end,
      finished_at = clock_timestamp(),
      stop_reason = coalesce(x.stop_reason, case when p_state = 'falhou' then 'erro' else 'concluida' end),
      error = v_error
    where x.id = v_req.run_id and x.state = 'rodando';
    update private.signal_monitors set last_run_at = now(), last_error = v_error
    where workspace_id = v_req.workspace_id and id = v_req.monitor_id;
  end if;
end;
$$;

-- As Rodadas do Monitoramento. Redefinida a partir de 20261117120000: cada Rodada traz também `horarioMarcado` (o horário da
-- Agenda, ou a hora do pedido na manual), que é o que a tela mostra na Rodada perdida. O motivo `perdida` já sai em
-- `motivoDaParada`.
create or replace function public.list_signal_runs(p_workspace_id uuid, p_monitor_id uuid, p_limit integer default 20)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_runs jsonb;
  v_requests jsonb;
begin
  perform private.require_active_membership(p_workspace_id);
  if not exists (select 1 from private.signal_monitors m where m.workspace_id = p_workspace_id and m.id = p_monitor_id) then
    raise exception 'monitor not found' using errcode = 'P0002';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', x.id, 'origem', x.origin, 'estado', x.state, 'iniciadaEm', x.started_at, 'terminouEm', x.finished_at,
      'horarioMarcado', x.slot_at,
      'contasNoEscopo', x.accounts_total, 'contasVerificadas', x.accounts_checked, 'contasSemDado', x.accounts_without_data,
      'sinaisNovos', x.signals_new, 'sinaisRepetidos', x.signals_repeated, 'creditos', x.credits_charged,
      'motivoDaParada', x.stop_reason, 'versaoDoPlano', x.plan_version, 'observacao', x.error
    ) order by x.started_at desc, x.id desc), '[]'::jsonb) into v_runs
  from (
    select * from private.signal_monitor_runs r
    where r.workspace_id = p_workspace_id and r.monitor_id = p_monitor_id
    order by r.started_at desc, r.id desc
    limit least(greatest(coalesce(p_limit, 20), 1), 100)
  ) x;
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', q.id, 'estado', q.state, 'pedidaEm', q.requested_at, 'ateCreditos', q.quote_credits, 'rodadaId', q.run_id
    ) order by q.requested_at, q.id), '[]'::jsonb) into v_requests
  from private.signal_run_requests q
  where q.workspace_id = p_workspace_id and q.monitor_id = p_monitor_id and q.state in ('pendente', 'rodando');
  return jsonb_build_object('rodadas', v_runs, 'solicitacoes', v_requests);
end;
$$;

-- 7. A ativação. Redefinidas a partir de 20261119120000. `save_signal_monitor` deixa de chamar
-- `private.assert_schedule_fits_scope` (a regra do escopo grande acabou) e passa a manter o cursor de rotação: `scan_offset` e
-- `round_attempted` só voltam a 0 quando o público muda (antes toda gravação do editor zerava o cursor, o que, com o lote,
-- mandaria a próxima Rodada de volta ao começo da lista a cada renomeação). `set_signal_monitor_state` zera `round_attempted`
-- quando o Sinal com Agenda é reativado (a Rodada nova começa no próximo horário).
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
  v_publico_novo boolean;
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
    v_ativando := p_state = 'ativo' and v_existing.schedule is not null and v_existing.state is distinct from 'ativo';
    v_segue_pausado := p_state = 'pausado' and v_existing.state = 'pausado';
    v_publico_novo := v_existing.audience is distinct from p_audience or v_existing.signal_type is distinct from p_signal_type;
    -- Pausar guarda a hora marcada: retomar antes dela não força uma rodada nova (nem um gasto de crédito).
    update private.signal_monitors set
      signal_type = p_signal_type, name = btrim(p_name), state = p_state, audience = p_audience, criteria = p_criteria,
      every_hours = p_every_hours, updated_at = now(),
      scan_offset = case when v_publico_novo then 0 else scan_offset end,
      round_attempted = case when v_publico_novo or v_ativando then 0 else round_attempted end,
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

-- Nada mais chama a regra do escopo grande.
drop function private.assert_schedule_fits_scope(jsonb, integer);

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
    round_attempted = case when v_ativando then 0 else round_attempted end,
    paused_reason = case when v_segue_pausado then paused_reason end,
    consecutive_skips = case when v_segue_pausado or (p_state = 'ativo' and v.state = 'ativo') then consecutive_skips else 0 end
  where id = p_id;
  if p_state = 'ativo' and private.available_signal_origin(v.signal_type) = 'interno' then
    perform private.run_internal_signal_monitor(p_id);
  end if;
end;
$$;

-- 8. O Teto mensal pré-preenchido.

-- O Teto mensal sugerido ao ativar o Sinal, em créditos inteiros: o custo estimado do mês (`por_mes_aprox` da cotação, já pelo
-- lote) mais 20%, para cima, limitado aos créditos da faixa do contrato. `p_schedule`: a Agenda que a tela propõe e ainda não
-- gravou (a mesma conferência da cotação); nula usa a Agenda gravada. Só quem participa do Workspace. Nunca devolve o limite
-- atual do Workspace nem US$: é só o número sugerido.
create function public.suggest_signal_monthly_cap(p_workspace_id uuid, p_monitor_id uuid, p_schedule jsonb default null)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_m private.signal_monitors%rowtype;
  v_schedule jsonb;
  v_e record;
  v_tier numeric;
  v_cap numeric;
begin
  perform private.require_active_membership(p_workspace_id);
  select * into v_m from private.signal_monitors m where m.workspace_id = p_workspace_id and m.id = p_monitor_id;
  if not found then
    raise exception 'monitor not found' using errcode = 'P0002';
  end if;
  if p_schedule is not null then
    perform private.validate_signal_schedule(p_schedule, 0);
    v_schedule := private.normalize_signal_schedule(p_schedule);
  else
    v_schedule := v_m.schedule;
  end if;
  select * into v_e from private.signal_cost_estimate(p_workspace_id, p_monitor_id, v_schedule);
  v_cap := ceil(v_e.o_por_mes * (100 + private.signal_price_limit('monthly_cap_margin_percent')) / 100.0);
  select t.monthly_credits::numeric into v_tier
  from private.workspace_contracts c join private.contract_tiers t on t.id = c.tier_id
  where c.workspace_id = p_workspace_id;
  if v_tier is not null and not private.credits_unlimited(p_workspace_id) then
    v_cap := least(v_cap, v_tier);
  end if;
  return greatest(v_cap, 1)::integer;
end;
$$;

-- Libera a automação da varredura de Sinais com o limite mensal que a tela sugeriu (e a pessoa pode ter editado). Só o
-- Administrador. Reaproveita `set_workspace_monthly_limit` e `save_automation_setting`, sem duplicar a regra delas. Nunca baixa
-- um limite que já existe (ele vale também para o enriquecimento e os Agentes): grava `greatest(limite atual, p_monthly_limit)`,
-- até os créditos da faixa. Na Equipe ilimitada só liga o automático. Recusas, com código estável
-- (`signal automation invalid: <código>`):
--   nao_administrador  só o Administrador libera
--   contrato_inativo   sem contrato ativo
--   limite_invalido    vazio ou menor que 1
--   acima_da_faixa     mais que os créditos da faixa do contrato
create function public.enable_signal_automation(p_workspace_id uuid, p_monitor_id uuid, p_monthly_limit integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := private.require_active_membership(p_workspace_id);
  v_tier numeric;
  v_limit numeric;
begin
  if v_role <> 'admin' then
    raise exception 'signal automation invalid: nao_administrador' using errcode = '42501', hint = 'nao_administrador';
  end if;
  if not exists (select 1 from private.signal_monitors m where m.workspace_id = p_workspace_id and m.id = p_monitor_id) then
    raise exception 'monitor not found' using errcode = 'P0002';
  end if;
  if private.credits_unlimited(p_workspace_id) then
    perform public.save_automation_setting(p_workspace_id, 'acao:varredura', 'automatico', null);
    return;
  end if;
  select t.monthly_credits::numeric into v_tier
  from private.workspace_contracts c join private.contract_tiers t on t.id = c.tier_id
  where c.workspace_id = p_workspace_id;
  if v_tier is null or private.automation_contract_block(p_workspace_id) is not null then
    raise exception 'signal automation invalid: contrato_inativo' using errcode = '22023', hint = 'contrato_inativo';
  end if;
  if p_monthly_limit is null or p_monthly_limit < 1 then
    raise exception 'signal automation invalid: limite_invalido' using errcode = '22023', hint = 'limite_invalido';
  end if;
  if p_monthly_limit > v_tier then
    raise exception 'signal automation invalid: acima_da_faixa' using errcode = '22023', hint = 'acima_da_faixa';
  end if;
  v_limit := greatest(coalesce(private.workspace_monthly_limit(p_workspace_id), 0), p_monthly_limit);
  perform public.set_workspace_monthly_limit(p_workspace_id, v_limit);
  perform public.save_automation_setting(p_workspace_id, 'acao:varredura', 'automatico', v_limit);
end;
$$;

revoke all on function public.suggest_signal_monthly_cap(uuid, uuid, jsonb) from public, anon;
revoke all on function public.enable_signal_automation(uuid, uuid, integer) from public, anon;
grant execute on function public.suggest_signal_monthly_cap(uuid, uuid, jsonb) to authenticated;
grant execute on function public.enable_signal_automation(uuid, uuid, integer) to authenticated;
