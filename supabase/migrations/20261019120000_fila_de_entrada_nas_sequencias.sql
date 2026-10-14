-- Fila de entrada nas Sequências (PR-5). A entrada passa a contar pela Conta (target_account_id) e pelo remetente,
-- não pela pessoa: várias pessoas da mesma Conta no mesmo dia ocupam uma vaga. O padrão é 20 a 25 por dia, sorteado
-- uma vez por remetente; a capacidade do Workspace é a soma dos remetentes prontos. O que passa do teto espera o
-- próximo dia útil, na ordem de chegada, com a Conta Quente na frente. Remetente novo começa em 5 por dia e sobe até
-- o padrão em 14 dias (private.send_warmup_ramp, editável por migração).
--
-- Só corre com o ritmo ligado (private.send_rate_enabled), na mesma camada de schedule_next_step, send_rate_gate e
-- claims. Desligado, o horário dos passos não muda. Nada é cancelado: o passo continua scheduled.
--
-- Aditiva. Redefine, a partir da definição mais recente da main: private.schedule_next_step,
-- public.claim_due_step_sends, public.claim_due_chat_step_sends, private.release_step_send,
-- private.release_chat_step_send e public.set_send_cap (20261010120000).

-- 1. A faixa do dia (mínimo e máximo) e os kinds de entrada por Conta.
do $$
declare
  r record;
begin
  for r in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'private' and rel.relname = 'send_caps' and con.contype = 'c'
      and pg_get_constraintdef(con.oid) like '%linkedin_invite%'
  loop
    execute format('alter table private.send_caps drop constraint %I', r.conname);
  end loop;
end $$;

alter table private.send_caps add constraint send_caps_kind_check check (kind in (
  'email', 'linkedin_invite', 'linkedin_message', 'whatsapp_new_contact', 'whatsapp_message',
  'whatsapp_new_company', 'email_new_company', 'linkedin_new_company'
));

alter table private.send_caps add column min_sends integer;

alter table private.send_caps add constraint send_caps_min_sends_check check (
  min_sends is null or (max_sends is not null and min_sends > 0 and min_sends <= max_sends)
);

comment on column private.send_caps.min_sends is
  'Piso do sorteio diário. Nulo: o teto é fixo (max_sends). Preenchido: cada remetente sorteia um inteiro entre o piso e o teto, uma vez por dia.';

insert into private.send_caps (workspace_id, kind, period, min_sends, max_sends)
select null, k.kind, 'day', 20, 25
from (values ('whatsapp_new_company'), ('email_new_company'), ('linkedin_new_company')) as k(kind)
where not exists (
  select 1 from private.send_caps c
  where c.workspace_id is null and c.kind = k.kind and c.period = 'day');

-- 2. A rampa. day_index 0 é o dia de created_at do remetente (Brasília). Sem linha, vale o teto do dia.
create table private.send_warmup_ramp (
  kind text not null,
  day_index integer not null check (day_index >= 0),
  max_sends integer not null check (max_sends > 0),
  primary key (kind, day_index)
);

alter table private.send_warmup_ramp enable row level security;
revoke all on private.send_warmup_ramp from public, anon, authenticated, service_role;

comment on table private.send_warmup_ramp is
  'Teto de empresas novas por dia de vida do remetente. Editável por migração. O dia 0 começa em 5; no dia 13 chega a 25; depois disso não há linha e vale a faixa do dia.';

insert into private.send_warmup_ramp (kind, day_index, max_sends)
select k.kind, d.i, (5 + round(d.i * 20.0 / 13))::integer
from (values ('whatsapp_new_company'), ('email_new_company'), ('linkedin_new_company')) as k(kind),
     generate_series(0, 13) as d(i)
on conflict (kind, day_index) do nothing;

-- O sorteio de cada remetente em cada dia local, para o "Y" não mudar no meio do dia.
create table private.sender_daily_draws (
  sender_account_id uuid not null references private.sender_accounts(id) on delete cascade,
  kind text not null,
  day date not null,
  drawn_cap integer not null check (drawn_cap > 0),
  primary key (sender_account_id, kind, day)
);

alter table private.sender_daily_draws enable row level security;
revoke all on private.sender_daily_draws from public, anon, authenticated, service_role;

-- A vaga da Conta naquele remetente. Uma linha por par: a segunda pessoa não abre outra vaga.
create table private.company_entry_slots (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  sender_account_id uuid not null references private.sender_accounts(id) on delete cascade,
  target_account_id uuid not null,
  kind text not null check (kind in ('whatsapp_new_company', 'email_new_company', 'linkedin_new_company')),
  enqueued_at timestamptz not null,
  earliest_at timestamptz not null,
  admitted_on date not null,
  hot boolean not null default false,
  consumed_at timestamptz,
  send_window jsonb not null default '{}'::jsonb,
  unique (sender_account_id, target_account_id),
  foreign key (workspace_id, target_account_id)
    references public.target_accounts(workspace_id, id) on delete cascade
);

create index company_entry_slots_day_idx
  on private.company_entry_slots (sender_account_id, kind, admitted_on);

alter table private.company_entry_slots enable row level security;
revoke all on private.company_entry_slots from public, anon, authenticated, service_role;

comment on table private.company_entry_slots is
  'A vaga de entrada da Conta por remetente. admitted_on é o dia local que ela ocupa. consumed_at marca o primeiro envio. A fila não apaga o passo.';

-- Quem já entrou antes desta migração não volta a contar como empresa nova.
insert into private.company_entry_slots (
  workspace_id, sender_account_id, target_account_id, kind, enqueued_at, earliest_at, admitted_on, hot, consumed_at, send_window)
select distinct on (e.sender_account_id, s.target_account_id)
  s.workspace_id, e.sender_account_id, s.target_account_id::uuid,
  case e.channel when 'email' then 'email_new_company' when 'linkedin' then 'linkedin_new_company' else 'whatsapp_new_company' end,
  coalesce(e.sent_at, e.sending_at, e.updated_at),
  coalesce(e.sent_at, e.sending_at, e.updated_at),
  (coalesce(e.sent_at, e.sending_at, e.updated_at) at time zone 'America/Sao_Paulo')::date,
  false,
  coalesce(e.sent_at, e.sending_at, e.updated_at),
  '{}'::jsonb
from private.sequence_step_sends e
join public.sequences s on s.id = e.sequence_id
where e.sender_account_id is not null
  and e.status in ('sending', 'sent', 'uncertain')
  and s.target_account_id ~* '^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$'
order by e.sender_account_id, s.target_account_id, coalesce(e.sent_at, e.sending_at, e.updated_at)
on conflict (sender_account_id, target_account_id) do nothing;

-- 3. O dia útil seguinte e o kind da entrada.
create function private.next_business_day(p_day date)
returns date
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_day date := p_day + 1;
begin
  while extract(isodow from v_day) >= 6 loop
    v_day := v_day + 1;
  end loop;
  return v_day;
end;
$$;

revoke all on function private.next_business_day(date) from public, anon, authenticated, service_role;

create function private.company_entry_kind(p_channel text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_channel
    when 'email' then 'email_new_company'
    when 'linkedin' then 'linkedin_new_company'
    when 'whatsapp' then 'whatsapp_new_company'
    else null
  end;
$$;

revoke all on function private.company_entry_kind(text) from public, anon, authenticated, service_role;

-- O teto que vale hoje para este remetente: sorteio estável do dia, limitado pela rampa. Nulo é sem limite.
create function private.company_entry_cap(p_sender_id uuid, p_workspace_id uuid, p_kind text, p_day date)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_min integer;
  v_max integer;
  v_drawn integer;
  v_age integer;
  v_warm integer;
  v_created timestamptz;
begin
  select c.min_sends, c.max_sends into v_min, v_max
  from private.send_caps c
  where c.kind = p_kind and c.period = 'day'
    and (c.workspace_id = p_workspace_id or c.workspace_id is null)
  order by (c.workspace_id is null)
  limit 1;
  if v_max is null then
    return null;
  end if;
  v_min := least(coalesce(v_min, v_max), v_max);

  select d.drawn_cap into v_drawn
  from private.sender_daily_draws d
  where d.sender_account_id = p_sender_id and d.kind = p_kind and d.day = p_day;
  if v_drawn is null then
    v_drawn := v_min + floor(random() * (v_max - v_min + 1))::integer;
    insert into private.sender_daily_draws (sender_account_id, kind, day, drawn_cap)
    values (p_sender_id, p_kind, p_day, v_drawn)
    on conflict (sender_account_id, kind, day) do nothing;
    select d.drawn_cap into v_drawn
    from private.sender_daily_draws d
    where d.sender_account_id = p_sender_id and d.kind = p_kind and d.day = p_day;
  end if;
  v_drawn := least(greatest(v_drawn, v_min), v_max);

  select a.created_at into v_created from private.sender_accounts a where a.id = p_sender_id;
  v_age := p_day - (v_created at time zone 'America/Sao_Paulo')::date;
  -- Sem linha (dia anterior à criação, ou depois do 13) vale o teto do dia. A rampa começa no dia de created_at.
  select r.max_sends into v_warm
  from private.send_warmup_ramp r
  where r.kind = p_kind and r.day_index = v_age;
  if v_warm is not null and v_warm < v_drawn then
    return v_warm;
  end if;
  return v_drawn;
end;
$$;

revoke all on function private.company_entry_cap(uuid, uuid, text, date) from public, anon, authenticated, service_role;

-- A soma dos remetentes prontos daquele canal. É o teto do Workspace, e cresce com os assentos.
create function private.workspace_entry_capacity(p_workspace_id uuid, p_kind text, p_day date)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_channel text := case p_kind
    when 'email_new_company' then 'email'
    when 'linkedin_new_company' then 'linkedin'
    when 'whatsapp_new_company' then 'whatsapp'
    else null end;
  v_sum integer := 0;
  v_cap integer;
  v_sender uuid;
begin
  if v_channel is null then
    return null;
  end if;
  for v_sender in
    select a.id from private.sender_accounts a
    where a.workspace_id = p_workspace_id and a.channel = v_channel
      and a.status = 'ready' and not a.reconciliation_required
  loop
    v_cap := private.company_entry_cap(v_sender, p_workspace_id, p_kind, p_day);
    if v_cap is null then
      return null;
    end if;
    v_sum := v_sum + v_cap;
  end loop;
  return v_sum;
end;
$$;

revoke all on function private.workspace_entry_capacity(uuid, text, date) from public, anon, authenticated, service_role;

-- Redistribui as vagas ainda não usadas: Conta Quente primeiro, depois a ordem de chegada.
-- Só empurra um passo para mais tarde. Não puxa de volta quem o teto de mensagem já adiou.
create function private.rebalance_company_entries(p_sender_id uuid, p_kind text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_tz constant text := 'America/Sao_Paulo';
  v_today date := (private.clock_now() at time zone 'America/Sao_Paulo')::date;
  v_sender private.sender_accounts;
  v_slot private.company_entry_slots;
  v_assigned uuid[] := array[]::uuid[];
  v_day date;
  v_cap integer;
  v_taken integer;
  v_guard integer;
  v_jitter integer;
  v_send record;
  v_start timestamptz;
  v_at timestamptz;
begin
  select * into v_sender from private.sender_accounts a where a.id = p_sender_id for update;
  if not found then
    return;
  end if;

  delete from private.company_entry_slots q
  where q.sender_account_id = p_sender_id and q.kind = p_kind and q.consumed_at is null
    and not exists (
      select 1 from public.sequences s
      where s.workspace_id = q.workspace_id
        and s.target_account_id = q.target_account_id::text
        and s.owner_user_id = v_sender.owner_user_id
        and s.status in ('ativa', 'pausada'));

  update private.company_entry_slots q
  set hot = exists (
    select 1 from private.prospecting_stages s
    where s.workspace_id = q.workspace_id and s.target_account_id = q.target_account_id and s.stage = 'quente')
  where q.sender_account_id = p_sender_id and q.kind = p_kind and q.consumed_at is null;

  for v_slot in
    select q.* from private.company_entry_slots q
    where q.sender_account_id = p_sender_id and q.kind = p_kind and q.consumed_at is null
    order by q.hot desc, q.enqueued_at, q.id
  loop
    v_day := greatest(v_today, (v_slot.earliest_at at time zone v_tz)::date);
    while extract(isodow from v_day) >= 6 loop
      v_day := v_day + 1;
    end loop;
    v_guard := 0;
    loop
      v_cap := private.company_entry_cap(p_sender_id, v_sender.workspace_id, p_kind, v_day);
      select count(*)::integer into v_taken
      from private.company_entry_slots q
      where q.sender_account_id = p_sender_id and q.kind = p_kind and q.admitted_on = v_day
        and (q.consumed_at is not null or q.id = any (v_assigned));
      if v_cap is null or v_taken < v_cap then
        update private.company_entry_slots set admitted_on = v_day where id = v_slot.id;
        v_assigned := v_assigned || v_slot.id;
        exit;
      end if;
      v_day := private.next_business_day(v_day);
      v_guard := v_guard + 1;
      exit when v_guard > 366;
    end loop;
  end loop;

  select r.schedule_jitter_seconds into v_jitter
  from private.send_rate(v_sender.workspace_id, v_sender.channel) r;

  for v_send in
    select e.id, q.admitted_on, q.send_window
    from private.sequence_step_sends e
    join public.sequences s on s.id = e.sequence_id
    join private.company_entry_slots q
      on q.sender_account_id = p_sender_id
     and q.target_account_id = s.target_account_id::uuid
     and q.kind = p_kind
     and q.consumed_at is null
    where s.owner_user_id = v_sender.owner_user_id
      and s.workspace_id = v_sender.workspace_id
      and s.status in ('ativa', 'pausada')
      and e.channel = v_sender.channel
      and e.status in ('scheduled', 'confirmed')
      and e.scheduled_for is not null
      and (e.scheduled_for at time zone v_tz)::date < q.admitted_on
    for update of e skip locked
  loop
    v_start := private.next_send_slot((v_send.admitted_on::timestamp) at time zone v_tz, 0, v_send.send_window);
    v_at := private.jittered_send_slot(v_start, v_send.send_window, coalesce(v_jitter, 0));
    update private.sequence_step_sends
    set scheduled_for = v_at, deferred_reason = 'daily_cap', claimed_until = null, updated_at = now()
    where id = v_send.id;
  end loop;
end;
$$;

revoke all on function private.rebalance_company_entries(uuid, text) from public, anon, authenticated, service_role;

-- Reserva a vaga e devolve o horário em que este passo pode sair. Quem já entrou por este remetente não ocupa outra.
create function private.place_company_entry(
  p_sender_id uuid,
  p_workspace_id uuid,
  p_target_account_id uuid,
  p_kind text,
  p_earliest timestamptz,
  p_window jsonb
) returns timestamptz
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_tz constant text := 'America/Sao_Paulo';
  v_sender private.sender_accounts;
  v_slot private.company_entry_slots;
  v_hot boolean;
  v_jitter integer;
  v_start timestamptz;
begin
  select * into v_sender from private.sender_accounts a where a.id = p_sender_id for update;
  if not found then
    return p_earliest;
  end if;

  if exists (
    select 1 from private.sequence_step_sends e
    join public.sequences s on s.id = e.sequence_id
    where e.sender_account_id = p_sender_id
      and s.target_account_id = p_target_account_id::text
      and e.status in ('sending', 'sent', 'uncertain')) then
    update private.company_entry_slots
    set consumed_at = coalesce(consumed_at, private.clock_now())
    where sender_account_id = p_sender_id and target_account_id = p_target_account_id and consumed_at is null;
    return p_earliest;
  end if;

  v_hot := exists (
    select 1 from private.prospecting_stages s
    where s.workspace_id = p_workspace_id and s.target_account_id = p_target_account_id and s.stage = 'quente');

  insert into private.company_entry_slots (
    workspace_id, sender_account_id, target_account_id, kind, enqueued_at, earliest_at, admitted_on, hot, send_window)
  values (
    p_workspace_id, p_sender_id, p_target_account_id, p_kind, clock_timestamp(), p_earliest,
    (private.clock_now() at time zone v_tz)::date, v_hot, coalesce(p_window, '{}'::jsonb))
  on conflict (sender_account_id, target_account_id) do nothing;

  perform private.rebalance_company_entries(p_sender_id, p_kind);

  select * into v_slot from private.company_entry_slots
  where sender_account_id = p_sender_id and target_account_id = p_target_account_id;
  if v_slot.id is null or (p_earliest at time zone v_tz)::date >= v_slot.admitted_on then
    return p_earliest;
  end if;

  select r.schedule_jitter_seconds into v_jitter
  from private.send_rate(p_workspace_id, v_sender.channel) r;
  v_start := private.next_send_slot((v_slot.admitted_on::timestamp) at time zone v_tz, 0, coalesce(p_window, v_slot.send_window));
  return private.jittered_send_slot(v_start, coalesce(p_window, v_slot.send_window), coalesce(v_jitter, 0));
end;
$$;

revoke all on function private.place_company_entry(uuid, uuid, uuid, text, timestamptz, jsonb) from public, anon, authenticated, service_role;

-- A porta da empresa, chamada antes do teto por mensagem. Sem linha: pode sair. Com linha: espera o dia da vaga.
create function private.company_entry_gate(
  p_sender_id uuid,
  p_workspace_id uuid,
  p_channel text,
  p_target_account_id text,
  p_window jsonb
) returns table (reason text, retry_at timestamptz)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_kind text := private.company_entry_kind(p_channel);
  v_at timestamptz;
  v_today date := (private.clock_now() at time zone 'America/Sao_Paulo')::date;
begin
  if not private.send_rate_enabled() or v_kind is null or p_target_account_id is null
    or p_target_account_id !~* '^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$' then
    return;
  end if;
  v_at := private.place_company_entry(
    p_sender_id, p_workspace_id, p_target_account_id::uuid, v_kind, private.clock_now(), p_window);
  if (v_at at time zone 'America/Sao_Paulo')::date > v_today then
    return query select 'daily_cap'::text, v_at;
  end if;
end;
$$;

revoke all on function private.company_entry_gate(uuid, uuid, text, text, jsonb) from public, anon, authenticated, service_role;

create function private.rebalance_due_company_entries()
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_row record;
begin
  if not private.send_rate_enabled() then
    return;
  end if;
  for v_row in
    select distinct q.sender_account_id, q.kind
    from private.company_entry_slots q
    where q.consumed_at is null
  loop
    perform private.rebalance_company_entries(v_row.sender_account_id, v_row.kind);
  end loop;
end;
$$;

revoke all on function private.rebalance_due_company_entries() from public, anon, authenticated, service_role;

-- O primeiro envio que sai consome a vaga. Os seguintes da mesma Conta não abrem outra.
create function private.consume_company_entry()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_account uuid;
begin
  if new.sender_account_id is null or new.status not in ('sending', 'sent', 'uncertain') then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status is not distinct from new.status
    and old.sender_account_id is not distinct from new.sender_account_id then
    return new;
  end if;
  select s.target_account_id::uuid into v_account
  from public.sequences s
  where s.id = new.sequence_id
    and s.target_account_id ~* '^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$';
  if v_account is null then
    return new;
  end if;
  update private.company_entry_slots
  set consumed_at = coalesce(consumed_at, private.clock_now())
  where sender_account_id = new.sender_account_id and target_account_id = v_account and consumed_at is null;
  return new;
end;
$$;

revoke all on function private.consume_company_entry() from public, anon, authenticated, service_role;

create trigger company_entry_consume
  after insert or update of status, sender_account_id on private.sequence_step_sends
  for each row execute function private.consume_company_entry();

-- 4. Programar o próximo passo. Com o ritmo ligado, a primeira saída da Conta espera uma vaga do remetente.
create or replace function private.schedule_next_step(p_sequence_id uuid, p_base timestamptz)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_auth private.sequence_authorizations;
  v_status text;
  v_workspace uuid;
  v_owner uuid;
  v_account text;
  v_step jsonb;
  v_send private.sequence_step_sends;
  v_window jsonb;
  v_at timestamptz;
  v_sender_id uuid;
  v_entry_kind text;
begin
  select a.* into v_auth from private.sequence_authorizations a
  where a.sequence_id = p_sequence_id and a.revoked_at is null;
  if not found then
    return null;
  end if;
  select s.status, s.workspace_id, s.owner_user_id, s.target_account_id
    into v_status, v_workspace, v_owner, v_account
  from public.sequences s
  where s.id = p_sequence_id
  for update;
  if v_status is distinct from 'ativa' then
    return null;
  end if;

  for v_step in
    select t.step from jsonb_array_elements(case when jsonb_typeof(v_auth.document -> 'steps') = 'array'
      then v_auth.document -> 'steps' else '[]'::jsonb end) with ordinality as t(step, n)
    order by t.n
  loop
    if v_step ->> 'canal' is distinct from 'email'
      and not (v_step ->> 'canal' in ('whatsapp', 'linkedin') and private.chat_channel_enabled(v_step ->> 'canal')) then
      return null;
    end if;
    select e.* into v_send from private.sequence_step_sends e
    where e.sequence_id = p_sequence_id and e.step_id = v_step ->> 'id';
    if not found then
      return null;
    end if;
    if v_send.status = 'sent' then
      continue;
    end if;
    if v_send.status <> 'waiting' or v_send.authorization_id is distinct from v_auth.id then
      return null;
    end if;
    v_window := private.step_window(v_auth.document, v_step);
    v_at := greatest(
      private.next_send_slot(coalesce(p_base, private.clock_now()), private.step_delay(v_step), v_window),
      private.next_send_slot(private.clock_now(), 0, v_window));
    -- Ritmo ligado: o horário ganha a variação do canal, sem sair da janela, e a entrada da Conta espera vaga.
    if private.send_rate_enabled() then
      v_at := private.jittered_send_slot(v_at, v_window, (
        select r.schedule_jitter_seconds from private.send_rate(v_workspace, v_step ->> 'canal') r));
      v_entry_kind := private.company_entry_kind(v_step ->> 'canal');
      if v_entry_kind is not null and v_account ~* '^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$' then
        select a.id into v_sender_id
        from private.sender_accounts a
        where a.workspace_id = v_workspace and a.owner_user_id = v_owner and a.channel = v_step ->> 'canal'
          and a.status = 'ready' and not a.reconciliation_required
        order by a.last_status_at desc
        limit 1;
        if v_sender_id is not null then
          v_at := private.place_company_entry(v_sender_id, v_workspace, v_account::uuid, v_entry_kind, v_at, v_window);
        end if;
      end if;
    end if;
    update private.sequence_step_sends set
      status = case when mode = 'auto' then 'scheduled' else 'confirmed' end,
      scheduled_for = v_at,
      claimed_until = null,
      updated_at = now()
    where id = v_send.id;
    return v_send.id;
  end loop;
  return null;
end;
$$;

-- As reservas do Executor. Com o ritmo ligado, a fila é reequilibrada antes de escolher o passo.
create or replace function public.claim_due_step_sends(p_limit integer default 10)
returns table (send_id uuid, owner_user_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_pace boolean := private.send_rate_enabled();
begin
  perform private.expire_stale_sends(null);
  if v_pace then
    perform private.rebalance_due_company_entries();
  end if;

  return query
  with eligible as (
    select e.id,
      case when v_pace then row_number() over (partition by e.workspace_id, e.owner_user_id order by e.scheduled_for, e.id) else 1 end as rn
    from private.sequence_step_sends e
    join public.sequences s on s.id = e.sequence_id and s.status = 'ativa'
    join private.sequence_authorizations a on a.id = e.authorization_id and a.revoked_at is null
    where e.channel = 'email'
      and e.status = 'scheduled' and e.scheduled_for <= private.clock_now()
      and (e.claimed_until is null or e.claimed_until < now())
  ), due as (
    select e.id from private.sequence_step_sends e
    join eligible g on g.id = e.id and g.rn = 1
    order by e.scheduled_for
    limit greatest(1, least(coalesce(p_limit, 10), 50))
    for update of e skip locked
  )
  update private.sequence_step_sends e set claimed_until = now() + interval '2 minutes'
  from due
  where e.id = due.id
  returning e.id, e.owner_user_id;
end;
$$;

create or replace function public.claim_due_chat_step_sends(p_limit integer default 10)
returns table (send_id uuid, owner_user_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_pace boolean := private.send_rate_enabled();
begin
  perform private.expire_stale_sends(null);
  if v_pace then
    perform private.rebalance_due_company_entries();
  end if;

  return query
  with eligible as (
    select e.id,
      case when v_pace then row_number() over (partition by e.workspace_id, e.owner_user_id, e.channel order by e.scheduled_for, e.id) else 1 end as rn
    from private.sequence_step_sends e
    join public.sequences s on s.id = e.sequence_id and s.status = 'ativa'
    join private.sequence_authorizations a on a.id = e.authorization_id and a.revoked_at is null
    where e.channel in ('whatsapp', 'linkedin') and private.chat_channel_enabled(e.channel)
      and e.status = 'scheduled' and e.scheduled_for <= private.clock_now()
      and (e.claimed_until is null or e.claimed_until < now())
  ), due as (
    select e.id from private.sequence_step_sends e
    join eligible g on g.id = e.id and g.rn = 1
    order by e.scheduled_for
    limit greatest(1, least(coalesce(p_limit, 10), 50))
    for update of e skip locked
  )
  update private.sequence_step_sends e set claimed_until = now() + interval '2 minutes'
  from due
  where e.id = due.id
  returning e.id, e.owner_user_id;
end;
$$;

-- O administrador fixa um número e a faixa sorteada deixa de valer. Nulo continua sendo sem limite.
create or replace function public.set_send_cap(p_workspace_id uuid, p_kind text, p_period text, p_max_sends integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_workspace_admin(p_workspace_id);
  if p_kind is null or p_kind not in (
    'email', 'linkedin_invite', 'linkedin_message', 'whatsapp_new_contact', 'whatsapp_message',
    'whatsapp_new_company', 'email_new_company', 'linkedin_new_company') then
    raise exception 'unknown kind of send' using errcode = '22023';
  end if;
  if p_period is null or p_period not in ('day', 'week') then
    raise exception 'unknown period' using errcode = '22023';
  end if;
  if p_max_sends is not null and (p_max_sends < 1 or p_max_sends > 100000) then
    raise exception 'a cap must be at least 1, or null for no limit' using errcode = '22023';
  end if;
  insert into private.send_caps (workspace_id, kind, period, max_sends, min_sends)
  values (p_workspace_id, p_kind, p_period, p_max_sends, null)
  on conflict (workspace_id, kind, period) do update
    set max_sends = excluded.max_sends, min_sends = null, updated_at = now();
end;
$$;

-- O que a tela lê: X de Y hoje e quantas Contas estão na fila do próximo dia útil, por remetente do titular.
create function public.list_my_sender_entry_quotas(p_workspace_id uuid)
returns table (
  sender_account_id uuid,
  channel text,
  used_today integer,
  cap_today integer,
  queued_for_tomorrow integer,
  warming boolean
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_today date := (private.clock_now() at time zone 'America/Sao_Paulo')::date;
  v_tomorrow date := private.next_business_day((private.clock_now() at time zone 'America/Sao_Paulo')::date);
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if not exists (
    select 1 from public.workspace_memberships m
    where m.workspace_id = p_workspace_id and m.user_id = v_user_id and m.active) then
    raise exception 'active workspace membership required' using errcode = '42501';
  end if;
  return query
  select a.id, a.channel,
    (select count(*)::integer from private.company_entry_slots q
      where q.sender_account_id = a.id and q.admitted_on = v_today),
    private.company_entry_cap(a.id, p_workspace_id, private.company_entry_kind(a.channel), v_today),
    (select count(*)::integer from private.company_entry_slots q
      where q.sender_account_id = a.id and q.consumed_at is null and q.admitted_on = v_tomorrow),
    exists (
      select 1 from private.send_warmup_ramp r
      where r.kind = private.company_entry_kind(a.channel)
        and r.day_index = v_today - (a.created_at at time zone 'America/Sao_Paulo')::date)
  from private.sender_accounts a
  where a.workspace_id = p_workspace_id and a.owner_user_id = v_user_id
    and a.status = 'ready' and not a.reconciliation_required
    and private.company_entry_kind(a.channel) is not null
  order by a.channel, a.created_at;
end;
$$;

revoke all on function public.list_my_sender_entry_quotas(uuid) from public, anon;
grant execute on function public.list_my_sender_entry_quotas(uuid) to authenticated;


-- 5. A liberação passa primeiro pela vaga da empresa e, se houver vaga hoje, pelo teto de mensagem que já existia.
create or replace function private.release_step_send(p_send_id uuid, p_user_id uuid, p_due_only boolean)
returns table (
  outcome text, send_id uuid, unipile_account_id text, destination text, contact_name text,
  subject text, body text, reply_to_message_id text,
  tracking_header_name text, tracking_header_value text
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_send private.sequence_step_sends;
  v_sequence public.sequences;
  v_sender private.sender_accounts;
  v_contact public.contacts;
  v_auth private.sequence_authorizations;
  v_step jsonb;
  v_subject text;
  v_body text;
  v_reply_to text;
  v_blocked text;
  v_account public.target_accounts;
  v_owner_name text;
  v_window jsonb;
  v_slot timestamptz;
  v_pace boolean := private.send_rate_enabled();
  v_gate_reason text;
  v_gate_at timestamptz;
begin
  select e.* into v_send from private.sequence_step_sends e where e.id = p_send_id;
  if not found then
    raise exception 'send not found' using errcode = 'P0002';
  end if;

  -- A trava da Sequência serializa os envios dela e espera uma pausa concorrente terminar.
  select s.* into v_sequence from public.sequences s where s.id = v_send.sequence_id for update;
  select e.* into v_send from private.sequence_step_sends e where e.id = p_send_id for update;

  if p_user_id is null or p_user_id <> v_send.owner_user_id or p_user_id <> v_sequence.owner_user_id
    or not exists (
      select 1 from public.workspace_memberships m
      where m.workspace_id = v_sequence.workspace_id and m.user_id = p_user_id and m.active)
    or not exists (
      select 1 from public.sales_responsibilities r
      where r.workspace_id = v_sequence.workspace_id
        and r.target_account_id = v_sequence.target_account_id and r.owner_user_id = p_user_id) then
    v_blocked := 'owner_not_responsible';
  end if;

  if v_blocked is null and v_send.status = 'sending' then
    perform private.expire_stale_sends(v_send.id);
    select e.status into v_send.status from private.sequence_step_sends e where e.id = v_send.id;
  end if;

  if v_blocked is null then
    v_blocked := case v_send.status
      when 'sending' then 'in_flight'
      when 'sent' then 'already_sent'
      when 'uncertain' then 'reconcile_required'
      when 'scheduled' then null
      when 'confirmed' then case when p_due_only then 'not_scheduled' end
      else 'not_confirmed'
    end;
  end if;

  -- O passo de uma versão autorizada só sai na hora dele, pelo executor ou pela ação explícita do titular.
  if v_blocked is null and (p_due_only or v_send.authorization_id is not null)
    and (v_send.scheduled_for is null or v_send.scheduled_for > private.clock_now()) then
    v_blocked := 'not_due';
  end if;

  if v_blocked is null and v_sequence.status <> 'ativa' then
    v_blocked := 'sequence_not_active';
  end if;

  -- O conteúdo sai da versão autorizada; a confirmação avulsa (sem versão) usa o documento atual.
  if v_blocked is null and v_send.authorization_id is not null then
    select a.* into v_auth from private.sequence_authorizations a
    where a.id = v_send.authorization_id and a.revoked_at is null;
    if not found then
      v_blocked := 'authorization_revoked';
    end if;
  end if;

  if v_blocked is null then
    v_step := case when v_auth.id is not null
      then private.authorized_step(v_auth.id, v_send.step_id)
      else private.sequence_step(v_sequence.id, v_send.step_id) end;
    if v_step is null then
      v_blocked := 'step_missing';
    end if;
  end if;

  -- Só dentro da janela. Atrasado (ex.: executor fora do ar), o passo automático vai para o próximo horário válido.
  if v_blocked is null and v_auth.id is not null then
    v_window := private.step_window(v_auth.document, v_step);
    v_slot := private.next_send_slot(private.clock_now(), 0, v_window);
    if v_slot > private.clock_now() then
      if p_due_only then
        update private.sequence_step_sends set
          scheduled_for = case when v_pace then private.jittered_send_slot(v_slot, v_window, (
            select x.schedule_jitter_seconds from private.send_rate(v_sequence.workspace_id, 'email') x)) else v_slot end,
          claimed_until = null, updated_at = now()
        where id = v_send.id;
      end if;
      v_blocked := 'outside_window';
    end if;
  end if;

  if v_blocked is null then
    select a.* into v_sender from private.sender_accounts a
    where a.workspace_id = v_sequence.workspace_id and a.owner_user_id = p_user_id
      and a.channel = 'email' and a.status = 'ready' and not a.reconciliation_required
    order by a.last_status_at desc
    limit 1;
    if not found then
      v_blocked := 'sender_not_ready';
    elsif v_pace then
      -- A linha da Conta fica travada até o fim da transação: dois envios da mesma Conta não passam juntos pelo intervalo.
      select a.* into v_sender from private.sender_accounts a where a.id = v_sender.id for update;
    end if;
  end if;

  if v_blocked is null then
    -- O Contato precisa continuar vinculado à Conta-alvo: quem saiu da empresa não recebe o passo.
    select c.* into v_contact from public.contacts c
    where c.id = v_send.contact_id and c.workspace_id = v_sequence.workspace_id;
    if not found or not exists (
      select 1 from public.contact_account_links l
      where l.contact_id = v_send.contact_id and l.target_account_id = v_sequence.target_account_id::uuid
        and l.ended_at is null) then
      v_blocked := 'contact_unlinked';
    -- ADR-0014: um Destino que o Contato não tem mais (nem como principal, nem como adicional) não sai nem para o
    -- antigo nem para outro: o passo espera a reconfirmação.
    elsif not private.contact_has_email(v_contact.id, v_send.destination) then
      v_blocked := 'destination_changed';
    -- Um endereço que já voltou nesta Sequência não recebe o passo automático seguinte; o titular ainda pode
    -- reconfirmar e enviar por conta própria.
    elsif p_due_only and exists (
      select 1 from private.sequence_step_sends b
      where b.sequence_id = v_sequence.id and b.id <> v_send.id and b.status = 'bounced'
        and b.destination = v_send.destination) then
      v_blocked := 'destination_bounced';
    end if;
    if v_blocked is not null then
      update private.sequence_step_sends set
        status = 'awaiting_reconfirmation', claimed_until = null,
        last_error = v_blocked, last_error_at = now(), updated_at = now()
      where id = v_send.id;
    end if;
  end if;

  -- O ritmo da Conta remetente: o intervalo desde o último envio e os limites do dia e da semana. O passo automático
  -- vai para o próximo horário possível, com o motivo; o pedido à mão do titular só recebe a resposta.
  if v_blocked is null and v_pace then
    select g.reason, g.retry_at into v_gate_reason, v_gate_at
    from private.company_entry_gate(v_sender.id, v_sequence.workspace_id, 'email', v_sequence.target_account_id, v_window) g;
    if v_gate_reason is null then
      select g.reason, g.retry_at into v_gate_reason, v_gate_at
      from private.send_rate_gate(v_sender.id, v_sequence.workspace_id, 'email', 'email', v_window) g;
    end if;
    if v_gate_reason is not null then
      if p_due_only then
        update private.sequence_step_sends set
          scheduled_for = v_gate_at, claimed_until = null, deferred_reason = v_gate_reason, updated_at = now()
        where id = v_send.id;
      end if;
      v_blocked := v_gate_reason;
    end if;
  end if;

  -- Um bloqueio que deixa o passo programado (sem Conta remetente pronta, titular sem Participação) fica gravado
  -- com o motivo, e o executor só tenta de novo em 15 minutos.
  if v_blocked in ('sender_not_ready', 'owner_not_responsible', 'step_missing') and p_due_only then
    update private.sequence_step_sends set
      last_error = v_blocked, last_error_at = now(), claimed_until = now() + interval '15 minutes', updated_at = now()
    where id = v_send.id and status = 'scheduled';
  end if;

  if v_blocked is not null then
    return query select v_blocked, v_send.id, null::text, null::text, null::text,
      null::text, null::text, null::text, null::text, null::text;
    return;
  end if;

  v_subject := coalesce(nullif(btrim(v_step ->> 'assunto'), ''), nullif(btrim(v_step ->> 'titulo'), ''), '(sem assunto)');

  -- Um passo "Re: …" continua a conversa do último e-mail enviado ao mesmo Contato nesta Sequência.
  -- A Unipile pode não devolver message_id: então vale o enviado anterior que tem um (a conversa é a mesma).
  -- Sem nenhum anterior, o passo abre uma conversa nova.
  if v_subject ~* '^\s*re\s*:' then
    select e.provider_message_id into v_reply_to from private.sequence_step_sends e
    where e.sequence_id = v_sequence.id and e.contact_id = v_send.contact_id
      and e.status = 'sent' and e.provider_message_id is not null and e.id <> v_send.id
    order by e.sent_at desc
    limit 1;
  end if;

  -- As variáveis do passo ({{conta.nome}}, {{contato.primeiro_nome}}…) saem preenchidas, como na pré-visualização.
  select a.* into v_account from public.target_accounts a where a.id::text = v_sequence.target_account_id;
  select coalesce(nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''), nullif(btrim(u.raw_user_meta_data ->> 'name'), ''), u.email)
    into v_owner_name from auth.users u where u.id = p_user_id;
  v_subject := private.render_step_template(v_subject, v_account, v_contact, v_owner_name);
  v_body := private.render_step_template(coalesce(v_step ->> 'corpo', ''), v_account, v_contact, v_owner_name);

  -- O que sai fica guardado no Envio: o histórico do passo não depende do documento editado depois.
  update private.sequence_step_sends set
    status = 'sending', sender_account_id = v_sender.id, attempts = attempts + 1,
    sending_at = now(), claimed_until = null, subject = v_subject, body = v_body,
    rate_kind = 'email', deferred_reason = null, updated_at = now()
  where id = v_send.id;
  if v_pace then
    perform private.start_sender_pause(v_sender.id, v_sequence.workspace_id, 'email');
  end if;

  return query select 'released', v_send.id, v_sender.unipile_account_id, v_send.destination, v_contact.name,
    v_subject, v_body, v_reply_to, 'X-Althius-Envio', v_send.id::text;
end;
$$;

-- A liberação de WhatsApp e LinkedIn, com o ritmo da Conta remetente.
create or replace function private.release_chat_step_send(p_send_id uuid, p_user_id uuid, p_due_only boolean)
returns table (
  outcome text, send_id uuid, channel text, unipile_account_id text, destination text, contact_name text,
  body text, linkedin_subtype text, provider_chat_id text, provider_user_id text,
  invite_sent boolean, invite_note_limit integer
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_send private.sequence_step_sends;
  v_sequence public.sequences;
  v_sender private.sender_accounts;
  v_contact public.contacts;
  v_auth private.sequence_authorizations;
  v_step jsonb;
  v_body text;
  v_blocked text;
  v_account public.target_accounts;
  v_owner_name text;
  v_window jsonb;
  v_slot timestamptz;
  v_pace boolean := private.send_rate_enabled();
  v_kind text;
  v_gate_reason text;
  v_gate_at timestamptz;
  v_chat_id text;
  v_user_ref text;
  v_invite_sent boolean := false;
begin
  select e.* into v_send from private.sequence_step_sends e where e.id = p_send_id;
  if not found then
    raise exception 'send not found' using errcode = 'P0002';
  end if;

  -- A trava da Sequência serializa os envios dela e espera uma pausa concorrente terminar.
  select s.* into v_sequence from public.sequences s where s.id = v_send.sequence_id for update;
  select e.* into v_send from private.sequence_step_sends e where e.id = p_send_id for update;

  if v_send.channel not in ('whatsapp', 'linkedin') then
    return query select 'wrong_channel', v_send.id, null::text, null::text, null::text, null::text,
      null::text, null::text, null::text, null::text, null::boolean, null::integer;
    return;
  end if;

  if p_user_id is null or p_user_id <> v_send.owner_user_id or p_user_id <> v_sequence.owner_user_id
    or not exists (
      select 1 from public.workspace_memberships m
      where m.workspace_id = v_sequence.workspace_id and m.user_id = p_user_id and m.active)
    or not exists (
      select 1 from public.sales_responsibilities r
      where r.workspace_id = v_sequence.workspace_id
        and r.target_account_id = v_sequence.target_account_id and r.owner_user_id = p_user_id) then
    v_blocked := 'owner_not_responsible';
  end if;

  if v_blocked is null and v_send.status = 'sending' then
    perform private.expire_stale_sends(v_send.id);
    select e.status into v_send.status from private.sequence_step_sends e where e.id = v_send.id;
  end if;

  if v_blocked is null then
    v_blocked := case v_send.status
      when 'sending' then 'in_flight'
      when 'sent' then 'already_sent'
      when 'uncertain' then 'reconcile_required'
      when 'scheduled' then null
      when 'confirmed' then case when p_due_only then 'not_scheduled' end
      else 'not_confirmed'
    end;
  end if;

  if v_blocked is null and (p_due_only or v_send.authorization_id is not null)
    and (v_send.scheduled_for is null or v_send.scheduled_for > private.clock_now()) then
    v_blocked := 'not_due';
  end if;

  if v_blocked is null and v_sequence.status <> 'ativa' then
    v_blocked := 'sequence_not_active';
  end if;

  -- O interruptor também é um freio: desligado, nada de conversa sai.
  if v_blocked is null and not private.chat_channel_enabled(v_send.channel) then
    v_blocked := 'channel_not_enabled';
  end if;

  if v_blocked is null and v_send.authorization_id is not null then
    select a.* into v_auth from private.sequence_authorizations a
    where a.id = v_send.authorization_id and a.revoked_at is null;
    if not found then
      v_blocked := 'authorization_revoked';
    end if;
  end if;

  if v_blocked is null then
    v_step := case when v_auth.id is not null
      then private.authorized_step(v_auth.id, v_send.step_id)
      else private.sequence_step(v_sequence.id, v_send.step_id) end;
    if v_step is null then
      v_blocked := 'step_missing';
    end if;
  end if;

  if v_blocked is null and v_auth.id is not null then
    v_window := private.step_window(v_auth.document, v_step);
    v_slot := private.next_send_slot(private.clock_now(), 0, v_window);
    if v_slot > private.clock_now() then
      if p_due_only then
        update private.sequence_step_sends set
          scheduled_for = case when v_pace then private.jittered_send_slot(v_slot, v_window, (
            select x.schedule_jitter_seconds from private.send_rate(v_sequence.workspace_id, v_send.channel) x)) else v_slot end,
          claimed_until = null, updated_at = now()
        where id = v_send.id;
      end if;
      v_blocked := 'outside_window';
    end if;
  end if;

  if v_blocked is null then
    select a.* into v_sender from private.sender_accounts a
    where a.workspace_id = v_sequence.workspace_id and a.owner_user_id = p_user_id
      and a.channel = v_send.channel and a.status = 'ready' and not a.reconciliation_required
    order by a.last_status_at desc
    limit 1;
    if not found then
      v_blocked := 'sender_not_ready';
    elsif v_pace then
      -- A linha da Conta fica travada até o fim da transação: dois envios da mesma Conta não passam juntos pelo intervalo.
      select a.* into v_sender from private.sender_accounts a where a.id = v_sender.id for update;
    end if;
  end if;

  if v_blocked is null then
    -- O Contato precisa continuar vinculado à Conta-alvo: quem saiu da empresa não recebe o passo.
    select c.* into v_contact from public.contacts c
    where c.id = v_send.contact_id and c.workspace_id = v_sequence.workspace_id;
    if not found or not exists (
      select 1 from public.contact_account_links l
      where l.contact_id = v_send.contact_id and l.target_account_id = v_sequence.target_account_id::uuid
        and l.ended_at is null) then
      v_blocked := 'contact_unlinked';
    -- ADR-0014: um Destino que o Contato não tem mais (ou que deixou de usar WhatsApp, ou outro perfil) não sai nem
    -- para o antigo nem para outro: o passo espera a reconfirmação.
    elsif v_send.channel = 'whatsapp' and not private.contact_has_whatsapp_phone(v_contact.id, v_send.destination) then
      v_blocked := 'destination_changed';
    elsif v_send.channel = 'linkedin' and v_contact.linkedin is distinct from v_send.destination then
      v_blocked := 'destination_changed';
    end if;
    if v_blocked is not null then
      update private.sequence_step_sends set
        status = 'awaiting_reconfirmation', claimed_until = null,
        last_error = v_blocked, last_error_at = now(), updated_at = now()
      where id = v_send.id;
    end if;
  end if;

  -- O tipo do envio para os limites. No LinkedIn vale a intenção do passo (convite ou mensagem); a Unipile só decide
  -- na hora se a pessoa já é conexão. No WhatsApp, a primeira mensagem a um número por esta Conta é "contato novo".
  if v_blocked is null then
    v_kind := case v_send.channel
      when 'linkedin' then case when coalesce(v_step ->> 'subtipoLinkedIn', 'convite') = 'convite'
        then 'linkedin_invite' else 'linkedin_message' end
      else case when exists (
        select 1 from private.sequence_step_sends p
        where p.sender_account_id = v_sender.id and p.channel = 'whatsapp' and p.destination = v_send.destination
          and p.status in ('sent', 'uncertain') and p.id <> v_send.id) then 'whatsapp_message' else 'whatsapp_new_contact' end
    end;
  end if;

  -- O ritmo da Conta remetente: o intervalo desde o último envio e os limites do dia e da semana. O passo automático
  -- vai para o próximo horário possível, com o motivo; o pedido à mão do titular só recebe a resposta.
  if v_blocked is null and v_pace then
    select g.reason, g.retry_at into v_gate_reason, v_gate_at
    from private.company_entry_gate(v_sender.id, v_sequence.workspace_id, v_send.channel, v_sequence.target_account_id, v_window) g;
    if v_gate_reason is null then
      select g.reason, g.retry_at into v_gate_reason, v_gate_at
      from private.send_rate_gate(v_sender.id, v_sequence.workspace_id, v_send.channel, v_kind, v_window) g;
    end if;
    if v_gate_reason is not null then
      if p_due_only then
        update private.sequence_step_sends set
          scheduled_for = v_gate_at, claimed_until = null, deferred_reason = v_gate_reason, updated_at = now()
        where id = v_send.id;
      end if;
      v_blocked := v_gate_reason;
    end if;
  end if;

  -- Um bloqueio que deixa o passo programado fica gravado com o motivo, e o Executor só tenta de novo em 15 minutos.
  if v_blocked in ('sender_not_ready', 'owner_not_responsible', 'step_missing', 'channel_not_enabled') and p_due_only then
    update private.sequence_step_sends set
      last_error = v_blocked, last_error_at = now(), claimed_until = now() + interval '15 minutes', updated_at = now()
    where id = v_send.id and status = 'scheduled';
  end if;

  if v_blocked is not null then
    return query select v_blocked, v_send.id, null::text, null::text, null::text, null::text,
      null::text, null::text, null::text, null::text, null::boolean, null::integer;
    return;
  end if;

  -- A conversa já aberta com este Contato por esta Conta remetente, se houver, e o convite que já saiu.
  select p.provider_chat_id, p.provider_user_id into v_chat_id, v_user_ref
  from private.sequence_step_sends p
  where p.sequence_id = v_sequence.id and p.contact_id = v_send.contact_id and p.id <> v_send.id
    and p.sender_account_id = v_sender.id and p.channel = v_send.channel
    and p.status in ('sent', 'uncertain') and (p.provider_chat_id is not null or p.provider_user_id is not null)
  order by coalesce(p.sent_at, p.sending_at) desc
  limit 1;
  if v_send.channel = 'linkedin' then
    v_invite_sent := exists (
      select 1 from private.sequence_step_sends p
      where p.sequence_id = v_sequence.id and p.contact_id = v_send.contact_id and p.id <> v_send.id
        and p.channel = 'linkedin' and p.linkedin_action = 'convite' and p.status in ('sent', 'uncertain'));
  end if;

  -- As variáveis do passo saem preenchidas, como na pré-visualização.
  select a.* into v_account from public.target_accounts a where a.id::text = v_sequence.target_account_id;
  select coalesce(nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''), nullif(btrim(u.raw_user_meta_data ->> 'name'), ''), u.email)
    into v_owner_name from auth.users u where u.id = p_user_id;
  v_body := private.render_step_template(coalesce(v_step ->> 'corpo', ''), v_account, v_contact, v_owner_name);

  -- O que sai fica guardado no Envio: o histórico do passo não depende do documento editado depois.
  update private.sequence_step_sends set
    status = 'sending', sender_account_id = v_sender.id, attempts = attempts + 1,
    sending_at = now(), claimed_until = null, body = v_body, rate_kind = v_kind, deferred_reason = null, updated_at = now()
  where id = v_send.id;
  if v_pace then
    perform private.start_sender_pause(v_sender.id, v_sequence.workspace_id, v_send.channel);
  end if;

  return query select 'released', v_send.id, v_send.channel, v_sender.unipile_account_id, v_send.destination,
    v_contact.name, v_body,
    case when v_send.channel = 'linkedin' then coalesce(v_step ->> 'subtipoLinkedIn', 'convite') end,
    v_chat_id, v_user_ref, v_invite_sent, private.linkedin_invite_note_limit();
end;
$$;

