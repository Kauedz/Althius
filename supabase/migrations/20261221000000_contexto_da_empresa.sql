-- Contexto da empresa (spec contexto-da-empresa, ticket 01): os três textos do AI Context — Empresa, Perfil de
-- cliente ideal e Personas — guardados juntos, cada gravação uma versão nova. A vigente é a de maior número. O
-- Administrador ativo grava; toda Participação ativa lê; as funções do servidor leem pela mesma interface.
-- Nada vem do Playbook: a tabela nasce vazia e só recebe o que alguém escreve ou o que a geração pelo site produz
-- (ticket 02). Aditiva: nenhuma tabela ou função existente muda.

create table private.company_context_versions (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  version integer not null check (version > 0),
  empresa text not null check (length(empresa) <= 40000),
  icp text not null check (length(icp) <= 40000),
  personas text not null check (length(personas) <= 40000),
  -- De onde veio esta versão: escrita à mão ou aceita de uma geração pelo site (ticket 02).
  origin text not null default 'manual' check (origin in ('manual', 'geracao')),
  generation_id uuid,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (workspace_id, version)
);

alter table private.company_context_versions enable row level security;
revoke all on private.company_context_versions from public, anon, authenticated, service_role;

-- A versão vigente, para as outras funções do banco. Sem conferência de papel: quem chama já conferiu.
create function private.current_company_context(p_workspace_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select jsonb_build_object(
      'version', v.version,
      'empresa', v.empresa,
      'icp', v.icp,
      'personas', v.personas,
      'origin', v.origin,
      'updated_by', v.created_by,
      'updated_at', v.created_at
    )
    from private.company_context_versions v
    where v.workspace_id = p_workspace_id
    order by v.version desc
    limit 1
  ), jsonb_build_object(
    'version', null, 'empresa', '', 'icp', '', 'personas', '', 'origin', null, 'updated_by', null, 'updated_at', null
  ));
$$;

-- Grava a próxima versão, se a vigente ainda é a que quem escreve viu. Devolve o número da versão vigente depois da
-- gravação. Mesmo texto da vigente não cria versão: repetir a gravação é inofensivo.
create function private.write_company_context(
  p_workspace_id uuid,
  p_empresa text,
  p_icp text,
  p_personas text,
  p_expected_version integer,
  p_origin text,
  p_generation_id uuid
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_atual private.company_context_versions;
begin
  if p_empresa is null or p_icp is null or p_personas is null then
    raise exception 'invalid company context' using errcode = '22023';
  end if;
  if length(p_empresa) > 40000 or length(p_icp) > 40000 or length(p_personas) > 40000 then
    raise exception 'company context too long' using errcode = '22023';
  end if;
  -- Uma gravação por vez em cada Workspace: duas não disputam o mesmo número nem passam pela conferência juntas.
  perform pg_advisory_xact_lock(hashtext('company_context:' || p_workspace_id::text));
  select * into v_atual
  from private.company_context_versions v
  where v.workspace_id = p_workspace_id
  order by v.version desc
  limit 1;
  if coalesce(v_atual.version, 0) <> coalesce(p_expected_version, 0) then
    raise exception 'company context changed' using errcode = '40001';
  end if;
  if v_atual.version is not null and v_atual.empresa = p_empresa and v_atual.icp = p_icp
    and v_atual.personas = p_personas then
    return v_atual.version;
  end if;
  insert into private.company_context_versions
    (workspace_id, version, empresa, icp, personas, origin, generation_id, created_by)
  values (p_workspace_id, coalesce(v_atual.version, 0) + 1, p_empresa, p_icp, p_personas, p_origin, p_generation_id,
    auth.uid());
  return coalesce(v_atual.version, 0) + 1;
end;
$$;

revoke all on function private.current_company_context(uuid) from public, anon, authenticated, service_role;
revoke all on function private.write_company_context(uuid, text, text, text, integer, text, uuid)
  from public, anon, authenticated, service_role;

-- O contexto vigente para a tela: os três textos, a versão, o site cadastrado no onboarding e se quem lê pode editar.
create function public.get_company_context(p_workspace_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_role text := private.require_active_membership(p_workspace_id);
begin
  return private.current_company_context(p_workspace_id) || jsonb_build_object(
    'site', coalesce((select c.dominio from public.day0_companies c where c.workspace_id = p_workspace_id), ''),
    'can_edit', v_role = 'admin'
  );
end;
$$;

-- Só Administrador ativo grava. `p_expected_version` é a versão que a tela mostrava (nula quando não havia nenhuma):
-- se outra gravação chegou antes, recusa com 40001 em vez de sobrescrever.
create function public.save_company_context(
  p_workspace_id uuid,
  p_empresa text,
  p_icp text,
  p_personas text,
  p_expected_version integer
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
begin
  if private.require_active_membership(p_workspace_id) <> 'admin' then
    raise exception 'only administrators can edit the company context' using errcode = '42501';
  end if;
  return private.write_company_context(p_workspace_id, p_empresa, p_icp, p_personas, p_expected_version, 'manual', null);
end;
$$;

-- O contexto vigente para as Edge Functions (Agentes, Mercado, Aderência, Sequências): o mesmo contrato da tela,
-- sem o papel de quem lê.
create function public.company_context_for_workspace(p_workspace_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select private.current_company_context(p_workspace_id);
$$;

revoke all on function public.get_company_context(uuid) from public, anon;
revoke all on function public.save_company_context(uuid, text, text, text, integer) from public, anon;
grant execute on function public.get_company_context(uuid) to authenticated;
grant execute on function public.save_company_context(uuid, text, text, text, integer) to authenticated;

revoke all on function public.company_context_for_workspace(uuid) from public, anon, authenticated;
grant execute on function public.company_context_for_workspace(uuid) to service_role;
