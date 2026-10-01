-- O Acesso à Integração (conexoes-funcionais 03, 07, 08, 10 a 14 e 17; ADR-0017 e ADR-0021). Cada participante conecta o
-- PRÓPRIO Acesso a uma Integração habilitada no Workspace, por OAuth no servidor MCP oficial do app (`oauth_mcp`) ou, onde
-- não há MCP utilizável, por uma chave de API que a própria pessoa informa (`api_key`). O token ou a chave fica no Vault do
-- Supabase, como a chave de IA do cliente (20260930210000): o banco guarda só o nome do segredo, e só o servidor (a Edge
-- Function, com a chave de serviço) o lê, por funções de serviço. O navegador nunca recebe um token: a tela lê só o estado e
-- a conta do app do próprio participante e quantos participantes conectaram.
--
-- Esta migration traz: os perfis de conexão (quais Integrações já têm como conectar), o catálogo ampliado, as tentativas de
-- conexão (state + PKCE, com prazo), o cadastro dos clientes OAuth de registro dinâmico, o Acesso, a renovação do token
-- (que grava o refresh token novo junto com o access token), o portal fixado pelo primeiro Acesso, desconectar, retirar a
-- Integração do Workspace e a Permissão do Agente que a Edge Function confere antes de chamar uma ferramenta.

-- 1. O catálogo ganha os dois CRMs que conectam por chave de API (perfis abaixo). Salesforce, Zoho CRM, Bitrix24 e Kommo
-- (tickets 15, 16, 18 e 19) entram no catálogo quando tiverem servidor MCP oficial confirmado ou outro caminho: até lá,
-- seguem só como ticket, para a tela não prometer o que ainda não tem como conectar.
insert into private.integration_catalog (id, name, writes, category, description) values
  ('pipedrive', 'Pipedrive', true, 'CRM', 'Pessoas, organizações e negócios do Pipedrive.'),
  ('rd-station', 'RD Station CRM', true, 'CRM', 'Contatos, empresas e negociações do RD Station CRM.')
on conflict (id) do nothing;

-- 2. Os perfis de conexão: o que cada Integração já sabe fazer. Quem não consta aqui aparece "Em breve" e não se habilita.
-- `kinds` são os caminhos de conexão disponíveis; `pins_portal` marca as Integrações em que o primeiro Acesso fixa o portal
-- do app no Workspace (ADR-0017: um Acesso a outro portal é recusado, para dois CRMs nunca se misturarem). Os endereços, as
-- ferramentas e o que mais cada app pede ficam nos perfis da Edge Function (supabase/functions/_shared/integracoes).
create table private.integration_connection_profiles (
  integration_id text primary key references private.integration_catalog(id),
  kinds text[] not null check (cardinality(kinds) > 0 and kinds <@ array['oauth_mcp', 'api_key']::text[]),
  pins_portal boolean not null default false
);

insert into private.integration_connection_profiles (integration_id, kinds, pins_portal) values
  ('hubspot', array['oauth_mcp', 'api_key'], true),
  ('notion', array['oauth_mcp'], false),
  ('apollo', array['oauth_mcp', 'api_key'], false),
  ('lusha', array['api_key'], false),
  ('meta-ads', array['oauth_mcp'], false),
  ('pipedrive', array['api_key'], true),
  ('rd-station', array['api_key'], false);

-- 3. O Acesso: uma linha por participante, Workspace e Integração. `desconectado` é a ausência da linha (desconectar
-- apaga o Acesso e o segredo). Nenhum token mora aqui: `secret_name` aponta para o segredo no Vault.
create table private.integration_accesses (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  integration_id text not null references private.integration_catalog(id),
  kind text not null check (kind in ('oauth_mcp', 'api_key')),
  state text not null default 'conectado' check (state in ('conectado', 'precisa_reconectar')),
  -- A conta do app com que a pessoa entrou (e-mail ou nome), para o cartão mostrar.
  account_label text check (account_label is null or length(account_label) <= 200),
  -- O portal do app deste Acesso (hub_id do HubSpot, company_id do Pipedrive...).
  app_portal text check (app_portal is null or length(app_portal) <= 100),
  secret_name text not null,
  -- Quando o access token vence; nulo para chave de API ou token sem prazo informado.
  expires_at timestamptz,
  -- Por que o Acesso precisa reconectar, em poucas palavras e sem dado do app.
  failure text check (failure is null or length(failure) <= 300),
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, user_id, integration_id)
);

create index integration_accesses_integration_idx on private.integration_accesses (integration_id);
create index integration_accesses_user_idx on private.integration_accesses (user_id);

-- 4. A tentativa de conexão por OAuth: temporária, com o `state` aleatório, o verificador PKCE (que nunca sai do banco
-- para o navegador), o participante, o Workspace, a Integração e o prazo. O retorno do OAuth só vale se casar com uma
-- tentativa pendente, dentro do prazo, de um participante ainda ativo.
create table private.integration_connect_attempts (
  state text primary key check (length(state) between 32 and 128),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  integration_id text not null references private.integration_catalog(id),
  issuer text not null,
  code_verifier text not null,
  redirect_uri text not null,
  -- A origem do app para onde o navegador volta (a Edge Function confere que está no APP_ORIGIN).
  return_to text check (return_to is null or length(return_to) <= 300),
  token_endpoint text not null,
  client_id text not null,
  resource text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz
);

create index integration_connect_attempts_workspace_idx on private.integration_connect_attempts (workspace_id);
create index integration_connect_attempts_user_idx on private.integration_connect_attempts (user_id);
create index integration_connect_attempts_integration_idx on private.integration_connect_attempts (integration_id);
create index integration_connect_attempts_expires_idx on private.integration_connect_attempts (expires_at);

-- 5. Os clientes OAuth de registro dinâmico (RFC 7591), um por servidor de autorização e endereço de retorno. Registrar de
-- novo deixa órfãs as autorizações anteriores (Notion), então o primeiro registro é guardado e reaproveitado. O segredo do
-- cliente, quando o servidor devolve um, fica no Vault.
create table private.integration_oauth_clients (
  integration_id text not null references private.integration_catalog(id),
  issuer text not null,
  redirect_uri text not null,
  client_id text not null,
  secret_name text,
  registered_at timestamptz not null default now(),
  primary key (integration_id, issuer, redirect_uri)
);

alter table private.integration_connection_profiles enable row level security;
alter table private.integration_accesses enable row level security;
alter table private.integration_connect_attempts enable row level security;
alter table private.integration_oauth_clients enable row level security;
revoke all on private.integration_connection_profiles from public, anon, authenticated, service_role;
revoke all on private.integration_accesses from public, anon, authenticated, service_role;
revoke all on private.integration_connect_attempts from public, anon, authenticated, service_role;
revoke all on private.integration_oauth_clients from public, anon, authenticated, service_role;

-- 6. O Vault, por três funções pequenas. Quem as chama são as funções abaixo (que rodam como o dono); ninguém mais.
create function private.integration_secret_put(p_name text, p_value text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  select s.id into v_id from vault.secrets s where s.name = p_name;
  if v_id is null then
    perform vault.create_secret(p_value, p_name);
  else
    perform vault.update_secret(v_id, p_value);
  end if;
end;
$$;

create function private.integration_secret_get(p_name text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_value text;
begin
  select s.decrypted_secret into v_value from vault.decrypted_secrets s where s.name = p_name;
  return v_value;
end;
$$;

create function private.integration_secret_drop(p_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from vault.secrets s where s.name = p_name;
end;
$$;

-- Apagar o Acesso (desconectar, retirar a Integração, apagar o Workspace ou o usuário) apaga o segredo dele no Vault.
create function private.integration_access_drop_secret()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.integration_secret_drop(old.secret_name);
  return old;
end;
$$;

create trigger integration_accesses_drop_secret
  before delete on private.integration_accesses
  for each row execute function private.integration_access_drop_secret();

-- Participação ativa de quem vai usar o Acesso, e Integração habilitada no Workspace. Quem chama é o servidor, que passa o
-- participante que o JWT identificou (auth.uid() é nulo com a chave de serviço).
create function private.require_integration_use(p_workspace_id uuid, p_user_id uuid, p_integration_id text)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_user_id is null or not exists (
    select 1 from public.workspace_memberships m
    where m.workspace_id = p_workspace_id and m.user_id = p_user_id and m.active
  ) then
    raise exception 'active workspace membership required' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.workspace_integrations wi
    where wi.workspace_id = p_workspace_id and wi.integration_id = p_integration_id
  ) then
    raise exception 'integration not enabled' using errcode = '22023';
  end if;
end;
$$;

-- O primeiro Acesso fixa o portal do app no Workspace; um Acesso a outro portal é recusado. Só as Integrações com
-- `pins_portal` fixam, e elas exigem que o portal tenha sido identificado (senão dois CRMs poderiam se misturar).
create function private.pin_integration_portal(p_workspace_id uuid, p_integration_id text, p_portal text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current text;
  v_found boolean;
begin
  if not coalesce((
    select p.pins_portal from private.integration_connection_profiles p where p.integration_id = p_integration_id
  ), false) then
    return;
  end if;
  if p_portal is null or btrim(p_portal) = '' then
    raise exception 'integration portal unknown' using errcode = '22023';
  end if;
  select wi.app_portal, true into v_current, v_found
  from public.workspace_integrations wi
  where wi.workspace_id = p_workspace_id and wi.integration_id = p_integration_id
  for update;
  if not coalesce(v_found, false) then
    raise exception 'integration not enabled' using errcode = '22023';
  end if;
  if v_current is null then
    update public.workspace_integrations wi set app_portal = btrim(p_portal)
    where wi.workspace_id = p_workspace_id and wi.integration_id = p_integration_id;
  elsif v_current <> btrim(p_portal) then
    raise exception 'integration portal mismatch' using errcode = 'P0001';
  end if;
end;
$$;

revoke all on function private.integration_secret_put(text, text) from public, anon, authenticated, service_role;
revoke all on function private.integration_secret_get(text) from public, anon, authenticated, service_role;
revoke all on function private.integration_secret_drop(text) from public, anon, authenticated, service_role;
revoke all on function private.integration_access_drop_secret() from public, anon, authenticated, service_role;
revoke all on function private.require_integration_use(uuid, uuid, text) from public, anon, authenticated, service_role;
revoke all on function private.pin_integration_portal(uuid, text, text) from public, anon, authenticated, service_role;

-- 7. O catálogo da tela e a habilitação, agora pelo perfil de conexão: toda Integração com perfil aparece "Não habilitada"
-- ou "Habilitada"; as demais, "Em breve". Mesma assinatura das versões de 20260929190000.
create or replace function public.list_workspace_integrations(p_workspace_id uuid)
returns table (
  id text,
  name text,
  category text,
  description text,
  writes boolean,
  status text,
  enabled_at timestamptz,
  enabled_by uuid,
  app_portal text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_active_membership(p_workspace_id);

  return query
  select
    c.id,
    c.name,
    c.category,
    c.description,
    c.writes,
    case
      when pr.integration_id is not null then
        case
          when wi.integration_id is not null then 'habilitada'
          else 'nao_habilitada'
        end
      else 'em_breve'
    end as status,
    wi.enabled_at,
    wi.enabled_by,
    wi.app_portal
  from private.integration_catalog c
  left join private.integration_connection_profiles pr
    on pr.integration_id = c.id
  left join public.workspace_integrations wi
    on wi.integration_id = c.id
   and wi.workspace_id = p_workspace_id
  order by
    case c.category
      when 'CRM' then 1
      when 'Enriquecimento' then 2
      when 'Conhecimento' then 3
      when 'Mídia paga' then 4
      else 5
    end,
    c.id;
end;
$$;

create or replace function public.enable_workspace_integration(
  p_workspace_id uuid,
  p_integration_id text
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  perform private.require_integration_admin(p_workspace_id);

  if not exists (select 1 from private.integration_catalog where id = p_integration_id) then
    raise exception 'integration not found' using errcode = '22023';
  end if;

  if not exists (
    select 1 from private.integration_connection_profiles p where p.integration_id = p_integration_id
  ) then
    raise exception 'integration is not available for enablement' using errcode = '22023';
  end if;

  insert into public.workspace_integrations (workspace_id, integration_id, enabled_by, enabled_at)
  values (p_workspace_id, p_integration_id, v_user_id, now())
  on conflict (workspace_id, integration_id) do nothing;
end;
$$;

-- Retira a Integração do Workspace (ticket 07): apaga os Acessos (e os segredos), as tentativas e o portal fixado.
-- Nenhuma Conta-alvo, Contato, Vínculo ou Interação é tocado. É também o caminho para trocar o portal: retirar e habilitar
-- de novo. Só Administrador. Devolve quantos Acessos foram desconectados.
create function public.disable_workspace_integration(p_workspace_id uuid, p_integration_id text)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_removed integer;
begin
  perform private.require_integration_admin(p_workspace_id);

  if not exists (
    select 1 from public.workspace_integrations wi
    where wi.workspace_id = p_workspace_id and wi.integration_id = p_integration_id
  ) then
    raise exception 'integration not enabled' using errcode = '22023';
  end if;

  delete from private.integration_connect_attempts a
  where a.workspace_id = p_workspace_id and a.integration_id = p_integration_id;
  with removidos as (
    delete from private.integration_accesses x
    where x.workspace_id = p_workspace_id and x.integration_id = p_integration_id
    returning 1
  )
  select count(*)::integer into v_removed from removidos;
  delete from public.workspace_integrations wi
  where wi.workspace_id = p_workspace_id and wi.integration_id = p_integration_id;
  return v_removed;
end;
$$;

-- 8. O estado dos Acessos no Workspace para a tela: do PRÓPRIO participante (estado, conta, caminho) e só a contagem dos
-- que conectaram. Nunca um token, nunca a conta de outro participante. Só as Integrações habilitadas no Workspace.
create function public.integration_access_status(p_workspace_id uuid)
returns table (
  integration_id text,
  state text,
  kind text,
  account_label text,
  app_portal text,
  failure text,
  connected_at timestamptz,
  connected_count integer,
  kinds text[]
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_user_id uuid;
begin
  perform private.require_active_membership(p_workspace_id);
  v_user_id := auth.uid();

  return query
  select
    wi.integration_id,
    coalesce(a.state, 'desconectado'),
    a.kind,
    a.account_label,
    a.app_portal,
    a.failure,
    a.connected_at,
    (
      select count(*)::integer
      from private.integration_accesses x
      join public.workspace_memberships m
        on m.workspace_id = x.workspace_id and m.user_id = x.user_id and m.active
      where x.workspace_id = wi.workspace_id and x.integration_id = wi.integration_id and x.state = 'conectado'
    ),
    pr.kinds
  from public.workspace_integrations wi
  join private.integration_connection_profiles pr on pr.integration_id = wi.integration_id
  left join private.integration_accesses a
    on a.workspace_id = wi.workspace_id and a.integration_id = wi.integration_id and a.user_id = v_user_id
  where wi.workspace_id = p_workspace_id
  order by wi.integration_id;
end;
$$;

-- Desconecta o PRÓPRIO Acesso: apaga a linha e o segredo, sem tocar no Acesso dos outros. Devolve se havia o que apagar.
create function public.disconnect_integration_access(p_workspace_id uuid, p_integration_id text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_removed integer;
begin
  perform private.require_active_membership(p_workspace_id);
  with removidos as (
    delete from private.integration_accesses x
    where x.workspace_id = p_workspace_id and x.integration_id = p_integration_id and x.user_id = auth.uid()
    returning 1
  )
  select count(*)::integer into v_removed from removidos;
  return v_removed > 0;
end;
$$;

-- 9. Daqui para baixo, só o servidor (a Edge Function com a chave de serviço). O participante vem do JWT que a função
-- validou, e o banco confere a Participação ativa e a habilitação.

-- Abre uma tentativa de conexão por OAuth e devolve o `state` e o verificador PKCE (o verificador fica com a função, que
-- calcula o desafio; nunca vai ao navegador). Uma nova tentativa do mesmo participante e Integração substitui as pendentes.
create function public.start_integration_connect(
  p_workspace_id uuid,
  p_user_id uuid,
  p_integration_id text,
  p_issuer text,
  p_redirect_uri text,
  p_token_endpoint text,
  p_client_id text,
  p_resource text,
  p_return_to text
)
returns table (state text, code_verifier text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_state text := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  v_verifier text := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
begin
  perform private.require_integration_use(p_workspace_id, p_user_id, p_integration_id);
  if not exists (
    select 1 from private.integration_connection_profiles pr
    where pr.integration_id = p_integration_id and 'oauth_mcp' = any (pr.kinds)
  ) then
    raise exception 'integration kind not supported' using errcode = '22023';
  end if;
  if p_issuer is null or p_redirect_uri is null or p_token_endpoint is null or p_client_id is null
    or btrim(p_issuer) = '' or btrim(p_redirect_uri) = '' or btrim(p_token_endpoint) = '' or btrim(p_client_id) = '' then
    raise exception 'oauth endpoints are required' using errcode = '22023';
  end if;

  delete from private.integration_connect_attempts t
  where t.expires_at < now() - interval '1 day'
    or (t.workspace_id = p_workspace_id and t.user_id = p_user_id and t.integration_id = p_integration_id
        and t.consumed_at is null);

  insert into private.integration_connect_attempts (
    state, workspace_id, user_id, integration_id, issuer, code_verifier, redirect_uri, return_to,
    token_endpoint, client_id, resource, expires_at
  ) values (
    v_state, p_workspace_id, p_user_id, p_integration_id, p_issuer, v_verifier, p_redirect_uri,
    left(p_return_to, 300), p_token_endpoint, p_client_id, nullif(btrim(p_resource), ''), now() + interval '10 minutes'
  );
  return query select v_state, v_verifier;
end;
$$;

-- Para o retorno do OAuth: o que a tentativa guardou, quando ela ainda vale. `status` diz por que não vale (usada,
-- expirada, participacao_inativa, nao_habilitada); um `state` desconhecido ou forjado não devolve nenhuma linha. Fora do
-- 'ok', o verificador não sai. A tentativa só é consumida em `complete_integration_connect`.
create function public.integration_connect_attempt(p_state text)
returns table (
  status text,
  workspace_id uuid,
  user_id uuid,
  integration_id text,
  issuer text,
  code_verifier text,
  redirect_uri text,
  return_to text,
  token_endpoint text,
  client_id text,
  resource text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  a private.integration_connect_attempts%rowtype;
  v_status text;
begin
  select * into a from private.integration_connect_attempts t where t.state = p_state;
  if not found then
    return;
  end if;
  v_status := case
    when a.consumed_at is not null then 'usada'
    when a.expires_at <= now() then 'expirada'
    when not exists (
      select 1 from public.workspace_memberships m
      where m.workspace_id = a.workspace_id and m.user_id = a.user_id and m.active
    ) then 'participacao_inativa'
    when not exists (
      select 1 from public.workspace_integrations wi
      where wi.workspace_id = a.workspace_id and wi.integration_id = a.integration_id
    ) then 'nao_habilitada'
    else 'ok'
  end;
  if v_status <> 'ok' then
    return query select v_status, a.workspace_id, null::uuid, a.integration_id, null::text, null::text, null::text,
      a.return_to, null::text, null::text, null::text;
    return;
  end if;
  return query select v_status, a.workspace_id, a.user_id, a.integration_id, a.issuer, a.code_verifier, a.redirect_uri,
    a.return_to, a.token_endpoint, a.client_id, a.resource;
end;
$$;

-- Conclui a conexão por OAuth: confere de novo o `state` (pendente, no prazo, participante ativo, Integração habilitada),
-- consome a tentativa (um retorno repetido não vale), fixa o portal quando a Integração fixa, e grava o Acesso com o token
-- no Vault. Reconectar substitui o Acesso do mesmo participante. Devolve o id do Acesso.
create function public.complete_integration_connect(
  p_state text,
  p_access_token text,
  p_refresh_token text,
  p_expires_in integer,
  p_account_label text,
  p_app_portal text,
  p_scopes text
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  a private.integration_connect_attempts%rowtype;
  v_id uuid;
  v_secret_name text;
  v_blob jsonb;
begin
  select * into a from private.integration_connect_attempts t where t.state = p_state for update;
  if not found then
    raise exception 'connect attempt not found' using errcode = 'P0002';
  end if;
  if a.consumed_at is not null then
    raise exception 'connect attempt already used' using errcode = '55000';
  end if;
  if a.expires_at <= now() then
    raise exception 'connect attempt expired' using errcode = '55000';
  end if;
  if p_access_token is null or btrim(p_access_token) = '' then
    raise exception 'access token is required' using errcode = '22023';
  end if;
  perform private.require_integration_use(a.workspace_id, a.user_id, a.integration_id);
  perform private.pin_integration_portal(a.workspace_id, a.integration_id, p_app_portal);

  update private.integration_connect_attempts t set consumed_at = now() where t.state = p_state;

  select x.id into v_id from private.integration_accesses x
  where x.workspace_id = a.workspace_id and x.user_id = a.user_id and x.integration_id = a.integration_id;
  if v_id is null then
    v_id := gen_random_uuid();
  end if;
  v_secret_name := 'integration-access:' || v_id::text;
  v_blob := jsonb_strip_nulls(jsonb_build_object(
    'access_token', btrim(p_access_token),
    'refresh_token', nullif(btrim(coalesce(p_refresh_token, '')), ''),
    'token_endpoint', a.token_endpoint,
    'client_id', a.client_id,
    'issuer', a.issuer,
    'resource', a.resource,
    'scope', nullif(btrim(coalesce(p_scopes, '')), '')
  ));
  perform private.integration_secret_put(v_secret_name, v_blob::text);

  insert into private.integration_accesses (
    id, workspace_id, user_id, integration_id, kind, state, account_label, app_portal, secret_name, expires_at
  ) values (
    v_id, a.workspace_id, a.user_id, a.integration_id, 'oauth_mcp', 'conectado',
    left(nullif(btrim(coalesce(p_account_label, '')), ''), 200), left(nullif(btrim(coalesce(p_app_portal, '')), ''), 100),
    v_secret_name, case when p_expires_in is null then null else now() + make_interval(secs => p_expires_in) end
  )
  on conflict (workspace_id, user_id, integration_id) do update set
    kind = 'oauth_mcp', state = 'conectado', account_label = excluded.account_label, app_portal = excluded.app_portal,
    expires_at = excluded.expires_at, failure = null, connected_at = now(), updated_at = now();
  return v_id;
end;
$$;

-- Guarda uma chave de API que o participante informou (a Edge Function já a validou chamando o provedor). Mesmas regras: só
-- Participação ativa, Integração habilitada e com o caminho `api_key`; fixa o portal quando a Integração fixa. A chave vai
-- direto ao Vault e nunca volta. Devolve o id do Acesso.
create function public.save_integration_api_key(
  p_workspace_id uuid,
  p_user_id uuid,
  p_integration_id text,
  p_api_key text,
  p_account_label text,
  p_app_portal text
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_secret_name text;
begin
  perform private.require_integration_use(p_workspace_id, p_user_id, p_integration_id);
  if not exists (
    select 1 from private.integration_connection_profiles pr
    where pr.integration_id = p_integration_id and 'api_key' = any (pr.kinds)
  ) then
    raise exception 'integration kind not supported' using errcode = '22023';
  end if;
  if p_api_key is null or btrim(p_api_key) = '' then
    raise exception 'api key is required' using errcode = '22023';
  end if;
  perform private.pin_integration_portal(p_workspace_id, p_integration_id, p_app_portal);

  select x.id into v_id from private.integration_accesses x
  where x.workspace_id = p_workspace_id and x.user_id = p_user_id and x.integration_id = p_integration_id;
  if v_id is null then
    v_id := gen_random_uuid();
  end if;
  v_secret_name := 'integration-access:' || v_id::text;
  perform private.integration_secret_put(v_secret_name, jsonb_build_object('api_key', btrim(p_api_key))::text);

  insert into private.integration_accesses (
    id, workspace_id, user_id, integration_id, kind, state, account_label, app_portal, secret_name
  ) values (
    v_id, p_workspace_id, p_user_id, p_integration_id, 'api_key', 'conectado',
    left(nullif(btrim(coalesce(p_account_label, '')), ''), 200), left(nullif(btrim(coalesce(p_app_portal, '')), ''), 100),
    v_secret_name
  )
  on conflict (workspace_id, user_id, integration_id) do update set
    kind = 'api_key', state = 'conectado', account_label = excluded.account_label, app_portal = excluded.app_portal,
    expires_at = null, failure = null, connected_at = now(), updated_at = now();
  return v_id;
end;
$$;

-- Para quem vai usar o Acesso (listar ferramentas, chamar uma ferramenta, sincronizar): o Acesso do participante com o
-- segredo (JSON com o access token, o refresh token e o que a renovação precisa, ou a chave de API). Recusa Participação
-- inativa e Integração não habilitada; sem Acesso não devolve linha; com o Acesso a reconectar devolve a linha sem segredo.
create function public.integration_access_for_use(p_workspace_id uuid, p_user_id uuid, p_integration_id text)
returns table (
  access_id uuid,
  kind text,
  state text,
  expires_at timestamptz,
  app_portal text,
  account_label text,
  secret text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  a private.integration_accesses%rowtype;
begin
  perform private.require_integration_use(p_workspace_id, p_user_id, p_integration_id);
  select * into a from private.integration_accesses x
  where x.workspace_id = p_workspace_id and x.user_id = p_user_id and x.integration_id = p_integration_id;
  if not found then
    return;
  end if;
  return query select a.id, a.kind, a.state, a.expires_at, a.app_portal, a.account_label,
    case when a.state = 'conectado' then private.integration_secret_get(a.secret_name) end;
end;
$$;

-- Renovação do token: grava o access token novo JUNTO com o refresh token novo (HubSpot e Notion trocam o refresh token a
-- cada renovação; se o provedor não devolver um novo, o antigo fica). Só enquanto o Acesso está conectado.
create function public.rotate_integration_access(
  p_access_id uuid,
  p_access_token text,
  p_refresh_token text,
  p_expires_in integer
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  a private.integration_accesses%rowtype;
  v_blob jsonb;
begin
  select * into a from private.integration_accesses x where x.id = p_access_id for update;
  if not found then
    raise exception 'integration access not found' using errcode = 'P0002';
  end if;
  if a.state <> 'conectado' then
    raise exception 'integration access needs reconnect' using errcode = '55000';
  end if;
  if p_access_token is null or btrim(p_access_token) = '' then
    raise exception 'access token is required' using errcode = '22023';
  end if;
  v_blob := coalesce(nullif(private.integration_secret_get(a.secret_name), '')::jsonb, '{}'::jsonb)
    || jsonb_build_object('access_token', btrim(p_access_token));
  if p_refresh_token is not null and btrim(p_refresh_token) <> '' then
    v_blob := v_blob || jsonb_build_object('refresh_token', btrim(p_refresh_token));
  end if;
  perform private.integration_secret_put(a.secret_name, v_blob::text);
  update private.integration_accesses x set
    expires_at = case when p_expires_in is null then null else now() + make_interval(secs => p_expires_in) end,
    failure = null, updated_at = now()
  where x.id = p_access_id;
end;
$$;

-- O Acesso deixou de valer (o app o revogou, o refresh token foi recusado): passa a "Precisa reconectar" e o segredo é
-- esvaziado. O mesmo botão do cartão reconecta.
create function public.mark_integration_access_reconnect(p_access_id uuid, p_reason text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  a private.integration_accesses%rowtype;
begin
  select * into a from private.integration_accesses x where x.id = p_access_id for update;
  if not found then
    return;
  end if;
  perform private.integration_secret_put(a.secret_name, '{}');
  update private.integration_accesses x set
    state = 'precisa_reconectar', failure = left(nullif(btrim(coalesce(p_reason, '')), ''), 300),
    expires_at = null, updated_at = now()
  where x.id = p_access_id;
end;
$$;

-- O cliente OAuth de registro dinâmico já guardado para o servidor (e o endereço de retorno, ou o client_id da renovação).
-- Sem linha, a Edge Function registra um e o guarda com `save_integration_oauth_client`.
create function public.integration_oauth_client(
  p_integration_id text,
  p_issuer text,
  p_redirect_uri text default null,
  p_client_id text default null
)
returns table (client_id text, client_secret text)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  return query
  select c.client_id, case when c.secret_name is null then null else private.integration_secret_get(c.secret_name) end
  from private.integration_oauth_clients c
  where c.integration_id = p_integration_id and c.issuer = p_issuer
    and (p_redirect_uri is null or c.redirect_uri = p_redirect_uri)
    and (p_client_id is null or c.client_id = p_client_id)
  order by c.registered_at
  limit 1;
end;
$$;

-- Guarda o cliente recém-registrado. Se outro registro chegou primeiro, o dele vale (devolve o que ficou), para não deixar
-- órfã uma autorização já feita.
create function public.save_integration_oauth_client(
  p_integration_id text,
  p_issuer text,
  p_redirect_uri text,
  p_client_id text,
  p_client_secret text
)
returns table (client_id text, client_secret text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_secret_name text;
begin
  if p_client_id is null or btrim(p_client_id) = '' then
    raise exception 'client id is required' using errcode = '22023';
  end if;
  if p_client_secret is not null and btrim(p_client_secret) <> '' then
    v_secret_name := 'integration-oauth-client:' || p_integration_id || ':' || md5(p_issuer || '|' || p_redirect_uri);
  end if;
  if not exists (
    select 1 from private.integration_oauth_clients c
    where c.integration_id = p_integration_id and c.issuer = p_issuer and c.redirect_uri = p_redirect_uri
  ) then
    if v_secret_name is not null then
      perform private.integration_secret_put(v_secret_name, btrim(p_client_secret));
    end if;
    insert into private.integration_oauth_clients (integration_id, issuer, redirect_uri, client_id, secret_name)
    values (p_integration_id, p_issuer, p_redirect_uri, btrim(p_client_id), v_secret_name)
    on conflict (integration_id, issuer, redirect_uri) do nothing;
  end if;
  return query select * from public.integration_oauth_client(p_integration_id, p_issuer, p_redirect_uri, null);
end;
$$;

-- A Permissão do Agente numa Integração (ADR-0002): 'ler', 'propor' ou 'executar'; nulo quando o Agente não usa a
-- Integração (sem linha, o Agente não usa). A Edge Function confere antes de chamar uma ferramenta.
create function public.integration_agent_permission(p_workspace_id uuid, p_agent_id uuid, p_integration_id text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select p.permission
  from private.agent_permissions p
  where p.workspace_id = p_workspace_id and p.agent_id = p_agent_id and p.integration_id = p_integration_id;
$$;

-- Permissões. O navegador lê o catálogo, vê o estado do próprio Acesso, desconecta o próprio Acesso e (Administrador)
-- retira a Integração; tudo o que toca um token é só do servidor.
revoke all on function public.disable_workspace_integration(uuid, text) from public, anon;
revoke all on function public.integration_access_status(uuid) from public, anon;
revoke all on function public.disconnect_integration_access(uuid, text) from public, anon;
grant execute on function public.disable_workspace_integration(uuid, text) to authenticated;
grant execute on function public.integration_access_status(uuid) to authenticated;
grant execute on function public.disconnect_integration_access(uuid, text) to authenticated;

revoke all on function public.start_integration_connect(uuid, uuid, text, text, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.integration_connect_attempt(text) from public, anon, authenticated;
revoke all on function public.complete_integration_connect(text, text, text, integer, text, text, text) from public, anon, authenticated;
revoke all on function public.save_integration_api_key(uuid, uuid, text, text, text, text) from public, anon, authenticated;
revoke all on function public.integration_access_for_use(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.rotate_integration_access(uuid, text, text, integer) from public, anon, authenticated;
revoke all on function public.mark_integration_access_reconnect(uuid, text) from public, anon, authenticated;
revoke all on function public.integration_oauth_client(text, text, text, text) from public, anon, authenticated;
revoke all on function public.save_integration_oauth_client(text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.integration_agent_permission(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.start_integration_connect(uuid, uuid, text, text, text, text, text, text, text) to service_role;
grant execute on function public.integration_connect_attempt(text) to service_role;
grant execute on function public.complete_integration_connect(text, text, text, integer, text, text, text) to service_role;
grant execute on function public.save_integration_api_key(uuid, uuid, text, text, text, text) to service_role;
grant execute on function public.integration_access_for_use(uuid, uuid, text) to service_role;
grant execute on function public.rotate_integration_access(uuid, text, text, integer) to service_role;
grant execute on function public.mark_integration_access_reconnect(uuid, text) to service_role;
grant execute on function public.integration_oauth_client(text, text, text, text) to service_role;
grant execute on function public.save_integration_oauth_client(text, text, text, text, text) to service_role;
grant execute on function public.integration_agent_permission(uuid, uuid, text) to service_role;
