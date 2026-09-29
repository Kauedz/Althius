-- Ciclo real pelo WhatsApp, a metade do envio (canais-06, parte 1). O passo de WhatsApp segue o mesmo caminho do de
-- E-mail (ADR-0008 e ADR-0014): a confirmação fixa o número do passo (a posição `destino` da lista inteira de
-- telefones do Contato, só se marcado como WhatsApp), a liberação revalida tudo e só usa a Conta remetente de WhatsApp
-- do próprio Vendedor responsável, e o Executor passa a enviar esse canal. LinkedIn continua parando a Sequência.
-- A metade do recebimento (message.new, pausa por resposta, reconexão) é a parte 2 e espera o JSON real da Unipile.
--
-- Só aditiva: colunas anuláveis, tabela nova, nenhuma linha existente é apagada ou reescrita. As funções redefinidas
-- por `create or replace` partem da definição mais recente (a do ticket 27, quando houve) e mantêm assinatura e
-- permissões; `claim_due_step_sends` e `record_sequence_step_send_result` mudam de assinatura e são recriadas com as
-- mesmas permissões. `confirm_sequence_step` continua recusando o passo de WhatsApp (o WhatsApp tem a própria
-- confirmação, `confirm_whatsapp_step`).
--
-- Redefinidas nesta migration:
--   public.activate_sequence            também ativa passos de WhatsApp (número fixado, Conta de WhatsApp pronta).
--   public.confirm_sequence_step        só passa a gravar o canal 'email' ao reconfirmar (antes de um passo trocar de canal).
--   private.schedule_next_step          a fila anda por passos de E-mail e de WhatsApp; LinkedIn continua parando.
--   private.step_signature              `destino` conta como edição: trocar o número revoga a versão autorizada.
--   private.release_step_send           recusa um Envio que não é de E-mail (wrong_channel) e a resposta "Re:" só
--                                       continua a conversa de outro e-mail.
--   public.claim_due_step_sends         devolve o canal, nunca entrega dois envios da mesma Conta de WhatsApp dentro do
--                                       espaçamento mínimo, só entrega WhatsApp com o envio automático ligado e confere
--                                       de novo situação, reserva e fila depois de travar as linhas.
--   private.kick_sequence_runner        só chama o Executor por um passo de WhatsApp com o envio automático ligado.
--   private.mark_step_send_sent         a Interação de um envio de WhatsApp é `mensagem-enviada`.
--   public.record_sequence_step_send_result  guarda também o id da conversa do provedor (`p_provider_chat_id`).
--   public.resolve_uncertain_step       "não saiu" reconfirma pelo canal do passo.
--   private.anonymize_sends e private.keep_send_anonymized  o id da conversa (que traz o número) também é apagado.
--
-- Novos: espaçamento (`private.whatsapp_send_spacing`), o interruptor do envio automático de WhatsApp
-- (`private.sequence_runner_settings.whatsapp_auto_send`, desligado, e `private.whatsapp_auto_send_enabled`),
-- `public.confirm_whatsapp_step`, a liberação (`release_whatsapp_step_send`, `release_due_whatsapp_step_send`),
-- `public.step_send_channel`, `public.block_whatsapp_step_send` e a tabela de formatos de webhook
-- (`private.webhook_shape_captures`).
--
-- Envio automático de WhatsApp DESLIGADO por padrão: a parte 2 (recebimento) ainda não existe, então a resposta de um
-- Contato NÃO pausa a Sequência, e um passo de WhatsApp seguinte sairia sozinho depois de uma resposta. Enquanto o
-- interruptor estiver desligado, o Executor não reserva, não chama a função por causa e não libera passo de WhatsApp
-- (`automatic_disabled`); o "Confirmar e enviar" manual do titular continua funcionando. Para ligar, no SQL Editor:
--   update private.sequence_runner_settings set whatsapp_auto_send = true, updated_at = now();

-- 1. A visão dos Contatos com Vínculo ativo: `whatsapp` só mostra o telefone principal quando ele é marcado como
-- WhatsApp. Antes o principal aparecia como `whatsapp` mesmo com a marca desligada. As colunas e a segurança de quem
-- consulta (security_invoker) seguem como estavam.
create or replace view public.target_contacts with (security_invoker = true) as
select
  c.id,
  l.workspace_id,
  l.target_account_id,
  l.id as link_id,
  c.name,
  c.role,
  c.email,
  c.phone,
  case when coalesce(c.phone_whatsapp, true) then c.phone end as whatsapp,
  c.linkedin,
  c.linkedin as linkedin_identity,
  true as is_real,
  l.started_at,
  (select max(i.occurred_at) from public.account_interactions i
    where i.contact_id = c.id and i.target_account_id = l.target_account_id) as last_interaction_at,
  c.created_at,
  c.updated_at
from public.contact_account_links l
join public.contacts c on c.workspace_id = l.workspace_id and c.id = l.contact_id
where l.ended_at is null;

revoke all on public.target_contacts from anon, authenticated;
grant select on public.target_contacts to authenticated;

-- 2. O Envio do passo aceita o canal WhatsApp e guarda o id da conversa do provedor. Numa conversa individual, o
-- `chat_id` que a Unipile devolve é o próprio id do destinatário (número + @s.whatsapp.net): ele traz o telefone, e por
-- isso é apagado junto com o Destino quando o Contato é apagado.
alter table private.sequence_step_sends drop constraint sequence_step_sends_channel_check;
alter table private.sequence_step_sends
  add constraint sequence_step_sends_channel_check check (channel in ('email', 'whatsapp'));
alter table private.sequence_step_sends
  add column provider_chat_id text,
  -- Quando o Executor reservou o passo pela última vez: o espaçamento do WhatsApp conta também a reserva que ainda
  -- não foi liberada, para duas rodadas seguidas não entregarem dois passos da mesma Conta remetente.
  add column claimed_at timestamptz;

create index sequence_step_sends_sender_spacing_idx
  on private.sequence_step_sends (sender_account_id, sending_at desc) where sending_at is not null;

comment on column private.sequence_step_sends.provider_chat_id is
  'WhatsApp: the provider conversation id recorded when a send was accepted (individual chat: the recipient id). '
  'It carries the phone number, so anonymization clears it.';

-- O Envio desidentificado também perde o id da conversa (o resto segue como na migration de arquivar e apagar).
create or replace function private.keep_send_anonymized()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.anonymized_at is not null then
    new.anonymized_at := old.anonymized_at;
    new.contact_id := null;
    new.destination := null;
    new.subject := null;
    new.body := null;
    new.provider_email_id := null;
    new.provider_message_id := null;
    new.provider_thread_id := null;
    new.provider_chat_id := null;
    new.last_error := null;
  end if;
  return new;
end;
$$;

revoke all on function private.keep_send_anonymized() from public, anon, authenticated, service_role;

create or replace function private.anonymize_sends(p_workspace_id uuid, p_sequence_ids uuid[], p_contact_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  update private.unipile_email_events ev set send_id = null, provider_email_id = null
  where ev.send_id in (
    select e.id from private.sequence_step_sends e
    where e.workspace_id = p_workspace_id and (e.sequence_id = any (p_sequence_ids) or e.contact_id = p_contact_id));

  update private.sequence_step_sends e set
    status = case when private.send_is_cancellable(e.status) then 'cancelled' else e.status end,
    scheduled_for = case when private.send_is_cancellable(e.status) then null else e.scheduled_for end,
    claimed_until = case when private.send_is_cancellable(e.status) then null else e.claimed_until end,
    contact_id = null, destination = null, subject = null, body = null,
    provider_email_id = null, provider_message_id = null, provider_thread_id = null, provider_chat_id = null,
    last_error = null, anonymized_at = coalesce(e.anonymized_at, now()), updated_at = now()
  where e.workspace_id = p_workspace_id
    and (e.sequence_id = any (p_sequence_ids) or e.contact_id = p_contact_id)
    and (e.anonymized_at is null or e.contact_id is not null or e.destination is not null);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function private.anonymize_sends(uuid, uuid[], uuid) from public, anon, authenticated, service_role;

-- 3. Peças do WhatsApp.

-- O interruptor do envio automático de WhatsApp (uma linha só, junto do endereço do Executor). Desligado até a parte 2
-- pausar a Sequência quando o Contato responde. Ligar é um passo manual e consciente, no SQL Editor.
alter table private.sequence_runner_settings add column whatsapp_auto_send boolean not null default false;

comment on column private.sequence_runner_settings.whatsapp_auto_send is
  'Automatic WhatsApp sending by the Executor. Off until a reply pauses the Sequência (canais-06, part 2). Manual '
  'sends by the owner are not affected.';

create function private.whatsapp_auto_send_enabled()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select s.whatsapp_auto_send from private.sequence_runner_settings s limit 1), false);
$$;

revoke all on function private.whatsapp_auto_send_enabled() from public, anon, authenticated;

-- O espaçamento mínimo entre duas mensagens da mesma Conta remetente de WhatsApp. É a única constante: a Unipile pede
-- intervalos realistas e avisa que abrir muitas conversas sem resposta pode restringir a conta (evitar menos de 10 a
-- 20 segundos). Trocar o valor aqui muda a reserva do Executor e a liberação.
create function private.whatsapp_send_spacing()
returns interval
language sql
immutable
security definer
set search_path = ''
as $$
  select interval '30 seconds';
$$;

revoke all on function private.whatsapp_send_spacing() from public, anon, authenticated;

-- A Conta remetente de WhatsApp do próprio titular que pode enviar agora: pronta e sem reconciliação pendente. Nunca a
-- de outro participante. Nulo quando não há.
create function private.whatsapp_sender_id(p_workspace_id uuid, p_owner_user_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select a.id from private.sender_accounts a
  where a.workspace_id = p_workspace_id and a.owner_user_id = p_owner_user_id
    and a.channel = 'whatsapp' and a.status = 'ready' and not a.reconciliation_required
  order by a.last_status_at desc
  limit 1;
$$;

revoke all on function private.whatsapp_sender_id(uuid, uuid) from public, anon, authenticated;

-- Esta Conta remetente enviou uma mensagem há menos que o espaçamento mínimo? Mede a hora em que o Envio passou a
-- "sending" com o relógio da parede (clock_timestamp, não o início da transação: duas liberações concorrentes são
-- serializadas pela trava da Conta em release_whatsapp_step_send, e a segunda precisa ver a hora real da primeira).
create function private.whatsapp_sender_in_spacing(p_sender_account_id uuid, p_except_send_id uuid)
returns boolean
language sql
volatile
security definer
set search_path = ''
as $$
  select exists (
    select 1 from private.sequence_step_sends e
    where e.sender_account_id = p_sender_account_id and e.id is distinct from p_except_send_id
      and e.sending_at is not null and e.sending_at > clock_timestamp() - private.whatsapp_send_spacing());
$$;

revoke all on function private.whatsapp_sender_in_spacing(uuid, uuid) from public, anon, authenticated;

-- O telefone na posição (1 a 3 da lista inteira do Contato, principal primeiro) e se ele é marcado como WhatsApp. Sem
-- linha quando o Contato não tem telefone nessa posição. A marca é por telefone, independente de celular ou fixo.
create function private.contact_phone_at(p_contact_id uuid, p_ordinal integer)
returns table (value text, whatsapp boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select ch.value, coalesce(ch.whatsapp, false)
  from private.contact_channels(array[p_contact_id]) ch
  where ch.channel = 'phone' and ch.ordinal = p_ordinal;
$$;

revoke all on function private.contact_phone_at(uuid, integer) from public, anon, authenticated;

-- O número ainda é um dos telefones do Contato marcados como WhatsApp (o principal ou um adicional)?
create function private.contact_has_whatsapp_phone(p_contact_id uuid, p_phone text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_phone is not null and exists (
    select 1 from private.contact_channels(array[p_contact_id]) ch
    where ch.channel = 'phone' and ch.value = p_phone and coalesce(ch.whatsapp, false));
$$;

revoke all on function private.contact_has_whatsapp_phone(uuid, text) from public, anon, authenticated;

-- O número ainda é um dos telefones do Contato, marcado ou não como WhatsApp?
create function private.contact_has_phone(p_contact_id uuid, p_phone text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_phone is not null and exists (
    select 1 from private.contact_channels(array[p_contact_id]) ch
    where ch.channel = 'phone' and ch.value = p_phone);
$$;

revoke all on function private.contact_has_phone(uuid, text) from public, anon, authenticated;

-- O modo de envio do passo: só o passo de E-mail tem modo manual (`modoEmail`); WhatsApp sai sozinho.
create function private.step_send_mode(p_step jsonb)
returns text
language sql
immutable
security definer
set search_path = ''
as $$
  select case when p_step ->> 'canal' = 'email' and p_step ->> 'modoEmail' = 'manual' then 'manual' else 'auto' end;
$$;

revoke all on function private.step_send_mode(jsonb) from public, anon, authenticated;

-- 4. Trocar a posição do número (ou do e-mail) de um passo pendente é uma edição: revoga a versão autorizada, para o
-- envio nunca sair para um número diferente do que o documento mostra. Sem `destino` nos dois lados, nada muda.
create or replace function private.step_signature(p_document jsonb, p_step jsonb)
returns jsonb
language sql
immutable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', p_step -> 'id',
    'canal', p_step -> 'canal',
    'contatoId', p_step -> 'contatoId',
    'destino', p_step -> 'destino',
    'delayDiasUteis', private.step_delay(p_step),
    'titulo', p_step -> 'titulo',
    'assunto', p_step -> 'assunto',
    'corpo', p_step -> 'corpo',
    'modoEmail', p_step -> 'modoEmail',
    'janela', private.step_window(p_document, p_step));
$$;

revoke all on function private.step_signature(jsonb, jsonb) from public, anon, authenticated;

-- 5. A fila anda por passos de E-mail e de WhatsApp; o primeiro passo de outro canal (LinkedIn) para a Sequência.
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
    if coalesce(v_step ->> 'canal', '') not in ('email', 'whatsapp') then
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

revoke all on function private.schedule_next_step(uuid, timestamptz) from public, anon, authenticated;

-- 6. Confirmar um passo. O de E-mail é o de sempre (ticket 27), só que agora também grava o canal, para um passo que
-- trocou de WhatsApp para E-mail com o mesmo id não ficar preso ao canal antigo. O de WhatsApp fixa o número da posição
-- `destino` da lista inteira de telefones, só se ele for marcado como WhatsApp.
create or replace function public.confirm_sequence_step(p_sequence_id uuid, p_step_id text)
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
  v_ordinal integer;
  v_email text;
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
  -- O passo escolhe qual e-mail do Contato usa (`destino`, de 1 a 3; ausente vale 1).
  v_ordinal := private.step_destination_ordinal(v_step);
  if v_ordinal is null then
    raise exception 'invalid destination position in the step' using errcode = '22023';
  end if;
  v_email := private.contact_email_at(v_contact.id, v_ordinal);
  if v_email is null then
    raise exception 'contact has no email destination' using errcode = '22023',
      detail = 'position ' || v_ordinal;
  end if;

  select e.* into v_send from private.sequence_step_sends e
  where e.sequence_id = v_sequence.id and e.step_id = p_step_id
  for update;
  if found and private.send_went_out(v_send.status) then
    raise exception 'step already sent or in flight' using errcode = '55000';
  end if;

  -- A versão ativa que contém o passo. Um passo que estava em voo numa reativação ficou com a versão anterior:
  -- reconfirmado, ele entra na versão ativa, para o seguinte continuar sendo programado depois dele.
  if found then
    select a.* into v_auth from private.sequence_authorizations a
    where a.sequence_id = v_sequence.id and a.revoked_at is null
      and private.authorized_step(a.id, p_step_id) is not null;
  end if;

  if v_auth.id is not null then
    -- Reconfirmar não adianta o passo: ele mantém o horário dele, ou o próximo horário válido se já venceu.
    update private.sequence_step_sends e set
      contact_id = v_contact.id,
      channel = 'email',
      destination = v_email,
      authorization_id = v_auth.id,
      mode = case when private.authorized_step(v_auth.id, e.step_id) ->> 'modoEmail' = 'manual'
        then 'manual' else 'auto' end,
      status = case
        when e.status in ('waiting', 'cancelled') then 'waiting'
        when private.authorized_step(v_auth.id, e.step_id) ->> 'modoEmail' = 'manual' then 'confirmed'
        else 'scheduled' end,
      scheduled_for = case
        when e.status in ('waiting', 'cancelled') then null
        else greatest(e.scheduled_for, private.next_send_slot(private.clock_now(), 0,
          private.step_window(v_auth.document, private.authorized_step(v_auth.id, e.step_id)))) end,
      claimed_until = null,
      attempts = 0,
      confirmed_at = now(),
      last_error = null,
      last_error_at = null,
      updated_at = now()
    where e.id = v_send.id
    returning * into v_send;
    perform private.schedule_next_step(v_sequence.id, coalesce(
      (select max(x.sent_at) from private.sequence_step_sends x where x.sequence_id = v_sequence.id),
      private.clock_now()));
    select e.* into v_send from private.sequence_step_sends e where e.id = v_send.id;
  else
    insert into private.sequence_step_sends (
      sequence_id, workspace_id, step_id, owner_user_id, contact_id, channel, destination
    ) values (
      v_sequence.id, v_sequence.workspace_id, p_step_id, v_user_id, v_contact.id, 'email', v_email
    )
    on conflict (sequence_id, step_id) do update set
      contact_id = excluded.contact_id,
      channel = excluded.channel,
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

-- O titular confirma (ou reconfirma) um passo de WhatsApp: o telefone da posição `destino` vira o Destino fixo, desde
-- que o Contato o tenha marcado como WhatsApp. Sem telefone na posição, ou com a marca desligada (inclusive no
-- principal), a confirmação é recusada: nada sai para um número que o Contato não usa no WhatsApp.
create function public.confirm_whatsapp_step(p_sequence_id uuid, p_step_id text)
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
  v_ordinal integer;
  v_phone text;
  v_whatsapp boolean;
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
  if v_step ->> 'canal' <> 'whatsapp' then
    raise exception 'only whatsapp steps can be confirmed here' using errcode = '0A000';
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
  -- O passo escolhe qual telefone do Contato usa (`destino`, de 1 a 3 na lista inteira; ausente vale 1).
  v_ordinal := private.step_destination_ordinal(v_step);
  if v_ordinal is null then
    raise exception 'invalid destination position in the step' using errcode = '22023';
  end if;
  select p.value, p.whatsapp into v_phone, v_whatsapp from private.contact_phone_at(v_contact.id, v_ordinal) p;
  if v_phone is null then
    raise exception 'contact has no phone destination' using errcode = '22023',
      detail = 'position ' || v_ordinal;
  end if;
  if not v_whatsapp then
    raise exception 'contact phone at this position is not flagged as whatsapp' using errcode = '22023',
      detail = 'position ' || v_ordinal;
  end if;

  select e.* into v_send from private.sequence_step_sends e
  where e.sequence_id = v_sequence.id and e.step_id = p_step_id
  for update;
  if found and private.send_went_out(v_send.status) then
    raise exception 'step already sent or in flight' using errcode = '55000';
  end if;

  if found then
    select a.* into v_auth from private.sequence_authorizations a
    where a.sequence_id = v_sequence.id and a.revoked_at is null
      and private.authorized_step(a.id, p_step_id) is not null;
  end if;

  if v_auth.id is not null then
    -- Dentro de uma versão autorizada o passo mantém a vez, e o WhatsApp sempre sai sozinho no horário.
    update private.sequence_step_sends e set
      contact_id = v_contact.id,
      channel = 'whatsapp',
      destination = v_phone,
      authorization_id = v_auth.id,
      mode = 'auto',
      status = case when e.status in ('waiting', 'cancelled') then 'waiting' else 'scheduled' end,
      scheduled_for = case
        when e.status in ('waiting', 'cancelled') then null
        else greatest(e.scheduled_for, private.next_send_slot(private.clock_now(), 0,
          private.step_window(v_auth.document, private.authorized_step(v_auth.id, e.step_id)))) end,
      claimed_until = null,
      attempts = 0,
      confirmed_at = now(),
      last_error = null,
      last_error_at = null,
      updated_at = now()
    where e.id = v_send.id
    returning * into v_send;
    perform private.schedule_next_step(v_sequence.id, coalesce(
      (select max(x.sent_at) from private.sequence_step_sends x where x.sequence_id = v_sequence.id),
      private.clock_now()));
    select e.* into v_send from private.sequence_step_sends e where e.id = v_send.id;
  else
    -- Fora de uma versão é uma confirmação avulsa: só sai pela ação explícita do titular.
    insert into private.sequence_step_sends (
      sequence_id, workspace_id, step_id, owner_user_id, contact_id, channel, destination
    ) values (
      v_sequence.id, v_sequence.workspace_id, p_step_id, v_user_id, v_contact.id, 'whatsapp', v_phone
    )
    on conflict (sequence_id, step_id) do update set
      contact_id = excluded.contact_id,
      channel = excluded.channel,
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

revoke all on function public.confirm_whatsapp_step(uuid, text) from public, anon;
grant execute on function public.confirm_whatsapp_step(uuid, text) to authenticated;

-- 7. Ativar envios agora também valida e fixa os passos de WhatsApp pendentes. Um bloqueio volta em outcome, com o
-- passo que o causou: os de E-mail são os de sempre; os de WhatsApp são `contact_unlinked`, `contact_without_phone`
-- (posição 1 sem telefone), `destination_not_found` (posição 2 ou 3 sem telefone), `phone_not_whatsapp` (telefone sem
-- a marca de WhatsApp), `empty_content` e `whatsapp_sender_not_ready` (o titular sem Conta de WhatsApp pronta).
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
  v_ordinal integer;
  v_destination text;
  v_whatsapp boolean;
  v_auth private.sequence_authorizations;
  v_version integer;
  v_scheduled uuid;
  v_pending jsonb := '[]'::jsonb;
  v_item jsonb;
  v_first_whatsapp text;
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

  -- Os passos de E-mail e de WhatsApp pendentes, validados na ordem do documento, com o Contato e o Destino atual.
  for v_step, v_n in
    select t.step, t.n from jsonb_array_elements(v_steps) with ordinality as t(step, n) order by t.n
  loop
    v_channel := v_step ->> 'canal';
    continue when coalesce(v_channel, '') not in ('email', 'whatsapp');
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
    -- O passo escolhe qual e-mail ou telefone do Contato usa (`destino`, de 1 a 3; ausente vale 1).
    v_ordinal := private.step_destination_ordinal(v_step);
    if v_channel = 'email' then
      v_destination := private.contact_email_at(v_contact.id, v_ordinal);
      if v_destination is null then
        return query select case when v_ordinal = 1 then 'contact_without_email' else 'destination_not_found' end,
          v_step ->> 'id', null::integer, null::timestamptz;
        return;
      end if;
    else
      v_destination := null;
      v_whatsapp := null;
      select p.value, p.whatsapp into v_destination, v_whatsapp from private.contact_phone_at(v_contact.id, v_ordinal) p;
      if v_destination is null then
        return query select case when v_ordinal = 1 then 'contact_without_phone' else 'destination_not_found' end,
          v_step ->> 'id', null::integer, null::timestamptz;
        return;
      end if;
      if not v_whatsapp then
        return query select 'phone_not_whatsapp', v_step ->> 'id', null::integer, null::timestamptz;
        return;
      end if;
    end if;
    if nullif(btrim(coalesce(v_step ->> 'corpo', '')), '') is null then
      return query select 'empty_content', v_step ->> 'id', null::integer, null::timestamptz;
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

  if exists (select 1 from jsonb_array_elements(v_pending) i where i ->> 'channel' = 'email') and not exists (
    select 1 from private.sender_accounts a
    where a.workspace_id = v_sequence.workspace_id and a.owner_user_id = v_user_id
      and a.channel = 'email' and a.status = 'ready' and not a.reconciliation_required) then
    return query select 'sender_not_ready', null::text, null::integer, null::timestamptz;
    return;
  end if;
  -- O WhatsApp usa só a Conta de WhatsApp do próprio titular.
  if exists (select 1 from jsonb_array_elements(v_pending) i where i ->> 'channel' = 'whatsapp')
    and private.whatsapp_sender_id(v_sequence.workspace_id, v_user_id) is null then
    select i -> 'step' ->> 'id' into v_first_whatsapp
    from jsonb_array_elements(v_pending) with ordinality as t(i, n) where i ->> 'channel' = 'whatsapp'
    order by n limit 1;
    return query select 'whatsapp_sender_not_ready', v_first_whatsapp, null::integer, null::timestamptz;
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

  -- Ativar é confirmar o documento inteiro: cada passo pendente fixa o Destino atual (ADR-0014) e espera a vez.
  for v_item in select value from jsonb_array_elements(v_pending) loop
    insert into private.sequence_step_sends (
      sequence_id, workspace_id, step_id, owner_user_id, contact_id, channel, destination,
      status, authorization_id, mode, step_order
    ) values (
      v_sequence.id, v_sequence.workspace_id, v_item -> 'step' ->> 'id', v_user_id, (v_item ->> 'contact_id')::uuid,
      v_item ->> 'channel', v_item ->> 'destination', 'waiting', v_auth.id,
      private.step_send_mode(v_item -> 'step'), (v_item ->> 'n')::integer
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

-- 8. A liberação do passo de E-mail (ticket 27) recusa um Envio de outro canal e só continua a conversa de outro
-- e-mail: o `message_id` de um envio de WhatsApp nunca serve de `reply_to_message_id`. Fora isso é a definição de antes.
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

  -- Um Envio de outro canal nunca sai pelo caminho do E-mail.
  if v_blocked is null and v_send.channel <> 'email' then
    v_blocked := 'wrong_channel';
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
          scheduled_for = v_slot, claimed_until = null, updated_at = now()
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
  -- Sem nenhum anterior, o passo abre uma conversa nova. Só e-mails: o id de uma mensagem de WhatsApp não vale aqui.
  if v_subject ~* '^\s*re\s*:' then
    select e.provider_message_id into v_reply_to from private.sequence_step_sends e
    where e.sequence_id = v_sequence.id and e.contact_id = v_send.contact_id and e.channel = 'email'
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

-- 9. A liberação do passo de WhatsApp: o mesmo desenho da do E-mail, revalidando titular, Participação,
-- responsabilidade, versão autorizada, pausa, janela, Conta remetente de WhatsApp do próprio titular, Contato, Destino e
-- espaçamento. Um Destino só sai se ainda for um dos telefones do Contato marcados como WhatsApp (ADR-0014): mudou ou
-- foi removido, `destination_changed`; continua telefone do Contato mas sem a marca, `destination_no_whatsapp`; nos
-- dois casos o passo espera a reconfirmação. Devolve o texto (sem assunto) e, quando um envio anterior desta Sequência
-- ao mesmo Contato, pela mesma Conta e para o mesmo número, guardou a conversa do provedor, o id dela; sem ele, é a
-- primeira mensagem e a Edge Function confere se o número tem WhatsApp antes de abrir a conversa.
create function private.release_whatsapp_step_send(p_send_id uuid, p_user_id uuid, p_due_only boolean)
returns table (
  outcome text, send_id uuid, unipile_account_id text, destination text, contact_name text,
  body text, provider_chat_id text
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
  v_chat_id text;
  v_blocked text;
  v_account public.target_accounts;
  v_owner_name text;
  v_window jsonb;
  v_slot timestamptz;
  v_sender_id uuid;
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

  if v_blocked is null and v_send.channel <> 'whatsapp' then
    v_blocked := 'wrong_channel';
  end if;

  -- Defesa em profundidade: o Executor não reserva nem chama por WhatsApp com o envio automático desligado, e aqui a
  -- liberação dele também recusa. O envio manual do titular (p_due_only falso) não passa por esta regra.
  if v_blocked is null and p_due_only and not private.whatsapp_auto_send_enabled() then
    v_blocked := 'automatic_disabled';
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

  -- Só a Conta remetente de WhatsApp do próprio titular: nunca a de outro participante.
  if v_blocked is null then
    v_sender_id := private.whatsapp_sender_id(v_sequence.workspace_id, p_user_id);
    if v_sender_id is null then
      v_blocked := 'sender_not_ready';
    else
      select a.* into v_sender from private.sender_accounts a where a.id = v_sender_id;
    end if;
  end if;

  if v_blocked is null then
    select c.* into v_contact from public.contacts c
    where c.id = v_send.contact_id and c.workspace_id = v_sequence.workspace_id;
    if not found or not exists (
      select 1 from public.contact_account_links l
      where l.contact_id = v_send.contact_id and l.target_account_id = v_sequence.target_account_id::uuid
        and l.ended_at is null) then
      v_blocked := 'contact_unlinked';
    -- ADR-0014: o Destino fixado só sai se ainda for um dos telefones do Contato marcados como WhatsApp.
    elsif not private.contact_has_phone(v_contact.id, v_send.destination) then
      v_blocked := 'destination_changed';
    elsif not private.contact_has_whatsapp_phone(v_contact.id, v_send.destination) then
      v_blocked := 'destination_no_whatsapp';
    end if;
    if v_blocked is not null then
      update private.sequence_step_sends set
        status = 'awaiting_reconfirmation', claimed_until = null,
        last_error = v_blocked, last_error_at = now(), updated_at = now()
      where id = v_send.id;
    end if;
  end if;

  -- Antispam: a mesma Conta não envia duas mensagens dentro do espaçamento mínimo. A trava por Conta serializa as
  -- liberações concorrentes (de Sequências diferentes, do Executor e do titular) ANTES de olhar a hora do último envio:
  -- a segunda espera a primeira gravar `sending_at` e então vê o espaçamento. Vale até o fim da transação. Um passo
  -- que cai aqui continua vencido e sai numa rodada seguinte do Executor.
  if v_blocked is null then
    perform pg_advisory_xact_lock(hashtextextended('whatsapp_sender:' || v_sender.id::text, 0));
  end if;
  if v_blocked is null and private.whatsapp_sender_in_spacing(v_sender.id, v_send.id) then
    v_blocked := 'sender_spacing';
    if p_due_only then
      update private.sequence_step_sends set claimed_until = null, updated_at = now()
      where id = v_send.id and status = 'scheduled';
    end if;
  end if;

  if v_blocked is null then
    select a.* into v_account from public.target_accounts a where a.id::text = v_sequence.target_account_id;
    select coalesce(nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''), nullif(btrim(u.raw_user_meta_data ->> 'name'), ''), u.email)
      into v_owner_name from auth.users u where u.id = p_user_id;
    v_body := private.render_step_template(coalesce(v_step ->> 'corpo', ''), v_account, v_contact, v_owner_name);
    if nullif(btrim(v_body), '') is null then
      v_blocked := 'empty_content';
    end if;
  end if;

  -- Um bloqueio que deixa o passo programado fica gravado com o motivo, e o executor só tenta de novo em 15 minutos.
  if v_blocked in ('sender_not_ready', 'owner_not_responsible', 'step_missing', 'empty_content') and p_due_only then
    update private.sequence_step_sends set
      last_error = v_blocked, last_error_at = now(), claimed_until = now() + interval '15 minutes', updated_at = now()
    where id = v_send.id and status = 'scheduled';
  end if;

  if v_blocked is not null then
    return query select v_blocked, v_send.id, null::text, null::text, null::text, null::text, null::text;
    return;
  end if;

  -- A conversa já aberta: a de um envio anterior desta Sequência, ao mesmo Contato, pela mesma Conta e para o mesmo
  -- número (o id de uma conversa vale só na conta que a abriu).
  select e.provider_chat_id into v_chat_id from private.sequence_step_sends e
  where e.sequence_id = v_sequence.id and e.contact_id = v_send.contact_id and e.channel = 'whatsapp'
    and e.status = 'sent' and e.provider_chat_id is not null and e.id <> v_send.id
    and e.sender_account_id = v_sender.id and e.destination = v_send.destination
  order by e.sent_at desc
  limit 1;

  update private.sequence_step_sends set
    status = 'sending', sender_account_id = v_sender.id, attempts = attempts + 1,
    sending_at = clock_timestamp(), claimed_until = null, subject = null, body = v_body, updated_at = now()
  where id = v_send.id;

  return query select 'released', v_send.id, v_sender.unipile_account_id, v_send.destination, v_contact.name,
    v_body, v_chat_id;
end;
$$;

revoke all on function private.release_whatsapp_step_send(uuid, uuid, boolean) from public, anon, authenticated;

-- O titular pede o envio (Edge Function sequence-step-sends, com o JWT dele validado).
create function public.release_whatsapp_step_send(p_send_id uuid, p_user_id uuid)
returns table (
  outcome text, send_id uuid, unipile_account_id text, destination text, contact_name text,
  body text, provider_chat_id text
)
language sql
security definer
set search_path = ''
as $$
  select * from private.release_whatsapp_step_send(p_send_id, p_user_id, false);
$$;

revoke all on function public.release_whatsapp_step_send(uuid, uuid) from public, anon, authenticated;
grant execute on function public.release_whatsapp_step_send(uuid, uuid) to service_role;

-- O executor libera um passo automático de WhatsApp vencido, em nome do titular da Sequência.
create function public.release_due_whatsapp_step_send(p_send_id uuid)
returns table (
  outcome text, send_id uuid, unipile_account_id text, destination text, contact_name text,
  body text, provider_chat_id text
)
language sql
security definer
set search_path = ''
as $$
  select r.* from private.sequence_step_sends e,
    lateral private.release_whatsapp_step_send(e.id, e.owner_user_id, true) r
  where e.id = p_send_id;
$$;

revoke all on function public.release_due_whatsapp_step_send(uuid) from public, anon, authenticated;
grant execute on function public.release_due_whatsapp_step_send(uuid) to service_role;

-- O canal de um Envio do titular, para a Edge Function escolher o caminho (E-mail ou WhatsApp). Nulo quando o Envio não
-- existe ou não é do titular.
create function public.step_send_channel(p_send_id uuid, p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select e.channel from private.sequence_step_sends e
  where e.id = p_send_id and p_user_id is not null and e.owner_user_id = p_user_id;
$$;

revoke all on function public.step_send_channel(uuid, uuid) from public, anon, authenticated;
grant execute on function public.step_send_channel(uuid, uuid) to service_role;

-- A Unipile disse que o número não tem WhatsApp (404 na conferência): nada foi enviado, e o passo espera o titular
-- corrigir o número e reconfirmar. Só vale para um Envio de WhatsApp em voo. Uma falha da própria conferência (5xx,
-- tempo esgotado) não passa por aqui: vai por record_sequence_step_send_result como falha, com nova tentativa.
create function public.block_whatsapp_step_send(p_send_id uuid, p_reason text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_send private.sequence_step_sends;
begin
  if p_reason is distinct from 'destination_no_whatsapp' then
    raise exception 'unknown block reason' using errcode = '22023';
  end if;
  -- A trava da Sequência vem antes da linha do Envio, na mesma ordem da liberação.
  perform 1 from public.sequences s
  where s.id = (select e.sequence_id from private.sequence_step_sends e where e.id = p_send_id)
  for update;
  select e.* into v_send from private.sequence_step_sends e where e.id = p_send_id for update;
  if not found then
    raise exception 'send not found' using errcode = 'P0002';
  end if;
  if v_send.channel <> 'whatsapp' or v_send.status <> 'sending' then
    raise exception 'send is not a whatsapp send in flight' using errcode = '55000';
  end if;
  update private.sequence_step_sends set
    status = 'awaiting_reconfirmation', claimed_until = null,
    attempts = greatest(attempts - 1, 0), sending_at = null,
    last_error = p_reason, last_error_at = now(), updated_at = now()
  where id = v_send.id;
  return 'awaiting_reconfirmation';
end;
$$;

revoke all on function public.block_whatsapp_step_send(uuid, text) from public, anon, authenticated;
grant execute on function public.block_whatsapp_step_send(uuid, text) to service_role;

-- 10. O Executor reserva os passos automáticos vencidos (E-mail e WhatsApp) e agora devolve o canal, para enviar pelo
-- caminho certo. Por Conta remetente de WhatsApp, entrega no máximo um passo por chamada e nenhum enquanto a Conta
-- estiver dentro do espaçamento mínimo: o passo fica vencido e sai numa rodada seguinte. Passo de WhatsApp só é
-- entregue com o envio automático ligado (`whatsapp_auto_send`). A reserva dura 2 minutos e só evita trabalho repetido:
-- quem garante o espaçamento e impede o envio duplicado é a liberação (trava por Conta e passagem para "sending" com a
-- linha travada).
--
-- Duas etapas, em comandos separados: um snapshot antigo pode devolver uma linha que outra chamada acabou de reservar
-- ou liberar (o `for update skip locked` re-lê a linha travada, mas não refaz a fila nem o espaçamento). A primeira
-- escolhe e trava; a segunda, já com um snapshot novo e com as linhas travadas, confere de novo situação, reserva,
-- espaçamento e a vez de cada Conta antes de reservar.
drop function public.claim_due_step_sends(integer);

create function public.claim_due_step_sends(p_limit integer default 10)
returns table (send_id uuid, owner_user_id uuid, channel text)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_ids uuid[];
  v_auto boolean := private.whatsapp_auto_send_enabled();
begin
  perform private.expire_stale_sends(null);

  with cand as (
    select e.id, e.scheduled_for, e.channel, e.workspace_id, e.owner_user_id,
      case when e.channel = 'whatsapp' then private.whatsapp_sender_id(e.workspace_id, e.owner_user_id) end as sender_id
    from private.sequence_step_sends e
    join public.sequences s on s.id = e.sequence_id and s.status = 'ativa'
    join private.sequence_authorizations a on a.id = e.authorization_id and a.revoked_at is null
    where e.status = 'scheduled' and e.scheduled_for <= private.clock_now()
      and (e.claimed_until is null or e.claimed_until < now())
      and (e.channel <> 'whatsapp' or v_auto)
  ), ranked as (
    select c.id, c.scheduled_for, c.channel, c.sender_id,
      row_number() over (partition by c.sender_id order by c.scheduled_for, c.id) as rn
    from cand c
    where c.sender_id is null or not (
      private.whatsapp_sender_in_spacing(c.sender_id, c.id)
      or exists (
        select 1 from private.sequence_step_sends x
        where x.channel = 'whatsapp' and x.workspace_id = c.workspace_id and x.owner_user_id = c.owner_user_id
          and x.id <> c.id and x.claimed_at > now() - private.whatsapp_send_spacing()))
  ), due as (
    select e.id from ranked r
    join private.sequence_step_sends e on e.id = r.id
    where (r.sender_id is null or r.rn = 1)
      -- Reconferido na linha travada (o Postgres reavalia estas condições na versão mais nova dela).
      and e.status = 'scheduled' and e.scheduled_for <= private.clock_now()
      and (e.claimed_until is null or e.claimed_until < now())
    order by r.scheduled_for
    limit greatest(1, least(coalesce(p_limit, 10), 50))
    for update of e skip locked
  )
  select coalesce(array_agg(d.id), '{}') into v_ids from due d;

  -- Segunda etapa: snapshot novo, linhas já travadas por esta transação.
  return query
  with locked as (
    select e.id, e.scheduled_for, e.channel, e.workspace_id, e.owner_user_id,
      case when e.channel = 'whatsapp' then private.whatsapp_sender_id(e.workspace_id, e.owner_user_id) end as sender_id
    from private.sequence_step_sends e
    where e.id = any (v_ids) and e.status = 'scheduled' and e.scheduled_for <= private.clock_now()
      and (e.claimed_until is null or e.claimed_until < now())
      and (e.channel <> 'whatsapp' or v_auto)
  ), ranked as (
    select l.id, l.sender_id,
      row_number() over (partition by l.sender_id order by l.scheduled_for, l.id) as rn
    from locked l
    where l.sender_id is null or not (
      private.whatsapp_sender_in_spacing(l.sender_id, l.id)
      or exists (
        select 1 from private.sequence_step_sends x
        where x.channel = 'whatsapp' and x.workspace_id = l.workspace_id and x.owner_user_id = l.owner_user_id
          and x.id <> l.id and x.claimed_at > now() - private.whatsapp_send_spacing()))
  )
  update private.sequence_step_sends e set claimed_until = now() + interval '2 minutes', claimed_at = now()
  from ranked r
  where e.id = r.id and (r.sender_id is null or r.rn = 1)
  returning e.id, e.owner_user_id, e.channel;
end;
$$;

revoke all on function public.claim_due_step_sends(integer) from public, anon, authenticated;
grant execute on function public.claim_due_step_sends(integer) to service_role;

-- O relógio também respeita o interruptor: sem o envio automático de WhatsApp ligado, um passo de WhatsApp vencido não
-- faz o banco chamar o Executor. O resto (E-mail e reconciliação de Conta remetente) continua como na migration da
-- reconciliação, de onde vem esta definição.
create or replace function private.kick_sequence_runner()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_settings private.sequence_runner_settings;
begin
  perform private.expire_stale_sends(null);
  select s.* into v_settings from private.sequence_runner_settings s;
  if v_settings.function_url is null then
    return false;
  end if;
  if not exists (
    select 1 from private.sequence_step_sends e
    join public.sequences q on q.id = e.sequence_id and q.status = 'ativa'
    join private.sequence_authorizations a on a.id = e.authorization_id and a.revoked_at is null
    where e.status = 'scheduled' and e.scheduled_for <= private.clock_now()
      and (e.claimed_until is null or e.claimed_until < now())
      and (e.channel <> 'whatsapp' or v_settings.whatsapp_auto_send))
    and not exists (select 1 from private.sender_accounts a where private.sender_awaits_reconciliation(a)) then
    return false;
  end if;
  perform private.post_to_sequence_runner(v_settings.function_url, v_settings.token);
  return true;
end;
$$;

revoke all on function private.kick_sequence_runner() from public, anon, authenticated, service_role;

-- 11. O resultado do provedor. Um envio aceito de WhatsApp registra a Interação `mensagem-enviada` (sem conteúdo).
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
    case v_send.channel when 'whatsapp' then 'mensagem-enviada' else 'email-enviado' end,
    v_send.sent_at, 'sequencia', v_send.owner_user_id);
  update public.target_accounts
  set last_interaction_at = greatest(last_interaction_at, v_send.sent_at)
  where id = v_account_id;

  -- Sem versão ativa (Sequência só com confirmações avulsas), não há nada a programar.
  perform private.schedule_next_step(v_send.sequence_id, v_send.sent_at);
  return v_send;
end;
$$;

revoke all on function private.mark_step_send_sent(uuid, text, text, text) from public, anon, authenticated;

drop function public.record_sequence_step_send_result(uuid, text, text, text, text, integer);

-- p_retry_after_seconds: o prazo que o provedor pediu (ex.: Retry-After de um 429); a nova tentativa respeita o
-- maior entre ele e o intervalo padrão. p_provider_chat_id: a conversa do WhatsApp, guardada quando o envio é aceito.
create function public.record_sequence_step_send_result(
  p_send_id uuid,
  p_outcome text,
  p_provider_email_id text,
  p_provider_message_id text,
  p_error text,
  p_retry_after_seconds integer default null,
  p_provider_chat_id text default null
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
  -- A trava da Sequência vem antes da linha do Envio, na mesma ordem da liberação.
  perform 1 from public.sequences s
  where s.id = (select e.sequence_id from private.sequence_step_sends e where e.id = p_send_id)
  for update;
  select e.* into v_send from private.sequence_step_sends e where e.id = p_send_id for update;
  if not found then
    raise exception 'send not found' using errcode = 'P0002';
  end if;
  -- O eco nos itens enviados pode chegar antes do resultado da chamada: o envio já está provado.
  if v_send.status = 'sent' then
    update private.sequence_step_sends set
      provider_email_id = coalesce(provider_email_id, nullif(btrim(p_provider_email_id), '')),
      provider_message_id = coalesce(provider_message_id, nullif(btrim(p_provider_message_id), '')),
      provider_chat_id = coalesce(provider_chat_id, nullif(btrim(p_provider_chat_id), '')),
      updated_at = now()
    where id = v_send.id;
    return 'sent';
  end if;
  if v_send.status <> 'sending' then
    raise exception 'send is not in flight' using errcode = '55000';
  end if;

  if p_outcome = 'sent' then
    v_send := private.mark_step_send_sent(v_send.id, p_provider_email_id, p_provider_message_id, null);
    update private.sequence_step_sends set
      provider_chat_id = coalesce(provider_chat_id, nullif(btrim(p_provider_chat_id), ''))
    where id = v_send.id;
    return v_send.status;
  end if;

  if p_outcome = 'failed' and v_send.mode = 'auto' and v_send.attempts < 3 then
    select a.* into v_auth from private.sequence_authorizations a
    where a.id = v_send.authorization_id and a.revoked_at is null;
    if found then
      v_retry_at := private.next_send_slot(
        private.clock_now() + greatest(
          case when v_send.attempts <= 1 then interval '5 minutes' else interval '30 minutes' end,
          make_interval(secs => greatest(coalesce(p_retry_after_seconds, 0), 0))), 0,
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

revoke all on function public.record_sequence_step_send_result(uuid, text, text, text, text, integer, text)
  from public, anon, authenticated;
grant execute on function public.record_sequence_step_send_result(uuid, text, text, text, text, integer, text)
  to service_role;

-- "Não saiu" reconfirma o passo pelo canal dele (a confirmação de WhatsApp é a própria). Fora isso é a de antes.
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
  if v_send.channel = 'whatsapp' then
    return (select c.status from public.confirm_whatsapp_step(p_sequence_id, p_step_id) c);
  end if;
  return (select c.status from public.confirm_sequence_step(p_sequence_id, p_step_id) c);
end;
$$;

revoke all on function public.resolve_uncertain_step(uuid, text, boolean) from public, anon;
grant execute on function public.resolve_uncertain_step(uuid, text, boolean) to authenticated;

-- 12. Formatos de webhook para a parte 2. Os campos exatos do `message.new` (e se ele também sai para mensagens do
-- próprio titular ou da API) não estão documentados: o receptor guarda, só quando o segredo UNIPILE_CAPTURE_SHAPES vale
-- 1, um FORMATO censurado do corpo (chaves em snake_case, aninhamento, booleanos, nulos, inteiros pequenos, tamanho das
-- strings e só o nome do evento ou do provedor de uma lista explícita), nunca nomes, telefones, ids nem texto. Ninguém do app lê nem escreve aqui: só a função abaixo escreve, e
-- a leitura é pelo SQL Editor. No máximo 20 linhas por tipo de evento (ficam as mais antigas) e 200 no total.
create table private.webhook_shape_captures (
  id bigint generated always as identity primary key,
  event_type text not null check (event_type ~ '^[a-z][a-z0-9_.-]{0,59}$'),
  shape jsonb not null check (jsonb_typeof(shape) = 'object' and pg_column_size(shape) <= 65536),
  captured_at timestamptz not null default now()
);

create index webhook_shape_captures_type_idx on private.webhook_shape_captures (event_type, id);

alter table private.webhook_shape_captures enable row level security;
revoke all on private.webhook_shape_captures from public, anon, authenticated, service_role;

comment on table private.webhook_shape_captures is
  'Redacted SHAPES of webhook bodies (snake_case keys, nesting, small integers, string lengths, allowlisted event/provider names), captured only while the '
  'UNIPILE_CAPTURE_SHAPES secret is 1. Never content, names, phones or ids. At most 20 rows per event type.';

create function public.capture_webhook_shape(p_event_type text, p_shape jsonb)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_per_type constant integer := 20;
  v_total constant integer := 200;
begin
  if p_event_type is null or p_event_type !~ '^message\.[a-z0-9_.-]{1,50}$'
    or p_shape is null or jsonb_typeof(p_shape) <> 'object' or pg_column_size(p_shape) > 65536 then
    return false;
  end if;
  -- Duas entregas do mesmo tipo ao mesmo tempo se serializam, para o teto valer sob concorrência.
  perform pg_advisory_xact_lock(hashtext('webhook_shape:' || p_event_type));
  if (select count(*) from private.webhook_shape_captures c where c.event_type = p_event_type) >= v_per_type
    or (select count(*) from private.webhook_shape_captures) >= v_total then
    return false;
  end if;
  insert into private.webhook_shape_captures (event_type, shape) values (p_event_type, p_shape);
  return true;
end;
$$;

revoke all on function public.capture_webhook_shape(text, jsonb) from public, anon, authenticated;
grant execute on function public.capture_webhook_shape(text, jsonb) to service_role;
