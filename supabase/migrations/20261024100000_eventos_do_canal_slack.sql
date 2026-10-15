-- Os eventos do Canal Slack (slack-canal 02; decisões Q9, Q10, Q14, Q16 e Q18). O Slack entrega os eventos do app
-- @Althius à Edge Function `slack-channel-events`, que responde no thread as recusas que não chamam Agente. Esta migration
-- só acrescenta o que a função lê e grava, sempre pela chave de serviço:
--   - a reserva de cada `event_id`, para um reenvio do Slack não responder duas vezes (como `claim_stripe_event`);
--   - a instalação ativa de um `team_id`, com o token do bot lido do Vault;
--   - a Conta de usuário com o e-mail verificado e Participação ativa no Workspace (nunca cria nada: Q9);
--   - os Agentes do Workspace e se cada um tem o Slack na lista de canais da Personalização (Q10);
--   - a retirada da instalação pelo próprio Slack (`app_uninstalled`, `tokens_revoked`; Q17).
-- Nada aqui cria Conversa, Execução nem consumo de Crédito. Da pessoa não reconhecida nada é guardado: a reserva do evento
-- tem só o id, o `team_id` e o tipo.

-- 1. Cada evento do Slack é tratado uma vez só. O `event_id` é único entre todos os workspaces Slack.
create table private.slack_channel_events (
  event_id text primary key check (length(event_id) between 1 and 100),
  team_id text check (team_id is null or length(team_id) <= 32),
  event_type text check (event_type is null or length(event_type) <= 100),
  received_at timestamptz not null default now()
);

create index slack_channel_events_received_at_idx on private.slack_channel_events (received_at);

alter table private.slack_channel_events enable row level security;
revoke all on private.slack_channel_events from public, anon, authenticated, service_role;

-- true na primeira vez, false num reenvio. Reservas com mais de 30 dias saem (o Slack só reenvia por minutos).
create function public.claim_slack_channel_event(p_event_id text, p_team_id text, p_event_type text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if p_event_id is null or btrim(p_event_id) = '' then
    raise exception 'event id is required' using errcode = '22023';
  end if;
  delete from private.slack_channel_events e where e.received_at < now() - interval '30 days';
  insert into private.slack_channel_events (event_id, team_id, event_type)
  values (p_event_id, left(p_team_id, 32), left(p_event_type, 100));
  return true;
exception when unique_violation then
  return false;
end;
$$;

-- 2. A instalação ativa do workspace Slack: o Workspace, o usuário do bot e o token do bot. Sem instalação ativa (nunca
-- instalada ou retirada), nenhuma linha: não há bot para responder.
create function public.slack_channel_active_installation(p_team_id text)
returns table (workspace_id uuid, bot_user_id text, bot_token text)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  i private.slack_channel_installations%rowtype;
  v_token text;
begin
  select * into i from private.slack_channel_installations x where x.team_id = p_team_id and x.state = 'ativo';
  if not found then
    return;
  end if;
  v_token := private.integration_secret_get(i.secret_name);
  if v_token is null then
    return;
  end if;
  return query select i.workspace_id, i.bot_user_id, v_token;
end;
$$;

-- 3. A Conta de usuário do e-mail do Slack: e-mail verificado, conta não apagada, não anônima e não bloqueada, com
-- Participação ativa no Workspace. Sem uma só Conta assim, nulo ("não reconhecido"). Só lê: nunca cria Conta, convite nem
-- visitante, e não grava nada da pessoa.
create function public.slack_channel_account_by_email(p_workspace_id uuid, p_email text)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_ids uuid[];
begin
  if p_email is null or btrim(p_email) = '' then
    return null;
  end if;
  select array_agg(u.id) into v_ids
  from auth.users u
  join public.workspace_memberships m on m.user_id = u.id and m.workspace_id = p_workspace_id and m.active
  where lower(u.email) = lower(btrim(p_email))
    and u.email_confirmed_at is not null
    and u.deleted_at is null
    and not u.is_anonymous
    and (u.banned_until is null or u.banned_until <= now());
  if coalesce(array_length(v_ids, 1), 0) <> 1 then
    return null;
  end if;
  return v_ids[1];
end;
$$;

-- 4. Os Agentes do Workspace, para reconhecer as Menções, e se cada um atende no Slack (o Slack na lista de canais da
-- Personalização).
create function public.slack_channel_agents(p_workspace_id uuid)
returns table (agent_id uuid, name text, in_slack boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select a.id, a.name, coalesce('slack' = any(s.channels), false)
  from private.agents a
  left join private.agent_settings s on s.agent_id = a.id
  where a.workspace_id = p_workspace_id
  order by a.name
$$;

-- 5. O Slack avisou que o app foi desinstalado ou que o token do bot foi revogado: a instalação fica retirada, com o motivo,
-- e o token sai do Vault. O `team_id` fica, para reinstalar só no mesmo Slack. Conversas, Execuções e Atividade ficam.
-- Devolve se alguma instalação ativa foi retirada (um aviso repetido não muda nada).
create function public.withdraw_slack_channel_by_slack(p_team_id text, p_reason text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_workspace_id uuid;
  v_secret_name text;
begin
  if p_reason is null or p_reason not in ('desinstalado', 'token_revogado') then
    raise exception 'invalid withdrawal reason' using errcode = '22023';
  end if;
  update private.slack_channel_installations x set
    state = 'retirado', withdrawn_by = null, withdrawn_at = now(), withdrawn_reason = p_reason, updated_at = now()
  where x.team_id = p_team_id and x.state = 'ativo'
  returning x.workspace_id, x.secret_name into v_workspace_id, v_secret_name;
  if v_workspace_id is null then
    return false;
  end if;
  perform private.integration_secret_drop(v_secret_name);
  delete from private.slack_channel_install_attempts t where t.workspace_id = v_workspace_id and t.consumed_at is null;
  return true;
end;
$$;

revoke all on function public.claim_slack_channel_event(text, text, text) from public, anon, authenticated;
revoke all on function public.slack_channel_active_installation(text) from public, anon, authenticated;
revoke all on function public.slack_channel_account_by_email(uuid, text) from public, anon, authenticated;
revoke all on function public.slack_channel_agents(uuid) from public, anon, authenticated;
revoke all on function public.withdraw_slack_channel_by_slack(text, text) from public, anon, authenticated;
grant execute on function public.claim_slack_channel_event(text, text, text) to service_role;
grant execute on function public.slack_channel_active_installation(text) to service_role;
grant execute on function public.slack_channel_account_by_email(uuid, text) to service_role;
grant execute on function public.slack_channel_agents(uuid) to service_role;
grant execute on function public.withdraw_slack_channel_by_slack(text, text) to service_role;
