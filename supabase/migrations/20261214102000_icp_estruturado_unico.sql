-- ICP estruturado único (Sinais first, ticket 01). O Day0 do Workspace guarda os três campos já perguntados no
-- checklist; cada Workspace ganha uma fonte versionada que os tickets 02–05 podem ler por uma única RPC.

alter table public.day0_companies
  add column o_que_vende text not null default '' check (length(o_que_vende) <= 2000),
  add column mini_icp text not null default '' check (length(mini_icp) <= 2000),
  add column por_que_compram text not null default '' check (length(por_que_compram) <= 2000);

create table private.workspace_icp_versions (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  version integer not null check (version > 0),
  sector text not null default '' check (length(sector) <= 2000),
  company_size text not null default '' check (length(company_size) <= 2000),
  geography text not null default '' check (length(geography) <= 2000),
  target_roles jsonb not null default '[]'::jsonb check (jsonb_typeof(target_roles) = 'array'),
  -- Espelha o texto da seção ICP do Playbook, que aceita até 200000 caracteres (save_playbook_section).
  free_text text not null default '' check (length(free_text) <= 200000),
  playbook_content jsonb not null default '{}'::jsonb check (jsonb_typeof(playbook_content) = 'object'),
  o_que_vende text not null default '' check (length(o_que_vende) <= 2000),
  mini_icp text not null default '' check (length(mini_icp) <= 2000),
  por_que_compram text not null default '' check (length(por_que_compram) <= 2000),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (workspace_id, version)
);
alter table private.workspace_icp_versions enable row level security;
revoke all on private.workspace_icp_versions from public, anon, authenticated, service_role;
create policy "active participants read workspace ICP" on private.workspace_icp_versions for select to authenticated
  using (exists (select 1 from public.workspace_memberships m
    where m.workspace_id = workspace_icp_versions.workspace_id and m.user_id = (select auth.uid()) and m.active));

-- Workspaces existentes começam com a versão vigente da seção ICP, quando ela já foi preenchida.
insert into private.workspace_icp_versions (workspace_id, version, free_text, playbook_content, created_by, created_at)
select v.workspace_id, 1, coalesce(v.content ->> 'texto', ''), v.content, v.created_by, v.created_at
from private.playbook_section_versions v
where v.section = 'icp'
  and v.version = (select max(atual.version) from private.playbook_section_versions atual
    where atual.workspace_id = v.workspace_id and atual.section = 'icp')
  and (coalesce(v.content ->> 'texto', '') <> '' or coalesce(v.content -> 'linhas', '[]'::jsonb) <> '[]'::jsonb);

-- Escreve a versão inicial apenas uma vez. O texto do Playbook é fonte reserva; em seguida, os campos do Day0 são
-- levados como os atributos de produto e mini-ICP do registro estruturado.
create function private.seed_workspace_icp(
  p_workspace_id uuid,
  p_o_que_vende text,
  p_mini_icp text,
  p_por_que_compram text,
  p_fallback_content jsonb default '{}'::jsonb
) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtext('workspace-icp:' || p_workspace_id::text));
  if exists (select 1 from private.workspace_icp_versions v where v.workspace_id = p_workspace_id) then
    return;
  end if;
  if coalesce(p_o_que_vende, '') = '' and coalesce(p_mini_icp, '') = ''
     and coalesce(p_por_que_compram, '') = '' and coalesce(p_fallback_content, '{}'::jsonb) = '{}'::jsonb then
    return;
  end if;
  insert into private.workspace_icp_versions
    (workspace_id, version, free_text, playbook_content, o_que_vende, mini_icp, por_que_compram, created_by)
  values (p_workspace_id, 1, coalesce(p_fallback_content ->> 'texto', ''), coalesce(p_fallback_content, '{}'::jsonb), coalesce(p_o_que_vende, ''),
    coalesce(p_mini_icp, ''), coalesce(p_por_que_compram, ''), auth.uid());
end;
$$;
revoke all on function private.seed_workspace_icp(uuid, text, text, text, jsonb) from public, anon, authenticated, service_role;

-- Toda gravação da seção ICP do Playbook também cria uma versão na fonte consumida pelos módulos. Isso mantém
-- a tela existente como caminho de edição e evita que a tabela estruturada fique defasada.
create function private.sync_playbook_icp_to_workspace_icp() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current private.workspace_icp_versions%rowtype;
begin
  if new.section <> 'icp' then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtext('workspace-icp:' || new.workspace_id::text));
  select * into v_current
  from private.workspace_icp_versions v
  where v.workspace_id = new.workspace_id
  order by v.version desc
  limit 1;

  insert into private.workspace_icp_versions
    (workspace_id, version, sector, company_size, geography, target_roles, free_text, playbook_content,
     o_que_vende, mini_icp, por_que_compram, created_by, created_at)
  values
    (new.workspace_id, coalesce(v_current.version, 0) + 1,
     coalesce(v_current.sector, ''), coalesce(v_current.company_size, ''), coalesce(v_current.geography, ''),
     coalesce(v_current.target_roles, '[]'::jsonb), coalesce(new.content ->> 'texto', ''), new.content,
     coalesce(v_current.o_que_vende, ''), coalesce(v_current.mini_icp, ''),
     coalesce(v_current.por_que_compram, ''), new.created_by, new.created_at);
  return new;
end;
$$;
revoke all on function private.sync_playbook_icp_to_workspace_icp() from public, anon, authenticated, service_role;

create trigger sync_playbook_icp_to_workspace_icp
  after insert on private.playbook_section_versions
  for each row execute function private.sync_playbook_icp_to_workspace_icp();

-- Fronteira estável de leitura para o ICP vigente; a tabela privada não é exposta diretamente ao PostgREST.
create function public.get_my_workspace_icp(p_workspace_id uuid) returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_icp private.workspace_icp_versions%rowtype;
begin
  perform private.require_active_membership(p_workspace_id);
  select * into v_icp from private.workspace_icp_versions v
  where v.workspace_id = p_workspace_id order by v.version desc limit 1;
  if not found then
    return jsonb_build_object('version', null, 'sector', '', 'companySize', '', 'geography', '', 'targetRoles', '[]'::jsonb,
      'freeText', '', 'playbookContent', '{}'::jsonb, 'oQueVende', '', 'miniIcp', '', 'porQueCompram', '');
  end if;
  return jsonb_build_object('version', v_icp.version, 'sector', v_icp.sector, 'companySize', v_icp.company_size,
    'geography', v_icp.geography, 'targetRoles', v_icp.target_roles, 'freeText', v_icp.free_text,
    'playbookContent', v_icp.playbook_content,
    'oQueVende', v_icp.o_que_vende, 'miniIcp', v_icp.mini_icp, 'porQueCompram', v_icp.por_que_compram,
    'updatedBy', v_icp.created_by, 'updatedAt', v_icp.created_at);
end;
$$;
revoke all on function public.get_my_workspace_icp(uuid) from public, anon, authenticated;
grant execute on function public.get_my_workspace_icp(uuid) to authenticated;

-- A leitura do Day0 devolve os campos já salvos para reabrir o checklist no mesmo Workspace.
create or replace function public.get_my_day0(p_workspace_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_role text := private.require_active_membership(p_workspace_id);
  v_invited boolean;
  v_account public.day0_accounts;
  v_company public.day0_companies;
  v_done boolean;
  v_step text;
begin
  v_invited := v_role <> 'admin' or private.day0_is_invited(p_workspace_id);
  select * into v_account from public.day0_accounts where user_id = auth.uid();
  select * into v_company from public.day0_companies where workspace_id = p_workspace_id;
  v_done := exists (select 1 from public.day0_completions where workspace_id = p_workspace_id and user_id = auth.uid());
  v_step := case
    when v_done then 'checklist'
    when v_account.papel is null and not coalesce(v_account.personal_done, false) then 'papel'
    when not v_invited and coalesce(v_company.empresa, '') = '' then 'empresa'
    when not v_invited and coalesce(v_company.dominio, '') = '' then 'dominio'
    when not coalesce(v_account.personal_done, false) then 'hdyhau'
    else 'convite' end;
  return jsonb_build_object('ramo', case when v_invited then 'convidado' else 'criador' end,
    'etapa', v_step, 'papel', v_account.papel, 'comoConheceu', v_account.como_conheceu,
    'empresa', coalesce(v_company.empresa, ''), 'dominio', coalesce(v_company.dominio, ''),
    'logoDoSite', v_company.logo, 'concluido', v_done,
    'miniIcp', coalesce(v_company.mini_icp, ''), 'oQueVende', coalesce(v_company.o_que_vende, ''),
    'porQueCompram', coalesce(v_company.por_que_compram, ''));
end;
$$;
revoke all on function public.get_my_day0(uuid) from public, anon, authenticated;
grant execute on function public.get_my_day0(uuid) to authenticated;

-- Mantém o contrato da RPC do Day0 e acrescenta a ação produto. A identidade segue vindo de auth.uid(); apenas o
-- Administrador original pode salvar empresa, domínio e Mini-ICP. Cada campo continua limitado a 2.000 caracteres.
create or replace function public.save_my_day0(p_workspace_id uuid, p_action text, p_value text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_role text;
  v_invited boolean;
  v_product jsonb;
  v_o_que_vende text;
  v_mini_icp text;
  v_por_que_compram text;
  v_fallback jsonb;
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
      select v.content into v_fallback
      from private.playbook_section_versions v
      where v.workspace_id = p_workspace_id and v.section = 'icp'
      order by v.version desc limit 1;
      perform private.seed_workspace_icp(p_workspace_id, v_o_que_vende, v_mini_icp, v_por_que_compram, coalesce(v_fallback, '{}'::jsonb));
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

-- A RPC legada só pode ser chamada por service_role desde a entrada fechada. Preserva sua assinatura e copia, quando
-- houver um único Workspace pessoal do chamador, o Day0 ou o ICP do Playbook como semente independente.
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
  v_fallback jsonb := '{}'::jsonb;
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
    select v.content into v_fallback
    from private.playbook_section_versions v where v.workspace_id = v_personal.id and v.section = 'icp'
    order by v.version desc limit 1;
    perform private.seed_workspace_icp(v_workspace.id, coalesce(v_company.o_que_vende, ''),
      coalesce(v_company.mini_icp, ''), coalesce(v_company.por_que_compram, ''), coalesce(v_fallback, '{}'::jsonb));
  end if;
  return v_workspace;
end;
$$;
revoke all on function public.create_company_workspace(text, uuid) from public, anon;
revoke execute on function public.create_company_workspace(text, uuid) from authenticated;
grant execute on function public.create_company_workspace(text, uuid) to service_role;

