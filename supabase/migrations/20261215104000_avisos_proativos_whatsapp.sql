-- Avisos proativos do Canal WhatsApp, isolados por Conta e Workspace.
create table private.channel_notices (
  id bigint generated always as identity primary key,
  event_key text not null unique,
  user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  notice_type text not null check (notice_type in ('resposta_lead','aprovacao_pendente','rotina_terminada','sinal_novo','sequencia_pausada','creditos_baixos')),
  summary text not null check (length(btrim(summary)) between 1 and 500),
  created_at timestamptz not null default now(), claimed_at timestamptz, sent_at timestamptz,
  attempts integer not null default 0 check (attempts >= 0)
);
create index channel_notices_pending_user_idx on private.channel_notices(user_id, created_at, id) where sent_at is null;
alter table private.channel_notices enable row level security;
revoke all on private.channel_notices from public, anon, authenticated, service_role;

create table private.channel_notice_deliveries (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  delivered_at timestamptz not null default now(), notice_count integer not null check (notice_count > 0)
);
create index channel_notice_deliveries_user_time_idx on private.channel_notice_deliveries(user_id, delivered_at desc);
alter table private.channel_notice_deliveries enable row level security;
revoke all on private.channel_notice_deliveries from public, anon, authenticated, service_role;

create function private.channel_notice_opted_in(p_user_id uuid, p_type text)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select (p.preferences ->> p_type)::boolean and not p.stopped
    from private.user_channel_notice_preferences p where p.user_id = p_user_id), false)
$$;
revoke all on function private.channel_notice_opted_in(uuid, text) from public, anon, authenticated, service_role;

create function public.enqueue_whatsapp_channel_notice(p_user_id uuid, p_workspace_id uuid, p_type text, p_summary text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_inserted boolean;
begin
  if p_type not in ('resposta_lead','aprovacao_pendente','rotina_terminada','sinal_novo','sequencia_pausada','creditos_baixos')
    or p_user_id is null or p_workspace_id is null or p_summary is null or length(btrim(p_summary)) not between 1 and 500 then
    raise exception 'invalid channel notice' using errcode = '22023';
  end if;
  if not coalesce(private.channel_notice_opted_in(p_user_id, p_type), false) then return false; end if;
  insert into private.channel_notices(event_key,user_id,workspace_id,notice_type,summary)
  values (p_type || ':' || gen_random_uuid()::text,p_user_id,p_workspace_id,p_type,btrim(p_summary))
  on conflict (event_key) do nothing returning true into v_inserted;
  return coalesce(v_inserted,false);
end; $$;

create function public.claim_whatsapp_channel_notices(p_user_id uuid, p_now timestamptz default now())
returns table(phone text, summary text, dentro_da_janela boolean, notice_count integer)
language plpgsql security definer set search_path = '' as $$
declare v_phone text; v_text text; v_count integer; v_pending bigint[]; v_now timestamptz := coalesce(p_now,now());
begin
  if p_user_id is null then raise exception 'user is required' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('whatsapp_notices:' || p_user_id::text, 0));
  if extract(hour from v_now at time zone 'America/Sao_Paulo') < 9 or extract(hour from v_now at time zone 'America/Sao_Paulo') >= 21 then return; end if;
  if (select count(*) from private.channel_notice_deliveries d where d.user_id=p_user_id and (d.delivered_at at time zone 'America/Sao_Paulo')::date=(v_now at time zone 'America/Sao_Paulo')::date) >= 10 then return; end if;
  if exists(select 1 from private.channel_notice_deliveries d where d.user_id=p_user_id and d.delivered_at > v_now-interval '30 minutes') then return; end if;
  select ph.phone_e164 into v_phone from private.user_channel_phones ph
    join auth.users u on u.id=ph.user_id
    where ph.user_id=p_user_id and ph.verified_at is not null
      and coalesce(u.last_sign_in_at>=v_now-interval '30 days',false);
  if v_phone is null then return; end if;
  select array_agg(n.id order by n.created_at,n.id), string_agg(n.summary,E'\n' order by n.created_at,n.id), count(*)::integer
    into v_pending,v_text,v_count from private.channel_notices n
    where n.user_id=p_user_id and n.sent_at is null and (n.claimed_at is null or n.claimed_at<v_now-interval '10 minutes')
      and private.channel_notice_opted_in(p_user_id,n.notice_type);
  if coalesce(cardinality(v_pending),0)=0 then return; end if;
  update private.channel_notices set claimed_at=v_now,attempts=attempts+1 where id=any(v_pending);
  return query select v_phone,v_text,exists(select 1 from private.whatsapp_last_inbound i
    where i.phone_hash=encode(extensions.digest(regexp_replace(v_phone,'^\+',''),'sha256'),'hex')
      and i.received_at>=v_now-interval '24 hours'),v_count;
end; $$;

create function public.confirm_whatsapp_channel_notices(p_user_id uuid, p_now timestamptz default now())
returns integer language plpgsql security definer set search_path = '' as $$
declare v_count integer; v_ids bigint[]; v_now timestamptz := coalesce(p_now,now());
begin
  select array_agg(id),count(*)::integer into v_ids,v_count from private.channel_notices where user_id=p_user_id and sent_at is null and claimed_at>v_now-interval '10 minutes';
  if coalesce(v_count,0)=0 then return 0; end if;
  update private.channel_notices set sent_at=v_now where id=any(v_ids);
  insert into private.channel_notice_deliveries(user_id,notice_count,delivered_at) values(p_user_id,v_count,v_now);
  return v_count;
end; $$;
create function public.release_whatsapp_channel_notices(p_user_id uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_count integer;
begin
  update private.channel_notices set claimed_at=null where user_id=p_user_id and sent_at is null and claimed_at>now()-interval '10 minutes';
  get diagnostics v_count=row_count; return v_count;
end; $$;
revoke all on function public.enqueue_whatsapp_channel_notice(uuid,uuid,text,text) from public,anon,authenticated;
revoke all on function public.claim_whatsapp_channel_notices(uuid,timestamptz) from public,anon,authenticated;
revoke all on function public.confirm_whatsapp_channel_notices(uuid,timestamptz) from public,anon,authenticated;
revoke all on function public.release_whatsapp_channel_notices(uuid) from public,anon,authenticated;
grant execute on function public.enqueue_whatsapp_channel_notice(uuid,uuid,text,text) to service_role;
grant execute on function public.claim_whatsapp_channel_notices(uuid,timestamptz) to service_role;
grant execute on function public.confirm_whatsapp_channel_notices(uuid,timestamptz) to service_role;
grant execute on function public.release_whatsapp_channel_notices(uuid) to service_role;

-- Gatilhos somente nesta migration: não alteram os fluxos que produzem os eventos.
create function private.notify_channel_notice()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_owner uuid;
begin
  if tg_table_name='reply_proposals' then
    if new.status<>'pronta' or (tg_op='UPDATE' and old.status is not distinct from new.status) then return new; end if;
    perform public.enqueue_whatsapp_channel_notice(new.owner_user_id,new.workspace_id,'resposta_lead','Uma Proposta de resposta está pronta para revisar.');
  elsif tg_table_name='approvals' then
    if new.state<>'pendente' then return new; end if;
    for v_owner in select m.user_id from public.workspace_memberships m where m.workspace_id=new.workspace_id and m.active and m.role='admin'
    loop perform public.enqueue_whatsapp_channel_notice(v_owner,new.workspace_id,'aprovacao_pendente','Há uma Aprovação esperando sua decisão.'); end loop;
  elsif tg_table_name='agent_runs' then
    if new.trigger_kind<>'rotina' or new.status not in ('succeeded','failed') or (tg_op='UPDATE' and old.status is not distinct from new.status) then return new; end if;
    perform public.enqueue_whatsapp_channel_notice(new.requested_by,new.workspace_id,'rotina_terminada','Uma Rotina terminou.');
  elsif tg_table_name='signals' then
    select r.owner_user_id into v_owner from public.sales_responsibilities r where r.workspace_id=new.workspace_id and r.target_account_id=new.target_account_id::text;
    if v_owner is not null then perform public.enqueue_whatsapp_channel_notice(v_owner,new.workspace_id,'sinal_novo','Um Sinal novo chegou a uma Conta sua.'); end if;
  elsif tg_table_name='sequence_reply_holds' then
    if not new.open or (tg_op='UPDATE' and old.open) then return new; end if;
    select s.owner_user_id into v_owner from public.sequences s where s.id=new.sequence_id;
    if v_owner is not null then perform public.enqueue_whatsapp_channel_notice(v_owner,new.workspace_id,'sequencia_pausada','Uma Sequência ficou retida após uma resposta.'); end if;
  end if;
  return new;
end; $$;
revoke all on function private.notify_channel_notice() from public,anon,authenticated,service_role;
create trigger channel_notice_reply_proposal after insert or update of status on private.reply_proposals for each row execute function private.notify_channel_notice();
create trigger channel_notice_approval after insert on private.approvals for each row execute function private.notify_channel_notice();
create trigger channel_notice_routine_run after insert or update of status on private.agent_runs for each row execute function private.notify_channel_notice();
create trigger channel_notice_new_signal after insert on private.signals for each row execute function private.notify_channel_notice();
create trigger channel_notice_sequence_hold after insert or update of open on private.sequence_reply_holds for each row execute function private.notify_channel_notice();

-- Como não há limiar definido para "baixo", o aviso sai uma vez quando o saldo disponível chega a zero.
create function private.notify_channel_credit_exhaustion()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_available numeric;
begin
  if new.amount>=0 then return new; end if;
  if public.workspace_credits_unlimited(new.workspace_id) then return new; end if;
  select t.booked-t.reserved into v_available from private.credit_totals(new.workspace_id) t;
  if coalesce(v_available,0)>0 or coalesce(v_available-new.amount,0)<=0 then return new; end if;
  perform public.enqueue_whatsapp_channel_notice(m.user_id,new.workspace_id,'creditos_baixos','Os Créditos deste Workspace acabaram.')
    from public.workspace_memberships m where m.workspace_id=new.workspace_id and m.active;
  return new;
end; $$;
revoke all on function private.notify_channel_credit_exhaustion() from public,anon,authenticated,service_role;
create trigger channel_notice_credit_exhaustion after insert on private.credit_entries for each row execute function private.notify_channel_credit_exhaustion();

create function private.retry_whatsapp_channel_notices()
returns integer language plpgsql security definer set search_path = '' as $$
declare v_url text; v_secret text; v_user uuid; v_count integer:=0;
begin
  if not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='net' and p.proname='http_post') then return 0; end if;
  select t.url,t.secret into v_url,v_secret from private.whatsapp_channel_delivery_target() t;
  if coalesce(v_url,'')='' or coalesce(v_secret,'')='' then return 0; end if;
  for v_user in select distinct n.user_id from private.channel_notices n where n.sent_at is null and (n.claimed_at is null or n.claimed_at<now()-interval '10 minutes') order by n.user_id limit 100 loop
    begin
      execute 'select net.http_post(url := $1, body := $2, headers := $3, timeout_milliseconds := 10000)'
        using v_url,jsonb_build_object('notice_user_id',v_user),jsonb_build_object('Content-Type','application/json','x-whatsapp-delivery-secret',v_secret);
      v_count:=v_count+1;
    exception when others then raise warning 'whatsapp channel notice not requested: %',sqlstate; end;
  end loop;
  return v_count;
end; $$;
revoke all on function private.retry_whatsapp_channel_notices() from public,anon,authenticated,service_role;
do $$ begin
  if exists(select 1 from pg_namespace where nspname='cron') then
    perform cron.schedule('althius-whatsapp-channel-notice-retry','*/2 * * * *','select private.retry_whatsapp_channel_notices()');
  end if;
exception when others then null; end $$;
