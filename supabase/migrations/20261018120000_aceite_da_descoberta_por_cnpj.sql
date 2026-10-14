-- Sinal vira candidata (sinal-candidata-e-descoberta, ticket 04): o aceite.
--
-- Aceitar é sempre uma decisão de uma pessoa (ADR-0002): nada é aceito sozinho. O aceite, numa transação só:
--   * cria a Conta-alvo ou liga a que já existe (pelo site ou pelo CNPJ). O site passa a ser opcional quando há CNPJ: a
--     Conta nasce sem site;
--   * marca a Conta como `recomendacao` e deixa quem aceitou como Vendedor responsável, como já era;
--   * migra os Sinais da candidata para a Conta (`discovered_account_id` vira `target_account_id`) e a torna Quente se
--     algum ainda vale (ADR-0007);
--   * diz se o enriquecimento do Comitê pode disparar: `committee` é `liberado` quando o saldo e o limite mensal permitem,
--     conferidos pelas mesmas regras do `reserve_credits`, sem reservar nada. Quem dispara é o cliente web, pela mesma
--     Edge Function do botão "Enriquecer Comitê" (ela reserva o crédito com a sessão de quem pede).
-- Aceitar não cobra crédito.

-- 1. Dá para pagar? As regras do `reserve_credits` (20261017140000), sem reservar: contrato ativo, saldo, o limite mensal
-- do Workspace e o limite do participante. A Equipe Althius (créditos ilimitados) sempre pode. Devolve 'ok' ou o motivo:
-- 'sem_contrato', 'sem_saldo' ou 'limite_do_mes'.
create or replace function private.credit_headroom(p_workspace_id uuid, p_user_id uuid, p_amount numeric)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_available numeric;
  v_ws_limit numeric;
  v_limit numeric;
begin
  if not private.paid_access_allowed(p_workspace_id) then
    return 'sem_contrato';
  end if;
  if private.credits_unlimited(p_workspace_id) then
    return 'ok';
  end if;
  select t.booked - t.reserved into v_available from private.credit_totals(p_workspace_id) t;
  if coalesce(v_available, 0) < p_amount then
    return 'sem_saldo';
  end if;
  v_ws_limit := private.workspace_monthly_limit(p_workspace_id);
  if v_ws_limit is not null and private.workspace_period_usage(p_workspace_id) + p_amount > v_ws_limit then
    return 'limite_do_mes';
  end if;
  if p_user_id is not null then
    select l.monthly_limit into v_limit from private.credit_member_limits l
    where l.workspace_id = p_workspace_id and l.user_id = p_user_id;
    if v_limit is not null and private.credit_member_month_usage(p_workspace_id, p_user_id) + p_amount > v_limit then
      return 'limite_do_mes';
    end if;
  end if;
  return 'ok';
end;
$$;

revoke all on function private.credit_headroom(uuid, uuid, numeric) from public, anon, authenticated, service_role;

-- O Comitê pede até 10 pessoas por busca (o padrão de `begin_committee_discovery`), a 1 crédito cada (`person_collected`).
-- 'liberado' quando a reserva cabe agora.
create or replace function private.committee_gate(p_workspace_id uuid, p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case h.r when 'ok' then 'liberado' else h.r end
  from (
    select private.credit_headroom(
      p_workspace_id, p_user_id,
      10 * coalesce((select c.credits from private.credit_action_prices c where c.action = 'person_collected'), 1)) as r
  ) h;
$$;

revoke all on function private.committee_gate(uuid, uuid) from public, anon, authenticated, service_role;

-- 2. A Conta que nasce sem site: o caminho do aceite por CNPJ. Igual a `save_target_account` no que importa (a Conta é de
-- quem criou, e essa pessoa é a Vendedora responsável), sem exigir uma URL.
create or replace function private.create_target_account_without_site(
  p_workspace_id uuid,
  p_user_id uuid,
  p_name text,
  p_legal_identifier text,
  p_segment text
) returns public.target_accounts
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_account public.target_accounts;
begin
  if p_name is null or btrim(p_name) = '' then
    raise exception 'account name is required' using errcode = '22023';
  end if;
  insert into public.target_accounts (workspace_id, name, canonical_url, domain, legal_identifier, segment, created_by)
  values (p_workspace_id, btrim(p_name), null, null, nullif(btrim(p_legal_identifier), ''), nullif(btrim(p_segment), ''), p_user_id)
  returning * into v_account;
  insert into public.sales_responsibilities (workspace_id, target_account_id, owner_user_id)
  values (p_workspace_id, v_account.id::text, p_user_id);
  return v_account;
end;
$$;

revoke all on function private.create_target_account_without_site(uuid, uuid, text, text, text)
  from public, anon, authenticated, service_role;

-- 3. O aceite. A resposta ganha `signals_moved` e `committee`: a assinatura de retorno muda, então a função antiga sai e
-- esta entra no lugar (a pessoa chama pelo mesmo nome e pelos mesmos argumentos).
drop function if exists public.accept_discovered_account(uuid, text);

create or replace function public.accept_discovered_account(p_id uuid, p_url text default null)
returns table (target_account_id uuid, created boolean, signals_moved integer, committee text)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_user uuid := auth.uid();
  v_d private.discovered_accounts%rowtype;
  v_url text;
  v_existing public.target_accounts%rowtype;
  v_account public.target_accounts;
  v_created boolean := false;
  v_moved integer := 0;
begin
  select d.* into v_d from private.discovered_accounts d
  join public.workspace_memberships m on m.workspace_id = d.workspace_id and m.user_id = v_user and m.active
  where d.id = p_id
  for update of d;
  if not found then
    raise exception 'discovered account not found' using errcode = 'P0002';
  end if;
  if v_d.state = 'aceita' then
    return query select v_d.target_account_id, false, 0, private.committee_gate(v_d.workspace_id, v_user);
    return;
  end if;
  if v_d.state = 'descartada' then
    raise exception 'discovered account was discarded' using errcode = '55000';
  end if;

  v_url := nullif(btrim(coalesce(p_url, '')), '');
  if v_url is null then
    v_url := v_d.website;
  end if;
  -- O site é opcional quando há CNPJ. Sem site e sem CNPJ não há como identificar a Conta.
  if v_url is null and v_d.cnpj_key is null then
    raise exception 'a website is required to accept this account' using errcode = '22023';
  end if;
  if v_url is not null then
    v_url := private.canonical_company_url(v_url);
  end if;

  -- A Conta que já existe (alguém cadastrou nesse meio tempo), pelo site ou pelo CNPJ: a candidata se liga a ela sem
  -- tocar nos dados dela.
  select * into v_existing from public.target_accounts a
  where a.workspace_id = v_d.workspace_id and a.deleted_at is null
    and ((v_url is not null and a.canonical_url = v_url)
      or (v_d.cnpj_key is not null and private.cnpj_key(a.legal_identifier) = v_d.cnpj_key))
  order by case when v_url is not null and a.canonical_url = v_url then 0 else 1 end, a.created_at, a.id
  limit 1;

  if found then
    v_account := v_existing;
  else
    if v_url is null and v_d.linkedin_url is null then
      v_account := private.create_target_account_without_site(
        v_d.workspace_id, v_user, v_d.name, private.format_cnpj(v_d.cnpj), v_d.sector);
    else
      -- Com LinkedIn e sem site, `save_target_account` usa a página como identidade da Conta (como já faz).
      v_account := public.save_target_account(
        v_d.workspace_id, v_d.name, v_url,
        case when v_d.cnpj is null then null else private.format_cnpj(v_d.cnpj) end,
        v_d.linkedin_url, v_d.sector);
    end if;
    v_created := true;
    update public.target_accounts set origin = 'recomendacao' where id = v_account.id and origin = 'manual';
    update private.account_field_sources set origin = 'automatico', observed_at = now()
    where target_account_id = v_account.id and field in ('name', 'legal_identifier', 'linkedin_url', 'segment');
  end if;

  -- Os Sinais da candidata passam a ser da Conta. Um que a Conta já tinha (mesmo tipo e mesmo acontecimento) não
  -- duplica: fica o da Conta, marcado como visto de novo (e com o vínculo ao Sinal de mercado, se o dele ainda não tinha).
  with duplicados as (
    delete from private.signals g
    where g.workspace_id = v_d.workspace_id and g.discovered_account_id = v_d.id
      and exists (
        select 1 from private.signals x
        where x.workspace_id = g.workspace_id and x.target_account_id = v_account.id
          and x.signal_type = g.signal_type and x.event_key = g.event_key)
    returning g.signal_type, g.event_key, g.market_signal_id
  )
  update private.signals x set seen_again_at = now(), market_signal_id = coalesce(x.market_signal_id, dup.market_signal_id)
  from duplicados dup
  where x.workspace_id = v_d.workspace_id and x.target_account_id = v_account.id
    and x.signal_type = dup.signal_type and x.event_key = dup.event_key;

  with movidos as (
    update private.signals g set target_account_id = v_account.id, discovered_account_id = null
    where g.workspace_id = v_d.workspace_id and g.discovered_account_id = v_d.id
    returning 1
  )
  select count(*)::integer into v_moved from movidos;

  -- Com um Sinal que ainda vale, a Conta fica Quente.
  if v_moved > 0 and exists (
    select 1 from private.signals g
    where g.workspace_id = v_d.workspace_id and g.target_account_id = v_account.id and private.signal_is_valid(g.fired_at)
  ) then
    perform private.record_prospecting_event(v_d.workspace_id, v_account.id, 'sinal_novo');
  end if;

  update private.discovered_accounts set
    state = 'aceita', target_account_id = v_account.id, decided_by = v_user, decided_at = now(),
    reopened_by_signal_at = null, reopened_decided_at = null, reopened_discard_reason = null
  where id = v_d.id;

  return query select v_account.id, v_created, v_moved, private.committee_gate(v_d.workspace_id, v_user);
end;
$$;

revoke all on function public.accept_discovered_account(uuid, text) from public, anon;
grant execute on function public.accept_discovered_account(uuid, text) to authenticated;
