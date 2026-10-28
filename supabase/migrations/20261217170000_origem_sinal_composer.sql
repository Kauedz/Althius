-- Rastreia a entrada do Monitoramento sem alterar os dados existentes.
alter table private.signal_monitors
  add column created_via text not null default 'sinais_novo',
  add constraint signal_monitors_created_via_check check (created_via in ('sinais_novo', 'composer', 'modelo'));

-- A definição mais recente de save_signal_plan, com uma origem opcional no fim.
drop function public.save_signal_plan(uuid, text, text, jsonb, uuid);
create or replace function public.save_signal_plan(
  p_workspace_id uuid,
  p_name text,
  p_brief text,
  p_plan jsonb,
  p_monitor_id uuid default null,
  p_created_via text default 'sinais_novo'
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := private.require_active_membership(p_workspace_id);
  v_brief text := nullif(btrim(coalesce(p_brief, '')), '');
  v_existing private.signal_monitors%rowtype;
  v_id uuid;
  v_type text;
  v_audience jsonb;
  v_criteria jsonb;
  v_origin text;
  v_seed text;
begin
  if p_created_via not in ('sinais_novo', 'composer', 'modelo') then
    raise exception 'invalid signal creation origin' using errcode = '22023';
  end if;
  if v_brief is not null and length(v_brief) > private.signal_plan_limit('brief_max') then
    raise exception 'invalid signal plan' using errcode = '22023';
  end if;
  perform private.validate_signal_plan(p_workspace_id, p_plan);
  v_type := p_plan -> 'sinais' -> 0 ->> 'tipo';
  v_criteria := coalesce(p_plan -> 'sinais' -> 0 -> 'criterios', '{}'::jsonb);
  v_audience := jsonb_build_object('accountIds', p_plan -> 'escopo' -> 'contaIds');
  v_origin := p_plan ->> 'origem';
  v_seed := nullif(btrim(coalesce(p_plan ->> 'modeloId', '')), '');
  if p_monitor_id is null then
    perform private.validate_signal_monitor(p_workspace_id, p_name, 'rascunho', v_audience, v_criteria, 24);
    insert into private.signal_monitors
      (workspace_id, signal_type, name, state, audience, criteria, every_hours, created_by,
       brief, plan, plan_version, plan_origin, plan_seed, created_via)
    values (p_workspace_id, v_type, btrim(p_name), 'rascunho', v_audience, v_criteria, 24, auth.uid(),
            v_brief, p_plan, 1, v_origin, v_seed, p_created_via)
    returning id into v_id;
  else
    select * into v_existing from private.signal_monitors m where m.workspace_id = p_workspace_id and m.id = p_monitor_id for update;
    if not found then
      raise exception 'monitor not found' using errcode = 'P0002';
    end if;
    perform private.assert_can_change_monitor(v_role, v_existing.created_by);
    -- O Plano é só de Contas escolhidas: um Monitoramento de mercado não vira Plano por aqui.
    if private.monitor_scope(v_existing.audience) <> 'contas' then raise exception 'invalid signal plan' using errcode = '22023'; end if;
    perform private.validate_signal_monitor(p_workspace_id, p_name, v_existing.state, v_audience, v_criteria, v_existing.every_hours);
    update private.signal_monitors set
      signal_type = v_type, name = btrim(p_name), audience = v_audience, criteria = v_criteria, scan_offset = 0,
      brief = v_brief, plan = p_plan, plan_version = v_existing.plan_version + 1, plan_origin = v_origin,
      plan_seed = v_seed, updated_at = now()
    where id = p_monitor_id;
    v_id := p_monitor_id;
  end if;
  return v_id;
end;
$$;

revoke all on function public.save_signal_plan(uuid, text, text, jsonb, uuid, text) from public, anon;
grant execute on function public.save_signal_plan(uuid, text, text, jsonb, uuid, text) to authenticated;

drop function public.list_signal_monitors(uuid);
create function public.list_signal_monitors(p_workspace_id uuid)
returns table (
  id uuid, signal_type text, name text, state text, audience jsonb, criteria jsonb, every_hours integer,
  created_by uuid, last_run_at timestamptz, last_error text, created_at timestamptz, last_run jsonb,
  brief text, plan jsonb, plan_version integer, plan_origin text,
  schedule jsonb, next_run_at timestamptz, daily_credit_cap integer, consecutive_skips integer, paused_reason text,
  created_via text
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  perform private.require_active_membership(p_workspace_id);
  return query
  select m.id, m.signal_type, m.name, m.state, m.audience, m.criteria, m.every_hours, m.created_by, m.last_run_at,
    m.last_error, m.created_at,
    (select jsonb_build_object('state', x.state, 'startedAt', x.started_at, 'finishedAt', x.finished_at,
      'accountsChecked', x.accounts_checked, 'signalsNew', x.signals_new, 'signalsRepeated', x.signals_repeated)
     from private.signal_monitor_runs x where x.workspace_id = m.workspace_id and x.monitor_id = m.id
     order by x.started_at desc, x.id desc limit 1),
    m.brief, m.plan, m.plan_version, m.plan_origin, m.schedule, m.next_run_at,
    m.daily_credit_cap, m.consecutive_skips, m.paused_reason, m.created_via
  from private.signal_monitors m where m.workspace_id = p_workspace_id order by m.created_at, m.id;
end;
$$;
revoke all on function public.list_signal_monitors(uuid) from public, anon;
grant execute on function public.list_signal_monitors(uuid) to authenticated;
