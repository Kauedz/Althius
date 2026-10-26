create or replace function public.claim_whatsapp_channel_delivery(p_run_id uuid)
returns table (status text, error_code text, answer text, phone text, within_window boolean)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_run private.agent_runs%rowtype;
  v_phone text;
  v_answer text;
  v_answer_prefixado text;
  v_within_window boolean;
  v_workspace_name text;
begin
  select * into v_run from private.agent_runs r where r.id = p_run_id for update;
  if not found or v_run.trigger_kind <> 'canal' or v_run.status not in ('succeeded', 'failed')
    or v_run.channel_posted_at is not null or v_run.channel_delivery_failed_at is not null
    or (v_run.channel_delivered_at is not null and v_run.channel_delivered_at > now() - interval '2 minutes')
    or not exists (select 1 from private.agent_conversations c where c.id = v_run.conversation_id and c.origin = 'whatsapp') then
    return;
  end if;
  select p.phone_e164 into v_phone from private.user_channel_phones p
  where p.user_id = v_run.requested_by and p.phone_e164 is not null and p.verified_at is not null;
  if v_phone is null or not exists (select 1 from private.whatsapp_channel_settings s where s.workspace_id = v_run.workspace_id and s.enabled) then
    update private.agent_runs r set channel_delivery_failed_at = now(), channel_delivery_error = 'canal_indisponivel' where r.id = p_run_id;
    return;
  end if;
  select w.name into v_workspace_name from public.workspaces w where w.id = v_run.workspace_id;
  select i.received_at >= now() - interval '24 hours' into v_within_window
  from private.whatsapp_last_inbound i
  where i.phone_hash = encode(extensions.digest(regexp_replace(v_phone, '\D', '', 'g'), 'sha256'), 'hex');
  v_within_window := coalesce(v_within_window, false);
  if v_run.status = 'failed' then
    select case coalesce(e.payload ->> 'motivo', v_run.error_code)
      when 'insufficient_credits' then 'Não foi possível responder: o Workspace está sem Créditos para este pedido, ou você chegou ao seu limite do mês. Avise o Administrador.'
      when 'contrato_inativo' then 'Não foi possível responder: este Workspace está sem contrato ativo na Althius.'
      when 'membership_inactive' then 'Não foi possível responder: você não participa mais deste Workspace.'
      when 'timeout' then 'O pedido passou do tempo e foi interrompido, sem resposta. Tente de novo.'
      else 'Não consegui terminar a resposta a este pedido. Tente de novo em instantes.'
    end into v_answer
    from private.agent_run_events e where e.run_id = p_run_id and e.kind = 'falha'
    order by e.seq desc limit 1;
    v_answer := coalesce(v_answer, 'Não consegui terminar a resposta a este pedido. Tente de novo em instantes.');
  else
    select string_agg(e.payload ->> 'texto', E'\n\n' order by e.seq) into v_answer
    from private.agent_run_events e where e.run_id = p_run_id and e.kind in ('texto', 'resposta')
      and coalesce(e.payload ->> 'texto', '') <> '';
  end if;
  v_answer := coalesce(v_answer, 'Não consegui terminar a resposta a este pedido. Tente de novo em instantes.');
  v_answer_prefixado := 'Em *' || coalesce(v_workspace_name, 'Workspace') || '*:' || E'\n' || v_answer;
  if not v_within_window and v_answer is not null then
    insert into private.whatsapp_pending_answers(user_id, run_id, answer)
    values (v_run.requested_by, p_run_id, v_answer)
    on conflict (user_id, run_id) do update set answer = excluded.answer, created_at = now();
  end if;
  update private.agent_runs r set channel_delivered_at = now(), channel_delivery_attempts = r.channel_delivery_attempts + 1 where r.id = p_run_id;
  return query select v_run.status, v_run.error_code, case when v_within_window then v_answer_prefixado else null end,
    v_phone, v_within_window;
end; $$;

create function public.claim_whatsapp_pending_answer_with_workspace(p_user_id uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare v_answer text; v_workspace_name text; v_run_id uuid;
begin
  with next_answer as (
    select p.user_id, p.run_id from private.whatsapp_pending_answers p
    where p.user_id = p_user_id order by p.created_at, p.run_id for update skip locked limit 1
  )
  delete from private.whatsapp_pending_answers p using next_answer n
  where p.user_id = n.user_id and p.run_id = n.run_id returning p.run_id, p.answer into v_run_id, v_answer;
  if v_run_id is null then return null; end if;
  select w.name into v_workspace_name
  from private.agent_runs r join private.agent_conversations c on c.id = r.conversation_id
  join public.workspaces w on w.id = c.workspace_id where r.id = v_run_id;
  return 'Em *' || coalesce(v_workspace_name, 'Workspace') || '*:' || E'\n' || v_answer;
end; $$;

revoke all on function public.claim_whatsapp_channel_delivery(uuid) from public, anon, authenticated;
grant execute on function public.claim_whatsapp_channel_delivery(uuid) to service_role;
revoke all on function public.claim_whatsapp_pending_answer_with_workspace(uuid) from public, anon, authenticated;
grant execute on function public.claim_whatsapp_pending_answer_with_workspace(uuid) to service_role;
