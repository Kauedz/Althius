-- O resultado de cada mensagem enviada (motor-hermes, ticket 03). Cada Envio de passo guarda o desfecho observado:
-- sem resposta, resposta, resposta positiva, resposta negativa, reunião marcada e oportunidade. É o dado que diz o que
-- funciona num segmento. Tudo fica no Workspace: nada daqui alimenta a camada coletiva (ticket 05).
--
-- "Sem resposta" não é gravado: um Envio enviado sem linha aqui ainda não teve resposta. A linha nasce quando algo
-- acontece, e guarda quem classificou (o sistema, a pessoa ou um Agente) e quando. Uma resposta recebida registra
-- "resposta" sozinha; dizer que foi positiva, negativa, que marcou reunião ou virou oportunidade é da pessoa
-- responsável pela Sequência ou de um Agente. Resposta negativa conta como resposta, nunca como sucesso.

create table private.send_outcomes (
  send_id uuid primary key references private.sequence_step_sends(id) on delete cascade,
  workspace_id uuid not null,
  outcome text not null check (outcome in (
    'resposta', 'resposta_positiva', 'resposta_negativa', 'reuniao_marcada', 'oportunidade'
  )),
  classified_by_kind text not null check (classified_by_kind in ('sistema', 'pessoa', 'agente')),
  classified_by_user uuid references auth.users(id),
  classified_by_agent uuid,
  classified_at timestamptz not null default now(),
  check (
    (classified_by_kind = 'sistema' and classified_by_user is null and classified_by_agent is null)
    or (classified_by_kind = 'pessoa' and classified_by_user is not null and classified_by_agent is null)
    or (classified_by_kind = 'agente' and classified_by_agent is not null)
  )
);

create index send_outcomes_workspace_idx on private.send_outcomes (workspace_id, outcome);

alter table private.send_outcomes enable row level security;
revoke all on private.send_outcomes from public, anon, authenticated, service_role;

-- A resposta recebida registra "resposta" sozinha, sem rebaixar um desfecho que alguém já classificou.
create function private.outcome_on_reply()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.send_id is not null then
    insert into private.send_outcomes (send_id, workspace_id, outcome, classified_by_kind)
    values (new.send_id, new.workspace_id, 'resposta', 'sistema')
    on conflict (send_id) do nothing;
  end if;
  return null;
end;
$$;

revoke all on function private.outcome_on_reply() from public, anon, authenticated, service_role;

create trigger received_emails_outcome
  after insert on private.received_emails
  for each row execute function private.outcome_on_reply();

-- Regra comum de quem classifica: o Envio tem de existir, ter saído e o desfecho ser um dos conhecidos.
create function private.record_send_outcome(
  p_send_id uuid, p_outcome text, p_kind text, p_user uuid, p_agent uuid
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_send private.sequence_step_sends%rowtype;
begin
  if p_outcome is null or p_outcome not in (
    'resposta', 'resposta_positiva', 'resposta_negativa', 'reuniao_marcada', 'oportunidade'
  ) then
    raise exception 'unknown send outcome' using errcode = '22023';
  end if;
  select * into v_send from private.sequence_step_sends s where s.id = p_send_id;
  if not found then
    raise exception 'send not found' using errcode = 'P0002';
  end if;
  if v_send.status <> 'sent' then
    raise exception 'only a sent step has an outcome' using errcode = '55000';
  end if;
  if p_kind = 'pessoa' and not exists (
    select 1 from public.sequences q
    join public.workspace_memberships m on m.workspace_id = q.workspace_id and m.user_id = p_user and m.active
    where q.id = v_send.sequence_id and q.owner_user_id = p_user
  ) then
    raise exception 'only the sequence owner can classify its sends' using errcode = '42501';
  end if;
  if p_kind = 'agente' and not exists (
    select 1 from private.agents a where a.id = p_agent and a.workspace_id = v_send.workspace_id
  ) then
    raise exception 'agent not found' using errcode = 'P0002';
  end if;

  insert into private.send_outcomes (
    send_id, workspace_id, outcome, classified_by_kind, classified_by_user, classified_by_agent, classified_at
  ) values (p_send_id, v_send.workspace_id, p_outcome, p_kind, p_user, p_agent, now())
  on conflict (send_id) do update set
    outcome = excluded.outcome,
    classified_by_kind = excluded.classified_by_kind,
    classified_by_user = excluded.classified_by_user,
    classified_by_agent = excluded.classified_by_agent,
    classified_at = excluded.classified_at;
end;
$$;

revoke all on function private.record_send_outcome(uuid, text, text, uuid, uuid) from public, anon, authenticated, service_role;

-- A pessoa responsável pela Sequência diz o que aconteceu com um Envio.
create function public.set_send_outcome(p_send_id uuid, p_outcome text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  perform private.record_send_outcome(p_send_id, p_outcome, 'pessoa', auth.uid(), null);
end;
$$;

-- Um Agente classifica o desfecho de um Envio do Workspace dele. Só o servidor.
create function public.classify_send_outcome(p_send_id uuid, p_outcome text, p_agent_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.record_send_outcome(p_send_id, p_outcome, 'agente', null, p_agent_id);
end;
$$;

-- As taxas do Workspace por canal e segmento da Conta: quantos Envios saíram e quantos tiveram resposta, resposta
-- positiva, reunião e oportunidade. Sucesso é positiva, reunião ou oportunidade; negativa só conta como resposta.
-- Conta sem segmento aparece como "Sem segmento". "Abordagem" ainda não existe como dado (um passo não carrega
-- variante): fica para quando houver. Todo Participante ativo lê; só números, nenhum texto de mensagem.
create function public.send_outcome_rates(p_workspace_id uuid)
returns table (
  channel text, segment text, sent bigint, replied bigint, positive bigint, meetings bigint, opportunities bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_active_membership(p_workspace_id);
  return query
  select s.channel,
         coalesce(nullif(btrim(t.segment), ''), 'Sem segmento'),
         count(*)::bigint,
         count(o.send_id)::bigint,
         count(*) filter (where o.outcome in ('resposta_positiva', 'reuniao_marcada', 'oportunidade'))::bigint,
         count(*) filter (where o.outcome in ('reuniao_marcada', 'oportunidade'))::bigint,
         count(*) filter (where o.outcome = 'oportunidade')::bigint
  from private.sequence_step_sends s
  join public.sequences q on q.id = s.sequence_id
  left join public.target_accounts t on t.workspace_id = q.workspace_id and t.id = q.account_id
  left join private.send_outcomes o on o.send_id = s.id
  where s.workspace_id = p_workspace_id and s.status = 'sent'
  group by 1, 2
  order by 1, 2;
end;
$$;

revoke all on function public.set_send_outcome(uuid, text) from public, anon;
revoke all on function public.classify_send_outcome(uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.send_outcome_rates(uuid) from public, anon;
grant execute on function public.set_send_outcome(uuid, text) to authenticated;
grant execute on function public.classify_send_outcome(uuid, text, uuid) to service_role;
grant execute on function public.send_outcome_rates(uuid) to authenticated;
