-- Os créditos das Execuções de Agentes (creditos-e-planos, ticket 04, ADR-0019): um Agente por rodada é um débito
-- (1 crédito; 20% quando o Workspace usa a chave de IA do próprio cliente). A rodada reserva antes de rodar e só debita
-- quando conclui, pelo contrato do ticket 02; sem saldo, a Execução falha com o motivo claro, sem resposta inventada.
--
-- A cobrança de um Workspace só liga quando ele assina (creditos-e-planos 06): até lá, os Agentes rodam livres, como
-- hoje, e nada é reservado. É por Workspace, então ligar um não muda o outro.

create table private.workspace_billing (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  credits_enforced boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table private.workspace_billing enable row level security;
revoke all on private.workspace_billing from public, anon, authenticated, service_role;

create function private.credits_enforced(p_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select b.credits_enforced from private.workspace_billing b where b.workspace_id = p_workspace_id), false);
$$;

revoke all on function private.credits_enforced(uuid) from public, anon, authenticated, service_role;

-- Liga ou desliga a cobrança de créditos do Workspace. Só o servidor (a assinatura, ticket 06).
create function public.set_credits_enforced(p_workspace_id uuid, p_enforced boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into private.workspace_billing (workspace_id, credits_enforced)
  values (p_workspace_id, coalesce(p_enforced, false))
  on conflict (workspace_id) do update set credits_enforced = excluded.credits_enforced, updated_at = now();
end;
$$;

-- Abre a rodada de um Agente numa Execução. Devolve:
--   free        a cobrança do Workspace está desligada: o Agente roda e nada é reservado;
--   go          reservou 1 crédito (ou já estava reservado nesta rodada): o Agente roda;
--   paid        esta rodada já foi paga: o Agente roda de novo sem cobrar;
--   no_credits  sem saldo, ou no limite mensal de quem pediu: o Agente não roda.
-- A chave é a Execução, o Agente e a rodada, então repetir a chamada nunca cobra duas vezes. Uma reserva já solta
-- (a tentativa anterior falhou) dá lugar a uma nova. Quem pediu e saiu do Workspace não trava: o crédito é do Workspace.
create function public.begin_agent_round(
  p_run_id uuid, p_agent_id uuid, p_round integer, p_own_ai_key boolean default false
) returns table (outcome text, reservation_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run private.agent_runs%rowtype;
  v_key text;
  v_existing private.credit_reservations%rowtype;
  v_user uuid;
  v_id uuid;
begin
  select * into v_run from private.agent_runs r where r.id = p_run_id;
  if not found then
    raise exception 'agent run not found' using errcode = 'P0002';
  end if;
  if not exists (select 1 from private.agents a where a.id = p_agent_id and a.workspace_id = v_run.workspace_id) then
    raise exception 'agent not found' using errcode = 'P0002';
  end if;
  if not private.credits_enforced(v_run.workspace_id) then
    return query select 'free'::text, null::uuid;
    return;
  end if;

  v_key := 'agent:' || p_run_id::text || ':' || p_agent_id::text || ':' || greatest(coalesce(p_round, 1), 1)::text;
  perform pg_advisory_xact_lock(hashtext('agent-round:' || v_key));
  select * into v_existing from private.credit_reservations r
  where r.workspace_id = v_run.workspace_id and r.action_key = v_key;
  if found then
    if v_existing.status = 'reserved' then
      return query select 'go'::text, v_existing.id;
      return;
    elsif v_existing.status = 'settled' then
      return query select 'paid'::text, v_existing.id;
      return;
    end if;
    delete from private.credit_reservations where id = v_existing.id;
  end if;

  v_user := case when exists (
    select 1 from public.workspace_memberships m
    where m.workspace_id = v_run.workspace_id and m.user_id = v_run.requested_by and m.active
  ) then v_run.requested_by end;
  begin
    v_id := public.reserve_credits(v_run.workspace_id, v_user, 'agent_round', v_key, 1, coalesce(p_own_ai_key, false));
  exception when others then
    if sqlerrm in ('insufficient credits', 'monthly credit limit reached') then
      return query select 'no_credits'::text, null::uuid;
      return;
    end if;
    raise;
  end;
  return query select 'go'::text, v_id;
end;
$$;

-- Fecha a rodada: concluída, debita o crédito; falha, solta a reserva. Repetir não faz nada.
create function public.end_agent_round(p_reservation_id uuid, p_success boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v private.credit_reservations%rowtype;
begin
  select * into v from private.credit_reservations r where r.id = p_reservation_id for update;
  if not found then
    raise exception 'credit reservation not found' using errcode = 'P0002';
  end if;
  if v.status <> 'reserved' then
    return;
  end if;
  if p_success then
    perform public.settle_credits(v.id, null);
  else
    perform public.release_credits(v.id);
  end if;
end;
$$;

revoke all on function public.set_credits_enforced(uuid, boolean) from public, anon, authenticated;
revoke all on function public.begin_agent_round(uuid, uuid, integer, boolean) from public, anon, authenticated;
revoke all on function public.end_agent_round(uuid, boolean) from public, anon, authenticated;
grant execute on function public.set_credits_enforced(uuid, boolean) to service_role;
grant execute on function public.begin_agent_round(uuid, uuid, integer, boolean) to service_role;
grant execute on function public.end_agent_round(uuid, boolean) to service_role;
