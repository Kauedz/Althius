-- O ciclo real de WhatsApp e LinkedIn nas Sequências (canais-06 e canais-07). Até aqui só o E-mail enviava de verdade:
-- o Envio do passo aceitava só o canal 'email' e a ativação ignorava os outros passos. Esta migration ensina o mesmo
-- Executor (a cada minuto, navegador fechado) a enviar por WhatsApp e por LinkedIn com a mesma segurança do E-mail:
-- Conta remetente pessoal do responsável, Destino fixado na ativação (ADR-0014), janela de horário, nenhum reenvio
-- cego (timeout ou 2xx ilegível é incerto), resposta real do Contato pausa a Sequência da Conta-alvo (idempotente, com
-- o conteúdo só para o titular) e nada que seja eco, aceite de convite ou evento técnico conta como resposta.
--
-- Cadência pedida pelo Nan: LinkedIn é convite com nota e, se a pessoa já é conexão, mensagem; WhatsApp é mensagem.
--
-- Aditiva. O caminho do E-mail não muda de comportamento: as funções do E-mail só ganham o filtro de canal e o tipo
-- da Interação por canal, e a Sequência continua parando num passo de WhatsApp ou LinkedIn enquanto o canal não for
-- liberado (private.set_chat_channel_enabled). Esse interruptor nasce DESLIGADO: ligar os canais é um passo do Nan,
-- depois de o Webhook Endpoint da Unipile receber `message.new` (sem ele uma resposta não pausaria nada).

-- 1. O interruptor dos canais de conversa. Desligado, o Executor não os envia e a ativação os ignora, como antes.
create table private.chat_channel_settings (
  channel text primary key check (channel in ('whatsapp', 'linkedin')),
  enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

insert into private.chat_channel_settings (channel) values ('whatsapp'), ('linkedin');

alter table private.chat_channel_settings enable row level security;
revoke all on private.chat_channel_settings from public, anon, authenticated, service_role;

comment on table private.chat_channel_settings is
  'Whether the Executor may send Sequence steps over WhatsApp and LinkedIn. Off by default: turn on only after the '
  'Unipile webhook delivers message.new, or a reply would not pause the Sequence.';

create function private.chat_channel_enabled(p_channel text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select s.enabled from private.chat_channel_settings s where s.channel = p_channel), false);
$$;

revoke all on function private.chat_channel_enabled(text) from public, anon, authenticated, service_role;

-- Passo do Nan, no SQL Editor: select private.set_chat_channel_enabled('whatsapp', true);
create function private.set_chat_channel_enabled(p_channel text, p_enabled boolean)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update private.chat_channel_settings set enabled = coalesce(p_enabled, false), updated_at = now()
  where channel = p_channel;
  if not found then
    raise exception 'unknown chat channel' using errcode = '22023';
  end if;
  return coalesce(p_enabled, false);
end;
$$;

revoke all on function private.set_chat_channel_enabled(text, boolean) from public, anon, authenticated, service_role;

-- A tela pergunta quais canais de conversa estão liberados, para não fingir que um passo vai sair.
create function public.list_enabled_chat_channels()
returns setof text
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  return query select s.channel from private.chat_channel_settings s where s.enabled order by s.channel;
end;
$$;

revoke all on function public.list_enabled_chat_channels() from public, anon;
grant execute on function public.list_enabled_chat_channels() to authenticated;

-- 2. O Envio do passo aceita os três canais e guarda a conversa e a identidade do destinatário no provedor.
alter table private.sequence_step_sends drop constraint sequence_step_sends_channel_check;
alter table private.sequence_step_sends
  add constraint sequence_step_sends_channel_check check (channel in ('email', 'whatsapp', 'linkedin'));

alter table private.sequence_step_sends
  -- O id da conversa no provedor (WhatsApp e LinkedIn). Fica separado de provider_thread_id: a reconciliação e a
  -- conferência do E-mail leem aquele e usam a API de e-mail.
  add column provider_chat_id text,
  -- A identidade nativa do destinatário no provedor (o id do perfil no LinkedIn).
  add column provider_user_id text,
  -- O que saiu de fato no LinkedIn: convite, mensagem (já era conexão) ou InMail.
  add column linkedin_action text check (linkedin_action in ('convite', 'mensagem', 'inmail'));

create index sequence_step_sends_provider_chat_idx
  on private.sequence_step_sends (sender_account_id, provider_chat_id) where provider_chat_id is not null;

-- A identidade do próprio titular na Conta remetente, aprendida no primeiro evento que ele mesmo enviou.
alter table private.sender_accounts add column own_provider_id text;

-- A Interação de uma mensagem recebida por WhatsApp ou LinkedIn. A enviada continua sendo 'mensagem-enviada'.
alter table public.account_interactions drop constraint account_interactions_kind_check;
alter table public.account_interactions add constraint account_interactions_kind_check check (kind in (
  'email-enviado', 'email-recebido', 'mensagem-enviada', 'mensagem-recebida', 'ligacao', 'reuniao'
));

-- 3. Os eventos de conversa da Unipile e o conteúdo das respostas.
create table private.unipile_chat_events (
  id uuid primary key default gen_random_uuid(),
  event_id text not null unique,
  event_type text not null check (event_type in ('message.new', 'chat.update', 'relation.new', 'new_relation')),
  unipile_account_id text not null,
  sender_account_id uuid references private.sender_accounts(id),
  provider_chat_id text,
  provider_message_id text,
  outcome text not null check (outcome in (
    'echo', 'reply', 'relation', 'technical', 'unrelated', 'before_send', 'unknown_account', 'wrong_channel',
    'duplicate_message'
  )),
  send_id uuid references private.sequence_step_sends(id),
  interaction_id uuid references public.account_interactions(id) on delete set null,
  received_at timestamptz not null default now()
);

create index unipile_chat_events_message_idx
  on private.unipile_chat_events (unipile_account_id, provider_chat_id, provider_message_id);
create index unipile_chat_events_send_idx on private.unipile_chat_events (send_id) where send_id is not null;

create table private.received_chat_messages (
  id uuid primary key default gen_random_uuid(),
  interaction_id uuid not null unique references public.account_interactions(id) on delete cascade,
  workspace_id uuid not null,
  owner_user_id uuid not null references auth.users(id),
  sequence_id uuid not null references public.sequences(id),
  send_id uuid references private.sequence_step_sends(id),
  contact_id uuid,
  sender_account_id uuid not null references private.sender_accounts(id),
  channel text not null check (channel in ('whatsapp', 'linkedin')),
  provider_chat_id text,
  provider_message_id text,
  from_id text,
  from_name text,
  body text,
  -- Só a contagem: baixar e guardar anexos de WhatsApp e LinkedIn é o canais-10.
  attachments_count integer not null default 0,
  received_at timestamptz not null,
  created_at timestamptz not null default now(),
  -- Apagar o Contato apaga o que ele escreveu (CRM-18).
  foreign key (workspace_id, contact_id) references public.contacts(workspace_id, id) on delete cascade
);

create index received_chat_messages_sequence_idx on private.received_chat_messages (sequence_id, received_at desc);

alter table private.unipile_chat_events enable row level security;
alter table private.received_chat_messages enable row level security;
revoke all on private.unipile_chat_events from public, anon, authenticated;
revoke all on private.received_chat_messages from public, anon, authenticated;
grant all on private.unipile_chat_events to service_role;
grant all on private.received_chat_messages to service_role;

comment on table private.unipile_chat_events is
  'Every chat webhook delivery (message.new, relation.new...), by event id, with its outcome. Content is never stored here.';
comment on table private.received_chat_messages is
  'Private content of a reply received over WhatsApp or LinkedIn. Only the sequence owner reads it via RPC.';

-- A resposta recebida registra o Resultado do Envio e move o cartão do kanban, como a de E-mail (as duas funções são
-- as mesmas dos gatilhos de private.received_emails e só leem send_id, workspace_id e sequence_id).
create trigger received_chat_messages_outcome
  after insert on private.received_chat_messages
  for each row execute function private.outcome_on_reply();
create trigger received_chat_messages_prospecting
  after insert on private.received_chat_messages
  for each row execute function private.prospecting_on_reply();

-- O Contato apagado leva o que dava para ligar a ele no provedor (CRM-18): o Envio desidentificado perde a conversa e
-- a identidade do destinatário, e os eventos deixam de apontar para ele.
create function private.keep_chat_send_anonymized()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.anonymized_at is not null then
    if old.anonymized_at is null then
      update private.unipile_chat_events ev set send_id = null, provider_chat_id = null, provider_message_id = null
      where ev.send_id = new.id
        or (old.provider_chat_id is not null and ev.provider_chat_id = old.provider_chat_id
          and ev.sender_account_id is not distinct from new.sender_account_id);
    end if;
    new.provider_chat_id := null;
    new.provider_user_id := null;
  end if;
  return new;
end;
$$;

revoke all on function private.keep_chat_send_anonymized() from public, anon, authenticated, service_role;

create trigger sequence_step_sends_keep_chat_anonymized
  before update on private.sequence_step_sends
  for each row execute function private.keep_chat_send_anonymized();

-- A Conta-alvo apagada leva as mensagens recebidas das Sequências dela (a Conta fica só como marcador).
create function private.erase_chat_messages_of_deleted_account()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from private.received_chat_messages r
  using public.sequences q
  where r.sequence_id = q.id and q.workspace_id = new.workspace_id and q.target_account_id = new.id::text;
  return null;
end;
$$;

revoke all on function private.erase_chat_messages_of_deleted_account() from public, anon, authenticated, service_role;

create trigger target_accounts_erase_chat_messages
  after update of deleted_at on public.target_accounts
  for each row when (old.deleted_at is null and new.deleted_at is not null)
  execute function private.erase_chat_messages_of_deleted_account();

-- 4. Destinos: o telefone da posição que o passo escolhe, e o perfil do LinkedIn.
-- O telefone da posição (1 a 3) do Contato e se ele usa WhatsApp. Posição inválida ou sem telefone não devolve linha.
create function private.contact_phone_at(p_contact_id uuid, p_ordinal integer)
returns table (phone text, whatsapp boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select c.phone, coalesce(c.phone_whatsapp, true)
  from public.contacts c
  where p_ordinal = 1 and c.id = p_contact_id and c.phone is not null
  union all
  select p.phone, p.whatsapp
  from private.contact_phones p
  where p_ordinal in (2, 3) and p.contact_id = p_contact_id and p.ordinal = p_ordinal;
$$;

revoke all on function private.contact_phone_at(uuid, integer) from public, anon, authenticated, service_role;

-- O telefone ainda é um dos do Contato (o principal ou um adicional) e ainda usa WhatsApp?
create function private.contact_has_whatsapp_phone(p_contact_id uuid, p_phone text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_phone is not null and (
    exists (select 1 from public.contacts c
      where c.id = p_contact_id and c.phone = p_phone and coalesce(c.phone_whatsapp, true))
    or exists (select 1 from private.contact_phones p
      where p.contact_id = p_contact_id and p.phone = p_phone and p.whatsapp));
$$;

revoke all on function private.contact_has_whatsapp_phone(uuid, text) from public, anon, authenticated, service_role;

-- O identificador público do perfil (/in/<perfil>), ou nulo se o valor não é um perfil. É o que a Unipile aceita para
-- achar o id nativo da pessoa.
create function private.linkedin_public_identifier(p_value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(substring(lower(btrim(coalesce(p_value, ''))) from '^https://www\.linkedin\.com/in/([^/?#]+)$'), '');
$$;

revoke all on function private.linkedin_public_identifier(text) from public, anon, authenticated, service_role;

-- O tamanho máximo da nota de um convite. Contas gratuitas têm limite menor (não confirmado qual): se o provedor
-- recusar, o passo para com o motivo, e a nota nunca é cortada em silêncio.
create function private.linkedin_invite_note_limit()
returns integer
language sql
immutable
set search_path = ''
as $$
  select 300;
$$;

revoke all on function private.linkedin_invite_note_limit() from public, anon, authenticated, service_role;

-- A mesma mensagem, sem diferenças de espaço e quebra de linha: é assim que o eco do envio é reconhecido.
create function private.chat_text_key(p_text text)
returns text
language sql
immutable
set search_path = ''
as $$
  select btrim(regexp_replace(coalesce(p_text, ''), '\s+', ' ', 'g'));
$$;

revoke all on function private.chat_text_key(text) from public, anon, authenticated, service_role;

-- Os campos do objeto Message da Unipile v2 que a ingestão usa, num lugar só. Nomes conferidos por busca na
-- documentação (chat_id, sender_id, is_sender, texto e data); os demais são candidatos.
-- não confirmado: o nome exato do campo do texto, da data e do identificador da mensagem.
create function private.chat_message_fields(p_message jsonb)
returns table (
  message_id text, chat_id text, sender_id text, is_sender boolean, body text, sent_at text,
  is_event boolean, is_deleted boolean, attachments_count integer
)
language sql
immutable
set search_path = ''
as $$
  select
    nullif(btrim(coalesce(p_message ->> 'id', p_message ->> 'message_id', p_message ->> 'provider_id')), ''),
    nullif(btrim(coalesce(p_message ->> 'chat_id', p_message ->> 'chat_provider_id')), ''),
    nullif(btrim(coalesce(p_message ->> 'sender_id', p_message ->> 'sender_provider_id')), ''),
    case
      when jsonb_typeof(p_message -> 'is_sender') = 'boolean' then (p_message ->> 'is_sender')::boolean
      when (p_message ->> 'is_sender') = '1' then true
      when (p_message ->> 'is_sender') = '0' then false
    end,
    nullif(btrim(coalesce(p_message ->> 'text', p_message ->> 'body')), ''),
    coalesce(p_message ->> 'date', p_message ->> 'timestamp', p_message ->> 'created_at'),
    coalesce(case when jsonb_typeof(p_message -> 'is_event') = 'boolean' then (p_message ->> 'is_event')::boolean end, false),
    coalesce(case when jsonb_typeof(p_message -> 'deleted') = 'boolean' then (p_message ->> 'deleted')::boolean end, false),
    case when jsonb_typeof(p_message -> 'attachments') = 'array' then jsonb_array_length(p_message -> 'attachments') else 0 end;
$$;

revoke all on function private.chat_message_fields(jsonb) from public, anon, authenticated, service_role;

-- 5. Peças do E-mail que passam a conhecer os outros canais. Redefinições por `create or replace`, copiadas da
-- definição mais recente, com a mesma assinatura e as mesmas permissões.

-- O que muda um passo pendente (e por isso revoga a autorização): o subtipo do LinkedIn e, no WhatsApp, o telefone
-- escolhido entram na assinatura. Para o E-mail, nada mudou.
create or replace function private.step_signature(p_document jsonb, p_step jsonb)
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
    'janela', private.step_window(p_document, p_step),
    'subtipoLinkedIn', case when p_step ->> 'canal' = 'linkedin' then p_step -> 'subtipoLinkedIn' end,
    'telefone', case when p_step ->> 'canal' = 'whatsapp' then p_step -> 'destino' end);
$$;

-- Programar o próximo passo. Igual ao do canais-05, mas um canal de conversa liberado também é programado; um canal
-- que a Althius ainda não envia continua segurando os passos seguintes.
create or replace function private.schedule_next_step(p_sequence_id uuid, p_base timestamptz)
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

-- Marca um Envio como aceito pelo provedor e registra a Interação da Conta-alvo (sem conteúdo): 'email-enviado' no
-- E-mail e 'mensagem-enviada' no WhatsApp e no LinkedIn.
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
  -- A trava da Sequência vem antes da linha do Envio, na mesma ordem da liberação: programar o passo seguinte mexe
  -- em outras linhas da mesma Sequência.
  perform 1 from public.sequences s
  where s.id = (select e.sequence_id from private.sequence_step_sends e where e.id = p_send_id)
  for update;
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
  values (v_send.workspace_id, v_account_id, v_send.contact_id,
    case v_send.channel when 'email' then 'email-enviado' else 'mensagem-enviada' end,
    v_send.sent_at, 'sequencia', v_send.owner_user_id);
  update public.target_accounts
  set last_interaction_at = greatest(last_interaction_at, v_send.sent_at)
  where id = v_account_id;

  -- Sem versão ativa (Sequência só com confirmações avulsas), não há nada a programar.
  perform private.schedule_next_step(v_send.sequence_id, v_send.sent_at);
  return v_send;
end;
$$;

-- O Executor de E-mail reserva só os Envios de E-mail; os de conversa têm a reserva própria (claim_due_chat_step_sends).
create or replace function public.claim_due_step_sends(p_limit integer default 10)
returns table (send_id uuid, owner_user_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  perform private.expire_stale_sends(null);

  return query
  with due as (
    select e.id from private.sequence_step_sends e
    join public.sequences s on s.id = e.sequence_id and s.status = 'ativa'
    join private.sequence_authorizations a on a.id = e.authorization_id and a.revoked_at is null
    where e.channel = 'email'
      and e.status = 'scheduled' and e.scheduled_for <= private.clock_now()
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

-- As liberações do E-mail recusam o Envio de outro canal: a lógica delas é de e-mail (Destino, Conta remetente de
-- E-mail) e mexeria no Envio de conversa por engano.
create or replace function public.release_sequence_step_send(p_send_id uuid, p_user_id uuid)
returns table (
  outcome text, send_id uuid, unipile_account_id text, destination text, contact_name text,
  subject text, body text, reply_to_message_id text,
  tracking_header_name text, tracking_header_value text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from private.sequence_step_sends e where e.id = p_send_id and e.channel <> 'email') then
    return query select 'wrong_channel', p_send_id, null::text, null::text, null::text,
      null::text, null::text, null::text, null::text, null::text;
    return;
  end if;
  return query select * from private.release_step_send(p_send_id, p_user_id, false);
end;
$$;

create or replace function public.release_due_step_send(p_send_id uuid)
returns table (
  outcome text, send_id uuid, unipile_account_id text, destination text, contact_name text,
  subject text, body text, reply_to_message_id text,
  tracking_header_name text, tracking_header_value text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from private.sequence_step_sends e where e.id = p_send_id and e.channel <> 'email') then
    return query select 'wrong_channel', p_send_id, null::text, null::text, null::text,
      null::text, null::text, null::text, null::text, null::text;
    return;
  end if;
  return query
    select r.* from private.sequence_step_sends e,
      lateral private.release_step_send(e.id, e.owner_user_id, true) r
    where e.id = p_send_id;
end;
$$;

revoke all on function public.release_sequence_step_send(uuid, uuid) from public, anon, authenticated;
grant execute on function public.release_sequence_step_send(uuid, uuid) to service_role;
revoke all on function public.release_due_step_send(uuid) from public, anon, authenticated;
grant execute on function public.release_due_step_send(uuid) to service_role;

-- O titular resolve um envio incerto que o eco não reconciliou. No E-mail, "não saiu" volta o passo a ser confirmado;
-- no WhatsApp e no LinkedIn não há confirmação avulsa: o passo falha com o motivo, e "Ativar de novo" o põe na fila.
create or replace function public.resolve_uncertain_step(p_sequence_id uuid, p_step_id text, p_went_out boolean)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_send private.sequence_step_sends;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  perform 1 from public.sequences s
  join public.workspace_memberships m
    on m.workspace_id = s.workspace_id and m.user_id = v_user_id and m.active
  where s.id = p_sequence_id and s.owner_user_id = v_user_id
  for update of s;
  if not found then
    raise exception 'sequence not found or not owned by active user' using errcode = '42501';
  end if;

  select e.* into v_send from private.sequence_step_sends e
  where e.sequence_id = p_sequence_id and e.step_id = p_step_id;
  if not found then
    raise exception 'send not found' using errcode = 'P0002';
  end if;
  perform private.expire_stale_sends(v_send.id);
  select e.* into v_send from private.sequence_step_sends e where e.id = v_send.id for update;
  if v_send.status <> 'uncertain' then
    raise exception 'send is not uncertain' using errcode = '55000';
  end if;

  if coalesce(p_went_out, false) then
    v_send := private.mark_step_send_sent(v_send.id, null, null, null);
    return v_send.status;
  end if;
  update private.sequence_step_sends set
    status = 'failed', last_error = 'owner_confirmed_not_sent', last_error_at = now(), updated_at = now()
  where id = v_send.id;
  if v_send.channel <> 'email' then
    return 'failed';
  end if;
  return (select c.status from public.confirm_sequence_step(p_sequence_id, p_step_id) c);
end;
$$;

revoke all on function public.resolve_uncertain_step(uuid, text, boolean) from public, anon;
grant execute on function public.resolve_uncertain_step(uuid, text, boolean) to authenticated;

-- 6. Ativar envios com os três canais. Copiada de 20260929170000_varios_emails_e_telefones_por_contato.sql. Cada passo
-- pendente de um canal liberado é validado na ordem do documento: o WhatsApp fixa o telefone da posição `destino`
-- (que precisa usar WhatsApp), o LinkedIn fixa o perfil do Contato, e o E-mail continua como era. Um canal de
-- conversa ainda desligado é ignorado, como antes. Novos desfechos: contact_without_phone, phone_not_found,
-- phone_without_whatsapp, contact_without_linkedin, linkedin_profile_invalid, invalid_linkedin_subtype,
-- invite_note_too_long, whatsapp_sender_not_ready e linkedin_sender_not_ready.
create or replace function public.activate_sequence(p_sequence_id uuid)
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
  v_channel text;
  v_contact public.contacts;
  v_account public.target_accounts;
  v_owner_name text;
  v_ordinal integer;
  v_destination text;
  v_phone record;
  v_subtype text;
  v_auth private.sequence_authorizations;
  v_version integer;
  v_scheduled uuid;
  v_pending jsonb := '[]'::jsonb;
  v_item jsonb;
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

  if v_sequence.target_account_id !~* '^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$' then
    raise exception 'target account not found' using errcode = 'P0002';
  end if;

  -- Para medir a nota do convite já com as variáveis preenchidas, como ela vai sair.
  select a.* into v_account from public.target_accounts a where a.id::text = v_sequence.target_account_id;
  select coalesce(nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''), nullif(btrim(u.raw_user_meta_data ->> 'name'), ''), u.email)
    into v_owner_name from auth.users u where u.id = v_user_id;

  -- Os passos pendentes dos canais liberados, validados na ordem do documento, com o Contato e o Destino atual.
  for v_step, v_n in
    select t.step, t.n from jsonb_array_elements(v_steps) with ordinality as t(step, n) order by t.n
  loop
    v_channel := v_step ->> 'canal';
    continue when v_channel is null;
    continue when v_channel <> 'email'
      and not (v_channel in ('whatsapp', 'linkedin') and private.chat_channel_enabled(v_channel));
    continue when exists (
      select 1 from private.sequence_step_sends e
      where e.sequence_id = v_sequence.id and e.step_id = v_step ->> 'id' and private.send_went_out(e.status));
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

    if v_channel = 'email' then
      -- O passo escolhe qual e-mail do Contato usa (`destino`, de 1 a 3; ausente vale 1).
      v_ordinal := private.step_destination_ordinal(v_step);
      v_destination := private.contact_email_at(v_contact.id, v_ordinal);
      if v_destination is null then
        return query select case when v_ordinal = 1 then 'contact_without_email' else 'destination_not_found' end,
          v_step ->> 'id', null::integer, null::timestamptz;
        return;
      end if;
    elsif v_channel = 'whatsapp' then
      -- O passo escolhe qual telefone do Contato usa (`destino`, de 1 a 3), e ele precisa usar WhatsApp.
      v_ordinal := private.step_destination_ordinal(v_step);
      select p.phone, p.whatsapp into v_phone from private.contact_phone_at(v_contact.id, v_ordinal) p;
      if not found then
        return query select case when v_ordinal = 1 then 'contact_without_phone' else 'phone_not_found' end,
          v_step ->> 'id', null::integer, null::timestamptz;
        return;
      end if;
      if not v_phone.whatsapp then
        return query select 'phone_without_whatsapp', v_step ->> 'id', null::integer, null::timestamptz;
        return;
      end if;
      v_destination := v_phone.phone;
    else
      if v_contact.linkedin is null then
        return query select 'contact_without_linkedin', v_step ->> 'id', null::integer, null::timestamptz;
        return;
      end if;
      if private.linkedin_public_identifier(v_contact.linkedin) is null then
        return query select 'linkedin_profile_invalid', v_step ->> 'id', null::integer, null::timestamptz;
        return;
      end if;
      v_subtype := coalesce(v_step ->> 'subtipoLinkedIn', 'convite');
      if v_subtype not in ('convite', 'mensagem', 'inmail') then
        return query select 'invalid_linkedin_subtype', v_step ->> 'id', null::integer, null::timestamptz;
        return;
      end if;
      v_destination := v_contact.linkedin;
    end if;

    if nullif(btrim(coalesce(v_step ->> 'corpo', '')), '') is null then
      return query select 'empty_content', v_step ->> 'id', null::integer, null::timestamptz;
      return;
    end if;
    -- A nota do convite não é cortada em silêncio: se passa do limite, o Vendedor responsável a encurta antes de ativar.
    -- Se o Contato já for conexão o passo vira mensagem, mas só o envio sabe disso; o limite vale por garantia.
    if v_channel = 'linkedin' and v_subtype = 'convite' and char_length(
        private.render_step_template(v_step ->> 'corpo', v_account, v_contact, v_owner_name)
      ) > private.linkedin_invite_note_limit() then
      return query select 'invite_note_too_long', v_step ->> 'id', null::integer, null::timestamptz;
      return;
    end if;
    -- Um passo que voltou só sai de novo para outro endereço: ativar não reenvia para o endereço que voltou.
    if v_channel = 'email' and exists (
      select 1 from private.sequence_step_sends e
      where e.sequence_id = v_sequence.id and e.status = 'bounced' and e.destination = v_destination) then
      return query select 'destination_bounced', v_step ->> 'id', null::integer, null::timestamptz;
      return;
    end if;
    v_pending := v_pending || jsonb_build_object('step', v_step, 'n', v_n, 'channel', v_channel,
      'contact_id', v_contact.id, 'destination', v_destination);
  end loop;

  -- Cada canal usado precisa de uma Conta remetente do titular, pronta e sem reconciliação pendente.
  foreach v_channel in array array['email', 'whatsapp', 'linkedin'] loop
    if exists (select 1 from jsonb_array_elements(v_pending) i where i ->> 'channel' = v_channel)
      and not exists (
        select 1 from private.sender_accounts a
        where a.workspace_id = v_sequence.workspace_id and a.owner_user_id = v_user_id
          and a.channel = v_channel and a.status = 'ready' and not a.reconciliation_required) then
      return query select case v_channel when 'email' then 'sender_not_ready' else v_channel || '_sender_not_ready' end,
        (select i -> 'step' ->> 'id' from jsonb_array_elements(v_pending) i
          where i ->> 'channel' = v_channel and v_channel <> 'email' limit 1),
        null::integer, null::timestamptz;
      return;
    end if;
  end loop;

  update private.sequence_authorizations set revoked_at = now(), revoked_reason = 'reactivated'
  where sequence_id = v_sequence.id and revoked_at is null;
  select coalesce(max(a.version), 0) + 1 into v_version
  from private.sequence_authorizations a where a.sequence_id = v_sequence.id;
  insert into private.sequence_authorizations (sequence_id, version, document, authorized_by)
  values (v_sequence.id, v_version,
    jsonb_build_object('steps', v_steps, 'janelaPadrao', v_document -> 'janelaPadrao'), v_user_id)
  returning * into v_auth;

  -- Ativar é confirmar o documento inteiro: cada passo pendente fixa o Destino atual (ADR-0014) e espera a vez.
  -- Só o E-mail tem passo manual; WhatsApp e LinkedIn saem sozinhos.
  for v_item in select value from jsonb_array_elements(v_pending) loop
    insert into private.sequence_step_sends (
      sequence_id, workspace_id, step_id, owner_user_id, contact_id, channel, destination,
      status, authorization_id, mode, step_order
    ) values (
      v_sequence.id, v_sequence.workspace_id, v_item -> 'step' ->> 'id', v_user_id, (v_item ->> 'contact_id')::uuid,
      v_item ->> 'channel', v_item ->> 'destination', 'waiting', v_auth.id,
      case when v_item ->> 'channel' = 'email' and v_item -> 'step' ->> 'modoEmail' = 'manual' then 'manual' else 'auto' end,
      (v_item ->> 'n')::integer
    )
    on conflict (sequence_id, step_id) do update set
      contact_id = excluded.contact_id,
      channel = excluded.channel,
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
    where not private.send_went_out(private.sequence_step_sends.status);
  end loop;

  -- Um passo que saiu do documento não sai mais.
  update private.sequence_step_sends e set
    status = 'cancelled', scheduled_for = null, claimed_until = null, updated_at = now()
  where e.sequence_id = v_sequence.id and e.authorization_id is distinct from v_auth.id
    and private.send_is_cancellable(e.status);

  v_scheduled := private.schedule_next_step(v_sequence.id, private.clock_now());
  return query
    select 'activated', e.step_id, v_version, e.scheduled_for
    from (select 1) one
    left join private.sequence_step_sends e on e.id = v_scheduled;
end;
$$;

revoke all on function public.activate_sequence(uuid) from public, anon;
grant execute on function public.activate_sequence(uuid) to authenticated;

-- 7. O Executor de conversa: reserva, libera e grava o resultado dos Envios de WhatsApp e LinkedIn. Mesmas travas, mesma
-- ordem (a Sequência antes da linha do Envio), mesmas janelas e mesmo relógio que o E-mail.
create function public.claim_due_chat_step_sends(p_limit integer default 10)
returns table (send_id uuid, owner_user_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  perform private.expire_stale_sends(null);

  return query
  with due as (
    select e.id from private.sequence_step_sends e
    join public.sequences s on s.id = e.sequence_id and s.status = 'ativa'
    join private.sequence_authorizations a on a.id = e.authorization_id and a.revoked_at is null
    where e.channel in ('whatsapp', 'linkedin') and private.chat_channel_enabled(e.channel)
      and e.status = 'scheduled' and e.scheduled_for <= private.clock_now()
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

revoke all on function public.claim_due_chat_step_sends(integer) from public, anon, authenticated;
grant execute on function public.claim_due_chat_step_sends(integer) to service_role;

-- A liberação. Devolve o que a Edge Function precisa para falar com a Unipile (a Conta remetente do canal, o Destino
-- fixado, o texto com as variáveis preenchidas, a conversa já aberta com o Contato e se um convite já saiu) ou o
-- motivo do bloqueio em outcome. O LinkedIn decide convite ou mensagem na hora, olhando a relação: isso só a Unipile
-- sabe, então a decisão fica na Edge Function.
create function private.release_chat_step_send(p_send_id uuid, p_user_id uuid, p_due_only boolean)
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
          scheduled_for = v_slot, claimed_until = null, updated_at = now()
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
    sending_at = now(), claimed_until = null, body = v_body, updated_at = now()
  where id = v_send.id;

  return query select 'released', v_send.id, v_send.channel, v_sender.unipile_account_id, v_send.destination,
    v_contact.name, v_body,
    case when v_send.channel = 'linkedin' then coalesce(v_step ->> 'subtipoLinkedIn', 'convite') end,
    v_chat_id, v_user_ref, v_invite_sent, private.linkedin_invite_note_limit();
end;
$$;

revoke all on function private.release_chat_step_send(uuid, uuid, boolean) from public, anon, authenticated, service_role;

-- O titular pede o envio de um passo de conversa (hoje ninguém o chama: os passos de conversa saem pelo Executor).
create function public.release_chat_step_send(p_send_id uuid, p_user_id uuid)
returns table (
  outcome text, send_id uuid, channel text, unipile_account_id text, destination text, contact_name text,
  body text, linkedin_subtype text, provider_chat_id text, provider_user_id text,
  invite_sent boolean, invite_note_limit integer
)
language sql
security definer
set search_path = ''
as $$
  select * from private.release_chat_step_send(p_send_id, p_user_id, false);
$$;

-- O Executor libera um passo de conversa vencido, em nome do titular da Sequência.
create function public.release_due_chat_step_send(p_send_id uuid)
returns table (
  outcome text, send_id uuid, channel text, unipile_account_id text, destination text, contact_name text,
  body text, linkedin_subtype text, provider_chat_id text, provider_user_id text,
  invite_sent boolean, invite_note_limit integer
)
language sql
security definer
set search_path = ''
as $$
  select r.* from private.sequence_step_sends e,
    lateral private.release_chat_step_send(e.id, e.owner_user_id, true) r
  where e.id = p_send_id;
$$;

revoke all on function public.release_chat_step_send(uuid, uuid) from public, anon, authenticated;
grant execute on function public.release_chat_step_send(uuid, uuid) to service_role;
revoke all on function public.release_due_chat_step_send(uuid) from public, anon, authenticated;
grant execute on function public.release_due_chat_step_send(uuid) to service_role;

-- O resultado do provedor. sent, failed e uncertain seguem o fluxo do E-mail (nova tentativa em 5 e 30 minutos só no
-- que falhou antes de sair; incerto nunca tenta de novo). blocked é um impedimento que o Vendedor responsável precisa
-- resolver (crédito, assinatura, relação, nota longa...): o Envio fica falho com o motivo, sem nova tentativa, e a
-- Sequência para nele até uma nova ativação.
create function public.record_chat_step_send_result(
  p_send_id uuid,
  p_outcome text,
  p_provider_chat_id text,
  p_provider_message_id text,
  p_provider_user_id text,
  p_linkedin_action text,
  p_error text,
  p_retry_after_seconds integer default null
) returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_send private.sequence_step_sends;
begin
  if p_outcome not in ('sent', 'failed', 'uncertain', 'blocked') then
    raise exception 'unknown send outcome' using errcode = '22023';
  end if;
  if p_linkedin_action is not null and p_linkedin_action not in ('convite', 'mensagem', 'inmail') then
    raise exception 'unknown linkedin action' using errcode = '22023';
  end if;
  -- A trava da Sequência vem antes da linha do Envio, na mesma ordem da liberação.
  perform 1 from public.sequences s
  where s.id = (select e.sequence_id from private.sequence_step_sends e where e.id = p_send_id)
  for update;
  select e.* into v_send from private.sequence_step_sends e where e.id = p_send_id for update;
  if not found then
    raise exception 'send not found' using errcode = 'P0002';
  end if;
  if v_send.channel not in ('whatsapp', 'linkedin') then
    raise exception 'not a chat send' using errcode = '22023';
  end if;
  -- O eco pode ter chegado antes do resultado da chamada: o envio já está provado, só faltam os ids.
  if v_send.status not in ('sending', 'sent') then
    raise exception 'send is not in flight' using errcode = '55000';
  end if;

  update private.sequence_step_sends set
    provider_chat_id = coalesce(provider_chat_id, nullif(btrim(p_provider_chat_id), '')),
    provider_user_id = coalesce(provider_user_id, nullif(btrim(p_provider_user_id), '')),
    linkedin_action = coalesce(linkedin_action, p_linkedin_action),
    updated_at = now()
  where id = v_send.id;

  if p_outcome = 'blocked' and v_send.status = 'sending' then
    update private.sequence_step_sends set
      status = 'failed', scheduled_for = null, claimed_until = null,
      last_error = left(coalesce(p_error, 'blocked'), 500), last_error_at = now(), updated_at = now()
    where id = v_send.id;
    return 'failed';
  end if;

  return public.record_sequence_step_send_result(
    p_send_id, case when p_outcome = 'blocked' then 'failed' else p_outcome end,
    null, p_provider_message_id, p_error, p_retry_after_seconds);
end;
$$;

revoke all on function public.record_chat_step_send_result(uuid, text, text, text, text, text, text, integer)
  from public, anon, authenticated;
grant execute on function public.record_chat_step_send_result(uuid, text, text, text, text, text, text, integer)
  to service_role;

-- A conversa já aberta com o Contato: a Conta remetente e o chat do último Envio dele nesta Sequência. A Edge Function
-- confere essa conversa na Unipile antes de liberar o passo seguinte, porque a Unipile reentrega o webhook só duas
-- vezes e uma resposta perdida não pode deixar a Sequência seguir. Sem conversa aberta, não devolve linha.
create function public.chat_conversation_for_send(p_send_id uuid, p_user_id uuid)
returns table (unipile_account_id text, provider_chat_id text)
language sql
stable
security definer
set search_path = ''
as $$
  select a.unipile_account_id, prev.provider_chat_id
  from private.sequence_step_sends e
  join public.sequences s on s.id = e.sequence_id and s.owner_user_id = p_user_id
  join private.sender_accounts a on a.id = coalesce(e.sender_account_id, (
    select a2.id from private.sender_accounts a2
    where a2.workspace_id = s.workspace_id and a2.owner_user_id = p_user_id and a2.channel = e.channel
      and a2.status = 'ready' and not a2.reconciliation_required
    order by a2.last_status_at desc limit 1))
  join lateral (
    select p.provider_chat_id from private.sequence_step_sends p
    where p.sequence_id = e.sequence_id and p.contact_id = e.contact_id and p.id <> e.id
      and p.channel = e.channel and p.status in ('sent', 'uncertain') and p.provider_chat_id is not null
    order by coalesce(p.sent_at, p.sending_at) desc limit 1
  ) prev on true
  where e.id = p_send_id and e.owner_user_id = p_user_id and e.channel in ('whatsapp', 'linkedin');
$$;

revoke all on function public.chat_conversation_for_send(uuid, uuid) from public, anon, authenticated;
grant execute on function public.chat_conversation_for_send(uuid, uuid) to service_role;

-- A próxima página de conversas de uma Conta remetente de WhatsApp ou LinkedIn a conferir depois de uma queda: por
-- Sequência e Contato, a do último Envio que saiu por ela, da mais antiga para a mais nova, a partir de onde a
-- reconciliação parou (o mesmo cursor da reconciliação do E-mail). Numa Conta de E-mail não devolve nada.
create function public.chats_to_reconcile(p_sender_account_id uuid, p_limit integer default 25)
returns table (send_id uuid, provider_chat_id text, sent_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.provider_chat_id, c.at
  from (
    select distinct on (e.sequence_id, e.contact_id)
      e.id, e.provider_chat_id, coalesce(e.sent_at, e.sending_at) as at
    from private.sequence_step_sends e
    where e.sender_account_id = p_sender_account_id
      and e.channel in ('whatsapp', 'linkedin')
      and e.status in ('sent', 'uncertain')
      and e.provider_chat_id is not null
      and coalesce(e.sent_at, e.sending_at) is not null
    order by e.sequence_id, e.contact_id, coalesce(e.sent_at, e.sending_at) desc
  ) c
  join private.sender_accounts a on a.id = p_sender_account_id
  where a.reconciliation_checked_at is null
    or (c.at, c.id) > (a.reconciliation_checked_at, a.reconciliation_checked_send)
  order by c.at, c.id
  limit greatest(1, least(coalesce(p_limit, 25), 100));
$$;

revoke all on function public.chats_to_reconcile(uuid, integer) from public, anon, authenticated;
grant execute on function public.chats_to_reconcile(uuid, integer) to service_role;

-- 8. A ingestão de um evento de conversa da Unipile. Devolve o desfecho e, numa resposta, a Interação.
--   message.new   o objeto Message (recebida E enviada): eco do próprio envio, mensagem do titular por conta própria,
--                 resposta do Contato ou conversa sem relação;
--   relation.new  (e o apelido new_relation) uma nova conexão no LinkedIn, como o aceite de um convite: só registrado,
--                 nunca resposta;
--   chat.update   evento técnico.
-- Uma resposta é: uma mensagem que NÃO é do titular, de uma conversa ligada a um Envio nosso (pelo chat ou pelo
-- remetente ser o Destino do Contato), escrita depois de o envio começar. Conversa pessoal ou sem ligação com um
-- Contato participante não vira Interação, não guarda conteúdo e não pausa nada.
create function public.ingest_unipile_chat_event(
  p_event_id text,
  p_unipile_account_id text,
  p_event_type text,
  p_payload jsonb
) returns table (outcome text, interaction_id uuid, send_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_event_row_id uuid;
  v_sender private.sender_accounts;
  v_send private.sequence_step_sends;
  v_sequence public.sequences;
  v_interaction public.account_interactions;
  v_message jsonb;
  v_f record;
  v_received_at timestamptz;
  v_own boolean;
  v_found boolean := false;
  v_outcome text;
  v_digits text;
begin
  if p_event_type not in ('message.new', 'chat.update', 'relation.new', 'new_relation') then
    raise exception 'unsupported chat event type' using errcode = '22023';
  end if;

  v_message := case when jsonb_typeof(p_payload -> 'message') = 'object' then p_payload -> 'message' else p_payload end;
  select * into v_f from private.chat_message_fields(coalesce(v_message, '{}'::jsonb));

  -- 1. Dedupe pelo id do evento (a Unipile reentrega até duas vezes). Um evento que ficou sem relação ou antes do
  -- envio pode ser avaliado de novo: a conferência da conversa reapresenta a mesma mensagem, e o Envio pode ter
  -- ganhado o chat só depois.
  insert into private.unipile_chat_events (event_id, event_type, unipile_account_id, provider_chat_id, provider_message_id, outcome)
  values (p_event_id, p_event_type, p_unipile_account_id, v_f.chat_id, v_f.message_id, 'unrelated')
  on conflict (event_id) do update set received_at = now()
    where private.unipile_chat_events.outcome in ('unrelated', 'before_send')
  returning id into v_event_row_id;
  if v_event_row_id is null then
    return query select 'duplicate_event', null::uuid, null::uuid;
    return;
  end if;

  select a.* into v_sender from private.sender_accounts a where a.unipile_account_id = p_unipile_account_id;
  if not found then
    update private.unipile_chat_events set outcome = 'unknown_account' where id = v_event_row_id;
    return query select 'unknown_account', null::uuid, null::uuid;
    return;
  end if;
  update private.unipile_chat_events set sender_account_id = v_sender.id where id = v_event_row_id;
  if v_sender.channel not in ('whatsapp', 'linkedin') then
    update private.unipile_chat_events set outcome = 'wrong_channel' where id = v_event_row_id;
    return query select 'wrong_channel', null::uuid, null::uuid;
    return;
  end if;

  -- 2. Eventos que nunca são resposta: a nova relação (o aceite de um convite) e os técnicos.
  if p_event_type in ('relation.new', 'new_relation') then
    update private.unipile_chat_events set outcome = 'relation' where id = v_event_row_id;
    return query select 'relation', null::uuid, null::uuid;
    return;
  end if;
  if p_event_type = 'chat.update' or v_f.is_event or v_f.is_deleted then
    update private.unipile_chat_events set outcome = 'technical' where id = v_event_row_id;
    return query select 'technical', null::uuid, null::uuid;
    return;
  end if;

  -- 3. Dedupe pela mensagem: o mesmo message.new chega pelo webhook e pela conferência da conversa. O id de uma
  -- mensagem vale por chat em alguns provedores, então o chat entra na chave.
  perform pg_advisory_xact_lock(hashtext(p_unipile_account_id || '|' || coalesce(v_f.chat_id, '') || '|' || coalesce(v_f.message_id, p_event_id)));
  if v_f.message_id is not null and exists (
    select 1 from private.unipile_chat_events e
    where e.unipile_account_id = p_unipile_account_id and e.provider_message_id = v_f.message_id
      and e.provider_chat_id is not distinct from v_f.chat_id and e.id <> v_event_row_id
      and e.outcome in ('echo', 'reply')
  ) then
    update private.unipile_chat_events set outcome = 'duplicate_message' where id = v_event_row_id;
    return query select 'duplicate_message', null::uuid, null::uuid;
    return;
  end if;

  v_received_at := coalesce(private.safe_timestamptz(v_f.sent_at), now());

  -- 4. De quem é a mensagem. is_sender diz se foi o titular; sem ele, vale a identidade do titular aprendida antes. Se
  -- nem isso se sabe, a mensagem fica sem relação: melhor ignorar do que pausar por uma mensagem do próprio titular.
  v_own := coalesce(v_f.is_sender,
    case when v_f.sender_id is not null and v_sender.own_provider_id is not null
      then v_f.sender_id = v_sender.own_provider_id end);

  if v_own is true then
    -- Eco. O envio do próprio titular (pelo app ou por fora) nunca é resposta do Contato.
    if v_f.sender_id is not null and v_sender.own_provider_id is distinct from v_f.sender_id then
      update private.sender_accounts set own_provider_id = v_f.sender_id, updated_at = now() where id = v_sender.id;
    end if;
    -- Se reconhece um Envio nosso: pelo id da mensagem, ou pelo texto igual ao que saiu, ainda sem resultado.
    select e.* into v_send from private.sequence_step_sends e
    where e.sender_account_id = v_sender.id and e.channel = v_sender.channel
      and (
        (v_f.message_id is not null and e.provider_message_id = v_f.message_id)
        or (e.status in ('sending', 'uncertain', 'failed', 'scheduled') and e.attempts > 0
          and e.sending_at > now() - interval '2 days'
          and private.chat_text_key(e.body) <> '' and private.chat_text_key(e.body) = private.chat_text_key(v_f.body)
          and (e.provider_chat_id is null or v_f.chat_id is null or e.provider_chat_id = v_f.chat_id))
      )
    order by (e.provider_message_id is not distinct from v_f.message_id) desc, e.sending_at desc nulls last
    limit 1;
    if found then
      select s.* into v_sequence from public.sequences s where s.id = v_send.sequence_id for update;
      select e.* into v_send from private.sequence_step_sends e where e.id = v_send.id for update;
      update private.sequence_step_sends set
        provider_chat_id = coalesce(provider_chat_id, v_f.chat_id),
        provider_message_id = coalesce(provider_message_id, v_f.message_id),
        updated_at = now()
      where id = v_send.id;
      -- O eco prova que saiu, mesmo quando o resultado da chamada foi falha ou dúvida.
      if v_send.status in ('sending', 'uncertain', 'failed', 'scheduled') then
        v_send := private.mark_step_send_sent(v_send.id, null, v_f.message_id, null);
      end if;
    else
      v_send := null;
    end if;
    v_outcome := 'echo';
  else
    v_outcome := 'unrelated';
    v_send := null;
    if v_own is false then
      -- 5. Resposta? Primeiro pelo chat de um Envio nosso; depois pelo remetente ser o Destino do Contato.
      if v_f.chat_id is not null then
        select e.* into v_send from private.sequence_step_sends e
        where e.sender_account_id = v_sender.id and e.channel = v_sender.channel
          and e.provider_chat_id = v_f.chat_id and e.status in ('sent', 'uncertain', 'failed')
        order by coalesce(e.sending_at, e.sent_at) desc nulls last
        limit 1;
        v_found := found;
      end if;
      if not v_found and v_f.sender_id is not null then
        if v_sender.channel = 'whatsapp' and v_f.sender_id ~ '^[0-9]{8,15}@s\.whatsapp\.net$' then
          v_digits := split_part(v_f.sender_id, '@', 1);
          select e.* into v_send from private.sequence_step_sends e
          where e.sender_account_id = v_sender.id and e.channel = 'whatsapp' and e.status in ('sent', 'uncertain', 'failed')
            and regexp_replace(coalesce(e.destination, ''), '[^0-9]', '', 'g') = v_digits
          order by coalesce(e.sending_at, e.sent_at) desc nulls last
          limit 1;
          v_found := found;
        elsif v_sender.channel = 'linkedin' then
          select e.* into v_send from private.sequence_step_sends e
          where e.sender_account_id = v_sender.id and e.channel = 'linkedin' and e.status in ('sent', 'uncertain', 'failed')
            and e.provider_user_id = v_f.sender_id
          order by coalesce(e.sending_at, e.sent_at) desc nulls last
          limit 1;
          v_found := found;
        end if;
      end if;
      if v_found then
        -- Escrita antes de o envio começar: histórico da conversa, não resposta ao passo.
        if v_received_at < coalesce(v_send.sending_at, v_send.sent_at) - interval '2 minutes' then
          v_outcome := 'before_send';
          v_send := null;
        else
          v_outcome := 'reply';
        end if;
      else
        v_send := null;
      end if;
    end if;
  end if;

  if v_outcome = 'reply' then
    -- A trava da Sequência serializa a pausa com uma liberação concorrente de envio.
    select s.* into v_sequence from public.sequences s where s.id = v_send.sequence_id for update;

    insert into public.account_interactions (workspace_id, target_account_id, contact_id, kind, occurred_at, source, recorded_by)
    values (v_sequence.workspace_id, v_sequence.target_account_id::uuid, v_send.contact_id, 'mensagem-recebida',
      v_received_at, 'sequencia', v_sequence.owner_user_id)
    returning * into v_interaction;
    update public.target_accounts
    set last_interaction_at = greatest(last_interaction_at, v_received_at)
    where id = v_sequence.target_account_id::uuid;

    insert into private.received_chat_messages (
      interaction_id, workspace_id, owner_user_id, sequence_id, send_id, contact_id, sender_account_id, channel,
      provider_chat_id, provider_message_id, from_id, from_name, body, attachments_count, received_at
    ) values (
      v_interaction.id, v_sequence.workspace_id, v_sequence.owner_user_id, v_sequence.id, v_send.id, v_send.contact_id,
      v_sender.id, v_sender.channel, v_f.chat_id, v_f.message_id, v_f.sender_id,
      nullif(btrim(coalesce(v_message ->> 'sender_name', v_message #>> '{sender,name}', v_message #>> '{sender,display_name}')), ''),
      v_f.body, v_f.attachments_count, v_received_at
    );

    -- A pausa vale para a Sequência inteira da Conta-alvo; retomar é ação explícita do responsável.
    if v_sequence.status = 'ativa' then
      update public.sequences set
        status = 'pausada',
        public_summary = public_summary || jsonb_build_object('status', 'pausada'),
        updated_at = now()
      where id = v_sequence.id;
      update private.sequence_documents set
        document = document || jsonb_build_object('motivoPause', 'Contato respondeu'),
        updated_at = now()
      where sequence_id = v_sequence.id;
    end if;
  end if;

  update private.unipile_chat_events
  set outcome = v_outcome, send_id = v_send.id, interaction_id = v_interaction.id
  where id = v_event_row_id;
  return query select v_outcome, v_interaction.id, v_send.id;
end;
$$;

revoke all on function public.ingest_unipile_chat_event(text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.ingest_unipile_chat_event(text, text, text, jsonb) to service_role;

-- As respostas de WhatsApp e LinkedIn de uma Sequência, só para o Vendedor responsável ativo.
create function public.list_received_chat_messages(p_sequence_id uuid)
returns table (
  interaction_id uuid, sequence_id uuid, send_id uuid, contact_id uuid, channel text, from_id text, from_name text,
  body text, attachments_count integer, received_at timestamptz
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
    select r.interaction_id, r.sequence_id, r.send_id, r.contact_id, r.channel, r.from_id, r.from_name,
      r.body, r.attachments_count, r.received_at
    from private.received_chat_messages r
    where r.sequence_id = p_sequence_id
    order by r.received_at desc;
end;
$$;

revoke all on function public.list_received_chat_messages(uuid) from public, anon;
grant execute on function public.list_received_chat_messages(uuid) to authenticated;
