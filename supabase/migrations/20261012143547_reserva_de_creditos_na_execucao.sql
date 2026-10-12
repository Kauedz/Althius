-- Reserva de Créditos antes de executar (orquestracao, ticket 02, ADR-0019). Até aqui a Execução de um Agente só
-- reservava crédito depois de começar, rodada a rodada (begin_agent_round). Agora o claim reserva a estimativa da
-- Execução antes de devolver qualquer coisa ao motor, a rodada de cada Agente consome essa reserva (e só reserva de
-- novo quando ela acaba), e o fim da Execução acerta: debita o que as rodadas concluídas custaram e solta o resto. É o
-- contrato da consulta de CNPJ (begin_cnpj_receita/finish_cnpj_receita): reservar antes, liquidar o que aconteceu.
--
-- Em cima disso, o teto de uma Rotina é uma parada dura: o relógio (ticket 01) já soma ao teto `rotina:<id>` a estimativa
-- provisória; o fim da Execução devolve a diferença, e uma rodada além do que o relógio contou consulta o teto antes de
-- abrir. A cobrança continua desligada por Workspace (`workspace_billing.credits_enforced`): sem ela nada é reservado.
-- reserve_credits, settle_credits, release_credits e as funções da proposta de resposta e da consulta de CNPJ não mudam.
--
-- Redefinidas a partir da definição mais recente na main: claim_agent_run (20261012120532), begin_agent_round
-- (20260930210000), end_agent_round (20260930190000), finish_agent_run e expire_run_if_stale (20260929180000).

-- 1. O caderno das rodadas de cada Execução: de onde sai a contagem das rodadas concluídas. Uma rodada "coberta" saiu da
-- reserva de estimativa e não tem reserva própria; a que passou da estimativa guarda a reserva que ela mesma abriu.
-- Com a cobrança desligada, só as Execuções de Rotina entram aqui (o teto vale com a cobrança desligada).
create table private.agent_run_rounds (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references private.agent_runs(id) on delete cascade,
  agent_id uuid not null,
  round integer not null check (round > 0),
  covered boolean not null default false,
  reservation_id uuid references private.credit_reservations(id) on delete set null,
  status text not null default 'open' check (status in ('open', 'done', 'failed')),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique (run_id, agent_id, round)
);

create index agent_run_rounds_reservation_idx on private.agent_run_rounds (reservation_id) where reservation_id is not null;

alter table private.agent_run_rounds enable row level security;
revoke all on private.agent_run_rounds from public, anon, authenticated, service_role;

-- O que o teto da Rotina já recebeu além do que o relógio somou (as rodadas extras), e se os créditos da Execução já
-- foram acertados: o acerto é uma vez só por Execução.
alter table private.agent_runs
  add column cap_extra numeric(12, 2) not null default 0 check (cap_extra >= 0),
  add column credits_closed boolean not null default false;

-- 2. Apoio.
-- O preço de uma rodada neste Workspace, como reserve_credits o cobra: o do catálogo, ou 20% com a chave de IA do cliente.
create function private.agent_round_unit(p_workspace_id uuid)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when exists (select 1 from private.workspace_ai_keys k where k.workspace_id = p_workspace_id)
      then round(c.credits * private.own_ai_key_factor(), 2)
    else c.credits
  end
  from private.credit_action_prices c where c.action = 'agent_round';
$$;

-- Quantas rodadas o relógio das Rotinas já contou ao teto de cada Execução (a estimativa provisória dividida pelo preço).
create function private.routine_cap_rounds()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select greatest(round(private.routine_run_estimate() / nullif(p.credits, 0))::integer, 1)
     from private.credit_action_prices p where p.action = 'agent_round'),
    3);
$$;

-- Abre (ou reabre, se a tentativa anterior falhou) a linha da rodada no caderno. Devolve o id da linha.
create function private.open_agent_round(
  p_run_id uuid, p_agent_id uuid, p_round integer, p_covered boolean, p_reservation_id uuid, p_status text default 'open'
) returns uuid
language sql
security definer
set search_path = ''
as $$
  insert into private.agent_run_rounds as x (run_id, agent_id, round, covered, reservation_id, status)
  values (p_run_id, p_agent_id, p_round, p_covered, p_reservation_id, p_status)
  on conflict (run_id, agent_id, round) do update
    set covered = excluded.covered, reservation_id = excluded.reservation_id, status = excluded.status,
      updated_at = clock_timestamp()
  returning x.id;
$$;

revoke all on function private.agent_round_unit(uuid) from public, anon, authenticated, service_role;
revoke all on function private.routine_cap_rounds() from public, anon, authenticated, service_role;
revoke all on function private.open_agent_round(uuid, uuid, integer, boolean, uuid, text) from public, anon, authenticated, service_role;

-- 3. O acerto. Chamado quando a Execução fecha, de qualquer jeito (sucesso, falha, timeout, recusa no claim), uma vez só:
-- solta a reserva das rodadas que o motor deixou abertas; liquida a reserva de estimativa com as rodadas concluídas
-- (zero libera; quem falha depois de uma rodada concluída paga só ela); e devolve ao teto da Rotina o que o relógio
-- somou a mais do que as rodadas concluídas custaram.
create function private.close_run_credits(p_run_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run private.agent_runs%rowtype;
  v_estimate private.credit_reservations%rowtype;
  v_covered_done integer;
  v_done integer;
  v_refund numeric;
begin
  update private.agent_runs set credits_closed = true where id = p_run_id and not credits_closed returning * into v_run;
  if not found then
    return;
  end if;

  perform public.release_credits(x.reservation_id)
  from private.agent_run_rounds x
  join private.credit_reservations c on c.id = x.reservation_id
  where x.run_id = p_run_id and x.status = 'open' and c.status = 'reserved';
  update private.agent_run_rounds set status = 'failed', updated_at = clock_timestamp()
  where run_id = p_run_id and status = 'open';

  select * into v_estimate from private.credit_reservations r
  where r.workspace_id = v_run.workspace_id and r.action_key = 'run:' || p_run_id::text and r.status = 'reserved';
  if found then
    select count(*)::integer into v_covered_done from private.agent_run_rounds x
    where x.run_id = p_run_id and x.covered and x.status = 'done';
    perform public.settle_credits(v_estimate.id, least(v_covered_done, v_estimate.quantity));
  end if;

  if v_run.trigger_kind = 'rotina' and v_run.routine_id is not null then
    select count(*)::integer into v_done from private.agent_run_rounds x where x.run_id = p_run_id and x.status = 'done';
    v_refund := private.routine_run_estimate() + v_run.cap_extra - v_done * private.agent_round_unit(v_run.workspace_id);
    if v_refund > 0 then
      perform private.refund_automation_cap(v_run.workspace_id, 'rotina:' || v_run.routine_id::text, v_refund);
    end if;
  end if;
end;
$$;

revoke all on function private.close_run_credits(uuid) from public, anon, authenticated, service_role;

-- 4. A porta. Com a cobrança ligada, o claim reserva a estimativa da Execução antes de devolver qualquer coisa ao motor:
-- a Conversa de um Agente = 1 Agente por 1 rodada, mais cada @mencionado; a Coordenação = MAX_ESCOLHIDOS (3) Agentes por
-- 1 rodada (_shared/orquestracao.ts). As rodadas extras são reservadas uma a uma, pela rodada. A chave `run:<Execução>`
-- é idempotente, e o claim só reserva uma vez porque só reclama uma Execução `queued`. Sem saldo, ou no limite mensal
-- de quem pediu, a Execução fecha como `insufficient_credits` e nada fica reservado.
create or replace function public.claim_agent_run(p_run_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run private.agent_runs%rowtype;
  v_conversation private.agent_conversations%rowtype;
  v_estimate integer;
begin
  select * into v_run from private.agent_runs r where r.id = p_run_id for update;
  if not found or v_run.status <> 'queued' then
    return null;
  end if;
  select * into v_conversation from private.agent_conversations c where c.id = v_run.conversation_id;
  if not exists (
    select 1 from public.workspace_memberships m
    where m.workspace_id = v_run.workspace_id and m.user_id = v_run.requested_by and m.active
  ) then
    perform private.append_run_event(p_run_id, 'falha', null, null, jsonb_build_object('motivo', 'membership_inactive'));
    update private.agent_runs
    set status = 'failed', error_code = 'membership_inactive', finished_at = clock_timestamp()
    where id = p_run_id;
    perform private.close_run_credits(p_run_id);
    return null;
  end if;
  -- Execução de Rotina cuja Rotina foi pausada ou apagada depois de entrar na fila (a corrida entre o relógio e o clique
  -- em "pausar"): fecha sem chamar o modelo. Apagada, o `routine_id` ficou nulo.
  if v_run.trigger_kind = 'rotina' and not exists (
    select 1 from private.agent_routines r where r.id = v_run.routine_id and not r.paused
  ) then
    perform private.append_run_event(p_run_id, 'falha', null, null, jsonb_build_object('motivo', 'routine_paused'));
    update private.agent_runs
    set status = 'failed', error_code = 'routine_paused', finished_at = clock_timestamp()
    where id = p_run_id;
    perform private.close_run_credits(p_run_id);
    return null;
  end if;

  if private.credits_enforced(v_run.workspace_id) then
    v_estimate := case
      when v_conversation.kind = 'coordenada' then 3
      else 1 + (
        select count(distinct a.id)::integer from private.agents a
        where a.workspace_id = v_run.workspace_id and a.id = any (v_run.mentions) and a.id is distinct from v_conversation.agent_id
      )
    end;
    begin
      perform public.reserve_credits(
        v_run.workspace_id, v_run.requested_by, 'agent_round', 'run:' || p_run_id::text, v_estimate,
        exists (select 1 from private.workspace_ai_keys k where k.workspace_id = v_run.workspace_id)
      );
    exception when others then
      if sqlerrm not in ('insufficient credits', 'monthly credit limit reached') then
        raise;
      end if;
      perform private.append_run_event(p_run_id, 'falha', null, null, jsonb_build_object('motivo', 'insufficient_credits'));
      update private.agent_runs
      set status = 'failed', error_code = 'insufficient_credits', finished_at = clock_timestamp()
      where id = p_run_id;
      perform private.close_run_credits(p_run_id);
      return null;
    end;
  end if;

  update private.agent_runs set status = 'running', started_at = clock_timestamp() where id = p_run_id;

  return jsonb_build_object(
    'run_id', v_run.id,
    'kind', v_conversation.kind,
    'workspace_name', (select w.name from public.workspaces w where w.id = v_run.workspace_id),
    'request_text', v_run.request_text,
    'agent_id', v_conversation.agent_id,
    'mentions', to_jsonb(v_run.mentions),
    'agents', coalesce((
      select jsonb_agg(jsonb_build_object(
          'id', a.id, 'name', a.name, 'specialty', a.specialty, 'kind', a.kind,
          'instructions', coalesce(s.instructions, ''), 'voice_tone', coalesce(s.voice_tone, '')
        ) order by (a.kind = 'criado'), c.position, a.created_at, a.id)
      from private.agents a
      join private.specialty_catalog c on c.specialty = a.specialty
      left join private.agent_settings s on s.agent_id = a.id
      where a.workspace_id = v_run.workspace_id
    ), '[]'::jsonb),
    'history', coalesce((
      select jsonb_agg(jsonb_build_object('request', h.request_text, 'answer', h.answer) order by h.created_at)
      from (
        select r.request_text, r.created_at,
          (select string_agg(coalesce(e.agent_name || ': ', '') || (e.payload ->> 'texto'), E'\n\n' order by e.seq)
           from private.agent_run_events e
           where e.run_id = r.id and e.kind in ('texto', 'resposta')) as answer
        from private.agent_runs r
        where r.conversation_id = v_run.conversation_id and r.status = 'succeeded' and r.id <> v_run.id
        order by r.created_at desc
        limit 10
      ) h
    ), '[]'::jsonb)
  );
end;
$$;

-- 5. A rodada de um Agente. Devolve:
--   free        a cobrança do Workspace está desligada: o Agente roda e nada é reservado;
--   go          o Agente roda: a rodada saiu da reserva de estimativa (ou reservou 1 crédito, se a estimativa acabou);
--   paid        esta rodada já foi paga: o Agente roda de novo sem cobrar;
--   no_credits  sem saldo, ou no limite mensal de quem pediu: o Agente não roda;
--   cap_reached Execução de Rotina: a rodada passa do que o relógio já somou ao teto, e o teto não a deixa abrir.
-- `reservation_id` é o que o motor devolve a end_agent_round: a reserva da rodada, ou a linha da rodada no caderno
-- quando ela saiu da estimativa (ou quando a cobrança está desligada e a Rotina conta as rodadas para o teto). A chave
-- da rodada continua sendo a Execução, o Agente e a rodada, então repetir a chamada nunca cobra duas vezes.
create or replace function public.begin_agent_round(
  p_run_id uuid, p_agent_id uuid, p_round integer, p_own_ai_key boolean default false
) returns table (outcome text, reservation_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_run private.agent_runs%rowtype;
  v_round integer := greatest(coalesce(p_round, 1), 1);
  v_key text;
  v_row private.agent_run_rounds%rowtype;
  v_existing private.credit_reservations%rowtype;
  v_estimate private.credit_reservations%rowtype;
  v_enforced boolean;
  v_rotina boolean;
  v_unit numeric;
  v_charged boolean := false;
  v_user uuid;
  v_id uuid;
  v_own boolean;
begin
  select * into v_run from private.agent_runs r where r.id = p_run_id;
  if not found then
    raise exception 'agent run not found' using errcode = 'P0002';
  end if;
  if not exists (select 1 from private.agents a where a.id = p_agent_id and a.workspace_id = v_run.workspace_id) then
    raise exception 'agent not found' using errcode = 'P0002';
  end if;
  v_enforced := private.credits_enforced(v_run.workspace_id);
  v_rotina := v_run.trigger_kind = 'rotina' and v_run.routine_id is not null;
  if not v_enforced and not v_rotina then
    return query select 'free'::text, null::uuid;
    return;
  end if;

  v_key := 'agent:' || p_run_id::text || ':' || p_agent_id::text || ':' || v_round::text;
  perform pg_advisory_xact_lock(hashtext('agent-round:' || v_key));
  select * into v_row from private.agent_run_rounds x
  where x.run_id = p_run_id and x.agent_id = p_agent_id and x.round = v_round;
  if found and v_row.status in ('open', 'done') then
    return query select
      case when not v_enforced then 'free' when v_row.status = 'done' then 'paid' else 'go' end,
      coalesce(v_row.reservation_id, v_row.id);
    return;
  end if;

  -- Execução de Rotina: a rodada além do que o relógio já somou ao teto consulta o teto antes de abrir. Batido o teto,
  -- a rodada não abre e o motor fecha a Execução sem chamar o modelo.
  if v_rotina and (
    select count(*) from private.agent_run_rounds x
    where x.run_id = p_run_id and not (x.agent_id = p_agent_id and x.round = v_round)
  ) >= private.routine_cap_rounds() then
    v_unit := private.agent_round_unit(v_run.workspace_id);
    if public.consume_automation_cap(v_run.workspace_id, 'rotina:' || v_run.routine_id::text, v_unit) <> 'ok' then
      return query select 'cap_reached'::text, null::uuid;
      return;
    end if;
    v_charged := true;
    update private.agent_runs set cap_extra = cap_extra + v_unit where id = p_run_id;
  end if;

  if not v_enforced then
    return query select 'free'::text, private.open_agent_round(p_run_id, p_agent_id, v_round, false, null);
    return;
  end if;

  -- Uma reserva da própria rodada (o motor antigo, ou a tentativa anterior): a reservada continua, a paga não cobra de
  -- novo, e a solta dá lugar a uma nova.
  select * into v_existing from private.credit_reservations r
  where r.workspace_id = v_run.workspace_id and r.action_key = v_key;
  if found then
    if v_existing.status = 'reserved' then
      perform private.open_agent_round(p_run_id, p_agent_id, v_round, false, v_existing.id);
      return query select 'go'::text, v_existing.id;
      return;
    elsif v_existing.status = 'settled' then
      perform private.open_agent_round(p_run_id, p_agent_id, v_round, false, v_existing.id, 'done');
      return query select 'paid'::text, v_existing.id;
      return;
    end if;
    delete from private.credit_reservations where id = v_existing.id;
  end if;

  -- A reserva de estimativa da Execução ainda tem rodada: esta sai dela, sem reservar de novo.
  select * into v_estimate from private.credit_reservations r
  where r.workspace_id = v_run.workspace_id and r.action_key = 'run:' || p_run_id::text and r.status = 'reserved';
  if found and (
    select count(*) from private.agent_run_rounds x
    where x.run_id = p_run_id and x.covered and x.status in ('open', 'done')
      and not (x.agent_id = p_agent_id and x.round = v_round)
  ) < v_estimate.quantity then
    return query select 'go'::text, private.open_agent_round(p_run_id, p_agent_id, v_round, true, null);
    return;
  end if;

  v_user := case when exists (
    select 1 from public.workspace_memberships m
    where m.workspace_id = v_run.workspace_id and m.user_id = v_run.requested_by and m.active
  ) then v_run.requested_by end;
  v_own := coalesce(p_own_ai_key, false)
    or exists (select 1 from private.workspace_ai_keys k where k.workspace_id = v_run.workspace_id);
  begin
    v_id := public.reserve_credits(v_run.workspace_id, v_user, 'agent_round', v_key, 1, v_own);
  exception when others then
    if sqlerrm in ('insufficient credits', 'monthly credit limit reached') then
      if v_charged then
        perform private.refund_automation_cap(v_run.workspace_id, 'rotina:' || v_run.routine_id::text, v_unit);
        update private.agent_runs set cap_extra = greatest(cap_extra - v_unit, 0) where id = p_run_id;
      end if;
      return query select 'no_credits'::text, null::uuid;
      return;
    end if;
    raise;
  end;
  perform private.open_agent_round(p_run_id, p_agent_id, v_round, false, v_id);
  return query select 'go'::text, v_id;
end;
$$;

-- Fecha a rodada: concluída, conta como feita (e a reserva própria, se houver, debita); falha, solta a reserva própria e
-- libera o lugar na estimativa. Repetir não faz nada. O id é o que begin_agent_round devolveu.
create or replace function public.end_agent_round(p_reservation_id uuid, p_success boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v private.credit_reservations%rowtype;
  v_round private.agent_run_rounds%rowtype;
  v_status text := case when p_success then 'done' else 'failed' end;
begin
  select * into v from private.credit_reservations r where r.id = p_reservation_id for update;
  if found then
    if v.status <> 'reserved' then
      return;
    end if;
    if p_success then
      perform public.settle_credits(v.id, null);
    else
      perform public.release_credits(v.id);
    end if;
    update private.agent_run_rounds set status = v_status, updated_at = clock_timestamp()
    where reservation_id = v.id and status = 'open';
    return;
  end if;
  select * into v_round from private.agent_run_rounds x where x.id = p_reservation_id for update;
  if not found then
    raise exception 'credit reservation not found' using errcode = 'P0002';
  end if;
  if v_round.status = 'open' then
    update private.agent_run_rounds set status = v_status, updated_at = clock_timestamp() where id = v_round.id;
  end if;
end;
$$;

-- 6. O acerto no fim. Mesma assinatura e mesmas regras de sempre; depois de fechar a Execução, acerta os créditos.
create or replace function public.finish_agent_run(p_run_id uuid, p_status text, p_error_code text, p_model text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run private.agent_runs%rowtype;
begin
  select * into v_run from private.agent_runs r where r.id = p_run_id for update;
  if not found or v_run.status <> 'running' then
    raise exception 'run is not running' using errcode = '55000';
  end if;
  if p_status = 'succeeded' then
    if not exists (select 1 from private.agent_run_events e where e.run_id = p_run_id and e.kind in ('texto', 'resposta')) then
      raise exception 'run has no answer' using errcode = '55000';
    end if;
  elsif p_status = 'failed' then
    if p_error_code is null or btrim(p_error_code) = '' then
      raise exception 'error code required' using errcode = '22023';
    end if;
    if not exists (select 1 from private.agent_run_events e where e.run_id = p_run_id and e.kind = 'falha') then
      perform private.append_run_event(p_run_id, 'falha', null, null, jsonb_build_object('motivo', p_error_code));
    end if;
  else
    raise exception 'invalid status' using errcode = '22023';
  end if;
  update private.agent_runs
  set status = p_status,
    error_code = case when p_status = 'failed' then p_error_code end,
    model = p_model,
    finished_at = clock_timestamp()
  where id = p_run_id;
  perform private.close_run_credits(p_run_id);
end;
$$;

-- Fecha como falha uma Execução travada que passou do prazo, e solta na hora o crédito que ela segurava (a faxina de
-- 2 horas fica como rede de segurança). Devolve se fechou.
create or replace function private.expire_run_if_stale(p_run_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run private.agent_runs%rowtype;
begin
  select * into v_run from private.agent_runs r where r.id = p_run_id for update;
  if v_run.status not in ('queued', 'running')
     or coalesce(v_run.started_at, v_run.created_at) > clock_timestamp() - private.agent_run_deadline() then
    return false;
  end if;
  perform private.append_run_event(p_run_id, 'falha', null, null, jsonb_build_object('motivo', 'timeout'));
  update private.agent_runs
  set status = 'failed', error_code = 'timeout', finished_at = clock_timestamp()
  where id = p_run_id;
  perform private.close_run_credits(p_run_id);
  return true;
end;
$$;
