-- B5: enquanto o preço da revelação de telefone não for decidido (FILA 2.11),
-- quote_reveal_contact e begin_reveal_contact recusam o canal 'telefone' com
-- erro próprio, sem ler saldo, sem reservar crédito e sem tocar no Contato.
-- E-mail segue exatamente como estava.

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

  if p_channel = 'email' then
    v_cost := 2;
  elsif p_channel = 'telefone' then
    raise exception 'phone reveal unavailable' using errcode = '0A000';
  else
    raise exception 'invalid channel for reveal' using errcode = '22023';
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
  v_action text;
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

  if p_channel = 'email' then
    v_action := 'email_revealed';
  elsif p_channel = 'telefone' then
    raise exception 'phone reveal unavailable' using errcode = '0A000';
  else
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
