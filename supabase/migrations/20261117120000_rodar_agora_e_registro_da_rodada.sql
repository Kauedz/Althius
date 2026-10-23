-- Rodar agora, registro da Rodada e Sinais encontrados (agente-de-sinal 02, escopo Contas escolhidas, parte 2).
--
-- O Sinal ganha o caminho ponta a ponta: o Plano salvo, "Rodar agora" (um clique de uma pessoa, com a prévia em créditos),
-- a Rodada registrada e os Sinais que ela achou, cada um com o "por que apareceu". Nada cria outro relógio nem outro runner:
-- a fila de pedidos de Rodar agora é lida pelo `signal-runner`, que o `pg_cron` `althius-signal-runner` já acorda a cada
-- 10 minutos, no desenho da fila de "Buscar Sinais de novo" (`private.signal_rescans`).
--
-- 1. `private.signal_monitor_runs` (a tabela já existia, usada pelos Sinais internos) ganha origem, quem pediu, a hora
--    marcada, a versão do Plano, as Contas no escopo e sem dado, os créditos e o motivo da parada. Toda Rodada, agendada ou
--    manual, grava uma linha. Uma Rodada que continua na chamada seguinte usa a mesma linha (`signal_monitors.current_run_id`).
-- 2. `private.signals` já tinha `run_id` (a Rodada que criou o Sinal, hoje só nos internos) e ganha `seen_again_run_id`
--    (a Rodada que o viu de novo). O caminho por Conta grava as duas por `public.record_signal_in_run`, que chama
--    `private.record_signal` sem mexer na dedupe nem no prazo: quem decide se o Sinal é novo continua sendo ela.
-- 3. `private.signal_run_requests`: a fila do Rodar agora. No máximo um pedido aberto por Monitoramento.
-- 4. `public.quote_signal_run` (a prévia e o bloqueio), `public.request_signal_run_now` (o pedido),
--    `public.list_signal_runs` e `public.list_signal_run_findings` (o histórico e os achados, com o "por que apareceu").
-- 5. Do `signal-runner`: `claim_signal_run_requests`, `open_signal_run`, `add_signal_run_progress` e
--    `finish_signal_run_request` (e `kick_signal_runner`, para a continuação não esperar o relógio). `begin_account_scan` ganha `p_origin` (padrão `agenda`) e `p_request_id`; no modo manual
--    não consome o Teto de automação e a chave de cobrança inclui o pedido.
-- 6. `signal_monitors_due` acorda também com pedido manual pendente; `claim_due_signal_monitors` não pega o Monitoramento
--    que tem Rodar agora em andamento; `finish_signal_monitor_run` fecha a Rodada aberta (o cálculo de `next_run_at` não muda).
--
-- Redefinidas a partir da definição mais recente: public.begin_account_scan e public.claim_due_signal_monitors
-- (20261020120000_automacao_e_contrato_inativo.sql), public.finish_signal_monitor_run
-- (20260930180000_monitoramento_real_de_sinais.sql) e private.signal_monitors_due (20261013130000_cascatas_de_sinais.sql).
-- `begin_account_scan` de 5 parâmetros fica, agora como a chamada de sempre no modo `agenda`; a de 7 não tem valor padrão,
-- para a chamada com 5 nunca ficar ambígua (nem no Postgres, nem no PostgREST).
--
-- DECISÃO PENDENTE 2 (preço da Rodada): `scan_credits(tipo)` × Contas verificadas; a Conta sem dado não cobra (o runner nem
-- abre a varredura, `handler.ts`). DECISÃO PENDENTE 3 (intervalo mínimo entre Rodadas manuais): `signal_run_limit`.
-- DECISÃO PENDENTE 4 (Teto): `manual_run_uses_automation_cap`.

-- 1. Os limites e a regra do Teto, num lugar só do banco.
create function private.signal_run_limit(p_name text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case p_name
    when 'manual_min_interval_minutes' then 120   -- DECISÃO PENDENTE 3
    when 'claim_minutes' then 15
    when 'stale_open_run_minutes' then 60
  end;
$$;

revoke all on function private.signal_run_limit(text) from public, anon, authenticated, service_role;

-- DECISÃO PENDENTE 4: "Rodar agora" é um clique humano e não consome o Teto de automação (como o "Buscar Sinais de novo"
-- manual). Trocar para `true` faz o manual consumir o Teto como o automático. O saldo e o limite mensal valem sempre.
create function private.manual_run_uses_automation_cap()
returns boolean
language sql
immutable
set search_path = ''
as $$
  select false;
$$;

revoke all on function private.manual_run_uses_automation_cap() from public, anon, authenticated, service_role;

-- 2. A Rodada: as colunas novas. Quem já lê a tabela (os Sinais internos) segue igual: a origem padrão é a agenda.
alter table private.signal_monitor_runs
  add column origin text not null default 'agenda' check (origin in ('agenda', 'manual')),
  add column requested_by uuid references auth.users(id) on delete set null,
  add column slot_at timestamptz,
  add column plan_version integer check (plan_version is null or plan_version >= 0),
  add column accounts_total integer check (accounts_total is null or accounts_total >= 0),
  add column accounts_without_data integer not null default 0 check (accounts_without_data >= 0),
  add column credits_charged integer not null default 0 check (credits_charged >= 0),
  add column stop_reason text check (stop_reason in ('sem_creditos', 'teto', 'contrato_inativo', 'prazo', 'concluida', 'erro')),
  -- O tipo e os critérios com que a Rodada começou: o "por que apareceu" não muda se o Plano mudar depois.
  add column plan_snapshot jsonb;

comment on column private.signal_monitor_runs.accounts_checked is
  'As Contas que a Rodada de fato verificou (a fonte respondeu). Não conta a Conta sem dado nem a que falhou.';
comment on column private.signal_monitor_runs.slot_at is
  'A hora marcada da Rodada agendada, ou a hora do pedido na manual: com o Monitoramento, identifica a Rodada.';
comment on column private.signal_monitor_runs.stop_reason is
  'Por que a Rodada parou, em código estável. A tela escreve a frase; prazo: o tempo da função acabou e a Rodada continua.';

create index signal_monitor_runs_monitor_started_idx on private.signal_monitor_runs (monitor_id, started_at desc);
create index signal_monitor_runs_requested_by_idx on private.signal_monitor_runs (requested_by) where requested_by is not null;
-- A mesma hora marcada nunca abre duas Rodadas agendadas: repetir a chamada devolve a mesma.
create unique index signal_monitor_runs_one_per_slot_idx on private.signal_monitor_runs (monitor_id, slot_at)
  where origin = 'agenda' and slot_at is not null;

-- A Rodada aberta do Monitoramento: a próxima chamada do runner a continua em vez de abrir outra.
alter table private.signal_monitors
  add column current_run_id uuid references private.signal_monitor_runs(id) on delete set null;

create index signal_monitors_current_run_idx on private.signal_monitors (current_run_id) where current_run_id is not null;

alter table private.signals
  add column seen_again_run_id uuid references private.signal_monitor_runs(id) on delete set null;

create index signals_seen_again_run_idx on private.signals (seen_again_run_id) where seen_again_run_id is not null;

comment on column private.signals.run_id is
  'A Rodada que criou o Sinal (nulo nos Sinais de antes do registro da Rodada e nos que nasceram fora de uma Rodada).';
comment on column private.signals.seen_again_run_id is
  'A Rodada que viu o mesmo acontecimento de novo (nunca renova o prazo: a dedupe é a de sempre).';

-- 3. A fila do Rodar agora. Sem grant ao navegador: o acesso é só pelas funções abaixo, com a Participação conferida.
create table private.signal_run_requests (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  monitor_id uuid not null,
  requested_by uuid references auth.users(id) on delete set null,
  requested_at timestamptz not null default now(),
  -- pendente: espera o runner (ou a próxima volta, se o tempo da função acabou no meio); rodando: um runner a reivindicou.
  state text not null default 'pendente' check (state in ('pendente', 'rodando', 'feita', 'falhou', 'cancelada')),
  claimed_until timestamptz,
  run_id uuid references private.signal_monitor_runs(id) on delete set null,
  -- O máximo de créditos que a prévia mostrou na hora do pedido.
  quote_credits integer not null check (quote_credits >= 0),
  -- Por onde a rotação das Contas continua na chamada seguinte.
  scan_offset integer not null default 0 check (scan_offset >= 0),
  finished_at timestamptz,
  foreign key (workspace_id, monitor_id) references private.signal_monitors(workspace_id, id) on delete cascade
);

-- No máximo um pedido aberto por Monitoramento: dois cliques juntos, ou de duas pessoas, geram uma Rodada só.
create unique index signal_run_requests_one_open_idx on private.signal_run_requests (monitor_id)
  where state in ('pendente', 'rodando');
create index signal_run_requests_monitor_idx on private.signal_run_requests (monitor_id, requested_at desc);
create index signal_run_requests_workspace_monitor_idx on private.signal_run_requests (workspace_id, monitor_id);
create index signal_run_requests_requested_by_idx on private.signal_run_requests (requested_by) where requested_by is not null;
create index signal_run_requests_run_idx on private.signal_run_requests (run_id) where run_id is not null;

alter table private.signal_run_requests enable row level security;
revoke all on private.signal_run_requests from public, anon, authenticated, service_role;

-- 4. As contas da prévia e do runner.

-- As Contas do escopo do Monitoramento: do Workspace, nem arquivadas nem apagadas.
create function private.signal_run_account_ids(p_workspace_id uuid, p_audience jsonb)
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(t.id order by t.name, t.id), '{}')
  from public.target_accounts t
  where t.workspace_id = p_workspace_id and t.archived_at is null and t.deleted_at is null
    and t.id::text in (select jsonb_array_elements_text(coalesce(p_audience -> 'accountIds', '[]'::jsonb)));
$$;

revoke all on function private.signal_run_account_ids(uuid, jsonb) from public, anon, authenticated, service_role;

-- A estimativa das Contas que o adaptador pularia por falta de dado (a prévia diz "estimadas": a regra de verdade é a do
-- adaptador, `signal-runner/adaptadores`). Os Sinais que leem a página da empresa no LinkedIn pedem a página; o de
-- promoções pede um Contato com LinkedIn. Os demais procuram pelo nome, que a Conta sempre tem.
create function private.signal_run_lacks_data(p_signal_type text, p_workspace_id uuid, p_account_id uuid, p_linkedin_url text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_signal_type in ('nova_lideranca', 'entradas_e_saidas', 'anuncio_de_movimentacao', 'crescimento_de_equipes', 'publicacao_da_empresa')
      then coalesce(p_linkedin_url, '') !~* 'linkedin\.com/(company|school|showcase)/[^/?#[:space:]]+'
    when p_signal_type = 'mudanca_de_emprego'
      then private.signal_scan_contacts(p_workspace_id, p_account_id) = '[]'::jsonb
    else false
  end;
$$;

revoke all on function private.signal_run_lacks_data(text, uuid, uuid, text) from public, anon, authenticated, service_role;

-- A prévia e o bloqueio de uma Rodada manual, uma conta só para o que o botão mostra e o que o pedido confere nunca
-- divergirem. O primeiro bloqueio da lista vence:
--   sem_permissao          só quem criou o Monitoramento, ou um Administrador, roda (a permissão de salvá-lo)
--   sem_fonte              o Sinal não tem fonte disponível por Conta (cascata, interno, mercado ou fonte fora do ar)
--   sem_contas             nenhuma Conta no escopo
--   contrato_inativo       sem contrato ativo (a Equipe, ilimitada, passa)
--   ja_na_fila             já há um pedido pendente ou rodando para este Monitoramento
--   intervalo_minimo       outra Rodada manual do mesmo Sinal há menos que o intervalo mínimo
--   sem_creditos           o saldo não cobre as Contas que devem ser verificadas
--   limite_do_mes          o limite do contrato no mês (ou a guarda interna) não comporta a Rodada
--   limite_do_participante o limite mensal de quem pede não comporta a Rodada
-- Nada de US$ nem de Teto.
create function private.signal_run_quote(p_workspace_id uuid, p_monitor_id uuid, p_role text, p_user_id uuid)
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

revoke all on function private.signal_run_quote(uuid, uuid, text, uuid) from public, anon, authenticated, service_role;

-- A prévia do botão "Rodar agora". `contas`: as Contas no escopo; `contas_sem_dado`: as que o adaptador deve pular (estimativa);
-- `creditos_por_conta`: o preço fixo do Sinal; `ate_creditos`: o máximo da Rodada (todas as Contas); `saldo`: o disponível, o
-- mesmo número da tela de créditos; `ilimitado`: a Equipe; `bloqueio`: nulo ou o motivo; `liberado_em`: quando o intervalo
-- mínimo acaba.
create function public.quote_signal_run(p_workspace_id uuid, p_monitor_id uuid)
returns table (
  contas integer,
  contas_sem_dado integer,
  creditos_por_conta integer,
  ate_creditos integer,
  saldo numeric,
  ilimitado boolean,
  bloqueio text,
  liberado_em timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_role text := private.require_active_membership(p_workspace_id);
begin
  return query
  select q.o_contas, q.o_sem_dado, q.o_por_conta, q.o_ate, q.o_saldo, q.o_ilimitado, q.o_bloqueio, q.o_liberado_em
  from private.signal_run_quote(p_workspace_id, p_monitor_id, v_role, auth.uid()) q;
end;
$$;

-- O pedido do clique. Vale para rascunho, ativo e pausado e não muda o estado nem o `next_run_at` do Monitoramento. Recusa
-- com o mesmo bloqueio da prévia (`signal run blocked: <código>`). Dois cliques juntos geram um pedido só.
create function public.request_signal_run_now(p_workspace_id uuid, p_monitor_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := private.require_active_membership(p_workspace_id);
  v_quote record;
  v_id uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended('signal_run_request:' || p_monitor_id::text, 0));
  select * into v_quote from private.signal_run_quote(p_workspace_id, p_monitor_id, v_role, auth.uid());
  if v_quote.o_bloqueio is not null then
    raise exception 'signal run blocked: %', v_quote.o_bloqueio using errcode = 'P0001', hint = v_quote.o_bloqueio;
  end if;
  insert into private.signal_run_requests (workspace_id, monitor_id, requested_by, quote_credits)
  values (p_workspace_id, p_monitor_id, auth.uid(), v_quote.o_ate)
  returning id into v_id;
  return v_id;
exception when unique_violation then
  raise exception 'signal run blocked: ja_na_fila' using errcode = 'P0001', hint = 'ja_na_fila';
end;
$$;

revoke all on function public.quote_signal_run(uuid, uuid) from public, anon;
revoke all on function public.request_signal_run_now(uuid, uuid) from public, anon;
grant execute on function public.quote_signal_run(uuid, uuid) to authenticated;
grant execute on function public.request_signal_run_now(uuid, uuid) to authenticated;

-- 5. O registro da Rodada.

-- Abre a Rodada, ou devolve a que já está aberta: a agendada continua pelo `current_run_id` do Monitoramento (ou pela mesma
-- hora marcada); a manual, pelo `run_id` do pedido. Guarda a versão do Plano, as Contas no escopo e o que a Rodada procura.
create function private.open_signal_monitor_run(
  p_monitor_id uuid, p_origin text, p_slot timestamptz, p_request_id uuid default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_m private.signal_monitors%rowtype;
  v_req private.signal_run_requests%rowtype;
  v_run uuid;
begin
  if p_origin is null or p_origin not in ('agenda', 'manual') then
    raise exception 'invalid run origin' using errcode = '22023';
  end if;
  select * into v_m from private.signal_monitors m where m.id = p_monitor_id for update;
  if not found then
    raise exception 'monitor not found' using errcode = 'P0002';
  end if;
  if p_origin = 'manual' then
    select * into v_req from private.signal_run_requests r where r.id = p_request_id and r.monitor_id = p_monitor_id for update;
    if not found then
      raise exception 'run request not found' using errcode = 'P0002';
    end if;
    if v_req.run_id is not null then
      return v_req.run_id;
    end if;
  else
    select x.id into v_run from private.signal_monitor_runs x where x.id = v_m.current_run_id and x.state = 'rodando';
    if found then
      return v_run;
    end if;
    select x.id into v_run from private.signal_monitor_runs x
    where x.monitor_id = p_monitor_id and x.origin = 'agenda' and x.slot_at = p_slot;
    if found then
      return v_run;
    end if;
  end if;

  insert into private.signal_monitor_runs
    (workspace_id, monitor_id, origin, requested_by, slot_at, plan_version, accounts_total, plan_snapshot)
  values (
    v_m.workspace_id, v_m.id, p_origin, case when p_origin = 'manual' then v_req.requested_by end,
    case when p_origin = 'manual' then v_req.requested_at else p_slot end,
    v_m.plan_version, cardinality(private.signal_run_account_ids(v_m.workspace_id, v_m.audience)),
    jsonb_build_object('tipo', v_m.signal_type, 'criterios', v_m.criteria))
  returning id into v_run;
  if p_origin = 'manual' then
    update private.signal_run_requests set run_id = v_run where id = v_req.id;
  else
    update private.signal_monitors set current_run_id = v_run where id = v_m.id;
  end if;
  return v_run;
end;
$$;

revoke all on function private.open_signal_monitor_run(uuid, text, timestamptz, uuid) from public, anon, authenticated, service_role;

-- Para o runner: abre (ou reencontra) a Rodada. Só o servidor.
create function public.open_signal_run(p_monitor_id uuid, p_slot timestamptz, p_request_id uuid default null)
returns uuid
language sql
security definer
set search_path = ''
as $$
  select private.open_signal_monitor_run(
    p_monitor_id, case when p_request_id is null then 'agenda' else 'manual' end, p_slot, p_request_id);
$$;

-- Soma o que a chamada do runner fez à Rodada: Contas verificadas, Sinais novos e repetidos, Contas sem dado e os créditos
-- (as reservas por Conta que a chamada liquidou, conferidas aqui: o runner não diz quanto cobrou; mais `p_credits`, o que a
-- cascata cobrou por rodada). O motivo da parada, quando vem, substitui o anterior. A Rodada já fechada não muda mais. Só o
-- servidor.
create function public.add_signal_run_progress(
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
  if p_stop_reason is not null and p_stop_reason not in ('sem_creditos', 'teto', 'contrato_inativo', 'prazo', 'concluida', 'erro') then
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

-- Grava um Sinal dentro de uma Rodada. Quem decide se é novo é `private.record_signal`, como sempre; aqui só se anota a
-- Rodada: a que criou o Sinal (`run_id`) ou a que o viu de novo (`seen_again_run_id`). A Rodada tem de ser do mesmo
-- Workspace e do mesmo Monitoramento, senão o Sinal é gravado sem ela. Devolve o mesmo que `record_signal`.
create function public.record_signal_in_run(
  p_run_id uuid,
  p_workspace_id uuid,
  p_target_account_id uuid,
  p_monitor_id uuid,
  p_signal_type text,
  p_event_key text,
  p_phrase text,
  p_fired_at timestamptz,
  p_source text,
  p_evidence text
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_new boolean;
begin
  v_new := private.record_signal(
    p_workspace_id, p_target_account_id, p_monitor_id, p_signal_type, p_event_key, p_phrase, p_fired_at, p_source, p_evidence);
  if p_run_id is null or not exists (
    select 1 from private.signal_monitor_runs x
    where x.id = p_run_id and x.workspace_id = p_workspace_id and x.monitor_id = p_monitor_id
  ) then
    return v_new;
  end if;
  if v_new then
    update private.signals set run_id = p_run_id
    where workspace_id = p_workspace_id and target_account_id = p_target_account_id
      and signal_type = p_signal_type and event_key = p_event_key and run_id is null;
  else
    -- O reencontro anotou `seen_again_at = now()` no Sinal (a vaga de outra fonte inclusive): é essa linha que ganha a Rodada.
    update private.signals set seen_again_run_id = p_run_id
    where workspace_id = p_workspace_id and target_account_id = p_target_account_id and event_key = p_event_key
      and seen_again_at = now() and seen_again_monitor_id is not distinct from p_monitor_id;
  end if;
  return v_new;
end;
$$;

-- Termina a chamada do runner para uma Rodada agendada: solta a reserva, guarda o motivo (se houve) e avança a rotação pelas
-- Contas que tentou. Agenda a próxima daqui a `every_hours`, ou já, quando o tempo acabou no meio e ainda há Contas por
-- varrer (p_continue). Redefinida a partir de 20260930180000: o cálculo de `next_run_at` é o mesmo (a Agenda por horários é
-- do ticket 03); o acréscimo é que, sem continuar, a Rodada aberta fecha.
create or replace function public.finish_signal_monitor_run(
  p_monitor_id uuid, p_attempted integer, p_error text, p_continue boolean default false
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run uuid;
begin
  update private.signal_monitors set
    last_run_at = now(),
    next_run_at = case when p_continue then now() else now() + make_interval(hours => every_hours) end,
    claimed_until = null,
    scan_offset = (scan_offset + greatest(coalesce(p_attempted, 0), 0)) % 1000000,
    last_error = nullif(left(coalesce(p_error, ''), 500), '')
  where id = p_monitor_id
  returning current_run_id into v_run;
  if not found then
    raise exception 'monitor not found' using errcode = 'P0002';
  end if;
  if v_run is not null and not coalesce(p_continue, false) then
    update private.signal_monitor_runs x set
      state = case when x.stop_reason = 'erro' then 'falhou' else 'concluida' end,
      finished_at = clock_timestamp(),
      stop_reason = coalesce(x.stop_reason, 'concluida'),
      error = nullif(left(coalesce(p_error, ''), 500), '')
    where x.id = v_run and x.state = 'rodando';
    update private.signal_monitors set current_run_id = null where id = p_monitor_id;
  end if;
end;
$$;

-- 6. A varredura da Conta: o modo manual. Redefinida a partir de 20261020120000. A forma de 7 parâmetros guarda a lógica; a
-- de 5, que o runner e os testes de sempre chamam, passa a ser o modo `agenda`. No manual a chave de cobrança inclui o pedido,
-- o Teto de automação só entra se `manual_run_uses_automation_cap()` (DECISÃO PENDENTE 4) e o saldo, o limite do contrato e o
-- limite de quem pediu valem como em toda varredura.
create function public.begin_account_scan(
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
  select m.signal_type into v_type from private.signal_monitors m where m.workspace_id = p_workspace_id and m.id = p_monitor_id;
  v_qty := private.scan_credits(v_type);

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

-- A chamada de sempre: a varredura agendada, com a chave do Monitoramento, da Conta e da hora marcada.
create or replace function public.begin_account_scan(
  p_workspace_id uuid, p_user_id uuid, p_monitor_id uuid, p_account_id uuid, p_slot timestamptz
) returns table (outcome text, reservation_id uuid)
language sql
security definer
set search_path = ''
as $$
  select s.outcome, s.reservation_id
  from public.begin_account_scan(p_workspace_id, p_user_id, p_monitor_id, p_account_id, p_slot, 'agenda', null::uuid) s;
$$;

revoke all on function public.begin_account_scan(uuid, uuid, uuid, uuid, timestamptz, text, uuid) from public, anon, authenticated;
grant execute on function public.begin_account_scan(uuid, uuid, uuid, uuid, timestamptz, text, uuid) to service_role;

-- 7. A fila para o runner. Reivindica os pedidos pendentes, com uma reserva de 15 minutos, e devolve as Contas do escopo
-- (a rotação recomeça por onde o pedido parou), primeiro os mais antigos. O Monitoramento fica reservado enquanto o pedido
-- roda, então a Rodada agendada não passa por cima. Um pedido cujo Monitoramento deixou de ter fonte por Conta ou Contas no
-- escopo é cancelado aqui. Só o servidor.
create function public.claim_signal_run_requests(p_limit integer default 5)
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
  update private.signal_monitors m set current_run_id = null
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
    set state = 'rodando', claimed_until = now() + make_interval(mins => private.signal_run_limit('claim_minutes'))
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
      select jsonb_agg(jsonb_build_object('id', x.id, 'name', x.name, 'domain', x.domain, 'linkedinUrl', x.linkedin_url,
          'cnpj', x.legal_identifier, 'contatos', private.signal_scan_contacts(c.workspace_id, x.id))
        order by (((x.pos - 1 - c.scan_offset) % x.total) + x.total) % x.total)
      from (
        select t.id, t.name, t.domain, t.linkedin_url, t.legal_identifier,
          row_number() over (order by t.name, t.id) as pos, count(*) over () as total
        from public.target_accounts t
        where t.workspace_id = c.workspace_id and t.archived_at is null and t.deleted_at is null
          and t.id::text in (select jsonb_array_elements_text(m.audience -> 'accountIds'))
      ) x
    ), '[]'::jsonb)
  from claimed c
  join private.signal_monitors m on m.workspace_id = c.workspace_id and m.id = c.monitor_id
  order by c.requested_at, c.id;
end;
$$;

-- Fecha uma volta do pedido: "pendente" solta a reserva e o deixa na fila para continuar (o tempo da função acabou no
-- meio; a rotação avança pelas Contas que tentou); "feita" e "falhou" o encerram e fecham a Rodada. O Rodar agora não mexe
-- no `next_run_at`, mas o resultado vira a última Rodada do Monitoramento. O que já terminou não muda mais. Só o servidor.
create function public.finish_signal_run_request(p_request_id uuid, p_state text, p_attempted integer, p_error text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_req private.signal_run_requests%rowtype;
  v_error text := nullif(left(coalesce(p_error, ''), 500), '');
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
    scan_offset = case when p_state = 'pendente' then (scan_offset + greatest(coalesce(p_attempted, 0), 0)) % 1000000 else scan_offset end,
    finished_at = case when p_state = 'pendente' then null else now() end
  where id = p_request_id;
  update private.signal_monitors set claimed_until = null where workspace_id = v_req.workspace_id and id = v_req.monitor_id;
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

revoke all on function public.open_signal_run(uuid, timestamptz, uuid) from public, anon, authenticated;
revoke all on function public.add_signal_run_progress(uuid, integer, integer, integer, integer, uuid[], text, integer) from public, anon, authenticated;
revoke all on function public.record_signal_in_run(uuid, uuid, uuid, uuid, text, text, text, timestamptz, text, text) from public, anon, authenticated;
revoke all on function public.claim_signal_run_requests(integer) from public, anon, authenticated;
revoke all on function public.finish_signal_run_request(uuid, text, integer, text) from public, anon, authenticated;
grant execute on function public.open_signal_run(uuid, timestamptz, uuid) to service_role;
grant execute on function public.add_signal_run_progress(uuid, integer, integer, integer, integer, uuid[], text, integer) to service_role;
grant execute on function public.record_signal_in_run(uuid, uuid, uuid, uuid, text, text, text, timestamptz, text, text) to service_role;
grant execute on function public.claim_signal_run_requests(integer) to service_role;
grant execute on function public.finish_signal_run_request(uuid, text, integer, text) to service_role;

-- 8. O relógio. O Monitoramento que tem Rodar agora em andamento (pedido já com Rodada, ou reservado) não é pego pelo
-- agendado, e o relógio acorda também com pedido manual esperando. Não nasce outro cron: o `althius-signal-runner` de
-- sempre chama `kick_signal_runner`, que pergunta a `signal_monitors_due`.
-- Redefinida a partir de 20261013130000.
create or replace function private.signal_monitors_due()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from private.signal_monitors m
    where private.signal_type_is_runnable(m.signal_type)
      and m.state = 'ativo' and m.next_run_at <= now() and (m.claimed_until is null or m.claimed_until < now()))
  or exists (
    select 1 from private.signal_run_requests r
    where r.state in ('pendente', 'rodando') and (r.claimed_until is null or r.claimed_until < now()));
$$;

-- Para o runner: chama o relógio de novo, como `kick_rescan_runner` faz com a busca que volta à fila. O Rodar agora que não coube
-- no tempo da função continua na chamada seguinte sem esperar os 10 minutos de quem clicou. Só chama quando há o que fazer
-- (`signal_monitors_due`) e onde o relógio está configurado. Só o servidor.
create function public.kick_signal_runner()
returns boolean
language sql
security definer
set search_path = ''
as $$
  select private.kick_signal_runner();
$$;

revoke all on function public.kick_signal_runner() from public, anon, authenticated;
grant execute on function public.kick_signal_runner() to service_role;

-- Redefinida a partir de 20261020120000: o único acréscimo é não pegar o Monitoramento com Rodar agora em andamento.
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
    update private.signal_monitors m set claimed_until = now() + interval '15 minutes'
    from due where m.id = due.id
    returning m.*
  )
  select c.id, c.workspace_id, c.signal_type, c.criteria,
    (select p.user_id from public.workspace_memberships p
     where p.workspace_id = c.workspace_id and p.user_id = c.created_by and p.active),
    c.next_run_at,
    coalesce((
      select jsonb_agg(jsonb_build_object('id', x.id, 'name', x.name, 'domain', x.domain, 'linkedinUrl', x.linkedin_url,
          'cnpj', x.legal_identifier, 'contatos', private.signal_scan_contacts(c.workspace_id, x.id))
        order by (((x.pos - 1 - c.scan_offset) % x.total) + x.total) % x.total)
      from (
        select t.id, t.name, t.domain, t.linkedin_url, t.legal_identifier,
          row_number() over (order by t.name, t.id) as pos, count(*) over () as total
        from public.target_accounts t
        where t.workspace_id = c.workspace_id and t.archived_at is null and t.deleted_at is null
          and t.id::text in (select jsonb_array_elements_text(c.audience -> 'accountIds'))
      ) x
    ), '[]'::jsonb)
  from claimed c;
end;
$$;

-- 9. O histórico e os achados.

-- O nome do Sinal como a pessoa o lê (os mesmos de `_shared/plano-do-sinal/campos.ts`, `ROTULO_DO_TIPO`; um teste confere).
create function private.signal_run_type_label(p_signal_type text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_signal_type
    when 'vaga_linkedin' then 'Abertura de vagas'
    when 'vaga_indeed' then 'Vagas no Indeed'
    when 'mudanca_de_emprego' then 'Promoções'
    when 'nova_lideranca' then 'Nova liderança'
    when 'entradas_e_saidas' then 'Novas contratações'
    when 'anuncio_de_movimentacao' then 'Anúncio público de movimentação'
    when 'anuncio_linkedin' then 'Anunciando no LinkedIn'
    when 'anuncio_meta' then 'Anunciando na Meta'
    when 'anuncio_google' then 'Anunciando no Google'
    when 'avaliacoes_google_maps' then 'Avaliações no Google Maps'
    when 'crescimento_de_equipes' then 'Crescimento ou redução de equipes'
    when 'publicacao_da_empresa' then 'Publicações da empresa'
    else 'Sinal'
  end;
$$;

revoke all on function private.signal_run_type_label(text) from public, anon, authenticated, service_role;

-- O valor de um critério como texto: lista vira "a, b"; texto fica; o resto (ou vazio) vira nulo.
create function private.signal_run_criteria_text(p_value jsonb)
returns text
language sql
immutable
set search_path = ''
as $$
  select case jsonb_typeof(p_value)
    when 'string' then nullif(btrim(p_value #>> '{}'), '')
    when 'array' then nullif(array_to_string(array(select btrim(e) from jsonb_array_elements_text(p_value) e where btrim(e) <> ''), ', '), '')
  end;
$$;

revoke all on function private.signal_run_criteria_text(jsonb) from public, anon, authenticated, service_role;

-- O "por que apareceu": o critério do Plano com que a Rodada começou, em palavras. "Qualquer" não entra (não restringiu nada).
create function private.signal_run_reason(p_signal_type text, p_criteria jsonb)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_parts text[] := '{}';
  v_text text;
begin
  v_text := private.signal_run_criteria_text(p_criteria -> 'funcoes');
  if v_text is not null then v_parts := v_parts || ('função: ' || v_text); end if;
  v_text := private.signal_run_criteria_text(p_criteria -> 'cargos');
  if v_text is not null then v_parts := v_parts || ('cargo: ' || v_text); end if;
  v_text := private.signal_run_criteria_text(p_criteria -> 'senioridade');
  if v_text is not null and v_text <> 'Qualquer' then v_parts := v_parts || ('senioridade: ' || v_text); end if;
  v_text := private.signal_run_criteria_text(p_criteria -> 'movimento');
  if v_text is not null then v_parts := v_parts || ('movimento: ' || v_text); end if;
  v_text := private.signal_run_criteria_text(p_criteria -> 'pessoas');
  if v_text is not null and v_text <> 'Qualquer pessoa no cargo' then v_parts := v_parts || ('pessoas: ' || v_text); end if;
  v_text := private.signal_run_criteria_text(p_criteria -> 'localizacao');
  if v_text is not null then v_parts := v_parts || ('em ' || v_text); end if;
  v_text := private.signal_run_criteria_text(p_criteria -> 'nota');
  if v_text is not null and v_text <> 'Qualquer nota' then v_parts := v_parts || ('nota: ' || v_text); end if;
  v_text := private.signal_run_criteria_text(p_criteria -> 'palavras');
  if v_text is not null then v_parts := v_parts || ('palavras: ' || v_text); end if;
  v_text := private.signal_run_criteria_text(p_criteria -> 'periodo');
  if v_text is not null then v_parts := v_parts || ('período: ' || v_text); end if;
  return 'Combina com o Plano: ' || private.signal_run_type_label(p_signal_type)
    || case when cardinality(v_parts) > 0 then ' (' || array_to_string(v_parts, '; ') || ')' else '' end;
end;
$$;

revoke all on function private.signal_run_reason(text, jsonb) from public, anon, authenticated, service_role;

-- As Rodadas mais recentes do Monitoramento (origem, horários, contagens, créditos e motivo da parada) e os pedidos de Rodar
-- agora ainda abertos. Qualquer participante ativo lê, como a lista de Monitoramentos.
create function public.list_signal_runs(p_workspace_id uuid, p_monitor_id uuid, p_limit integer default 20)
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

-- Os Sinais de uma Rodada: os que ela criou (`novo`) e os que viu de novo (`visto_de_novo`), cada um com a Conta, a
-- evidência e o "por que apareceu", montado a partir dos critérios do Plano com que a Rodada começou. Só do Workspace da
-- Rodada; uma Rodada de outro Workspace, ou que não existe, é "não encontrada".
create function public.list_signal_run_findings(p_workspace_id uuid, p_run_id uuid)
returns table (
  signal_id uuid, target_account_id uuid, account_name text, signal_type text, phrase text, fired_at timestamptz,
  source text, evidence text, kind text, why text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_run private.signal_monitor_runs%rowtype;
begin
  perform private.require_active_membership(p_workspace_id);
  select * into v_run from private.signal_monitor_runs x where x.id = p_run_id and x.workspace_id = p_workspace_id;
  if not found then
    raise exception 'run not found' using errcode = 'P0002';
  end if;
  return query
  select g.id, g.target_account_id, a.name, g.signal_type, g.phrase, g.fired_at, g.source, g.evidence,
    case when g.run_id = p_run_id then 'novo' else 'visto_de_novo' end,
    private.signal_run_reason(coalesce(v_run.plan_snapshot ->> 'tipo', g.signal_type), coalesce(v_run.plan_snapshot -> 'criterios', '{}'::jsonb))
  from private.signals g
  join public.target_accounts a on a.workspace_id = g.workspace_id and a.id = g.target_account_id and a.deleted_at is null
  where g.workspace_id = p_workspace_id and (g.run_id = p_run_id or g.seen_again_run_id = p_run_id)
  order by coalesce(g.run_id = p_run_id, false) desc, a.name, g.fired_at desc, g.id;
end;
$$;

revoke all on function public.list_signal_runs(uuid, uuid, integer) from public, anon;
revoke all on function public.list_signal_run_findings(uuid, uuid) from public, anon;
grant execute on function public.list_signal_runs(uuid, uuid, integer) to authenticated;
grant execute on function public.list_signal_run_findings(uuid, uuid) to authenticated;
