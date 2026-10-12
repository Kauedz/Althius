-- Canais 07: o aceite de um convite de LinkedIn é ligado ao Envio do convite.
--
-- Antes, `new_relation`/`relation.new` só gravava outcome = 'relation' e voltava, sem procurar o Envio. Agora o aceite
-- procura o convite: mesma Conta remetente, `provider_user_id` do Envio igual ao identificador do perfil que aceitou
-- (na v1, o `provider_id` do `new_relation`, que `private.chat_message_fields` lê como `message_id`), ação 'convite' e
-- status 'sent'. Achando, grava o `send_id` no evento e cria a Interação 'convite-aceito'. O aceite nunca é resposta:
-- não grava conteúdo e não pausa a Sequência. Redefine `ingest_unipile_chat_event` a partir da definição mais recente
-- (20261001150000_canais_whatsapp_e_linkedin.sql; nenhuma migration posterior a redefiniu).
--
-- 1. 'convite-aceito' entra nos tipos de Interação.
-- 2. `private.link_linkedin_acceptance`: a junção e a Interação, num lugar só (a ingestão e a religação usam).
-- 3. `ingest_unipile_chat_event`: o ramo da relação usa a junção; um aceite sem Envio pode ser avaliado de novo.
-- 4. `private.relink_linkedin_relations`: religa os aceites que já estavam gravados sem Envio (rodada uma vez abaixo).

alter table public.account_interactions drop constraint account_interactions_kind_check;
alter table public.account_interactions add constraint account_interactions_kind_check check (kind in (
  'email-enviado', 'email-recebido', 'mensagem-enviada', 'mensagem-recebida', 'convite-aceito', 'ligacao', 'reuniao'
));

-- A junção do aceite com o Envio do convite e a Interação dele. Devolve a linha com nulos quando nenhum convite casa.
-- Um convite aceito conta uma Interação só: se outro evento já criou a dela, este só ganha o Envio.
create function private.link_linkedin_acceptance(
  p_event_row_id uuid,
  p_sender_account_id uuid,
  p_provider_user_id text,
  p_occurred_at timestamptz
) returns table (linked_send_id uuid, linked_interaction_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_send private.sequence_step_sends;
  v_account_id uuid;
  v_interaction_id uuid;
begin
  select e.* into v_send from private.sequence_step_sends e
  where e.sender_account_id = p_sender_account_id and e.channel = 'linkedin' and e.linkedin_action = 'convite'
    and e.status = 'sent' and e.provider_user_id = p_provider_user_id
  order by coalesce(e.sent_at, e.sending_at) desc nulls last, e.id
  limit 1;
  if not found then
    return query select null::uuid, null::uuid;
    return;
  end if;

  perform pg_advisory_xact_lock(hashtext('convite-aceito|' || v_send.id::text));
  select ev.interaction_id into v_interaction_id from private.unipile_chat_events ev
  where ev.send_id = v_send.id and ev.interaction_id is not null and ev.id <> p_event_row_id
    and ev.event_type in ('relation.new', 'new_relation')
  limit 1;
  if v_interaction_id is not null then
    return query select v_send.id, null::uuid;
    return;
  end if;

  select s.target_account_id::uuid into v_account_id from public.sequences s where s.id = v_send.sequence_id;
  insert into public.account_interactions (workspace_id, target_account_id, contact_id, kind, occurred_at, source, recorded_by)
  values (v_send.workspace_id, v_account_id, v_send.contact_id, 'convite-aceito', p_occurred_at, 'sequencia', v_send.owner_user_id)
  returning id into v_interaction_id;
  update public.target_accounts
  set last_interaction_at = greatest(last_interaction_at, p_occurred_at)
  where id = v_account_id;
  return query select v_send.id, v_interaction_id;
end;
$$;

revoke all on function private.link_linkedin_acceptance(uuid, uuid, text, timestamptz) from public, anon, authenticated, service_role;

create or replace function public.ingest_unipile_chat_event(
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
  v_link_send_id uuid;
  v_link_interaction_id uuid;
begin
  if p_event_type not in ('message.new', 'chat.update', 'relation.new', 'new_relation') then
    raise exception 'unsupported chat event type' using errcode = '22023';
  end if;

  v_message := case when jsonb_typeof(p_payload -> 'message') = 'object' then p_payload -> 'message' else p_payload end;
  select * into v_f from private.chat_message_fields(coalesce(v_message, '{}'::jsonb));

  -- 1. Dedupe pelo id do evento (a Unipile reentrega até duas vezes). Um evento que ficou sem relação ou antes do
  -- envio pode ser avaliado de novo: a conferência da conversa reapresenta a mesma mensagem, e o Envio pode ter
  -- ganhado o chat só depois. O mesmo vale para um aceite de convite ainda sem Envio: o resultado do convite pode
  -- ter sido gravado depois do aviso.
  insert into private.unipile_chat_events (event_id, event_type, unipile_account_id, provider_chat_id, provider_message_id, outcome)
  values (p_event_id, p_event_type, p_unipile_account_id, v_f.chat_id, v_f.message_id, 'unrelated')
  on conflict (event_id) do update set received_at = now()
    where private.unipile_chat_events.outcome in ('unrelated', 'before_send')
      or (private.unipile_chat_events.outcome = 'relation' and private.unipile_chat_events.send_id is null)
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

  -- 2. Eventos que nunca são resposta: a nova relação (o aceite de um convite) e os técnicos. O aceite de um convite
  -- nosso é ligado ao Envio dele e vira a Interação 'convite-aceito', sem pausar a Sequência.
  if p_event_type in ('relation.new', 'new_relation') then
    if v_f.message_id is not null then
      select l.linked_send_id, l.linked_interaction_id into v_link_send_id, v_link_interaction_id
      from private.link_linkedin_acceptance(v_event_row_id, v_sender.id, v_f.message_id,
        coalesce(private.safe_timestamptz(v_f.sent_at), now())) l;
    end if;
    update private.unipile_chat_events
    set outcome = 'relation', send_id = v_link_send_id, interaction_id = v_link_interaction_id
    where id = v_event_row_id;
    return query select 'relation', v_link_interaction_id, v_link_send_id;
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

-- Religa os aceites que já estavam gravados como 'relation' sem Envio (o identificador do perfil que aceitou ficou no
-- provider_message_id do evento). Do mais antigo ao mais novo, a Interação nasce na data do primeiro aviso. Devolve
-- quantos eventos ganharam o Envio; uma segunda passada devolve 0.
create function private.relink_linkedin_relations()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event record;
  v_send_id uuid;
  v_interaction_id uuid;
  v_linked integer := 0;
begin
  for v_event in
    select e.id, e.sender_account_id, e.provider_message_id, e.received_at
    from private.unipile_chat_events e
    where e.event_type in ('relation.new', 'new_relation') and e.outcome = 'relation' and e.send_id is null
      and e.sender_account_id is not null and e.provider_message_id is not null
    order by e.received_at, e.id
  loop
    begin
      select l.linked_send_id, l.linked_interaction_id into v_send_id, v_interaction_id
      from private.link_linkedin_acceptance(v_event.id, v_event.sender_account_id, v_event.provider_message_id, v_event.received_at) l;
      if v_send_id is not null then
        update private.unipile_chat_events set send_id = v_send_id, interaction_id = v_interaction_id where id = v_event.id;
        v_linked := v_linked + 1;
      end if;
    exception when others then
      raise warning 'relink_linkedin_relations: evento % ignorado: %', v_event.id, sqlerrm;
    end;
  end loop;
  return v_linked;
end;
$$;

revoke all on function private.relink_linkedin_relations() from public, anon, authenticated, service_role;

select private.relink_linkedin_relations();
