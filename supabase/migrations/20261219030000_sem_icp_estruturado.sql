-- Desfazer o Sinais first, ticket 07 (ADR-0034, decisão 6): o ICP volta a ser o da seção ICP do Playbook e o mini-ICP
-- do Day0. Sai o ICP estruturado único: gatilhos, sincronização, semeadura, ranqueamento do catálogo e a Aderência das
-- empresas achadas por Sinal calculada contra ele. A tabela private.workspace_icp_versions e as três colunas do mini-ICP
-- em public.day0_companies ficam; nenhuma linha é apagada.

-- 1. Os gatilhos primeiro: dois deles ficam em tabelas centrais (playbook_section_versions e discovery_reasons).
drop trigger if exists sync_playbook_icp_to_workspace_icp on private.playbook_section_versions;
drop trigger if exists refresh_market_discovery_fit on private.discovery_reasons;
drop trigger if exists refresh_market_discovery_origin on private.discovered_accounts;
drop trigger if exists refresh_market_discovery_for_icp on private.workspace_icp_versions;

-- 2. As funções que chamavam o ICP estruturado, redefinidas a partir da última definição na main.

-- O Day0 continua gravando o mini-ICP (ação produto), sem semear o ICP estruturado.
create or replace function public.save_my_day0(p_workspace_id uuid, p_action text, p_value text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_role text;
  v_invited boolean;
  v_product jsonb;
  v_o_que_vende text;
  v_mini_icp text;
  v_por_que_compram text;
begin
  v_role := private.lock_caller_membership(p_workspace_id);
  v_invited := v_role <> 'admin' or private.day0_is_invited(p_workspace_id);
  insert into public.day0_accounts (user_id) values (auth.uid()) on conflict do nothing;
  perform 1 from public.day0_accounts where user_id = auth.uid() for update;
  if p_action = 'concluir' then
    update public.day0_accounts set personal_done = true where user_id = auth.uid();
    insert into public.day0_completions (workspace_id, user_id) values (p_workspace_id, auth.uid()) on conflict do nothing;
  elsif p_action in ('papel', 'hdyhau') then
    if p_value is null then raise exception 'invalid Day0 value' using errcode = '22023'; end if;
    if not (select personal_done from public.day0_accounts where user_id = auth.uid()) then
      if p_action = 'papel' then
        update public.day0_accounts set papel = p_value where user_id = auth.uid();
      else
        update public.day0_accounts set como_conheceu = p_value, personal_done = true where user_id = auth.uid();
      end if;
    end if;
  elsif p_action in ('empresa', 'dominio', 'produto') then
    if v_invited then raise exception 'company Day0 requires original administrator' using errcode = '42501'; end if;
    if p_action = 'produto' then
      begin
        v_product := p_value::jsonb;
      exception when others then
        raise exception 'invalid Day0 product' using errcode = '22023';
      end;
      if jsonb_typeof(v_product) <> 'object'
        or exists (select 1 from jsonb_object_keys(v_product) k where k not in ('miniIcp', 'oQueVende', 'porQueCompram'))
        or jsonb_typeof(v_product -> 'miniIcp') is distinct from 'string'
        or jsonb_typeof(v_product -> 'oQueVende') is distinct from 'string'
        or jsonb_typeof(v_product -> 'porQueCompram') is distinct from 'string' then
        raise exception 'invalid Day0 product' using errcode = '22023';
      end if;
      v_mini_icp := v_product ->> 'miniIcp';
      v_o_que_vende := v_product ->> 'oQueVende';
      v_por_que_compram := v_product ->> 'porQueCompram';
      if length(v_mini_icp) > 2000 or length(v_o_que_vende) > 2000 or length(v_por_que_compram) > 2000 then
        raise exception 'Day0 product field too long' using errcode = '22023';
      end if;
      insert into public.day0_companies (workspace_id) values (p_workspace_id) on conflict do nothing;
      update public.day0_companies set mini_icp = v_mini_icp, o_que_vende = v_o_que_vende,
        por_que_compram = v_por_que_compram where workspace_id = p_workspace_id;
    else
      if p_value is null or btrim(p_value) = '' then raise exception 'invalid Day0 value' using errcode = '22023'; end if;
      insert into public.day0_companies (workspace_id) values (p_workspace_id) on conflict do nothing;
      if p_action = 'empresa' then
        update public.day0_companies set empresa = btrim(p_value) where workspace_id = p_workspace_id;
      else
        if length(p_value) > 253 or p_value !~ '^[a-z0-9]([a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$'
          or exists (select 1 from unnest(string_to_array(p_value, '.')) as labels(label)
            where length(label) > 63 or label !~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?$') then
          raise exception 'invalid Day0 domain' using errcode = '22023';
        end if;
        update public.day0_companies set dominio = p_value, logo = null where workspace_id = p_workspace_id;
      end if;
    end if;
  else
    raise exception 'invalid Day0 action' using errcode = '22023';
  end if;
  return public.get_my_day0(p_workspace_id);
end;
$$;
revoke all on function public.save_my_day0(uuid, text, text) from public, anon, authenticated;
grant execute on function public.save_my_day0(uuid, text, text) to authenticated;

-- A criação legada do Workspace da empresa continua copiando o mini-ICP do Workspace pessoal, sem semear.
create or replace function public.create_company_workspace(p_name text, p_request_id uuid)
returns public.workspaces
language plpgsql security definer set search_path = '' as $$
declare
  v_user_id uuid := auth.uid();
  v_user auth.users%rowtype;
  v_name text := regexp_replace(coalesce(p_name, ''), '^\s+|\s+$', '', 'g');
  v_workspace public.workspaces;
  v_personal public.workspaces;
  v_company public.day0_companies;
  v_constraint text;
begin
  if v_user_id is null then raise exception 'authentication required' using errcode = '42501'; end if;
  select * into v_user from auth.users u where u.id = v_user_id;
  if not found or v_user.email_confirmed_at is null then raise exception 'email not verified' using errcode = '42501'; end if;
  if v_name = '' then raise exception 'company name is required' using errcode = '22023'; end if;
  if length(v_name) > 100 then raise exception 'company name is too long' using errcode = '22023'; end if;
  if p_request_id is null then raise exception 'request id is required' using errcode = '22023'; end if;

  v_workspace := private.company_workspace_of_request(v_user_id, p_request_id);
  if v_workspace.id is not null then return v_workspace; end if;

  begin
    insert into public.workspaces (kind, name) values ('empresa', v_name) returning * into v_workspace;
    insert into private.company_workspace_requests (user_id, request_id, workspace_id)
      values (v_user_id, p_request_id, v_workspace.id);
  exception when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint is distinct from 'company_workspace_requests_pkey' then raise; end if;
    return private.company_workspace_of_request(v_user_id, p_request_id);
  end;
  insert into public.workspace_memberships (workspace_id, user_id, role, active)
    values (v_workspace.id, v_user_id, 'admin', true);
  insert into private.workspace_participation_events
    (workspace_id, event, subject_user_id, subject_email, actor_user_id, new_role)
    values (v_workspace.id, 'workspace_criado', v_user_id, v_user.email, v_user_id, 'admin');

  select * into v_personal from public.workspaces w where w.kind = 'pessoal' and w.owner_user_id = v_user_id;
  if v_personal.id is not null then
    select * into v_company from public.day0_companies c where c.workspace_id = v_personal.id;
    if coalesce(v_company.o_que_vende, '') <> '' or coalesce(v_company.mini_icp, '') <> ''
      or coalesce(v_company.por_que_compram, '') <> '' then
      insert into public.day0_companies (workspace_id, o_que_vende, mini_icp, por_que_compram)
      values (v_workspace.id, v_company.o_que_vende, v_company.mini_icp, v_company.por_que_compram)
      on conflict (workspace_id) do nothing;
    end if;
  end if;
  return v_workspace;
end;
$$;
revoke all on function public.create_company_workspace(text, uuid) from public, anon;
revoke execute on function public.create_company_workspace(text, uuid) from authenticated;
grant execute on function public.create_company_workspace(text, uuid) to service_role;

-- As empresas achadas por um Sinal de mercado ficam "sem dado": não há mais ICP estruturado para compará-las.
create or replace function public.list_discovered_accounts(p_workspace_id uuid, p_state text default 'nova', p_limit integer default 200)
returns table (
  id uuid, run_id uuid, state text, name text, website text, domain text, cnpj text, linkedin_url text,
  location text, uf text, sector text, size_label text, employee_count integer, description text, tags text[],
  source_actor text, fit_level text, reasons jsonb, signals jsonb, target_account_id uuid, decided_by uuid,
  decided_at timestamptz, discard_reason text, created_at timestamptz, origin text,
  reopened_by_signal_at timestamptz, reopened_discard_reason text, signal_reasons jsonb
)
language plpgsql stable security definer set search_path = '' as $$
declare v_now timestamptz := now();
begin
  perform private.require_active_membership(p_workspace_id);
  if p_state is not null and p_state not in ('nova', 'aceita', 'descartada') then
    raise exception 'invalid state' using errcode = '22023';
  end if;
  return query
    select d.id, d.run_id, d.state, d.name, d.website, d.domain, d.cnpj, d.linkedin_url, d.location, d.uf, d.sector,
      d.size_label, d.employee_count, d.description, d.tags, d.source_actor,
      case when d.origin = 'sinal' and exists (select 1 from private.signals m
          where m.discovered_account_id = d.id and m.market_signal_id is not null) then 'sem_dado'
        else private.discovery_level(private.discovery_fit_adjusted(d.fit_score, d.id, v_now) + least(60::numeric, s.peso), d.fit_level) end,
      d.reasons, d.signals, d.target_account_id, d.decided_by, d.decided_at, d.discard_reason, d.created_at,
      d.origin, d.reopened_by_signal_at, d.reopened_discard_reason,
      coalesce((select jsonb_agg(jsonb_build_object('id', g.id, 'tipo', g.signal_type,
        'frase', private.texto_do_sinal_para_a_tela(g.phrase, 'Sinal registrado.'),
        'fonte', private.texto_do_sinal_para_a_tela(g.source, null), 'data', g.fired_at,
        'valido', private.signal_is_valid(g.fired_at), 'mercado', g.market_signal_id is not null)
        order by g.fired_at desc, g.id desc)
        from (select g2.* from private.discovery_reasons r2 join private.signals g2 on g2.id = r2.signal_id
          where r2.discovered_account_id = d.id order by g2.fired_at desc, g2.id desc limit 50) g), '[]'::jsonb)
    from private.discovered_accounts d
    cross join lateral (select coalesce(sum(r.weight * private.discovery_signal_decay(g.fired_at, v_now)), 0) as peso,
      max(g.fired_at) as ultimo from private.discovery_reasons r join private.signals g on g.id = r.signal_id
      where r.discovered_account_id = d.id) s
    where d.workspace_id = p_workspace_id and (p_state is null or d.state = p_state)
    order by private.discovery_fit_adjusted(d.fit_score, d.id, v_now) + least(60::numeric, s.peso) desc,
      s.ultimo desc nulls last, d.created_at desc, d.id
    limit least(greatest(coalesce(p_limit, 200), 1), 500);
end;
$$;
revoke all on function public.list_discovered_accounts(uuid, text, integer) from public, anon;
grant execute on function public.list_discovered_accounts(uuid, text, integer) to authenticated;

-- A explicação da Aderência leva do ICP só o que vende (o mini-ICP do Day0); sem ele, "icp" vem nulo.
create or replace function public.get_discovered_account_fit_explanation(p_discovered_account_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  d private.discovered_accounts%rowtype;
  v_o_que_vende text;
  v_fresca boolean;
  v_usos_hoje integer;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  select * into d from private.discovered_accounts where id = p_discovered_account_id;
  -- Quem não é membro ativo recebe a mesma resposta de quem pede um id que não existe.
  if not found or not exists (
    select 1 from public.workspace_memberships m
     where m.workspace_id = d.workspace_id and m.user_id = auth.uid() and m.active
  ) then
    raise exception 'discovered account not found' using errcode = 'P0002';
  end if;

  select nullif(btrim(c.o_que_vende), '') into v_o_que_vende from public.day0_companies c where c.workspace_id = d.workspace_id;

  v_fresca := d.fit_explanation is not null
    and d.fit_explanation_fingerprint = private.discovered_account_fit_fingerprint(d.fit_level, d.reasons);

  select count(*) into v_usos_hoje from private.discovered_accounts x
   where x.workspace_id = d.workspace_id and x.fit_explanation_source = 'ia'
     and x.fit_explanation_at >= date_trunc('day', now());

  return jsonb_build_object(
    'id', d.id,
    'workspaceId', d.workspace_id,
    'name', d.name,
    'sector', d.sector,
    'size', d.size_label,
    'location', coalesce(d.location, concat_ws(', ', d.city, d.uf, d.country)),
    'description', left(d.description, 600),
    'fitLevel', d.fit_level,
    'fitScore', d.fit_score,
    'reasons', coalesce(d.reasons, '[]'::jsonb),
    'icp', case when v_o_que_vende is null then null else jsonb_build_object('oQueVende', v_o_que_vende) end,
    'explanation', case when v_fresca then d.fit_explanation end,
    'explanationSource', case when v_fresca then d.fit_explanation_source end,
    'modelAllowed', v_usos_hoje < 50
  );
end;
$$;
revoke all on function public.get_discovered_account_fit_explanation(uuid) from public, anon;
grant execute on function public.get_discovered_account_fit_explanation(uuid) to authenticated;

-- 3. A Aderência das empresas achadas por Sinal de mercado volta a "sem dado", como antes do Sinais first (decidido pelo
-- dono do produto em 02/11/2026). As notas calculadas contra o ICP estruturado não voltam ao valor de antes.
update private.discovered_accounts d set fit_score = 0, fit_level = 'sem_dado'
where d.origin = 'sinal'
  and exists (select 1 from private.signals g where g.discovered_account_id = d.id and g.market_signal_id is not null)
  and (d.fit_score <> 0 or d.fit_level <> 'sem_dado');

-- 4. As funções que ficaram sem quem as chame.
drop function if exists public.get_my_workspace_icp(uuid);
drop function if exists public.save_my_workspace_icp_fields(uuid, text, text, text);
drop function if exists public.list_signal_catalog_for_my_icp(uuid);
drop function if exists private.seed_workspace_icp(uuid, text, text, text, jsonb);
drop function if exists private.sync_playbook_icp_to_workspace_icp();
drop function if exists private.refresh_market_discovery_fit();
drop function if exists private.refresh_market_discovery_origin();
drop function if exists private.refresh_market_discovery_for_icp();
drop function if exists private.score_market_discovery_icp(uuid);
drop function if exists private.icp_sector_matches(text, text);
drop function if exists private.normalize_sector_text(text);
drop function if exists private.normalize_icp_field(text);
