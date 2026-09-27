-- A Sequência roda com o navegador fechado (canais-05, PR 1: ativação, agenda e reserva no banco).
-- "Ativar envios" guarda a versão autorizada do documento e fixa o Destino de cada passo de E-mail pendente
-- (ADR-0014). Um passo por vez fica programado: o horário conta os dias úteis desde o envio anterior, de segunda a
-- sexta em America/Sao_Paulo (sem feriados), dentro da janela do passo. O executor (PR 2) reserva os passos
-- vencidos, e a liberação revalida tudo antes de cada envio. Editar um passo pendente revoga a autorização; retomar
-- uma Sequência pausada programa o passo seguinte a partir da retomada, sem rajada de atrasados. O status visual
-- "Ativa" herdado da demonstração nunca autoriza envio: só a versão autorizada.

-- 1. A versão autorizada: uma cópia do documento no momento da ativação.
create table private.sequence_authorizations (
  id uuid primary key default gen_random_uuid(),
  sequence_id uuid not null references public.sequences(id),
  version integer not null check (version > 0),
  document jsonb not null,
  authorized_by uuid not null references auth.users(id),
  authorized_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_reason text check (revoked_reason in ('edited', 'reactivated')),
  unique (sequence_id, version)
);

create unique index sequence_authorizations_active_idx
  on private.sequence_authorizations (sequence_id) where revoked_at is null;

alter table private.sequence_authorizations enable row level security;
revoke all on private.sequence_authorizations from public, anon, authenticated;
grant all on private.sequence_authorizations to service_role;

comment on table private.sequence_authorizations is
  'The version of a Sequência document that its owner authorized to run. At most one is active; editing a pending '
  'step or activating again revokes it. The executor sends only content from the active version.';

-- 2. O Envio do passo ganha a agenda: a versão, o modo, o horário, a reserva do executor e o conteúdo que saiu.
alter table private.sequence_step_sends
  add column authorization_id uuid references private.sequence_authorizations(id),
  add column mode text not null default 'manual' check (mode in ('auto', 'manual')),
  add column step_order integer,
  add column scheduled_for timestamptz,
  add column claimed_until timestamptz,
  add column subject text,
  add column body text;

-- waiting: autorizado, esperando o passo anterior. scheduled: sai sozinho no horário. confirmed: espera a ação
-- explícita do titular (E-mail manual ou confirmação avulsa). cancelled: a autorização foi revogada antes do envio.
alter table private.sequence_step_sends drop constraint sequence_step_sends_status_check;
alter table private.sequence_step_sends add constraint sequence_step_sends_status_check check (status in (
  'waiting', 'scheduled', 'confirmed', 'awaiting_reconfirmation', 'sending', 'sent', 'uncertain', 'failed',
  'bounced', 'cancelled'
));

create index sequence_step_sends_due_idx
  on private.sequence_step_sends (scheduled_for) where status = 'scheduled';
create index sequence_step_sends_authorization_idx
  on private.sequence_step_sends (authorization_id) where authorization_id is not null;

-- 3. O relógio: dias úteis em America/Sao_Paulo e a janela de horário do passo. Toda decisão de agenda lê a hora
-- em private.clock_now(), que é o now() da transação; os testes o substituem dentro da própria transação.
create function private.clock_now()
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select now();
$$;

revoke all on function private.clock_now() from public, anon, authenticated;

create function private.window_time(p_value text, p_default time)
returns time
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_value ~ '^\d{1,2}:\d{2}$' then
    return p_value::time;
  end if;
  return p_default;
exception when others then
  return p_default;
end;
$$;

revoke all on function private.window_time(text, time) from public, anon, authenticated;

-- A janela do passo, ou a janela padrão do documento.
create function private.step_window(p_document jsonb, p_step jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case
    when jsonb_typeof(p_step -> 'janela') = 'object' then p_step -> 'janela'
    when jsonb_typeof(p_document -> 'janelaPadrao') = 'object' then p_document -> 'janelaPadrao'
    else '{}'::jsonb
  end;
$$;

revoke all on function private.step_window(jsonb, jsonb) from public, anon, authenticated;

-- O primeiro horário válido depois de p_base mais p_business_days dias úteis (segunda a sexta, sem feriados), dentro
-- da janela [de, ate) no horário de Brasília. Antes da janela, vale o início dela; depois dela ou no fim de semana,
-- o início da janela no próximo dia útil. Sem janela válida, vale 09:00–18:00.
create function private.next_send_slot(p_base timestamptz, p_business_days integer, p_window jsonb)
returns timestamptz
language plpgsql
stable
set search_path = ''
as $$
declare
  v_local timestamp := p_base at time zone 'America/Sao_Paulo';
  v_day date := v_local::date;
  v_time time := v_local::time;
  v_from time := private.window_time(p_window ->> 'de', '09:00');
  v_to time := private.window_time(p_window ->> 'ate', '18:00');
  v_left integer := greatest(coalesce(p_business_days, 0), 0);
begin
  if v_to <= v_from then
    v_from := '09:00';
    v_to := '18:00';
  end if;
  while v_left > 0 loop
    v_day := v_day + 1;
    if extract(isodow from v_day) < 6 then
      v_left := v_left - 1;
    end if;
  end loop;
  if extract(isodow from v_day) >= 6 or v_time >= v_to then
    v_day := v_day + 1;
    while extract(isodow from v_day) >= 6 loop
      v_day := v_day + 1;
    end loop;
    v_time := v_from;
  elsif v_time < v_from then
    v_time := v_from;
  end if;
  return (v_day + v_time) at time zone 'America/Sao_Paulo';
end;
$$;

revoke all on function private.next_send_slot(timestamptz, integer, jsonb) from public, anon, authenticated;

create function private.step_delay(p_step jsonb)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case when (p_step ->> 'delayDiasUteis') ~ '^\d{1,4}$' then (p_step ->> 'delayDiasUteis')::integer else 0 end;
$$;

revoke all on function private.step_delay(jsonb) from public, anon, authenticated;

-- 4. O que conta como alteração de um passo pendente: tudo o que muda o que sai, para quem, por onde e quando.
create function private.step_signature(p_document jsonb, p_step jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', p_step -> 'id',
    'canal', p_step -> 'canal',
    'contatoId', p_step -> 'contatoId',
    'delayDiasUteis', private.step_delay(p_step),
    'titulo', p_step -> 'titulo',
    'assunto', p_step -> 'assunto',
    'corpo', p_step -> 'corpo',
    'modoEmail', p_step -> 'modoEmail',
    'janela', private.step_window(p_document, p_step));
$$;

revoke all on function private.step_signature(jsonb, jsonb) from public, anon, authenticated;

-- Os passos ainda pendentes de um documento, na ordem dele. Um passo em voo, enviado ou incerto já não é pendente.
create function private.pending_steps_signature(p_sequence_id uuid, p_document jsonb)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(private.step_signature(p_document, s.step) order by s.n), '[]'::jsonb)
  from jsonb_array_elements(case when jsonb_typeof(p_document -> 'steps') = 'array'
    then p_document -> 'steps' else '[]'::jsonb end) with ordinality as s(step, n)
  where not exists (
    select 1 from private.sequence_step_sends e
    where e.sequence_id = p_sequence_id and e.step_id = s.step ->> 'id'
      and e.status in ('sending', 'sent', 'uncertain'));
$$;

revoke all on function private.pending_steps_signature(uuid, jsonb) from public, anon, authenticated;

create function private.authorized_step(p_authorization_id uuid, p_step_id text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select step
  from private.sequence_authorizations a,
    jsonb_array_elements(case when jsonb_typeof(a.document -> 'steps') = 'array'
      then a.document -> 'steps' else '[]'::jsonb end) as step
  where a.id = p_authorization_id and step ->> 'id' = p_step_id
  limit 1;
$$;

revoke all on function private.authorized_step(uuid, text) from public, anon, authenticated;

-- 5. Programar o próximo passo. Um passo por vez: com outro programado, em voo, travado ou num canal que a Althius
-- ainda não envia, nada novo é programado. O horário nunca fica no passado: um passo vencido sai no próximo horário
-- válido a partir de agora, e o seguinte conta os dias úteis desde o envio dele.
create function private.schedule_next_step(p_sequence_id uuid, p_base timestamptz)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_auth private.sequence_authorizations;
  v_status text;
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
  select s.status into v_status from public.sequences s where s.id = p_sequence_id;
  if v_status is distinct from 'ativa' then
    return null;
  end if;

  for v_step in
    select t.step from jsonb_array_elements(case when jsonb_typeof(v_auth.document -> 'steps') = 'array'
      then v_auth.document -> 'steps' else '[]'::jsonb end) with ordinality as t(step, n)
    order by t.n
  loop
    if v_step ->> 'canal' is distinct from 'email' then
      return null;
    end if;
    select e.* into v_send from private.sequence_step_sends e
    where e.sequence_id = p_sequence_id and e.step_id = v_step ->> 'id'
    for update;
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

revoke all on function private.schedule_next_step(uuid, timestamptz) from public, anon, authenticated;

-- Retomar: o passo que venceu durante a pausa sai no próximo horário válido a partir da retomada, um de cada vez.
create function private.resume_schedule(p_sequence_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_auth private.sequence_authorizations;
  v_send private.sequence_step_sends;
begin
  select a.* into v_auth from private.sequence_authorizations a
  where a.sequence_id = p_sequence_id and a.revoked_at is null;
  if not found then
    return;
  end if;
  for v_send in
    select e.* from private.sequence_step_sends e
    where e.authorization_id = v_auth.id and e.status in ('scheduled', 'confirmed')
      and e.scheduled_for < private.clock_now()
    for update
  loop
    update private.sequence_step_sends set
      scheduled_for = private.next_send_slot(private.clock_now(), 0,
        private.step_window(v_auth.document, private.authorized_step(v_auth.id, v_send.step_id))),
      claimed_until = null,
      updated_at = now()
    where id = v_send.id;
  end loop;
  -- A pausa pode ter chegado entre um envio e a programação do seguinte.
  perform private.schedule_next_step(p_sequence_id, coalesce(
    (select max(e.sent_at) from private.sequence_step_sends e where e.sequence_id = p_sequence_id),
    private.clock_now()));
end;
$$;

revoke all on function private.resume_schedule(uuid) from public, anon, authenticated;

-- 6. O titular lê a agenda: a projeção ganha o modo e o horário programado.
drop function public.confirm_sequence_step(uuid, text);
drop function public.list_sequence_step_sends(uuid);

create function public.list_sequence_step_sends(p_sequence_id uuid)
returns table (
  id uuid, step_id text, contact_id uuid, destination text, status text,
  attempts integer, confirmed_at timestamptz, sent_at timestamptz,
  last_error text, last_error_at timestamptz, updated_at timestamptz,
  mode text, scheduled_for timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if not exists (
    select 1 from public.sequences s
    join public.workspace_memberships m
      on m.workspace_id = s.workspace_id and m.user_id = v_user_id and m.active
    where s.id = p_sequence_id and s.owner_user_id = v_user_id
  ) then
    raise exception 'sequence not found or not owned by active user' using errcode = '42501';
  end if;
  return query
    select e.id, e.step_id, e.contact_id, e.destination, e.status,
      e.attempts, e.confirmed_at, e.sent_at, e.last_error, e.last_error_at, e.updated_at,
      e.mode, e.scheduled_for
    from private.sequence_step_sends e
    where e.sequence_id = p_sequence_id
    order by e.step_order nulls last, e.confirmed_at;
end;
$$;

revoke all on function public.list_sequence_step_sends(uuid) from public, anon;
grant execute on function public.list_sequence_step_sends(uuid) to authenticated;

-- O titular confirma (ou reconfirma) um passo de E-mail: o e-mail atual do Contato vira o Destino fixo.
-- Dentro de uma versão autorizada, o passo mantém a vez: esperando continua esperando, o automático volta a ser
-- programado para o próximo horário válido e o manual volta a esperar o titular. Fora dela, é uma confirmação avulsa,
-- que só sai pela ação explícita do titular.
create function public.confirm_sequence_step(p_sequence_id uuid, p_step_id text)
returns table (
  id uuid, step_id text, contact_id uuid, destination text, status text,
  attempts integer, confirmed_at timestamptz, sent_at timestamptz,
  last_error text, last_error_at timestamptz, updated_at timestamptz,
  mode text, scheduled_for timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_user_id uuid := auth.uid();
  v_sequence public.sequences;
  v_step jsonb;
  v_account_id uuid;
  v_contact public.contacts;
  v_send private.sequence_step_sends;
  v_auth private.sequence_authorizations;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  select s.* into v_sequence
  from public.sequences s
  join public.workspace_memberships m
    on m.workspace_id = s.workspace_id and m.user_id = v_user_id and m.active
  where s.id = p_sequence_id and s.owner_user_id = v_user_id
  for update of s;
  if not found then
    raise exception 'sequence not found or not owned by active user' using errcode = '42501';
  end if;

  v_step := private.sequence_step(v_sequence.id, p_step_id);
  if v_step is null then
    raise exception 'step not found in the sequence document' using errcode = 'P0002';
  end if;
  if v_step ->> 'canal' <> 'email' then
    raise exception 'only email steps can be confirmed for now' using errcode = '0A000';
  end if;

  -- O destinatário é um Contato canônico com Vínculo ativo na Conta-alvo desta Sequência.
  if v_sequence.target_account_id !~* '^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$' then
    raise exception 'target account not found' using errcode = 'P0002';
  end if;
  v_account_id := v_sequence.target_account_id::uuid;
  if coalesce(v_step ->> 'contatoId', '') !~* '^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$' then
    raise exception 'contact has no active link with this target account' using errcode = '22023';
  end if;
  select c.* into v_contact
  from public.contacts c
  join public.contact_account_links l
    on l.workspace_id = c.workspace_id and l.contact_id = c.id
      and l.target_account_id = v_account_id and l.ended_at is null
  where c.id = (v_step ->> 'contatoId')::uuid and c.workspace_id = v_sequence.workspace_id;
  if not found then
    raise exception 'contact has no active link with this target account' using errcode = '22023';
  end if;
  if v_contact.email is null then
    raise exception 'contact has no email destination' using errcode = '22023';
  end if;

  select e.* into v_send from private.sequence_step_sends e
  where e.sequence_id = v_sequence.id and e.step_id = p_step_id
  for update;
  if found and v_send.status in ('sending', 'sent', 'uncertain') then
    raise exception 'step already sent or in flight' using errcode = '55000';
  end if;

  if found and v_send.authorization_id is not null then
    select a.* into v_auth from private.sequence_authorizations a
    where a.id = v_send.authorization_id and a.revoked_at is null;
  end if;

  if v_auth.id is not null then
    update private.sequence_step_sends e set
      contact_id = v_contact.id,
      destination = v_contact.email,
      status = case
        when e.status = 'waiting' then 'waiting'
        when e.mode = 'auto' then 'scheduled'
        else 'confirmed' end,
      scheduled_for = case
        when e.status = 'waiting' then null
        else private.next_send_slot(private.clock_now(), 0,
          private.step_window(v_auth.document, private.authorized_step(v_auth.id, e.step_id))) end,
      claimed_until = null,
      attempts = 0,
      confirmed_at = now(),
      last_error = null,
      last_error_at = null,
      updated_at = now()
    where e.id = v_send.id
    returning * into v_send;
  else
    insert into private.sequence_step_sends (
      sequence_id, workspace_id, step_id, owner_user_id, contact_id, channel, destination
    ) values (
      v_sequence.id, v_sequence.workspace_id, p_step_id, v_user_id, v_contact.id, 'email', v_contact.email
    )
    on conflict (sequence_id, step_id) do update set
      contact_id = excluded.contact_id,
      destination = excluded.destination,
      status = 'confirmed',
      authorization_id = null,
      mode = 'manual',
      scheduled_for = null,
      claimed_until = null,
      confirmed_at = now(),
      last_error = null,
      last_error_at = null,
      updated_at = now()
    returning * into v_send;
  end if;

  return query select * from public.list_sequence_step_sends(v_sequence.id) r where r.id = v_send.id;
end;
$$;

revoke all on function public.confirm_sequence_step(uuid, text) from public, anon;
grant execute on function public.confirm_sequence_step(uuid, text) to authenticated;

-- 7. Ativar envios: o titular autoriza a versão atual do documento. Só passos válidos entram: cada passo de E-mail
-- pendente precisa de um Contato vinculado com e-mail e de corpo, e o titular precisa de uma Conta remetente de E-mail
-- pronta. Um bloqueio volta em outcome, com o passo que o causou.
create function public.activate_sequence(p_sequence_id uuid)
returns table (outcome text, step_id text, version integer, scheduled_for timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_user_id uuid := auth.uid();
  v_sequence public.sequences;
  v_document jsonb;
  v_steps jsonb;
  v_step jsonb;
  v_n bigint;
  v_contact public.contacts;
  v_auth private.sequence_authorizations;
  v_version integer;
  v_scheduled uuid;
  v_has_email boolean := false;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  select s.* into v_sequence
  from public.sequences s
  join public.workspace_memberships m
    on m.workspace_id = s.workspace_id and m.user_id = v_user_id and m.active
  join public.sales_responsibilities r
    on r.workspace_id = s.workspace_id and r.target_account_id = s.target_account_id and r.owner_user_id = v_user_id
  where s.id = p_sequence_id and s.owner_user_id = v_user_id
  for update of s;
  if not found then
    raise exception 'sequence not found or not owned by active user' using errcode = '42501';
  end if;

  if v_sequence.status <> 'ativa' then
    return query select 'sequence_not_active', null::text, null::integer, null::timestamptz;
    return;
  end if;

  select d.document into v_document from private.sequence_documents d where d.sequence_id = v_sequence.id;
  v_steps := case when jsonb_typeof(v_document -> 'steps') = 'array' then v_document -> 'steps' else '[]'::jsonb end;
  if jsonb_array_length(v_steps) = 0 then
    return query select 'no_steps', null::text, null::integer, null::timestamptz;
    return;
  end if;

  for v_step in
    select t.step from jsonb_array_elements(v_steps) with ordinality as t(step, n) order by t.n
  loop
    continue when v_step ->> 'canal' is distinct from 'email';
    continue when exists (
      select 1 from private.sequence_step_sends e
      where e.sequence_id = v_sequence.id and e.step_id = v_step ->> 'id'
        and e.status in ('sending', 'sent', 'uncertain'));
    v_has_email := true;
    v_contact := null;
    if coalesce(v_step ->> 'contatoId', '') ~* '^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$' then
      select c.* into v_contact from public.contacts c
      join public.contact_account_links l
        on l.workspace_id = c.workspace_id and l.contact_id = c.id
          and l.target_account_id = v_sequence.target_account_id::uuid and l.ended_at is null
      where c.id = (v_step ->> 'contatoId')::uuid and c.workspace_id = v_sequence.workspace_id;
    end if;
    if v_contact.id is null then
      return query select 'contact_unlinked', v_step ->> 'id', null::integer, null::timestamptz;
      return;
    end if;
    if v_contact.email is null then
      return query select 'contact_without_email', v_step ->> 'id', null::integer, null::timestamptz;
      return;
    end if;
    if nullif(btrim(coalesce(v_step ->> 'corpo', '')), '') is null then
      return query select 'empty_content', v_step ->> 'id', null::integer, null::timestamptz;
      return;
    end if;
  end loop;

  if v_has_email and not exists (
    select 1 from private.sender_accounts a
    where a.workspace_id = v_sequence.workspace_id and a.owner_user_id = v_user_id
      and a.channel = 'email' and a.status = 'ready' and not a.reconciliation_required) then
    return query select 'sender_not_ready', null::text, null::integer, null::timestamptz;
    return;
  end if;

  update private.sequence_authorizations set revoked_at = now(), revoked_reason = 'reactivated'
  where sequence_id = v_sequence.id and revoked_at is null;
  select coalesce(max(a.version), 0) + 1 into v_version
  from private.sequence_authorizations a where a.sequence_id = v_sequence.id;
  insert into private.sequence_authorizations (sequence_id, version, document, authorized_by)
  values (v_sequence.id, v_version,
    jsonb_build_object('steps', v_steps, 'janelaPadrao', v_document -> 'janelaPadrao'), v_user_id)
  returning * into v_auth;

  -- Cada passo de E-mail pendente fixa o Destino atual (ADR-0014) e espera a vez dele.
  for v_step, v_n in
    select t.step, t.n from jsonb_array_elements(v_steps) with ordinality as t(step, n) order by t.n
  loop
    continue when v_step ->> 'canal' is distinct from 'email';
    continue when exists (
      select 1 from private.sequence_step_sends e
      where e.sequence_id = v_sequence.id and e.step_id = v_step ->> 'id'
        and e.status in ('sending', 'sent', 'uncertain'));
    select c.* into v_contact from public.contacts c where c.id = (v_step ->> 'contatoId')::uuid;
    insert into private.sequence_step_sends (
      sequence_id, workspace_id, step_id, owner_user_id, contact_id, channel, destination,
      status, authorization_id, mode, step_order
    ) values (
      v_sequence.id, v_sequence.workspace_id, v_step ->> 'id', v_user_id, v_contact.id, 'email', v_contact.email,
      'waiting', v_auth.id, case when v_step ->> 'modoEmail' = 'manual' then 'manual' else 'auto' end, v_n
    )
    on conflict (sequence_id, step_id) do update set
      contact_id = excluded.contact_id,
      destination = excluded.destination,
      status = 'waiting',
      authorization_id = excluded.authorization_id,
      mode = excluded.mode,
      step_order = excluded.step_order,
      scheduled_for = null,
      claimed_until = null,
      attempts = 0,
      confirmed_at = now(),
      last_error = null,
      last_error_at = null,
      updated_at = now()
    where private.sequence_step_sends.status not in ('sending', 'sent', 'uncertain');
  end loop;

  -- Um passo que saiu do documento não sai mais.
  update private.sequence_step_sends e set
    status = 'cancelled', scheduled_for = null, claimed_until = null, updated_at = now()
  where e.sequence_id = v_sequence.id and e.authorization_id is distinct from v_auth.id
    and e.status in ('waiting', 'scheduled', 'confirmed', 'awaiting_reconfirmation', 'failed', 'bounced');

  v_scheduled := private.schedule_next_step(v_sequence.id, private.clock_now());
  return query
    select 'activated', e.step_id, v_version, e.scheduled_for
    from (select 1) one
    left join private.sequence_step_sends e on e.id = v_scheduled;
end;
$$;

revoke all on function public.activate_sequence(uuid) from public, anon;
grant execute on function public.activate_sequence(uuid) to authenticated;

-- A autorização mais recente, para a tela: a versão, quando foi dada, se vale e por que deixou de valer.
create function public.get_sequence_authorization(p_sequence_id uuid)
returns table (version integer, authorized_at timestamptz, active boolean, revoked_reason text)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if not exists (
    select 1 from public.sequences s
    join public.workspace_memberships m
      on m.workspace_id = s.workspace_id and m.user_id = v_user_id and m.active
    where s.id = p_sequence_id and s.owner_user_id = v_user_id
  ) then
    raise exception 'sequence not found or not owned by active user' using errcode = '42501';
  end if;
  return query
    select a.version, a.authorized_at, a.revoked_at is null, a.revoked_reason
    from private.sequence_authorizations a
    where a.sequence_id = p_sequence_id
    order by a.version desc
    limit 1;
end;
$$;

revoke all on function public.get_sequence_authorization(uuid) from public, anon;
grant execute on function public.get_sequence_authorization(uuid) to authenticated;

-- 8. Editar um passo pendente revoga a autorização; retomar programa o passo seguinte a partir da retomada.
create or replace function public.update_owned_sequence(
  p_sequence_id uuid,
  p_private_document jsonb,
  p_public_summary jsonb,
  p_status text
) returns public.sequences
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_sequence public.sequences;
  v_previous_status text;
  v_auth private.sequence_authorizations;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  select s.* into v_sequence
  from public.sequences s
  where s.id = p_sequence_id
    and s.owner_user_id = v_user_id
    and exists (
      select 1 from public.workspace_memberships m
      where m.workspace_id = s.workspace_id and m.user_id = v_user_id and m.active
    )
  for update of s;

  if not found then
    raise exception 'sequence not found or not owned by active user' using errcode = '42501';
  end if;
  v_previous_status := v_sequence.status;

  if p_private_document is not null then
    perform private.validate_sequence_document(v_sequence.workspace_id, v_sequence.target_account_id, p_private_document);
  end if;

  update public.sequences s
  set public_summary = coalesce(p_public_summary, s.public_summary),
      status = coalesce(p_status, s.status),
      updated_at = now()
  where s.id = p_sequence_id
  returning s.* into v_sequence;

  if p_private_document is not null then
    update private.sequence_documents d
    set document = p_private_document, updated_at = now()
    where d.sequence_id = v_sequence.id and d.owner_user_id = v_user_id;

    -- Os passos já enviados guardam o que saiu; mudar um pendente exige nova ativação.
    select a.* into v_auth from private.sequence_authorizations a
    where a.sequence_id = v_sequence.id and a.revoked_at is null
    for update;
    if found and private.pending_steps_signature(v_sequence.id, v_auth.document)
        is distinct from private.pending_steps_signature(v_sequence.id, p_private_document) then
      update private.sequence_authorizations set revoked_at = now(), revoked_reason = 'edited'
      where id = v_auth.id;
      update private.sequence_step_sends set
        status = 'cancelled', scheduled_for = null, claimed_until = null, updated_at = now()
      where authorization_id = v_auth.id
        and status in ('waiting', 'scheduled', 'confirmed', 'awaiting_reconfirmation', 'failed');
    end if;
  end if;

  if v_previous_status <> 'ativa' and v_sequence.status = 'ativa' then
    perform private.resume_schedule(v_sequence.id);
  end if;

  return v_sequence;
end;
$$;

-- 9. A liberação do envio, para o titular (ação explícita) e para o executor (só o passo automático vencido).
-- Revalida titular, Participação, responsabilidade, versão autorizada, pausa, janela, Conta remetente e Destino.
create function private.release_step_send(p_send_id uuid, p_user_id uuid, p_due_only boolean)
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

  -- Um envio em voo há mais de 10 minutos perdeu o resultado (a função caiu depois de chamar a Unipile):
  -- passa a incerto, para ser reconciliado antes de qualquer reenvio, em vez de ficar preso para sempre.
  if v_blocked is null and v_send.status = 'sending' and v_send.sending_at < now() - interval '10 minutes' then
    update private.sequence_step_sends set
      status = 'uncertain', last_error = 'stale_sending', last_error_at = now(), updated_at = now()
    where id = v_send.id;
    v_send.status := 'uncertain';
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

  if v_blocked is null and p_due_only
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

  -- O executor só envia dentro da janela; atrasado (ex.: fora do ar), o passo vai para o próximo horário válido.
  if v_blocked is null and p_due_only then
    v_window := private.step_window(v_auth.document, v_step);
    v_slot := private.next_send_slot(private.clock_now(), 0, v_window);
    if v_slot > private.clock_now() then
      update private.sequence_step_sends set
        scheduled_for = v_slot, claimed_until = null, updated_at = now()
      where id = v_send.id;
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
    -- ADR-0014: um Destino diferente do confirmado não sai nem para o antigo nem para o novo.
    elsif v_contact.email is distinct from v_send.destination then
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
        status = 'awaiting_reconfirmation', scheduled_for = null, claimed_until = null,
        last_error = v_blocked, last_error_at = now(), updated_at = now()
      where id = v_send.id;
    end if;
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
    sending_at = now(), claimed_until = null, subject = v_subject, body = v_body, updated_at = now()
  where id = v_send.id;

  return query select 'released', v_send.id, v_sender.unipile_account_id, v_send.destination, v_contact.name,
    v_subject, v_body, v_reply_to, 'X-Althius-Envio', v_send.id::text;
end;
$$;

revoke all on function private.release_step_send(uuid, uuid, boolean) from public, anon, authenticated;

-- O titular pede o envio (Edge Function sequence-step-sends, com o JWT dele validado).
create or replace function public.release_sequence_step_send(p_send_id uuid, p_user_id uuid)
returns table (
  outcome text, send_id uuid, unipile_account_id text, destination text, contact_name text,
  subject text, body text, reply_to_message_id text,
  tracking_header_name text, tracking_header_value text
)
language sql
security definer
set search_path = ''
as $$
  select * from private.release_step_send(p_send_id, p_user_id, false);
$$;

-- O executor libera um passo automático vencido, em nome do titular da Sequência.
create function public.release_due_step_send(p_send_id uuid)
returns table (
  outcome text, send_id uuid, unipile_account_id text, destination text, contact_name text,
  subject text, body text, reply_to_message_id text,
  tracking_header_name text, tracking_header_value text
)
language sql
security definer
set search_path = ''
as $$
  select r.* from private.sequence_step_sends e,
    lateral private.release_step_send(e.id, e.owner_user_id, true) r
  where e.id = p_send_id;
$$;

revoke all on function public.release_due_step_send(uuid) from public, anon, authenticated;
grant execute on function public.release_due_step_send(uuid) to service_role;

-- 10. O executor reserva os passos automáticos vencidos. A reserva dura 2 minutos e só evita trabalho repetido: quem
-- impede o envio duplicado é a passagem para "sending" na liberação, com a linha travada.
create function public.claim_due_step_sends(p_limit integer default 10)
returns table (send_id uuid, owner_user_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  -- Um envio em voo há mais de 10 minutos perdeu o resultado: passa a incerto, para ser reconciliado antes de
  -- qualquer reenvio.
  update private.sequence_step_sends set
    status = 'uncertain', last_error = 'stale_sending', last_error_at = now(), updated_at = now()
  where status = 'sending' and sending_at < now() - interval '10 minutes';

  return query
  with due as (
    select e.id from private.sequence_step_sends e
    join public.sequences s on s.id = e.sequence_id and s.status = 'ativa'
    join private.sequence_authorizations a on a.id = e.authorization_id and a.revoked_at is null
    where e.status = 'scheduled' and e.scheduled_for <= private.clock_now()
      and (e.claimed_until is null or e.claimed_until < now())
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

revoke all on function public.claim_due_step_sends(integer) from public, anon, authenticated;
grant execute on function public.claim_due_step_sends(integer) to service_role;

-- 11. O resultado do provedor. Aceito: o passo seguinte é programado (em mark_step_send_sent). Falha de um passo
-- automático: nova tentativa em 5 e depois em 30 minutos, dentro da janela; na terceira falha, a Sequência para
-- nele e espera o titular. Incerto nunca tenta de novo: espera a reconciliação pelo eco.
create or replace function private.mark_step_send_sent(
  p_send_id uuid,
  p_provider_email_id text,
  p_provider_message_id text,
  p_provider_thread_id text
) returns private.sequence_step_sends
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_send private.sequence_step_sends;
  v_account_id uuid;
begin
  update private.sequence_step_sends set
    status = 'sent',
    provider_email_id = coalesce(provider_email_id, nullif(btrim(p_provider_email_id), '')),
    provider_message_id = coalesce(provider_message_id, nullif(btrim(p_provider_message_id), '')),
    provider_thread_id = coalesce(provider_thread_id, nullif(btrim(p_provider_thread_id), '')),
    sent_at = coalesce(sent_at, private.clock_now()),
    scheduled_for = null,
    claimed_until = null,
    last_error = null,
    last_error_at = null,
    updated_at = now()
  where id = p_send_id
  returning * into v_send;

  select s.target_account_id::uuid into v_account_id from public.sequences s where s.id = v_send.sequence_id;
  insert into public.account_interactions (workspace_id, target_account_id, contact_id, kind, occurred_at, source, recorded_by)
  values (v_send.workspace_id, v_account_id, v_send.contact_id, 'email-enviado', v_send.sent_at, 'sequencia', v_send.owner_user_id);
  update public.target_accounts
  set last_interaction_at = greatest(last_interaction_at, v_send.sent_at)
  where id = v_account_id;

  if v_send.authorization_id is not null then
    perform private.schedule_next_step(v_send.sequence_id, v_send.sent_at);
  end if;
  return v_send;
end;
$$;

create or replace function public.record_sequence_step_send_result(
  p_send_id uuid,
  p_outcome text,
  p_provider_email_id text,
  p_provider_message_id text,
  p_error text
) returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_send private.sequence_step_sends;
  v_auth private.sequence_authorizations;
  v_retry_at timestamptz;
begin
  if p_outcome not in ('sent', 'failed', 'uncertain') then
    raise exception 'unknown send outcome' using errcode = '22023';
  end if;
  select e.* into v_send from private.sequence_step_sends e where e.id = p_send_id for update;
  if not found then
    raise exception 'send not found' using errcode = 'P0002';
  end if;
  -- O eco nos itens enviados pode chegar antes do resultado da chamada: o envio já está provado.
  if v_send.status = 'sent' then
    update private.sequence_step_sends set
      provider_email_id = coalesce(provider_email_id, nullif(btrim(p_provider_email_id), '')),
      provider_message_id = coalesce(provider_message_id, nullif(btrim(p_provider_message_id), '')),
      updated_at = now()
    where id = v_send.id;
    return 'sent';
  end if;
  if v_send.status <> 'sending' then
    raise exception 'send is not in flight' using errcode = '55000';
  end if;

  if p_outcome = 'sent' then
    v_send := private.mark_step_send_sent(v_send.id, p_provider_email_id, p_provider_message_id, null);
    return v_send.status;
  end if;

  if p_outcome = 'failed' and v_send.mode = 'auto' and v_send.attempts < 3 then
    select a.* into v_auth from private.sequence_authorizations a
    where a.id = v_send.authorization_id and a.revoked_at is null;
    if found then
      v_retry_at := private.next_send_slot(
        private.clock_now() + case when v_send.attempts <= 1 then interval '5 minutes' else interval '30 minutes' end, 0,
        private.step_window(v_auth.document, private.authorized_step(v_auth.id, v_send.step_id)));
      update private.sequence_step_sends set
        status = 'scheduled',
        scheduled_for = v_retry_at,
        claimed_until = null,
        last_error = left(coalesce(p_error, p_outcome), 500),
        last_error_at = now(),
        updated_at = now()
      where id = v_send.id;
      return 'scheduled';
    end if;
  end if;

  update private.sequence_step_sends set
    status = p_outcome,
    last_error = left(coalesce(p_error, p_outcome), 500),
    last_error_at = now(),
    updated_at = now()
  where id = v_send.id
  returning * into v_send;
  return v_send.status;
end;
$$;
