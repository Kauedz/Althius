-- Sinal vira candidata (sinal-candidata-e-descoberta, tickets 02 e 03): a resolução e a regra do descarte.
--
-- Um Sinal que tem empresa procura a empresa nas Contas do Workspace, por CNPJ e depois por domínio:
--   * é Conta: o Sinal vai para ela pelo `private.record_signal` de sempre, que a torna Quente (ADR-0007);
--   * não é: o Sinal fica ligado à candidata da Caixa de Descobertas (`origin = 'sinal'`), com um motivo em
--     `private.discovery_reasons`. Nunca duas candidatas para a mesma empresa: a comparação é a de
--     `private.discovery_duplicate`.
-- Uma candidata descartada continua escondida. Ela volta para `nova` só quando chega um Sinal novo mais de 90 dias depois
-- do descarte; dentro dos 90 dias o Sinal só é registrado.
--
-- Criar candidata não gasta crédito. Só o servidor chama (service_role), pelas Edge Functions da cascata.

-- 1. A regra de comparação das candidatas, num lugar só. `discovery_duplicate` e o resolvedor usam esta. O nome só
-- vale quando nada o desmente: dois sites, dois estados ou dois CNPJ diferentes são empresas diferentes de mesmo nome.
create or replace function private.find_discovered_account(
  p_workspace_id uuid,
  p_domain_key text,
  p_cnpj_key text,
  p_linkedin_key text,
  p_name_key text,
  p_uf text
) returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select d.id
  from private.discovered_accounts d
  where d.workspace_id = p_workspace_id
    and ((p_domain_key is not null and d.domain_key = p_domain_key)
      or (p_cnpj_key is not null and d.cnpj_key = p_cnpj_key)
      or (p_linkedin_key is not null and d.linkedin_key = p_linkedin_key)
      or (coalesce(p_name_key, '') <> '' and d.name_key = p_name_key
        and (p_domain_key is null or d.domain_key is null or d.domain_key = p_domain_key)
        and (p_cnpj_key is null or d.cnpj_key is null or d.cnpj_key = p_cnpj_key)
        and (p_uf is null or d.uf is null or d.uf = p_uf)))
  order by case
      when p_cnpj_key is not null and d.cnpj_key = p_cnpj_key then 0
      when p_domain_key is not null and d.domain_key = p_domain_key then 1
      when p_linkedin_key is not null and d.linkedin_key = p_linkedin_key then 2
      else 3
    end, d.created_at, d.id
  limit 1;
$$;

revoke all on function private.find_discovered_account(uuid, text, text, text, text, text)
  from public, anon, authenticated, service_role;

-- Redefinida a partir da definição mais recente (20261001170000): a parte de Contas é a mesma; a de Descobertas passa a
-- perguntar à regra única acima.
create or replace function private.discovery_duplicate(
  p_workspace_id uuid,
  p_domain_key text,
  p_cnpj_key text,
  p_linkedin_key text,
  p_name_key text,
  p_uf text
) returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.target_accounts a
    where a.workspace_id = p_workspace_id and a.deleted_at is null
      and ((p_domain_key is not null and a.domain = p_domain_key)
        or (p_cnpj_key is not null and private.cnpj_key(a.legal_identifier) = p_cnpj_key)
        or (p_linkedin_key is not null and private.linkedin_company_key(a.linkedin_url) = p_linkedin_key)
        or (coalesce(p_name_key, '') <> '' and private.company_name_key(a.name) = p_name_key
          and (p_domain_key is null or a.domain = p_domain_key)))
  ) then
    return 'conta';
  end if;
  if private.find_discovered_account(p_workspace_id, p_domain_key, p_cnpj_key, p_linkedin_key, p_name_key, p_uf) is not null then
    return 'descoberta';
  end if;
  return null;
end;
$$;

revoke all on function private.discovery_duplicate(uuid, text, text, text, text, text)
  from public, anon, authenticated, service_role;

-- 2. O Sinal de uma Conta que já existe: o `record_signal` de sempre (que torna a Conta Quente), com o vínculo ao Sinal de
-- mercado de origem, quando houver. Conta arquivada não recebe Sinal novo.
create or replace function private.record_signal_on_known_account(
  p_workspace_id uuid,
  p_target_account_id uuid,
  p_monitor_id uuid,
  p_signal_type text,
  p_event_key text,
  p_phrase text,
  p_fired_at timestamptz,
  p_source text,
  p_evidence text,
  p_market_signal_id uuid
) returns table (resolved text, is_new boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_new boolean;
begin
  if exists (
    select 1 from public.target_accounts a
    where a.workspace_id = p_workspace_id and a.id = p_target_account_id and a.archived_at is not null
  ) then
    return query select 'conta_arquivada'::text, false;
    return;
  end if;
  v_new := private.record_signal(
    p_workspace_id, p_target_account_id, p_monitor_id, p_signal_type, p_event_key, p_phrase, p_fired_at, p_source, p_evidence);
  if v_new and p_market_signal_id is not null then
    update private.signals g set market_signal_id = p_market_signal_id
    where g.workspace_id = p_workspace_id and g.target_account_id = p_target_account_id
      and g.signal_type = p_signal_type and g.event_key = p_event_key;
  end if;
  return query select 'conta'::text, v_new;
end;
$$;

revoke all on function private.record_signal_on_known_account(uuid, uuid, uuid, text, text, text, timestamptz, text, text, uuid)
  from public, anon, authenticated, service_role;

-- 3. O resolvedor. Devolve onde o Sinal foi parar:
--   'conta'            o Sinal é de uma Conta do Workspace (por CNPJ ou domínio, ou a Conta da candidata aceita);
--   'candidata'        o Sinal é de uma candidata da Caixa (nova, ou criada agora, ou reaberta);
--   'conta_arquivada'  a empresa é uma Conta arquivada: nada é gravado;
--   'ja_e_conta'       a regra de deduplicação a reconhece como Conta por LinkedIn ou nome, sem CNPJ nem domínio que
--                      confirmem: nada é gravado (na dúvida, não é: um Sinal de outra empresa é pior que um Sinal perdido);
--   'sem_identidade'   sem CNPJ válido nem site, a empresa não se deduplica com segurança: nada é gravado.
-- `p_weight` é o peso cheio do Sinal na nota da candidata (vem de `pontuacao.ts`); sem ele vale 20.
create or replace function private.record_signal_for_company(
  p_workspace_id uuid,
  p_company jsonb,
  p_monitor_id uuid,
  p_signal_type text,
  p_event_key text,
  p_phrase text,
  p_fired_at timestamptz,
  p_source text,
  p_evidence text,
  p_weight integer default null,
  p_market_signal_id uuid default null
) returns table (
  resolved text,
  is_new boolean,
  target_account_id uuid,
  discovered_account_id uuid,
  reopened boolean
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_monitor_type text;
  v_name text;
  v_cnpj text;
  v_website text;
  v_domain text;
  v_linkedin text;
  v_linkedin_key text;
  v_uf text;
  v_name_key text;
  v_account_id uuid;
  v_id uuid;
  v_cand private.discovered_accounts%rowtype;
  v_signal uuid;
  v_new boolean;
  v_reopened boolean := false;
  v_resolved text;
  v_known boolean;
begin
  if p_company is null or jsonb_typeof(p_company) <> 'object' then
    raise exception 'invalid company' using errcode = '22023';
  end if;
  if not exists (select 1 from public.workspaces w where w.id = p_workspace_id) then
    raise exception 'workspace not found' using errcode = 'P0002';
  end if;
  if p_fired_at is null or p_fired_at > now() + interval '1 day' then
    raise exception 'invalid signal date' using errcode = '22023';
  end if;
  if p_monitor_id is not null then
    select m.signal_type into v_monitor_type from private.signal_monitors m
    where m.workspace_id = p_workspace_id and m.id = p_monitor_id;
    if not found then
      raise exception 'monitor not found' using errcode = 'P0002';
    end if;
    if v_monitor_type <> p_signal_type then
      raise exception 'the monitor does not match the signal type' using errcode = '22023';
    end if;
  end if;

  v_cnpj := private.cnpj_key(p_company ->> 'cnpj');
  v_website := private.try_canonical_company_url(p_company ->> 'website');
  v_domain := case when v_website is null then null else private.domain_of(v_website) end;
  if v_cnpj is null and v_domain is null then
    return query select 'sem_identidade'::text, false, null::uuid, null::uuid, false;
    return;
  end if;
  v_linkedin := nullif(left(btrim(coalesce(p_company ->> 'linkedinUrl', '')), 300), '');
  v_linkedin_key := private.linkedin_company_key(v_linkedin);
  v_uf := upper(nullif(btrim(coalesce(p_company ->> 'uf', '')), ''));
  if v_uf is not null and v_uf !~ '^[A-Z]{2}$' then
    v_uf := null;
  end if;
  -- Um Sinal de mercado costuma trazer só o CNPJ (nunca o nome do licenciado): o CNPJ faz as vezes do nome até a Conta
  -- ser enriquecida.
  v_name := coalesce(
    nullif(btrim(left(coalesce(p_company ->> 'name', ''), 300)), ''),
    case when v_cnpj is not null then 'CNPJ ' || private.format_cnpj(v_cnpj) else v_domain end);
  v_name_key := private.company_name_key(v_name);

  -- 1. É Conta do Workspace? CNPJ primeiro, depois domínio.
  select a.id into v_account_id
  from public.target_accounts a
  where a.workspace_id = p_workspace_id and a.deleted_at is null
    and ((v_cnpj is not null and private.cnpj_key(a.legal_identifier) = v_cnpj)
      or (v_domain is not null and a.domain = v_domain))
  order by case when v_cnpj is not null and private.cnpj_key(a.legal_identifier) = v_cnpj then 0 else 1 end,
    a.created_at, a.id
  limit 1;
  if v_account_id is not null then
    select k.resolved, k.is_new into v_resolved, v_new
    from private.record_signal_on_known_account(
      p_workspace_id, v_account_id, p_monitor_id, p_signal_type, p_event_key, p_phrase, p_fired_at, p_source,
      p_evidence, p_market_signal_id) k;
    return query select v_resolved, v_new, v_account_id, null::uuid, false;
    return;
  end if;

  -- 2. Já é Conta por LinkedIn ou nome? Então não vira candidata.
  if private.discovery_duplicate(p_workspace_id, v_domain, v_cnpj, v_linkedin_key, v_name_key, v_uf) = 'conta' then
    return query select 'ja_e_conta'::text, false, null::uuid, null::uuid, false;
    return;
  end if;

  -- 3. A candidata: a que já existe pela regra de deduplicação, ou uma nova. Um por Workspace de cada vez, para dois
  -- Sinais da mesma empresa não criarem duas candidatas.
  perform pg_advisory_xact_lock(hashtext('discovery-signal:' || p_workspace_id::text));
  v_id := private.find_discovered_account(p_workspace_id, v_domain, v_cnpj, v_linkedin_key, v_name_key, v_uf);
  if v_id is null then
    insert into private.discovered_accounts (
      workspace_id, origin, name, website, domain, cnpj, linkedin_url, location, uf, city, country, sector, size_label,
      source_actor, domain_key, cnpj_key, linkedin_key, name_key
    ) values (
      p_workspace_id, 'sinal', v_name, v_website, v_domain, v_cnpj, v_linkedin,
      nullif(left(btrim(coalesce(p_company ->> 'location', '')), 200), ''), v_uf,
      nullif(left(btrim(coalesce(p_company ->> 'city', '')), 120), ''),
      nullif(left(btrim(coalesce(p_company ->> 'country', '')), 80), ''),
      nullif(left(btrim(coalesce(p_company ->> 'sector', '')), 200), ''),
      nullif(left(btrim(coalesce(p_company ->> 'sizeLabel', '')), 60), ''),
      left('sinal:' || p_signal_type, 200), v_domain, v_cnpj, v_linkedin_key, v_name_key
    )
    on conflict do nothing
    returning id into v_id;
    if v_id is null then
      v_id := private.find_discovered_account(p_workspace_id, v_domain, v_cnpj, v_linkedin_key, v_name_key, v_uf);
    end if;
  end if;
  select * into v_cand from private.discovered_accounts d where d.id = v_id for update;

  -- A candidata já foi aceita: a empresa é Conta agora, e o Sinal vai para ela.
  if v_cand.state = 'aceita' and v_cand.target_account_id is not null then
    select exists (
      select 1 from public.target_accounts a
      where a.workspace_id = p_workspace_id and a.id = v_cand.target_account_id and a.deleted_at is null
    ) into v_known;
    if v_known then
      select k.resolved, k.is_new into v_resolved, v_new
      from private.record_signal_on_known_account(
        p_workspace_id, v_cand.target_account_id, p_monitor_id, p_signal_type, p_event_key, p_phrase, p_fired_at,
        p_source, p_evidence, p_market_signal_id) k;
      return query select v_resolved, v_new, v_cand.target_account_id, null::uuid, false;
      return;
    end if;
  end if;

  -- 4. O Sinal da candidata. A vaga já achada por outra fonte de vagas é um reencontro (a mesma regra do `record_signal`).
  v_signal := null;
  if p_event_key like 'vaga|%' and p_signal_type like 'vaga\_%' then
    update private.signals g set seen_again_at = now(), seen_again_monitor_id = p_monitor_id
    where g.workspace_id = p_workspace_id and g.discovered_account_id = v_id
      and g.signal_type like 'vaga\_%' and g.signal_type <> p_signal_type and g.event_key = p_event_key;
    if found then
      return query select 'candidata'::text, false, null::uuid, v_id, false;
      return;
    end if;
  end if;

  insert into private.signals (
    workspace_id, discovered_account_id, monitor_id, signal_type, event_key, phrase, fired_at, source, evidence,
    market_signal_id
  ) values (
    p_workspace_id, v_id, p_monitor_id, p_signal_type, p_event_key, btrim(p_phrase), p_fired_at, p_source, p_evidence,
    p_market_signal_id
  )
  on conflict (workspace_id, discovered_account_id, signal_type, event_key) where discovered_account_id is not null
  do nothing
  returning id into v_signal;

  if v_signal is null then
    update private.signals g set seen_again_at = now(), seen_again_monitor_id = p_monitor_id
    where g.workspace_id = p_workspace_id and g.discovered_account_id = v_id
      and g.signal_type = p_signal_type and g.event_key = p_event_key;
    return query select 'candidata'::text, false, null::uuid, v_id, false;
    return;
  end if;

  insert into private.discovery_reasons (discovered_account_id, signal_id, workspace_id, weight)
  values (v_id, v_signal, p_workspace_id, least(greatest(coalesce(p_weight, 20), 0), 100))
  on conflict do nothing;

  -- 5. Um Sinal novo muda a candidata. Nova: o Sinal passa a ser o motivo dela estar na lista (a origem `busca` vira
  -- `sinal`; `sincronizacao` nunca muda) e completa o que faltava, sem tomar a chave de outra candidata. Descartada: só
  -- volta se o Sinal é novo, ainda vale, aconteceu depois do descarte e chegou mais de 90 dias depois dele.
  if v_cand.state = 'nova' then
    update private.discovered_accounts d set
      origin = case when d.origin = 'busca' then 'sinal' else d.origin end,
      website = case when d.website is null and v_website is not null
          and not exists (select 1 from private.discovered_accounts x
            where x.workspace_id = d.workspace_id and x.id <> d.id and x.domain_key = v_domain) then v_website else d.website end,
      domain = case when d.domain_key is null and v_domain is not null
          and not exists (select 1 from private.discovered_accounts x
            where x.workspace_id = d.workspace_id and x.id <> d.id and x.domain_key = v_domain) then v_domain else d.domain end,
      domain_key = case when d.domain_key is null and v_domain is not null
          and not exists (select 1 from private.discovered_accounts x
            where x.workspace_id = d.workspace_id and x.id <> d.id and x.domain_key = v_domain) then v_domain else d.domain_key end,
      cnpj = case when d.cnpj_key is null and v_cnpj is not null
          and not exists (select 1 from private.discovered_accounts x
            where x.workspace_id = d.workspace_id and x.id <> d.id and x.cnpj_key = v_cnpj) then v_cnpj else d.cnpj end,
      cnpj_key = case when d.cnpj_key is null and v_cnpj is not null
          and not exists (select 1 from private.discovered_accounts x
            where x.workspace_id = d.workspace_id and x.id <> d.id and x.cnpj_key = v_cnpj) then v_cnpj else d.cnpj_key end
    where d.id = v_id;
  elsif v_cand.state = 'descartada'
    and private.signal_is_valid(p_fired_at)
    and p_fired_at > v_cand.decided_at
    and now() > v_cand.decided_at + interval '90 days'
  then
    update private.discovered_accounts d set
      state = 'nova',
      origin = case when d.origin = 'sincronizacao' then d.origin else 'sinal' end,
      reopened_by_signal_at = now(),
      reopened_decided_at = d.decided_at,
      reopened_discard_reason = d.discard_reason,
      decided_by = null,
      decided_at = null,
      discard_reason = null
    where d.id = v_id;
    v_reopened := true;
  end if;

  return query select 'candidata'::text, true, null::uuid, v_id, v_reopened;
end;
$$;

revoke all on function private.record_signal_for_company(
  uuid, jsonb, uuid, text, text, text, timestamptz, text, text, integer, uuid
) from public, anon, authenticated, service_role;

-- A porta do servidor. A empresa vem como objeto: name, cnpj, website, linkedinUrl, uf, city, location, sector, sizeLabel.
create or replace function public.record_signal_for_company(
  p_workspace_id uuid,
  p_company jsonb,
  p_monitor_id uuid,
  p_signal_type text,
  p_event_key text,
  p_phrase text,
  p_fired_at timestamptz,
  p_source text,
  p_evidence text,
  p_weight integer default null
) returns table (
  resolved text,
  is_new boolean,
  target_account_id uuid,
  discovered_account_id uuid,
  reopened boolean
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  select r.resolved, r.is_new, r.target_account_id, r.discovered_account_id, r.reopened
  from private.record_signal_for_company(
    p_workspace_id, p_company, p_monitor_id, p_signal_type, p_event_key, p_phrase, p_fired_at, p_source, p_evidence,
    p_weight, null) r;
end;
$$;

revoke all on function public.record_signal_for_company(uuid, jsonb, uuid, text, text, text, timestamptz, text, text, integer)
  from public, anon, authenticated;
grant execute on function public.record_signal_for_company(uuid, jsonb, uuid, text, text, text, timestamptz, text, text, integer)
  to service_role;

-- 4. O Sinal de mercado com CNPJ segue o mesmo caminho: além do feed de Mercado, vira Sinal da Conta (por CNPJ) ou motivo
-- de uma candidata. Sem CNPJ, continua só como painel de contexto. Redefinida a partir da definição mais recente
-- (20261013140000), com o peso do tipo (`pontuacao.ts`). A assinatura muda (entra `p_weight`): a antiga sai para não
-- deixar duas funções com o mesmo nome.
drop function if exists public.record_market_signal(uuid, text, text, text, timestamptz, text, text, jsonb);

create or replace function public.record_market_signal(
  p_workspace_id uuid,
  p_signal_type text,
  p_event_key text,
  p_phrase text,
  p_fired_at timestamptz,
  p_source text,
  p_evidence text,
  p_payload jsonb default '{}'::jsonb,
  p_weight integer default null
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not exists (select 1 from public.workspaces w where w.id = p_workspace_id) then
    raise exception 'workspace not found' using errcode = 'P0002';
  end if;
  if not exists (select 1 from private.signal_cascades c where c.signal_type = p_signal_type and c.scope = 'mercado') then
    raise exception 'not a market signal type' using errcode = '22023';
  end if;
  if p_fired_at is null or p_fired_at > now() + interval '1 day' then
    raise exception 'invalid signal date' using errcode = '22023';
  end if;
  insert into private.market_signals (workspace_id, signal_type, event_key, phrase, fired_at, source, evidence, payload)
  values (p_workspace_id, p_signal_type, p_event_key, btrim(p_phrase), p_fired_at, p_source, p_evidence, coalesce(p_payload, '{}'::jsonb))
  on conflict (workspace_id, signal_type, event_key) do nothing
  returning id into v_id;

  if v_id is not null and private.cnpj_key(p_payload ->> 'cnpj') is not null then
    -- Um problema ao resolver a empresa não pode perder o Sinal de mercado, que já está gravado.
    begin
      perform private.record_signal_for_company(
        p_workspace_id, jsonb_build_object('cnpj', p_payload ->> 'cnpj'), null, p_signal_type, p_event_key,
        btrim(p_phrase), p_fired_at, p_source, p_evidence, p_weight, v_id);
    exception when others then
      raise warning 'market signal company resolution failed: %', sqlerrm;
    end;
  end if;
  return v_id is not null;
end;
$$;

revoke all on function public.record_market_signal(uuid, text, text, text, timestamptz, text, text, jsonb, integer)
  from public, anon, authenticated;
grant execute on function public.record_market_signal(uuid, text, text, text, timestamptz, text, text, jsonb, integer)
  to service_role;

-- 5. Descartar leva a decisão atual; a reabertura anterior deixa de valer (a próxima grava a dela). Redefinida a partir da
-- definição mais recente (20261001170000): só entram as colunas da reabertura.
create or replace function public.discard_discovered_account(p_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_d private.discovered_accounts%rowtype;
begin
  select d.* into v_d from private.discovered_accounts d
  join public.workspace_memberships m on m.workspace_id = d.workspace_id and m.user_id = auth.uid() and m.active
  where d.id = p_id
  for update of d;
  if not found then
    raise exception 'discovered account not found' using errcode = 'P0002';
  end if;
  if v_d.state = 'descartada' then
    return;
  end if;
  if v_d.state = 'aceita' then
    raise exception 'discovered account was already accepted' using errcode = '55000';
  end if;
  update private.discovered_accounts set
    state = 'descartada', decided_by = auth.uid(), decided_at = now(),
    discard_reason = nullif(left(btrim(coalesce(p_reason, '')), 300), ''),
    reopened_by_signal_at = null, reopened_decided_at = null, reopened_discard_reason = null
  where id = v_d.id;
end;
$$;

revoke all on function public.discard_discovered_account(uuid, text) from public, anon;
grant execute on function public.discard_discovered_account(uuid, text) to authenticated;
