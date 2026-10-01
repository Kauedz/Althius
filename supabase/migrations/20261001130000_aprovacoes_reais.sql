-- Aprovações reais antes de ações externas (CRM-15, ADR-0002). Um Agente que quer agir numa Integração passa por aqui:
-- com a Permissão Ler, a ação é recusada; com Propor, nasce uma Aprovação pendente que um Administrador decide (decisão
-- do Nan, 2026-10-01: só o Administrador decide, e a pendente expira em 7 dias); com Executar, a Aprovação nasce já
-- liberada pela Permissão, para ficar auditada como as outras. Antes de executar, o servidor reserva a Aprovação e o
-- banco confere tudo de novo: a Participação de quem pediu, a Permissão do Agente, a Integração ligada no Workspace, o
-- prazo e o conteúdo exato (um payload diferente do revisado não sai). O fim da execução fica registrado (executada ou
-- falhou). Hoje nenhum executor externo existe; este é o contrato que ele vai usar.

create table private.approvals (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  agent_id uuid not null,
  integration_id text not null references private.integration_catalog(id),
  run_id uuid references private.agent_runs(id) on delete set null,
  requested_by uuid references auth.users(id) on delete set null,
  action text not null check (length(btrim(action)) between 1 and 300),
  impact text not null default '' check (length(impact) <= 1000),
  justification text not null default '' check (length(justification) <= 2000),
  payload jsonb not null default '{}'::jsonb,
  payload_hash text not null,
  target_account_id uuid,
  state text not null default 'pendente' check (state in (
    'pendente', 'aprovada', 'recusada', 'cancelada', 'expirada', 'executando', 'executada', 'falhou'
  )),
  -- Quem liberou: uma pessoa (pela decisão) ou a própria Permissão Executar do Agente.
  decided_by_kind text check (decided_by_kind in ('pessoa', 'permissao')),
  decided_by uuid references auth.users(id) on delete set null,
  decided_where text check (decided_where in ('fila', 'conversa', 'canal')),
  decided_at timestamptz,
  expires_at timestamptz not null default now() + interval '7 days',
  executed_at timestamptz,
  failure text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Como no glossário (Aprovação): excluir um Agente criado exclui as Aprovações dele, pendentes ou decididas.
  foreign key (workspace_id, agent_id) references private.agents (workspace_id, id) on delete cascade
);

create index approvals_workspace_idx on private.approvals (workspace_id, state, created_at desc);
create index approvals_pending_expiry_idx on private.approvals (expires_at) where state = 'pendente';
create index approvals_agent_idx on private.approvals (agent_id);
create index approvals_run_idx on private.approvals (run_id);

alter table private.approvals enable row level security;
revoke all on private.approvals from public, anon, authenticated, service_role;

-- Cada mudança de estado fica no histórico: quem, quando e de onde para onde.
create table private.approval_events (
  id bigint generated always as identity primary key,
  approval_id uuid not null references private.approvals(id) on delete cascade,
  from_state text,
  to_state text not null,
  actor_user_id uuid references auth.users(id) on delete set null,
  note text,
  created_at timestamptz not null default now()
);

create index approval_events_approval_idx on private.approval_events (approval_id, id);
alter table private.approval_events enable row level security;
revoke all on private.approval_events from public, anon, authenticated, service_role;

create function private.approval_payload_hash(p_payload jsonb)
returns text
language sql
immutable
set search_path = ''
as $$
  select md5(coalesce(p_payload, '{}'::jsonb)::text)
$$;

create function private.approval_transition(p_id uuid, p_from text, p_to text, p_actor uuid, p_note text)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into private.approval_events (approval_id, from_state, to_state, actor_user_id, note)
  values (p_id, p_from, p_to, p_actor, p_note);
$$;

revoke all on function private.approval_payload_hash(jsonb) from public, anon, authenticated, service_role;
revoke all on function private.approval_transition(uuid, text, text, uuid, text) from public, anon, authenticated, service_role;

-- As pendentes vencidas viram expiradas, com o evento. O relógio roda de hora em hora; as leituras também passam aqui.
create function private.expire_approvals()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v record;
  v_total integer := 0;
begin
  for v in
    update private.approvals set state = 'expirada', updated_at = now()
    where state = 'pendente' and expires_at <= now()
    returning id
  loop
    perform private.approval_transition(v.id, 'pendente', 'expirada', null, null);
    v_total := v_total + 1;
  end loop;
  return v_total;
end;
$$;

revoke all on function private.expire_approvals() from public, anon, authenticated, service_role;

-- O Agente propõe uma ação numa Integração. Só o servidor (a função que roda a Execução). Devolve o id e o desfecho:
--   pendente  Permissão Propor: espera a decisão de um Administrador;
--   liberada  Permissão Executar: já pode ser reservada e executada.
-- Com a Permissão Ler, ou sem Permissão para a Integração, a ação é recusada.
create function public.propose_agent_action(
  p_run_id uuid, p_agent_id uuid, p_integration_id text, p_action text, p_payload jsonb,
  p_impact text default '', p_justification text default '', p_target_account_id uuid default null
) returns table (approval_id uuid, outcome text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run private.agent_runs%rowtype;
  v_permission text;
  v_id uuid;
  v_state text;
begin
  select * into v_run from private.agent_runs r where r.id = p_run_id;
  if not found then
    raise exception 'agent run not found' using errcode = 'P0002';
  end if;
  if not exists (select 1 from private.agents a where a.id = p_agent_id and a.workspace_id = v_run.workspace_id) then
    raise exception 'agent not found' using errcode = 'P0002';
  end if;
  select p.permission into v_permission from private.agent_permissions p
  where p.agent_id = p_agent_id and p.integration_id = p_integration_id;
  if v_permission is null or v_permission = 'ler' then
    raise exception 'the agent may only read this integration' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.workspace_integrations w
    where w.workspace_id = v_run.workspace_id and w.integration_id = p_integration_id
  ) then
    raise exception 'integration not enabled in this workspace' using errcode = '55000';
  end if;

  v_state := case when v_permission = 'executar' then 'aprovada' else 'pendente' end;
  insert into private.approvals (
    workspace_id, agent_id, integration_id, run_id, requested_by, action, impact, justification, payload,
    payload_hash, target_account_id, state, decided_by_kind, decided_at
  ) values (
    v_run.workspace_id, p_agent_id, p_integration_id, p_run_id, v_run.requested_by, btrim(p_action),
    coalesce(p_impact, ''), coalesce(p_justification, ''), coalesce(p_payload, '{}'::jsonb),
    private.approval_payload_hash(p_payload), p_target_account_id, v_state,
    case when v_state = 'aprovada' then 'permissao' end, case when v_state = 'aprovada' then now() end
  ) returning id into v_id;
  perform private.approval_transition(v_id, null, v_state, null,
    case when v_state = 'aprovada' then 'liberada pela Permissão Executar' end);
  return query select v_id, case when v_state = 'aprovada' then 'liberada' else 'pendente' end;
end;
$$;

-- As Aprovações do Workspace, da mais nova à mais antiga. Todo Participante ativo vê a fila; as vencidas já aparecem
-- como expiradas.
create function public.list_approvals(p_workspace_id uuid)
returns table (
  id uuid, agent_id uuid, integration_id text, action text, impact text, justification text, payload jsonb,
  target_account_id uuid, state text, decided_by_kind text, decided_by uuid, decided_where text, decided_at timestamptz,
  expires_at timestamptz, executed_at timestamptz, failure text, created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_active_membership(p_workspace_id);
  perform private.expire_approvals();
  return query
    select a.id, a.agent_id, a.integration_id, a.action, a.impact, a.justification, a.payload, a.target_account_id,
      a.state, a.decided_by_kind, a.decided_by, a.decided_where, a.decided_at, a.expires_at, a.executed_at, a.failure,
      a.created_at
    from private.approvals a
    where a.workspace_id = p_workspace_id
    order by a.created_at desc, a.id;
end;
$$;

-- Um Administrador ativo aprova ou recusa uma pendente, na fila, na Conversa ou no Canal. Devolve o estado final:
-- aprovada, recusada ou, se o prazo já venceu, expirada (sem decisão).
create function public.decide_approval(p_approval_id uuid, p_decision text, p_where text default 'fila')
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v private.approvals%rowtype;
  v_to text;
begin
  if p_decision not in ('aprovar', 'recusar') then
    raise exception 'unknown decision' using errcode = '22023';
  end if;
  if p_where not in ('fila', 'conversa', 'canal') then
    raise exception 'unknown decision place' using errcode = '22023';
  end if;
  select * into v from private.approvals a where a.id = p_approval_id for update;
  if not found then
    raise exception 'approval not found' using errcode = 'P0002';
  end if;
  if private.require_active_membership(v.workspace_id) <> 'admin' then
    raise exception 'only administrators can decide approvals' using errcode = '42501';
  end if;
  if v.state = 'pendente' and v.expires_at <= now() then
    update private.approvals set state = 'expirada', updated_at = now() where id = v.id;
    perform private.approval_transition(v.id, 'pendente', 'expirada', null, null);
    return 'expirada';
  end if;
  if v.state <> 'pendente' then
    raise exception 'the approval was already decided' using errcode = '55000';
  end if;
  v_to := case when p_decision = 'aprovar' then 'aprovada' else 'recusada' end;
  update private.approvals set
    state = v_to, decided_by_kind = 'pessoa', decided_by = auth.uid(), decided_where = p_where, decided_at = now(),
    updated_at = now()
  where id = v.id;
  perform private.approval_transition(v.id, 'pendente', v_to, auth.uid(), null);
  return v_to;
end;
$$;

-- Quem pediu (ou um Administrador) cancela uma Aprovação que ainda não saiu.
create function public.cancel_approval(p_approval_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v private.approvals%rowtype;
  v_role text;
begin
  select * into v from private.approvals a where a.id = p_approval_id for update;
  if not found then
    raise exception 'approval not found' using errcode = 'P0002';
  end if;
  v_role := private.require_active_membership(v.workspace_id);
  if v_role <> 'admin' and v.requested_by is distinct from auth.uid() then
    raise exception 'only the requester or an administrator can cancel' using errcode = '42501';
  end if;
  if v.state not in ('pendente', 'aprovada') then
    raise exception 'the approval can no longer be cancelled' using errcode = '55000';
  end if;
  update private.approvals set state = 'cancelada', updated_at = now() where id = v.id;
  perform private.approval_transition(v.id, v.state, 'cancelada', auth.uid(), null);
end;
$$;

-- Logo antes de executar, o servidor reserva a Aprovação com o payload que vai mandar. O banco confere tudo de novo e
-- devolve o motivo quando não pode: 'go' reserva (estado executando); os outros desfechos não mudam nada, exceto o
-- prazo vencido, que vira expirada.
create function public.claim_approved_action(p_approval_id uuid, p_payload jsonb)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v private.approvals%rowtype;
  v_permission text;
begin
  select * into v from private.approvals a where a.id = p_approval_id for update;
  if not found then
    return 'not_found';
  end if;
  if v.state = 'pendente' and v.expires_at <= now() then
    update private.approvals set state = 'expirada', updated_at = now() where id = v.id;
    perform private.approval_transition(v.id, 'pendente', 'expirada', null, null);
    return 'expired';
  end if;
  if v.state <> 'aprovada' then
    return 'not_approved';
  end if;
  if private.approval_payload_hash(p_payload) <> v.payload_hash then
    return 'payload_changed';
  end if;
  select p.permission into v_permission from private.agent_permissions p
  where p.agent_id = v.agent_id and p.integration_id = v.integration_id;
  if v_permission is null or v_permission = 'ler'
    or (v.decided_by_kind = 'permissao' and v_permission <> 'executar') then
    return 'permission_revoked';
  end if;
  if not exists (
    select 1 from public.workspace_integrations w
    where w.workspace_id = v.workspace_id and w.integration_id = v.integration_id
  ) then
    return 'integration_disabled';
  end if;
  if v.requested_by is not null and not exists (
    select 1 from public.workspace_memberships m
    where m.workspace_id = v.workspace_id and m.user_id = v.requested_by and m.active
  ) then
    return 'requester_inactive';
  end if;
  if v.decided_by_kind = 'pessoa' and not exists (
    select 1 from public.workspace_memberships m
    where m.workspace_id = v.workspace_id and m.user_id = v.decided_by and m.active and m.role = 'admin'
  ) then
    return 'decider_inactive';
  end if;
  update private.approvals set state = 'executando', updated_at = now() where id = v.id;
  perform private.approval_transition(v.id, 'aprovada', 'executando', null, null);
  return 'go';
end;
$$;

-- O servidor registra o fim da execução reservada: executada ou falhou, com o motivo.
create function public.finish_approved_action(p_approval_id uuid, p_ok boolean, p_failure text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v private.approvals%rowtype;
  v_to text := case when p_ok then 'executada' else 'falhou' end;
begin
  select * into v from private.approvals a where a.id = p_approval_id for update;
  if not found then
    raise exception 'approval not found' using errcode = 'P0002';
  end if;
  if v.state <> 'executando' then
    raise exception 'the approval is not being executed' using errcode = '55000';
  end if;
  update private.approvals set
    state = v_to, executed_at = case when p_ok then now() end,
    failure = case when p_ok then null else left(coalesce(p_failure, 'falha sem motivo'), 500) end,
    updated_at = now()
  where id = v.id;
  perform private.approval_transition(v.id, 'executando', v_to, null, case when p_ok then null else left(p_failure, 500) end);
end;
$$;

-- O histórico de uma Aprovação, para quem participa do Workspace.
create function public.list_approval_events(p_approval_id uuid)
returns table (from_state text, to_state text, actor_user_id uuid, note text, created_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_workspace uuid;
begin
  select a.workspace_id into v_workspace from private.approvals a where a.id = p_approval_id;
  if not found then
    raise exception 'approval not found' using errcode = 'P0002';
  end if;
  perform private.require_active_membership(v_workspace);
  return query
    select e.from_state, e.to_state, e.actor_user_id, e.note, e.created_at
    from private.approval_events e where e.approval_id = p_approval_id order by e.id;
end;
$$;

revoke all on function public.propose_agent_action(uuid, uuid, text, text, jsonb, text, text, uuid) from public, anon, authenticated;
revoke all on function public.claim_approved_action(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.finish_approved_action(uuid, boolean, text) from public, anon, authenticated;
revoke all on function public.list_approvals(uuid) from public, anon;
revoke all on function public.decide_approval(uuid, text, text) from public, anon;
revoke all on function public.cancel_approval(uuid) from public, anon;
revoke all on function public.list_approval_events(uuid) from public, anon;
grant execute on function public.propose_agent_action(uuid, uuid, text, text, jsonb, text, text, uuid) to service_role;
grant execute on function public.claim_approved_action(uuid, jsonb) to service_role;
grant execute on function public.finish_approved_action(uuid, boolean, text) to service_role;
grant execute on function public.list_approvals(uuid) to authenticated;
grant execute on function public.decide_approval(uuid, text, text) to authenticated;
grant execute on function public.cancel_approval(uuid) to authenticated;
grant execute on function public.list_approval_events(uuid) to authenticated;

-- O relógio das expiradas, onde o pg_cron existe (no Supabase e no CI).
do $cron$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron with schema pg_catalog;
    perform cron.schedule('althius-expire-approvals', '7 * * * *', 'select private.expire_approvals()');
  end if;
end
$cron$;
