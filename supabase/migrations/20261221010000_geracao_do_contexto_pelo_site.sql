-- Geração do Contexto da empresa pelo site (spec contexto-da-empresa, ticket 02). Cada leitura do site é uma Geração:
-- o site lido, o estado, as páginas usadas, o motor e a versão do prompt, e os três textos que ela sugeriu. A primeira
-- geração bem-sucedida de um Workspace sem contexto fica vigente sozinha; as seguintes viram sugestão, que o
-- Administrador aceita ou descarta. Falha, descarte ou geração atrasada nunca mexem na versão vigente.
-- Aditiva: cria a tabela, liga as versões à geração de origem e redefine get_company_context a partir da definição de
-- 20261221000000_contexto_da_empresa.sql, só acrescentando a geração em andamento.

create table private.company_context_generations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  site text not null check (length(site) between 4 and 253),
  state text not null default 'gerando'
    check (state in ('gerando', 'aplicada', 'sugestao', 'aceita', 'descartada', 'falha')),
  -- A versão vigente quando a leitura começou (nula sem contexto). Só sem versão nenhuma a geração fica vigente sozinha.
  base_version integer,
  empresa text check (length(empresa) <= 40000),
  icp text check (length(icp) <= 40000),
  personas text check (length(personas) <= 40000),
  -- Procedência: as páginas lidas, o motor e a versão do prompt. Para diagnóstico; não aparece como seção na tela.
  sources jsonb not null default '[]'::jsonb check (jsonb_typeof(sources) = 'array'),
  engine text check (length(engine) <= 120),
  prompt_version text check (length(prompt_version) <= 40),
  cost_usd numeric(10, 6) check (cost_usd >= 0),
  failure text check (failure in ('site_insuficiente', 'site_indisponivel', 'sem_motor', 'saida_invalida', 'falhou')),
  applied_version integer,
  requested_by uuid references auth.users(id) on delete set null,
  -- O relógio de verdade, não o da transação: duas leituras na mesma transação ainda têm ordem.
  created_at timestamptz not null default clock_timestamp(),
  finished_at timestamptz,
  decided_by uuid references auth.users(id) on delete set null,
  decided_at timestamptz
);

-- Uma leitura em andamento por Workspace: repetir o pedido reaproveita a que já está rodando.
create unique index company_context_generations_uma_em_andamento
  on private.company_context_generations (workspace_id) where state = 'gerando';
create index company_context_generations_por_workspace
  on private.company_context_generations (workspace_id, created_at desc);

alter table private.company_context_generations enable row level security;
revoke all on private.company_context_generations from public, anon, authenticated, service_role;

alter table private.company_context_versions
  add constraint company_context_versions_generation_fk
  foreign key (generation_id) references private.company_context_generations(id) on delete set null;

-- Uma leitura que passou do prazo sem resposta deixou de estar em andamento: vira falha e libera nova tentativa.
create function private.expire_company_context_generations(p_workspace_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update private.company_context_generations g
  set state = 'falha', failure = 'falhou', finished_at = now()
  where g.workspace_id = p_workspace_id and g.state = 'gerando' and g.created_at < now() - interval '5 minutes';
$$;

revoke all on function private.expire_company_context_generations(uuid) from public, anon, authenticated, service_role;

-- Começa uma leitura do site. Só Administrador ativo. Com `p_site`, grava antes o site no cadastro da empresa (o mesmo
-- do onboarding). Sem site cadastrado nem informado, recusa. Já havendo leitura em andamento, devolve a mesma.
create function public.start_company_context_generation(p_workspace_id uuid, p_site text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_site text;
  v_gen private.company_context_generations;
begin
  if private.require_active_membership(p_workspace_id) <> 'admin' then
    raise exception 'only administrators can edit the company context' using errcode = '42501';
  end if;
  if p_site is not null then
    v_site := lower(btrim(p_site));
    if v_site !~ '^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$' then
      raise exception 'invalid company site' using errcode = '22023';
    end if;
    insert into public.day0_companies (workspace_id, dominio) values (p_workspace_id, v_site)
    on conflict (workspace_id) do update set dominio = excluded.dominio;
  end if;
  select c.dominio into v_site from public.day0_companies c where c.workspace_id = p_workspace_id;
  if coalesce(v_site, '') = '' then
    raise exception 'company site required' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext('company_context_generation:' || p_workspace_id::text));
  perform private.expire_company_context_generations(p_workspace_id);
  select * into v_gen from private.company_context_generations g
  where g.workspace_id = p_workspace_id and g.state = 'gerando';
  if v_gen.id is not null then
    return jsonb_build_object('generation_id', v_gen.id, 'site', v_gen.site, 'reused', true);
  end if;

  insert into private.company_context_generations (workspace_id, site, base_version, requested_by)
  values (p_workspace_id, v_site, (private.current_company_context(p_workspace_id) ->> 'version')::integer, auth.uid())
  returning * into v_gen;
  return jsonb_build_object('generation_id', v_gen.id, 'site', v_gen.site, 'reused', false);
end;
$$;

-- O resultado da leitura, gravado pela Edge Function. Só a primeira resposta conta: uma geração que já não está em
-- andamento (concluída, expirada) não muda mais. Sem versão nenhuma no Workspace, a geração fica vigente; com versão
-- (inclusive uma escrita à mão durante a leitura), vira sugestão.
create function public.finish_company_context_generation(
  p_generation_id uuid,
  p_empresa text,
  p_icp text,
  p_personas text,
  p_sources jsonb,
  p_engine text,
  p_prompt_version text,
  p_cost_usd numeric,
  p_failure text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_gen private.company_context_generations;
  v_version integer;
begin
  select * into v_gen from private.company_context_generations g where g.id = p_generation_id for update;
  if v_gen.id is null then
    raise exception 'company context generation not found' using errcode = 'P0002';
  end if;
  if v_gen.state <> 'gerando' then
    return jsonb_build_object('state', v_gen.state, 'applied_version', v_gen.applied_version, 'repeated', true);
  end if;

  update private.company_context_generations g
  set sources = coalesce(p_sources, '[]'::jsonb), engine = left(p_engine, 120), prompt_version = left(p_prompt_version, 40),
      cost_usd = p_cost_usd, finished_at = now()
  where g.id = p_generation_id;

  if p_failure is not null or coalesce(btrim(p_empresa), '') = '' or coalesce(btrim(p_icp), '') = ''
    or coalesce(btrim(p_personas), '') = '' then
    update private.company_context_generations g
    set state = 'falha', failure = coalesce(p_failure, 'saida_invalida')
    where g.id = p_generation_id;
    return jsonb_build_object('state', 'falha', 'applied_version', null, 'repeated', false);
  end if;

  update private.company_context_generations g
  set empresa = p_empresa, icp = p_icp, personas = p_personas
  where g.id = p_generation_id;

  if v_gen.base_version is null then
    begin
      v_version := private.write_company_context(v_gen.workspace_id, p_empresa, p_icp, p_personas, null, 'geracao',
        p_generation_id);
      update private.company_context_generations g set state = 'aplicada', applied_version = v_version
      where g.id = p_generation_id;
      return jsonb_build_object('state', 'aplicada', 'applied_version', v_version, 'repeated', false);
    exception when sqlstate '40001' then
      -- Alguém salvou à mão durante a leitura: a edição fica; a geração vira sugestão.
      null;
    end;
  end if;

  update private.company_context_generations g set state = 'sugestao' where g.id = p_generation_id;
  return jsonb_build_object('state', 'sugestao', 'applied_version', null, 'repeated', false);
end;
$$;

-- Aceitar a sugestão grava os textos dela como a próxima versão, se a vigente ainda é a que a tela mostrava.
create function public.accept_company_context_suggestion(
  p_workspace_id uuid,
  p_generation_id uuid,
  p_expected_version integer
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_gen private.company_context_generations;
  v_version integer;
begin
  if private.require_active_membership(p_workspace_id) <> 'admin' then
    raise exception 'only administrators can edit the company context' using errcode = '42501';
  end if;
  select * into v_gen from private.company_context_generations g
  where g.id = p_generation_id and g.workspace_id = p_workspace_id for update;
  if v_gen.id is null then
    raise exception 'company context generation not found' using errcode = 'P0002';
  end if;
  if v_gen.state = 'aceita' then
    return v_gen.applied_version;
  end if;
  if v_gen.state <> 'sugestao' then
    raise exception 'no company context suggestion to decide' using errcode = '22023';
  end if;
  v_version := private.write_company_context(p_workspace_id, v_gen.empresa, v_gen.icp, v_gen.personas,
    p_expected_version, 'geracao', p_generation_id);
  update private.company_context_generations g
  set state = 'aceita', applied_version = v_version, decided_by = auth.uid(), decided_at = now()
  where g.id = p_generation_id;
  return v_version;
end;
$$;

-- Descartar a sugestão (ou dispensar o aviso de uma falha) conserva a versão vigente.
create function public.discard_company_context_generation(p_workspace_id uuid, p_generation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_gen private.company_context_generations;
begin
  if private.require_active_membership(p_workspace_id) <> 'admin' then
    raise exception 'only administrators can edit the company context' using errcode = '42501';
  end if;
  select * into v_gen from private.company_context_generations g
  where g.id = p_generation_id and g.workspace_id = p_workspace_id for update;
  if v_gen.id is null then
    raise exception 'company context generation not found' using errcode = 'P0002';
  end if;
  if v_gen.state in ('descartada') then
    return;
  end if;
  if v_gen.state not in ('sugestao', 'falha') then
    raise exception 'no company context suggestion to decide' using errcode = '22023';
  end if;
  update private.company_context_generations g
  set state = 'descartada', decided_by = auth.uid(), decided_at = now()
  where g.id = p_generation_id;
end;
$$;

-- A geração mais recente que ainda pede atenção na tela: em andamento, com sugestão ou com falha não dispensada.
create function private.pending_company_context_generation(p_workspace_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', g.id,
    'site', g.site,
    -- Uma leitura que passou do prazo já é falha para quem olha, mesmo antes de ser marcada.
    'state', case when g.state = 'gerando' and g.created_at < now() - interval '5 minutes' then 'falha' else g.state end,
    'failure', case when g.state = 'gerando' and g.created_at < now() - interval '5 minutes' then 'falhou' else g.failure end,
    'base_version', g.base_version,
    'empresa', g.empresa,
    'icp', g.icp,
    'personas', g.personas,
    'sources', g.sources,
    'created_at', g.created_at,
    'finished_at', g.finished_at
  )
  from private.company_context_generations g
  where g.workspace_id = p_workspace_id
  order by g.created_at desc
  limit 1
$$;

create or replace function public.get_company_context(p_workspace_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_role text := private.require_active_membership(p_workspace_id);
  v_gen jsonb := private.pending_company_context_generation(p_workspace_id);
begin
  return private.current_company_context(p_workspace_id) || jsonb_build_object(
    'site', coalesce((select c.dominio from public.day0_companies c where c.workspace_id = p_workspace_id), ''),
    'can_edit', v_role = 'admin',
    'generation', case when v_gen ->> 'state' in ('gerando', 'sugestao', 'falha') then v_gen else null end
  );
end;
$$;

revoke all on function private.pending_company_context_generation(uuid) from public, anon, authenticated, service_role;

revoke all on function public.start_company_context_generation(uuid, text) from public, anon;
revoke all on function public.accept_company_context_suggestion(uuid, uuid, integer) from public, anon;
revoke all on function public.discard_company_context_generation(uuid, uuid) from public, anon;
grant execute on function public.start_company_context_generation(uuid, text) to authenticated;
grant execute on function public.accept_company_context_suggestion(uuid, uuid, integer) to authenticated;
grant execute on function public.discard_company_context_generation(uuid, uuid) to authenticated;

revoke all on function public.finish_company_context_generation(uuid, text, text, text, jsonb, text, text, numeric, text)
  from public, anon, authenticated;
grant execute on function public.finish_company_context_generation(uuid, text, text, text, jsonb, text, text, numeric, text)
  to service_role;
