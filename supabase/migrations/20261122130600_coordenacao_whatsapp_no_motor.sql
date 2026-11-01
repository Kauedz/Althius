-- Coordenação do WhatsApp no motor (canais-06). A origem identifica quando a Execução de Canal deve
-- coordenar os Agentes habilitados em vez de manter o Agente único por fio do Slack.
alter table private.agent_conversations drop constraint if exists agent_conversations_origin_check;
alter table private.agent_conversations add constraint agent_conversations_origin_check
  check (origin in ('althius', 'slack', 'whatsapp'));

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

  if v_run.trigger_kind = 'rotina' and private.automation_contract_block(v_run.workspace_id) is not null then
    perform private.append_run_event(p_run_id, 'falha', null, null, jsonb_build_object('motivo', 'contrato_inativo'));
    update private.agent_runs
    set status = 'failed', error_code = 'contrato_inativo', finished_at = clock_timestamp()
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
    'trigger_kind', v_run.trigger_kind,
    'origin', v_conversation.origin,
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
        and (v_conversation.origin <> 'whatsapp' or 'whatsapp' = any(coalesce(s.channels, '{}'::text[])))
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
