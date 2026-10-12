-- Rotinas que rodam sozinhas (orquestracao, ticket 01). As Rotinas dos Agentes eram só cadastro: nenhum executor as
-- rodava. O pg_cron passa a criar uma Execução do tipo `rotina` na mesma fila de private.agent_runs quando chega a hora
-- de cada Rotina ativa; o worker do Hermes e a agent-conversation não mudam, porque `list_queued_agent_runs` já lista
-- tudo que está `queued` e `claim_agent_run` já reserva uma vez só. Cada Rotina tem um teto mensal de Créditos próprio
-- (o escopo `rotina:<id>` da página de Automação e tetos), que o Administrador aprova; sem ele a Rotina não roda.
-- Fuso fixo America/Sao_Paulo, como a Sequência.
--
-- O dono da Rotina é quem a criou: a Execução é pedida por ele, numa Conversa dele com o Agente (uma Conversa por
-- Rotina, criada no primeiro disparo). A Rotina sem dono ativo no Workspace não roda e fica pausada.

-- 1. O que a Rotina precisa para ser agendada. Quem já existia ganha o dono (quem a gravou por último) e, se mensal,
-- o dia 1, que a tela ainda não pedia.
alter table private.agent_routines
  add column owner_id uuid references auth.users(id) on delete set null,
  add column day_of_month integer check (day_of_month between 1 and 28),
  add column next_run_at timestamptz,
  add column last_fired_at timestamptz,
  add column conversation_id uuid references private.agent_conversations(id) on delete set null;

update private.agent_routines set owner_id = updated_by, day_of_month = case when frequency = 'mensal' then 1 end;

alter table private.agent_routines
  add constraint agent_routines_day_by_frequency_check check ((frequency = 'mensal') = (day_of_month is not null));

create index agent_routines_owner_idx on private.agent_routines (owner_id);
create index agent_routines_conversation_idx on private.agent_routines (conversation_id);
create index agent_routines_due_idx on private.agent_routines (next_run_at) where not paused;

comment on table private.agent_routines is
  'As Rotinas: tarefas agendadas do Agente. O relógio (private.enqueue_due_agent_routines, pg_cron a cada 5 minutos) cria a Execução quando next_run_at vence.';

-- O que uma Execução diz de quem a originou: o pedido de uma pessoa (conversa) ou o relógio de uma Rotina. A Rotina
-- apagada deixa `routine_id` nulo, para o histórico sobreviver a ela.
alter table private.agent_runs
  add column trigger_kind text not null default 'conversa' check (trigger_kind in ('conversa', 'rotina')),
  add column routine_id uuid references private.agent_routines(id) on delete set null,
  add constraint agent_runs_routine_check check (routine_id is null or trigger_kind = 'rotina');

create index agent_runs_routine_idx on private.agent_runs (routine_id) where routine_id is not null;

-- 2. O próximo horário de uma Rotina depois de p_from, na hora de Brasília: sempre no futuro (um horário em ponto já
-- passou). Semanal pelo dia da semana, mensal pelo dia do mês (de 1 a 28, que existe em todo mês).
create function private.next_routine_run(
  p_frequency text, p_weekday text, p_time text, p_day_of_month integer, p_from timestamptz
)
returns timestamptz
language plpgsql
stable
set search_path = ''
as $$
declare
  v_local timestamp := p_from at time zone 'America/Sao_Paulo';
  v_time time := p_time::time;
  v_candidate timestamp;
  v_weekday integer;
begin
  if p_frequency = 'diaria' then
    v_candidate := v_local::date + v_time;
    if v_candidate <= v_local then
      v_candidate := v_candidate + interval '1 day';
    end if;
  elsif p_frequency = 'semanal' then
    v_weekday := case p_weekday
      when 'domingo' then 0 when 'segunda' then 1 when 'terça' then 2 when 'quarta' then 3
      when 'quinta' then 4 when 'sexta' then 5 when 'sábado' then 6
    end;
    v_candidate := (v_local::date + ((v_weekday - extract(dow from v_local)::integer + 7) % 7)) + v_time;
    if v_candidate <= v_local then
      v_candidate := v_candidate + interval '7 days';
    end if;
  elsif p_frequency = 'mensal' then
    v_candidate := (date_trunc('month', v_local)::date + (p_day_of_month - 1)) + v_time;
    if v_candidate <= v_local then
      v_candidate := ((date_trunc('month', v_local) + interval '1 month')::date + (p_day_of_month - 1)) + v_time;
    end if;
  else
    raise exception 'invalid frequency' using errcode = '22023';
  end if;
  return v_candidate at time zone 'America/Sao_Paulo';
end;
$$;

revoke all on function private.next_routine_run(text, text, text, integer, timestamptz) from public, anon, authenticated, service_role;

-- Quem já existia ganha o próximo horário.
update private.agent_routines r
set next_run_at = private.next_routine_run(r.frequency, r.weekday, r.run_time, r.day_of_month, now());

-- O próximo horário nasce com a Rotina e muda quando a agenda muda ou quando ela é retomada: retomar não recupera nenhum
-- horário perdido. O relógio avança `next_run_at` sem passar por aqui (a coluna não está na lista do gatilho).
create function private.schedule_agent_routine()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT'
     or new.frequency is distinct from old.frequency
     or new.weekday is distinct from old.weekday
     or new.run_time is distinct from old.run_time
     or new.day_of_month is distinct from old.day_of_month
     or (old.paused and not new.paused) then
    new.next_run_at := private.next_routine_run(new.frequency, new.weekday, new.run_time, new.day_of_month, now());
  end if;
  return new;
end;
$$;

create trigger agent_routines_schedule
  before insert or update of frequency, weekday, run_time, day_of_month, paused on private.agent_routines
  for each row execute function private.schedule_agent_routine();

-- Apagar a Rotina leva o teto e o gasto dela (o gasto acompanha o teto por chave estrangeira).
create function private.forget_routine_scope()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  delete from private.automation_settings s where s.workspace_id = old.workspace_id and s.scope = 'rotina:' || old.id::text;
  return old;
end;
$$;

create trigger agent_routines_forget_scope
  after delete on private.agent_routines
  for each row execute function private.forget_routine_scope();

revoke all on function private.schedule_agent_routine() from public, anon, authenticated, service_role;
revoke all on function private.forget_routine_scope() from public, anon, authenticated, service_role;

-- 3. O teto: a Rotina é um escopo novo da página de Automação e tetos, e tem executor. Redefinidas a partir de
-- 20260930170000 (automation_scopes) e 20261009010000 (automation_scope_runs).
alter table private.automation_settings drop constraint automation_settings_scope_check;
alter table private.automation_settings add constraint automation_settings_scope_check
  check (scope ~ '^(acao:(varredura|enriquecimento|agentes)|agente:[0-9a-f-]{36}|rotina:[0-9a-f-]{36}|integracao:[a-z][a-z0-9-]*)$');

create or replace function private.automation_scopes(p_workspace_id uuid)
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
  from private.integration_catalog i
  union all
  select 'rotina:' || r.id::text, 'rotina', 'Rotina · ' || g.name || ' · ' || left(r.task, 40),
    2000 + (row_number() over (order by r.created_at, r.id))::integer
  from private.agent_routines r
  join private.agents g on g.workspace_id = r.workspace_id and g.id = r.agent_id
  where r.workspace_id = p_workspace_id;
$$;

create or replace function private.automation_scope_runs(p_workspace_id uuid, p_scope text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_scope in ('acao:varredura', 'acao:agentes')
    or exists (
      select 1 from private.agents a
      where a.workspace_id = p_workspace_id and a.specialty = 'rhetor' and a.kind = 'padrao'
        and p_scope = 'agente:' || a.id::text
    )
    or exists (
      select 1 from private.agent_routines r
      where r.workspace_id = p_workspace_id and p_scope = 'rotina:' || r.id::text
    );
$$;

-- 4. As funções de Rotina que a tela usa: aceitam o dia do mês e preenchem o dono. Mudam de assinatura (um parâmetro
-- novo, com padrão), então a antiga sai em vez de virar uma sobrecarga: quem chama com seis argumentos segue valendo.
create function private.check_routine_day(p_frequency text, p_day_of_month integer)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if (p_frequency = 'mensal') <> (p_day_of_month is not null)
     or (p_day_of_month is not null and p_day_of_month not between 1 and 28) then
    raise exception 'invalid day of month' using errcode = '22023';
  end if;
end;
$$;

revoke all on function private.check_routine_day(text, integer) from public, anon, authenticated, service_role;

drop function public.list_agent_routines(uuid);
drop function public.create_agent_routine(uuid, text, text, text, text, text);
drop function public.update_agent_routine(uuid, text, text, text, text, text);

-- As Rotinas do Agente, da mais antiga à mais nova, com o dia do mês e o teto de cada uma: o teto aprovado, o gasto do
-- mês e por que a Rotina não roda (confirmar, sem_teto ou teto_atingido; nulo quando roda). Todo participante lê, como a
-- página de Automação e tetos.
create function public.list_agent_routines(p_agent_id uuid)
returns table (
  id uuid, task text, frequency text, weekday text, run_time text, destination_channel text, paused boolean,
  day_of_month integer, monthly_cap numeric, month_spent numeric, blocked_reason text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_agent(p_agent_id);
  return query
    select r.id, r.task, r.frequency, r.weekday, r.run_time, r.destination_channel, r.paused, r.day_of_month,
      c.monthly_cap, coalesce(g.spent, 0),
      private.automation_block_reason(c.mode, c.monthly_cap, g.spent, c.paused_at)
    from private.agent_routines r
    left join private.automation_settings c on c.workspace_id = r.workspace_id and c.scope = 'rotina:' || r.id::text
    left join private.automation_spend g
      on g.workspace_id = r.workspace_id and g.scope = c.scope and g.month = date_trunc('month', now())::date
    where r.agent_id = p_agent_id
    order by r.created_at, r.id;
end;
$$;

create function public.create_agent_routine(
  p_agent_id uuid, p_task text, p_frequency text, p_weekday text, p_time text, p_channel text,
  p_day_of_month integer default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workspace_id uuid := private.require_agent(p_agent_id, true);
  v_id uuid;
begin
  perform private.check_routine(p_task, p_frequency, p_weekday, p_time, p_channel);
  perform private.check_routine_day(p_frequency, p_day_of_month);
  insert into private.agent_routines (
    workspace_id, agent_id, task, frequency, weekday, run_time, destination_channel, day_of_month, owner_id, updated_by
  )
  values (
    v_workspace_id, p_agent_id, btrim(p_task), p_frequency, p_weekday, p_time, p_channel, p_day_of_month,
    auth.uid(), auth.uid()
  )
  returning id into v_id;
  return v_id;
end;
$$;

-- Quem edita assume a Rotina quando o dono dela saiu do Workspace; senão o dono continua o mesmo.
create function public.update_agent_routine(
  p_routine_id uuid, p_task text, p_frequency text, p_weekday text, p_time text, p_channel text,
  p_day_of_month integer default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_agent_id uuid;
begin
  select r.agent_id into v_agent_id from private.agent_routines r where r.id = p_routine_id;
  perform private.require_agent(coalesce(v_agent_id, gen_random_uuid()), true);
  perform private.check_routine(p_task, p_frequency, p_weekday, p_time, p_channel);
  perform private.check_routine_day(p_frequency, p_day_of_month);
  update private.agent_routines r
  set task = btrim(p_task), frequency = p_frequency, weekday = p_weekday, run_time = p_time,
      destination_channel = p_channel, day_of_month = p_day_of_month,
      owner_id = case
        when r.owner_id is not null and exists (
          select 1 from public.workspace_memberships m
          where m.workspace_id = r.workspace_id and m.user_id = r.owner_id and m.active
        ) then r.owner_id
        else auth.uid()
      end,
      updated_by = auth.uid(), updated_at = now()
  where r.id = p_routine_id;
end;
$$;

revoke all on function public.list_agent_routines(uuid) from public, anon;
revoke all on function public.create_agent_routine(uuid, text, text, text, text, text, integer) from public, anon;
revoke all on function public.update_agent_routine(uuid, text, text, text, text, text, integer) from public, anon;
grant execute on function public.list_agent_routines(uuid) to authenticated;
grant execute on function public.create_agent_routine(uuid, text, text, text, text, text, integer) to authenticated;
grant execute on function public.update_agent_routine(uuid, text, text, text, text, text, integer) to authenticated;

-- 5. A Execução de Rotina que entra na fila e cuja Rotina foi pausada ou apagada antes do claim fecha como
-- `routine_paused`, sem chamar o modelo. Redefinida a partir de 20260929180000; o resto do claim é o de sempre.

create or replace function public.claim_agent_run(p_run_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run private.agent_runs%rowtype;
  v_conversation private.agent_conversations%rowtype;
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
    return null;
  end if;
  update private.agent_runs set status = 'running', started_at = clock_timestamp() where id = p_run_id;

  return jsonb_build_object(
    'run_id', v_run.id,
    'kind', v_conversation.kind,
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


-- 6. O relógio. A estimativa que o relógio soma ao teto é provisória: as 3 rodadas que uma Conversa de Agente pode ter
-- (MAX_RODADAS_DO_PEDIDO em _shared/orquestracao.ts), em créditos de `agent_round`. O ticket 02 acerta a diferença no
-- fim da Execução.
create function private.routine_run_estimate()
returns numeric
language sql
stable
set search_path = ''
as $$
  select 3 * coalesce((select p.credits from private.credit_action_prices p where p.action = 'agent_round'), 1);
$$;

revoke all on function private.routine_run_estimate() from public, anon, authenticated, service_role;

-- Cria a Execução de cada Rotina ativa que venceu em p_now, e avança o próximo horário de todas para o próximo futuro
-- (nenhum horário perdido é recuperado). Na ordem: o dono tem de estar ativo no Workspace (senão a Rotina pausa); a
-- Execução anterior da Rotina não pode estar aberta (o horário é pulado, sem gastar o teto); o teto da Rotina
-- (`consume_automation_cap`: confirmar, sem_teto ou teto_atingido barram, e o teto atingido avisa os Administradores uma
-- vez). A chave do pedido sai da Rotina e do horário previsto, então o mesmo horário nunca cria duas. Devolve o que fez
-- com cada Rotina vencida: criada, sem_dono, execucao_aberta ou o motivo do teto.
create function private.enqueue_due_agent_routines(p_now timestamptz default now())
returns table (routine_id uuid, outcome text)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  r private.agent_routines%rowtype;
  v_estimate numeric := private.routine_run_estimate();
  v_scope text;
  v_reason text;
  v_conversation uuid;
  v_next timestamptz;
  v_run uuid;
begin
  for r in
    select x.* from private.agent_routines x
    where not x.paused and x.next_run_at <= p_now
    order by x.next_run_at, x.id
    for update skip locked
  loop
    routine_id := r.id;
    v_scope := 'rotina:' || r.id::text;
    v_next := private.next_routine_run(r.frequency, r.weekday, r.run_time, r.day_of_month, p_now);

    if r.owner_id is null or not exists (
      select 1 from public.workspace_memberships m
      where m.workspace_id = r.workspace_id and m.user_id = r.owner_id and m.active
    ) then
      update private.agent_routines set paused = true, next_run_at = v_next, updated_at = now() where id = r.id;
      outcome := 'sem_dono';
      return next;
      continue;
    end if;

    -- Uma Execução parada além do prazo deixa de contar como aberta (o worker não está no ar).
    perform private.expire_run_if_stale(a.id)
    from private.agent_runs a where a.routine_id = r.id and a.status in ('queued', 'running');
    if exists (select 1 from private.agent_runs a where a.routine_id = r.id and a.status in ('queued', 'running')) then
      update private.agent_routines set next_run_at = v_next where id = r.id;
      outcome := 'execucao_aberta';
      return next;
      continue;
    end if;

    v_reason := public.consume_automation_cap(r.workspace_id, v_scope, v_estimate);
    if v_reason <> 'ok' then
      update private.agent_routines set next_run_at = v_next where id = r.id;
      outcome := v_reason;
      return next;
      continue;
    end if;

    select c.id into v_conversation
    from private.agent_conversations c where c.id = r.conversation_id and c.owner_id = r.owner_id;
    if v_conversation is null then
      insert into private.agent_conversations (workspace_id, owner_id, kind, agent_id)
      values (r.workspace_id, r.owner_id, 'agente', r.agent_id)
      returning id into v_conversation;
    end if;

    begin
      insert into private.agent_runs (
        workspace_id, conversation_id, requested_by, client_request_id, request_text, trigger_kind, routine_id
      )
      values (
        r.workspace_id, v_conversation, r.owner_id,
        md5(r.id::text || ':' || extract(epoch from r.next_run_at)::text)::uuid, r.task, 'rotina', r.id
      )
      returning id into v_run;
    exception when unique_violation then
      perform private.refund_automation_cap(r.workspace_id, v_scope, v_estimate);
      update private.agent_routines set next_run_at = v_next where id = r.id;
      outcome := 'execucao_aberta';
      return next;
      continue;
    end;
    update private.agent_conversations set updated_at = clock_timestamp() where id = v_conversation;
    update private.agent_routines
    set conversation_id = v_conversation, last_fired_at = p_now, next_run_at = v_next
    where id = r.id;
    outcome := 'criada';
    return next;
  end loop;
end;
$$;

revoke all on function private.enqueue_due_agent_routines(timestamptz) from public, anon, authenticated;
grant execute on function private.enqueue_due_agent_routines(timestamptz) to service_role;

-- O relógio de 5 em 5 minutos, onde o pg_cron existe (no Supabase e no CI).
do $cron$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron with schema pg_catalog;
    perform cron.schedule('althius-agent-routines', '*/5 * * * *', 'select * from private.enqueue_due_agent_routines()');
  end if;
end
$cron$;
