-- A chave de IA do cliente (creditos-e-planos, ticket 08, ADR-0019). No setup, a Althius liga ao Workspace a chave de API
-- do provedor de IA que o cliente preferir. A chave fica cifrada no Vault do Supabase e nunca chega ao navegador: o banco
-- guarda só o nome do segredo, e só o servidor (a função que roda a Execução) a lê, por uma função de serviço. As
-- Execuções desse Workspace usam o modelo do cliente e a rodada de um Agente custa 20% do crédito (a orquestração é o
-- que a Althius ainda entrega).
--
-- Quem cadastra o segredo no Vault é o Nan, pelo painel do Supabase, durante o setup (nunca pelo chat); depois liga o
-- segredo ao Workspace com `public.set_workspace_ai_key`.

create table private.workspace_ai_keys (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  provider text not null check (provider in ('anthropic')),
  model text not null check (length(btrim(model)) between 1 and 100),
  -- O nome do segredo no Vault; a chave em si nunca fica nesta tabela.
  secret_name text not null check (length(btrim(secret_name)) between 1 and 200),
  updated_at timestamptz not null default now()
);

alter table private.workspace_ai_keys enable row level security;
revoke all on private.workspace_ai_keys from public, anon, authenticated, service_role;

-- Liga (ou troca) a chave do Workspace: o provedor, o modelo e o nome do segredo que já está no Vault. Só o servidor.
create function public.set_workspace_ai_key(p_workspace_id uuid, p_provider text, p_model text, p_secret_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_provider is distinct from 'anthropic' then
    raise exception 'unsupported ai provider' using errcode = '22023';
  end if;
  if p_model is null or btrim(p_model) = '' then
    raise exception 'model is required' using errcode = '22023';
  end if;
  if not exists (select 1 from public.workspaces w where w.id = p_workspace_id) then
    raise exception 'workspace not found' using errcode = 'P0002';
  end if;
  if p_secret_name is null or btrim(p_secret_name) = ''
    or not exists (select 1 from vault.secrets s where s.name = p_secret_name) then
    raise exception 'vault secret not found' using errcode = 'P0002';
  end if;
  insert into private.workspace_ai_keys (workspace_id, provider, model, secret_name)
  values (p_workspace_id, p_provider, btrim(p_model), p_secret_name)
  on conflict (workspace_id) do update set
    provider = excluded.provider, model = excluded.model, secret_name = excluded.secret_name, updated_at = now();
end;
$$;

-- Tira a chave do Workspace: ele volta ao modelo e ao preço da Althius. O segredo continua no Vault até o Nan apagá-lo
-- pelo painel. Só o servidor.
create function public.remove_workspace_ai_key(p_workspace_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from private.workspace_ai_keys where workspace_id = p_workspace_id;
$$;

-- Para a função que roda a Execução: o provedor, o modelo e a chave do cliente do Workspace dela, ou nenhuma linha
-- quando o Workspace usa o modelo da Althius. Chave ligada mas sem valor no Vault falha com motivo, em vez de a Execução
-- cair no modelo da Althius às custas dela. Só o servidor; a chave nunca é gravada nem devolvida a outro lugar.
create function public.agent_run_ai_key(p_run_id uuid)
returns table (provider text, model text, api_key text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workspace uuid;
  v_config private.workspace_ai_keys%rowtype;
  v_secret text;
begin
  select r.workspace_id into v_workspace from private.agent_runs r where r.id = p_run_id;
  if not found then
    raise exception 'agent run not found' using errcode = 'P0002';
  end if;
  select * into v_config from private.workspace_ai_keys k where k.workspace_id = v_workspace;
  if not found then
    return;
  end if;
  select s.decrypted_secret into v_secret from vault.decrypted_secrets s where s.name = v_config.secret_name;
  if v_secret is null or btrim(v_secret) = '' then
    raise exception 'workspace ai key unavailable' using errcode = '55000';
  end if;
  return query select v_config.provider, v_config.model, btrim(v_secret);
end;
$$;

-- Para um motor que não sabe usar a chave do cliente (o worker do Hermes): só se o Workspace da Execução tem uma, sem
-- tirar a chave do Vault. Só o servidor.
create function public.agent_run_uses_own_ai_key(p_run_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workspace uuid;
begin
  select r.workspace_id into v_workspace from private.agent_runs r where r.id = p_run_id;
  if not found then
    raise exception 'agent run not found' using errcode = 'P0002';
  end if;
  return exists (select 1 from private.workspace_ai_keys k where k.workspace_id = v_workspace);
end;
$$;

revoke all on function public.set_workspace_ai_key(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.remove_workspace_ai_key(uuid) from public, anon, authenticated;
revoke all on function public.agent_run_ai_key(uuid) from public, anon, authenticated;
revoke all on function public.agent_run_uses_own_ai_key(uuid) from public, anon, authenticated;
grant execute on function public.set_workspace_ai_key(uuid, text, text, text) to service_role;
grant execute on function public.remove_workspace_ai_key(uuid) to service_role;
grant execute on function public.agent_run_ai_key(uuid) to service_role;
grant execute on function public.agent_run_uses_own_ai_key(uuid) to service_role;

-- Abre a rodada de um Agente numa Execução. Redefinida a partir da definição mais recente
-- (20260930190000_creditos_das_execucoes_de_agentes.sql): a rodada de um Workspace com a chave de IA do próprio cliente
-- custa 20% do normal sem o chamador precisar dizê-lo, então o preço e o modelo saem da mesma fonte. Devolve:
--   free        a cobrança do Workspace está desligada: o Agente roda e nada é reservado;
--   go          reservou o crédito (ou já estava reservado nesta rodada): o Agente roda;
--   paid        esta rodada já foi paga: o Agente roda de novo sem cobrar;
--   no_credits  sem saldo, ou no limite mensal de quem pediu: o Agente não roda.
create or replace function public.begin_agent_round(
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
  v_own boolean;
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
  v_own := coalesce(p_own_ai_key, false)
    or exists (select 1 from private.workspace_ai_keys k where k.workspace_id = v_run.workspace_id);
  begin
    v_id := public.reserve_credits(v_run.workspace_id, v_user, 'agent_round', v_key, 1, v_own);
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
