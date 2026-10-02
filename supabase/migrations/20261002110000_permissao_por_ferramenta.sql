-- A Permissão por ferramenta do conector (ADR-0022, complementa a ADR-0002). Como nos conectores do Claude, cada
-- ferramenta que o servidor MCP de uma Integração oferece tem, no Workspace, uma de três regras, decididas pelo
-- Administrador: `sempre` (sempre permitir), `aprovacao` (pedir Aprovação) ou `bloqueada`. Sem linha, vale o padrão, que o
-- servidor aplica porque só ele sabe se a ferramenta escreve (o `tools/list` do servidor): leitura `sempre`, escrita ou
-- gasto `aprovacao`. A regra se soma à Permissão do Agente na Integração, sem enfraquecê-la:
--   Ler nunca escreve; `bloqueada` vence tudo; `aprovacao` exige uma Aprovação mesmo com Executar; `sempre` executa com
--   Executar e pede Aprovação com Propor.
--
-- Esta migration traz a tabela das regras, ler (Participação ativa) e definir (só Administrador), a leitura do servidor e
-- a Aprovação de ferramenta: `propose_agent_action` e `claim_approved_action` passam a conferir a regra quando o payload é
-- `{ tipo: 'ferramenta', integration_id, ferramenta, argumentos }`, e `tool_approval` é a leitura do executor. As outras
-- Aprovações (envio ao CRM, as demais) seguem exatamente como antes.

create table private.integration_tool_rules (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  integration_id text not null references private.integration_catalog(id),
  tool_name text not null check (tool_name = btrim(tool_name) and length(tool_name) between 1 and 200),
  rule text not null check (rule in ('sempre', 'aprovacao', 'bloqueada')),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (workspace_id, integration_id, tool_name)
);

create index integration_tool_rules_integration_idx on private.integration_tool_rules (integration_id);
create index integration_tool_rules_updated_by_idx on private.integration_tool_rules (updated_by);

alter table private.integration_tool_rules enable row level security;
revoke all on private.integration_tool_rules from public, anon, authenticated, service_role;

-- A regra definida para uma ferramenta, ou nulo (vale o padrão).
create function private.tool_rule(p_workspace_id uuid, p_integration_id text, p_tool_name text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select r.rule from private.integration_tool_rules r
  where r.workspace_id = p_workspace_id and r.integration_id = p_integration_id and r.tool_name = p_tool_name
$$;

revoke all on function private.tool_rule(uuid, text, text) from public, anon, authenticated, service_role;

-- As regras definidas numa Integração do Workspace, para quem participa dele. As ferramentas sem linha seguem o padrão.
create function public.list_integration_tool_rules(p_workspace_id uuid, p_integration_id text)
returns table (tool_name text, rule text, updated_by uuid, updated_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  perform private.require_active_membership(p_workspace_id);
  return query
    select r.tool_name, r.rule, r.updated_by, r.updated_at
    from private.integration_tool_rules r
    where r.workspace_id = p_workspace_id and r.integration_id = p_integration_id
    order by r.tool_name;
end;
$$;

-- O Administrador define a regra de uma ferramenta numa Integração ligada no Workspace; nulo volta ao padrão. Devolve a
-- regra que ficou.
create function public.set_integration_tool_rule(
  p_workspace_id uuid, p_integration_id text, p_tool_name text, p_rule text
) returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tool text := btrim(coalesce(p_tool_name, ''));
begin
  if private.require_active_membership(p_workspace_id) <> 'admin' then
    raise exception 'only administrators can set tool rules' using errcode = '42501';
  end if;
  if p_rule is not null and p_rule not in ('sempre', 'aprovacao', 'bloqueada') then
    raise exception 'unknown tool rule' using errcode = '22023';
  end if;
  if length(v_tool) not between 1 and 200 then
    raise exception 'invalid tool name' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.workspace_integrations w
    where w.workspace_id = p_workspace_id and w.integration_id = p_integration_id
  ) then
    raise exception 'integration not enabled' using errcode = '22023';
  end if;
  if p_rule is null then
    delete from private.integration_tool_rules r
    where r.workspace_id = p_workspace_id and r.integration_id = p_integration_id and r.tool_name = v_tool;
    return null;
  end if;
  insert into private.integration_tool_rules (workspace_id, integration_id, tool_name, rule, updated_by, updated_at)
  values (p_workspace_id, p_integration_id, v_tool, p_rule, auth.uid(), now())
  on conflict (workspace_id, integration_id, tool_name)
  do update set rule = excluded.rule, updated_by = excluded.updated_by, updated_at = excluded.updated_at;
  return p_rule;
end;
$$;

-- As regras para o servidor (a Edge Function, com a chave de serviço), que já conferiu quem pede: ele combina cada uma
-- com a Permissão do Agente antes de chamar uma ferramenta.
create function public.integration_tool_rules_for_use(p_workspace_id uuid, p_integration_id text)
returns table (tool_name text, rule text)
language sql
stable
security definer
set search_path = ''
as $$
  select r.tool_name, r.rule from private.integration_tool_rules r
  where r.workspace_id = p_workspace_id and r.integration_id = p_integration_id
  order by r.tool_name
$$;

-- A Aprovação de uma chamada de ferramenta como o executor a lê. Com `p_admin_user_id` (a execução pedida pela tela logo
-- depois de aprovar), ele precisa ser Administrador ativo do Workspace da Aprovação; sem ele, é o próprio motor, no
-- servidor. Uma Aprovação que não é de ferramenta não existe aqui (P0002).
create function public.tool_approval(p_approval_id uuid, p_admin_user_id uuid default null)
returns table (
  workspace_id uuid, agent_id uuid, integration_id text, requested_by uuid, state text, payload jsonb
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v private.approvals%rowtype;
begin
  select * into v from private.approvals a where a.id = p_approval_id;
  if v.id is null or v.payload ->> 'tipo' is distinct from 'ferramenta' then
    raise exception 'tool approval not found' using errcode = 'P0002';
  end if;
  if p_admin_user_id is not null and not exists (
    select 1 from public.workspace_memberships m
    where m.workspace_id = v.workspace_id and m.user_id = p_admin_user_id and m.active and m.role = 'admin'
  ) then
    raise exception 'only administrators can execute approvals' using errcode = '42501';
  end if;
  return query select v.workspace_id, v.agent_id, v.integration_id, v.requested_by, v.state, v.payload;
end;
$$;

-- `propose_agent_action` (corpo de 20261001130000) com a regra da ferramenta: numa chamada de ferramenta, `bloqueada`
-- recusa, e só `sempre` com Executar nasce liberada. Sem regra, uma Aprovação de ferramenta pede decisão (o servidor só
-- propõe o que precisa de Aprovação). Qualquer outro payload segue como antes.
create or replace function public.propose_agent_action(
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
  v_rule text;
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
  if p_payload ->> 'tipo' = 'ferramenta' then
    if p_payload ->> 'integration_id' is distinct from p_integration_id
      or length(btrim(coalesce(p_payload ->> 'ferramenta', ''))) not between 1 and 200
      or coalesce(jsonb_typeof(p_payload -> 'argumentos'), 'object') <> 'object' then
      raise exception 'invalid tool call payload' using errcode = '22023';
    end if;
    v_rule := coalesce(private.tool_rule(v_run.workspace_id, p_integration_id, p_payload ->> 'ferramenta'), 'aprovacao');
    if v_rule = 'bloqueada' then
      raise exception 'the tool is blocked in this workspace' using errcode = '42501';
    end if;
  end if;

  v_state := case when v_permission = 'executar' and coalesce(v_rule, 'sempre') = 'sempre' then 'aprovada' else 'pendente' end;
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

-- `claim_approved_action` (corpo de 20261001130000) com a regra da ferramenta conferida de novo antes de sair: bloqueada
-- não sai (`tool_blocked`), e a liberada pela Permissão só sai se a regra ainda for `sempre` (`tool_rule_changed`).
create or replace function public.claim_approved_action(p_approval_id uuid, p_payload jsonb)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v private.approvals%rowtype;
  v_permission text;
  v_rule text;
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
  if v.payload ->> 'tipo' = 'ferramenta' then
    v_rule := private.tool_rule(v.workspace_id, v.integration_id, v.payload ->> 'ferramenta');
    if v_rule = 'bloqueada' then
      return 'tool_blocked';
    end if;
    if v.decided_by_kind = 'permissao' and v_rule is distinct from 'sempre' then
      return 'tool_rule_changed';
    end if;
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

revoke all on function public.list_integration_tool_rules(uuid, text) from public, anon;
revoke all on function public.set_integration_tool_rule(uuid, text, text, text) from public, anon;
revoke all on function public.integration_tool_rules_for_use(uuid, text) from public, anon, authenticated;
revoke all on function public.tool_approval(uuid, uuid) from public, anon, authenticated;
revoke all on function public.propose_agent_action(uuid, uuid, text, text, jsonb, text, text, uuid) from public, anon, authenticated;
revoke all on function public.claim_approved_action(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.list_integration_tool_rules(uuid, text) to authenticated;
grant execute on function public.set_integration_tool_rule(uuid, text, text, text) to authenticated;
grant execute on function public.integration_tool_rules_for_use(uuid, text) to service_role;
grant execute on function public.tool_approval(uuid, uuid) to service_role;
grant execute on function public.propose_agent_action(uuid, uuid, text, text, jsonb, text, text, uuid) to service_role;
grant execute on function public.claim_approved_action(uuid, jsonb) to service_role;
