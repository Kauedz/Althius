-- Catálogo de Conexões e Integrações habilitadas no Workspace (Conexões funcionais, ticket 02; ADR-0017).
-- O catálogo é o mesmo para todo Workspace: Canais e Integrações, com a categoria de cada Integração e se ela já pode
-- ser habilitada. Um item indisponível aparece "Em breve". Só HubSpot e Notion entram disponíveis.
-- Um Administrador habilita uma Integração disponível no Workspace; toda Participação ativa vê o que está habilitado.
-- Habilitar não dá acesso a ninguém: cada participante conecta o próprio Acesso à Integração (ticket 03).

create table public.connection_catalog (
  id text primary key,
  kind text not null check (kind in ('canal', 'integracao')),
  name text not null check (btrim(name) <> ''),
  category text check (category in ('CRM', 'Enriquecimento', 'Conhecimento', 'Mídia paga')),
  description text not null,
  available boolean not null default false,
  position integer not null,
  check ((kind = 'integracao') = (category is not null)),
  check (kind = 'integracao' or not available)
);

insert into public.connection_catalog (id, kind, name, category, description, available, position) values
  ('slack', 'canal', 'Slack', null, 'Mencione um Agente em qualquer canal ou thread.', false, 10),
  ('whatsapp', 'canal', 'WhatsApp', null, 'Converse com os Agentes pelo número do Workspace.', false, 20),
  ('teams', 'canal', 'Microsoft Teams', null, 'Mencione um Agente em chats e canais do Teams.', false, 30),
  ('email', 'canal', 'E-mail', null, 'Encaminhe e-mails e receba resumos das Rotinas.', false, 40),
  ('hubspot', 'integracao', 'HubSpot', 'CRM', 'Contas-alvo e Contatos sincronizados do seu CRM.', true, 110),
  ('salesforce', 'integracao', 'Salesforce', 'CRM', 'Contas, contatos e oportunidades.', false, 120),
  ('clay', 'integracao', 'Clay', 'Enriquecimento', 'Dados firmográficos e de tecnologia.', false, 210),
  ('apollo', 'integracao', 'Apollo', 'Enriquecimento', 'Contatos e sinais de compra.', false, 220),
  ('lusha', 'integracao', 'Lusha', 'Enriquecimento', 'Cargos e contatos do Comitê de compra.', false, 230),
  ('zoominfo', 'integracao', 'ZoomInfo', 'Enriquecimento', 'Empresas e contatos B2B.', false, 240),
  ('notion', 'integracao', 'Notion', 'Conhecimento', 'Páginas usadas como base de conhecimento e pautas.', true, 310),
  ('google-drive', 'integracao', 'Google Drive', 'Conhecimento', 'Documentos da equipe como base de conhecimento.', false, 320),
  ('meta-ads', 'integracao', 'Meta Ads', 'Mídia paga', 'Campanhas no Facebook e no Instagram.', false, 410),
  ('google-ads', 'integracao', 'Google Ads', 'Mídia paga', 'Campanhas de busca e display.', false, 420),
  ('linkedin-ads', 'integracao', 'LinkedIn Ads', 'Mídia paga', 'Campanhas no LinkedIn.', false, 430);

create table public.workspace_integrations (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  integration_id text not null references public.connection_catalog(id),
  enabled_by uuid not null references auth.users(id),
  enabled_at timestamptz not null default now(),
  primary key (workspace_id, integration_id)
);

create index workspace_integrations_integration_idx on public.workspace_integrations (integration_id);
create index workspace_integrations_enabled_by_idx on public.workspace_integrations (enabled_by);

alter table public.connection_catalog enable row level security;
alter table public.workspace_integrations enable row level security;

create policy "authenticated users read the connection catalog"
  on public.connection_catalog for select to authenticated
  using (true);

create policy "active members read enabled integrations"
  on public.workspace_integrations for select to authenticated
  using (exists (
    select 1 from public.workspace_memberships m
    where m.workspace_id = workspace_integrations.workspace_id
      and m.user_id = (select auth.uid()) and m.active
  ));

revoke all on public.connection_catalog from anon, authenticated;
revoke all on public.workspace_integrations from anon, authenticated;
grant select on public.connection_catalog to authenticated;
grant select on public.workspace_integrations to authenticated;

-- Um Administrador ativo habilita uma Integração disponível no Workspace. Repetir devolve a habilitação existente.
create function public.enable_integration(p_workspace_id uuid, p_integration_id text)
returns public.workspace_integrations
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_row public.workspace_integrations;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if not exists (
    select 1 from public.workspace_memberships m
    where m.workspace_id = p_workspace_id and m.user_id = v_user_id and m.active and m.role = 'admin'
  ) then
    raise exception 'only an admin can enable an integration' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.connection_catalog c
    where c.id = p_integration_id and c.kind = 'integracao' and c.available
  ) then
    raise exception 'connection not available' using errcode = '22023';
  end if;

  insert into public.workspace_integrations (workspace_id, integration_id, enabled_by)
  values (p_workspace_id, p_integration_id, v_user_id)
  on conflict (workspace_id, integration_id) do nothing
  returning * into v_row;
  if v_row.workspace_id is null then
    select * into v_row from public.workspace_integrations
    where workspace_id = p_workspace_id and integration_id = p_integration_id;
  end if;
  return v_row;
end;
$$;

revoke all on function public.enable_integration(uuid, text) from public, anon;
grant execute on function public.enable_integration(uuid, text) to authenticated;
