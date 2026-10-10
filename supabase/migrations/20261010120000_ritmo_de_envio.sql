-- Ritmo de envio por Conta remetente (anti-bloqueio no LinkedIn e no WhatsApp). Até aqui o Executor mandava até 5 e-mails
-- e 5 mensagens de conversa por execução, a cada minuto, sem pausa, e todo passo com a janela das 09:00 caía às
-- 09:00:00: com 50 passos da mesma Conta, o ritmo era perfeitamente regular. Esta migration ensina o banco a:
--
--   1. variar o horário de cada passo (um deslocamento aleatório que nunca sai da janela);
--   2. guardar, por Conta remetente, o próximo horário permitido: depois de cada envio a Conta espera um intervalo
--      aleatório (LinkedIn 2 a 5 min, WhatsApp 1 a 3 min, E-mail 20 a 60 s) e um passo que chega antes da hora é
--      reagendado, não enviado;
--   3. limitar os envios por dia e por semana de cada Conta, por tipo (convite e mensagem do LinkedIn, contato novo e
--      mensagem do WhatsApp, e-mail), contando só os `sent`, no dia de Brasília; batido o limite, o passo vai para o
--      próximo dia útil (ou a próxima segunda) dentro da janela, sem erro, sem envio e sem "incerto";
--   4. reservar no máximo um passo por Conta remetente por rodada do Executor, para uma Conta com fila não ocupar o
--      lote das outras, e renovar a reserva de 2 minutos de um lote lento (renew_due_step_send_claims);
--   5. guardar o motivo do adiamento (`rate_limited`, `daily_cap`, `weekly_cap`) para a tela dizer "agendado para
--      HH:MM por limite da conta".
--
-- O ritmo nasce DESLIGADO (private.send_rate_switch), como o interruptor dos canais de conversa: ligar muda o horário
-- de todos os passos, então é um passo do Nan (select private.set_send_rate_enabled(true)). Desligado, nada do que o
-- E-mail e a v2 faziam muda; só se guarda o tipo de cada envio (rate_kind), para os limites já nascerem com a conta do dia.
--
-- Aditiva. Redefine, a partir da definição mais recente da main: private.schedule_next_step e
-- public.claim_due_step_sends (canais-06/07), private.release_step_send (varios-emails), private.release_chat_step_send
-- e public.claim_due_chat_step_sends (canais-06/07). Nenhuma assinatura muda.

-- 1. O interruptor global. Uma linha só.
create table private.send_rate_switch (
  singleton boolean primary key default true check (singleton),
  enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

insert into private.send_rate_switch (singleton) values (true);

alter table private.send_rate_switch enable row level security;
revoke all on private.send_rate_switch from public, anon, authenticated, service_role;

comment on table private.send_rate_switch is
  'Whether the sending pace (schedule variation, interval between sends and caps per sender account) is applied. Off by '
  'default: turning it on changes the time of every pending step.';

create function private.send_rate_enabled()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select s.enabled from private.send_rate_switch s), false);
$$;

revoke all on function private.send_rate_enabled() from public, anon, authenticated, service_role;

-- Passo do Nan, no SQL Editor: select private.set_send_rate_enabled(true);
create function private.set_send_rate_enabled(p_enabled boolean)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update private.send_rate_switch set enabled = coalesce(p_enabled, false), updated_at = now();
  return coalesce(p_enabled, false);
end;
$$;

revoke all on function private.set_send_rate_enabled(boolean) from public, anon, authenticated, service_role;

-- 2. Os padrões e as configurações por Workspace. workspace_id nulo é o padrão da plataforma; uma linha do Workspace o
-- substitui. Num limite, max_sends nulo é "sem limite" (a linha do Workspace tira o limite padrão).
create table private.send_rate_settings (
  workspace_id uuid references public.workspaces(id) on delete cascade,
  channel text not null check (channel in ('email', 'whatsapp', 'linkedin')),
  min_gap_seconds integer not null check (min_gap_seconds between 0 and 86400),
  max_gap_seconds integer not null check (max_gap_seconds between 0 and 86400),
  schedule_jitter_seconds integer not null check (schedule_jitter_seconds between 0 and 21600),
  updated_at timestamptz not null default now(),
  check (min_gap_seconds <= max_gap_seconds),
  unique nulls not distinct (workspace_id, channel)
);

create table private.send_caps (
  workspace_id uuid references public.workspaces(id) on delete cascade,
  kind text not null check (kind in (
    'email', 'linkedin_invite', 'linkedin_message', 'whatsapp_new_contact', 'whatsapp_message'
  )),
  period text not null check (period in ('day', 'week')),
  max_sends integer check (max_sends > 0),
  updated_at timestamptz not null default now(),
  unique nulls not distinct (workspace_id, kind, period)
);

alter table private.send_rate_settings enable row level security;
alter table private.send_caps enable row level security;
revoke all on private.send_rate_settings, private.send_caps from public, anon, authenticated, service_role;

comment on table private.send_rate_settings is
  'Interval between sends of the same sender account and variation of the step time, per channel. A null workspace_id is '
  'the platform default. Seconds.';
comment on table private.send_caps is
  'Sends allowed per sender account per local day or ISO week, per kind of send. A null workspace_id is the platform '
  'default; a null max_sends is no limit.';

insert into private.send_rate_settings (workspace_id, channel, min_gap_seconds, max_gap_seconds, schedule_jitter_seconds) values
  (null, 'email', 20, 60, 120),
  (null, 'whatsapp', 60, 180, 900),
  (null, 'linkedin', 120, 300, 900);

insert into private.send_caps (workspace_id, kind, period, max_sends) values
  (null, 'email', 'day', 100),
  (null, 'linkedin_invite', 'day', 20),
  (null, 'linkedin_invite', 'week', 100),
  (null, 'linkedin_message', 'day', 50),
  (null, 'whatsapp_new_contact', 'day', 25),
  (null, 'whatsapp_message', 'day', 100);

-- O valor que vale para um Workspace: o dele, se houver, senão o padrão.
create function private.send_rate(p_workspace_id uuid, p_channel text)
returns table (min_gap_seconds integer, max_gap_seconds integer, schedule_jitter_seconds integer)
language sql
stable
security definer
set search_path = ''
as $$
  select s.min_gap_seconds, s.max_gap_seconds, s.schedule_jitter_seconds
  from private.send_rate_settings s
  where s.channel = p_channel and (s.workspace_id = p_workspace_id or s.workspace_id is null)
  order by (s.workspace_id is null)
  limit 1;
$$;

revoke all on function private.send_rate(uuid, text) from public, anon, authenticated, service_role;

create function private.send_cap(p_workspace_id uuid, p_kind text, p_period text)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select c.max_sends
  from private.send_caps c
  where c.kind = p_kind and c.period = p_period and (c.workspace_id = p_workspace_id or c.workspace_id is null)
  order by (c.workspace_id is null)
  limit 1;
$$;

revoke all on function private.send_cap(uuid, text, text) from public, anon, authenticated, service_role;

-- 3. O que cada Conta remetente e cada Envio guardam.
--   next_send_allowed_at  quando a Conta pode enviar de novo (definido a cada envio liberado);
--   rate_kind             o tipo do envio para os limites (gravado quando o Envio é liberado);
--   deferred_reason       por que o passo foi adiado e ainda espera (limpo quando ele é liberado).
alter table private.sender_accounts add column next_send_allowed_at timestamptz;

alter table private.sequence_step_sends
  add column rate_kind text check (rate_kind in (
    'email', 'linkedin_invite', 'linkedin_message', 'whatsapp_new_contact', 'whatsapp_message'
  )),
  add column deferred_reason text check (deferred_reason in ('rate_limited', 'daily_cap', 'weekly_cap'));

create index sequence_step_sends_rate_idx
  on private.sequence_step_sends (sender_account_id, rate_kind, sent_at) where status = 'sent';

-- Os envios que já saíram entram na conta do dia (o WhatsApp de antes conta como mensagem comum).
update private.sequence_step_sends set rate_kind = case channel
  when 'email' then 'email'
  when 'linkedin' then case when linkedin_action = 'convite' then 'linkedin_invite' else 'linkedin_message' end
  else 'whatsapp_message' end
where status = 'sent' and rate_kind is null;

-- 4. A variação do horário: soma de 0 a p_max_seconds ao horário p_slot, sem sair da janela do passo (ela termina 1
-- segundo antes do fim). volatile de propósito: dois agendamentos iguais não caem no mesmo segundo. Os testes fixam a
-- semente com setseed().
create function private.jittered_send_slot(p_slot timestamptz, p_window jsonb, p_max_seconds integer)
returns timestamptz
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_local timestamp := p_slot at time zone 'America/Sao_Paulo';
  v_from time := private.window_time(p_window ->> 'de', '09:00');
  v_to time := private.window_time(p_window ->> 'ate', '18:00');
  v_room double precision;
begin
  if coalesce(p_max_seconds, 0) <= 0 then
    return p_slot;
  end if;
  if v_to <= v_from then
    v_to := '18:00';
  end if;
  v_room := extract(epoch from ((v_local::date + v_to) - v_local)) - 1;
  if v_room <= 0 then
    return p_slot;
  end if;
  return p_slot + make_interval(secs => random() * least(p_max_seconds, v_room));
end;
$$;

revoke all on function private.jittered_send_slot(timestamptz, jsonb, integer) from public, anon, authenticated, service_role;

-- 5. A porta do envio. Quem chama já travou a linha da Conta remetente. Devolve o motivo e o novo horário quando o
-- envio não pode sair agora; nenhuma linha quando pode. Primeiro os limites (um passo que não sai hoje não espera o
-- intervalo), depois o intervalo. Conta só `sent`, no dia e na semana (segunda a domingo) de Brasília.
create function private.send_rate_gate(p_sender_id uuid, p_workspace_id uuid, p_channel text, p_kind text, p_window jsonb)
returns table (reason text, retry_at timestamptz)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_tz constant text := 'America/Sao_Paulo';
  v_now timestamptz := private.clock_now();
  v_day date := (private.clock_now() at time zone 'America/Sao_Paulo')::date;
  v_week date := date_trunc('week', private.clock_now() at time zone 'America/Sao_Paulo')::date;
  v_jitter integer;
  v_cap integer;
  v_count integer;
  v_allowed timestamptz;
  v_slot timestamptz;
begin
  select r.schedule_jitter_seconds into v_jitter from private.send_rate(p_workspace_id, p_channel) r;

  v_cap := private.send_cap(p_workspace_id, p_kind, 'week');
  if v_cap is not null then
    select count(*)::integer into v_count from private.sequence_step_sends e
    where e.sender_account_id = p_sender_id and e.rate_kind = p_kind and e.status = 'sent'
      and e.sent_at >= (v_week::timestamp at time zone v_tz)
      and e.sent_at < ((v_week + 7)::timestamp at time zone v_tz);
    if v_count >= v_cap then
      return query select 'weekly_cap', private.jittered_send_slot(
        private.next_send_slot((v_week + 7)::timestamp at time zone v_tz, 0, p_window), p_window, v_jitter);
      return;
    end if;
  end if;

  v_cap := private.send_cap(p_workspace_id, p_kind, 'day');
  if v_cap is not null then
    select count(*)::integer into v_count from private.sequence_step_sends e
    where e.sender_account_id = p_sender_id and e.rate_kind = p_kind and e.status = 'sent'
      and e.sent_at >= (v_day::timestamp at time zone v_tz)
      and e.sent_at < ((v_day + 1)::timestamp at time zone v_tz);
    if v_count >= v_cap then
      return query select 'daily_cap', private.jittered_send_slot(
        private.next_send_slot((v_day + 1)::timestamp at time zone v_tz, 0, p_window), p_window, v_jitter);
      return;
    end if;
  end if;

  select a.next_send_allowed_at into v_allowed from private.sender_accounts a where a.id = p_sender_id;
  if v_allowed is not null and v_allowed > v_now then
    -- Dentro da janela o passo sai assim que a Conta puder; fora dela, no início da próxima, com a variação.
    v_slot := private.next_send_slot(v_allowed, 0, p_window);
    if v_slot > v_allowed then
      v_slot := private.jittered_send_slot(v_slot, p_window, v_jitter);
    end if;
    return query select 'rate_limited', v_slot;
  end if;
end;
$$;

revoke all on function private.send_rate_gate(uuid, uuid, text, text, jsonb) from public, anon, authenticated, service_role;

-- Depois de liberar um envio, a Conta só pode enviar de novo daqui a um intervalo aleatório do canal.
create function private.start_sender_pause(p_sender_id uuid, p_workspace_id uuid, p_channel text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_rate record;
begin
  select r.* into v_rate from private.send_rate(p_workspace_id, p_channel) r;
  update private.sender_accounts set next_send_allowed_at = private.clock_now()
    + make_interval(secs => v_rate.min_gap_seconds + random() * (v_rate.max_gap_seconds - v_rate.min_gap_seconds))
  where id = p_sender_id;
end;
$$;

revoke all on function private.start_sender_pause(uuid, uuid, text) from public, anon, authenticated, service_role;

-- Programar o próximo passo. Igual ao do canais-06/07; com o ritmo ligado, o horário ganha a variação aleatória do canal.
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
  v_step jsonb;
  v_send private.sequence_step_sends;
  v_window jsonb;
  v_at timestamptz;
begin
  select a.* into v_auth from private.sequence_authorizations a
  where a.sequence_id = p_sequence_id and a.revoked_at is null;
  if not found then
    return null;
  end if;
  select s.status, s.workspace_id into v_status, v_workspace from public.sequences s where s.id = p_sequence_id;
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
    -- Ritmo ligado: o horário ganha a variação do canal, sem sair da janela.
    if private.send_rate_enabled() then
      v_at := private.jittered_send_slot(v_at, v_window, (
        select r.schedule_jitter_seconds from private.send_rate(v_workspace, v_step ->> 'canal') r));
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

-- As reservas do Executor. Com o ritmo ligado, cada rodada reserva no máximo um passo por Conta remetente (o mais
-- antigo): uma Conta com fila não ocupa o lote das outras, e o intervalo da Conta é decidido na liberação.
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

-- A liberação do E-mail, com o ritmo da Conta remetente.
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
    from private.send_rate_gate(v_sender.id, v_sequence.workspace_id, 'email', 'email', v_window) g;
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
    from private.send_rate_gate(v_sender.id, v_sequence.workspace_id, v_send.channel, v_kind, v_window) g;
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

-- 6. A reserva de 2 minutos pode acabar no meio de um lote lento (5 envios de LinkedIn de até 50 s cada). O Executor a
-- renova antes de cada envio, para os passos que ainda esperam a vez: só o que continua programado e reservado.
create function public.renew_due_step_send_claims(p_send_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_renewed integer;
begin
  update private.sequence_step_sends e set claimed_until = now() + interval '2 minutes'
  where e.id = any (coalesce(p_send_ids, '{}'::uuid[]))
    and e.status = 'scheduled' and e.claimed_until > now();
  get diagnostics v_renewed = row_count;
  return v_renewed;
end;
$$;

revoke all on function public.renew_due_step_send_claims(uuid[]) from public, anon, authenticated;
grant execute on function public.renew_due_step_send_claims(uuid[]) to service_role;

-- 7. A configuração do Workspace: só o administrador lê e muda. A tela fica para outro ticket; aqui basta o RPC.
create function private.require_workspace_admin(p_workspace_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if not exists (
    select 1 from public.workspace_memberships m
    where m.workspace_id = p_workspace_id and m.user_id = auth.uid() and m.active and m.role = 'admin') then
    raise exception 'only a workspace admin can read or change the sending pace' using errcode = '42501';
  end if;
end;
$$;

revoke all on function private.require_workspace_admin(uuid) from public, anon, authenticated, service_role;

create function public.get_send_rate_settings(p_workspace_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_workspace_admin(p_workspace_id);
  return jsonb_build_object(
    'enabled', private.send_rate_enabled(),
    'pacing', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'channel', c.channel,
        'min_gap_seconds', r.min_gap_seconds,
        'max_gap_seconds', r.max_gap_seconds,
        'schedule_jitter_seconds', r.schedule_jitter_seconds,
        'is_default', not exists (
          select 1 from private.send_rate_settings w where w.workspace_id = p_workspace_id and w.channel = c.channel)
      ) order by c.channel), '[]'::jsonb)
      from (values ('email'), ('linkedin'), ('whatsapp')) c(channel),
        lateral private.send_rate(p_workspace_id, c.channel) r),
    'caps', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'kind', k.kind,
        'period', k.period,
        'max_sends', private.send_cap(p_workspace_id, k.kind, k.period),
        'is_default', not exists (
          select 1 from private.send_caps w
          where w.workspace_id = p_workspace_id and w.kind = k.kind and w.period = k.period)
      ) order by k.kind, k.period), '[]'::jsonb)
      from (select distinct x.kind, x.period from private.send_caps x
        where x.workspace_id is null or x.workspace_id = p_workspace_id) k));
end;
$$;

revoke all on function public.get_send_rate_settings(uuid) from public, anon;
grant execute on function public.get_send_rate_settings(uuid) to authenticated;

-- Intervalo mínimo e máximo entre dois envios da mesma Conta remetente do canal, e a variação máxima do horário do
-- passo, tudo em segundos.
create function public.set_send_pacing(
  p_workspace_id uuid,
  p_channel text,
  p_min_gap_seconds integer,
  p_max_gap_seconds integer,
  p_schedule_jitter_seconds integer
) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_workspace_admin(p_workspace_id);
  if p_channel is null or p_channel not in ('email', 'whatsapp', 'linkedin') then
    raise exception 'unknown channel' using errcode = '22023';
  end if;
  if p_min_gap_seconds is null or p_max_gap_seconds is null or p_schedule_jitter_seconds is null
    or p_min_gap_seconds < 0 or p_max_gap_seconds > 86400 or p_min_gap_seconds > p_max_gap_seconds
    or p_schedule_jitter_seconds < 0 or p_schedule_jitter_seconds > 21600 then
    raise exception 'invalid sending pace' using errcode = '22023';
  end if;
  insert into private.send_rate_settings (workspace_id, channel, min_gap_seconds, max_gap_seconds, schedule_jitter_seconds)
  values (p_workspace_id, p_channel, p_min_gap_seconds, p_max_gap_seconds, p_schedule_jitter_seconds)
  on conflict (workspace_id, channel) do update set
    min_gap_seconds = excluded.min_gap_seconds,
    max_gap_seconds = excluded.max_gap_seconds,
    schedule_jitter_seconds = excluded.schedule_jitter_seconds,
    updated_at = now();
end;
$$;

revoke all on function public.set_send_pacing(uuid, text, integer, integer, integer) from public, anon;
grant execute on function public.set_send_pacing(uuid, text, integer, integer, integer) to authenticated;

-- O limite de envios de um tipo por dia ou por semana da Conta remetente. p_max_sends nulo tira o limite.
create function public.set_send_cap(p_workspace_id uuid, p_kind text, p_period text, p_max_sends integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_workspace_admin(p_workspace_id);
  if p_kind is null or p_kind not in ('email', 'linkedin_invite', 'linkedin_message', 'whatsapp_new_contact', 'whatsapp_message') then
    raise exception 'unknown kind of send' using errcode = '22023';
  end if;
  if p_period is null or p_period not in ('day', 'week') then
    raise exception 'unknown period' using errcode = '22023';
  end if;
  if p_max_sends is not null and (p_max_sends < 1 or p_max_sends > 100000) then
    raise exception 'a cap must be at least 1, or null for no limit' using errcode = '22023';
  end if;
  insert into private.send_caps (workspace_id, kind, period, max_sends)
  values (p_workspace_id, p_kind, p_period, p_max_sends)
  on conflict (workspace_id, kind, period) do update set max_sends = excluded.max_sends, updated_at = now();
end;
$$;

revoke all on function public.set_send_cap(uuid, text, text, integer) from public, anon;
grant execute on function public.set_send_cap(uuid, text, text, integer) to authenticated;
