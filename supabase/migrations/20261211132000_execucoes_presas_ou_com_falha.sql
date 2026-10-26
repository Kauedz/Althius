-- Expira Execuções paradas sem depender de uma leitura, permite retomadas idempotentes e avisa
-- Administradores ativos quando uma Rotina acumula três falhas consecutivas.

alter table private.agent_runs add column retry_of uuid references private.agent_runs(id) on delete set null;
create index agent_runs_retry_of_idx on private.agent_runs(retry_of) where retry_of is not null;
create index agent_runs_stale_deadline_idx on private.agent_runs ((coalesce(started_at, created_at)), id)
  where status in ('queued', 'running');

create table private.agent_routine_failure_state (
  routine_id uuid primary key references private.agent_routines(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  failure_streak integer not null default 0 check (failure_streak >= 0),
  notice_sent boolean not null default false,
  updated_at timestamptz not null default clock_timestamp()
);
alter table private.agent_routine_failure_state enable row level security;
revoke all on private.agent_routine_failure_state from public, anon, authenticated, service_role;

create function private.routine_failure_alert_threshold()
returns integer language sql immutable security definer set search_path = '' as $$ select 3 $$;
revoke all on function private.routine_failure_alert_threshold() from public, anon, authenticated, service_role;

alter table private.workspace_notices drop constraint workspace_notices_kind_check;
alter table private.workspace_notices add constraint workspace_notices_kind_check
  check (kind in ('teto_atingido', 'automacao_retomada', 'sinal_pausado', 'sinal_rodada_pulada', 'rotina_falhando'));

-- Os dois prazos compartilham os 10 minutos; o código diferencia fila sem worker de motor interrompido.
create function private.expire_run_with_reason(p_run_id uuid, p_detalhar_motivo boolean)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_run private.agent_runs%rowtype;
  v_code text;
begin
  select * into v_run from private.agent_runs r where r.id = p_run_id for update;
  if not found or v_run.status not in ('queued', 'running')
     or coalesce(v_run.started_at, v_run.created_at) > clock_timestamp() - private.agent_run_deadline() then
    return false;
  end if;
  v_code := case when not p_detalhar_motivo then 'timeout'
    when v_run.status = 'queued' then 'timeout_queued' else 'timeout_running' end;
  perform private.append_run_event(p_run_id, 'falha', null, null, jsonb_build_object('motivo', v_code));
  update private.agent_runs set status = 'failed', error_code = v_code, finished_at = clock_timestamp()
  where id = p_run_id;
  perform private.close_run_credits(p_run_id);
  return true;
end;
$$;
revoke all on function private.expire_run_with_reason(uuid, boolean) from public, anon, authenticated, service_role;

-- Os callers já existentes conservam o código `timeout`; o novo relógio grava o estado exato da fila.
create or replace function private.expire_run_if_stale(p_run_id uuid)
returns boolean language sql security definer set search_path = '' as $$
  select private.expire_run_with_reason(p_run_id, false)
$$;
revoke all on function private.expire_run_if_stale(uuid) from public, anon, authenticated, service_role;

create function private.expire_stale_agent_runs()
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_run_id uuid;
  v_count integer := 0;
begin
  for v_run_id in
    select r.id from private.agent_runs r
    where r.status in ('queued', 'running')
      and coalesce(r.started_at, r.created_at) <= clock_timestamp() - private.agent_run_deadline()
    order by coalesce(r.started_at, r.created_at), r.id
  loop
    if private.expire_run_with_reason(v_run_id, true) then v_count := v_count + 1; end if;
  end loop;
  return v_count;
end;
$$;
revoke all on function private.expire_stale_agent_runs() from public, anon, authenticated, service_role;

do $$
begin
  if to_regclass('cron.job') is not null then
    perform cron.schedule('althius-stale-agent-runs', '*/5 * * * *', 'select private.expire_stale_agent_runs()');
  end if;
end;
$$;

create function public.list_agent_run_attention(p_workspace_id uuid, p_agent_id uuid default null)
returns table (
  id uuid, agent_id uuid, agent_name text, conversation_id uuid, trigger_kind text, routine_id uuid,
  status text, request_text text, result_text text, error_code text, created_at timestamptz, started_at timestamptz,
  finished_at timestamptz, retry_of uuid, retried_by uuid
)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_user_id uuid := private.require_user();
  v_role text := private.require_active_membership(p_workspace_id);
begin
  return query
    select r.id, c.agent_id, a.name, r.conversation_id, r.trigger_kind, r.routine_id, r.status,
      r.request_text, (select left(e.payload ->> 'texto', 280) from private.agent_run_events e
        where e.run_id = r.id and e.kind = 'resposta' and coalesce(e.payload ->> 'texto', '') <> ''
        order by e.seq desc limit 1), r.error_code, r.created_at, r.started_at, r.finished_at, r.retry_of,
      (select child.id from private.agent_runs child where child.retry_of = r.id order by child.created_at desc limit 1)
    from private.agent_runs r
    join private.agent_conversations c on c.workspace_id = r.workspace_id and c.id = r.conversation_id
    join private.agents a on a.workspace_id = c.workspace_id and a.id = c.agent_id
    where r.workspace_id = p_workspace_id and c.kind = 'agente'
      and (p_agent_id is null or c.agent_id = p_agent_id)
      and r.created_at >= clock_timestamp() - interval '14 days'
      and (c.owner_id = v_user_id or (v_role = 'admin' and r.trigger_kind = 'rotina'))
    order by r.created_at desc, r.id desc limit 100;
end;
$$;
revoke all on function public.list_agent_run_attention(uuid, uuid) from public, anon;
grant execute on function public.list_agent_run_attention(uuid, uuid) to authenticated;

create function public.retry_agent_run(p_run_id uuid, p_client_request_id uuid)
returns table (id uuid, status text)
language plpgsql security definer set search_path = '' as $$
declare
  v_user_id uuid := private.require_user();
  v_run private.agent_runs%rowtype;
  v_conversation private.agent_conversations%rowtype;
  v_role text;
  v_existing private.agent_runs%rowtype;
  v_id uuid;
begin
  if p_client_request_id is null then raise exception 'invalid request id' using errcode = '22023'; end if;
  select * into v_run from private.agent_runs r where r.id = p_run_id;
  if not found then raise exception 'run not found' using errcode = 'P0002'; end if;
  v_role := private.require_active_membership(v_run.workspace_id);
  select * into v_conversation from private.agent_conversations c
    where c.id = v_run.conversation_id and c.workspace_id = v_run.workspace_id;
  if not found or not (v_conversation.owner_id = v_user_id or
      (v_role = 'admin' and v_run.trigger_kind = 'rotina')) then
    raise exception 'not allowed to retry this run' using errcode = '42501';
  end if;
  select * into v_existing from private.agent_runs r
    where r.requested_by = v_user_id and r.client_request_id = p_client_request_id;
  if found then
    if v_existing.retry_of = p_run_id then return query select v_existing.id, v_existing.status; return; end if;
    raise exception 'request id already used' using errcode = '22023';
  end if;
  if v_run.status <> 'failed' or v_run.error_code = 'membership_inactive' then
    raise exception 'run cannot be retried' using errcode = '22023';
  end if;
  begin
    insert into private.agent_runs as inserted (
      workspace_id, conversation_id, requested_by, client_request_id, request_text, mentions,
      trigger_kind, routine_id, retry_of
    ) values (
      v_run.workspace_id, v_run.conversation_id, v_user_id, p_client_request_id, v_run.request_text, v_run.mentions,
      v_run.trigger_kind, v_run.routine_id, v_run.id
    ) returning inserted.id into v_id;
  exception when unique_violation then
    select * into v_existing from private.agent_runs r
      where r.requested_by = v_user_id and r.client_request_id = p_client_request_id;
    if found and v_existing.retry_of = p_run_id then
      return query select v_existing.id, v_existing.status;
      return;
    end if;
    raise exception 'conversation busy' using errcode = '55006';
  end;
  update private.agent_conversations c set updated_at = clock_timestamp() where c.id = v_run.conversation_id;
  return query select v_id, 'queued'::text;
end;
$$;
revoke all on function public.retry_agent_run(uuid, uuid) from public, anon;
grant execute on function public.retry_agent_run(uuid, uuid) to authenticated;

create function private.track_agent_routine_failure()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_name text;
  v_agent_name text;
  v_streak integer;
  v_sent boolean;
  v_body text;
begin
  if new.trigger_kind <> 'rotina' or new.routine_id is null or old.status = new.status then return new; end if;
  if new.status = 'succeeded' then
    update private.agent_routine_failure_state set failure_streak = 0, notice_sent = false, updated_at = clock_timestamp()
      where routine_id = new.routine_id;
    return new;
  end if;
  if new.status <> 'failed' or new.error_code in
      ('routine_paused', 'membership_inactive', 'insufficient_credits', 'automation_cap_reached', 'teto_atingido') then
    return new;
  end if;
  insert into private.agent_routine_failure_state (routine_id, workspace_id, failure_streak)
    values (new.routine_id, new.workspace_id, 1)
  on conflict (routine_id) do update set failure_streak = private.agent_routine_failure_state.failure_streak + 1,
    updated_at = clock_timestamp()
  returning failure_streak, notice_sent into v_streak, v_sent;
  if v_streak < private.routine_failure_alert_threshold() or v_sent then return new; end if;
  select r.task, a.name into v_name, v_agent_name from private.agent_routines r
    join private.agents a on a.id = r.agent_id and a.workspace_id = r.workspace_id where r.id = new.routine_id;
  v_body := case new.error_code
    when 'timeout_queued' then 'O motor dos Agentes não pegou a Execução.'
    when 'timeout_running' then 'O motor dos Agentes parou antes de concluir.'
    when 'timeout' then 'A Execução passou do tempo limite.'
    when 'model_refusal' then 'O modelo recusou o pedido.'
    when 'model_incomplete' then 'A resposta do modelo foi cortada.'
    when 'model_rate_limited' then 'O modelo está sobrecarregado.'
    when 'model_auth' then 'A chave do modelo não vale.'
    when 'model_timeout' then 'O modelo não respondeu a tempo.'
    when 'model_unreachable' then 'Não foi possível falar com o modelo.'
    when 'model_empty' then 'O modelo não respondeu com um resultado.'
    when 'hermes_unreachable' then 'O motor dos Agentes não respondeu.'
    when 'hermes_failed' then 'O motor dos Agentes não conseguiu concluir.'
    when 'workspace_ai_key_invalid' then 'A chave de IA do Workspace não vale.'
    when 'workspace_ai_key_unavailable' then 'A chave de IA do Workspace não está disponível.'
    when 'workspace_ai_key_unsupported' then 'O motor dos Agentes não aceita a chave de IA deste Workspace.'
    when 'internal_error' then 'A Execução encontrou um erro interno.'
    else 'A Execução terminou com falha. Código: ' || coalesce(new.error_code, 'desconhecido') || '.'
  end;
  insert into private.workspace_notices (workspace_id, kind, title, body, link)
    values (new.workspace_id, 'rotina_falhando', 'A Rotina falhou 3 vezes seguidas: ' || coalesce(v_name, v_agent_name, 'Agente'),
      v_body, '/agentes/' || (select agent_id::text from private.agent_routines where id = new.routine_id) || '/atividade');
  update private.agent_routine_failure_state set notice_sent = true, updated_at = clock_timestamp()
    where routine_id = new.routine_id;
  return new;
end;
$$;
revoke all on function private.track_agent_routine_failure() from public, anon, authenticated, service_role;
create trigger agent_routine_failure_notice after update of status on private.agent_runs
  for each row when (old.status is distinct from new.status) execute function private.track_agent_routine_failure();

create function private.reset_agent_routine_failure_on_resume()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.paused and not new.paused then
    update private.agent_routine_failure_state set failure_streak = 0, notice_sent = false, updated_at = clock_timestamp()
      where routine_id = new.id;
  end if;
  return new;
end;
$$;
revoke all on function private.reset_agent_routine_failure_on_resume() from public, anon, authenticated, service_role;
create trigger agent_routine_failure_resume after update of paused on private.agent_routines
  for each row when (old.paused and not new.paused) execute function private.reset_agent_routine_failure_on_resume();
