-- As variáveis do passo saem preenchidas no envio (canais-04, primeiro ciclo real).
-- No primeiro envio real, o e-mail chegou com {{conta.nome}}, {{contato.primeiro_nome}} e as outras variáveis cruas:
-- a tela as resolve só na pré-visualização. A liberação do envio passa a devolver assunto e corpo preenchidos com os
-- mesmos dados da pré-visualização. Variáveis sem dado no Workspace (o Sinal e a Persona, módulos ainda sem backend)
-- e variáveis desconhecidas saem vazias, nunca cruas.

create function private.render_step_template(
  p_text text,
  p_account public.target_accounts,
  p_contact public.contacts,
  p_owner_name text
) returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  v text := coalesce(p_text, '');
  v_first_name text := nullif(split_part(btrim(coalesce(p_contact.name, '')), ' ', 1), '');
begin
  v := regexp_replace(v, '\{\{\s*conta\.nome\s*\}\}', coalesce(p_account.name, ''), 'g');
  v := regexp_replace(v, '\{\{\s*conta\.segmento\s*\}\}', coalesce(p_account.segment, ''), 'g');
  v := regexp_replace(v, '\{\{\s*contato\.primeiro_nome\s*\}\}', coalesce(v_first_name, ''), 'g');
  v := regexp_replace(v, '\{\{\s*contato\.cargo\s*\}\}', coalesce(p_contact.role, ''), 'g');
  v := regexp_replace(v, '\{\{\s*remetente\.nome\s*\}\}', coalesce(p_owner_name, ''), 'g');
  -- O que sobrar entre chaves duplas (Sinal, Persona, variável desconhecida) não chega cru ao Contato.
  return regexp_replace(v, '\{\{\s*[A-Za-z_.]+\s*\}\}', '', 'g');
end;
$$;

revoke all on function private.render_step_template(text, public.target_accounts, public.contacts, text)
  from public, anon, authenticated;

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
#variable_conflict use_column
declare
  v_send private.sequence_step_sends;
  v_sequence public.sequences;
  v_sender private.sender_accounts;
  v_contact public.contacts;
  v_step jsonb;
  v_subject text;
  v_reply_to text;
  v_blocked text;
  v_account public.target_accounts;
  v_owner_name text;
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
      when 'confirmed' then null
      else 'not_confirmed'
    end;
  end if;

  if v_blocked is null and v_sequence.status <> 'ativa' then
    v_blocked := 'sequence_not_active';
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
    end if;
    if v_blocked is not null then
      update private.sequence_step_sends set
        status = 'awaiting_reconfirmation', last_error = v_blocked, last_error_at = now(), updated_at = now()
      where id = v_send.id;
    end if;
  end if;

  if v_blocked is null then
    v_step := private.sequence_step(v_sequence.id, v_send.step_id);
    if v_step is null then
      v_blocked := 'step_missing';
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

  update private.sequence_step_sends set
    status = 'sending', sender_account_id = v_sender.id, attempts = attempts + 1,
    sending_at = now(), updated_at = now()
  where id = v_send.id;

  -- As variáveis do passo ({{conta.nome}}, {{contato.primeiro_nome}}…) saem preenchidas, como na pré-visualização.
  select a.* into v_account from public.target_accounts a where a.id::text = v_sequence.target_account_id;
  select coalesce(nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''), nullif(btrim(u.raw_user_meta_data ->> 'name'), ''), u.email)
    into v_owner_name from auth.users u where u.id = p_user_id;

  return query select 'released', v_send.id, v_sender.unipile_account_id, v_send.destination, v_contact.name,
    private.render_step_template(v_subject, v_account, v_contact, v_owner_name),
    private.render_step_template(coalesce(v_step ->> 'corpo', ''), v_account, v_contact, v_owner_name),
    v_reply_to, 'X-Althius-Envio', v_send.id::text;
end;
$$;
