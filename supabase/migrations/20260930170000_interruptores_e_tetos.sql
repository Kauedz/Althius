-- Os interruptores "confirmar ou automático" e os tetos mensais (creditos-e-planos, ticket 03, ADR-0019): por tipo de
-- ação (varredura de Sinais, enriquecimento, Agentes), por Agente e por Integração. Nada automático roda sem um teto
-- mensal aprovado pelo Administrador; chegou no teto, o automático pausa até o mês virar (ou o teto subir) e gera um
-- Aviso do Workspace para os Administradores. As Permissões Ler/Propor/Executar continuam só em `agent_permissions`
-- (CRM-13): a tela as lê de lá, sem cópia aqui.

-- Os Avisos do Workspace guardados (o primeiro tipo é o teto atingido). Quem os lê são os Administradores.
create table private.workspace_notices (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  kind text not null check (kind in ('teto_atingido')),
  title text not null check (length(title) between 1 and 200),
  body text not null check (length(body) between 1 and 1000),
  link text not null check (link like '/%'),
  created_at timestamptz not null default now()
);

create index workspace_notices_workspace_idx on private.workspace_notices (workspace_id, created_at desc);

-- Um interruptor: o escopo é "acao:varredura", "acao:enriquecimento", "acao:agentes", "agente:<uuid>" ou
-- "integracao:<id>". Sem linha, o escopo está em "confirmar".
create table private.automation_settings (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  scope text not null check (scope ~ '^(acao:(varredura|enriquecimento|agentes)|agente:[0-9a-f-]{36}|integracao:[a-z][a-z0-9-]*)$'),
  mode text not null default 'confirmar' check (mode in ('confirmar', 'automatico')),
  monthly_cap numeric(12, 2) check (monthly_cap > 0),
  paused_at timestamptz,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (workspace_id, scope),
  check (mode = 'confirmar' or monthly_cap is not null)
);

-- O que o automático de cada escopo já gastou no mês, em créditos.
create table private.automation_spend (
  workspace_id uuid not null,
  scope text not null,
  month date not null,
  spent numeric(12, 2) not null default 0 check (spent >= 0),
  primary key (workspace_id, scope, month),
  foreign key (workspace_id, scope) references private.automation_settings(workspace_id, scope) on delete cascade
);

alter table private.workspace_notices enable row level security;
alter table private.automation_settings enable row level security;
alter table private.automation_spend enable row level security;
revoke all on private.workspace_notices from public, anon, authenticated, service_role;
revoke all on private.automation_settings from public, anon, authenticated, service_role;
revoke all on private.automation_spend from public, anon, authenticated, service_role;

-- Os escopos do Workspace, com o nome da tela: os três tipos de ação, cada Agente e cada Integração do catálogo.
create function private.automation_scopes(p_workspace_id uuid)
returns table (scope text, kind text, name text, ordem integer)
language sql
stable
security definer
set search_path = ''
as $$
  select * from (values
    ('acao:varredura', 'acao', 'Varredura de Sinais', 1),
    ('acao:enriquecimento', 'acao', 'Enriquecimento', 2),
    ('acao:agentes', 'acao', 'Execuções de Agentes', 3)
  ) as a (scope, kind, name, ordem)
  union all
  select 'agente:' || g.id::text, 'agente', g.name, 100 + (row_number() over (order by g.created_at, g.id))::integer
  from private.agents g where g.workspace_id = p_workspace_id
  union all
  select 'integracao:' || i.id, 'integracao', i.name, 1000 + (row_number() over (order by i.name))::integer
  from private.integration_catalog i;
$$;

-- Por que o automático do escopo não roda agora (nulo quando roda): confirmar, sem_teto ou teto_atingido.
create function private.automation_block_reason(p_mode text, p_cap numeric, p_spent numeric, p_paused_at timestamptz)
returns text
language sql
stable
set search_path = ''
as $$
  select case
    when coalesce(p_mode, 'confirmar') = 'confirmar' then 'confirmar'
    when p_cap is null then 'sem_teto'
    when (p_paused_at is not null and p_paused_at >= date_trunc('month', now())) or coalesce(p_spent, 0) >= p_cap
      then 'teto_atingido'
  end;
$$;

revoke all on function private.automation_scopes(uuid) from public, anon, authenticated, service_role;
revoke all on function private.automation_block_reason(text, numeric, numeric, timestamptz) from public, anon, authenticated, service_role;

-- A página: cada escopo com o modo, o teto, o gasto do mês e o motivo de o automático não rodar. Todo participante lê.
create function public.list_automation_settings(p_workspace_id uuid)
returns table (
  scope text,
  kind text,
  name text,
  mode text,
  monthly_cap numeric,
  month_spent numeric,
  blocked_reason text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_active_membership(p_workspace_id);
  return query
  select s.scope, s.kind, s.name, coalesce(c.mode, 'confirmar'), c.monthly_cap, coalesce(g.spent, 0),
    private.automation_block_reason(c.mode, c.monthly_cap, g.spent, c.paused_at)
  from private.automation_scopes(p_workspace_id) s
  left join private.automation_settings c on c.workspace_id = p_workspace_id and c.scope = s.scope
  left join private.automation_spend g
    on g.workspace_id = p_workspace_id and g.scope = s.scope and g.month = date_trunc('month', now())::date
  order by s.ordem;
end;
$$;

-- O Administrador liga ou desliga o automático e aprova o teto. Automático sem teto é recusado. Subir o teto acima do
-- gasto do mês tira a pausa.
create function public.save_automation_setting(p_workspace_id uuid, p_scope text, p_mode text, p_monthly_cap numeric)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_spent numeric;
begin
  if private.require_active_membership(p_workspace_id) <> 'admin' then
    raise exception 'only administrators can change automation' using errcode = '42501';
  end if;
  if not exists (select 1 from private.automation_scopes(p_workspace_id) s where s.scope = p_scope) then
    raise exception 'unknown automation scope' using errcode = '22023';
  end if;
  if p_mode not in ('confirmar', 'automatico') then
    raise exception 'invalid automation mode' using errcode = '22023';
  end if;
  if p_monthly_cap is not null and p_monthly_cap <= 0 then
    raise exception 'invalid monthly cap' using errcode = '22023';
  end if;
  if p_mode = 'automatico' and p_monthly_cap is null then
    raise exception 'automatic mode requires an approved monthly cap' using errcode = '22023';
  end if;
  select g.spent into v_spent from private.automation_spend g
  where g.workspace_id = p_workspace_id and g.scope = p_scope and g.month = date_trunc('month', now())::date;
  insert into private.automation_settings (workspace_id, scope, mode, monthly_cap, updated_by)
  values (p_workspace_id, p_scope, p_mode, p_monthly_cap, auth.uid())
  on conflict (workspace_id, scope) do update set
    mode = excluded.mode,
    monthly_cap = excluded.monthly_cap,
    paused_at = case when excluded.monthly_cap > coalesce(v_spent, 0) then null else private.automation_settings.paused_at end,
    updated_by = excluded.updated_by,
    updated_at = now();
end;
$$;

-- Para o servidor, antes de uma ação automática: devolve 'ok' e soma o valor ao gasto do mês, ou o motivo de não rodar
-- (confirmar, sem_teto, teto_atingido) sem gastar nada. Passar do teto, ou chegar nele, pausa o escopo e avisa os
-- Administradores uma vez.
create function public.consume_automation_cap(p_workspace_id uuid, p_scope text, p_amount numeric)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v private.automation_settings%rowtype;
  v_month date := date_trunc('month', now())::date;
  v_spent numeric;
  v_reason text;
  v_name text;
begin
  if p_amount is null or p_amount < 0 then
    raise exception 'invalid amount' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtext('automation:' || p_workspace_id::text || ':' || p_scope));
  select * into v from private.automation_settings c where c.workspace_id = p_workspace_id and c.scope = p_scope;
  select g.spent into v_spent from private.automation_spend g
  where g.workspace_id = p_workspace_id and g.scope = p_scope and g.month = v_month;
  v_spent := coalesce(v_spent, 0);
  v_reason := private.automation_block_reason(v.mode, v.monthly_cap, v_spent, v.paused_at);
  if v_reason is not null then
    return v_reason;
  end if;

  if v_spent + p_amount > v.monthly_cap then
    v_reason := 'teto_atingido';
  else
    insert into private.automation_spend (workspace_id, scope, month, spent)
    values (p_workspace_id, p_scope, v_month, p_amount)
    on conflict (workspace_id, scope, month) do update set spent = private.automation_spend.spent + excluded.spent;
    v_spent := v_spent + p_amount;
  end if;

  if v_spent >= v.monthly_cap or v_reason is not null then
    update private.automation_settings set paused_at = now()
    where workspace_id = p_workspace_id and scope = p_scope;
    select s.name into v_name from private.automation_scopes(p_workspace_id) s where s.scope = p_scope;
    insert into private.workspace_notices (workspace_id, kind, title, body, link)
    values (p_workspace_id, 'teto_atingido', 'Teto mensal atingido: ' || v_name,
      'O automático de ' || v_name || ' chegou ao teto de ' || v.monthly_cap::text
        || ' créditos do mês e está pausado. Suba o teto ou espere o próximo mês.',
      '/configuracoes/automacao');
  end if;
  return coalesce(v_reason, 'ok');
end;
$$;

revoke all on function public.list_automation_settings(uuid) from public, anon;
revoke all on function public.save_automation_setting(uuid, text, text, numeric) from public, anon;
revoke all on function public.consume_automation_cap(uuid, text, numeric) from public, anon, authenticated;
grant execute on function public.list_automation_settings(uuid) to authenticated;
grant execute on function public.save_automation_setting(uuid, text, text, numeric) to authenticated;
grant execute on function public.consume_automation_cap(uuid, text, numeric) to service_role;

-- Os Avisos do Workspace guardados, para os Administradores, do mais novo ao mais antigo.
create function public.list_workspace_notices(p_workspace_id uuid, p_limit integer default 50)
returns table (id uuid, kind text, title text, body text, link text, created_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if private.require_active_membership(p_workspace_id) <> 'admin' then
    return;
  end if;
  return query
  select n.id, n.kind, n.title, n.body, n.link, n.created_at
  from private.workspace_notices n
  where n.workspace_id = p_workspace_id
  order by n.created_at desc, n.id desc
  limit least(greatest(coalesce(p_limit, 50), 1), 200);
end;
$$;

revoke all on function public.list_workspace_notices(uuid, integer) from public, anon;
grant execute on function public.list_workspace_notices(uuid, integer) to authenticated;
