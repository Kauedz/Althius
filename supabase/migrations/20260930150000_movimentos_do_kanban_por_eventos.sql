-- Os eventos movem o cartão do kanban (spec kanban-de-prospeccao, ticket 02). Cada evento tem um nome fixo e um
-- estágio de destino; `private.record_prospecting_event` é o gancho único que as specs donas chamam ao entregar o evento:
--
--   sinal_novo      → Quente        (sinais-reais 02, ao gravar um Sinal da Conta)
--   fit             → Fit           (enriquecimento/Aderência, ao marcar a Conta como Fit)
--   nao_fit         → Descartada    (idem, ao marcar Não fit)
--   primeiro_envio  → Em abordagem  (este ticket: gatilho em private.sequence_step_sends)
--   resposta        → Respondeu     (este ticket: gatilho em private.received_emails)
--   reuniao_marcada → Reunião       (canais/agenda, ao marcar a reunião)
--   enviada_ao_crm  → No CRM        (kanban 05, ao concluir o envio ao CRM)
--   sinais_vencidos → Descoberta    (sinais-reais 02, quando o último Sinal da Conta vence)
--
-- Os eventos de avanço só levam o cartão para a frente: um Sinal novo não tira uma Conta de Fit. Só "sinais_vencidos"
-- volta, e só antes da abordagem (a regra de `private.advance_prospecting_stage`). Envio e resposta entram por gatilho,
-- sem redefinir as funções de envio nem a ingestão de e-mail.

create function private.record_prospecting_event(p_workspace_id uuid, p_target_account_id uuid, p_event text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_stage text;
  v_current text;
begin
  v_stage := case p_event
    when 'sinal_novo' then 'quente'
    when 'fit' then 'fit'
    when 'nao_fit' then 'descartada'
    when 'primeiro_envio' then 'em_abordagem'
    when 'resposta' then 'respondeu'
    when 'reuniao_marcada' then 'reuniao'
    when 'enviada_ao_crm' then 'no_crm'
    when 'sinais_vencidos' then 'descoberta'
  end;
  if v_stage is null then
    raise exception 'unknown prospecting event' using errcode = '22023';
  end if;

  -- Os eventos de avanço não voltam o cartão, mesmo antes da abordagem.
  if p_event not in ('sinais_vencidos', 'nao_fit') then
    select coalesce(s.stage, 'descoberta') into v_current
    from public.target_accounts a
    left join private.prospecting_stages s on s.workspace_id = a.workspace_id and s.target_account_id = a.id
    where a.workspace_id = p_workspace_id and a.id = p_target_account_id;
    if v_current is not null and (
      select c.position from private.prospecting_stage_catalog c where c.stage = v_current
    ) >= (
      select c.position from private.prospecting_stage_catalog c where c.stage = v_stage
    ) then
      return false;
    end if;
  end if;

  return private.advance_prospecting_stage(p_workspace_id, p_target_account_id, v_stage, p_event);
end;
$$;

revoke all on function private.record_prospecting_event(uuid, uuid, text) from public, anon, authenticated, service_role;

-- A Conta-alvo real de uma Sequência, ou null quando o identificador é texto antigo sem Conta.
create function private.sequence_prospecting_account(p_sequence_id uuid)
returns table (workspace_id uuid, target_account_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select a.workspace_id, a.id
  from public.sequences s
  join public.target_accounts a on a.workspace_id = s.workspace_id and a.id::text = s.target_account_id
  where s.id = p_sequence_id;
$$;

revoke all on function private.sequence_prospecting_account(uuid) from public, anon, authenticated, service_role;

-- Um passo enviado: a Conta entra em Em abordagem (a partir do segundo envio, nada muda).
create function private.prospecting_on_step_sent()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v record;
begin
  if new.status = 'sent' and (tg_op = 'INSERT' or old.status is distinct from 'sent') then
    for v in select * from private.sequence_prospecting_account(new.sequence_id) loop
      perform private.record_prospecting_event(v.workspace_id, v.target_account_id, 'primeiro_envio');
    end loop;
  end if;
  return null;
end;
$$;

-- Uma resposta recebida: a Conta vai para Respondeu (se ainda não passou de lá).
create function private.prospecting_on_reply()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v record;
begin
  for v in select * from private.sequence_prospecting_account(new.sequence_id) loop
    perform private.record_prospecting_event(v.workspace_id, v.target_account_id, 'resposta');
  end loop;
  return null;
end;
$$;

revoke all on function private.prospecting_on_step_sent() from public, anon, authenticated, service_role;
revoke all on function private.prospecting_on_reply() from public, anon, authenticated, service_role;

create trigger sequence_step_sends_prospecting
  after insert or update of status on private.sequence_step_sends
  for each row execute function private.prospecting_on_step_sent();

create trigger received_emails_prospecting
  after insert on private.received_emails
  for each row execute function private.prospecting_on_reply();
