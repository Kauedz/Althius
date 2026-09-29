-- Agentes, Personalização e Permissões por Integração (CRM-13).
-- Todo Workspace, pessoal ou da empresa, tem um Agente padrão por Especialidade (ADR-0005): nasce com o Workspace, com o
-- nome da Especialidade, e não pode ser excluído nem renomeado. O Cliente cria Agentes a partir de uma Especialidade
-- ("Especialidade · complemento"), que começam com uma cópia da Personalização, das Permissões e das Habilidades do
-- Agente padrão, com Memória vazia e sem Rotinas, e podem ser excluídos. O catálogo de Especialidades é fixo: só existe
-- para leitura, e nenhuma função cria uma.
-- Cada Agente guarda a Personalização (instruções, tom de voz, base de conhecimento, canais) e uma Permissão por
-- Integração (Ler, Propor ou Executar, ADR-0002), mais a Memória, as Habilidades e as Rotinas dele. Tudo pertence ao
-- Workspace do Agente, por chave estrangeira composta, e só se lê e se grava pelas funções abaixo, que conferem a
-- Participação ativa de quem chama: todo participante consulta; só Administrador cria e exclui Agentes, altera a
-- Personalização e as Permissões e mexe na Memória, nas Habilidades e nas Rotinas. Um Membro consulta, como nas demais
-- configurações do Workspace. Nada aqui executa um Agente nem chama um modelo: as Rotinas ficam salvas, e a execução
-- (Conversas, Coordenação, Rotinas, Atividade) chega com o ticket CRM-14.
-- Excluir um Agente criado apaga a configuração dele, e só ela. O que outros módulos vierem a guardar sobre o Agente
-- (Execuções, Aprovações, Conversas) referencia private.agents pela chave, e a exclusão respeita essa referência: com uma
-- que não acompanha o Agente, ela é recusada em vez de deixar registro órfão. A criação, a exclusão e cada troca de
-- Permissão ficam em private.agent_events, sem chave estrangeira para o Agente, para o histórico sobreviver a ele.

-- O catálogo fixo de Especialidades da Althius. O Cliente não cria Especialidades.
create table private.specialty_catalog (
  specialty text primary key check (specialty in ('scopus', 'ethos', 'rhetor', 'oraculum')),
  name text not null unique check (name = btrim(name) and length(name) between 1 and 40),
  -- A ordem em que as Especialidades aparecem: a dos Agentes padrão na grade.
  position smallint not null unique
);

insert into private.specialty_catalog (specialty, name, position) values
  ('scopus', 'Scopus', 1),
  ('ethos', 'Ethos', 2),
  ('rhetor', 'Rhetor', 3),
  ('oraculum', 'Oraculum', 4);

-- As Integrações em que um Agente pode ter Permissão. `writes` marca as que escrevem ou gastam dinheiro, onde o padrão
-- é Propor. Quem conecta uma Integração ao Workspace é outro módulo (Conexões): aqui só se guarda a Permissão do Agente.
create table private.integration_catalog (
  id text primary key check (id ~ '^[a-z][a-z0-9-]*$' and length(id) <= 40),
  name text not null check (name = btrim(name) and length(name) between 1 and 60),
  writes boolean not null
);

insert into private.integration_catalog (id, name, writes) values
  ('hubspot', 'HubSpot', true),
  ('clay', 'Clay', false),
  ('apollo', 'Apollo', false),
  ('lusha', 'Lusha', false),
  ('notion', 'Notion', true),
  ('meta-ads', 'Meta Ads', true),
  ('google-ads', 'Google Ads', true);

-- As Integrações que o Agente padrão de cada Especialidade usa de saída, com a Permissão padrão (ADR-0002): Ler, e
-- Propor onde a Integração escreve ou gasta. Os Agentes criados herdam as do Agente padrão, e não estas.
create table private.specialty_default_permissions (
  specialty text not null references private.specialty_catalog(specialty),
  integration_id text not null references private.integration_catalog(id),
  permission text not null check (permission in ('ler', 'propor', 'executar')),
  primary key (specialty, integration_id)
);

create index specialty_default_permissions_integration_idx on private.specialty_default_permissions (integration_id);

insert into private.specialty_default_permissions (specialty, integration_id, permission)
select d.specialty, d.integration_id, case when i.writes then 'propor' else 'ler' end
from (values
  ('scopus', 'hubspot'), ('scopus', 'clay'), ('scopus', 'apollo'), ('scopus', 'lusha'),
  ('ethos', 'hubspot'), ('ethos', 'apollo'), ('ethos', 'lusha'), ('ethos', 'notion'),
  ('rhetor', 'hubspot'), ('rhetor', 'notion'), ('rhetor', 'meta-ads'), ('rhetor', 'google-ads'),
  ('oraculum', 'notion'), ('oraculum', 'google-ads')
) as d (specialty, integration_id)
join private.integration_catalog i on i.id = d.integration_id;

create table private.agents (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  specialty text not null references private.specialty_catalog(specialty),
  kind text not null check (kind in ('padrao', 'criado')),
  -- O nome é montado por gatilho: o da Especialidade e, no Agente criado, " · complemento".
  name text not null check (name = btrim(name) and length(name) between 1 and 110),
  complement text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default clock_timestamp(),
  unique (workspace_id, id),
  check (
    (kind = 'padrao' and complement is null)
    or (kind = 'criado' and complement is not null and complement = btrim(complement) and length(complement) between 1 and 60)
  )
);

-- Um único Agente padrão por Especialidade em cada Workspace, e nomes distintos entre os Agentes do Workspace.
create unique index agents_one_default_per_specialty on private.agents (workspace_id, specialty) where kind = 'padrao';
create unique index agents_name_per_workspace on private.agents (workspace_id, lower(name));
create index agents_specialty_idx on private.agents (specialty);
create index agents_created_by_idx on private.agents (created_by);

-- A Personalização: instruções, tom de voz, canais em que o Agente atende e, em outra tabela, a base de conhecimento.
create table private.agent_settings (
  agent_id uuid primary key,
  workspace_id uuid not null,
  instructions text not null default '' check (length(instructions) <= 4000),
  voice_tone text not null default '' check (length(voice_tone) <= 500),
  channels text[] not null default '{}' check (channels <@ array['slack', 'whatsapp', 'teams', 'email']),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  foreign key (workspace_id, agent_id) references private.agents (workspace_id, id) on delete cascade
);

create index agent_settings_workspace_idx on private.agent_settings (workspace_id, agent_id);
create index agent_settings_updated_by_idx on private.agent_settings (updated_by);

create table private.agent_knowledge_sources (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  agent_id uuid not null,
  kind text not null check (kind in ('documento', 'url', 'notion')),
  name text not null check (name = btrim(name) and length(name) between 1 and 500),
  position integer not null check (position >= 0),
  unique (agent_id, position),
  foreign key (workspace_id, agent_id) references private.agents (workspace_id, id) on delete cascade
);

create index agent_knowledge_sources_workspace_idx on private.agent_knowledge_sources (workspace_id, agent_id);

-- A Permissão do Agente em cada Integração. Sem linha, o Agente não usa a Integração.
create table private.agent_permissions (
  agent_id uuid not null,
  workspace_id uuid not null,
  integration_id text not null references private.integration_catalog(id),
  permission text not null check (permission in ('ler', 'propor', 'executar')),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (agent_id, integration_id),
  foreign key (workspace_id, agent_id) references private.agents (workspace_id, id) on delete cascade
);

create index agent_permissions_workspace_idx on private.agent_permissions (workspace_id, agent_id);
create index agent_permissions_integration_idx on private.agent_permissions (integration_id);
create index agent_permissions_updated_by_idx on private.agent_permissions (updated_by);

-- A Memória: fatos que o Agente aprendeu, cada um com a origem. Quem os grava é o Agente, quando executar (CRM-14); o
-- participante só os corrige ou apaga.
create table private.agent_memory_facts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  agent_id uuid not null,
  content text not null check (content = btrim(content) and length(content) between 1 and 1000),
  origin text not null check (origin = btrim(origin) and length(origin) between 1 and 200),
  created_at timestamptz not null default clock_timestamp(),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  foreign key (workspace_id, agent_id) references private.agents (workspace_id, id) on delete cascade
);

create index agent_memory_facts_agent_idx on private.agent_memory_facts (workspace_id, agent_id, created_at);
create index agent_memory_facts_updated_by_idx on private.agent_memory_facts (updated_by);

-- As Habilidades: procedimentos que o Agente criou ou refinou com o uso. `uses_document` é o documento da Memória do
-- Workspace que a Habilidade lê a cada uso.
create table private.agent_skills (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  agent_id uuid not null,
  name text not null check (name = btrim(name) and length(name) between 1 and 120),
  description text not null default '' check (length(description) <= 1000),
  uses integer not null default 0 check (uses >= 0),
  last_improved_at date not null default current_date,
  active boolean not null default true,
  uses_document text check (uses_document in ('icp', 'personas')),
  created_at timestamptz not null default clock_timestamp(),
  updated_by uuid references auth.users(id) on delete set null,
  unique (agent_id, name),
  foreign key (workspace_id, agent_id) references private.agents (workspace_id, id) on delete cascade
);

create index agent_skills_agent_idx on private.agent_skills (workspace_id, agent_id, created_at);
create index agent_skills_updated_by_idx on private.agent_skills (updated_by);

-- As Rotinas: tarefas agendadas do Agente. Ficam salvas; nenhum executor as roda ainda.
create table private.agent_routines (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  agent_id uuid not null,
  task text not null check (task = btrim(task) and length(task) between 1 and 500),
  frequency text not null check (frequency in ('diaria', 'semanal', 'mensal')),
  weekday text check (weekday in ('segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado', 'domingo')),
  run_time text not null check (run_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  destination_channel text check (destination_channel in ('slack', 'whatsapp', 'teams', 'email')),
  paused boolean not null default false,
  created_at timestamptz not null default clock_timestamp(),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  check ((frequency = 'semanal') = (weekday is not null)),
  foreign key (workspace_id, agent_id) references private.agents (workspace_id, id) on delete cascade
);

create index agent_routines_agent_idx on private.agent_routines (workspace_id, agent_id, created_at);
create index agent_routines_updated_by_idx on private.agent_routines (updated_by);

-- O histórico de criação e exclusão de Agentes e de cada troca de Permissão. Sem chave estrangeira para o Agente, para
-- sobreviver à exclusão dele; o nome fica como era no momento.
create table private.agent_events (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  agent_id uuid not null,
  agent_name text not null,
  event text not null check (event in ('agente_criado', 'agente_excluido', 'permissao_alterada')),
  integration_id text,
  old_permission text,
  new_permission text,
  actor_user_id uuid,
  created_at timestamptz not null default now(),
  check ((event = 'permissao_alterada') = (integration_id is not null))
);

create index agent_events_workspace_idx on private.agent_events (workspace_id, created_at);
create index agent_events_agent_idx on private.agent_events (agent_id);

alter table private.specialty_catalog enable row level security;
alter table private.integration_catalog enable row level security;
alter table private.specialty_default_permissions enable row level security;
alter table private.agents enable row level security;
alter table private.agent_settings enable row level security;
alter table private.agent_knowledge_sources enable row level security;
alter table private.agent_permissions enable row level security;
alter table private.agent_memory_facts enable row level security;
alter table private.agent_skills enable row level security;
alter table private.agent_routines enable row level security;
alter table private.agent_events enable row level security;
revoke all on private.specialty_catalog from public, anon, authenticated, service_role;
revoke all on private.integration_catalog from public, anon, authenticated, service_role;
revoke all on private.specialty_default_permissions from public, anon, authenticated, service_role;
revoke all on private.agents from public, anon, authenticated, service_role;
revoke all on private.agent_settings from public, anon, authenticated, service_role;
revoke all on private.agent_knowledge_sources from public, anon, authenticated, service_role;
revoke all on private.agent_permissions from public, anon, authenticated, service_role;
revoke all on private.agent_memory_facts from public, anon, authenticated, service_role;
revoke all on private.agent_skills from public, anon, authenticated, service_role;
revoke all on private.agent_routines from public, anon, authenticated, service_role;
revoke all on private.agent_events from public, anon, authenticated, service_role;

-- O nome do Agente: o da Especialidade e, no Agente criado, " · complemento". Vale qualquer nome que a escrita traga.
create function private.set_agent_name()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.name := (select c.name from private.specialty_catalog c where c.specialty = new.specialty)
    || case when new.kind = 'criado' then ' · ' || new.complement else '' end;
  return new;
end;
$$;

-- Um Agente não é renomeado nem trocado de Especialidade, de tipo ou de Workspace, por função ou por qualquer escrita.
create function private.protect_agent_identity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.workspace_id <> old.workspace_id or new.specialty <> old.specialty or new.kind <> old.kind
     or new.name <> old.name or new.complement is distinct from old.complement then
    raise exception 'agents cannot be renamed or moved' using errcode = '42501';
  end if;
  return new;
end;
$$;

-- O Agente padrão não é excluído. Excluir o Workspace inteiro leva os Agentes junto, e por isso o gatilho só recusa
-- enquanto o Workspace existe.
create function private.protect_default_agent()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.kind = 'padrao' and exists (select 1 from public.workspaces w where w.id = old.workspace_id) then
    raise exception 'default agents cannot be deleted' using errcode = '42501';
  end if;
  return old;
end;
$$;

revoke all on function private.set_agent_name() from public, anon, authenticated, service_role;
revoke all on function private.protect_agent_identity() from public, anon, authenticated, service_role;
revoke all on function private.protect_default_agent() from public, anon, authenticated, service_role;

create trigger set_agent_name
  before insert on private.agents
  for each row execute function private.set_agent_name();

create trigger protect_agent_identity
  before update on private.agents
  for each row execute function private.protect_agent_identity();

create trigger protect_default_agent
  before delete on private.agents
  for each row execute function private.protect_default_agent();

-- Garante os quatro Agentes padrão do Workspace, cada um nascendo com a Personalização vazia e as Permissões padrão da
-- Especialidade. Idempotente: um Agente padrão que já existe não é tocado, nem a configuração que ele já ganhou.
create function private.seed_default_agents(p_workspace_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  with novos as (
    insert into private.agents (workspace_id, specialty, kind)
    select p_workspace_id, c.specialty, 'padrao'
    from private.specialty_catalog c
    on conflict do nothing
    returning id, workspace_id, specialty
  ), configuracao as (
    insert into private.agent_settings (agent_id, workspace_id)
    select n.id, n.workspace_id from novos n
  )
  insert into private.agent_permissions (agent_id, workspace_id, integration_id, permission)
  select n.id, n.workspace_id, d.integration_id, d.permission
  from novos n
  join private.specialty_default_permissions d on d.specialty = n.specialty;
end;
$$;

revoke all on function private.seed_default_agents(uuid) from public, anon, authenticated, service_role;

-- Todo Workspace novo, pessoal ou da empresa, nasce com os Agentes padrão.
create function private.seed_agents_of_new_workspace()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.seed_default_agents(new.id);
  return new;
end;
$$;

revoke all on function private.seed_agents_of_new_workspace() from public, anon, authenticated, service_role;

create trigger seed_agents_of_new_workspace
  after insert on public.workspaces
  for each row execute function private.seed_agents_of_new_workspace();

-- Os Workspaces que já existem ganham os Agentes padrão.
select private.seed_default_agents(w.id) from public.workspaces w;

-- Quem chama precisa de Participação ativa no Workspace do Agente, e de Administrador quando `p_admin`; devolve o
-- Workspace. Um Agente de outro Workspace responde como um que não existe, para o identificador não revelar nada.
create function private.require_agent(p_agent_id uuid, p_admin boolean default false)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := private.require_user();
  v_workspace_id uuid;
  v_role text;
begin
  select a.workspace_id, m.role into v_workspace_id, v_role
  from private.agents a
  join public.workspace_memberships m on m.workspace_id = a.workspace_id and m.user_id = v_user_id and m.active
  where a.id = p_agent_id;
  if not found then
    raise exception 'agent not found' using errcode = 'P0002';
  end if;
  if p_admin and v_role <> 'admin' then
    raise exception 'only administrators can manage agents' using errcode = '42501';
  end if;
  return v_workspace_id;
end;
$$;

-- O mesmo para um Workspace: gerenciar Agentes é de Administrador ativo.
create function private.require_agent_admin(p_workspace_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if private.require_active_membership(p_workspace_id) <> 'admin' then
    raise exception 'only administrators can manage agents' using errcode = '42501';
  end if;
end;
$$;

revoke all on function private.require_agent(uuid, boolean) from public, anon, authenticated, service_role;
revoke all on function private.require_agent_admin(uuid) from public, anon, authenticated, service_role;

-- O que um Agente tem de Personalização precisa caber nos limites das tabelas; recusa antes de gravar.
create function private.check_agent_text(p_instructions text, p_voice_tone text)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_instructions is null or length(p_instructions) > 4000 then
    raise exception 'invalid instructions' using errcode = '22023';
  end if;
  if p_voice_tone is null or length(p_voice_tone) > 500 then
    raise exception 'invalid voice tone' using errcode = '22023';
  end if;
end;
$$;

revoke all on function private.check_agent_text(text, text) from public, anon, authenticated, service_role;

-- Os Agentes do Workspace, os padrão na ordem das Especialidades e depois os criados, do mais antigo ao mais novo. Traz o
-- que a grade mostra: as instruções, as Integrações com Permissão e a Rotina ativa (a mais antiga que não está pausada).
create function public.list_agents(p_workspace_id uuid)
returns table (
  id uuid, name text, kind text, specialty text, complement text, created_at timestamptz,
  instructions text, integrations text[], active_routine jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_active_membership(p_workspace_id);
  return query
    select a.id, a.name, a.kind, a.specialty, a.complement, a.created_at,
      coalesce(s.instructions, ''),
      coalesce((select array_agg(p.integration_id order by p.integration_id)
                from private.agent_permissions p where p.agent_id = a.id), '{}'::text[]),
      (select jsonb_build_object('id', r.id, 'task', r.task, 'frequency', r.frequency, 'weekday', r.weekday,
                                 'time', r.run_time, 'channel', r.destination_channel)
       from private.agent_routines r where r.agent_id = a.id and not r.paused
       order by r.created_at, r.id limit 1)
    from private.agents a
    join private.specialty_catalog c on c.specialty = a.specialty
    left join private.agent_settings s on s.agent_id = a.id
    where a.workspace_id = p_workspace_id
    order by (a.kind = 'criado'), c.position, a.created_at, a.id;
end;
$$;

-- A Personalização do Agente: instruções, tom de voz, canais, base de conhecimento e a Permissão em cada Integração.
create function public.get_agent_settings(p_agent_id uuid)
returns table (instructions text, voice_tone text, channels text[], knowledge jsonb, permissions jsonb)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_agent(p_agent_id);
  return query
    select coalesce(s.instructions, ''), coalesce(s.voice_tone, ''), coalesce(s.channels, '{}'::text[]),
      coalesce((select jsonb_agg(jsonb_build_object('id', k.id, 'kind', k.kind, 'name', k.name) order by k.position)
                from private.agent_knowledge_sources k where k.agent_id = p_agent_id), '[]'::jsonb),
      coalesce((select jsonb_object_agg(p.integration_id, p.permission)
                from private.agent_permissions p where p.agent_id = p_agent_id), '{}'::jsonb)
    from (select 1) one
    left join private.agent_settings s on s.agent_id = p_agent_id;
end;
$$;

-- Cria um Agente a partir de uma Especialidade (ADR-0005): "Especialidade · complemento", com uma cópia da
-- Personalização, das Permissões e das Habilidades do Agente padrão, Memória vazia e sem Rotinas. Instruções em branco
-- ficam com as do Agente padrão. As Habilidades copiadas começam sem usos: quem as usou foi o Agente padrão.
create function public.create_agent(p_workspace_id uuid, p_specialty text, p_complement text, p_instructions text default '')
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_complement text := btrim(coalesce(p_complement, ''));
  v_instructions text := btrim(coalesce(p_instructions, ''));
  v_default private.agents%rowtype;
  v_id uuid;
begin
  perform private.require_agent_admin(p_workspace_id);
  if p_specialty is null or not exists (select 1 from private.specialty_catalog c where c.specialty = p_specialty) then
    raise exception 'invalid specialty' using errcode = '22023';
  end if;
  if length(v_complement) not between 1 and 60 then
    raise exception 'invalid complement' using errcode = '22023';
  end if;
  perform private.check_agent_text(v_instructions, '');

  -- O Agente padrão é a origem da cópia: FOR SHARE espera uma gravação da Personalização dele terminar, e uma nova só
  -- entra depois da cópia.
  select * into v_default from private.agents a
  where a.workspace_id = p_workspace_id and a.specialty = p_specialty and a.kind = 'padrao'
  for share;
  if not found then
    raise exception 'agent not found' using errcode = 'P0002';
  end if;

  begin
    insert into private.agents (workspace_id, specialty, kind, complement, created_by)
    values (p_workspace_id, p_specialty, 'criado', v_complement, auth.uid())
    returning id into v_id;
  exception when unique_violation then
    raise exception 'agent name already exists' using errcode = '23505';
  end;

  insert into private.agent_settings (agent_id, workspace_id, instructions, voice_tone, channels, updated_by)
  select v_id, p_workspace_id, coalesce(nullif(v_instructions, ''), s.instructions), s.voice_tone, s.channels, auth.uid()
  from private.agent_settings s where s.agent_id = v_default.id;

  insert into private.agent_knowledge_sources (workspace_id, agent_id, kind, name, position)
  select p_workspace_id, v_id, k.kind, k.name, k.position
  from private.agent_knowledge_sources k where k.agent_id = v_default.id;

  insert into private.agent_permissions (agent_id, workspace_id, integration_id, permission, updated_by)
  select v_id, p_workspace_id, p.integration_id, p.permission, auth.uid()
  from private.agent_permissions p where p.agent_id = v_default.id;

  insert into private.agent_skills (workspace_id, agent_id, name, description, uses, last_improved_at, active, uses_document, updated_by)
  select p_workspace_id, v_id, h.name, h.description, 0, h.last_improved_at, h.active, h.uses_document, auth.uid()
  from private.agent_skills h where h.agent_id = v_default.id
  order by h.created_at, h.id;

  insert into private.agent_events (workspace_id, agent_id, agent_name, event, actor_user_id)
  select p_workspace_id, v_id, a.name, 'agente_criado', auth.uid() from private.agents a where a.id = v_id;

  return v_id;
end;
$$;

-- Exclui um Agente criado e a configuração dele. O Agente padrão não pode ser excluído. Uma referência ao Agente que não
-- acompanha a exclusão (chave estrangeira sem cascata, de outro módulo) a recusa, sem apagar nada.
create function public.delete_agent(p_agent_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workspace_id uuid := private.require_agent(p_agent_id, true);
  v_agent private.agents%rowtype;
begin
  select * into v_agent from private.agents a where a.id = p_agent_id for update;
  if not found then
    raise exception 'agent not found' using errcode = 'P0002';
  end if;
  if v_agent.kind = 'padrao' then
    raise exception 'default agents cannot be deleted' using errcode = '42501';
  end if;
  begin
    delete from private.agents a where a.id = p_agent_id;
  exception when foreign_key_violation then
    raise exception 'agent has references' using errcode = '23503';
  end;
  insert into private.agent_events (workspace_id, agent_id, agent_name, event, actor_user_id)
  values (v_workspace_id, v_agent.id, v_agent.name, 'agente_excluido', auth.uid());
end;
$$;

-- Grava a Personalização e as Permissões do Agente de uma vez: quem chama manda o estado inteiro, e o que não vem sai.
-- `p_knowledge` é uma lista de { kind, name } e `p_permissions`, um objeto { integração: permissão }. Cada troca de
-- Permissão entra em private.agent_events. Se algo for recusado, nada muda.
create function public.save_agent_settings(
  p_agent_id uuid, p_instructions text, p_voice_tone text, p_channels text[], p_knowledge jsonb, p_permissions jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workspace_id uuid := private.require_agent(p_agent_id, true);
  v_channels text[] := coalesce(p_channels, '{}'::text[]);
  v_agent private.agents%rowtype;
begin
  perform private.check_agent_text(coalesce(p_instructions, ''), coalesce(p_voice_tone, ''));
  if not (v_channels <@ array['slack', 'whatsapp', 'teams', 'email']) then
    raise exception 'invalid channel' using errcode = '22023';
  end if;
  if p_knowledge is null or jsonb_typeof(p_knowledge) <> 'array' or jsonb_array_length(p_knowledge) > 50
     or exists (
       select 1 from jsonb_array_elements(p_knowledge) e
       where jsonb_typeof(e) <> 'object'
         or e ->> 'kind' is null or e ->> 'kind' not in ('documento', 'url', 'notion')
         or jsonb_typeof(e -> 'name') <> 'string' or length(btrim(e ->> 'name')) not between 1 and 500
     ) then
    raise exception 'invalid knowledge' using errcode = '22023';
  end if;
  if p_permissions is null or jsonb_typeof(p_permissions) <> 'object' then
    raise exception 'invalid permissions' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_each(p_permissions) e
    where jsonb_typeof(e.value) <> 'string' or e.value #>> '{}' not in ('ler', 'propor', 'executar')
  ) then
    raise exception 'invalid permission' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_object_keys(p_permissions) k
    where not exists (select 1 from private.integration_catalog i where i.id = k)
  ) then
    raise exception 'unknown integration' using errcode = '22023';
  end if;

  -- Uma gravação por vez em cada Agente; e uma cópia (create_agent) espera esta terminar.
  select * into v_agent from private.agents a where a.id = p_agent_id for update;
  if not found then
    raise exception 'agent not found' using errcode = 'P0002';
  end if;

  insert into private.agent_settings as s (agent_id, workspace_id, instructions, voice_tone, channels, updated_by)
  values (p_agent_id, v_workspace_id, coalesce(p_instructions, ''), coalesce(p_voice_tone, ''),
          coalesce((select array_agg(distinct c order by c) from unnest(v_channels) c), '{}'::text[]), auth.uid())
  on conflict (agent_id) do update
    set instructions = excluded.instructions, voice_tone = excluded.voice_tone, channels = excluded.channels,
        updated_by = excluded.updated_by, updated_at = now();

  delete from private.agent_knowledge_sources k where k.agent_id = p_agent_id;
  insert into private.agent_knowledge_sources (workspace_id, agent_id, kind, name, position)
  select v_workspace_id, p_agent_id, e.value ->> 'kind', btrim(e.value ->> 'name'), (e.ordinality - 1)::integer
  from jsonb_array_elements(p_knowledge) with ordinality as e (value, ordinality);

  insert into private.agent_events
    (workspace_id, agent_id, agent_name, event, integration_id, old_permission, new_permission, actor_user_id)
  select v_workspace_id, p_agent_id, v_agent.name, 'permissao_alterada',
    coalesce(n.integration_id, o.integration_id), o.permission, n.permission, auth.uid()
  from (select e.key as integration_id, e.value #>> '{}' as permission from jsonb_each(p_permissions) e) n
  full join (select p.integration_id, p.permission from private.agent_permissions p where p.agent_id = p_agent_id) o
    on o.integration_id = n.integration_id
  where o.permission is distinct from n.permission
  order by coalesce(n.integration_id, o.integration_id);

  delete from private.agent_permissions p where p.agent_id = p_agent_id;
  insert into private.agent_permissions (agent_id, workspace_id, integration_id, permission, updated_by)
  select p_agent_id, v_workspace_id, e.key, e.value #>> '{}', auth.uid()
  from jsonb_each(p_permissions) e;
end;
$$;

-- A Memória do Agente, do fato mais antigo ao mais novo.
create function public.list_agent_memory(p_agent_id uuid)
returns table (id uuid, content text, origin text, created_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_agent(p_agent_id);
  return query
    select f.id, f.content, f.origin, f.created_at
    from private.agent_memory_facts f
    where f.agent_id = p_agent_id
    order by f.created_at, f.id;
end;
$$;

-- Corrige um fato da Memória; a origem dele continua a de quando o Agente o aprendeu.
create function public.edit_agent_memory_fact(p_fact_id uuid, p_content text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_content text := btrim(coalesce(p_content, ''));
  v_agent_id uuid;
begin
  select f.agent_id into v_agent_id from private.agent_memory_facts f where f.id = p_fact_id;
  -- Um fato que não existe responde como um Agente que o chamador não vê.
  perform private.require_agent(coalesce(v_agent_id, gen_random_uuid()), true);
  if length(v_content) not between 1 and 1000 then
    raise exception 'invalid content' using errcode = '22023';
  end if;
  update private.agent_memory_facts f
  set content = v_content, updated_by = auth.uid(), updated_at = now()
  where f.id = p_fact_id;
end;
$$;

create function public.delete_agent_memory_fact(p_fact_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_agent_id uuid;
begin
  select f.agent_id into v_agent_id from private.agent_memory_facts f where f.id = p_fact_id;
  perform private.require_agent(coalesce(v_agent_id, gen_random_uuid()), true);
  delete from private.agent_memory_facts f where f.id = p_fact_id;
end;
$$;

-- As Habilidades do Agente, da mais antiga à mais nova.
create function public.list_agent_skills(p_agent_id uuid)
returns table (id uuid, name text, description text, uses integer, last_improved_at date, active boolean, uses_document text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_agent(p_agent_id);
  return query
    select h.id, h.name, h.description, h.uses, h.last_improved_at, h.active, h.uses_document
    from private.agent_skills h
    where h.agent_id = p_agent_id
    order by h.created_at, h.id;
end;
$$;

create function public.set_agent_skill_active(p_skill_id uuid, p_active boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_agent_id uuid;
begin
  select h.agent_id into v_agent_id from private.agent_skills h where h.id = p_skill_id;
  perform private.require_agent(coalesce(v_agent_id, gen_random_uuid()), true);
  if p_active is null then
    raise exception 'invalid state' using errcode = '22023';
  end if;
  update private.agent_skills h set active = p_active, updated_by = auth.uid() where h.id = p_skill_id;
end;
$$;

-- Confere os campos de uma Rotina antes de gravar, com a recusa por campo em vez do erro da restrição da tabela.
create function private.check_routine(p_task text, p_frequency text, p_weekday text, p_time text, p_channel text)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_task is null or length(btrim(p_task)) not between 1 and 500 then
    raise exception 'invalid task' using errcode = '22023';
  end if;
  if p_frequency is null or p_frequency not in ('diaria', 'semanal', 'mensal') then
    raise exception 'invalid frequency' using errcode = '22023';
  end if;
  if (p_frequency = 'semanal') <> (p_weekday is not null)
     or (p_weekday is not null and p_weekday not in ('segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado', 'domingo')) then
    raise exception 'invalid weekday' using errcode = '22023';
  end if;
  if p_time is null or p_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
    raise exception 'invalid time' using errcode = '22023';
  end if;
  if p_channel is not null and p_channel not in ('slack', 'whatsapp', 'teams', 'email') then
    raise exception 'invalid channel' using errcode = '22023';
  end if;
end;
$$;

revoke all on function private.check_routine(text, text, text, text, text) from public, anon, authenticated, service_role;

-- As Rotinas do Agente, da mais antiga à mais nova.
create function public.list_agent_routines(p_agent_id uuid)
returns table (id uuid, task text, frequency text, weekday text, run_time text, destination_channel text, paused boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_agent(p_agent_id);
  return query
    select r.id, r.task, r.frequency, r.weekday, r.run_time, r.destination_channel, r.paused
    from private.agent_routines r
    where r.agent_id = p_agent_id
    order by r.created_at, r.id;
end;
$$;

create function public.create_agent_routine(
  p_agent_id uuid, p_task text, p_frequency text, p_weekday text, p_time text, p_channel text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workspace_id uuid := private.require_agent(p_agent_id, true);
  v_id uuid;
begin
  perform private.check_routine(p_task, p_frequency, p_weekday, p_time, p_channel);
  insert into private.agent_routines (workspace_id, agent_id, task, frequency, weekday, run_time, destination_channel, updated_by)
  values (v_workspace_id, p_agent_id, btrim(p_task), p_frequency, p_weekday, p_time, p_channel, auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;

create function public.update_agent_routine(
  p_routine_id uuid, p_task text, p_frequency text, p_weekday text, p_time text, p_channel text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_agent_id uuid;
begin
  select r.agent_id into v_agent_id from private.agent_routines r where r.id = p_routine_id;
  perform private.require_agent(coalesce(v_agent_id, gen_random_uuid()), true);
  perform private.check_routine(p_task, p_frequency, p_weekday, p_time, p_channel);
  update private.agent_routines r
  set task = btrim(p_task), frequency = p_frequency, weekday = p_weekday, run_time = p_time,
      destination_channel = p_channel, updated_by = auth.uid(), updated_at = now()
  where r.id = p_routine_id;
end;
$$;

create function public.set_agent_routine_paused(p_routine_id uuid, p_paused boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_agent_id uuid;
begin
  select r.agent_id into v_agent_id from private.agent_routines r where r.id = p_routine_id;
  perform private.require_agent(coalesce(v_agent_id, gen_random_uuid()), true);
  if p_paused is null then
    raise exception 'invalid state' using errcode = '22023';
  end if;
  update private.agent_routines r set paused = p_paused, updated_by = auth.uid(), updated_at = now() where r.id = p_routine_id;
end;
$$;

create function public.delete_agent_routine(p_routine_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_agent_id uuid;
begin
  select r.agent_id into v_agent_id from private.agent_routines r where r.id = p_routine_id;
  perform private.require_agent(coalesce(v_agent_id, gen_random_uuid()), true);
  delete from private.agent_routines r where r.id = p_routine_id;
end;
$$;

revoke all on function public.list_agents(uuid) from public, anon;
revoke all on function public.get_agent_settings(uuid) from public, anon;
revoke all on function public.create_agent(uuid, text, text, text) from public, anon;
revoke all on function public.delete_agent(uuid) from public, anon;
revoke all on function public.save_agent_settings(uuid, text, text, text[], jsonb, jsonb) from public, anon;
revoke all on function public.list_agent_memory(uuid) from public, anon;
revoke all on function public.edit_agent_memory_fact(uuid, text) from public, anon;
revoke all on function public.delete_agent_memory_fact(uuid) from public, anon;
revoke all on function public.list_agent_skills(uuid) from public, anon;
revoke all on function public.set_agent_skill_active(uuid, boolean) from public, anon;
revoke all on function public.list_agent_routines(uuid) from public, anon;
revoke all on function public.create_agent_routine(uuid, text, text, text, text, text) from public, anon;
revoke all on function public.update_agent_routine(uuid, text, text, text, text, text) from public, anon;
revoke all on function public.set_agent_routine_paused(uuid, boolean) from public, anon;
revoke all on function public.delete_agent_routine(uuid) from public, anon;

grant execute on function public.list_agents(uuid) to authenticated;
grant execute on function public.get_agent_settings(uuid) to authenticated;
grant execute on function public.create_agent(uuid, text, text, text) to authenticated;
grant execute on function public.delete_agent(uuid) to authenticated;
grant execute on function public.save_agent_settings(uuid, text, text, text[], jsonb, jsonb) to authenticated;
grant execute on function public.list_agent_memory(uuid) to authenticated;
grant execute on function public.edit_agent_memory_fact(uuid, text) to authenticated;
grant execute on function public.delete_agent_memory_fact(uuid) to authenticated;
grant execute on function public.list_agent_skills(uuid) to authenticated;
grant execute on function public.set_agent_skill_active(uuid, boolean) to authenticated;
grant execute on function public.list_agent_routines(uuid) to authenticated;
grant execute on function public.create_agent_routine(uuid, text, text, text, text, text) to authenticated;
grant execute on function public.update_agent_routine(uuid, text, text, text, text, text) to authenticated;
grant execute on function public.set_agent_routine_paused(uuid, boolean) to authenticated;
grant execute on function public.delete_agent_routine(uuid) to authenticated;
