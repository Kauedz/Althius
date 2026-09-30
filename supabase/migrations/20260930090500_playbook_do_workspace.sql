-- O Playbook do Workspace (spec playbook-do-workspace, ticket 01): as seções fixas do playbook do setup, cada uma
-- versionada, com autor e data. O Administrador ativo grava; toda Participação ativa lê; os Agentes leem as seções
-- da sua Especialidade (e sempre a Empresa) por uma função só de service_role. Nenhuma versão é apagada: restaurar
-- grava uma versão nova igual à antiga.

-- As seções, na ordem do modelo de planilha do setup.
create table private.playbook_section_catalog (
  section text primary key,
  name text not null,
  position smallint not null unique
);

insert into private.playbook_section_catalog (section, name, position) values
  ('empresa', 'Empresa', 1),
  ('icp', 'ICP', 2),
  ('mercado', 'Mercado', 3),
  ('personas', 'Personas', 4),
  ('processo_de_compra', 'Processo de compra', 5),
  ('dor_e_percepcao', 'Dor e percepção', 6),
  ('pipeline', 'Pipeline', 7),
  ('sla_e_metas', 'SLA e metas', 8),
  ('rotina', 'Rotina', 9),
  ('cadencia', 'Cadência', 10),
  ('scripts', 'Scripts', 11),
  ('templates', 'Templates', 12),
  ('objecoes', 'Objeções', 13),
  ('frameworks', 'Frameworks', 14),
  ('apresentacao', 'Apresentação', 15),
  ('negociacao_e_follow_up', 'Negociação e follow-up', 16);

-- O que cada Especialidade lê, além da Empresa.
create table private.playbook_specialty_sections (
  specialty text not null references private.specialty_catalog(specialty),
  section text not null references private.playbook_section_catalog(section),
  primary key (specialty, section)
);

insert into private.playbook_specialty_sections (specialty, section) values
  ('scopus', 'icp'),
  ('scopus', 'mercado'),
  ('ethos', 'personas'),
  ('ethos', 'processo_de_compra'),
  ('ethos', 'dor_e_percepcao'),
  ('ethos', 'objecoes'),
  ('rhetor', 'cadencia'),
  ('rhetor', 'scripts'),
  ('rhetor', 'templates'),
  ('rhetor', 'frameworks'),
  ('rhetor', 'objecoes'),
  ('oraculum', 'icp');

-- Cada gravação é uma versão; a vigente é a de maior número.
create table private.playbook_section_versions (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  section text not null references private.playbook_section_catalog(section),
  version integer not null check (version > 0),
  content jsonb not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (workspace_id, section, version)
);

alter table private.playbook_section_catalog enable row level security;
alter table private.playbook_specialty_sections enable row level security;
alter table private.playbook_section_versions enable row level security;
revoke all on private.playbook_section_catalog from public, anon, authenticated, service_role;
revoke all on private.playbook_specialty_sections from public, anon, authenticated, service_role;
revoke all on private.playbook_section_versions from public, anon, authenticated, service_role;

-- A seção existe no catálogo; senão, 22023.
create function private.require_playbook_section(p_section text)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from private.playbook_section_catalog c where c.section = p_section) then
    raise exception 'unknown playbook section' using errcode = '22023';
  end if;
end;
$$;

-- O conteúdo de uma seção: um objeto com "texto" (texto livre) e "linhas" (as linhas das tabelas do modelo, cada
-- uma um objeto), os dois opcionais e nada mais. Até 200 mil caracteres.
create function private.validate_playbook_content(p_content jsonb)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_content is null or jsonb_typeof(p_content) <> 'object'
    or exists (select 1 from jsonb_object_keys(p_content) k where k not in ('texto', 'linhas'))
    or (p_content ? 'texto' and jsonb_typeof(p_content -> 'texto') <> 'string')
    or (p_content ? 'linhas' and (jsonb_typeof(p_content -> 'linhas') <> 'array'
      or exists (select 1 from jsonb_array_elements(p_content -> 'linhas') l where jsonb_typeof(l) <> 'object')))
  then
    raise exception 'invalid playbook content' using errcode = '22023';
  end if;
  if length(p_content::text) > 200000 then
    raise exception 'playbook content too long' using errcode = '22023';
  end if;
end;
$$;

-- Grava a próxima versão da seção e devolve o número dela.
create function private.write_playbook_version(p_workspace_id uuid, p_section text, p_content jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_version integer;
begin
  -- Uma gravação por vez em cada seção, para duas versões não disputarem o mesmo número.
  perform pg_advisory_xact_lock(hashtext('playbook:' || p_workspace_id::text || ':' || p_section));
  select coalesce(max(v.version), 0) + 1 into v_version
  from private.playbook_section_versions v
  where v.workspace_id = p_workspace_id and v.section = p_section;
  insert into private.playbook_section_versions (workspace_id, section, version, content, created_by)
  values (p_workspace_id, p_section, v_version, p_content, auth.uid());
  return v_version;
end;
$$;

revoke all on function private.require_playbook_section(text) from public, anon, authenticated, service_role;
revoke all on function private.validate_playbook_content(jsonb) from public, anon, authenticated, service_role;
revoke all on function private.write_playbook_version(uuid, text, jsonb) from public, anon, authenticated, service_role;

-- Todas as seções, na ordem, com a versão vigente (nulos quando a seção ainda não foi escrita).
create function public.list_playbook_sections(p_workspace_id uuid)
returns table (
  section text,
  name text,
  "position" smallint,
  version integer,
  content jsonb,
  updated_by uuid,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_active_membership(p_workspace_id);
  return query
  select c.section, c.name, c.position, v.version, v.content, v.created_by, v.created_at
  from private.playbook_section_catalog c
  left join lateral (
    select x.version, x.content, x.created_by, x.created_at
    from private.playbook_section_versions x
    where x.workspace_id = p_workspace_id and x.section = c.section
    order by x.version desc
    limit 1
  ) v on true
  order by c.position;
end;
$$;

-- Uma seção: a versão vigente e o histórico (versão, autor e data, da mais nova à mais antiga).
create function public.get_playbook_section(p_workspace_id uuid, p_section text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  perform private.require_active_membership(p_workspace_id);
  perform private.require_playbook_section(p_section);
  select jsonb_build_object(
    'section', c.section,
    'name', c.name,
    'version', atual.version,
    'content', atual.content,
    'updated_by', atual.created_by,
    'updated_at', atual.created_at,
    'history', coalesce((
      select jsonb_agg(jsonb_build_object('version', h.version, 'updated_by', h.created_by, 'updated_at', h.created_at)
        order by h.version desc)
      from private.playbook_section_versions h
      where h.workspace_id = p_workspace_id and h.section = c.section
    ), '[]'::jsonb)
  ) into v_result
  from private.playbook_section_catalog c
  left join lateral (
    select x.version, x.content, x.created_by, x.created_at
    from private.playbook_section_versions x
    where x.workspace_id = p_workspace_id and x.section = c.section
    order by x.version desc
    limit 1
  ) atual on true
  where c.section = p_section;
  return v_result;
end;
$$;

-- Só Administrador ativo grava; cada gravação é uma versão nova.
create function public.save_playbook_section(p_workspace_id uuid, p_section text, p_content jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
begin
  if private.require_active_membership(p_workspace_id) <> 'admin' then
    raise exception 'only administrators can edit the playbook' using errcode = '42501';
  end if;
  perform private.require_playbook_section(p_section);
  perform private.validate_playbook_content(p_content);
  return private.write_playbook_version(p_workspace_id, p_section, p_content);
end;
$$;

-- Voltar a uma versão antiga grava uma versão nova com o mesmo conteúdo; a história fica inteira.
create function public.restore_playbook_version(p_workspace_id uuid, p_section text, p_version integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_content jsonb;
begin
  if private.require_active_membership(p_workspace_id) <> 'admin' then
    raise exception 'only administrators can edit the playbook' using errcode = '42501';
  end if;
  perform private.require_playbook_section(p_section);
  select v.content into v_content
  from private.playbook_section_versions v
  where v.workspace_id = p_workspace_id and v.section = p_section and v.version = p_version;
  if v_content is null then
    raise exception 'playbook version not found' using errcode = 'P0002';
  end if;
  return private.write_playbook_version(p_workspace_id, p_section, v_content);
end;
$$;

-- Para a Execução de um Agente: a Empresa e as seções da Especialidade, na ordem, só as já escritas.
create function public.playbook_for_specialty(p_workspace_id uuid, p_specialty text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from private.specialty_catalog s where s.specialty = p_specialty) then
    raise exception 'unknown specialty' using errcode = '22023';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('section', c.section, 'name', c.name, 'content', v.content)
      order by c.position)
    from private.playbook_section_catalog c
    cross join lateral (
      select x.content
      from private.playbook_section_versions x
      where x.workspace_id = p_workspace_id and x.section = c.section
      order by x.version desc
      limit 1
    ) v
    where c.section = 'empresa'
      or exists (
        select 1 from private.playbook_specialty_sections m
        where m.specialty = p_specialty and m.section = c.section
      )
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.list_playbook_sections(uuid) from public, anon;
revoke all on function public.get_playbook_section(uuid, text) from public, anon;
revoke all on function public.save_playbook_section(uuid, text, jsonb) from public, anon;
revoke all on function public.restore_playbook_version(uuid, text, integer) from public, anon;
grant execute on function public.list_playbook_sections(uuid) to authenticated;
grant execute on function public.get_playbook_section(uuid, text) to authenticated;
grant execute on function public.save_playbook_section(uuid, text, jsonb) to authenticated;
grant execute on function public.restore_playbook_version(uuid, text, integer) to authenticated;

revoke all on function public.playbook_for_specialty(uuid, text) from public, anon, authenticated;
grant execute on function public.playbook_for_specialty(uuid, text) to service_role;
