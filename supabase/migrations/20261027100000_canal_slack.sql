-- O Canal Slack (slack-canal 01; decisões Q2, Q4, Q12 e Q17). O Administrador instala no Workspace o app do Slack, o bot
-- @Althius, pelo fluxo oficial de autorização do Slack. A primeira instalação fixa o workspace Slack (`team_id`) no
-- Workspace para sempre, e um workspace Slack serve a um Workspace Althius só: as duas recusas saem daqui. O token do bot
-- fica no Vault, como os tokens das Integrações (20261001160000); o banco guarda só o nome do segredo.
--
-- Retirar o Canal marca a instalação como retirada e apaga o token do Vault (a Edge Function já o revogou no Slack). A
-- linha fica, com o `team_id`, para reinstalar só no mesmo Slack. Conversas, Execuções e Atividade não são tocadas.
--
-- Este Canal é diferente da Integração Slack pelo servidor MCP (catálogo de conectores): outro app do Slack, outros
-- segredos, outro registro.

-- 1. A instalação do Canal Slack: no máximo uma por Workspace (chave primária) e um `team_id` em um Workspace só
-- (único), ativa ou retirada.
create table private.slack_channel_installations (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  team_id text not null unique check (team_id ~ '^[A-Z0-9]{2,32}$'),
  -- O nome do workspace Slack, para a tela mostrar onde o Canal está.
  team_name text check (team_name is null or length(team_name) <= 200),
  bot_user_id text not null check (bot_user_id ~ '^[A-Z0-9]{2,32}$'),
  app_id text check (app_id is null or app_id ~ '^[A-Z0-9]{2,32}$'),
  scopes text check (scopes is null or length(scopes) <= 1000),
  state text not null default 'ativo' check (state in ('ativo', 'retirado')),
  secret_name text not null,
  installed_by uuid references auth.users(id) on delete set null,
  installed_at timestamptz not null default now(),
  withdrawn_by uuid references auth.users(id) on delete set null,
  withdrawn_at timestamptz,
  -- Quem retirou: o Administrador pela tela, ou o próprio Slack (desinstalação, token revogado; slack-canal 02).
  withdrawn_reason text check (withdrawn_reason in ('administrador', 'desinstalado', 'token_revogado')),
  updated_at timestamptz not null default now(),
  check ((state = 'retirado') = (withdrawn_at is not null))
);

create index slack_channel_installations_installed_by_idx on private.slack_channel_installations (installed_by);
create index slack_channel_installations_withdrawn_by_idx on private.slack_channel_installations (withdrawn_by);

-- 2. A tentativa de instalação: o `state` aleatório que vai ao Slack e volta no retorno, de uso único e com prazo. O
-- retorno chega sem JWT, e é o `state` que o autentica.
create table private.slack_channel_install_attempts (
  state text primary key check (length(state) between 32 and 128),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  -- A origem do app para onde o navegador volta (a Edge Function confere que está no APP_ORIGIN).
  return_to text check (return_to is null or length(return_to) <= 300),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz
);

create index slack_channel_install_attempts_workspace_idx on private.slack_channel_install_attempts (workspace_id);
create index slack_channel_install_attempts_user_idx on private.slack_channel_install_attempts (user_id);
create index slack_channel_install_attempts_expires_idx on private.slack_channel_install_attempts (expires_at);

-- Sem acesso direto: tudo passa pelas funções abaixo.
alter table private.slack_channel_installations enable row level security;
alter table private.slack_channel_install_attempts enable row level security;
revoke all on private.slack_channel_installations from public, anon, authenticated, service_role;
revoke all on private.slack_channel_install_attempts from public, anon, authenticated, service_role;

-- 3. Só um Administrador ativo do Workspace instala ou retira. Quem chama é o servidor, que passa o participante que o
-- JWT identificou (auth.uid() é nulo com a chave de serviço).
create function private.is_slack_channel_admin(p_workspace_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.workspace_memberships m
    where m.workspace_id = p_workspace_id and m.user_id = p_user_id and m.active and m.role = 'admin'
  )
$$;

create function private.require_slack_channel_admin(p_workspace_id uuid, p_user_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_slack_channel_admin(p_workspace_id, p_user_id) then
    raise exception 'only administrators can manage the slack channel' using errcode = '42501';
  end if;
end;
$$;

revoke all on function private.is_slack_channel_admin(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function private.require_slack_channel_admin(uuid, uuid) from public, anon, authenticated, service_role;

-- 4. O estado do Canal para a tela, para qualquer participante ativo: 'nao_instalado', 'ativo' ou 'retirado', e o nome do
-- workspace Slack. Nunca o token nem o nome do segredo.
create function public.slack_channel_status(p_workspace_id uuid)
returns table (state text, team_name text, installed_at timestamptz, withdrawn_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  i private.slack_channel_installations%rowtype;
begin
  perform private.require_active_membership(p_workspace_id);
  select * into i from private.slack_channel_installations x where x.workspace_id = p_workspace_id;
  if not found then
    return query select 'nao_instalado'::text, null::text, null::timestamptz, null::timestamptz;
    return;
  end if;
  return query select i.state, i.team_name, i.installed_at, i.withdrawn_at;
end;
$$;

-- 5. Daqui para baixo, só o servidor (as Edge Functions com a chave de serviço).

-- Abre uma tentativa de instalação e devolve o `state`. Uma nova tentativa do mesmo Administrador substitui as pendentes.
create function public.start_slack_channel_install(p_workspace_id uuid, p_user_id uuid, p_return_to text)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_state text := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
begin
  perform private.require_slack_channel_admin(p_workspace_id, p_user_id);

  delete from private.slack_channel_install_attempts t
  where t.expires_at < now() - interval '1 day'
    or (t.workspace_id = p_workspace_id and t.user_id = p_user_id and t.consumed_at is null);

  insert into private.slack_channel_install_attempts (state, workspace_id, user_id, return_to, expires_at)
  values (v_state, p_workspace_id, p_user_id, left(p_return_to, 300), now() + interval '10 minutes');
  return v_state;
end;
$$;

-- Para o retorno do Slack: se a tentativa ainda vale. `status` diz por que não vale (usada, expirada, nao_administrador);
-- um `state` desconhecido ou forjado não devolve nenhuma linha. Não consome a tentativa: quem consome é a conclusão.
create function public.slack_channel_install_attempt(p_state text)
returns table (status text, workspace_id uuid, return_to text)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  a private.slack_channel_install_attempts%rowtype;
begin
  select * into a from private.slack_channel_install_attempts t where t.state = p_state;
  if not found then
    return;
  end if;
  return query select
    case
      when a.consumed_at is not null then 'usada'
      when a.expires_at <= now() then 'expirada'
      when not private.is_slack_channel_admin(a.workspace_id, a.user_id) then 'nao_administrador'
      else 'ok'
    end,
    a.workspace_id,
    a.return_to;
end;
$$;

-- Conclui a instalação com o que o Slack devolveu na troca do código: confere de novo a tentativa e o Administrador,
-- consome a tentativa, fixa o `team_id` ou recusa, e grava o token do bot no Vault.
--   'slack team mismatch'           o Workspace já tem outro workspace Slack fixado (Q4, Q17)
--   'slack team in another workspace' este workspace Slack já é de outro Workspace Althius (Q12)
-- Reinstalar no mesmo Slack, ativo ou retirado, volta a ativo.
create function public.complete_slack_channel_install(
  p_state text,
  p_team_id text,
  p_team_name text,
  p_bot_user_id text,
  p_app_id text,
  p_bot_token text,
  p_scopes text
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  a private.slack_channel_install_attempts%rowtype;
  v_team_id_fixado text;
  v_secret_name text;
begin
  select * into a from private.slack_channel_install_attempts t where t.state = p_state for update;
  if not found then
    raise exception 'install attempt not found' using errcode = 'P0002';
  end if;
  if a.consumed_at is not null then
    raise exception 'install attempt already used' using errcode = '55000';
  end if;
  if a.expires_at <= now() then
    raise exception 'install attempt expired' using errcode = '55000';
  end if;
  perform private.require_slack_channel_admin(a.workspace_id, a.user_id);
  if p_bot_token is null or btrim(p_bot_token) = '' then
    raise exception 'bot token is required' using errcode = '22023';
  end if;
  if p_team_id is null or p_bot_user_id is null then
    raise exception 'slack team and bot user are required' using errcode = '22023';
  end if;

  update private.slack_channel_install_attempts t set consumed_at = now() where t.state = p_state;

  select x.team_id into v_team_id_fixado from private.slack_channel_installations x where x.workspace_id = a.workspace_id for update;
  if v_team_id_fixado is not null and v_team_id_fixado <> p_team_id then
    raise exception 'slack team mismatch' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from private.slack_channel_installations x where x.team_id = p_team_id and x.workspace_id <> a.workspace_id
  ) then
    raise exception 'slack team in another workspace' using errcode = 'P0001';
  end if;

  v_secret_name := 'slack-channel:' || a.workspace_id::text;
  perform private.integration_secret_put(v_secret_name, btrim(p_bot_token));

  begin
    insert into private.slack_channel_installations (
      workspace_id, team_id, team_name, bot_user_id, app_id, scopes, state, secret_name, installed_by, installed_at
    ) values (
      a.workspace_id, p_team_id, left(nullif(btrim(coalesce(p_team_name, '')), ''), 200), p_bot_user_id,
      nullif(btrim(coalesce(p_app_id, '')), ''), left(nullif(btrim(coalesce(p_scopes, '')), ''), 1000), 'ativo',
      v_secret_name, a.user_id, now()
    )
    on conflict (workspace_id) do update set
      team_name = excluded.team_name, bot_user_id = excluded.bot_user_id, app_id = excluded.app_id,
      scopes = excluded.scopes, state = 'ativo', secret_name = excluded.secret_name, installed_by = excluded.installed_by,
      installed_at = now(), withdrawn_by = null, withdrawn_at = null, withdrawn_reason = null, updated_at = now();
  exception when unique_violation then
    -- Outro Workspace fixou o mesmo Slack ao mesmo tempo.
    raise exception 'slack team in another workspace' using errcode = 'P0001';
  end;
end;
$$;

-- Para retirar: confere o Administrador e devolve o token do bot, que a Edge Function revoga no Slack antes de marcar a
-- instalação como retirada. Sem instalação ativa, recusa.
create function public.slack_channel_token_for_withdrawal(p_workspace_id uuid, p_user_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_secret_name text;
begin
  perform private.require_slack_channel_admin(p_workspace_id, p_user_id);
  select x.secret_name into v_secret_name from private.slack_channel_installations x
  where x.workspace_id = p_workspace_id and x.state = 'ativo';
  if v_secret_name is null then
    raise exception 'slack channel not installed' using errcode = 'P0002';
  end if;
  return private.integration_secret_get(v_secret_name);
end;
$$;

-- Marca a instalação como retirada e apaga o token do Vault. O `team_id` fica, para reinstalar só no mesmo Slack.
create function public.withdraw_slack_channel(p_workspace_id uuid, p_user_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_secret_name text;
begin
  perform private.require_slack_channel_admin(p_workspace_id, p_user_id);
  update private.slack_channel_installations x set
    state = 'retirado', withdrawn_by = p_user_id, withdrawn_at = now(), withdrawn_reason = 'administrador',
    updated_at = now()
  where x.workspace_id = p_workspace_id and x.state = 'ativo'
  returning x.secret_name into v_secret_name;
  if v_secret_name is null then
    raise exception 'slack channel not installed' using errcode = 'P0002';
  end if;
  perform private.integration_secret_drop(v_secret_name);
  delete from private.slack_channel_install_attempts t where t.workspace_id = p_workspace_id and t.consumed_at is null;
end;
$$;

revoke all on function public.slack_channel_status(uuid) from public, anon;
grant execute on function public.slack_channel_status(uuid) to authenticated;

revoke all on function public.start_slack_channel_install(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.slack_channel_install_attempt(text) from public, anon, authenticated;
revoke all on function public.complete_slack_channel_install(text, text, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.slack_channel_token_for_withdrawal(uuid, uuid) from public, anon, authenticated;
revoke all on function public.withdraw_slack_channel(uuid, uuid) from public, anon, authenticated;
grant execute on function public.start_slack_channel_install(uuid, uuid, text) to service_role;
grant execute on function public.slack_channel_install_attempt(text) to service_role;
grant execute on function public.complete_slack_channel_install(text, text, text, text, text, text, text) to service_role;
grant execute on function public.slack_channel_token_for_withdrawal(uuid, uuid) to service_role;
grant execute on function public.withdraw_slack_channel(uuid, uuid) to service_role;
