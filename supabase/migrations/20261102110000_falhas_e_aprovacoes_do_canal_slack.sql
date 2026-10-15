-- Falhas e Aprovações no thread do Canal Slack (slack-canal 05; US 38–41). A Execução do Canal que falha chega ao thread
-- com o motivo humano, e a Aprovação que ela pediu fica na fila da Althius com o aviso no thread de que aguarda lá.
--
-- 1. A reserva da entrega passa a devolver também as ações das Aprovações pendentes pedidas pela Execução, para a função
--    de entrega avisar no thread. A Aprovação já guarda o gatilho Canal pela Execução que a propôs (`run_id`, com o
--    `trigger_kind` dela), como as de Conversa e de Rotina: nada muda nela.
-- 2. O prazo vencido: o gatilho de 20261029100000 já chama a entrega quando a Execução vira `failed` por prazo, mas uma
--    Execução do Canal parada (o motor caiu) só vencia quando alguém escrevia de novo no fio. Um relógio vence as
--    paradas além do prazo, e a falha "passou do tempo" chega ao thread sem ninguém precisar escrever.
--
-- Funções redefinidas a partir da definição mais recente da `main`: claim_slack_channel_delivery (20261029100000), que
-- ganha a coluna `pending_approvals` (por isso é recriada, com as mesmas permissões).

-- 1. A reserva da entrega, com as Aprovações pendentes da Execução. O resto é a definição de 20261029100000.
drop function public.claim_slack_channel_delivery(uuid);

create function public.claim_slack_channel_delivery(p_run_id uuid)
returns table (
  status text, error_code text, answer text, team_id text, channel_id text, thread_ts text, bot_token text,
  pending_approvals text[]
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_run private.agent_runs%rowtype;
  v_thread private.slack_channel_threads%rowtype;
  v_secret_name text;
begin
  select * into v_run from private.agent_runs r where r.id = p_run_id for update;
  if not found or v_run.trigger_kind <> 'canal' or v_run.status not in ('succeeded', 'failed')
     or v_run.channel_delivered_at is not null then
    return;
  end if;
  update private.agent_runs r set channel_delivered_at = clock_timestamp() where r.id = p_run_id;
  select * into v_thread from private.slack_channel_threads t where t.conversation_id = v_run.conversation_id;
  if not found then
    return;
  end if;
  select i.secret_name into v_secret_name from private.slack_channel_installations i
  where i.workspace_id = v_run.workspace_id and i.team_id = v_thread.team_id and i.state = 'ativo';
  return query select
    v_run.status,
    v_run.error_code,
    (select string_agg(e.payload ->> 'texto', E'\n\n' order by e.seq)
     from private.agent_run_events e
     where e.run_id = p_run_id and e.kind in ('texto', 'resposta') and coalesce(e.payload ->> 'texto', '') <> ''),
    v_thread.team_id,
    v_thread.channel_id,
    v_thread.thread_ts,
    case when v_secret_name is null then null else private.integration_secret_get(v_secret_name) end,
    coalesce((
      select array_agg(a.action order by a.created_at, a.id)
      from private.approvals a
      where a.run_id = p_run_id and a.state = 'pendente'
    ), '{}'::text[]);
end;
$$;

revoke all on function public.claim_slack_channel_delivery(uuid) from public, anon, authenticated;
grant execute on function public.claim_slack_channel_delivery(uuid) to service_role;

-- 2. O relógio do prazo das Execuções do Canal: vence as paradas além do prazo (expire_run_if_stale grava a falha
-- `timeout`, fecha os Créditos, e o gatilho chama a entrega). Devolve quantas venceu.
create index agent_runs_open_channel_idx on private.agent_runs (created_at)
  where trigger_kind = 'canal' and status in ('queued', 'running');

create function private.expire_stale_slack_channel_runs()
returns integer
language sql
security definer
set search_path = ''
as $$
  select count(*)::integer from private.agent_runs r
  where r.trigger_kind = 'canal' and r.status in ('queued', 'running')
    and private.expire_run_if_stale(r.id)
$$;

revoke all on function private.expire_stale_slack_channel_runs() from public, anon, authenticated, service_role;

do $cron$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron with schema pg_catalog;
    perform cron.schedule('althius-slack-channel-expiry', '*/5 * * * *', 'select private.expire_stale_slack_channel_runs()');
  end if;
end
$cron$;
