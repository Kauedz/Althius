-- prospeccao-funcional B2/B3 (decisão do Renan, 09/10/2026): nunca cobrar de novo o que já foi descoberto.
--
-- Evidência (produção, 09/10, Conta TOTVS): o segundo comitê, com limite 1, devolveu Fernando Sollak, que já era
-- proposta da Conta. record_proposed_contact não criou linha (created=false), mas a busca gravou added 1 e debitou
-- 1 crédito, porque finish_committee_discovery liquidava o número que o handler mandava.
--
-- 1. private.proposed_contacts.new_to_account: se a pessoa era nova para a Conta quando a busca a trouxe. Linhas
--    existentes ficam true, que é o que já foi cobrado.
-- 2. record_proposed_contact, redefinida a partir de 20261001190000_enriquecimento_e_comite.sql (mesma assinatura e
--    permissões). "Já descoberta" para a Conta é: uma proposta da Conta em qualquer estado (nova, aceita, descartada)
--    ou um Contato com Vínculo com a Conta, com o mesmo LinkedIn, comparado sem caixa e com a URL normalizada
--    (private.normalize_linkedin de 20261009210405). Proposta repetida devolve a que existe, sem linha nova. Contato
--    da Conta ainda sem proposta ganha a proposta (o aceite copia a Persona, persona_do_contato_no_comite), marcada
--    como não nova. `created` passa a dizer "pessoa nova para a Conta": é ela que custa 1 crédito.
-- 3. finish_committee_discovery, redefinida a partir de 20261009210329_comite_linkedin_e_medicao.sql (mesma
--    assinatura e permissões). O banco conta as novas pelas propostas que a própria busca criou como novas e liquida
--    a reserva só por elas, até o tamanho reservado; o resto volta ao saldo. found = pessoas que a busca examinou
--    (p_contacts_found), added = novas, duplicates = found - added.
-- 4. public.count_known_committee_people: quantas pessoas a Conta já conhece. O actor
--    harvestapi~linkedin-company-employees (build 0.0.163, lido em 09/10) não tem campo para excluir perfis; o
--    handler pede essas a mais, com teto, para sobrar gente nova.
-- 5. Revelar: private.existing_contact_value devolve o dado que o Contato já tem (principal ou adicional).
--    quote_reveal_contact cota 0 e diz already_known quando ele existe; public.existing_reveal_value é a conferência
--    que o servidor faz com a sessão antes de reservar e chamar o actor. Nada disso olha outro Workspace: cada
--    Workspace tem a própria base legal e o próprio registro de coleta (LGPD), e nenhuma função devolve dado de outro.
--    Dentro do Workspace, uma pessoa é um Contato só (contacts_linkedin_per_workspace, sem caixa) e um e-mail é de um
--    Contato só: o "outro Contato do Workspace com o mesmo LinkedIn" é o próprio Contato, coberto pelo item acima.
-- Só aditiva: uma coluna com padrão, duas funções novas e três redefinidas. Nenhuma linha existente muda.

-- 1. A pessoa era nova para a Conta quando a busca a trouxe.
alter table private.proposed_contacts
  add column new_to_account boolean not null default true;

comment on column private.proposed_contacts.new_to_account is
  'true quando a busca que criou a proposta trouxe uma pessoa que a Conta ainda não conhecia: só essas custam 1 crédito.';

-- 2. Grava a proposta do comitê sem duplicar quem a Conta já conhece.
create or replace function public.record_proposed_contact(
  p_workspace_id uuid,
  p_target_account_id uuid,
  p_discovery_run_id uuid,
  p_name text,
  p_role text default null,
  p_headline text default null,
  p_linkedin_url text default null,
  p_location text default null,
  p_photo_url text default null,
  p_persona text default null,
  p_source_actor text default 'harvestapi~linkedin-company-employees',
  p_source_provider text default 'apify',
  p_source_data jsonb default null
) returns table (id uuid, created boolean)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_id uuid;
  v_key text := lower(private.normalize_linkedin(p_linkedin_url));
  v_existing uuid;
  v_new boolean := true;
begin
  if v_key is not null then
    -- A mesma pessoa na mesma Conta espera a vez: a conferência abaixo enxerga o que a outra gravação criou.
    perform pg_advisory_xact_lock(hashtextextended('proposed_contact:' || p_target_account_id::text || ':' || v_key, 0));

    select p.id into v_existing from private.proposed_contacts p
    where p.workspace_id = p_workspace_id and p.target_account_id = p_target_account_id
      and lower(private.normalize_linkedin(p.linkedin_url)) = v_key
    order by p.created_at, p.id
    limit 1;
    if v_existing is not null then
      return query select v_existing, false;
      return;
    end if;

    -- Contato com Vínculo com a Conta (ativo ou encerrado, arquivado ou não): já foi descoberto.
    v_new := not exists (
      select 1 from public.contact_account_links l
      join public.contacts c on c.workspace_id = l.workspace_id and c.id = l.contact_id
      where l.workspace_id = p_workspace_id and l.target_account_id = p_target_account_id
        and lower(private.normalize_linkedin(c.linkedin)) = v_key
    );
  end if;

  v_id := gen_random_uuid();
  insert into private.proposed_contacts (
    id, workspace_id, target_account_id, discovery_run_id, state, name, role,
    headline, linkedin_url, location, photo_url, persona, source_actor, source_provider, source_data, new_to_account
  ) values (
    v_id, p_workspace_id, p_target_account_id, p_discovery_run_id, 'nova', btrim(p_name),
    nullif(btrim(p_role), ''), nullif(btrim(p_headline), ''), nullif(btrim(p_linkedin_url), ''),
    nullif(btrim(p_location), ''), nullif(btrim(p_photo_url), ''),
    case when p_persona in ('Decisor', 'Influenciador', 'Campeao', 'Outro') then p_persona else null end,
    coalesce(p_source_actor, 'harvestapi~linkedin-company-employees'),
    coalesce(p_source_provider, 'apify'),
    p_source_data,
    v_new
  );

  return query select v_id, v_new;
end;
$$;

revoke all on function public.record_proposed_contact(uuid, uuid, uuid, text, text, text, text, text, text, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.record_proposed_contact(uuid, uuid, uuid, text, text, text, text, text, text, text, text, text, jsonb) to service_role;

-- 3. Finaliza a busca do comitê cobrando só as pessoas novas para a Conta.
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
  v_found integer := greatest(coalesce(p_contacts_found, 0), 0);
  v_added integer;
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
    select count(*)::integer into v_added from private.proposed_contacts p
    where p.workspace_id = v.workspace_id and p.discovery_run_id = v.id and p.new_to_account;
    v_added := least(v_added, v.max_results);
    v_found := greatest(v_found, v_added);

    -- Liquida só as novas (1 crédito cada); com zero, a reserva é liberada.
    if v.reservation_id is not null then
      perform public.settle_credits(v.reservation_id, v_added);
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
$$;

revoke all on function public.finish_committee_discovery(uuid, boolean, integer, numeric, text, text) from public, anon, authenticated;
grant execute on function public.finish_committee_discovery(uuid, boolean, integer, numeric, text, text) to service_role;

-- 4. Quantas pessoas a Conta já conhece (propostas em qualquer estado e Contatos com Vínculo), pelo LinkedIn sem caixa.
create function public.count_known_committee_people(
  p_workspace_id uuid,
  p_target_account_id uuid
) returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(distinct k.chave)::integer from (
    select lower(private.normalize_linkedin(p.linkedin_url)) as chave
    from private.proposed_contacts p
    where p.workspace_id = p_workspace_id and p.target_account_id = p_target_account_id
    union all
    select lower(private.normalize_linkedin(c.linkedin))
    from public.contact_account_links l
    join public.contacts c on c.workspace_id = l.workspace_id and c.id = l.contact_id
    where l.workspace_id = p_workspace_id and l.target_account_id = p_target_account_id
  ) k
  where k.chave is not null;
$$;

revoke all on function public.count_known_committee_people(uuid, uuid) from public, anon, authenticated;
grant execute on function public.count_known_committee_people(uuid, uuid) to service_role;

-- 5. O dado que o Contato já tem no canal: o principal, senão o primeiro adicional. Com o provedor que o coletou.
create function private.existing_contact_value(p_contact_id uuid, p_channel text)
returns table (value text, provider text)
language sql
stable
set search_path = ''
as $$
  select v.value, v.provider from (
    select c.email as value, s.provider, 1 as ordem
    from public.contacts c
    left join private.contact_field_sources s on s.contact_id = c.id and s.field = 'email'
    where p_channel = 'email' and c.id = p_contact_id and c.email is not null
    union all
    select e.email, e.provider, e.ordinal
    from private.contact_emails e
    where p_channel = 'email' and e.contact_id = p_contact_id
    union all
    select c.phone, s.provider, 1
    from public.contacts c
    left join private.contact_field_sources s on s.contact_id = c.id and s.field = 'phone'
    where p_channel = 'telefone' and c.id = p_contact_id and c.phone is not null
    union all
    select t.phone, null, t.ordinal
    from private.contact_phones t
    where p_channel = 'telefone' and t.contact_id = p_contact_id
  ) v
  order by v.ordem
  limit 1;
$$;

revoke all on function private.existing_contact_value(uuid, text) from public, anon, authenticated, service_role;

-- 6. A cotação antes do clique: 0 crédito quando o Contato já tem o dado. A coluna nova muda o retorno, por isso o drop.
drop function public.quote_reveal_contact(uuid, text);
create function public.quote_reveal_contact(
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
    v_cost := 5;
  else
    raise exception 'invalid channel for reveal' using errcode = '22023';
  end if;

  select t.booked - t.reserved into v_balance from private.credit_totals(v_contact.workspace_id) t;
  v_balance := coalesce(v_balance, 0);

  -- Já encontrado: nada a revelar, nada a cobrar.
  if exists (select 1 from private.existing_contact_value(v_contact.id, p_channel)) then
    return query select 0, v_balance, true, true;
    return;
  end if;

  return query select v_cost, v_balance, (v_balance >= v_cost), false;
end;
$$;

revoke all on function public.quote_reveal_contact(uuid, text) from public, anon;
grant execute on function public.quote_reveal_contact(uuid, text) to authenticated;

-- 7. A conferência do servidor antes de reservar: o dado que o Contato já tem, para a sessão que participa do
-- Workspace dele (a mesma regra da leitura de contacts). Sem linha: não há dado e a revelação segue.
create function public.existing_reveal_value(
  p_workspace_id uuid,
  p_contact_id uuid,
  p_channel text
) returns table (value text, provider text)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  if p_channel is null or p_channel not in ('email', 'telefone') then
    raise exception 'invalid channel for reveal' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.workspace_memberships m
    where m.workspace_id = p_workspace_id and m.user_id = v_user and m.active
  ) then
    raise exception 'active workspace membership required' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.contacts c
    where c.id = p_contact_id and c.workspace_id = p_workspace_id and c.archived_at is null
  ) then
    raise exception 'contact not found' using errcode = 'P0002';
  end if;

  return query select e.value, e.provider from private.existing_contact_value(p_contact_id, p_channel) e;
end;
$$;

revoke all on function public.existing_reveal_value(uuid, uuid, text) from public, anon;
grant execute on function public.existing_reveal_value(uuid, uuid, text) to authenticated;
