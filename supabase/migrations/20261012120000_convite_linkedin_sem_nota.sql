-- Convite do LinkedIn sem nota. A nota do convite é opcional: a ativação só recusa com `empty_content` o passo de
-- corpo vazio que não é um convite do LinkedIn. WhatsApp, e-mail, mensagem e InMail do LinkedIn seguem como antes.
--
-- Só `public.activate_sequence` muda: cópia da definição mais recente (20261002120000_anexos_dos_passos), com o teste
-- do corpo vazio marcado "convite sem nota". `private.release_chat_step_send` não muda: ela já monta o corpo com
-- `coalesce(corpo, '')` e entrega o convite de corpo vazio ao Executor; quem deixa de mandar o campo `message` à
-- Unipile nesse caso é o envio (send-chat-step.ts e as pontes v1 e v2). O limite de 300 caracteres da nota, o bloqueio
-- `invite_already_sent`, o ritmo de envio e o vínculo de `new_relation` ficam como estão.

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
  v_problem text;
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

    -- Convite sem nota: a nota do convite do LinkedIn é opcional, então só ele pode ter o corpo vazio.
    if nullif(btrim(coalesce(v_step ->> 'corpo', '')), '') is null
      and not (v_channel = 'linkedin' and v_subtype = 'convite') then
      return query select 'empty_content', v_step ->> 'id', null::integer, null::timestamptz;
      return;
    end if;
    -- canais-10: os anexos do passo têm de servir ao canal dele (formato, tamanho, quantidade; convite não leva).
    v_problem := private.step_attachments_problem(v_sequence.id, v_user_id, v_step);
    if v_problem is not null then
      return query select v_problem, v_step ->> 'id', null::integer, null::timestamptz;
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
