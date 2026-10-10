-- Correções de produção da v1 da Unipile (fix-v1-email-whatsapp): a resposta de e-mail e o WhatsApp.
--
-- 1. Resposta de e-mail da v1. O envio grava só o tracking_id (provider_email_id). A resposta traz in_reply_to {id, message_id},
--    onde id é o id do e-mail enviado NA CAIXA (diferente do tracking_id) e message_id é o Message-ID do cabeçalho; o envio não
--    tem Message-ID nem conversa, e o eco não chega. O passo 4 de ingest_unipile_email_event ganha o passo 4b, só para e-mail com
--    in_reply_to (a v2 não manda): liga pelo remetente que é o Destino de um envio da Conta, com o mesmo assunto, escrito depois
--    do envio. O envio aprende o Message-ID e a conversa, e o resto da conversa liga pelos caminhos de sempre.
--    Definição de 20261010011333, com o passo 4b.
--
-- 2. WhatsApp da v1. O aviso de mensagem da v1 não diz de quem é (sem is_sender), então a Conta remetente precisa conhecer o próprio
--    número (own_provider_id), que o titular não aprende por eco na v1. learn_sender_own_provider_id grava o número que a lista
--    de contas da Unipile traz; sender_own_provider_id o lê (o núcleo do envio recusa o passo cujo Destino é o próprio número).
--    As duas são só do service_role. Não mexe em private.release_chat_step_send.

create function private.email_subject_key(p_subject text) returns text
language sql immutable set search_path = ''
as $$
  select btrim(regexp_replace(
    regexp_replace(lower(btrim(coalesce(p_subject, ''))), '^((re|res|enc|fw|fwd|rv)\s*:\s*)+', ''),
    '\s+', ' ', 'g'))
$$;

revoke all on function private.email_subject_key(text) from public, anon, authenticated;

create or replace function public.ingest_unipile_email_event(
  p_event_id text,
  p_event_type text,
  p_unipile_account_id text,
  p_email jsonb,
  p_owner_addresses text[] default '{}'
) returns table (outcome text, interaction_id uuid, send_id uuid, attachments jsonb)
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
  v_contact_id uuid;
  v_interaction public.account_interactions;
  v_email_id text := nullif(btrim(p_email ->> 'id'), '');
  v_message_id text := nullif(btrim(p_email ->> 'message_id'), '');
  v_thread_id text := nullif(btrim(p_email ->> 'thread_id'), '');
  v_from jsonb;
  v_from_email text;
  v_in_reply_to text := private.email_header(p_email, 'In-Reply-To');
  v_references text[] := array_remove(
    regexp_split_to_array(coalesce(private.email_header(p_email, 'References'), ''), '\s+'), '');
  -- Na v1 o aviso de e-mail traz in_reply_to {id, message_id}: o id do e-mail respondido na Unipile e o Message-ID dele.
  v_reply_to_email_id text := nullif(btrim(p_email -> 'in_reply_to' ->> 'id'), '');
  v_reply_to_message_id text := nullif(btrim(p_email -> 'in_reply_to' ->> 'message_id'), '');
  v_learned boolean := false;
  v_header_send text := private.email_header(p_email, 'X-Althius-Envio');
  v_header_send_id uuid;
  v_attachments jsonb := '[]'::jsonb;
  v_received_at timestamptz;
  v_outcome text;
begin
  if p_event_type not in ('email.new', 'email.new.bounce') then
    raise exception 'unsupported email event type' using errcode = '22023';
  end if;

  -- 1. Dedupe pelo id do evento. A Unipile reentrega até duas vezes.
  insert into private.unipile_email_events (event_id, event_type, unipile_account_id, provider_email_id, outcome)
  values (p_event_id, p_event_type, p_unipile_account_id, v_email_id, 'unrelated')
  on conflict (event_id) do nothing
  returning id into v_event_row_id;
  if v_event_row_id is null then
    return query select 'duplicate_event', null::uuid, null::uuid, '[]'::jsonb;
    return;
  end if;

  select a.* into v_sender from private.sender_accounts a where a.unipile_account_id = p_unipile_account_id;
  if not found then
    update private.unipile_email_events set outcome = 'unknown_account' where id = v_event_row_id;
    return query select 'unknown_account', null::uuid, null::uuid, '[]'::jsonb;
    return;
  end if;
  update private.unipile_email_events set sender_account_id = v_sender.id where id = v_event_row_id;

  -- 2. Dedupe pelo e-mail: o email.new sai de novo quando o e-mail é movido ou vai para a lixeira.
  perform pg_advisory_xact_lock(hashtext(p_unipile_account_id || '|' || coalesce(v_email_id, p_event_id)));
  if v_email_id is not null and exists (
    select 1 from private.unipile_email_events e
    where e.unipile_account_id = p_unipile_account_id and e.provider_email_id = v_email_id
      and e.event_type = p_event_type and e.id <> v_event_row_id
      and e.outcome in ('echo', 'reply', 'bounce', 'unrelated')
  ) then
    update private.unipile_email_events set outcome = 'duplicate_email' where id = v_event_row_id;
    return query select 'duplicate_email', null::uuid, null::uuid, '[]'::jsonb;
    return;
  end if;

  v_from := case when jsonb_typeof(p_email -> 'from') = 'array' then p_email -> 'from' -> 0 else p_email -> 'from' end;
  v_from_email := lower(nullif(btrim(v_from ->> 'email'), ''));
  if v_header_send ~* '^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$' then
    v_header_send_id := v_header_send::uuid;
  end if;

  -- 3. Bounce: o payload é o e-mail ORIGINAL enviado. Eco: o próprio envio nos itens enviados.
  select e.* into v_send from private.sequence_step_sends e
  where e.sender_account_id = v_sender.id
    and (e.id = v_header_send_id or e.provider_email_id = v_email_id or e.provider_message_id = v_message_id)
  limit 1;
  if p_event_type = 'email.new.bounce' then
    if found then
      update private.sequence_step_sends set
        status = 'bounced', last_error = 'bounced', last_error_at = now(), updated_at = now()
      where id = v_send.id;
      v_outcome := 'bounce';
    else
      v_outcome := 'unrelated';
    end if;
  elsif found then
    if v_from_email is not null and v_sender.email_address is distinct from v_from_email then
      update private.sender_accounts set email_address = v_from_email, updated_at = now() where id = v_sender.id;
    end if;
    -- O eco prova que o e-mail saiu, mesmo quando o resultado da chamada foi falha e o passo espera nova tentativa.
    if v_send.status not in ('sent', 'bounced') then
      v_send := private.mark_step_send_sent(v_send.id, v_email_id, v_message_id, v_thread_id);
    else
      update private.sequence_step_sends set
        provider_email_id = coalesce(provider_email_id, v_email_id),
        provider_message_id = coalesce(provider_message_id, v_message_id),
        provider_thread_id = coalesce(provider_thread_id, v_thread_id),
        updated_at = now()
      where id = v_send.id;
    end if;
    v_outcome := 'echo';
  -- O que o titular escreveu por conta própria também é eco, nunca resposta do Contato.
  elsif v_from_email is not null and (v_from_email = v_sender.email_address
    or v_from_email = any (select lower(a) from unnest(p_owner_addresses) a)) then
    v_send := null;
    v_outcome := 'echo';
  -- Resposta automática (mailer-daemon, fora do escritório, Auto-Submitted) não é resposta comercial.
  elsif v_from_email ~* '^(mailer-daemon|postmaster|no-?reply|do-?not-?reply)@'
    or lower(coalesce(private.email_header(p_email, 'Auto-Submitted'), 'no')) <> 'no'
    or private.email_header(p_email, 'X-Autoreply') is not null
    or private.email_header(p_email, 'X-Autorespond') is not null then
    v_send := null;
    v_outcome := 'automatic';
  end if;

  -- 4. Resposta: a conversa de um passo enviado, ou o In-Reply-To/References com um message_id enviado, ou o in_reply_to do
  -- aviso da v1 contra o id do e-mail enviado (o envio da v1 grava só esse id, sem conversa nem Message-ID) ou o Message-ID.
  if v_outcome is null then
    select e.* into v_send from private.sequence_step_sends e
    where e.sender_account_id = v_sender.id
      and e.status in ('sent', 'uncertain', 'bounced')
      and (
        (v_thread_id is not null and e.provider_thread_id = v_thread_id)
        or (e.provider_message_id is not null
          and (e.provider_message_id = v_in_reply_to or e.provider_message_id = any (v_references)
            or e.provider_message_id = v_reply_to_message_id))
        or (v_reply_to_email_id is not null and e.provider_email_id = v_reply_to_email_id)
      )
    order by e.sent_at desc nulls last
    limit 1;
    -- 4b. Só na v1 (o aviso traz in_reply_to): o envio guardou só o id do e-mail (tracking_id), e in_reply_to.id é o id do e-mail
    -- enviado NA CAIXA, outro. Nem o eco nem a conversa chegam. Liga o remetente que é o Destino de um envio da Conta, com o
    -- mesmo assunto (sem Re:/Enc:), escrito depois do envio. Um e-mail sem in_reply_to (a v2) nunca passa por aqui.
    if not found and jsonb_typeof(p_email -> 'in_reply_to') = 'object' and v_from_email is not null then
      select e.* into v_send from private.sequence_step_sends e
      where e.sender_account_id = v_sender.id
        and e.status in ('sent', 'uncertain', 'bounced')
        and lower(btrim(e.destination)) = v_from_email
        and private.email_subject_key(e.subject) <> ''
        and private.email_subject_key(e.subject) = private.email_subject_key(p_email ->> 'subject')
        and coalesce(private.safe_timestamptz(p_email ->> 'date'), now()) >= coalesce(e.sent_at, e.sending_at) - interval '2 minutes'
      order by e.sent_at desc nulls last
      limit 1;
      v_learned := found;
    end if;
    v_outcome := case when found then 'reply' else 'unrelated' end;
    -- O envio aprende a conversa e o Message-ID do e-mail respondido: o resto da conversa liga pelos caminhos de sempre.
    if v_learned then
      update private.sequence_step_sends set
        provider_message_id = coalesce(provider_message_id, v_reply_to_message_id),
        provider_thread_id = coalesce(provider_thread_id, v_thread_id),
        updated_at = now()
      where id = v_send.id;
    end if;
  end if;

  if v_outcome = 'reply' then
    -- A trava da Sequência serializa a pausa com uma liberação concorrente de envio.
    select s.* into v_sequence from public.sequences s where s.id = v_send.sequence_id for update;

    -- Quem respondeu: o Contato com esse e-mail e Vínculo ativo na Conta-alvo. Outra pessoa da Conta-alvo
    -- (um colega na mesma conversa) também pausa, mas a Interação pública não a atribui ao Contato errado.
    select c.id into v_contact_id from public.contacts c
    join public.contact_account_links l
      on l.workspace_id = c.workspace_id and l.contact_id = c.id
        and l.target_account_id = v_sequence.target_account_id::uuid and l.ended_at is null
    where c.workspace_id = v_sequence.workspace_id
      and (c.email = v_from_email or private.contact_has_email(c.id, v_from_email))
    limit 1;

    v_received_at := coalesce(private.safe_timestamptz(p_email ->> 'date'), now());

    insert into public.account_interactions (workspace_id, target_account_id, contact_id, kind, occurred_at, source, recorded_by)
    values (v_sequence.workspace_id, v_sequence.target_account_id::uuid, v_contact_id, 'email-recebido',
      v_received_at, 'sequencia', v_sequence.owner_user_id)
    returning * into v_interaction;
    update public.target_accounts
    set last_interaction_at = greatest(last_interaction_at, v_received_at)
    where id = v_sequence.target_account_id::uuid;

    -- Os anexos chegam com id e/ou url; os dois ficam guardados para o download depois do 2xx.
    if jsonb_typeof(p_email -> 'attachments') = 'array' then
      select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'id', coalesce(nullif(btrim(a ->> 'id'), ''), 'anexo-' || n),
        'url', nullif(btrim(a ->> 'url'), ''),
        'name', coalesce(a ->> 'name', a ->> 'filename', 'anexo'),
        'mime', coalesce(a ->> 'mime', a ->> 'mime_type', a ->> 'content_type'),
        'size', case when (a ->> 'size') ~ '^\d+$' then (a ->> 'size')::bigint end,
        'status', 'pending')) order by n), '[]'::jsonb)
      into v_attachments
      from jsonb_array_elements(p_email -> 'attachments') with ordinality as t(a, n)
      where jsonb_typeof(a) = 'object';
    end if;

    insert into private.received_emails (
      interaction_id, workspace_id, owner_user_id, sequence_id, send_id, contact_id, sender_account_id,
      provider_email_id, provider_message_id, provider_thread_id, from_email, from_name,
      subject, body, snippet, received_at, attachments
    ) values (
      v_interaction.id, v_sequence.workspace_id, v_sequence.owner_user_id, v_sequence.id, v_send.id, v_contact_id, v_sender.id,
      coalesce(v_email_id, p_event_id), v_message_id, v_thread_id, v_from_email, nullif(btrim(v_from ->> 'display_name'), ''),
      p_email ->> 'subject', p_email ->> 'body', p_email ->> 'snippet', v_received_at, v_attachments
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

  update private.unipile_email_events
  set outcome = v_outcome, send_id = v_send.id, interaction_id = v_interaction.id
  where id = v_event_row_id;
  return query select v_outcome, v_interaction.id, v_send.id, v_attachments;
end;
$$;

create function public.learn_sender_own_provider_id(p_unipile_account_id text, p_own_provider_id text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_own text := btrim(coalesce(p_own_provider_id, ''));
begin
  if v_own !~ '^[0-9]{8,15}@(s\.whatsapp\.net|lid)$' then
    raise exception 'not a WhatsApp id' using errcode = '22023';
  end if;
  update private.sender_accounts a
  set own_provider_id = v_own, updated_at = now()
  where a.unipile_account_id = p_unipile_account_id and a.channel = 'whatsapp' and a.own_provider_id is distinct from v_own;
  return found;
end;
$$;

revoke all on function public.learn_sender_own_provider_id(text, text) from public, anon, authenticated;
grant execute on function public.learn_sender_own_provider_id(text, text) to service_role;

create function public.sender_own_provider_id(p_unipile_account_id text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select a.own_provider_id from private.sender_accounts a where a.unipile_account_id = p_unipile_account_id limit 1
$$;

revoke all on function public.sender_own_provider_id(text) from public, anon, authenticated;
grant execute on function public.sender_own_provider_id(text) to service_role;
