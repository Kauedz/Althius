-- Exige recorte ao ativar e bloqueia claims de Monitoramentos antigos de mercado sem nicho.

create or replace function private.market_monitor_has_niche(p_criteria jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    coalesce(jsonb_array_length(p_criteria -> 'nichos') > 0, false)
    or exists (
      select 1 from jsonb_array_elements_text(coalesce(p_criteria -> 'nichosCustom', '[]'::jsonb)) item
      where btrim(item) <> ''
    )
    or p_criteria ->> 'nicho' = any (array[
      'comex-e-importacao', 'contabilidade-e-tributario', 'juridico-empresarial',
      'energia-e-mercado-livre', 'industria-fornecedores-b2b', 'logistica-e-transporte',
      'corretoras-de-beneficios', 'agro-b2b'
    ])
    or (p_criteria ->> 'nicho' = 'custom' and btrim(coalesce(p_criteria ->> 'nichoCustom', '')) <> ''), false);
$$;

revoke all on function private.market_monitor_has_niche(jsonb) from public, anon, authenticated, service_role;

create or replace function private.validate_market_criteria(p_state text, p_criteria jsonb)
returns void
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_funcoes jsonb := p_criteria -> 'funcoes';
  v_paises jsonb := p_criteria -> 'localizacao';
  v_nichos jsonb := p_criteria -> 'nichos';
  v_nichos_custom jsonb := p_criteria -> 'nichosCustom';
  v_vistos text[] := '{}';
  v_custom integer := 0;
  v_vistos_nichos text[] := '{}';
  v_vistos_custom text[] := '{}';
  v_chave text;
  v_item jsonb;
  v_nicho text;
begin
  if (v_funcoes is not null and jsonb_typeof(v_funcoes) <> 'array')
    or (v_paises is not null and jsonb_typeof(v_paises) <> 'array')
    or (v_nichos is not null and jsonb_typeof(v_nichos) <> 'array')
    or (v_nichos_custom is not null and jsonb_typeof(v_nichos_custom) <> 'array')
    or (p_criteria ? 'nichoCustom' and (jsonb_typeof(p_criteria -> 'nichoCustom') <> 'string'
      or length(btrim(p_criteria ->> 'nichoCustom')) > 60))
    or (p_criteria ? 'estado' and jsonb_typeof(p_criteria -> 'estado') <> 'null'
      and (jsonb_typeof(p_criteria -> 'estado') <> 'string'
        or (btrim(p_criteria ->> 'estado') <> '' and not (p_criteria ->> 'estado' = any (private.brazilian_states())))))
  then
    raise exception 'market monitor limits exceeded' using errcode = '22023';
  end if;
  if p_state = 'ativo' and not private.market_monitor_has_niche(p_criteria) then
    raise exception 'a market monitor needs at least one niche' using errcode = '22023';
  end if;
  for v_item in select e from jsonb_array_elements(coalesce(v_funcoes, '[]'::jsonb)) e loop
    if jsonb_typeof(v_item) <> 'string' or length(btrim(v_item #>> '{}')) > 60 then
      raise exception 'market monitor limits exceeded' using errcode = '22023';
    end if;
    v_chave := private.normalized_role(v_item #>> '{}');
    if v_chave = '' or v_chave = any (v_vistos) then
      raise exception 'market monitor limits exceeded' using errcode = '22023';
    end if;
    v_vistos := v_vistos || v_chave;
    if not (v_chave = any (private.suggested_job_roles())) then
      v_custom := v_custom + 1;
    end if;
  end loop;
  if v_custom > 10 then
    raise exception 'market monitor limits exceeded' using errcode = '22023';
  end if;
  for v_item in select e from jsonb_array_elements(coalesce(v_nichos, '[]'::jsonb)) e loop
    if jsonb_typeof(v_item) <> 'string' then
      raise exception 'market monitor limits exceeded' using errcode = '22023';
    end if;
    v_nicho := v_item #>> '{}';
    if v_nicho not in ('comex-e-importacao', 'contabilidade-e-tributario', 'juridico-empresarial',
      'energia-e-mercado-livre', 'industria-fornecedores-b2b', 'logistica-e-transporte',
      'corretoras-de-beneficios', 'agro-b2b') or v_nicho = any (v_vistos_nichos) then
      raise exception 'market monitor limits exceeded' using errcode = '22023';
    end if;
    v_vistos_nichos := v_vistos_nichos || v_nicho;
  end loop;
  for v_item in select e from jsonb_array_elements(coalesce(v_nichos_custom, '[]'::jsonb)) e loop
    if jsonb_typeof(v_item) <> 'string' or length(btrim(v_item #>> '{}')) not between 1 and 60 then
      raise exception 'market monitor limits exceeded' using errcode = '22023';
    end if;
    v_chave := private.normalized_role(v_item #>> '{}');
    if v_chave = '' or v_chave = any (v_vistos_custom) then
      raise exception 'market monitor limits exceeded' using errcode = '22023';
    end if;
    v_vistos_custom := v_vistos_custom || v_chave;
    if cardinality(v_vistos_custom) > 5 then
      raise exception 'market monitor limits exceeded' using errcode = '22023';
    end if;
  end loop;
  for v_item in select e from jsonb_array_elements(coalesce(v_paises, '[]'::jsonb)) e loop
    if jsonb_typeof(v_item) <> 'string' or not ((v_item #>> '{}') = any (private.market_countries())) then
      raise exception 'market monitor limits exceeded' using errcode = '22023';
    end if;
  end loop;
  if coalesce(btrim(p_criteria ->> 'estado'), '') <> '' and not coalesce(v_paises, '[]'::jsonb) ? 'Brasil' then
    raise exception 'market monitor limits exceeded' using errcode = '22023';
  end if;
  if p_state = 'ativo' and (jsonb_array_length(coalesce(v_funcoes, '[]'::jsonb)) = 0
    or jsonb_array_length(coalesce(v_paises, '[]'::jsonb)) = 0) then
    raise exception 'a market monitor needs at least one role and a country' using errcode = '22023';
  end if;
end;
$$;

revoke all on function private.validate_market_criteria(text, jsonb) from public, anon, authenticated, service_role;

create or replace function public.claim_signal_run_requests(p_limit integer default 5)
returns table (
  request_id uuid, workspace_id uuid, monitor_id uuid, signal_type text, criteria jsonb, requested_by uuid,
  requested_at timestamptz, scan_offset integer, plan_version integer, accounts jsonb
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Pedidos de Monitoramentos antigos sem recorte terminam sem chegar ao runner nem abrir uma Rodada.
  update private.signal_run_requests r set state = 'falhou', finished_at = now(), claimed_until = null
  from private.signal_monitors m
  where m.workspace_id = r.workspace_id and m.id = r.monitor_id
    and r.state in ('pendente', 'rodando')
    and (r.state = 'pendente' or r.claimed_until is null or r.claimed_until < now())
    and m.signal_type in ('vaga_linkedin', 'vaga_indeed')
    and private.monitor_scope(m.audience) = 'mercado'
    and not private.market_monitor_has_niche(m.criteria);
  update private.signal_monitor_runs x set
    state = 'falhou', finished_at = clock_timestamp(), stop_reason = coalesce(x.stop_reason, 'erro'),
    error = 'Escolha ao menos um nicho ou setor para buscar as vagas.'
  where x.state = 'rodando' and exists (
    select 1 from private.signal_run_requests r
    where r.run_id = x.id and r.state = 'falhou' and r.finished_at = now());
  update private.signal_monitors m set last_error = 'Escolha ao menos um nicho ou setor para buscar as vagas.'
  where m.signal_type in ('vaga_linkedin', 'vaga_indeed')
    and private.monitor_scope(m.audience) = 'mercado'
    and not private.market_monitor_has_niche(m.criteria)
    and exists (select 1 from private.signal_run_requests r
      where r.workspace_id = m.workspace_id and r.monitor_id = m.id and r.state = 'falhou'
        and r.finished_at >= now() - interval '1 minute');

  -- Uma Rodada agendada que ficou aberta (o Monitoramento foi pausado, ou a continuação nunca veio) não trava o pedido.
  update private.signal_monitor_runs x set state = 'concluida', finished_at = clock_timestamp(),
    stop_reason = coalesce(x.stop_reason, 'prazo')
  where x.state = 'rodando' and x.origin = 'agenda' and exists (
    select 1 from private.signal_monitors m
    where m.current_run_id = x.id
      and (m.state <> 'ativo' or x.started_at < now() - make_interval(mins => private.signal_run_limit('stale_open_run_minutes')))
      and exists (select 1 from private.signal_run_requests r
                  where r.monitor_id = m.id and r.state in ('pendente', 'rodando') and r.run_id is null));
  update private.signal_monitors m set current_run_id = null, round_attempted = 0
  where m.current_run_id is not null and not exists (
    select 1 from private.signal_monitor_runs x where x.id = m.current_run_id and x.state = 'rodando');

  update private.signal_run_requests r set state = 'cancelada', finished_at = now(), claimed_until = null
  where r.state = 'pendente' and exists (
    select 1 from private.signal_monitors m
    where m.workspace_id = r.workspace_id and m.id = r.monitor_id
      and (private.monitor_scope(m.audience) <> 'contas'
        or not exists (select 1 from private.signal_actors a where a.signal_type = m.signal_type and a.state = 'available')
        or cardinality(private.signal_run_account_ids(m.workspace_id, m.audience)) = 0));

  return query
  with due as (
    select r.id from private.signal_run_requests r
    join private.signal_monitors m on m.workspace_id = r.workspace_id and m.id = r.monitor_id
    where (r.state = 'pendente' or (r.state = 'rodando' and r.claimed_until < now()))
      and (r.claimed_until is null or r.claimed_until < now())
      and (m.claimed_until is null or m.claimed_until < now())
      and m.current_run_id is null
      and (private.monitor_scope(m.audience) <> 'mercado' or private.market_monitor_has_niche(m.criteria))
    order by r.requested_at, r.id
    limit least(greatest(coalesce(p_limit, 5), 1), 20)
    for update of r, m skip locked
  ), claimed as (
    update private.signal_run_requests r
    set state = 'rodando', claimed_until = now() + make_interval(mins => private.signal_run_limit('claim_minutes')),
      start_offset = coalesce(r.start_offset, (
        select mm.scan_offset from private.signal_monitors mm where mm.workspace_id = r.workspace_id and mm.id = r.monitor_id))
    from due where r.id = due.id
    returning r.*
  ), locked as (
    update private.signal_monitors m
    set claimed_until = now() + make_interval(mins => private.signal_run_limit('claim_minutes'))
    from claimed c where m.id = c.monitor_id
    returning m.id
  )
  select c.id, c.workspace_id, c.monitor_id, m.signal_type, m.criteria,
    (select p.user_id from public.workspace_memberships p
     where p.workspace_id = c.workspace_id and p.user_id = c.requested_by and p.active),
    c.requested_at, c.scan_offset, m.plan_version,
    coalesce((
      select jsonb_agg(jsonb_build_object('id', a.id, 'name', a.name, 'domain', a.domain, 'linkedinUrl', a.linkedin_url,
          'cnpj', a.legal_identifier, 'contatos', private.signal_scan_contacts(c.workspace_id, a.id))
        order by a.ord)
      from private.signal_round_accounts(
        c.workspace_id, m.audience, coalesce(c.start_offset, 0) + c.scan_offset,
        greatest(private.signal_round_batch(m.plan) - c.scan_offset, 0)) a
    ), '[]'::jsonb)
  from claimed c
  join private.signal_monitors m on m.workspace_id = c.workspace_id and m.id = c.monitor_id
  order by c.requested_at, c.id;
end;
$$;

revoke all on function public.claim_signal_run_requests(integer) from public, anon, authenticated;

create or replace function public.claim_due_signal_monitors(p_limit integer default 5)
returns table (
  monitor_id uuid, workspace_id uuid, signal_type text, criteria jsonb, created_by uuid, slot timestamptz, accounts jsonb
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  with due as (
    select m.id from private.signal_monitors m
    where private.signal_type_is_runnable(m.signal_type)
      and m.state = 'ativo'
      and (private.monitor_scope(m.audience) <> 'mercado' or private.market_monitor_has_niche(m.criteria))
      and m.next_run_at <= now() and (m.claimed_until is null or m.claimed_until < now())
      and private.automation_contract_block(m.workspace_id) is null
      and not exists (
        select 1 from private.signal_run_requests q
        where q.monitor_id = m.id and q.state in ('pendente', 'rodando') and q.run_id is not null)
    order by m.next_run_at, m.id
    limit least(greatest(coalesce(p_limit, 5), 1), 20)
    for update of m skip locked
  ), claimed as (
    update private.signal_monitors m set
      claimed_until = now() + interval '15 minutes',
      current_slot_at = case when m.schedule is not null
        then coalesce(m.current_slot_at, private.register_missed_signal_slots(m.id, now()), m.next_run_at) end
    from due where m.id = due.id
    returning m.*
  )
  select c.id, c.workspace_id, c.signal_type, c.criteria,
    (select p.user_id from public.workspace_memberships p
     where p.workspace_id = c.workspace_id and p.user_id = c.created_by and p.active),
    coalesce(c.current_slot_at, c.next_run_at),
    coalesce((
      select jsonb_agg(jsonb_build_object('id', a.id, 'name', a.name, 'domain', a.domain, 'linkedinUrl', a.linkedin_url,
          'cnpj', a.legal_identifier, 'contatos', private.signal_scan_contacts(c.workspace_id, a.id))
        order by a.ord)
      from private.signal_round_accounts(
        c.workspace_id, c.audience, c.scan_offset, greatest(private.signal_round_batch(c.plan) - c.round_attempted, 0)) a
    ), '[]'::jsonb)
  from claimed c;
end;
$$;

revoke all on function public.claim_due_signal_monitors(integer) from public, anon, authenticated;
grant execute on function public.claim_due_signal_monitors(integer) to service_role;
