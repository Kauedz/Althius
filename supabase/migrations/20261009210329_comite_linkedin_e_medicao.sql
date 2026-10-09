-- B2: entrada LinkedIn e identificação/custo da execução.
alter table public.target_accounts alter column domain drop not null;
create or replace function public.save_target_account(
  p_workspace_id uuid,
  p_name text,
  p_url text,
  p_legal_identifier text default null,
  p_linkedin_url text default null,
  p_segment text default null
) returns public.target_accounts
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_url text;
  v_account public.target_accounts;
  v_linkedin text;
  v_domain text;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if not exists (
    select 1 from public.workspace_memberships m
    where m.workspace_id = p_workspace_id and m.user_id = v_user_id and m.active
  ) then
    raise exception 'active workspace membership required' using errcode = '42501';
  end if;
  if p_name is null or btrim(p_name) = '' then
    raise exception 'account name is required' using errcode = '22023';
  end if;

  v_url := private.canonical_company_url(coalesce(nullif(btrim(p_url), ''), p_linkedin_url));
  v_linkedin := nullif(btrim(p_linkedin_url), '');
  v_domain := regexp_replace(substr(v_url, 9), '[:/].*$', '');
  if v_url ~ '^https://([a-z]{2,3}\.)?linkedin\.com/company/[^/]+' then
    v_linkedin := coalesce(v_linkedin, nullif(btrim(p_url), ''));
    v_domain := null;
  end if;

  select * into v_account from public.target_accounts
  where workspace_id = p_workspace_id and canonical_url = v_url
  for update;

  if found then
    if not exists (
      select 1 from public.sales_responsibilities r
      where r.workspace_id = p_workspace_id
        and r.target_account_id = v_account.id::text
        and r.owner_user_id = v_user_id
    ) then
      raise exception 'only the responsible seller can edit this target account' using errcode = '42501';
    end if;

    update public.target_accounts set
      name = btrim(p_name),
      legal_identifier = coalesce(nullif(btrim(p_legal_identifier), ''), legal_identifier),
      linkedin_url = coalesce(v_linkedin, linkedin_url),
      domain = v_domain,
      segment = coalesce(nullif(btrim(p_segment), ''), segment),
      updated_at = now()
    where id = v_account.id
    returning * into v_account;
    return v_account;
  end if;

  insert into public.target_accounts (
    workspace_id, name, canonical_url, domain, legal_identifier, linkedin_url, segment, created_by
  ) values (
    p_workspace_id, btrim(p_name), v_url,
    v_domain,
    nullif(btrim(p_legal_identifier), ''), v_linkedin, nullif(btrim(p_segment), ''),
    v_user_id
  ) returning * into v_account;

  insert into public.sales_responsibilities (workspace_id, target_account_id, owner_user_id)
  values (p_workspace_id, v_account.id::text, v_user_id);

  return v_account;
end;
$$;

revoke all on function public.save_target_account(uuid, text, text, text, text, text) from public, anon;
grant execute on function public.save_target_account(uuid, text, text, text, text, text) to authenticated;

-- Reparar as contas só com LinkedIn existentes, conservando a chave canônica.
update public.target_accounts set linkedin_url = coalesce(linkedin_url, canonical_url), domain = null
where canonical_url ~ '^https://([a-z]{2,3}\.)?linkedin\.com/company/'
  and domain ~ '^([a-z]{2,3}\.)?linkedin\.com$';

-- A assinatura com argumento opcional continua aceitando as chamadas antigas com cinco argumentos.
drop function public.finish_committee_discovery(uuid, boolean, integer, numeric, text);
create or replace function public.finish_committee_discovery(
  p_run_id uuid,
  p_success boolean,
  p_contacts_found integer,
  p_cost_usd numeric default null,
  p_error text default null,
  p_apify_run_id text default null
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v private.discovery_runs%rowtype;
  v_found integer := coalesce(p_contacts_found, 0);
begin
  select * into v from private.discovery_runs r where r.id = p_run_id for update;
  if not found then
    raise exception 'discovery run not found' using errcode = 'P0002';
  end if;
  if v.state <> 'em_andamento' then
    return;
  end if;

  if p_success and v_found > 0 then
    -- Liquida exatamente o número de contatos encontrados (1 crédito cada)
    if v.reservation_id is not null then
      perform public.settle_credits(v.reservation_id, v_found);
    end if;
    update private.discovery_runs set
      state = 'concluida', found = v_found, added = v_found,
      actual_cost_usd = coalesce(p_cost_usd, actual_cost_usd),
      apify_run_id = coalesce(p_apify_run_id, apify_run_id),
      finished_at = now()
    where id = v.id;
  else
    -- Falhou ou nenhum contato encontrado: libera a reserva com 0 créditos
    if v.reservation_id is not null then
      perform public.settle_credits(v.reservation_id, 0);
    end if;
    update private.discovery_runs set
      state = case when p_success then 'concluida' else 'falhou' end,
      found = v_found, added = 0,
      actual_cost_usd = coalesce(p_cost_usd, actual_cost_usd),
      apify_run_id = coalesce(p_apify_run_id, apify_run_id),
      last_error = p_error,
      finished_at = now()
    where id = v.id;
  end if;
end;
$$;

revoke all on function public.finish_committee_discovery(uuid, boolean, integer, numeric, text, text) from public, anon, authenticated;
grant execute on function public.finish_committee_discovery(uuid, boolean, integer, numeric, text, text) to service_role;

