-- A entrega do Canal Slack só fica confirmada depois de o Slack aceitar o post (slack-canal 09).
--
-- Antes, `claim_slack_channel_delivery` marcava `channel_delivered_at` e só então a função postava: se o Slack falhasse,
-- a resposta não chegava ao thread. Agora:
--   1. reservar (`claim_slack_channel_delivery`, mesma assinatura, `create or replace`): grava `channel_delivered_at` como
--      a reserva, com prazo de 2 minutos, e soma uma tentativa. Enquanto a reserva vale, ninguém mais reserva (a garantia
--      de postar uma vez só continua);
--   2. postar no Slack;
--   3. confirmar (`confirm_slack_channel_delivery`): grava `channel_posted_at`. Nunca mais é reservada;
--      ou falhar (`fail_slack_channel_delivery`): solta a reserva e grava o motivo; na 5ª tentativa, ou numa recusa
--      definitiva do Slack, desiste (`channel_delivery_failed_at`) e fica no log.
--   4. um relógio no `pg_cron` (a cada 2 minutos) pede de novo a entrega das Execuções terminadas há mais de 1 minuto e
--      há menos de 1 dia, sem post confirmado, sem desistência e sem reserva válida. Pega também o pedido do gatilho que
--      o pg_net perdeu.
-- Canal retirado: a reserva já grava a desistência com o motivo `canal_retirado` (não posta, só marca).
-- Se o post der certo e a confirmação falhar, a reserva vence e o post pode sair de novo: o risco fica nesse caso raro.
--
-- Aditiva: colunas novas, RPCs novas, um relógio novo e a redefinição de claim_slack_channel_delivery a partir de
-- 20261102110000 com `create or replace` (mesmo retorno, sem `drop`). As Execuções já reservadas antes desta migration
-- contam como postadas, para o relógio não repostar o histórico.

alter table private.agent_runs
  add column channel_posted_at timestamptz,
  add column channel_delivery_attempts integer not null default 0 check (channel_delivery_attempts >= 0),
  add column channel_delivery_failed_at timestamptz,
  add column channel_delivery_error text check (channel_delivery_error is null or length(channel_delivery_error) <= 100),
  add constraint agent_runs_channel_posted_check
    check ((channel_posted_at is null and channel_delivery_failed_at is null) or trigger_kind = 'canal');

update private.agent_runs set channel_posted_at = channel_delivered_at
where trigger_kind = 'canal' and channel_delivered_at is not null;

create index agent_runs_channel_pending_delivery_idx on private.agent_runs (finished_at)
  where trigger_kind = 'canal' and channel_posted_at is null and channel_delivery_failed_at is null
    and status in ('succeeded', 'failed');

-- 1. Reservar. O que volta é o mesmo de 20261102110000.
create or replace function public.claim_slack_channel_delivery(p_run_id uuid)
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
     or v_run.channel_posted_at is not null or v_run.channel_delivery_failed_at is not null
     or (v_run.channel_delivered_at is not null and v_run.channel_delivered_at > clock_timestamp() - interval '2 minutes') then
    return;
  end if;
  update private.agent_runs r
  set channel_delivered_at = clock_timestamp(), channel_delivery_attempts = r.channel_delivery_attempts + 1
  where r.id = p_run_id;
  select * into v_thread from private.slack_channel_threads t where t.conversation_id = v_run.conversation_id;
  if not found then
    update private.agent_runs r set channel_delivery_failed_at = clock_timestamp(), channel_delivery_error = 'sem_fio'
    where r.id = p_run_id;
    return;
  end if;
  select i.secret_name into v_secret_name from private.slack_channel_installations i
  where i.workspace_id = v_run.workspace_id and i.team_id = v_thread.team_id and i.state = 'ativo';
  if v_secret_name is null then
    update private.agent_runs r set channel_delivery_failed_at = clock_timestamp(), channel_delivery_error = 'canal_retirado'
    where r.id = p_run_id;
  end if;
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

-- 2. Confirmar: o Slack aceitou o post. Verdadeiro quando confirmou agora; falso quando já estava confirmada ou não é do
-- Canal.
create function public.confirm_slack_channel_delivery(p_run_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update private.agent_runs r set channel_posted_at = clock_timestamp(), channel_delivery_error = null
  where r.id = p_run_id and r.trigger_kind = 'canal' and r.channel_posted_at is null;
  return found;
end;
$$;

-- 3. Falhar: solta a reserva para uma nova tentativa, ou desiste na 5ª ou quando a falha é definitiva. Devolve
-- 'nova_tentativa', 'desistiu' ou 'nada' (já confirmada, já desistida, ou não é do Canal).
create function public.fail_slack_channel_delivery(p_run_id uuid, p_error text, p_final boolean default false)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run private.agent_runs%rowtype;
  v_error text := left(coalesce(nullif(btrim(p_error), ''), 'desconhecido'), 100);
begin
  select * into v_run from private.agent_runs r where r.id = p_run_id for update;
  if not found or v_run.trigger_kind <> 'canal' or v_run.channel_posted_at is not null
     or v_run.channel_delivery_failed_at is not null then
    return 'nada';
  end if;
  if coalesce(p_final, false) or v_run.channel_delivery_attempts >= 5 then
    update private.agent_runs r set channel_delivery_failed_at = clock_timestamp(), channel_delivery_error = v_error
    where r.id = p_run_id;
    return 'desistiu';
  end if;
  update private.agent_runs r set channel_delivered_at = null, channel_delivery_error = v_error where r.id = p_run_id;
  return 'nova_tentativa';
end;
$$;

-- 4. O relógio: pede de novo a entrega das Execuções pendentes, pelo mesmo pg_net, endereço e segredo do gatilho.
create function private.retry_slack_channel_deliveries()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
  v_run_id uuid;
  v_count integer := 0;
begin
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'net' and p.proname = 'http_post'
  ) then
    return 0;
  end if;
  select t.url, t.secret into v_url, v_secret from private.slack_channel_delivery_target() t;
  if coalesce(v_url, '') = '' or coalesce(v_secret, '') = '' then
    return 0;
  end if;
  for v_run_id in
    select r.id from private.agent_runs r
    where r.trigger_kind = 'canal' and r.status in ('succeeded', 'failed')
      and r.channel_posted_at is null and r.channel_delivery_failed_at is null
      and (r.channel_delivered_at is null or r.channel_delivered_at <= clock_timestamp() - interval '2 minutes')
      and r.finished_at between clock_timestamp() - interval '1 day' and clock_timestamp() - interval '1 minute'
    order by r.finished_at
    limit 100
  loop
    begin
      execute 'select net.http_post(url := $1, body := $2, headers := $3, timeout_milliseconds := 10000)'
      using v_url, jsonb_build_object('run_id', v_run_id),
        jsonb_build_object('Content-Type', 'application/json', 'x-slack-delivery-secret', v_secret);
      v_count := v_count + 1;
    exception when others then
      raise warning 'slack channel delivery retry not requested for run %: %', v_run_id, sqlstate;
    end;
  end loop;
  return v_count;
end;
$$;

revoke all on function public.claim_slack_channel_delivery(uuid) from public, anon, authenticated;
revoke all on function public.confirm_slack_channel_delivery(uuid) from public, anon, authenticated;
revoke all on function public.fail_slack_channel_delivery(uuid, text, boolean) from public, anon, authenticated;
revoke all on function private.retry_slack_channel_deliveries() from public, anon, authenticated, service_role;
grant execute on function public.claim_slack_channel_delivery(uuid) to service_role;
grant execute on function public.confirm_slack_channel_delivery(uuid) to service_role;
grant execute on function public.fail_slack_channel_delivery(uuid, text, boolean) to service_role;

do $cron$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron with schema pg_catalog;
    perform cron.schedule('althius-slack-channel-delivery-retry', '*/2 * * * *', 'select private.retry_slack_channel_deliveries()');
  end if;
end
$cron$;
