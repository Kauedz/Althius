-- Contatos achados pela conexão do Cliente não cobram Créditos Althius (Trilha C, ticket 6c).
-- A cascata de contatos tenta o Apify da Althius primeiro e, quando ele não acha, o Apollo (e o CRM) que o Workspace
-- conectou. O dado vindo da conexão do Cliente grava com a origem LGPD (source_provider / provider = 'apollo' ou 'crm'),
-- mas o Cliente já paga o próprio provedor: a reserva é liberada para ele. O dado do Apify segue cobrando como antes, e
-- nada achado continua sem cobrança. A mesma regra está em `_shared/provedor-de-contatos.ts` (`fonteDoCliente`).

create or replace function private.is_customer_contact_source(p_source text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(lower(btrim(p_source)) in ('apollo', 'crm') or lower(btrim(p_source)) ~ '^(apollo|crm):', false)
$$;

revoke all on function private.is_customer_contact_source(text) from public, anon, authenticated, service_role;

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
  v_action text := case p_channel when 'email' then 'email_revealed' when 'telefone' then 'phone_revealed' end;
  v_email text;
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

  -- Telefone indisponível: o que vier não é gravado nem cobrado. Texto que não é e-mail conta como nada achado.
  v_email := case when p_channel = 'email' then private.try_validate_email(p_value) end;
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

create or replace function public.finish_committee_discovery(p_run_id uuid, p_success boolean, p_contacts_found integer, p_cost_usd numeric DEFAULT NULL::numeric, p_error text DEFAULT NULL::text, p_apify_run_id text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v private.discovery_runs%rowtype;
  v_found integer := greatest(coalesce(p_contacts_found, 0), 0);
  v_added integer;
  v_charged integer;
begin
  select * into v from private.discovery_runs r where r.id = p_run_id for update;
  if not found then
    raise exception 'discovery run not found' using errcode = 'P0002';
  end if;
  if v.state <> 'em_andamento' then
    return;
  end if;

  if p_success then
    -- As novas são as propostas que esta busca criou para quem a Conta não conhecia; quem já era conhecido não cobra.
    select count(*)::integer,
           count(*) filter (where not private.is_customer_contact_source(p.source_provider))::integer
      into v_added, v_charged
    from private.proposed_contacts p
    where p.workspace_id = v.workspace_id and p.discovery_run_id = v.id and p.new_to_account;
    v_added := least(v_added, v.max_results);
    v_charged := least(v_charged, v_added);
    v_found := greatest(v_found, v_added);

    -- Liquida só as novas achadas pela Althius (1 crédito cada); as da conexão do Cliente (Apollo, CRM) não cobram.
    -- Com zero, a reserva é liberada.
    if v.reservation_id is not null then
      perform public.settle_credits(v.reservation_id, v_charged);
    end if;
    update private.discovery_runs set
      state = 'concluida', found = v_found, added = v_added, duplicates = v_found - v_added,
      actual_cost_usd = coalesce(p_cost_usd, actual_cost_usd),
      apify_run_id = coalesce(p_apify_run_id, apify_run_id),
      last_error = p_error,
      finished_at = now()
    where id = v.id;
  else
    -- Falhou: libera a reserva com 0 créditos
    if v.reservation_id is not null then
      perform public.settle_credits(v.reservation_id, 0);
    end if;
    update private.discovery_runs set
      state = 'falhou',
      found = v_found, added = 0,
      actual_cost_usd = coalesce(p_cost_usd, actual_cost_usd),
      apify_run_id = coalesce(p_apify_run_id, apify_run_id),
      last_error = p_error,
      finished_at = now()
    where id = v.id;
  end if;
end;
$function$;

revoke all on function public.finish_reveal_contact(uuid, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.finish_reveal_contact(uuid, uuid, text, text, text) to service_role;
revoke all on function public.finish_committee_discovery(uuid, boolean, integer, numeric, text, text) from public, anon, authenticated;
grant execute on function public.finish_committee_discovery(uuid, boolean, integer, numeric, text, text) to service_role;
