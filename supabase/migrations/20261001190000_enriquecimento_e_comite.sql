-- Enriquecimento de Contas e Comitê de Compra (enriquecimento-em-cascata):
-- 1. Dados da Receita Federal na Conta-alvo (coluna `receita_data` em target_accounts e função de gravação);
-- 2. Caixa de Comitê de Compra: pessoas propostas por cargo e Persona (Decisor, Influenciador, Campeão)
--    na tabela `private.proposed_contacts`, originadas de buscas do comitê (`private.discovery_runs` kind = 'comite');
-- 3. Ações no Comitê: listar, aceitar (cria o Contato chamando `public.create_contact` existente ou vincula) e descartar;
-- 4. Revelação de Contato: cotação prévia, reserva e liquidação (2 créditos por e-mail, 5 créditos por telefone,
--    debitando apenas quando o dado é encontrado).

-- 1. Coluna de dados enriquecidos da Receita Federal na Conta-alvo
alter table public.target_accounts add column if not exists receita_data jsonb;

-- 2. Tabela de contatos propostos para o comitê de compra
create table if not exists private.proposed_contacts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  target_account_id uuid not null,
  discovery_run_id uuid references private.discovery_runs(id) on delete set null,
  state text not null default 'nova' check (state in ('nova', 'aceita', 'descartada')),
  name text not null check (btrim(name) <> ''),
  role text,
  headline text,
  linkedin_url text,
  location text,
  photo_url text,
  persona text check (persona is null or persona in ('Decisor', 'Influenciador', 'Campeao', 'Outro')),
  contact_id uuid references public.contacts(id) on delete set null,
  source_actor text not null default 'harvestapi~linkedin-company-employees',
  source_provider text not null default 'apify',
  source_data jsonb,
  decided_by uuid references auth.users(id) on delete set null,
  decided_at timestamptz,
  discard_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (workspace_id, target_account_id) references public.target_accounts(workspace_id, id) on delete cascade,
  unique (workspace_id, id)
);

create unique index if not exists proposed_contacts_account_linkedin_idx
  on private.proposed_contacts (workspace_id, target_account_id, linkedin_url)
  where linkedin_url is not null;

create index if not exists proposed_contacts_account_state_idx
  on private.proposed_contacts (workspace_id, target_account_id, state);

alter table private.proposed_contacts enable row level security;
revoke all on private.proposed_contacts from public, anon, authenticated, service_role;
grant select, insert, update on private.proposed_contacts to service_role;

-- 3. Atualização dos dados da Receita Federal na Conta-alvo
create or replace function public.save_account_receita_enrichment(
  p_workspace_id uuid,
  p_target_account_id uuid,
  p_cnpj text,
  p_receita_data jsonb
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_role text;
  v_cnpj_fmt text;
begin
  if v_user is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  select m.role into v_role from public.workspace_memberships m
  where m.workspace_id = p_workspace_id and m.user_id = v_user and m.active;
  if not found then
    raise exception 'active workspace membership required' using errcode = '42501';
  end if;

  v_cnpj_fmt := private.format_cnpj(private.cnpj_key(p_cnpj));

  update public.target_accounts set
    legal_identifier = coalesce(v_cnpj_fmt, legal_identifier),
    receita_data = coalesce(p_receita_data, receita_data),
    updated_at = now()
  where id = p_target_account_id and workspace_id = p_workspace_id;

  if not found then
    raise exception 'target account not found' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.save_account_receita_enrichment(uuid, uuid, text, jsonb) from public, anon;
grant execute on function public.save_account_receita_enrichment(uuid, uuid, text, jsonb) to authenticated;

-- 4. Início da busca de comitê de compra (reserva 1 crédito por contato potencial)
create or replace function public.begin_committee_discovery(
  p_workspace_id uuid,
  p_target_account_id uuid,
  p_request_key text default null,
  p_max_results integer default 10,
  p_actor_id text default 'harvestapi~linkedin-company-employees',
  p_allow_testing boolean default true
) returns table (run_id uuid, reservation_id uuid, state text)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_user uuid := auth.uid();
  v_role text := private.require_active_membership(p_workspace_id);
  v_actor private.discovery_actors%rowtype;
  v_run private.discovery_runs%rowtype;
  v_id uuid;
  v_res uuid;
  v_price numeric;
  v_max integer := coalesce(p_max_results, 10);
begin
  perform private.expire_stale_discovery_runs();

  if not exists (
    select 1 from public.target_accounts a
    where a.id = p_target_account_id and a.workspace_id = p_workspace_id and a.deleted_at is null
  ) then
    raise exception 'target account not found' using errcode = 'P0002';
  end if;

  if p_request_key is not null then
    select * into v_run from private.discovery_runs r
    where r.workspace_id = p_workspace_id and r.request_key = p_request_key;
    if found then
      return query select v_run.id, v_run.reservation_id, v_run.state;
      return;
    end if;
  end if;

  if exists (
    select 1 from private.discovery_runs r
    where r.workspace_id = p_workspace_id and r.kind = 'comite'
      and r.target_account_id = p_target_account_id and r.state = 'em_andamento'
  ) then
    raise exception 'a committee discovery is already running for this account' using errcode = '55006';
  end if;

  select * into v_actor from private.discovery_actors a
  where a.purpose = 'buscar_pessoas' and a.actor_id = p_actor_id;
  if not found then
    raise exception 'discovery actor not found' using errcode = 'P0002';
  end if;
  if v_actor.state = 'out' then
    raise exception 'discovery actor is out' using errcode = '55000';
  end if;
  if v_actor.state = 'testing' and not (coalesce(p_allow_testing, false) and v_role = 'admin') then
    raise exception 'discovery actor is still in testing' using errcode = '55000';
  end if;

  v_id := gen_random_uuid();
  -- Reserva 1 crédito por contato pedido (person_collected = 1 crédito)
  v_res := public.reserve_credits(
    p_workspace_id, v_user, 'person_collected', 'committee:' || v_id::text, v_max
  );
  select c.credits * v_max into v_price from private.credit_action_prices c where c.action = 'person_collected';

  insert into private.discovery_runs (
    id, workspace_id, kind, target_account_id, requested_by, state, request_key, max_results,
    actor_id, actor_version, estimated_credits, estimated_cost_usd, reservation_id, started_at
  ) values (
    v_id, p_workspace_id, 'comite', p_target_account_id, v_user, 'em_andamento', p_request_key, v_max,
    v_actor.actor_id, v_actor.version, coalesce(v_price, v_max), v_actor.max_cost_usd, v_res, now()
  );

  return query select v_id, v_res, 'em_andamento'::text;
end;
$$;

revoke all on function public.begin_committee_discovery(uuid, uuid, text, integer, text, boolean) from public, anon;
grant execute on function public.begin_committee_discovery(uuid, uuid, text, integer, text, boolean) to authenticated;

-- 5. Finaliza a busca do comitê liquidando apenas os contatos de fato encontrados
create or replace function public.finish_committee_discovery(
  p_run_id uuid,
  p_success boolean,
  p_contacts_found integer,
  p_cost_usd numeric default null,
  p_error text default null
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
      last_error = p_error,
      finished_at = now()
    where id = v.id;
  end if;
end;
$$;

revoke all on function public.finish_committee_discovery(uuid, boolean, integer, numeric, text) from public, anon, authenticated;
grant execute on function public.finish_committee_discovery(uuid, boolean, integer, numeric, text) to service_role;

-- 6. Grava contato proposto para o comitê (servidor/service_role)
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
  v_existing private.proposed_contacts%rowtype;
begin
  if p_linkedin_url is not null and btrim(p_linkedin_url) <> '' then
    select * into v_existing from private.proposed_contacts p
    where p.workspace_id = p_workspace_id and p.target_account_id = p_target_account_id
      and p.linkedin_url = btrim(p_linkedin_url);
    if found then
      return query select v_existing.id, false;
      return;
    end if;
  end if;

  v_id := gen_random_uuid();
  insert into private.proposed_contacts (
    id, workspace_id, target_account_id, discovery_run_id, state, name, role,
    headline, linkedin_url, location, photo_url, persona, source_actor, source_provider, source_data
  ) values (
    v_id, p_workspace_id, p_target_account_id, p_discovery_run_id, 'nova', btrim(p_name),
    nullif(btrim(p_role), ''), nullif(btrim(p_headline), ''), nullif(btrim(p_linkedin_url), ''),
    nullif(btrim(p_location), ''), nullif(btrim(p_photo_url), ''),
    case when p_persona in ('Decisor', 'Influenciador', 'Campeao', 'Outro') then p_persona else null end,
    coalesce(p_source_actor, 'harvestapi~linkedin-company-employees'),
    coalesce(p_source_provider, 'apify'),
    p_source_data
  );

  return query select v_id, true;
end;
$$;

revoke all on function public.record_proposed_contact(uuid, uuid, uuid, text, text, text, text, text, text, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.record_proposed_contact(uuid, uuid, uuid, text, text, text, text, text, text, text, text, text, jsonb) to service_role;

-- 7. Lista contatos propostos para uma Conta-alvo
create or replace function public.list_proposed_contacts(
  p_target_account_id uuid,
  p_state text default 'nova'
) returns table (
  id uuid,
  target_account_id uuid,
  state text,
  name text,
  role text,
  headline text,
  linkedin_url text,
  location text,
  photo_url text,
  persona text,
  contact_id uuid,
  source_provider text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_user uuid := auth.uid();
  v_account public.target_accounts%rowtype;
begin
  if v_user is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  select * into v_account from public.target_accounts a where a.id = p_target_account_id and a.deleted_at is null;
  if not found then
    raise exception 'target account not found' using errcode = 'P0002';
  end if;

  if not exists (
    select 1 from public.workspace_memberships m
    where m.workspace_id = v_account.workspace_id and m.user_id = v_user and m.active
  ) then
    raise exception 'active workspace membership required' using errcode = '42501';
  end if;

  return query
  select
    p.id, p.target_account_id, p.state, p.name, p.role, p.headline,
    p.linkedin_url, p.location, p.photo_url, p.persona, p.contact_id,
    p.source_provider, p.created_at
  from private.proposed_contacts p
  where p.target_account_id = p_target_account_id
    and (p_state is null or p.state = p_state)
  order by
    case p.persona
      when 'Decisor' then 1
      when 'Influenciador' then 2
      when 'Campeao' then 3
      else 4
    end,
    p.created_at desc;
end;
$$;

revoke all on function public.list_proposed_contacts(uuid, text) from public, anon;
grant execute on function public.list_proposed_contacts(uuid, text) to authenticated;

-- 8. Aceita contato proposto criando-o na Conta-alvo via `public.create_contact` existente
create or replace function public.accept_proposed_contact(
  p_id uuid,
  p_email text default null,
  p_phone text default null
) returns public.contacts
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_p private.proposed_contacts%rowtype;
  v_contact public.contacts;
  v_existing_id uuid;
begin
  if v_user is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  select * into v_p from private.proposed_contacts p where p.id = p_id for update;
  if not found then
    raise exception 'proposed contact not found' using errcode = 'P0002';
  end if;

  if v_p.state = 'aceita' and v_p.contact_id is not null then
    select * into v_contact from public.contacts c where c.id = v_p.contact_id;
    return v_contact;
  end if;

  if not private.can_manage_account_contacts(v_p.workspace_id, v_p.target_account_id, v_user) then
    raise exception 'only the responsible seller or an admin can manage contacts of this target account'
      using errcode = '42501';
  end if;

  -- Verifica se já existe um contato no Workspace com este LinkedIn ou e-mail
  if v_p.linkedin_url is not null then
    select c.id into v_existing_id from public.contacts c
    where c.workspace_id = v_p.workspace_id and c.linkedin = private.normalize_linkedin(v_p.linkedin_url)
      and c.archived_at is null;
  end if;

  if v_existing_id is not null then
    -- Vincula à conta sem duplicar o contato
    perform public.link_contact(v_existing_id, v_p.target_account_id);
    select * into v_contact from public.contacts where id = v_existing_id;
  else
    -- Cria o Contato na Conta-alvo através da função existente
    v_contact := public.create_contact(
      v_p.target_account_id,
      v_p.name,
      v_p.role,
      p_email,
      p_phone,
      v_p.linkedin_url
    );
  end if;

  update private.proposed_contacts set
    state = 'aceita',
    contact_id = v_contact.id,
    decided_by = v_user,
    decided_at = now(),
    updated_at = now()
  where id = v_p.id;

  return v_contact;
end;
$$;

revoke all on function public.accept_proposed_contact(uuid, text, text) from public, anon;
grant execute on function public.accept_proposed_contact(uuid, text, text) to authenticated;

-- 9. Descarta contato proposto
create or replace function public.discard_proposed_contact(
  p_id uuid,
  p_reason text default null
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_p private.proposed_contacts%rowtype;
begin
  if v_user is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  select * into v_p from private.proposed_contacts p where p.id = p_id for update;
  if not found then
    raise exception 'proposed contact not found' using errcode = 'P0002';
  end if;

  if not private.can_manage_account_contacts(v_p.workspace_id, v_p.target_account_id, v_user) then
    raise exception 'only the responsible seller or an admin can manage contacts of this target account'
      using errcode = '42501';
  end if;

  update private.proposed_contacts set
    state = 'descartada',
    discard_reason = nullif(btrim(p_reason), ''),
    decided_by = v_user,
    decided_at = now(),
    updated_at = now()
  where id = v_p.id;
end;
$$;

revoke all on function public.discard_proposed_contact(uuid, text) from public, anon;
grant execute on function public.discard_proposed_contact(uuid, text) to authenticated;

-- 10. Cotação prévia para revelação de contato
create or replace function public.quote_reveal_contact(
  p_contact_id uuid,
  p_channel text
) returns table (credits integer, current_balance numeric, can_reveal boolean)
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

  return query select v_cost, v_balance, (v_balance >= v_cost);
end;
$$;

revoke all on function public.quote_reveal_contact(uuid, text) from public, anon;
grant execute on function public.quote_reveal_contact(uuid, text) to authenticated;

-- 11. Inicia revelação de contato (reserva 2 créditos para e-mail ou 5 para telefone)
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
    v_action := 'phone_revealed';
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

revoke all on function public.begin_reveal_contact(uuid, uuid, text, text) from public, anon;
grant execute on function public.begin_reveal_contact(uuid, uuid, text, text) to authenticated;

-- 12. Finaliza revelação de contato: debita apenas quando acha valor válido
create or replace function public.finish_reveal_contact(
  p_reservation_id uuid,
  p_contact_id uuid,
  p_channel text,
  p_value text default null,
  p_source text default 'apify'
) returns table (success boolean, debited_credits integer)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_contact public.contacts%rowtype;
  v_val text := nullif(btrim(coalesce(p_value, '')), '');
  v_debited integer := 0;
begin
  select * into v_contact from public.contacts c where c.id = p_contact_id and c.archived_at is null;
  if not found then
    raise exception 'contact not found' using errcode = 'P0002';
  end if;

  if v_val is not null then
    -- Dado encontrado: liquida a reserva debitando os créditos
    perform public.settle_credits(p_reservation_id, 1);
    v_debited := case when p_channel = 'email' then 2 else 5 end;

    if p_channel = 'email' then
      update public.contacts set
        email = coalesce(email, private.validate_email(v_val)),
        updated_at = now()
      where id = p_contact_id;
    elsif p_channel = 'telefone' then
      update public.contacts set
        phone = coalesce(phone, private.normalize_whatsapp(v_val)),
        updated_at = now()
      where id = p_contact_id;
    end if;

    return query select true, v_debited;
  else
    -- Não achou: cancela reserva debitando ZERO créditos
    perform public.settle_credits(p_reservation_id, 0);
    return query select false, 0;
  end if;
end;
$$;

revoke all on function public.finish_reveal_contact(uuid, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.finish_reveal_contact(uuid, uuid, text, text, text) to service_role;
