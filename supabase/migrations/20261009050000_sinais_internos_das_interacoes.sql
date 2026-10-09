-- Sinais internos a partir das Interações reais (CRM-10).
--
-- Um Sinal interno sai do histórico comercial que o próprio Workspace grava (as Interações), sem fornecedor, sem Apify
-- e sem crédito (decisão do Renan em 08/10/2026). Dois tipos entram:
--   sem_resposta       o primeiro envio (e-mail ou mensagem) depois da última conversa completou o prazo sem resposta,
--                      ligação nem reunião. O silêncio é o acontecimento: a chave é esse primeiro envio, então os
--                      envios seguintes sem resposta não contam de novo, e um silêncio novo depois de uma resposta conta.
--   negociacao_parada  a Conta já conversou (resposta, ligação ou reunião) e a última Interação completou o prazo. A
--                      chave é essa última Interação.
-- "Proposta recusada" fica de fora: nenhuma Interação registra a recusa de uma proposta.
--
-- O catálogo dos Sinais reais vira um registro próprio (private.signal_catalog), com a origem de cada tipo; o registro
-- de actors (sinais-reais 01) continua dizendo qual actor atende cada Sinal externo e se ele está disponível. Monitoramento,
-- execução e Sinal encontrado são registros separados: cada avaliação de um Monitoramento interno grava uma execução
-- (private.signal_monitor_runs), e o Sinal guarda a Interação de origem e a execução que o encontrou. O mesmo
-- acontecimento conta uma vez e reencontrá-lo não renova o prazo; o Sinal novo deixa a Conta Quente por 30 dias, sem
-- mexer na Aderência (ADR-0007, pela private.record_signal de sempre).
--
-- O Monitoramento interno é avaliado na hora em que é salvo ou ligado como ativo e, depois, pelo relógio do banco a cada
-- `every_hours`. A varredura externa (signal-runner) e a "Buscar Sinais de novo" só olham os Sinais com actor, então
-- nunca chamam o Apify nem cobram crédito por um interno.

-- 1. O catálogo dos Sinais reais.
create table private.signal_catalog (
  signal_type text primary key check (signal_type ~ '^[a-z][a-z0-9_]{1,60}$'),
  origin text not null check (origin in ('externo', 'interno')),
  -- O estado de um Sinal interno. O externo segue o estado do actor dele em private.signal_actors e fica nulo aqui.
  state text check (state in ('available', 'testing', 'out')),
  created_at timestamptz not null default now(),
  check ((origin = 'externo') = (state is null))
);

alter table private.signal_catalog enable row level security;
revoke all on private.signal_catalog from public, anon, authenticated, service_role;

insert into private.signal_catalog (signal_type, origin) select a.signal_type, 'externo' from private.signal_actors a;
insert into private.signal_catalog (signal_type, origin, state) values
  ('sem_resposta', 'interno', 'available'),
  ('negociacao_parada', 'interno', 'available');

-- Um actor novo no registro entra no catálogo como externo, sem mudar quem cadastra actors; um actor nunca atende um
-- Sinal interno.
create function private.put_signal_actor_in_catalog()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from private.signal_catalog c where c.signal_type = new.signal_type and c.origin <> 'externo') then
    raise exception 'an actor cannot implement an internal signal' using errcode = '23514';
  end if;
  insert into private.signal_catalog (signal_type, origin) values (new.signal_type, 'externo')
  on conflict (signal_type) do nothing;
  return new;
end;
$$;

revoke all on function private.put_signal_actor_in_catalog() from public, anon, authenticated, service_role;

create trigger signal_actors_in_catalog
  before insert or update of signal_type on private.signal_actors
  for each row execute function private.put_signal_actor_in_catalog();

alter table private.signal_actors
  add constraint signal_actors_signal_type_catalog_fkey foreign key (signal_type) references private.signal_catalog(signal_type);
alter table private.signal_monitors drop constraint signal_monitors_signal_type_fkey;
alter table private.signal_monitors
  add constraint signal_monitors_signal_type_fkey foreign key (signal_type) references private.signal_catalog(signal_type);
alter table private.signals drop constraint signals_signal_type_fkey;
alter table private.signals
  add constraint signals_signal_type_fkey foreign key (signal_type) references private.signal_catalog(signal_type);

-- O catálogo como o cliente o vê: cada Sinal real, a origem e o estado (o do actor, para os externos).
create function public.list_signal_catalog()
returns table (signal_type text, origin text, state text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_user();
  return query
  select c.signal_type, c.origin, coalesce(c.state, a.state, 'out')
  from private.signal_catalog c
  left join private.signal_actors a on a.signal_type = c.signal_type
  order by c.origin, c.signal_type;
end;
$$;

revoke all on function public.list_signal_catalog() from public, anon;
grant execute on function public.list_signal_catalog() to authenticated;

-- A origem de um Sinal que aceita Monitoramento agora (interno disponível, ou externo com o actor disponível), ou nada.
create function private.available_signal_origin(p_signal_type text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select c.origin from private.signal_catalog c
  where c.signal_type = p_signal_type and (
    (c.origin = 'interno' and c.state = 'available')
    or (c.origin = 'externo' and exists (
      select 1 from private.signal_actors a where a.signal_type = c.signal_type and a.state = 'available')));
$$;

revoke all on function private.available_signal_origin(text) from public, anon, authenticated, service_role;

-- 2. As execuções. Cada avaliação de um Monitoramento grava uma, com o que avaliou e o que encontrou.
create table private.signal_monitor_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  monitor_id uuid not null,
  started_at timestamptz not null default clock_timestamp(),
  finished_at timestamptz,
  state text not null default 'rodando' check (state in ('rodando', 'concluida', 'falhou')),
  accounts_checked integer not null default 0 check (accounts_checked >= 0),
  signals_new integer not null default 0 check (signals_new >= 0),
  signals_repeated integer not null default 0 check (signals_repeated >= 0),
  -- O motivo da falha, em palavras do produto.
  error text check (error is null or length(error) <= 500),
  foreign key (workspace_id, monitor_id) references private.signal_monitors(workspace_id, id) on delete cascade
);

create index signal_monitor_runs_monitor_idx on private.signal_monitor_runs (workspace_id, monitor_id, started_at desc);

alter table private.signal_monitor_runs enable row level security;
revoke all on private.signal_monitor_runs from public, anon, authenticated, service_role;

-- O Sinal guarda a Interação de onde saiu (a Interação continua no histórico comercial) e a execução que o encontrou.
alter table private.signals
  add column origin_interaction_id uuid references public.account_interactions(id) on delete set null,
  add column run_id uuid references private.signal_monitor_runs(id) on delete set null;

create index signals_origin_interaction_idx on private.signals (origin_interaction_id) where origin_interaction_id is not null;
create index signals_run_idx on private.signals (run_id) where run_id is not null;

-- 3. A avaliação dos Sinais internos.
-- O prazo de um Monitoramento interno, em dias (1 a 365), ou nada quando os critérios não servem. O prazo é o único
-- critério: um campo que a avaliação não usa seria um filtro de mentira.
create function private.internal_signal_days(p_criteria jsonb)
returns integer
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_text text;
begin
  if p_criteria is null or jsonb_typeof(p_criteria) <> 'object'
    or exists (select 1 from jsonb_object_keys(p_criteria) k where k <> 'prazo') then
    return null;
  end if;
  v_text := case jsonb_typeof(p_criteria -> 'prazo')
    when 'number' then p_criteria ->> 'prazo'
    when 'string' then btrim(p_criteria ->> 'prazo')
  end;
  if v_text is null or v_text !~ '^[0-9]{1,3}$' then
    return null;
  end if;
  if v_text::integer not between 1 and 365 then
    return null;
  end if;
  return v_text::integer;
end;
$$;

-- O dia de uma Interação como as frases e as evidências o mostram.
create function private.signal_day(p_at timestamptz)
returns text
language sql
stable
set search_path = ''
as $$
  select to_char(p_at at time zone 'America/Sao_Paulo', 'DD/MM/YYYY');
$$;

revoke all on function private.internal_signal_days(jsonb) from public, anon, authenticated, service_role;
revoke all on function private.signal_day(timestamptz) from public, anon, authenticated, service_role;

-- Os Sinais internos que as Interações das Contas mostram agora: um por Conta, com a Interação de origem, a chave do
-- acontecimento, a frase e a evidência (sem dado pessoal: nem nome, nem e-mail, nem conteúdo). Conversa é o que veio da
-- Conta ou aconteceu com ela: e-mail ou mensagem recebidos, ligação e reunião.
create function private.internal_signal_candidates(p_workspace_id uuid, p_signal_type text, p_days integer, p_account_ids uuid[])
returns table (target_account_id uuid, interaction_id uuid, event_key text, phrase text, evidence text)
language sql
stable
security definer
set search_path = ''
as $$
  with interacoes as (
    select i.id, i.target_account_id, i.kind, i.occurred_at,
      i.kind in ('email-recebido', 'mensagem-recebida', 'ligacao', 'reuniao') as conversa
    from public.account_interactions i
    where i.workspace_id = p_workspace_id and i.target_account_id = any(p_account_ids)
  ),
  ultima_conversa as (
    select x.target_account_id, max(x.occurred_at) as em from interacoes x where x.conversa group by x.target_account_id
  ),
  -- O primeiro envio depois da última conversa (ou o primeiro de todos, se nunca houve conversa).
  silencio as (
    select distinct on (x.target_account_id) x.target_account_id, x.id, x.kind, x.occurred_at
    from interacoes x
    left join ultima_conversa u on u.target_account_id = x.target_account_id
    where not x.conversa and (u.em is null or x.occurred_at > u.em)
    order by x.target_account_id, x.occurred_at, x.id
  ),
  -- A última Interação de uma Conta que já conversou.
  parada as (
    select distinct on (x.target_account_id) x.target_account_id, x.id, x.kind, x.occurred_at
    from interacoes x
    join ultima_conversa u on u.target_account_id = x.target_account_id
    order by x.target_account_id, x.occurred_at desc, x.id desc
  )
  select s.target_account_id, s.id, 'sem_resposta|' || s.id::text,
    'Sem resposta desde ' || private.signal_day(s.occurred_at),
    format('Primeiro envio sem resposta: %s em %s. Nenhuma resposta, ligação ou reunião registrada desde então '
      '(prazo do Monitoramento: %s dias).',
      case s.kind when 'email-enviado' then 'e-mail' else 'mensagem' end, private.signal_day(s.occurred_at), p_days)
  from silencio s
  where p_signal_type = 'sem_resposta' and s.occurred_at <= now() - make_interval(days => p_days)
  union all
  select p.target_account_id, p.id, 'negociacao_parada|' || p.id::text,
    'Negociação parada desde ' || private.signal_day(p.occurred_at),
    format('Última Interação: %s em %s, depois de uma conversa com a Conta. Nenhuma Interação registrada desde então '
      '(prazo do Monitoramento: %s dias).',
      case p.kind
        when 'email-enviado' then 'e-mail enviado'
        when 'email-recebido' then 'e-mail recebido'
        when 'mensagem-enviada' then 'mensagem enviada'
        when 'mensagem-recebida' then 'mensagem recebida'
        when 'ligacao' then 'ligação'
        when 'reuniao' then 'reunião'
        else 'Interação'
      end,
      private.signal_day(p.occurred_at), p_days)
  from parada p
  where p_signal_type = 'negociacao_parada' and p.occurred_at <= now() - make_interval(days => p_days);
$$;

revoke all on function private.internal_signal_candidates(uuid, text, integer, uuid[]) from public, anon, authenticated, service_role;

-- Avalia um Monitoramento interno: grava a execução, um Sinal por acontecimento novo (o reencontro só fica anotado) e
-- agenda a próxima. Só as Contas do público que aceitam escrita (nem arquivadas, nem apagadas). Uma falha fica na
-- execução e no Monitoramento, sem Sinal pela metade, e a próxima tentativa vem em uma hora. Devolve a execução.
create function private.run_internal_signal_monitor(p_monitor_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v private.signal_monitors%rowtype;
  v_accounts uuid[];
  v_run uuid;
  v_days integer;
  v_new integer := 0;
  v_repeated integer := 0;
  v_falha constant text := 'Não foi possível avaliar as Interações. A próxima rodada tenta de novo.';
  c record;
begin
  select m.* into v from private.signal_monitors m
  join private.signal_catalog k on k.signal_type = m.signal_type and k.origin = 'interno'
  where m.id = p_monitor_id
  for update of m;
  if not found then
    raise exception 'internal monitor not found' using errcode = 'P0002';
  end if;

  select coalesce(array_agg(t.id order by t.name, t.id), '{}') into v_accounts
  from public.target_accounts t
  where t.workspace_id = v.workspace_id and t.archived_at is null and t.deleted_at is null
    and t.id::text in (select jsonb_array_elements_text(coalesce(v.audience -> 'accountIds', '[]'::jsonb)));

  insert into private.signal_monitor_runs (workspace_id, monitor_id, accounts_checked)
  values (v.workspace_id, v.id, cardinality(v_accounts))
  returning id into v_run;

  begin
    v_days := private.internal_signal_days(v.criteria);
    if v_days is null then
      raise exception 'invalid internal monitor criteria' using errcode = '22023';
    end if;
    for c in select * from private.internal_signal_candidates(v.workspace_id, v.signal_type, v_days, v_accounts) loop
      if private.record_signal(v.workspace_id, c.target_account_id, v.id, v.signal_type, c.event_key, c.phrase, now(),
        'Interações da Conta', c.evidence)
      then
        update private.signals g set origin_interaction_id = c.interaction_id, run_id = v_run
        where g.workspace_id = v.workspace_id and g.target_account_id = c.target_account_id
          and g.signal_type = v.signal_type and g.event_key = c.event_key;
        v_new := v_new + 1;
      else
        v_repeated := v_repeated + 1;
      end if;
    end loop;

    update private.signal_monitor_runs
    set state = 'concluida', finished_at = clock_timestamp(), signals_new = v_new, signals_repeated = v_repeated
    where id = v_run;
    update private.signal_monitors
    set last_run_at = now(), next_run_at = now() + make_interval(hours => every_hours), last_error = null
    where id = v.id;
  exception when others then
    raise warning 'internal signal monitor % failed: % (%)', v.id, sqlerrm, sqlstate;
    update private.signal_monitor_runs set state = 'falhou', finished_at = clock_timestamp(), error = v_falha
    where id = v_run;
    update private.signal_monitors set last_run_at = now(), next_run_at = now() + interval '1 hour', last_error = v_falha
    where id = v.id;
  end;
  return v_run;
end;
$$;

revoke all on function private.run_internal_signal_monitor(uuid) from public, anon, authenticated, service_role;

-- O relógio: avalia os Monitoramentos internos ativos e vencidos. Devolve quantos avaliou.
create function private.run_due_internal_signal_monitors(p_limit integer default 50)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v record;
  v_count integer := 0;
begin
  for v in
    select m.id from private.signal_monitors m
    join private.signal_catalog k on k.signal_type = m.signal_type and k.origin = 'interno' and k.state = 'available'
    where m.state = 'ativo' and m.next_run_at <= now()
    order by m.next_run_at, m.id
    limit least(greatest(coalesce(p_limit, 50), 1), 500)
    for update of m skip locked
  loop
    perform private.run_internal_signal_monitor(v.id);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

revoke all on function private.run_due_internal_signal_monitors(integer) from public, anon, authenticated, service_role;

-- 4. O Monitoramento aceita os Sinais internos. Redefinidas a partir da definição mais recente
-- (20260930180000_monitoramento_real_de_sinais.sql): o tipo vem do catálogo, o interno só aceita o prazo, e o interno
-- ativo é avaliado na hora, porque não custa crédito nem depende de fornecedor.
create or replace function public.save_signal_monitor(
  p_workspace_id uuid,
  p_id uuid,
  p_signal_type text,
  p_name text,
  p_state text,
  p_audience jsonb,
  p_criteria jsonb,
  p_every_hours integer default 24
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := private.require_active_membership(p_workspace_id);
  v_origin text := private.available_signal_origin(p_signal_type);
  v_existing private.signal_monitors%rowtype;
  v_id uuid;
begin
  if v_origin is null then
    raise exception 'signal type is not available' using errcode = '55000';
  end if;
  perform private.validate_signal_monitor(p_workspace_id, p_name, p_state, p_audience, p_criteria, p_every_hours);
  if v_origin = 'interno' and private.internal_signal_days(p_criteria) is null then
    raise exception 'invalid monitor' using errcode = '22023';
  end if;

  if p_id is null then
    insert into private.signal_monitors
      (workspace_id, signal_type, name, state, audience, criteria, every_hours, created_by, next_run_at)
    values (p_workspace_id, p_signal_type, btrim(p_name), p_state, p_audience, p_criteria, p_every_hours, auth.uid(),
            case when p_state = 'ativo' then now() end)
    returning id into v_id;
  else
    select * into v_existing from private.signal_monitors m where m.workspace_id = p_workspace_id and m.id = p_id for update;
    if not found then
      raise exception 'monitor not found' using errcode = 'P0002';
    end if;
    perform private.assert_can_change_monitor(v_role, v_existing.created_by);
    -- Pausar guarda a hora marcada: retomar antes dela não força uma rodada nova (nem um gasto de crédito).
    update private.signal_monitors set
      signal_type = p_signal_type, name = btrim(p_name), state = p_state, audience = p_audience, criteria = p_criteria,
      every_hours = p_every_hours, scan_offset = 0, updated_at = now(),
      next_run_at = case when p_state = 'ativo' then coalesce(next_run_at, now()) else next_run_at end
    where id = p_id;
    v_id := p_id;
  end if;

  if v_origin = 'interno' and p_state = 'ativo' then
    perform private.run_internal_signal_monitor(v_id);
  end if;
  return v_id;
end;
$$;

create or replace function public.set_signal_monitor_state(p_id uuid, p_state text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v private.signal_monitors%rowtype;
begin
  select * into v from private.signal_monitors m where m.id = p_id for update;
  if not found then
    raise exception 'monitor not found' using errcode = 'P0002';
  end if;
  perform private.assert_can_change_monitor(private.require_active_membership(v.workspace_id), v.created_by);
  perform private.validate_signal_monitor(v.workspace_id, v.name, p_state, v.audience, v.criteria, v.every_hours);
  update private.signal_monitors set
    state = p_state, updated_at = now(),
    next_run_at = case when p_state = 'ativo' then coalesce(next_run_at, now()) else next_run_at end
  where id = p_id;
  if p_state = 'ativo'
    and exists (select 1 from private.signal_catalog k where k.signal_type = v.signal_type and k.origin = 'interno')
  then
    perform private.run_internal_signal_monitor(p_id);
  end if;
end;
$$;

-- Os Monitoramentos do Workspace com a última execução de cada um (redefinida a partir de 20260930180000, com a coluna
-- last_run a mais).
drop function public.list_signal_monitors(uuid);

create function public.list_signal_monitors(p_workspace_id uuid)
returns table (
  id uuid, signal_type text, name text, state text, audience jsonb, criteria jsonb, every_hours integer,
  created_by uuid, last_run_at timestamptz, last_error text, created_at timestamptz, last_run jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_active_membership(p_workspace_id);
  return query
  select m.id, m.signal_type, m.name, m.state, m.audience, m.criteria, m.every_hours, m.created_by, m.last_run_at,
    m.last_error, m.created_at,
    (select jsonb_build_object(
        'state', x.state, 'startedAt', x.started_at, 'finishedAt', x.finished_at, 'accountsChecked', x.accounts_checked,
        'signalsNew', x.signals_new, 'signalsRepeated', x.signals_repeated)
     from private.signal_monitor_runs x
     where x.workspace_id = m.workspace_id and x.monitor_id = m.id
     order by x.started_at desc, x.id desc
     limit 1)
  from private.signal_monitors m where m.workspace_id = p_workspace_id
  order by m.created_at, m.id;
end;
$$;

revoke all on function public.list_signal_monitors(uuid) from public, anon;
grant execute on function public.list_signal_monitors(uuid) to authenticated;

-- 5. O relógio, onde o pg_cron existe (no Supabase e no CI). Onde não existe, nada é ligado.
do $cron$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron with schema pg_catalog;
    perform cron.schedule('althius-internal-signals', '*/15 * * * *', 'select private.run_due_internal_signal_monitors()');
  end if;
end
$cron$;
