-- Revelar telefone volta a funcionar e custa 5 créditos (decisão do Kauê, 28/10/2026; TRILHA C, Fase 6).
-- Desfaz a recusa de 20261121110000 (B5) e dá ao telefone as mesmas regras do e-mail:
--   * o preço vem do catálogo (private.credit_action_prices: phone_revealed = 5, email_revealed = 2), não de número
--     escrito aqui;
--   * cota 0 quando o Contato já tem telefone; nada achado, valor que não é telefone, telefone que já é de outro Contato
--     do Workspace ou os três lugares ocupados liberam a reserva sem cobrar;
--   * o telefone achado pela conexão do Cliente (Apollo, CRM) grava com a origem e não cobra Créditos Althius.
-- O telefone revelado entra como celular sem a marca de WhatsApp: ninguém confirmou que o número usa WhatsApp.
-- Só aditiva: uma coluna anulável e três funções redefinidas com as mesmas assinaturas. Nenhuma linha muda.

-- 1. O provedor junto do telefone adicional, como em private.contact_emails.
alter table private.contact_phones
  add column if not exists provider text check (provider is null or length(provider) between 1 and 200);

comment on column private.contact_phones.provider is
  'O provedor que coletou este telefone adicional. Nulo quando uma pessoa o gravou.';

-- 2. A ação de crédito de cada canal de revelação; nulo para canal desconhecido.
create or replace function private.reveal_action(p_channel text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_channel when 'email' then 'email_revealed' when 'telefone' then 'phone_revealed' end
$$;

revoke all on function private.reveal_action(text) from public, anon, authenticated, service_role;

-- 3. A cotação: o preço do catálogo para o canal.
create or replace function public.quote_reveal_contact(
  p_contact_id uuid,
  p_channel text
) returns table (credits integer, current_balance numeric, can_reveal boolean, already_known boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_contact public.contacts%rowtype;
  v_user uuid := auth.uid();
  v_action text := private.reveal_action(p_channel);
  v_cost integer;
  v_balance numeric;
begin
  if v_user is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  select * into v_contact from public.contacts c where c.id = p_contact_id and c.archived_at is null;
  if not found then
    raise exception 'contact not found' using errcode = 'P0002';
  end if;

  if not exists (
    select 1 from public.workspace_memberships m
    where m.workspace_id = v_contact.workspace_id and m.user_id = v_user and m.active
  ) then
    raise exception 'active workspace membership required' using errcode = '42501';
  end if;

  if v_action is null then
    raise exception 'invalid channel for reveal' using errcode = '22023';
  end if;

  select ceil(p.credits)::integer into v_cost from private.credit_action_prices p where p.action = v_action;
  if v_cost is null then
    raise exception 'reveal price not configured' using errcode = '55000';
  end if;

  select t.booked - t.reserved into v_balance from private.credit_totals(v_contact.workspace_id) t;
  v_balance := coalesce(v_balance, 0);

  if exists (select 1 from private.existing_contact_value(v_contact.id, p_channel)) then
    return query select 0, v_balance, true, true;
    return;
  end if;

  return query select v_cost, v_balance,
    (private.paid_access_allowed(v_contact.workspace_id)
      and (private.credits_unlimited(v_contact.workspace_id) or v_balance >= v_cost)), false;
end;
$$;

-- 4. A reserva: a ação do canal; reserve_credits lê o preço do catálogo.
create or replace function public.begin_reveal_contact(
  p_workspace_id uuid,
  p_contact_id uuid,
  p_channel text,
  p_request_key text default null
) returns table (reservation_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_user uuid := auth.uid();
  v_contact public.contacts%rowtype;
  v_action text := private.reveal_action(p_channel);
  v_res uuid;
begin
  if v_user is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  select * into v_contact from public.contacts c
  where c.id = p_contact_id and c.workspace_id = p_workspace_id and c.archived_at is null;
  if not found then
    raise exception 'contact not found' using errcode = 'P0002';
  end if;

  if not exists (
    select 1 from public.workspace_memberships m
    where m.workspace_id = p_workspace_id and m.user_id = v_user and m.active
  ) then
    raise exception 'active workspace membership required' using errcode = '42501';
  end if;

  if v_action is null then
    raise exception 'invalid channel for reveal' using errcode = '22023';
  end if;

  v_res := public.reserve_credits(
    p_workspace_id,
    v_user,
    v_action,
    coalesce(p_request_key, 'reveal:' || p_channel || ':' || p_contact_id::text || ':' || gen_random_uuid()::text),
    1
  );

  return query select v_res;
end;
$$;

-- 5. O fim da revelação: e-mail exatamente como em 20261218003000; telefone com as mesmas regras.
create or replace function public.finish_reveal_contact(p_reservation_id uuid, p_contact_id uuid, p_channel text, p_value text DEFAULT NULL::text, p_source text DEFAULT 'apify'::text)
 RETURNS TABLE(success boolean, debited_credits integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
#variable_conflict use_column
declare
  v_contact public.contacts%rowtype;
  v_reservation private.credit_reservations%rowtype;
  v_action text := private.reveal_action(p_channel);
  v_email text;
  v_phone text;
  v_source text := left(nullif(btrim(coalesce(p_source, '')), ''), 200);
  v_ordinal smallint;
begin
  if v_action is null then
    raise exception 'invalid channel for reveal' using errcode = '22023';
  end if;

  select * into v_contact from public.contacts c where c.id = p_contact_id and c.archived_at is null for update;
  if not found then
    raise exception 'contact not found' using errcode = 'P0002';
  end if;

  select * into v_reservation from private.credit_reservations r where r.id = p_reservation_id;
  if not found
     or v_reservation.workspace_id <> v_contact.workspace_id
     or v_reservation.action <> v_action then
    raise exception 'the reservation does not belong to this reveal' using errcode = '22023';
  end if;

  if p_channel = 'telefone' then
    -- Texto que não é telefone conta como nada achado.
    v_phone := private.try_normalize_whatsapp(p_value);
    if v_phone is null then
      perform public.settle_credits(p_reservation_id, 0);
      return query select false, 0;
      return;
    end if;

    perform private.take_subject_lock('contact', v_contact.id, 'shared');
    perform private.lock_contact_channel(v_contact.workspace_id, 'phone', v_phone);

    -- Já é deste Contato (principal ou adicional) ou de outro do Workspace: nada novo.
    if exists (select 1 from public.contacts c where c.workspace_id = v_contact.workspace_id and c.phone = v_phone)
       or exists (
         select 1 from private.contact_phones p where p.workspace_id = v_contact.workspace_id and p.phone = v_phone) then
      perform public.settle_credits(p_reservation_id, 0);
      return query select false, 0;
      return;
    end if;

    if v_contact.phone is null then
      v_ordinal := 1;
    else
      select min(v.o) into v_ordinal
      from (values (2::smallint), (3::smallint)) v(o)
      where not exists (select 1 from private.contact_phones p where p.contact_id = v_contact.id and p.ordinal = v.o);
    end if;
    if v_ordinal is null then
      perform public.settle_credits(p_reservation_id, 0);
      return query select false, 0;
      return;
    end if;

    begin
      perform set_config('althius.provedor_da_coleta', coalesce(v_source, ''), true);
      if v_ordinal = 1 then
        update public.contacts c set
          phone = v_phone,
          phone_kind = 'celular',
          phone_whatsapp = false,
          updated_at = now()
        where c.id = v_contact.id;
        insert into private.contact_field_sources (workspace_id, contact_id, field, origin)
        values (v_contact.workspace_id, v_contact.id, 'phone', 'automatico')
        on conflict (contact_id, field) do update set origin = 'automatico', source_id = null, observed_at = now();
      else
        insert into private.contact_phones (workspace_id, contact_id, ordinal, phone, kind, whatsapp, provider)
        values (v_contact.workspace_id, v_contact.id, v_ordinal, v_phone, 'celular', false, v_source);
      end if;
      perform set_config('althius.provedor_da_coleta', '', true);
    exception when unique_violation then
      perform public.settle_credits(p_reservation_id, 0);
      return query select false, 0;
      return;
    end;

    return query select true, public.settle_credits(
      p_reservation_id, case when private.is_customer_contact_source(v_source) then 0 else 1 end)::integer;
    return;
  end if;

  -- E-mail. Texto que não é e-mail conta como nada achado.
  v_email := private.try_validate_email(p_value);
  if v_email is null then
    perform public.settle_credits(p_reservation_id, 0);
    return query select false, 0;
    return;
  end if;

  -- As travas de set_contact_channels: o apagamento do Contato espera esta escrita, e quem grava o mesmo e-mail no
  -- Workspace espera a vez. Com a trava, a conferência abaixo enxerga o que a outra sessão gravou.
  perform private.take_subject_lock('contact', v_contact.id, 'shared');
  perform private.lock_contact_channel(v_contact.workspace_id, 'email', v_email);

  -- Já é deste Contato (principal ou adicional) ou de outro do Workspace: nada novo.
  if exists (select 1 from public.contacts c where c.workspace_id = v_contact.workspace_id and c.email = v_email)
     or exists (
       select 1 from private.contact_emails e where e.workspace_id = v_contact.workspace_id and e.email = v_email) then
    perform public.settle_credits(p_reservation_id, 0);
    return query select false, 0;
    return;
  end if;

  if v_contact.email is null then
    v_ordinal := 1;
  else
    select min(v.o) into v_ordinal
    from (values (2::smallint), (3::smallint)) v(o)
    where not exists (select 1 from private.contact_emails e where e.contact_id = v_contact.id and e.ordinal = v.o);
  end if;
  -- Os três lugares ocupados por outros e-mails: nenhum é apagado e nada é cobrado.
  if v_ordinal is null then
    perform public.settle_credits(p_reservation_id, 0);
    return query select false, 0;
    return;
  end if;

  begin
    perform set_config('althius.provedor_da_coleta', coalesce(v_source, ''), true);
    if v_ordinal = 1 then
      update public.contacts c set
        email = v_email,
        email_label = coalesce(c.email_label, 'trabalho'),
        updated_at = now()
      where c.id = v_contact.id;
      -- A origem é desta função, não do gatilho, que marca manual quando há sessão.
      insert into private.contact_field_sources (workspace_id, contact_id, field, origin)
      values (v_contact.workspace_id, v_contact.id, 'email', 'automatico')
      on conflict (contact_id, field) do update set origin = 'automatico', source_id = null, observed_at = now();
    else
      insert into private.contact_emails (workspace_id, contact_id, ordinal, email, label, provider)
      values (v_contact.workspace_id, v_contact.id, v_ordinal, v_email, 'trabalho', v_source);
    end if;
    perform set_config('althius.provedor_da_coleta', '', true);
  exception when unique_violation then
    -- Os gatilhos de unicidade têm a última palavra. Perder para eles não cobra nem deixa a reserva presa; o aviso do
    -- provedor volta junto com o bloco.
    perform public.settle_credits(p_reservation_id, 0);
    return query select false, 0;
    return;
  end;

  -- O e-mail achado pela conexão do Cliente (Apollo, CRM) grava com a origem, mas não cobra Créditos Althius.
  return query select true, public.settle_credits(
    p_reservation_id, case when private.is_customer_contact_source(v_source) then 0 else 1 end)::integer;
end;
$function$;

revoke all on function public.finish_reveal_contact(uuid, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.finish_reveal_contact(uuid, uuid, text, text, text) to service_role;
