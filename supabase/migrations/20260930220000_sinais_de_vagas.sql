-- Sinais de vagas (sinais-reais, ticket 03): o LinkedIn e o Indeed Brasil ganham adaptador no signal-runner. A mesma
-- vaga nas duas fontes conta uma vez: a chave da vaga é a mesma nas duas (`vaga|empresa|cargo|mês`), e
-- `private.record_signal` passa a tratar a família `vaga|` como um acontecimento só, qualquer que seja o tipo de vaga.
-- Redefinida a partir da definição mais recente (20260930180000). O registro dos actors não muda aqui: preço, versão,
-- teto e "disponível" entram depois da execução real (passo do Nan, `.scratch/sinais-reais/registro-apos-o-teste.sql`).

create or replace function private.record_signal(
  p_workspace_id uuid,
  p_target_account_id uuid,
  p_monitor_id uuid,
  p_signal_type text,
  p_event_key text,
  p_phrase text,
  p_fired_at timestamptz,
  p_source text,
  p_evidence text
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inserted uuid;
  v_monitor_type text;
begin
  if p_fired_at is null or p_fired_at > now() + interval '1 day' then
    raise exception 'invalid signal date' using errcode = '22023';
  end if;
  perform private.assert_account_operable(p_workspace_id, p_target_account_id);
  if not exists (select 1 from public.target_accounts a where a.workspace_id = p_workspace_id and a.id = p_target_account_id) then
    raise exception 'target account not found' using errcode = 'P0002';
  end if;
  if p_monitor_id is not null then
    select m.signal_type into v_monitor_type from private.signal_monitors m
    where m.workspace_id = p_workspace_id and m.id = p_monitor_id;
    if not found then
      raise exception 'monitor not found' using errcode = 'P0002';
    end if;
    if v_monitor_type <> p_signal_type then
      raise exception 'the monitor does not match the signal type' using errcode = '22023';
    end if;
  end if;

  -- A vaga já encontrada por outra fonte de vagas é um reencontro: não conta de novo nem renova o prazo.
  if p_event_key like 'vaga|%' and p_signal_type like 'vaga\_%' then
    update private.signals set seen_again_at = now(), seen_again_monitor_id = p_monitor_id
    where workspace_id = p_workspace_id and target_account_id = p_target_account_id
      and signal_type like 'vaga\_%' and signal_type <> p_signal_type and event_key = p_event_key;
    if found then
      return false;
    end if;
  end if;

  insert into private.signals
    (workspace_id, target_account_id, monitor_id, signal_type, event_key, phrase, fired_at, source, evidence)
  values (p_workspace_id, p_target_account_id, p_monitor_id, p_signal_type, p_event_key, btrim(p_phrase), p_fired_at, p_source, p_evidence)
  on conflict (workspace_id, target_account_id, signal_type, event_key) do nothing
  returning id into v_inserted;

  if v_inserted is null then
    update private.signals set seen_again_at = now(), seen_again_monitor_id = p_monitor_id
    where workspace_id = p_workspace_id and target_account_id = p_target_account_id
      and signal_type = p_signal_type and event_key = p_event_key;
    return false;
  end if;
  if private.signal_is_valid(p_fired_at) then
    perform private.record_prospecting_event(p_workspace_id, p_target_account_id, 'sinal_novo');
  end if;
  return true;
end;
$$;

revoke all on function private.record_signal(uuid, uuid, uuid, text, text, text, timestamptz, text, text) from public, anon, authenticated, service_role;
