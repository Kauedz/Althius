-- Consulta de CNPJ na Receita Federal (prospeccao-funcional B1). O preço decidido é 1 crédito, cobrado só
-- quando a Receita devolve dado: a reserva usa o mesmo contrato das outras ações (reservar, liquidar o que
-- achou, liberar o resto). Sem saldo ou fora do teto da pessoa, reserve_credits recusa e a consulta não começa.
-- A ação fica de fora da lista provisória da sabatina, como a busca de Contas, para o preço dela não mudar o
-- catálogo que a tela já mostra.

insert into private.credit_action_prices (action, credits, description) values
  ('cnpj_receita', 1, 'Uma consulta de CNPJ na Receita Federal');

create or replace function public.list_credit_action_prices()
returns table (action text, credits numeric, description text)
language sql
stable
security definer
set search_path = ''
as $$
  select c.action, c.credits, c.description from private.credit_action_prices c
  where c.action not in ('account_discovery', 'cnpj_receita')
  order by c.action;
$$;

revoke all on function public.list_credit_action_prices() from public, anon;
grant execute on function public.list_credit_action_prices() to authenticated;

-- Reserva 1 crédito da consulta para quem está na sessão e participa do Workspace da Conta.
-- A chave repetida devolve a mesma reserva (o contrato de reserve_credits).
create function public.begin_cnpj_receita(
  p_workspace_id uuid,
  p_target_account_id uuid,
  p_request_key text default null
) returns table (reservation_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_user uuid := auth.uid();
  v_res uuid;
  v_key text;
begin
  if v_user is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  if not exists (
    select 1 from public.workspace_memberships m
    where m.workspace_id = p_workspace_id and m.user_id = v_user and m.active
  ) then
    raise exception 'active workspace membership required' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.target_accounts a
    where a.id = p_target_account_id and a.workspace_id = p_workspace_id and a.deleted_at is null
  ) then
    raise exception 'target account not found' using errcode = 'P0002';
  end if;

  v_key := coalesce(
    nullif(btrim(coalesce(p_request_key, '')), ''),
    'cnpj:' || p_target_account_id::text || ':' || gen_random_uuid()::text
  );

  v_res := public.reserve_credits(p_workspace_id, v_user, 'cnpj_receita', v_key, 1);
  return query select v_res;
end;
$$;

revoke all on function public.begin_cnpj_receita(uuid, uuid, text) from public, anon;
grant execute on function public.begin_cnpj_receita(uuid, uuid, text) to authenticated;

-- Liquida 1 crédito se o CNPJ foi achado. Zero usado libera a reserva e não debita.
-- Só o servidor chama, depois da consulta, como finish_reveal_contact.
create function public.finish_cnpj_receita(
  p_reservation_id uuid,
  p_found boolean
) returns table (debited_credits numeric)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v private.credit_reservations%rowtype;
  v_debited numeric;
begin
  select * into v from private.credit_reservations r where r.id = p_reservation_id;
  if not found then
    raise exception 'credit reservation not found' using errcode = 'P0002';
  end if;
  if v.action <> 'cnpj_receita' then
    raise exception 'credit reservation is not a cnpj lookup' using errcode = '22023';
  end if;

  if coalesce(p_found, false) then
    v_debited := public.settle_credits(p_reservation_id, 1);
  else
    v_debited := public.settle_credits(p_reservation_id, 0);
  end if;

  return query select v_debited;
end;
$$;

revoke all on function public.finish_cnpj_receita(uuid, boolean) from public, anon, authenticated;
grant execute on function public.finish_cnpj_receita(uuid, boolean) to service_role;
