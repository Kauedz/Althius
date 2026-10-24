-- Agenda do Sinal (agente-de-sinal 03): quantas Rodadas por dia e em quais horários, e em quais dias.
--
-- O Monitoramento ganha uma Agenda opcional, `{ "horarios": ["08:00","14:00"], "dias": [1,2,3,4,5], "fuso": "America/Sao_Paulo" }`
-- (dias ISO: 1 = segunda). Quem tem Agenda é acordado nesses horários, pelo mesmo relógio de sempre (o `pg_cron`
-- `althius-signal-runner`, a cada 10 minutos: o horário marcado começa em até 10 minutos depois, e a tela diz "por volta de").
-- Quem não tem (`schedule` nulo) é o Monitoramento legado e segue em `every_hours`, sem mudar nada.
--
-- 1. `private.signal_monitors` ganha `schedule` e `current_slot_at` (o horário da Rodada em andamento, mantido na continuação).
-- 2. Os limites, num lugar só do banco: `private.signal_schedule_limit` (DECISÃO PENDENTE 3 e 10).
-- 3. `private.validate_signal_schedule` confere a Agenda no servidor, com um código por recusa, e `private.next_signal_run`
--    calcula o primeiro horário estritamente depois de um instante (imutável, sem `now()` dentro).
-- 4. `public.save_signal_schedule` grava a Agenda (a permissão de salvar o Monitoramento) e `public.preview_signal_schedule`
--    devolve os próximos horários para a tela.
-- 5. O relógio e a ativação: `claim_due_signal_monitors` grava o horário da Rodada em `current_slot_at` e devolve esse mesmo
--    horário como `slot` até a Rodada terminar (a chave de cobrança de `begin_account_scan` usa o `slot`, então a continuação
--    nunca cobra a mesma Conta duas vezes); `finish_signal_monitor_run` agenda a próxima Rodada pela Agenda;
--    `save_signal_monitor` e `set_signal_monitor_state` apontam o Monitoramento que ativa para o próximo horário;
--    `list_signal_monitors` traz a Agenda e `next_run_at`.
--
-- Sem compensação (DECISÃO PENDENTE): a Rodada perdida (runner parado, sem créditos, Monitoramento pausado) não é recuperada.
-- O próximo horário é sempre o primeiro depois de agora, então nunca acumulam Rodadas.
--
-- Redefinidas a partir da definição mais recente: public.claim_due_signal_monitors e public.finish_signal_monitor_run
-- (20261117120000_rodar_agora_e_registro_da_rodada.sql), public.save_signal_monitor e public.list_signal_monitors
-- (20261116120000_briefing_e_plano_do_sinal.sql) e public.set_signal_monitor_state (20261009050000_sinais_internos_das_interacoes.sql).
--
-- DECISÃO PENDENTE 3 (Agenda): passo de 15 min, até 6 Rodadas por dia, 2 h entre horários, dias úteis como padrão.
-- DECISÃO PENDENTE 10 (listas): Sinal com mais de 50 Contas no escopo roda no máximo 1 vez por dia.
-- DECISÃO PENDENTE (rodada perdida): não é compensada.

-- 1. As colunas. Nenhum dado é tocado: o Monitoramento que existe fica sem Agenda.
alter table private.signal_monitors
  add column schedule jsonb check (schedule is null or (jsonb_typeof(schedule) = 'object' and length(schedule::text) <= 2000)),
  add column current_slot_at timestamptz;

comment on column private.signal_monitors.schedule is
  'A Agenda do Sinal: {"horarios":["08:00"],"dias":[1,2,3,4,5],"fuso":"America/Sao_Paulo"}. Nulo é o Monitoramento legado, que segue em every_hours.';
comment on column private.signal_monitors.current_slot_at is
  'O horário da Rodada agendada em andamento. Fica igual enquanto a Rodada continua em outra chamada do runner (a chave de cobrança usa esse horário) e volta a nulo quando ela termina. Só Monitoramento com Agenda.';

-- 2. Os limites e o padrão, num lugar só do banco. Os mesmos números de `src/fonte/agenda-do-sinal.ts` (um teste confere).
create function private.signal_schedule_limit(p_name text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case p_name
    when 'step_minutes' then 15                 -- DECISÃO PENDENTE 3
    when 'max_per_day' then 6                   -- DECISÃO PENDENTE 3
    when 'min_gap_minutes' then 120             -- DECISÃO PENDENTE 3
    when 'big_scope_accounts' then 50           -- DECISÃO PENDENTE 10
    when 'big_scope_max_per_day' then 1         -- DECISÃO PENDENTE 10
    when 'preview_max' then 20
  end;
$$;

revoke all on function private.signal_schedule_limit(text) from public, anon, authenticated, service_role;

-- Os dias de quem não diz quais (dias úteis, seg-sex). DECISÃO PENDENTE 3.
create function private.signal_schedule_default_days()
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select '[1,2,3,4,5]'::jsonb;
$$;

revoke all on function private.signal_schedule_default_days() from public, anon, authenticated, service_role;

-- 3. A recusa da Agenda, com um código estável que a tela traduz. A mensagem não leva texto de ninguém.
create function private.fail_signal_schedule(p_code text)
returns void
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'signal schedule invalid: %', p_code using errcode = '22023', hint = p_code;
end;
$$;

revoke all on function private.fail_signal_schedule(text) from public, anon, authenticated, service_role;

-- Confere a Agenda. `p_accounts`: as Contas no escopo do Sinal. Códigos de recusa:
--   formato_invalido  não é um objeto só com horarios, dias e fuso
--   sem_horario       nenhum horário
--   muitos_horarios   mais de 6 por dia
--   horario_invalido  fora do formato HH:MM, ou fora do passo de 15 minutos
--   horario_repetido  o mesmo horário duas vezes
--   intervalo_curto   menos de 2 h entre dois horários, contando a virada do dia (23:00 e 01:00 são 2 h)
--   sem_dia           nenhum dia
--   dia_invalido      dia fora de 1 a 7, ou repetido
--   fuso_invalido     só America/Sao_Paulo por enquanto
--   muitas_contas     mais de 50 Contas no escopo e mais de 1 horário
-- `dias` e `fuso` ausentes valem seg-sex e America/Sao_Paulo. Estável, não imutável: lê as constantes.
create function private.validate_signal_schedule(p_schedule jsonb, p_accounts integer default 0)
returns void
language plpgsql
stable
set search_path = ''
as $$
declare
  v_horarios jsonb;
  v_dias jsonb;
  v_minutos integer[];
  v_n integer;
  v_i integer;
  v_item jsonb;
  v_text text;
  v_passo integer := private.signal_schedule_limit('step_minutes');
  v_intervalo integer := private.signal_schedule_limit('min_gap_minutes');
begin
  if p_schedule is null or jsonb_typeof(p_schedule) <> 'object'
     or exists (select 1 from jsonb_object_keys(p_schedule) k where k not in ('horarios', 'dias', 'fuso')) then
    perform private.fail_signal_schedule('formato_invalido');
  end if;

  v_horarios := p_schedule -> 'horarios';
  if v_horarios is null or jsonb_typeof(v_horarios) <> 'array' or jsonb_array_length(v_horarios) = 0 then
    perform private.fail_signal_schedule('sem_horario');
  end if;
  if jsonb_array_length(v_horarios) > private.signal_schedule_limit('max_per_day') then
    perform private.fail_signal_schedule('muitos_horarios');
  end if;
  for v_item in select e from jsonb_array_elements(v_horarios) e loop
    v_text := case when jsonb_typeof(v_item) = 'string' then v_item #>> '{}' end;
    if v_text is null or v_text !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
       or (split_part(v_text, ':', 1)::integer * 60 + split_part(v_text, ':', 2)::integer) % v_passo <> 0 then
      perform private.fail_signal_schedule('horario_invalido');
    end if;
  end loop;
  select array_agg(m order by m), count(*) into v_minutos, v_n
  from (select split_part(t, ':', 1)::integer * 60 + split_part(t, ':', 2)::integer as m
        from jsonb_array_elements_text(v_horarios) t) x;
  if (select count(distinct m) from unnest(v_minutos) m) <> v_n then
    perform private.fail_signal_schedule('horario_repetido');
  end if;
  for v_i in 1 .. v_n - 1 loop
    if v_minutos[v_i + 1] - v_minutos[v_i] < v_intervalo then
      perform private.fail_signal_schedule('intervalo_curto');
    end if;
  end loop;
  -- A virada do dia: do último horário de um dia ao primeiro do dia seguinte.
  if v_n >= 2 and v_minutos[1] + 1440 - v_minutos[v_n] < v_intervalo then
    perform private.fail_signal_schedule('intervalo_curto');
  end if;

  if p_schedule ? 'dias' then
    v_dias := p_schedule -> 'dias';
    if jsonb_typeof(v_dias) <> 'array' then
      perform private.fail_signal_schedule('dia_invalido');
    end if;
    if jsonb_array_length(v_dias) = 0 then
      perform private.fail_signal_schedule('sem_dia');
    end if;
    for v_item in select e from jsonb_array_elements(v_dias) e loop
      if jsonb_typeof(v_item) <> 'number' or (v_item #>> '{}') !~ '^[1-7]$' then
        perform private.fail_signal_schedule('dia_invalido');
      end if;
    end loop;
    if (select count(distinct d) from jsonb_array_elements_text(v_dias) d) <> jsonb_array_length(v_dias) then
      perform private.fail_signal_schedule('dia_invalido');
    end if;
  end if;

  if p_schedule ? 'fuso' and (jsonb_typeof(p_schedule -> 'fuso') <> 'string' or p_schedule ->> 'fuso' <> 'America/Sao_Paulo') then
    perform private.fail_signal_schedule('fuso_invalido');
  end if;

  if coalesce(p_accounts, 0) > private.signal_schedule_limit('big_scope_accounts')
     and v_n > private.signal_schedule_limit('big_scope_max_per_day') then
    perform private.fail_signal_schedule('muitas_contas');
  end if;
end;
$$;

revoke all on function private.validate_signal_schedule(jsonb, integer) from public, anon, authenticated, service_role;

-- A única regra da Agenda que depende do público: mais de 50 Contas no escopo, no máximo 1 horário por dia. É o que o editor de
-- hoje confere ao mudar o público de um Monitoramento que já tem Agenda; as demais regras valeram quando a Agenda foi gravada, e
-- uma mudança futura dos limites não trava a gravação do editor (a Agenda se corrige na própria tela da Agenda).
create function private.assert_schedule_fits_scope(p_schedule jsonb, p_accounts integer)
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if coalesce(p_accounts, 0) > private.signal_schedule_limit('big_scope_accounts')
     and coalesce(jsonb_array_length(p_schedule -> 'horarios'), 0) > private.signal_schedule_limit('big_scope_max_per_day') then
    perform private.fail_signal_schedule('muitas_contas');
  end if;
end;
$$;

revoke all on function private.assert_schedule_fits_scope(jsonb, integer) from public, anon, authenticated, service_role;

-- A Agenda como é guardada: horários em ordem, dias em ordem e o fuso escrito. Supõe Agenda já validada.
create function private.normalize_signal_schedule(p_schedule jsonb)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'horarios', (select jsonb_agg(h.v order by h.v) from jsonb_array_elements_text(p_schedule -> 'horarios') as h(v)),
    'dias', (select jsonb_agg(d.v::integer order by d.v::integer)
             from jsonb_array_elements_text(coalesce(p_schedule -> 'dias', private.signal_schedule_default_days())) as d(v)),
    'fuso', coalesce(p_schedule ->> 'fuso', 'America/Sao_Paulo'));
$$;

revoke all on function private.normalize_signal_schedule(jsonb) from public, anon, authenticated, service_role;

-- O primeiro horário da Agenda estritamente depois de `p_after`, nos dias permitidos, no fuso. Um horário igual a `p_after` não
-- conta. Imutável: o resultado só depende dos argumentos (nunca lê `now()`), então o teste passa horários fixos. Nulo se a Agenda
-- não tem horário nem dia. O horário local é montado dia a dia (de hoje a hoje + 7), então a Agenda de um dia só acha o da
-- semana seguinte. Brasília não tem horário de verão desde 2019, mas a conversão pelo nome do fuso já seria a certa.
create function private.next_signal_run(p_schedule jsonb, p_after timestamptz)
returns timestamptz
language sql
immutable
set search_path = ''
as $$
  select min(c.t)
  from (
    select ((((p_after at time zone coalesce(p_schedule ->> 'fuso', 'America/Sao_Paulo'))::date + k) + h.v::time)
            at time zone coalesce(p_schedule ->> 'fuso', 'America/Sao_Paulo')) as t
    from generate_series(0, 7) k,
         jsonb_array_elements_text(p_schedule -> 'horarios') as h(v)
    where extract(isodow from ((p_after at time zone coalesce(p_schedule ->> 'fuso', 'America/Sao_Paulo'))::date + k))::integer
          in (select d.v::integer from jsonb_array_elements_text(coalesce(p_schedule -> 'dias', private.signal_schedule_default_days())) as d(v))
  ) c
  where c.t > p_after;
$$;

revoke all on function private.next_signal_run(jsonb, timestamptz) from public, anon, authenticated, service_role;

-- 4. Gravar a Agenda. A permissão é a de salvar o Monitoramento: todo participante ativo vê, só quem criou, ou um Administrador,
--    muda. O Sinal interno (que sai das Interações, com o relógio dele) não tem Agenda. Se o Monitoramento está ativo, a próxima
--    Rodada passa para o primeiro horário depois de agora, a não ser que uma Rodada esteja em andamento: essa termina e só então
--    segue a Agenda nova (`finish_signal_monitor_run`). Devolve a Agenda como foi guardada.
create function public.save_signal_schedule(p_workspace_id uuid, p_monitor_id uuid, p_schedule jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := private.require_active_membership(p_workspace_id);
  v_m private.signal_monitors%rowtype;
  v_schedule jsonb;
begin
  select * into v_m from private.signal_monitors m where m.workspace_id = p_workspace_id and m.id = p_monitor_id for update;
  if not found then
    raise exception 'monitor not found' using errcode = 'P0002';
  end if;
  perform private.assert_can_change_monitor(v_role, v_m.created_by);
  if exists (select 1 from private.signal_catalog c where c.signal_type = v_m.signal_type and c.origin = 'interno') then
    perform private.fail_signal_schedule('tipo_sem_agenda');
  end if;
  perform private.validate_signal_schedule(p_schedule, cardinality(private.signal_run_account_ids(p_workspace_id, v_m.audience)));
  v_schedule := private.normalize_signal_schedule(p_schedule);
  update private.signal_monitors set
    schedule = v_schedule,
    next_run_at = case
      when state = 'ativo' and current_slot_at is null then private.next_signal_run(v_schedule, now())
      else next_run_at
    end,
    updated_at = now()
  where id = p_monitor_id;
  return v_schedule;
end;
$$;

revoke all on function public.save_signal_schedule(uuid, uuid, jsonb) from public, anon;
grant execute on function public.save_signal_schedule(uuid, uuid, jsonb) to authenticated;

-- Os próximos `p_n` horários da Agenda a partir de `p_from`, para a tela mostrar antes de salvar (a mesma conta do servidor,
-- então a tela nunca promete um horário que o relógio não vai usar). `p_accounts`: as Contas no escopo, para a recusa de mais de
-- 50 Contas valer também aqui. Só quem está logado; não lê nada do Workspace.
create function public.preview_signal_schedule(
  p_schedule jsonb, p_from timestamptz default now(), p_n integer default 5, p_accounts integer default 0
) returns setof timestamptz
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_t timestamptz := coalesce(p_from, now());
  v_n integer := least(greatest(coalesce(p_n, 5), 1), private.signal_schedule_limit('preview_max'));
  v_i integer;
begin
  perform private.require_user();
  perform private.validate_signal_schedule(p_schedule, p_accounts);
  for v_i in 1 .. v_n loop
    v_t := private.next_signal_run(p_schedule, v_t);
    return next v_t;
  end loop;
end;
$$;

revoke all on function public.preview_signal_schedule(jsonb, timestamptz, integer, integer) from public, anon;
grant execute on function public.preview_signal_schedule(jsonb, timestamptz, integer, integer) to authenticated;

-- 5. O relógio.

-- Termina a chamada do runner para uma Rodada agendada. Redefinida a partir de 20261117120000. Sem Agenda, o cálculo é o de
-- sempre. Com Agenda: quando continua, a próxima chamada vem já e o horário da Rodada (`current_slot_at`) fica; quando termina,
-- a próxima Rodada é o primeiro horário depois de agora (ou depois do horário da Rodada, se ele for mais tarde), então a
-- Rodada perdida não é compensada, e o horário da Rodada é limpo.
create or replace function public.finish_signal_monitor_run(
  p_monitor_id uuid, p_attempted integer, p_error text, p_continue boolean default false
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run uuid;
begin
  update private.signal_monitors set
    last_run_at = now(),
    next_run_at = case
      when p_continue then now()
      when schedule is null then now() + make_interval(hours => every_hours)
      else private.next_signal_run(schedule, greatest(now(), coalesce(current_slot_at, now())))
    end,
    current_slot_at = case when schedule is not null and coalesce(p_continue, false) then current_slot_at end,
    claimed_until = null,
    scan_offset = (scan_offset + greatest(coalesce(p_attempted, 0), 0)) % 1000000,
    last_error = nullif(left(coalesce(p_error, ''), 500), '')
  where id = p_monitor_id
  returning current_run_id into v_run;
  if not found then
    raise exception 'monitor not found' using errcode = 'P0002';
  end if;
  if v_run is not null and not coalesce(p_continue, false) then
    update private.signal_monitor_runs x set
      state = case when x.stop_reason = 'erro' then 'falhou' else 'concluida' end,
      finished_at = clock_timestamp(),
      stop_reason = coalesce(x.stop_reason, 'concluida'),
      error = nullif(left(coalesce(p_error, ''), 500), '')
    where x.id = v_run and x.state = 'rodando';
    update private.signal_monitors set current_run_id = null where id = p_monitor_id;
  end if;
end;
$$;

-- Reivindica os Monitoramentos vencidos. Redefinida a partir de 20261117120000: o único acréscimo é o horário da Rodada. No
-- começo de uma Rodada de Monitoramento com Agenda, `current_slot_at` recebe o `next_run_at`; enquanto a Rodada continua, o
-- `slot` devolvido é esse mesmo horário (e não o `next_run_at = now()` da continuação), então a chave de cobrança de
-- `begin_account_scan` não muda e a Conta já cobrada volta como `done`. Sem Agenda o `slot` é o `next_run_at`, como sempre.
create or replace function public.claim_due_signal_monitors(p_limit integer default 5)
returns table (
  monitor_id uuid, workspace_id uuid, signal_type text, criteria jsonb, created_by uuid, slot timestamptz, accounts jsonb
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  with due as (
    select m.id from private.signal_monitors m
    where private.signal_type_is_runnable(m.signal_type)
      and m.state = 'ativo' and m.next_run_at <= now() and (m.claimed_until is null or m.claimed_until < now())
      and private.automation_contract_block(m.workspace_id) is null
      and not exists (
        select 1 from private.signal_run_requests q
        where q.monitor_id = m.id and q.state in ('pendente', 'rodando') and q.run_id is not null)
    order by m.next_run_at, m.id
    limit least(greatest(coalesce(p_limit, 5), 1), 20)
    for update of m skip locked
  ), claimed as (
    update private.signal_monitors m set
      claimed_until = now() + interval '15 minutes',
      current_slot_at = case when m.schedule is not null then coalesce(m.current_slot_at, m.next_run_at) end
    from due where m.id = due.id
    returning m.*
  )
  select c.id, c.workspace_id, c.signal_type, c.criteria,
    (select p.user_id from public.workspace_memberships p
     where p.workspace_id = c.workspace_id and p.user_id = c.created_by and p.active),
    coalesce(c.current_slot_at, c.next_run_at),
    coalesce((
      select jsonb_agg(jsonb_build_object('id', x.id, 'name', x.name, 'domain', x.domain, 'linkedinUrl', x.linkedin_url,
          'cnpj', x.legal_identifier, 'contatos', private.signal_scan_contacts(c.workspace_id, x.id))
        order by (((x.pos - 1 - c.scan_offset) % x.total) + x.total) % x.total)
      from (
        select t.id, t.name, t.domain, t.linkedin_url, t.legal_identifier,
          row_number() over (order by t.name, t.id) as pos, count(*) over () as total
        from public.target_accounts t
        where t.workspace_id = c.workspace_id and t.archived_at is null and t.deleted_at is null
          and t.id::text in (select jsonb_array_elements_text(c.audience -> 'accountIds'))
      ) x
    ), '[]'::jsonb)
  from claimed c;
end;
$$;

-- A ativação. Redefinida a partir de 20261116120000 (`save_signal_monitor`) e 20261009050000 (`set_signal_monitor_state`). O
-- Monitoramento com Agenda que passa a ativo (de rascunho, em preparação ou pausado) aponta para o próximo horário depois de
-- agora e esquece o horário de uma Rodada que ficou pela metade; o que já estava ativo mantém a hora marcada. Sem Agenda, é
-- como sempre. O editor de hoje também confere o público novo contra a Agenda (mais de 50 Contas só com 1 horário); o resto da
-- Agenda não é revalidado aqui.
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
  v_ativando boolean;
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
    if v_existing.schedule is not null then
      perform private.assert_schedule_fits_scope(v_existing.schedule, cardinality(private.signal_run_account_ids(p_workspace_id, p_audience)));
    end if;
    v_ativando := p_state = 'ativo' and v_existing.schedule is not null and v_existing.state is distinct from 'ativo';
    -- Pausar guarda a hora marcada: retomar antes dela não força uma rodada nova (nem um gasto de crédito).
    update private.signal_monitors set
      signal_type = p_signal_type, name = btrim(p_name), state = p_state, audience = p_audience, criteria = p_criteria,
      every_hours = p_every_hours, scan_offset = 0, updated_at = now(),
      next_run_at = case
        when v_ativando then private.next_signal_run(v_existing.schedule, now())
        when p_state = 'ativo' then coalesce(next_run_at, now())
        else next_run_at
      end,
      current_slot_at = case when v_ativando then null else current_slot_at end,
      plan = case when v_existing.signal_type = p_signal_type and v_existing.audience = p_audience
        and v_existing.criteria = p_criteria then v_existing.plan end,
      plan_origin = case when v_existing.signal_type = p_signal_type and v_existing.audience = p_audience
        and v_existing.criteria = p_criteria then v_existing.plan_origin end,
      plan_seed = case when v_existing.signal_type = p_signal_type and v_existing.audience = p_audience
        and v_existing.criteria = p_criteria then v_existing.plan_seed end
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
  v_ativando boolean;
begin
  select * into v from private.signal_monitors m where m.id = p_id for update;
  if not found then
    raise exception 'monitor not found' using errcode = 'P0002';
  end if;
  perform private.assert_can_change_monitor(private.require_active_membership(v.workspace_id), v.created_by);
  perform private.validate_signal_monitor(v.workspace_id, v.name, p_state, v.audience, v.criteria, v.every_hours);
  v_ativando := p_state = 'ativo' and v.schedule is not null and v.state is distinct from 'ativo';
  update private.signal_monitors set
    state = p_state, updated_at = now(),
    next_run_at = case
      when v_ativando then private.next_signal_run(v.schedule, now())
      when p_state = 'ativo' then coalesce(next_run_at, now())
      else next_run_at
    end,
    current_slot_at = case when v_ativando then null else current_slot_at end
  where id = p_id;
  if p_state = 'ativo' and private.available_signal_origin(v.signal_type) = 'interno' then
    perform private.run_internal_signal_monitor(p_id);
  end if;
end;
$$;

-- Os Monitoramentos do Workspace, com a Agenda e a hora marcada da próxima Rodada. Redefinida a partir de 20261116120000: as
-- colunas antigas seguem na mesma ordem e as duas novas vêm no fim. `next_run_at` só vale para o Monitoramento ativo.
drop function public.list_signal_monitors(uuid);

create function public.list_signal_monitors(p_workspace_id uuid)
returns table (
  id uuid, signal_type text, name text, state text, audience jsonb, criteria jsonb, every_hours integer,
  created_by uuid, last_run_at timestamptz, last_error text, created_at timestamptz, last_run jsonb,
  brief text, plan jsonb, plan_version integer, plan_origin text,
  schedule jsonb, next_run_at timestamptz
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
     limit 1),
    m.brief, m.plan, m.plan_version, m.plan_origin,
    m.schedule, m.next_run_at
  from private.signal_monitors m where m.workspace_id = p_workspace_id
  order by m.created_at, m.id;
end;
$$;

revoke all on function public.list_signal_monitors(uuid) from public, anon;
grant execute on function public.list_signal_monitors(uuid) to authenticated;
