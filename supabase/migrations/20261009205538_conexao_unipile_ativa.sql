-- A conexão Unipile ativa por configuração e a troca de conta sem perder o histórico (canais-15, ADR-0024).
--
-- Até aqui a conta Unipile era "a das variáveis de função", e `unipile_account_id` era único no sistema inteiro. O Nan
-- troca de conta Unipile a cada teste grátis de 7 dias; algumas contas são v1 e outras v2. Agora a conta ativa é uma
-- linha: endereço, versão (v1 ou v2) e os NOMES dos segredos no Vault (chave de API e segredo do webhook). Trocar de
-- conta é cadastrar a nova e ativá-la, sem publicar código. Nenhuma coluna guarda a chave nem o segredo.
--
-- Ativar uma conexão desativa a anterior e marca como `reconnect_required` as Contas remetentes das outras conexões
-- (ADR-0015); nada é apagado. Quando o titular reconecta, `complete_sender_connection_attempt` põe o id novo e a
-- conexão ativa na MESMA linha, e os Envios, as respostas e as Interações seguem ligados a ela (ADR-0024). Os ids de
-- chat, de mensagem e de e-mail gravados antes da troca só existem na conta anterior: a conferência e a reconciliação
-- só olham Envios que saíram depois da troca, pela conexão ativa.
--
-- Ler a conexão e escolher o adaptador é do canais-16; o webhook, do canais-17.
-- Aditiva: a única coluna nova em tabela existente é de `private.sender_accounts`.

-- 1. O registro de conexões.
create table private.unipile_connections (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (length(btrim(name)) between 1 and 100),
  -- Só o endereço (host e porta opcional), sem caminho: a v1 usa um DSN por cliente, a v2 usa api.unipile.com.
  base_url text not null check (base_url ~* '^https://[a-z0-9.-]+(:[0-9]+)?$'),
  api_version text not null check (api_version in ('v1', 'v2')),
  -- Os NOMES dos segredos no Vault; a chave e o segredo do webhook nunca ficam nesta tabela.
  api_key_secret_name text not null check (length(btrim(api_key_secret_name)) between 1 and 200),
  webhook_secret_name text not null check (length(btrim(webhook_secret_name)) between 1 and 200),
  active boolean not null default false,
  created_at timestamptz not null default now(),
  activated_at timestamptz,
  updated_at timestamptz not null default now()
);

-- No máximo uma conexão ativa.
create unique index unipile_connections_single_active_idx on private.unipile_connections (active) where active;

alter table private.unipile_connections enable row level security;
revoke all on private.unipile_connections from public, anon, authenticated;
grant all on private.unipile_connections to service_role;

comment on table private.unipile_connections is
  'Unipile accounts the system can use (address, v1 or v2, and the Vault names of the API key and the webhook secret). '
  'At most one is active. The secrets themselves live only in the Vault.';

-- A conexão "padrão": a v2 de hoje, ativa. Enquanto o Vault não tiver os segredos dela, as funções seguem lendo as
-- variáveis de função de sempre (a leitura em si é do canais-16).
insert into private.unipile_connections (name, base_url, api_version, api_key_secret_name, webhook_secret_name, active, activated_at)
values ('padrão', 'https://api.unipile.com', 'v2', 'unipile_padrao_api_key', 'unipile_padrao_webhook_secret', true, now());

create function private.active_unipile_connection_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select c.id from private.unipile_connections c where c.active;
$$;

revoke all on function private.active_unipile_connection_id() from public, anon, authenticated;
grant execute on function private.active_unipile_connection_id() to service_role;

-- 2. Cada Conta remetente guarda a conexão a que o seu `unipile_account_id` pertence. Uma Conta nova nasce na
-- conexão ativa. A unicidade do id passa a ser por conexão: a mesma conta Unipile pode reaparecer em outra conexão.
alter table private.sender_accounts
  add column unipile_connection_id uuid references private.unipile_connections(id) default private.active_unipile_connection_id(),
  -- Quando a linha passou para a conexão atual numa troca de conta; null enquanto nunca trocou. Os Envios anteriores
  -- a este instante saíram pela conta antiga e não são consultados na nova.
  add column unipile_connection_since timestamptz;

update private.sender_accounts set unipile_connection_id = private.active_unipile_connection_id()
where unipile_connection_id is null;

alter table private.sender_accounts
  alter column unipile_connection_id set not null,
  drop constraint sender_accounts_unipile_account_id_key,
  add constraint sender_accounts_connection_account_key unique (unipile_connection_id, unipile_account_id);

-- 3. Cadastrar e ativar uma conexão. Só o Nan (pelo SQL Editor, ou pelo wizard) e o service_role.
create function public.register_unipile_connection(
  p_name text,
  p_base_url text,
  p_api_version text,
  p_api_key_secret_name text,
  p_webhook_secret_name text
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := btrim(coalesce(p_name, ''));
  v_url text := regexp_replace(btrim(coalesce(p_base_url, '')), '/+$', '');
  v_key text := btrim(coalesce(p_api_key_secret_name, ''));
  v_hook text := btrim(coalesce(p_webhook_secret_name, ''));
  v_id uuid;
begin
  if v_name = '' or length(v_name) > 100 then
    raise exception 'connection name is required' using errcode = '22023';
  end if;
  if p_api_version is null or p_api_version not in ('v1', 'v2') then
    raise exception 'unsupported unipile api version' using errcode = '22023';
  end if;
  if v_url !~* '^https://[a-z0-9.-]+(:[0-9]+)?$' then
    raise exception 'the address must be https://host[:port]' using errcode = '22023';
  end if;
  if v_key = '' or v_hook = '' then
    raise exception 'the vault secret names are required' using errcode = '22023';
  end if;
  insert into private.unipile_connections (name, base_url, api_version, api_key_secret_name, webhook_secret_name)
  values (v_name, lower(v_url), p_api_version, v_key, v_hook)
  on conflict (name) do update set
    base_url = excluded.base_url, api_version = excluded.api_version,
    api_key_secret_name = excluded.api_key_secret_name, webhook_secret_name = excluded.webhook_secret_name,
    updated_at = now()
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.register_unipile_connection(text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.register_unipile_connection(text, text, text, text, text) to service_role;

-- Ativa a conexão: desativa a anterior e marca as Contas remetentes das outras conexões para reconectar (ADR-0015).
-- Não apaga nenhuma Conta remetente, Envio, resposta ou Interação. Devolve quantas Contas remetentes marcou; ativar
-- a que já está ativa não muda nada.
create function public.activate_unipile_connection(p_connection_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_connection private.unipile_connections;
  v_count integer;
begin
  perform pg_advisory_xact_lock(hashtext('unipile_connection_activation'));
  select c.* into v_connection from private.unipile_connections c where c.id = p_connection_id for update;
  if not found then
    raise exception 'unipile connection not found' using errcode = 'P0002';
  end if;
  if v_connection.active then
    return 0;
  end if;
  update private.unipile_connections set active = false, updated_at = now() where active;
  update private.unipile_connections set active = true, activated_at = now(), updated_at = now()
  where id = p_connection_id;
  update private.sender_accounts a
  set status = 'reconnect_required', reconciliation_required = true, last_status_at = now(), updated_at = now()
  where a.unipile_connection_id <> p_connection_id and a.status <> 'disconnected';
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.activate_unipile_connection(uuid) from public, anon, authenticated;
grant execute on function public.activate_unipile_connection(uuid) to service_role;

-- 4. Concluir a conexão de uma Conta remetente. Definição de 20260927114500, com a troca de conta: uma reconexão de
-- uma linha cuja conexão já não é a ativa aceita o id novo e a conexão ativa NA MESMA LINHA (mesmo id interno, dono,
-- canal e provedor). O resto continua recusado: a linha já na conexão ativa com id diferente, dono ou provedor que
-- não batem (identity_mismatch), e id novo já ligado a outra linha da conexão ativa (identity_already_linked).
create or replace function public.complete_sender_connection_attempt(
  p_attempt_id uuid,
  p_unipile_account_id text,
  p_provider text,
  p_initial_status text
) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_attempt private.sender_connection_attempts;
  v_status text;
  v_active uuid := private.active_unipile_connection_id();
  v_row private.sender_accounts;
begin
  select * into v_attempt from private.sender_connection_attempts
  where id = p_attempt_id for update;
  if not found or v_attempt.status <> 'pending' or v_attempt.expires_at <= now() then
    return 'ignored';
  end if;
  if (v_attempt.channel = 'email' and p_provider not in ('GOOGLE', 'OUTLOOK', 'IMAP'))
    or (v_attempt.channel <> 'email' and p_provider <> v_attempt.expected_provider) then
    update private.sender_connection_attempts set status = 'failed' where id = p_attempt_id;
    return 'provider_mismatch';
  end if;
  if not exists (
    select 1 from public.workspace_memberships m
    where m.workspace_id = v_attempt.workspace_id
      and m.user_id = v_attempt.owner_user_id and m.active
  ) then
    update private.sender_connection_attempts set status = 'failed' where id = p_attempt_id;
    return 'membership_revoked';
  end if;

  v_status := case p_initial_status
    when 'CREATION_SUCCESS' then 'syncing'
    when 'RECONNECTED' then 'syncing'
    else 'connecting'
  end;

  if v_attempt.reconnect_sender_account_id is not null then
    select a.* into v_row from private.sender_accounts a
    where a.id = v_attempt.reconnect_sender_account_id for update;
    if not found or v_row.owner_user_id <> v_attempt.owner_user_id or v_row.provider <> p_provider
      or (v_row.unipile_connection_id = v_active and v_row.unipile_account_id <> p_unipile_account_id)
      or (v_row.unipile_connection_id <> v_active and v_row.channel <> v_attempt.channel) then
      update private.sender_connection_attempts set status = 'failed' where id = p_attempt_id;
      return 'identity_mismatch';
    end if;
    -- Troca de conta: a linha é de uma conexão que já não é a ativa. O id novo não pode ser de outra linha da ativa.
    if v_row.unipile_connection_id <> v_active and exists (
      select 1 from private.sender_accounts o
      where o.unipile_connection_id = v_active and o.unipile_account_id = p_unipile_account_id and o.id <> v_row.id
    ) then
      update private.sender_connection_attempts set status = 'failed' where id = p_attempt_id;
      return 'identity_already_linked';
    end if;
    update private.sender_accounts a
    set unipile_account_id = p_unipile_account_id,
        unipile_connection_id = v_active,
        unipile_connection_since = case when a.unipile_connection_id <> v_active then now() else a.unipile_connection_since end,
        status = v_status, reconciliation_required = true,
        reconciliation_ready_at = case when private.provider_has_initial_sync(p_provider)
          then a.reconciliation_ready_at else coalesce(a.reconciliation_ready_at, now()) end,
        last_status_at = now(), updated_at = now()
    where a.id = v_row.id;
  else
    insert into private.sender_accounts (
      workspace_id, owner_user_id, channel, unipile_connection_id, unipile_account_id, provider, status
    ) values (
      v_attempt.workspace_id, v_attempt.owner_user_id, v_attempt.channel, v_active,
      p_unipile_account_id, p_provider, v_status
    ) on conflict (unipile_connection_id, unipile_account_id) do nothing;
    if not found then
      update private.sender_connection_attempts set status = 'failed' where id = p_attempt_id;
      return 'identity_already_linked';
    end if;
  end if;

  update private.sender_connection_attempts
  set status = 'completed', completed_at = now()
  where id = p_attempt_id;
  return 'completed';
end;
$$;

-- 5. A reconciliação e o Executor olham só a conexão ativa.
-- O Executor só reserva Contas remetentes da conexão ativa. Definição de 20260927114500.
create or replace function public.claim_sender_reconciliations(p_limit integer default 3)
returns table (sender_account_id uuid, unipile_account_id text, claimed_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  return query
  with due as (
    select a.id from private.sender_accounts a
    where private.sender_awaits_reconciliation(a)
      and a.unipile_connection_id = private.active_unipile_connection_id()
    order by a.reconciliation_ready_at
    limit greatest(1, least(coalesce(p_limit, 3), 10))
    for update of a skip locked
  )
  update private.sender_accounts a set reconciliation_claimed_until = now() + interval '5 minutes'
  from due
  where a.id = due.id
  returning a.id, a.unipile_account_id, now();
end;
$$;

-- Os e-mails a conferir: só Envios que saíram depois de a linha passar para a conexão atual, e só numa Conta da
-- conexão ativa. Um Envio da conexão anterior não é consultado na conta nova. Definição de 20260927114500.
create or replace function public.conversations_to_reconcile(p_sender_account_id uuid, p_limit integer default 25)
returns table (send_id uuid, provider_thread_id text, provider_email_id text, sent_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.provider_thread_id, c.provider_email_id, c.sent_at
  from (
    select distinct on (e.sequence_id, e.contact_id)
      e.id, e.provider_thread_id, e.provider_email_id, e.sent_at
    from private.sequence_step_sends e
    where e.sender_account_id = p_sender_account_id
      and e.status in ('sent', 'bounced', 'uncertain')
      and e.sent_at is not null
      and (e.provider_thread_id is not null or e.provider_email_id is not null)
    order by e.sequence_id, e.contact_id, e.sent_at desc
  ) c
  join private.sender_accounts a on a.id = p_sender_account_id
    and a.unipile_connection_id = private.active_unipile_connection_id()
  where (a.unipile_connection_since is null or c.sent_at > a.unipile_connection_since)
    and (a.reconciliation_checked_at is null
      or (c.sent_at, c.id) > (a.reconciliation_checked_at, a.reconciliation_checked_send))
  order by c.sent_at, c.id
  limit greatest(1, least(coalesce(p_limit, 25), 100));
$$;

-- O mesmo para os chats de WhatsApp e LinkedIn. Definição de 20261001150000.
create or replace function public.chats_to_reconcile(p_sender_account_id uuid, p_limit integer default 25)
returns table (send_id uuid, provider_chat_id text, sent_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.provider_chat_id, c.at
  from (
    select distinct on (e.sequence_id, e.contact_id)
      e.id, e.provider_chat_id, coalesce(e.sent_at, e.sending_at) as at
    from private.sequence_step_sends e
    where e.sender_account_id = p_sender_account_id
      and e.channel in ('whatsapp', 'linkedin')
      and e.status in ('sent', 'uncertain')
      and e.provider_chat_id is not null
      and coalesce(e.sent_at, e.sending_at) is not null
    order by e.sequence_id, e.contact_id, coalesce(e.sent_at, e.sending_at) desc
  ) c
  join private.sender_accounts a on a.id = p_sender_account_id
    and a.unipile_connection_id = private.active_unipile_connection_id()
  where (a.unipile_connection_since is null or c.at > a.unipile_connection_since)
    and (a.reconciliation_checked_at is null
      or (c.at, c.id) > (a.reconciliation_checked_at, a.reconciliation_checked_send))
  order by c.at, c.id
  limit greatest(1, least(coalesce(p_limit, 25), 100));
$$;
